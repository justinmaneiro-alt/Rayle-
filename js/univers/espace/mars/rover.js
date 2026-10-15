// Rovers martiens en 3D : Perseverance (modèle NASA « Mars 2020 », domaine public, assets/espace/modeles/perseverance.glb : 75 pièces nommées, 38 maillages, 43 matériaux)
// et Curiosity (modèle procédural : châssis, six roues et suspension rocker-bogie, mât, bras, générateur, antenne, caméras). Pièces cliquables avec légendes (donnees/rovers.js).
// creerRover(ctx, id) → { groupe, pret (Promise), pieces:[{id, nom, texte, centre, noeuds}], surligner(id|null), echelle, longueur, detruire(), source }
//   Repère : sol en y = 0, avant du rover vers −z, taille normalisée à la vraie longueur (Perseverance 3,0 m ; Curiosity 2,9 m).
import { ROVERS } from '../../donnees/rovers.js?v=2026.10.15.7';

export async function creerRover(ctx, id) {
  const { THREE, noyau } = ctx, def = ROVERS[id]; if (!def) throw new Error('rover inconnu : ' + id);
  const groupe = new THREE.Group(); groupe.name = 'rover-' + id; const libres = [], pieces = def.pieces.map(p => Object.assign({ centre: new THREE.Vector3(), objets: [] }, p));
  const longueurVraie = def.chiffres.longueurM;
  let source = 'procédural';

  if (id === 'perseverance') {
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'), { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
      const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await new Promise((ok, ko) => loader.load(noyau.assets('espace/modeles/perseverance.glb'), ok, undefined, ko));
      const m = gltf.scene; groupe.add(m); source = 'modèle NASA';
      // normalisation : longueur = plus grande dimension horizontale, roues posées sur y = 0
      m.updateMatrixWorld(true); let b = new THREE.Box3().setFromObject(m), taille = b.getSize(new THREE.Vector3());
      const horiz = Math.max(taille.x, taille.z), k = longueurVraie / horiz; m.scale.multiplyScalar(k); m.updateMatrixWorld(true);
      b = new THREE.Box3().setFromObject(m); m.position.y -= b.min.y; const c = b.getCenter(new THREE.Vector3()); m.position.x -= c.x; m.position.z -= c.z; groupe.updateMatrixWorld(true);
      // l'avant du rover (hazcams avant) vers −z
      const hz = m.getObjectByName('hazcams_front'), hr = m.getObjectByName('hazcams_rear');
      if (hz && hr) { const a = new THREE.Box3().setFromObject(hz).getCenter(new THREE.Vector3()), r = new THREE.Box3().setFromObject(hr).getCenter(new THREE.Vector3()); if (Math.abs(a.x - r.x) > Math.abs(a.z - r.z)) { m.rotation.y = (a.x > r.x ? 1 : -1) * Math.PI / 2; } else if (a.z > r.z) m.rotation.y = Math.PI; groupe.updateMatrixWorld(true); const b2 = new THREE.Box3().setFromObject(m); m.position.y -= b2.min.y; }
      m.traverse(o => { if (o.isMesh) { o.frustumCulled = true; if (o.material) { const mats = Array.isArray(o.material) ? o.material : [o.material]; mats.forEach(x => { if (x.envMapIntensity !== undefined) x.envMapIntensity = .6; libres.push(x); }); } libres.push(o.geometry); } });
      for (const p of pieces) { p.objets = p.noeuds.map(n => m.getObjectByName(n)).filter(Boolean); }
    } catch (e) { console.warn('[rover] modèle NASA indisponible, version procédurale :', e && e.message); source = 'procédural'; construireProcedural(); }
  } else construireProcedural();

  /* ───── modèle procédural : Curiosity (et repli de Perseverance) ───── */
  // Proportions de Curiosity (NASA/JPL) : 2,9 m de long, 2,7 m de large (roues comprises), roues de 50 cm, mât à 2,1 m, bras de 2,1 m replié à l'avant, générateur à l'arrière.
  function construireProcedural() {
    while (groupe.children.length) groupe.remove(groupe.children[0]);
    const mat = (c, o = {}) => { const m = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .55, metalness: .45 }, o)); libres.push(m); return m; };
    const alu = mat(0xc4c8ce, { metalness: .8, roughness: .38 }), blanc = mat(0xe7e5df, { metalness: .25, roughness: .55 }), noir = mat(0x1f2125, { roughness: .7, metalness: .3 }), or = mat(0xc99a3c, { metalness: .9, roughness: .3 }), roueM = mat(0x9fa4ab, { metalness: .85, roughness: .4 }), rtgM = mat(0x55585e, { metalness: .6, roughness: .5 }), pont = mat(0x7a7d84, { metalness: .8, roughness: .45 }), orange = mat(0xd9531e, { roughness: .6, metalness: .2 });
    const part = nom => { const g = new THREE.Group(); g.name = nom; groupe.add(g); return g; };
    const ajoute = (geom, m, x, y, z, parent) => { libres.push(geom); const o = new THREE.Mesh(geom, m); o.position.set(x, y, z); (parent || groupe).add(o); return o; };
    const box = (w, h, d, m, x, y, z, parent) => ajoute(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);
    const cyl = (r, l, m, x, y, z, axe, parent, r2) => { const o = ajoute(new THREE.CylinderGeometry(r2 == null ? r : r2, r, l, 28), m, x, y, z, parent); if (axe === 'x') o.rotation.z = Math.PI / 2; if (axe === 'z') o.rotation.x = Math.PI / 2; return o; };
    const sph = (r, m, x, y, z, parent) => ajoute(new THREE.SphereGeometry(r, 16, 12), m, x, y, z, parent);
    // barre cylindrique entre deux points (bras de la suspension, mât…)
    const entre = (a, b, r, m, parent) => { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), l = A.distanceTo(B); const g = new THREE.CylinderGeometry(r, r, l, 12); libres.push(g); const o = new THREE.Mesh(g, m); o.position.copy(A).add(B).multiplyScalar(.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); (parent || groupe).add(o); return o; };

    // châssis (caisse chaude) : volume blanc, plateau supérieur, panneaux dorés
    const caisse = part('caisse');
    box(1.42, .55, 2.1, blanc, 0, 1.05, .05, caisse); box(1.5, .08, 2.18, or, 0, 1.36, .05, caisse); box(1.16, .08, 1.6, alu, 0, 1.44, .02, caisse); box(.96, .38, 1.5, alu, 0, .72, .02, caisse);
    box(.5, .34, .5, noir, -.28, 1.52, .55, caisse); box(.34, .2, .4, alu, .3, 1.52, .15, caisse); box(.9, .06, .5, alu, 0, 1.5, -.45, caisse);

    // suspension rocker-bogie : de chaque côté, un rocker (avant) et un bogie (arrière) articulés au châssis et entre eux
    const suspension = part('suspension'), roues = part('roues');
    const ROUE_R = .25, ROUE_L = .4, X_ROUE = 1.15;
    for (const s of [-1, 1]) {
      const av = [s * X_ROUE, ROUE_R, -1.0], mi = [s * X_ROUE, ROUE_R, 0.02], ar = [s * X_ROUE, ROUE_R, 1.0];
      const pivChassis = [s * .76, .92, -.05], pivBogie = [s * .96, .66, .52], pivAv = [s * 1.0, .72, -.62];
      entre(pivChassis, pivBogie, .045, pont, suspension); entre(pivChassis, pivAv, .045, pont, suspension);            // rocker
      entre(pivBogie, [s * X_ROUE * .93, ROUE_R + .1, mi[2]], .04, pont, suspension); entre(pivBogie, [s * X_ROUE * .93, ROUE_R + .1, ar[2]], .04, pont, suspension);   // bogie
      entre(pivAv, [s * X_ROUE * .93, ROUE_R + .12, av[2]], .04, pont, suspension);
      for (const p of [pivChassis, pivBogie, pivAv]) sph(.075, alu, p[0], p[1], p[2], suspension);
      entre([s * .73, 1.0, -.6], [s * .8, .9, .55], .03, alu, suspension);
      for (const c of [av, mi, ar]) {
        const w = new THREE.Group(); w.position.set(c[0], c[1], c[2]); roues.add(w);
        cyl(ROUE_R, ROUE_L, roueM, 0, 0, 0, 'x', w); cyl(ROUE_R * .62, ROUE_L + .02, alu, 0, 0, 0, 'x', w); cyl(.05, ROUE_L + .1, noir, 0, 0, 0, 'x', w);
        for (let k = 0; k < 24; k++) { const a = k / 24 * 6.2832, g = box(ROUE_L - .02, .05, .035, roueM, 0, Math.cos(a) * (ROUE_R + .018), Math.sin(a) * (ROUE_R + .018), w); g.rotation.x = -a; }      // crampons (grousers)
        entre([0, 0, 0], [-s * .5, .2, 0], .025, pont, w);                                                              // arbre moteur vers la suspension
      }
    }
    entre([-X_ROUE, 1.0, -.05], [X_ROUE, 1.0, -.05], .028, pont, suspension);                                           // barre de différentiel

    // mât : Mastcam (deux caméras), ChemCam (laser), caméras de navigation
    const mat_ = part('mat');
    entre([-.38, 1.45, -.78], [-.38, 2.12, -.78], .045, alu, mat_); box(.55, .18, .24, blanc, -.38, 2.22, -.78, mat_); box(.2, .14, .2, noir, -.38, 2.12, -.78, mat_);
    for (const s of [-1, 1]) { cyl(.06, .14, noir, -.38 + s * .17, 2.24, -.92, 'z', mat_); cyl(.035, .1, alu, -.38 + s * .06, 2.31, -.8, 'y', mat_); }
    cyl(.07, .3, blanc, -.38, 2.0, -.62, 'y', mat_); sph(.055, noir, -.38, 2.0, -.78, mat_);

    // bras robotisé replié à l'avant, tourelle avec foreuse, microscope, spectromètre, brosse
    const bras = part('bras');
    entre([.52, 1.18, -1.02], [.52, 1.1, -1.55], .05, alu, bras); entre([.52, 1.1, -1.55], [.5, .98, -1.28], .045, alu, bras); entre([.5, .98, -1.28], [.5, .82, -1.72], .05, blanc, bras);
    const tour = cyl(.22, .26, rtgM, .5, .8, -1.86, 'z', bras); for (let k = 0; k < 5; k++) { const a = k / 5 * 6.2832; cyl(.045, .24, k === 0 ? orange : noir, .5 + Math.cos(a) * .12, .8 + Math.sin(a) * .12, -2.0, 'z', bras); }
    box(.12, .12, .3, alu, .5, .95, -1.6, bras);

    // générateur thermoélectrique à radio-isotope (MMRTG) : ailettes de refroidissement
    const rtg = part('rtg');
    const corps = cyl(.14, .8, rtgM, 0, 1.2, 1.3, 'z', rtg); corps.rotation.x = Math.PI / 2 + .12;
    for (let k = 0; k < 8; k++) { box(.34, .012, .5, rtgM, 0, 1.2, .98 + k * .09, rtg).rotation.x = .12; box(.012, .34, .5, rtgM, 0, 1.2, .98 + k * .09, rtg).rotation.x = .12; }
    cyl(.17, .06, noir, 0, 1.24, 1.72, 'z', rtg);

    // antenne à grand gain (hexagone) et antenne UHF
    const hga = part('hga'); const dish = cyl(.3, .025, alu, .5, 1.58, .62, 'y', hga); dish.rotation.x = .35; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.2832, m = box(.22, .03, .03, alu, .5 + Math.cos(a) * .26, 1.6 + Math.sin(a) * .02, .62 + Math.sin(a) * .26, hga); m.rotation.y = -a; } entre([.5, 1.45, .62], [.5, 1.58, .62], .03, alu, hga);
    entre([-.55, 1.5, .85], [-.55, 1.9, .85], .018, noir, hga);

    // caméras d'évitement des dangers (avant et arrière)
    const haz = part('hazcams'); for (const s of [-1, 1]) { box(.12, .08, .08, noir, s * .3, .88, -1.05, haz); box(.12, .08, .08, noir, s * .3, .88, 1.09, haz); }
    groupe.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(groupe); groupe.position.y -= b.min.y;
    for (const p of pieces) p.objets = p.noeuds.map(n => groupe.getObjectByName(n)).filter(Boolean);
  }

  const pret = (async () => {
    groupe.updateMatrixWorld(true);
    for (const p of pieces) {
      const box = new THREE.Box3(); for (const o of p.objets) box.union(new THREE.Box3().setFromObject(o));
      if (!box.isEmpty()) { box.getCenter(p.centre); p.centre = groupe.worldToLocal(p.centre.clone()); p.taille = box.getSize(new THREE.Vector3()).length(); }
    }
    return true;
  })();
  // surbrillance d'une pièce : émission douce sur ses matériaux (restaurée ensuite)
  const memo = new Map(); let actuelle = null;
  function surligner(idp) {
    for (const [m, e] of memo) { m.emissive.copy(e.c); m.emissiveIntensity = e.i; } memo.clear(); actuelle = idp;
    const p = pieces.find(x => x.id === idp); if (!p) return;
    for (const o of p.objets) o.traverse(n => { if (!n.isMesh) return; (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => { if (m && m.emissive && !memo.has(m)) { memo.set(m, { c: m.emissive.clone(), i: m.emissiveIntensity }); m.emissive.setRGB(.9, .55, .12); m.emissiveIntensity = .55; } }); });
  }
  function detruire() { surligner(null); libres.forEach(x => { try { x.dispose(); } catch (e) { /* déjà libéré */ } }); }
  await pret;
  return { groupe, pret, pieces, surligner, detruire, source, longueur: longueurVraie, def, actuelle: () => actuelle };
}
