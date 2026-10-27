import * as THREE from 'three';
import { cleMuscle } from './anatomie-muscles.js';
import { SEGMENTS } from './anatomie-corps.js';
import { angleRotation, multiplier, inverseRigide } from './anatomie-mat4.js';

/* ═════════════ ANATOMIE : VUE RAPPROCHÉE DU MOUVEMENT (fenêtre secondaire, Phase B3) ═════════════
   Une fenêtre à part montre UNIQUEMENT la partie du corps qui bouge (les os des segments en mouvement et leurs voisins immédiats, les muscles du mouvement), de près, avec son propre moteur de rendu :
   rotation libre (glisser), zoom (molette), points de vue (face, profil, dos, dessus), lecture / pause, image par image, curseur de progression, ralenti, sens inverse, codes couleur
   (agonistes rouge, antagonistes bleu, stabilisateurs gris). Les pièces sont les mêmes que sur la table (géométries et matériaux partagés, matrices de segments partagées) :
   rien n'est dupliqué en mémoire vidéo sauf les tampons du second contexte. Les deux fenêtres (explication et vue 3D) coexistent sans se masquer. */
const N_ECHANTILLONS = 24;

/* Segments qui bougent pendant le mouvement : ceux dont la transformation relative à leur parent change de plus de 3° ou de 1,5 cm, plus leur parent. */
export function segmentsImpliques(cine, ctx, m) {
  const parent = cine.parent, bouge = new Set(); let ref = null;
  for (let i = 0; i < N_ECHANTILLONS; i++) {
    const T = cine.poser(m.pose(i / N_ECHANTILLONS, ctx)).T; if (!ref) ref = T;
    for (const s of SEGMENTS) { const p = parent[s]; if (!p) continue; const rel = multiplier(inverseRigide(T[p]), T[s]), rel0 = multiplier(inverseRigide(ref[p]), ref[s]), d = multiplier(inverseRigide(rel0), rel); if (angleRotation(d) > 3 * Math.PI / 180 || Math.hypot(d[12], d[13], d[14]) > 0.015) bouge.add(s); }
  }
  const out = new Set(bouge); for (const s of bouge) if (parent[s]) out.add(parent[s]);
  if (/hanche|genou|cheville|marche|course|saut|squat|accroupissement|fente|escalier|assis/.test(m.id + ' ' + m.articulation)) { out.add('bassin'); }
  return out;
}

