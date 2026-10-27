import * as THREE from 'three';
import { peindreCoque, peindreVerre, alea } from './textures-coque.js';
import { dessinerNavigation, dessinerAttitude, dessinerSystemes, dessinerCollimateur, dessinerPorte, TAILLE } from './ecrans-cockpit.js';
import { ECHELLE } from './vaisseau-3d.js';

/* ═════════════ LE COCKPIT (intérieur du pont de commandement, entièrement original) ═════════════
   Placé dans le repère du vaisseau (mètres, avant = −Z). Contenu : plancher, parois en panneaux sombres, nervures de plafond, deux sièges (pilote et copilote), pupitre
   incurvé avec trois écrans holographiques (navigation, attitude, systèmes), manette des gaz à gauche et manche à droite (animés d'après les entrées), collimateur sur la
   verrière, porte de la salle médicale au fond. Éclairage : trois lampes à portée limitée (le reste du vaisseau n'est pas éclairé par l'intérieur). La verrière
   panoramique est celle du vaisseau (vaisseau-3d.js). Deux positions de caméra : assis (siège pilote) et debout (on peut marcher dans le pont). */
export const YEUX = { assis: new THREE.Vector3(0, 4.55, -8.0), debout: new THREE.Vector3(0, 4.95, -6.6) };
export const BORNES_MARCHE = { xmin: -3.0, xmax: 3.0, zmin: -10.2, zmax: -5.9 };
export const PORTE = new THREE.Vector3(0, 4.5, -5.35);
export const SIEGE = new THREE.Vector3(0, 3.25, -8.0);

