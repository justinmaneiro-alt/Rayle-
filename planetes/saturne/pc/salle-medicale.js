import * as THREE from 'three';
import { peindreCoque, alea } from './textures-coque.js';

/* ═════════════ LA SALLE MÉDICALE DU VAISSEAU ═════════════
   Pièce circulaire (scène à part, dessinée à la place de la galaxie pendant la visite), table holographique ronde au centre (même vocabulaire que la table de Mars :
   pied métallique, plateau lumineux, liseré cyan, faisceau vertical), trois grands écrans muraux, éclairage doux avec ombres. Au-dessus de la table, le volume
   holographique `holo` reçoit le corps : une silhouette provisoire en fil de fer tant que le modèle anatomique n'est pas chargé (chargeur-modeles.js), puis le modèle
   (os, muscles, vaisseaux, nerfs, organes) mis à l'échelle de la table. Caméra : orbite autour de la table (glisser, molette, touches), ou marche autour. */
export const HAUTEUR_TABLE = 0.92, HAUTEUR_HOLO = 1.12;           // m : plateau, centre du volume holographique
export const RAYON_SALLE = 6.5;

export function creerSalleMedicale({ renderer, detail = 2 } = {}) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x03070c); scene.fog = new THREE.FogExp2(0x03070c, 0.035);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.03, 80);
  const R = alea(77);
  // environnement PBR : petite pièce neutre (reflets doux sur les métaux)
  let pmrem = null, envRT = null;
  const pret = (async () => {
    try { const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js'); pmrem = new THREE.PMREMGenerator(renderer); envRT = pmrem.fromScene(new RoomEnvironment(), 0.04); scene.environment = envRT.texture; scene.environmentIntensity = 0.35; } catch (e) { /* sans environnement : éclairage direct seulement */ }
  })();

  // ── salle : parois en panneaux, sol, plafond
  const tex = peindreCoque({ taille: detail >= 2 ? 1024 : 512, graine: 63, teinte: [70, 80, 92], accents: true, hublots: false });
  for (const t of [tex.map, tex.roughnessMap, tex.normalMap, tex.emissiveMap]) t.repeat.set(5, 1.2);
  const matParoi = new THREE.MeshStandardMaterial({ map: tex.map, roughnessMap: tex.roughnessMap, normalMap: tex.normalMap, emissiveMap: tex.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.9, metalness: 0.35, roughness: 1, side: THREE.BackSide });
  const murs = new THREE.Mesh(new THREE.CylinderGeometry(RAYON_SALLE, RAYON_SALLE, 3.6, 48, 1, true), matParoi); murs.position.y = 1.8; murs.receiveShadow = true; scene.add(murs);
  const cvSol = document.createElement('canvas'); cvSol.width = cvSol.height = 512; { const c = cvSol.getContext('2d'); c.fillStyle = '#0c131b'; c.fillRect(0, 0, 512, 512); c.strokeStyle = 'rgba(143,208,227,0.18)'; c.lineWidth = 2; for (let r = 40; r < 256; r += 44) { c.beginPath(); c.arc(256, 256, r, 0, 6.2832); c.stroke(); } for (let a = 0; a < 24; a++) { c.beginPath(); c.moveTo(256, 256); c.lineTo(256 + Math.cos(a / 24 * 6.2832) * 256, 256 + Math.sin(a / 24 * 6.2832) * 256); c.stroke(); } }
  const texSol = new THREE.CanvasTexture(cvSol); texSol.colorSpace = THREE.SRGBColorSpace; texSol.anisotropy = 8;
  const sol = new THREE.Mesh(new THREE.CircleGeometry(RAYON_SALLE, 64), new THREE.MeshStandardMaterial({ map: texSol, roughness: 0.4, metalness: 0.6, envMapIntensity: 0.6 })); sol.rotation.x = -Math.PI / 2; sol.receiveShadow = true; scene.add(sol);
  const plafond = new THREE.Mesh(new THREE.CircleGeometry(RAYON_SALLE, 48), new THREE.MeshStandardMaterial({ color: 0x151d27, roughness: 0.7, metalness: 0.5 })); plafond.rotation.x = Math.PI / 2; plafond.position.y = 3.6; scene.add(plafond);
  const anneauPlafond = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.06, 8, 96), new THREE.MeshBasicMaterial({ color: 0xcfeaff })); anneauPlafond.rotation.x = Math.PI / 2; anneauPlafond.position.y = 3.55; scene.add(anneauPlafond);

  // ── table holographique
  const table = new THREE.Group(); scene.add(table);
  const mMetal = new THREE.MeshStandardMaterial({ color: 0x8993a1, roughness: 0.28, metalness: 0.95 }), mLed = new THREE.MeshBasicMaterial({ color: 0x8fd0e3 });
  const pied = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.7, HAUTEUR_TABLE - 0.05, 40), mMetal); pied.position.y = (HAUTEUR_TABLE - 0.05) / 2; pied.castShadow = pied.receiveShadow = true; table.add(pied);
  const plateau = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.05, 0.09, 64), new THREE.MeshPhysicalMaterial({ color: 0x0b1620, roughness: 0.55, metalness: 0.1, clearcoat: 0.15, clearcoatRoughness: 0.6, transparent: true, opacity: 0.94 })); plateau.position.y = HAUTEUR_TABLE - 0.02; plateau.castShadow = plateau.receiveShadow = true; table.add(plateau);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.014, 8, 128), mLed); rim.rotation.x = Math.PI / 2; rim.position.y = HAUTEUR_TABLE + 0.03; table.add(rim);
  const socle = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.014, 8, 64), mLed); socle.rotation.x = Math.PI / 2; socle.position.y = 0.03; table.add(socle);
  const cvLueur = document.createElement('canvas'); cvLueur.width = cvLueur.height = 256; { const c = cvLueur.getContext('2d'), g = c.createRadialGradient(128, 128, 4, 128, 128, 128); g.addColorStop(0, 'rgba(143,208,227,0.75)'); g.addColorStop(0.6, 'rgba(143,208,227,0.14)'); g.addColorStop(1, 'rgba(143,208,227,0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 256); }
  const lueur = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cvLueur), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); lueur.rotation.x = -Math.PI / 2; lueur.position.y = HAUTEUR_TABLE + 0.035; table.add(lueur);
  const faisceau = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 2.0, 48, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uT: { value: 0 } },
    vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uT; varying float vY; void main(){ float a = (1.0 - vY) * 0.045 + 0.008 * sin(vY * 60.0 - uT * 3.0); gl_FragColor = vec4(0.62, 0.74, 0.82, max(a, 0.0) * 0.22); }' }));       // cylindre holographique très discret (A4)
  faisceau.position.y = HAUTEUR_TABLE + 1.0; table.add(faisceau);
  const projecteurs = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 8, 64), mMetal); projecteurs.rotation.x = Math.PI / 2; projecteurs.position.y = 3.3; table.add(projecteurs);
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.2832, t = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), mMetal); t.position.set(Math.cos(a) * 0.9, 3.35, Math.sin(a) * 0.9); table.add(t); }

  // ── volume holographique (le modèle anatomique vient ici) : silhouette provisoire en fil de fer
  const holo = new THREE.Group(); holo.position.y = HAUTEUR_HOLO + 0.62; table.add(holo);
  const matHolo = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, wireframe: true, uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uT; varying vec3 vP; void main(){ float s = 0.55 + 0.45 * sin(vP.y * 40.0 - uT * 4.0); gl_FragColor = vec4(0.4, 0.82, 0.95, 0.5 * s + 0.12); }' });
  const silhouette = new THREE.Group(); holo.add(silhouette);
  const membre = (r, long, x, y, z, rz = 0, rx = 0) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, long, 3, 10), matHolo); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); silhouette.add(m); };
  membre(0.1, 0.0, 0, 0.68, 0);                                    // tête
  membre(0.17, 0.3, 0, 0.3, 0); membre(0.15, 0.1, 0, 0.0, 0);        // thorax, bassin
  for (const s of [-1, 1]) { membre(0.045, 0.34, s * 0.27, 0.32, 0, s * 0.18); membre(0.04, 0.3, s * 0.36, 0.0, 0, s * 0.1); membre(0.065, 0.42, s * 0.1, -0.35, 0); membre(0.05, 0.4, s * 0.1, -0.8, 0); }
  const colonne = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 6, 8), matHolo); colonne.position.set(0, 0.28, 0); silhouette.add(colonne);
  silhouette.position.y = 0.45;
  // texte de chargement au-dessus du corps
  const cvC = document.createElement('canvas'); cvC.width = 512; cvC.height = 96; const cxC = cvC.getContext('2d'), tC = new THREE.CanvasTexture(cvC); tC.colorSpace = THREE.SRGBColorSpace;
  const etiquette = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.26), new THREE.MeshBasicMaterial({ map: tC, transparent: true, depthWrite: false, toneMapped: false })); etiquette.position.set(0, 1.24, 0); holo.add(etiquette);
  function ecrireEtiquette(titre, sous = '', progres = null) {
    cxC.clearRect(0, 0, 512, 96); cxC.fillStyle = 'rgba(4,9,15,0.82)'; cxC.fillRect(0, 0, 512, 96); cxC.strokeStyle = 'rgba(143,208,227,0.45)'; cxC.lineWidth = 2; cxC.strokeRect(2, 2, 508, 92);
    cxC.font = '600 24px "Cascadia Mono", Consolas, monospace'; cxC.fillStyle = '#8fd0e3'; cxC.textAlign = 'center'; cxC.fillText(titre, 256, 36); cxC.font = '15px "Cascadia Mono", Consolas, monospace'; cxC.fillStyle = '#c9b27a'; cxC.fillText(sous, 256, 60);
    if (progres !== null) { cxC.fillStyle = 'rgba(143,208,227,0.18)'; cxC.fillRect(40, 72, 432, 8); cxC.fillStyle = '#8fd0e3'; cxC.fillRect(40, 72, 432 * Math.max(0, Math.min(1, progres)), 8); }
    tC.needsUpdate = true;
  }
  ecrireEtiquette('SQUELETTE HUMAIN', 'modèle anatomique non chargé');

  // ── pas d'écrans muraux : la fiche, le système affiché et l'avertissement sont dans les fenêtres holographiques (anatomie-fenetres.js), nettes et face à l'écran.
  const redessinerEcran = () => {};

  // ── éclairage neutre et doux (A4 : plus de lueur colorée autour du squelette) : ambiante hémisphérique, clé blanche chaude, contre-jour froid très faible
  scene.add(new THREE.HemisphereLight(0xe9eef4, 0x2a313a, 0.6));
  const haut = new THREE.DirectionalLight(0xf3f1ec, 0.85); haut.position.set(1.5, 5, 2); haut.castShadow = detail >= 1; haut.shadow.mapSize.set(detail >= 2 ? 2048 : 1024, detail >= 2 ? 2048 : 1024); const sc = haut.shadow.camera; sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.near = 0.5; sc.far = 14; haut.shadow.bias = -0.0006; scene.add(haut);
  const contreJour = new THREE.DirectionalLight(0xcfe0f0, 0.35); contreJour.position.set(-2, 3, -3); scene.add(contreJour);
  const lumiereTable = new THREE.PointLight(0xffffff, 0, 6, 1.6); lumiereTable.position.set(0, HAUTEUR_TABLE + 0.7, 0); scene.add(lumiereTable);        // gardée (éteinte) : l'anatomie la réglait
  const lumiereChaude = new THREE.PointLight(0xffe2b8, 0.0, 12, 1.2); lumiereChaude.position.set(-3, 3.0, 2); scene.add(lumiereChaude);

  // ── caméra orbitale autour de la table
  const DIST_DEFAUT = 2.7;                                                  // le squelette remplit mieux l'écran (3,4 le laissait petit)
  const vue = { az: 0.6, el: 0.22, dist: DIST_DEFAUT, cible: new THREE.Vector3(0, HAUTEUR_HOLO + 0.3, 0), cibleVoulue: new THREE.Vector3(0, HAUTEUR_HOLO + 0.3, 0), distVoulue: DIST_DEFAUT };
  function placerCamera(dt = 1 / 60) {
    const k = 1 - Math.exp(-dt * 9); vue.dist += (vue.distVoulue - vue.dist) * k; vue.cible.lerp(vue.cibleVoulue, k);
    const ce = Math.cos(vue.el); camera.position.set(vue.cible.x + Math.sin(vue.az) * ce * vue.dist, vue.cible.y + Math.sin(vue.el) * vue.dist, vue.cible.z + Math.cos(vue.az) * ce * vue.dist); camera.lookAt(vue.cible);
  }
  placerCamera();
  const controle = {
    glisser(dx, dy) { vue.az -= dx * 0.006; vue.el = Math.max(-0.5, Math.min(1.2, vue.el + dy * 0.005)); },
    zoom(d) { vue.distVoulue = Math.max(1.0, Math.min(5.8, vue.distVoulue * Math.exp(d * 0.0012))); },
    orienter(az, el) { if (az !== undefined) vue.az = az; if (el !== undefined) vue.el = el; },
    cadrer(cible, dist) { if (cible) vue.cibleVoulue.copy(cible); if (dist) vue.distVoulue = dist; },
    recentrer() { vue.cibleVoulue.set(0, HAUTEUR_HOLO + 0.3, 0); vue.distVoulue = DIST_DEFAUT; },
    marcher(avance, lateral, dt) { vue.az += lateral * dt * 0.9; vue.distVoulue = Math.max(1.0, Math.min(5.8, vue.distVoulue - avance * dt * 2.2)); },
    etat: () => ({ az: vue.az, el: vue.el, dist: vue.dist })
  };
  let tTotal = 0;
  return {
    scene, camera, table, holo, silhouette, ecrans: {}, controle, pret, ecrireEtiquette, etiquette,
    redessinerEcran,
    /* Remplace la silhouette provisoire par un modèle chargé (groupe THREE) ; echelleHauteur : hauteur voulue en mètres. */
    afficherModele(groupe, echelleHauteur = 1.45) {
      silhouette.visible = false; etiquette.visible = false;
      for (const c of [...holo.children]) if (c.userData && c.userData.modele) { holo.remove(c); }
      groupe.userData.modele = true; holo.add(groupe);
      const boite = new THREE.Box3().setFromObject(groupe), taille = new THREE.Vector3(); boite.getSize(taille);
      const k = echelleHauteur / Math.max(taille.y, 1e-6); groupe.scale.multiplyScalar(k); boite.setFromObject(groupe); const c = new THREE.Vector3(); boite.getCenter(c); groupe.position.sub(c); groupe.position.y += 0.0;
      return groupe;
    },
    retirerModele() { for (const c of [...holo.children]) if (c.userData && c.userData.modele) holo.remove(c); silhouette.visible = true; etiquette.visible = true; },
    maj(dt, t) {
      tTotal += dt; matHolo.uniforms.uT.value = tTotal; faisceau.material.uniforms.uT.value = tTotal;
      if (silhouette.visible) silhouette.rotation.y += dt * 0.35;
      lueur.material.opacity = 0.14 + 0.03 * Math.sin(tTotal * 1.6); anneauPlafond.material.color.setScalar(0.85 + 0.15 * Math.sin(tTotal * 0.8));
      placerCamera(dt);
    },
    redimensionner(l, h) { camera.aspect = l / Math.max(1, h); camera.updateProjectionMatrix(); },
    dispose() { scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach(x => { if (x.map && x.map.isCanvasTexture) x.map.dispose(); x.dispose && x.dispose(); }); } }); if (envRT) envRT.dispose(); if (pmrem) pmrem.dispose(); for (const k of ['map', 'roughnessMap', 'normalMap', 'emissiveMap']) tex[k].dispose(); texSol.dispose(); }
  };
}