export function creerVueMouvement({ anat, F, ecran }) {
  const etat = { fenetre: null, renderer: null, scene: null, camera: null, clones: [], desabonner: null, sale: true, cible: new THREE.Vector3(), az: 0.5, el: 0.15, dist: 2, fermer: null, ro: null, mouvement: null };
  const mv = () => anat.mouvement();
  function nettoyer() {
    if (etat.surImage) { anat.retirerImage(etat.surImage); etat.surImage = null; }
    if (etat.desabonner) { etat.desabonner(); etat.desabonner = null; } if (etat.ro) { etat.ro.disconnect(); etat.ro = null; }
    if (etat.renderer) { etat.renderer.dispose(); try { etat.renderer.forceContextLoss(); } catch (e) { /* contexte déjà perdu */ } etat.renderer = null; }
    for (const c of etat.clones) if (c.parent) c.parent.remove(c); etat.clones.length = 0; etat.scene = null; etat.mouvement = null;
  }
  const html = (m) => '<div class="saf-3d"><canvas data-r="cv" aria-label="Vue rapprochée du mouvement : ' + m.nom.replace(/"/g, '') + '"></canvas>'
    + '<div class="saf-lecteur"><button type="button" data-v="pas-" title="Image précédente">&#9664;&#9664;</button><button type="button" data-v="lecture" title="Lecture / pause" aria-label="Lecture ou pause">&#10074;&#10074;</button><button type="button" data-v="pas+" title="Image suivante">&#9654;&#9654;</button>'
    + '<input type="range" data-v="curseur" min="0" max="1000" value="0" aria-label="Progression du mouvement">'
    + '<select data-v="vitesse" aria-label="Vitesse"><option value="0.1">×0,1</option><option value="0.25">×0,25</option><option value="0.5">×0,5</option><option value="1" selected>×1</option><option value="2">×2</option></select>'
    + '<button type="button" data-v="sens" title="Lire à l’envers">&#8646; Sens</button></div>'
    + '<div class="saf-lecteur"><button type="button" data-v="vue" data-az="0">Face</button><button type="button" data-v="vue" data-az="1.5708">Profil</button><button type="button" data-v="vue" data-az="3.1416">Dos</button><button type="button" data-v="vue" data-el="1.35" data-az="0.5">Dessus</button><button type="button" data-v="cadrer">Cadrer</button></div>'
    + '<div class="saf-info" data-r="info" role="status"></div><div class="saf-info"><span style="color:#ff8a78">&#9632;</span> agonistes · <span style="color:#7da2ff">&#9632;</span> antagonistes · <span style="color:#c4ccd6">&#9632;</span> stabilisateurs</div></div>';

  async function ouvrir(m) {
    nettoyer(); etat.mouvement = m;
    const w = F.ouvrir({ id: 'vue3d', titre: 'Vue rapprochée : ' + m.nom, sousTitre: 'seulement la partie concernée', genre: 'vue3d', contenu: html(m), pastille: 'simule', avertissement: 'Mouvement simplifié · à vérifier avec le cours / un atlas', sur: { fermer: () => { nettoyer(); etat.fenetre = null; }, redim: () => redimensionner() } });
    etat.fenetre = w; const corps = w.corps, cv = corps.querySelector('[data-r="cv"]'), info = corps.querySelector('[data-r="info"]');
    const mouvement = mv(); mouvement.corps(); const cine = mouvement.cinematique(), ctx = mouvement.contexte(), impl = segmentsImpliques(cine, ctx, m), cor = mouvement.corps();
    // renderer et scène
    let renderer; try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }); } catch (e) { info.textContent = 'Vue 3D indisponible : ' + (e && e.message || e); return { ok: false }; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.localClippingEnabled = true; renderer.setClearColor(0x05090f, 1); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 0.02, 20);
    scene.add(new THREE.HemisphereLight(0xe9eef4, 0x2a313a, 1.1)); const cle = new THREE.DirectionalLight(0xf3f1ec, 1.4); cle.position.set(1.5, 3, 2.5); scene.add(cle); const contre = new THREE.DirectionalLight(0xcfe0f0, 0.5); contre.position.set(-2, 1, -3); scene.add(contre);
    Object.assign(etat, { renderer, scene, camera });
    // pièces concernées : os des segments impliqués, muscles du mouvement
    const roles = new Set([...m.agonistes, ...m.antagonistes, ...(m.stabilisateurs || [])]), bornes = new THREE.Box3();
    for (const [id, ms] of anat.etat.meshs) {
      const p = anat.index.parId.get(id); if (!p) continue; let garde = false;
      if (p.systeme === 'os') garde = impl.has(cor.segmentOs[id]); else if (p.systeme === 'muscles') garde = roles.has(cleMuscle(p.nom_en));
      if (!garde) continue;
      for (const o of ms) {
        const c = new THREE.Mesh(o.geometry, o.material); c.matrixAutoUpdate = false; c.frustumCulled = false; c.userData.original = o; c.userData.clone2 = true; c.name = o.name; scene.add(c); etat.clones.push(c);
        if (p.bornes) { bornes.expandByPoint(new THREE.Vector3(...p.bornes[0])); bornes.expandByPoint(new THREE.Vector3(...p.bornes[1])); }
      }
    }
    if (bornes.isEmpty()) bornes.set(new THREE.Vector3(-0.3, 0.5, -0.2), new THREE.Vector3(0.3, 1.5, 0.2));
    bornes.getCenter(etat.cible); const s = new THREE.Vector3(); bornes.getSize(s); etat.dist = Math.max(0.7, Math.max(s.x, s.y, s.z) * 1.9); etat.az = cor.ant > 0 ? 0.55 : 0.55 + Math.PI; etat.el = 0.15; etat.base = { cible: etat.cible.clone(), dist: etat.dist };
    const orienter = az => (cor.ant > 0 ? az : az + Math.PI);
    function redimensionner() { if (!etat.renderer) return; const l = Math.max(120, cv.clientWidth), h = Math.max(120, cv.clientHeight); etat.renderer.setSize(l, h, false); camera.aspect = l / h; camera.updateProjectionMatrix(); etat.sale = true; }
    etat.redim = redimensionner; if (typeof ResizeObserver !== 'undefined') { etat.ro = new ResizeObserver(redimensionner); etat.ro.observe(cv); } redimensionner();
    // orbite libre : glisser = tourner, molette = zoomer
    let geste = null;
    cv.addEventListener('pointerdown', e => { geste = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
    cv.addEventListener('pointermove', e => { if (!geste) return; etat.az -= (e.clientX - geste.x) * 0.008; etat.el = Math.max(-1.3, Math.min(1.45, etat.el + (e.clientY - geste.y) * 0.006)); geste.x = e.clientX; geste.y = e.clientY; etat.sale = true; });
    const fin = e => { geste = null; cv.style.cursor = 'grab'; try { cv.releasePointerCapture(e.pointerId); } catch (x) { /* déjà relâché */ } };
    cv.addEventListener('pointerup', fin); cv.addEventListener('pointercancel', fin);
    cv.addEventListener('wheel', e => { e.preventDefault(); etat.dist = Math.max(0.3, Math.min(6, etat.dist * Math.exp(e.deltaY * 0.0012))); etat.sale = true; }, { passive: false });
    // commandes de lecture
    const cur = corps.querySelector('[data-v="curseur"]'), btnL = corps.querySelector('[data-v="lecture"]'), vit = corps.querySelector('[data-v="vitesse"]'); let glisseCurseur = false;
    const majBtn = () => { const e = mouvement.etat; btnL.innerHTML = e.pause ? '&#9654;' : '&#10074;&#10074;'; btnL.title = e.pause ? 'Lecture' : 'Pause'; };
    corps.addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b) return; const a = b.dataset.v;
      if (a === 'lecture') { mouvement.pause(!mouvement.etat.pause); majBtn(); } else if (a === 'pas+') { mouvement.pas(1); majBtn(); } else if (a === 'pas-') { mouvement.pas(-1); majBtn(); }
      else if (a === 'sens') { mouvement.sens(-mouvement.etat.sens); b.classList.toggle('actif', mouvement.etat.sens < 0); }
      else if (a === 'vue') { etat.az = orienter(+b.dataset.az); etat.el = b.dataset.el ? +b.dataset.el : 0.12; etat.sale = true; }
      else if (a === 'cadrer') { etat.cible.copy(etat.base.cible); etat.dist = etat.base.dist; etat.sale = true; }
    });
    cur.addEventListener('input', () => { glisseCurseur = true; mouvement.pause(true); mouvement.phase(+cur.value / 1000); majBtn(); }); cur.addEventListener('change', () => { glisseCurseur = false; });
    vit.addEventListener('change', () => mouvement.regler(+vit.value));
    majBtn();
    // chaque image de la table : recopie des matrices d'os, mise à jour de l'information, rendu si quelque chose a changé
    let derniereVersion = -1, vu = 0;
    etat.desabonner = mouvement.abonner(r => { etat.sale = true; void r; });
    const surImage = () => {
      if (!etat.renderer || !etat.fenetre) return; const f = F.obtenir('vue3d'); if (!f || f.reduite) return;
      for (const c of etat.clones) { const o = c.userData.original; if (c.geometry !== o.geometry) c.geometry = o.geometry; if (c.material !== o.material) c.material = o.material; c.matrix.copy(o.matrix); c.visible = true; }          // géométrie et matériau changent quand la pièce est habillée
      const e = mouvement.etat, d = e.dernier && e.dernier.r;
      if (!glisseCurseur) cur.value = Math.round(((e.t % 1 + 1) % 1) * 1000);
      if (++vu % 6 === 0 && d) info.textContent = 'Phase ' + Math.round(((e.t % 1 + 1) % 1) * 100) + ' % · hanche ' + (d.angles.hancheD.fl).toFixed(0) + '° · genou ' + d.angles.genouD.fl.toFixed(0) + '° · cheville ' + d.angles.chevilleD.fl.toFixed(0) + '° · épaule ' + d.angles.epauleD.ele.toFixed(0) + '° · coude ' + d.angles.coudeD.fl.toFixed(0) + '°';
      const ve = e.t + '|' + etat.az + '|' + etat.el + '|' + etat.dist + '|' + e.entree + '|' + e.pause; if (!etat.sale && ve === derniereVersion && e.pause) return; derniereVersion = ve; etat.sale = false;
      const ce = Math.cos(etat.el); camera.position.set(etat.cible.x + Math.sin(etat.az) * ce * etat.dist, etat.cible.y + Math.sin(etat.el) * etat.dist, etat.cible.z + Math.cos(etat.az) * ce * etat.dist); camera.lookAt(etat.cible);
      etat.renderer.render(scene, camera);
    };
    anat.surImage(surImage); etat.surImage = surImage; surImage();
    return { ok: true, segments: [...impl], pieces: etat.clones.length };
  }
  return {
    ouvrir, fermer() { if (etat.fenetre) F.fermer('vue3d'); nettoyer(); etat.fenetre = null; }, etat: () => ({ ouverte: !!etat.fenetre && !!F.obtenir('vue3d'), pieces: etat.clones.length, mouvement: etat.mouvement && etat.mouvement.id, az: etat.az, el: etat.el, dist: etat.dist }),
    rendreImage: () => { if (etat.surImage) { etat.sale = true; etat.surImage(); } }, dispose() { nettoyer(); if (etat.surImage) anat.retirerImage(etat.surImage); },
    clones: () => etat.clones, contexte: () => etat
  };
}