export function creerCockpit({ detail = 2, envMap = null } = {}) {
  const R = alea(21), groupe = new THREE.Group(); groupe.name = 'cockpit';
  const tex = peindreCoque({ taille: detail >= 2 ? 1024 : 512, graine: 41, teinte: [58, 66, 78], accents: true, hublots: false });
  const matParoi = new THREE.MeshStandardMaterial({ map: tex.map, roughnessMap: tex.roughnessMap, normalMap: tex.normalMap, emissiveMap: tex.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.1, metalness: 0.5, roughness: 1, envMap, envMapIntensity: 0.6 });
  const matSombre = new THREE.MeshStandardMaterial({ color: 0x1b222b, roughness: 0.55, metalness: 0.8, envMap }), matSiege = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.85, metalness: 0.1 }), matCuir = new THREE.MeshStandardMaterial({ color: 0x544a3a, roughness: 0.7, metalness: 0.1 });
  const matMetal = new THREE.MeshStandardMaterial({ color: 0xaeb7c2, roughness: 0.28, metalness: 0.95, envMap, envMapIntensity: 1.2 });
  const matVoyant = c => new THREE.MeshBasicMaterial({ color: c });
  const uv = (g, a, b) => { const t = g.attributes.uv; for (let i = 0; i < t.count; i++) t.setXY(i, t.getX(i) * a, t.getY(i) * b); return g; };
  const ajoute = (g, m, x, y, z, cible = groupe, rot = null) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); if (rot) o.rotation.set(...rot); o.castShadow = o.receiveShadow = detail >= 1; cible.add(o); return o; };

  // coque intérieure : plancher, parois, plafond, arrière (faces tournées vers l'intérieur)
  const paroi = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); uv(g, w / 3, h / 3); const m = new THREE.Mesh(g, matParoi.clone()); m.material.side = THREE.BackSide; m.position.set(x, y, z); groupe.add(m); return m; };
  // coque intérieure : plafond, cloison arrière, allèges et traverses ; AUCUN mur devant ni sur les côtés au niveau des vitres (la verrière du vaisseau est ce qu'on regarde)
  const plan = (w, h, x, y, z, rx, ry) => { const g = new THREE.PlaneGeometry(w, h); uv(g, w / 3, h / 3); const m = new THREE.Mesh(g, matParoi.clone()); m.material.side = THREE.DoubleSide; m.position.set(x, y, z); m.rotation.set(rx, ry, 0); groupe.add(m); return m; };
  plan(7.6, 8.6, 0, 6.2, -9.4, Math.PI / 2, 0);                      // plafond
  plan(7.6, 3.0, 0, 4.75, -5.3, 0, 0);                               // cloison du fond (porte)
  for (const s of [-1, 1]) { plan(8.6, 0.85, s * 3.78, 3.72, -9.4, 0, Math.PI / 2); plan(8.6, 0.3, s * 3.78, 6.0, -9.4, 0, Math.PI / 2); }   // allèges et traverses latérales
  plan(7.6, 0.85, 0, 3.72, -13.4, 0, 0);                             // allège avant (sous la verrière)
  ajoute(uv(new THREE.BoxGeometry(7.4, 0.12, 8.4), 3, 3), matSombre, 0, 3.3, -9.4);         // plancher
  const bande = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 0.16), matVoyant(0x8fd0e3)); bande.rotation.x = -Math.PI / 2; bande.position.set(0, 3.37, -9.4); groupe.add(bande);
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 7.4), matVoyant(0x8fd0e3)); b.rotation.x = -Math.PI / 2; b.position.set(s * 3.2, 3.38, -9.4); groupe.add(b); }
  // nervures de plafond
  for (let i = 0; i < 6; i++) ajoute(new THREE.BoxGeometry(7.4, 0.22, 0.3), matSombre, 0, 6.1, -13 + i * 1.5);
  const plafonnier = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.35), new THREE.MeshBasicMaterial({ color: 0xffe9c2 })); plafonnier.rotation.x = Math.PI / 2; plafonnier.position.set(0, 6.0, -9); groupe.add(plafonnier);

  // sièges
  function siege(x) {
    const g = new THREE.Group(); g.position.set(x, 3.3, -8.0);                     // le sol du pont est à y = 3,3 ; l'assise est à 0,45 m, les yeux à 1,25 m
    ajoute(new THREE.CylinderGeometry(0.16, 0.34, 0.32, 14), matSombre, 0, 0.16, 0, g);
    ajoute(new THREE.BoxGeometry(1.0, 0.12, 1.0), matSiege, 0, 0.3, 0, g); ajoute(new THREE.BoxGeometry(0.9, 0.18, 0.84), matCuir, 0, 0.39, 0.02, g);
    ajoute(new THREE.BoxGeometry(1.0, 1.25, 0.24), matSiege, 0, 1.05, 0.55, g, [-0.1, 0, 0]); ajoute(new THREE.BoxGeometry(0.62, 0.34, 0.2), matCuir, 0, 1.78, 0.62, g);
    for (const s of [-1, 1]) { ajoute(new THREE.BoxGeometry(0.12, 0.1, 0.8), matMetal, s * 0.56, 0.72, 0.05, g); ajoute(new THREE.CylinderGeometry(0.04, 0.04, 0.38, 8), matMetal, s * 0.56, 0.52, 0.2, g); }
    groupe.add(g); return g;
  }
  const siegePilote = siege(0), siegeCopilote = siege(2.2);
  siegePilote.userData.libre = true;

  // pupitre incurvé : quatre pans inclinés + écrans enchâssés
  const pupitre = new THREE.Group(); groupe.add(pupitre);
  const pan = (w, x, z, ry) => { const m = ajoute(uv(new THREE.BoxGeometry(w, 0.75, 1.3), 1.4, 0.7), matParoi, x, 3.68, z, pupitre, [0, ry, 0]); return m; };
  pan(2.3, 0, -11.2, 0); pan(2.3, -2.3, -10.8, 0.22); pan(2.3, 2.3, -10.8, -0.22); pan(1.8, -3.55, -9.6, 0.9); pan(1.8, 3.55, -9.6, -0.9);
  ajoute(uv(new THREE.BoxGeometry(5.6, 0.14, 0.5), 3, 1), matSombre, 0, 4.12, -11.85, pupitre);
  const ecrans = [], toiles = [];
  function ecran(x, z, ry, dessiner) {
    const cv = document.createElement('canvas'); cv.width = TAILLE.l; cv.height = TAILLE.h; const ctx = cv.getContext('2d'), t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.25), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false })); m.position.set(x, 4.36, z); m.rotation.set(-0.95, ry, 0, 'YXZ'); pupitre.add(m);
    const cadre = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.07, 0.06), matMetal); cadre.position.set(0, 0.64, 0); m.add(cadre);
    toiles.push({ ctx, t, dessiner }); ecrans.push(m); return m;
  }
  ecran(-2.35, -10.85, 0.22, (ctx, d) => dessinerNavigation(ctx, d.tele, d.nav));
  ecran(0, -11.18, 0, (ctx, d) => dessinerAttitude(ctx, d.tele, d.att));
  ecran(2.35, -10.85, -0.22, (ctx, d) => dessinerSystemes(ctx, d.tele, d.sys));
  // voyants et boutons (rangée de petits cylindres lumineux)
  const voyants = [];
  for (let i = 0; i < 14; i++) { const c = [0x41e0a0, 0x8fd0e3, 0xffb347, 0xc9b27a][i % 4], m = ajoute(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), matVoyant(c), -2.8 + i * 0.4, 4.24, -11.7, pupitre); voyants.push(m); }
  // manette des gaz (à gauche) et manche (à droite)
  const gaz = new THREE.Group(); gaz.position.set(-1.05, 3.62, -7.9); groupe.add(gaz);
  ajoute(new THREE.BoxGeometry(0.28, 0.34, 0.9), matSombre, 0, 0, 0, gaz); const levierGaz = new THREE.Group(); levierGaz.position.set(0, 0.17, 0.2); gaz.add(levierGaz);
  ajoute(new THREE.CylinderGeometry(0.03, 0.035, 0.5, 8), matMetal, 0, 0.25, 0, levierGaz); ajoute(new THREE.SphereGeometry(0.075, 10, 8), matCuir, 0, 0.52, 0, levierGaz);
  const manche = new THREE.Group(); manche.position.set(1.05, 3.62, -8.0); groupe.add(manche);
  ajoute(new THREE.CylinderGeometry(0.12, 0.16, 0.2, 12), matSombre, 0, 0, 0, manche); const tige = new THREE.Group(); tige.position.y = 0.1; manche.add(tige);
  ajoute(new THREE.CylinderGeometry(0.04, 0.05, 0.55, 8), matMetal, 0, 0.28, 0, tige); ajoute(new THREE.BoxGeometry(0.16, 0.2, 0.14), matCuir, 0, 0.62, 0, tige); ajoute(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), matVoyant(0xff6b6b), 0.04, 0.72, -0.03, tige);

  // collimateur sur la verrière
  const cvH = document.createElement('canvas'); cvH.width = 512; cvH.height = 288; const cxH = cvH.getContext('2d'), tH = new THREE.CanvasTexture(cvH); tH.colorSpace = THREE.SRGBColorSpace;
  const hud = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.12), new THREE.MeshBasicMaterial({ map: tH, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); hud.position.set(0, 5.35, -10.4); hud.renderOrder = 6; groupe.add(hud);

  // porte de la salle médicale (au fond du pont)
  const cvP = document.createElement('canvas'); cvP.width = 256; cvP.height = 96; dessinerPorte(cvP.getContext('2d')); const tP = new THREE.CanvasTexture(cvP); tP.colorSpace = THREE.SRGBColorSpace;
  const porte = new THREE.Group(); porte.position.set(0, 4.3, -5.55); groupe.add(porte);
  ajoute(new THREE.BoxGeometry(1.7, 2.1, 0.12), matSombre, 0, 0, 0, porte); ajoute(new THREE.BoxGeometry(1.9, 0.14, 0.2), matMetal, 0, 1.12, 0, porte); for (const s of [-1, 1]) ajoute(new THREE.BoxGeometry(0.12, 2.2, 0.2), matMetal, s * 0.92, 0, 0, porte);
  const etiquette = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), new THREE.MeshBasicMaterial({ map: tP, transparent: true, toneMapped: false })); etiquette.position.set(0, 0.55, 0.07); etiquette.rotation.y = Math.PI; porte.add(etiquette);
  const lumPorte = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 1.7), matVoyant(0x8fd0e3)); lumPorte.position.set(0, -0.1, 0.07); lumPorte.rotation.y = Math.PI; porte.add(lumPorte);
  porte.rotation.y = 0;                                              // normale vers −Z : face tournée vers l'avant du pont ; l'étiquette est retournée
  groupe.userData.porte = porte;

  // lumières à portée limitée (unités du monde : on multiplie par l'échelle du vaisseau)
  const lampe = (c, i, x, y, z, d) => { const l = new THREE.PointLight(c, i, d * ECHELLE, 0); l.position.set(x, y, z); groupe.add(l); return l; };
  const lumieres = [lampe(0xffe2b8, 0.9, 0, 5.2, -8.6, 9), lampe(0x6ec8ff, 0.9, 0, 3.9, -11.0, 5), lampe(0x6ec8ff, 0.5, 0, 4.6, -6.2, 5)];
  lumieres[0].castShadow = detail >= 2; if (lumieres[0].castShadow) { lumieres[0].shadow.mapSize.set(512, 512); lumieres[0].shadow.bias = -0.002; lumieres[0].shadow.camera.near = 0.01 * ECHELLE; lumieres[0].shadow.camera.far = 14 * ECHELLE; }

  let derniereMaj = 0, derniereHud = 0, tourEcran = 0;
  return {
    groupe, siegePilote, siegeCopilote, ecrans, porte, lumieres, YEUX, BORNES_MARCHE, PORTE, SIEGE,
    /* donnees : { tele, nav, att, sys } ; entrees : { trans, rot, gaz (0…1 ou null) } ; t : secondes */
    maj(dt, t, donnees, entrees = {}) {
      // les trois écrans se redessinent à tour de rôle, 10 fois par seconde au total
      if (t - derniereMaj > 0.1 && donnees) { derniereMaj = t; const c = toiles[tourEcran++ % toiles.length]; c.dessiner(c.ctx, donnees); c.t.needsUpdate = true; }
      if (t - derniereHud > 0.12 && donnees) { derniereHud = t; dessinerCollimateur(cxH, donnees.tele); tH.needsUpdate = true; }
      const g = entrees.gaz !== null && entrees.gaz !== undefined ? entrees.gaz : Math.max(0, Math.min(1, (entrees.trans ? entrees.trans[2] : 0) * 0.5 + 0.5));
      levierGaz.rotation.x += ((-0.7 + (g * 1.1)) - levierGaz.rotation.x) * Math.min(1, dt * 8);
      const rot = entrees.rot || [0, 0, 0]; tige.rotation.x += (-rot[0] * 0.38 - tige.rotation.x) * Math.min(1, dt * 10); tige.rotation.z += (-rot[2] * 0.38 - tige.rotation.z) * Math.min(1, dt * 10);
      voyants.forEach((v, i) => { v.scale.y = 1 + 0.4 * Math.max(0, Math.sin(t * (1.5 + i * 0.37) + i)); });
    },
    dispose() { groupe.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach(x => { if (x.map && x.map.isCanvasTexture) x.map.dispose(); x.dispose && x.dispose(); }); } }); for (const k of ['map', 'roughnessMap', 'normalMap', 'emissiveMap']) tex[k].dispose(); tH.dispose(); tP.dispose(); }
  };
}
