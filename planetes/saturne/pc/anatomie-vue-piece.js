import * as THREE from 'three';

/* ═════════════ ANATOMIE : VUE 3D ISOLÉE D'UNE PIÈCE DANS SA FICHE (R2, phase 4) ═════════════
   Dans la fiche d'un os, d'un muscle, d'un vaisseau, d'un nerf ou d'un organe : la pièce seule, qui tourne doucement sur elle-même, avec son propre petit moteur de rendu
   (géométries et matériaux partagés avec la table, comme la vue rapprochée du mouvement). Glisser = tourner à la main (la rotation automatique reprend après 4 s),
   molette ou pincement = zoomer. Rendu seulement quand la fenêtre est visible. Aucune donnée inventée : c'est le maillage du modèle. */
export function creerVuePiece({ anat, F }) {
  const actives = new Set();
  function monter(conteneur, id, { fenetre = 'fiche' } = {}) {
    const p = anat.index.parId.get(id), meshs = anat.etat.meshs.get(id);
    if (!p || !meshs || !meshs.length) { conteneur.innerHTML = '<p class="saf-absent">Pas de maillage pour cette structure.</p>'; return null; }
    conteneur.innerHTML = '<canvas class="saf-piece-cv" aria-label="Vue 3D de la pièce isolée : ' + String(p.nom_fr || p.nom_en || id).replace(/"/g, '') + '"></canvas><div class="saf-piece-aide">glisser = tourner · molette ou deux doigts = zoom</div>';
    const cv = conteneur.querySelector('canvas');
    let renderer; try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }); } catch (e) { conteneur.innerHTML = '<p class="saf-absent">Vue 3D indisponible : ' + (e && e.message || e) + '</p>'; return null; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setClearColor(0x05090f, 1); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, 0.01, 20);
    scene.add(new THREE.HemisphereLight(0xe9eef4, 0x2a313a, 1.2)); const cle = new THREE.DirectionalLight(0xf3f1ec, 1.5); cle.position.set(1.5, 3, 2.5); scene.add(cle); const contre = new THREE.DirectionalLight(0xcfe0f0, 0.6); contre.position.set(-2, 1, -3); scene.add(contre);
    const pivot = new THREE.Group(); scene.add(pivot); const clones = [], bornes = new THREE.Box3();
    for (const o of meshs) { const c = new THREE.Mesh(o.geometry, o.material); c.matrixAutoUpdate = false; c.frustumCulled = false; c.userData.original = o; pivot.add(c); clones.push(c); if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrix); bornes.union(b); }
    if (p.bornes && bornes.isEmpty()) { bornes.expandByPoint(new THREE.Vector3(...p.bornes[0])); bornes.expandByPoint(new THREE.Vector3(...p.bornes[1])); }
    const centre = bornes.getCenter(new THREE.Vector3()), taille = bornes.getSize(new THREE.Vector3()), rayon = Math.max(0.05, Math.max(taille.x, taille.y, taille.z) * 0.5);
    pivot.position.set(-centre.x, -centre.y, -centre.z);                                     // la pièce est centrée sur l'axe de rotation
    const etat = { az: 0.4, el: 0.18, dist: rayon * 3.1, main: 0, vivant: true, rendus: 0 };
    function redim() { const l = Math.max(120, cv.clientWidth), h = Math.max(120, cv.clientHeight); renderer.setSize(l, h, false); camera.aspect = l / h; camera.updateProjectionMatrix(); }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(redim) : null; if (ro) ro.observe(cv); redim();
    const doigts = new Map(); let d0 = 0, dist0 = 0;
    cv.addEventListener('pointerdown', e => { doigts.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* pointeur synthétique */ } etat.main = performance.now(); if (doigts.size === 2) { const [a, b] = [...doigts.values()]; d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; dist0 = etat.dist; } });
    cv.addEventListener('pointermove', e => {
      const g = doigts.get(e.pointerId); if (!g) return; etat.main = performance.now();
      if (doigts.size === 2) { g.x = e.clientX; g.y = e.clientY; const [a, b] = [...doigts.values()]; etat.dist = Math.max(rayon * 1.3, Math.min(rayon * 9, dist0 * d0 / (Math.hypot(a.x - b.x, a.y - b.y) || 1))); return; }
      etat.az -= (e.clientX - g.x) * 0.01; etat.el = Math.max(-1.3, Math.min(1.45, etat.el + (e.clientY - g.y) * 0.008)); g.x = e.clientX; g.y = e.clientY;
    });
    const fin = e => { doigts.delete(e.pointerId); try { cv.releasePointerCapture(e.pointerId); } catch (x) { /* déjà relâché */ } };
    cv.addEventListener('pointerup', fin); cv.addEventListener('pointercancel', fin);
    cv.addEventListener('wheel', e => { e.preventDefault(); etat.dist = Math.max(rayon * 1.3, Math.min(rayon * 9, etat.dist * Math.exp(e.deltaY * 0.0012))); etat.main = performance.now(); }, { passive: false });
    let derniere = performance.now();
    const surImage = () => {
      if (!etat.vivant || !cv.isConnected) return; const f = F.obtenir(fenetre); if (f && f.reduite) return;
      const t = performance.now(), dt = Math.min(0.1, (t - derniere) / 1000); derniere = t;
      for (const c of clones) { const o = c.userData.original; if (c.geometry !== o.geometry) c.geometry = o.geometry; if (c.material !== o.material) c.material = o.material; c.matrix.copy(o.matrix); c.visible = true; }
      if (t - etat.main > 4000) etat.az += dt * 0.55;                                       // rotation douce tant qu'on ne touche pas
      const ce = Math.cos(etat.el); camera.position.set(Math.sin(etat.az) * ce * etat.dist, Math.sin(etat.el) * etat.dist, Math.cos(etat.az) * ce * etat.dist); camera.lookAt(0, 0, 0);
      renderer.render(scene, camera); etat.rendus++;
    };
    anat.surImage(surImage); actives.add(surImage);
    const vue = { surImage, etat, dispose() { etat.vivant = false; actives.delete(surImage); anat.retirerImage(surImage); if (ro) ro.disconnect(); renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) { /* contexte déjà perdu */ } }, rendre: surImage };
    return vue;
  }
  return { monter, actives: () => actives.size, disposeTout() { for (const f of [...actives]) { anat.retirerImage(f); } actives.clear(); } };
}
