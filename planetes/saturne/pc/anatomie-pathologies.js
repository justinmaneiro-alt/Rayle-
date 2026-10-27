import * as THREE from 'three';
import { PATHOLOGIES, AMPUTATIONS, DEFICIENCES, POSES, FRACTURES, rachis, scoliose, cyphose, classerAmputation, classerDeficience, planFracture, trouverPathologie, descriptionParleePatho, AVERTISSEMENT, DEG } from './anatomie-pathologies-calcul.js';

/* ═════════════ ANATOMIE : PATHOLOGIES ET ORTHOPÉDIE SUR LA TABLE (S6) ═════════════
   Rend les cas de anatomie-pathologies-calcul.js sur le modèle : vertèbres déplacées (scoliose, cyphose) avec lignes de Cobb, amputations (pièces enlevées et os coupés par un plan
   local dans le nuanceur), déficiences congénitales (os absent), attitudes et déformations (squelette articulé), fractures (os coupé en deux fragments, le distal déplacé).
   OUTIL PÉDAGOGIQUE, PAS UN OUTIL DE DIAGNOSTIC : l'avertissement est affiché et lu à chaque cas. */
const M4 = THREE.Matrix4, V3 = THREE.Vector3;
const trans = v => new M4().makeTranslation(v[0], v[1], v[2]);

export function creerPathologies({ anat }) {
  const index = anat.index, mouvement = anat.mouvement(), rig = mouvement.rig, a = rig.ant;
  const R = rachis(index);
  const etat = { actif: null, cacheParNous: new Set(), clones: [], lignes: null, spine: new Set(), params: null };
  const meshs = id => anat.etat.meshs.get(id) || [];

  /* ── plan de coupe local (nuanceur) : un fragment ne montre que le côté voulu du plan, défini au repos ── */
  function instrumenter(mat) {
    if (mat.__clip) return mat.__clip;
    const U = { uCn: { value: new V3(0, 1, 0) }, uCq: { value: new V3() }, uCs: { value: 0 } }; mat.__clip = U;
    const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r); sh.uniforms.uCn = U.uCn; sh.uniforms.uCq = U.uCq; sh.uniforms.uCs = U.uCs;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vClipP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvClipP = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uCn; uniform vec3 uCq; uniform float uCs;\nvarying vec3 vClipP;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (uCs != 0.0 && uCs * dot(vClipP - uCq, uCn) > 0.0) discard;');
    };
    mat.customProgramCacheKey = () => prevKey() + '-cliploc'; mat.side = THREE.DoubleSide; mat.needsUpdate = true; return U;
  }
  function fixerM0(m) { if (!m.userData.m0) m.userData.m0 = m.matrix.clone(); m.matrixAutoUpdate = false; m.frustumCulled = false; }
  /* garde le côté s (-1 : le côté négatif de la normale, +1 : le côté positif) du plan (n, q) donné dans le repère du modèle au repos */
  function couper(m, n, q, garder) {
    fixerM0(m); const m0 = m.userData.m0, inv = m0.clone().invert(), lin = new THREE.Matrix3().setFromMatrix4(m0).transpose();
    const U = instrumenter(m.material.__clip || m.userData.propre ? m.material : anat.materielPropre(m));
    U.uCq.value.set(q[0], q[1], q[2]).applyMatrix4(inv); U.uCn.value.set(n[0], n[1], n[2]).applyMatrix3(lin).normalize(); U.uCs.value = garder > 0 ? -1 : 1;     // on rejette le côté opposé à « garder »
  }
  function rejeter(id) { if (meshs(id).length) { anat.cacherPiece(id, true); etat.cacheParNous.add(id); } }

  /* ── remise à zéro : les systèmes et les pièces masquées reviennent à l'état choisi par l'utilisateur ── */
  function reinitialiser() {
    mouvement.arreter(); mouvement.reinitialiser();
    anat.effacerCachees(); etat.cacheParNous.clear(); anat.surcharger(null);
    for (const ms of anat.etat.meshs.values()) for (const m of ms) { const U = m.material && m.material.__clip; if (U) U.uCs.value = 0; if (m.userData.m0) m.matrix.copy(m.userData.m0); m.matrixWorldNeedsUpdate = true; }
    for (const c of etat.clones) { if (c.parent) c.parent.remove(c); if (c.material) c.material.dispose(); } etat.clones.length = 0;
    if (etat.lignes) { anat.racine.remove(etat.lignes); etat.lignes.geometry.dispose(); etat.lignes.material.dispose(); etat.lignes = null; }
    etat.spine.clear(); etat.actif = null; etat.params = null;
  }
  async function preparerSystemes(liste) { await anat.surcharger(liste); }

  /* ── rachis ── */
  function lignesCobb(v, i0, i1, incl, plan) {
    const g = new THREE.BufferGeometry(), pts = [];
    for (const [i, sens] of [[i0, 1], [i1, 1]]) { const c = v[i].centre, th = -incl[i] * DEG * rig.cote.droit; const dx = Math.cos(th) * 0.09, dy = Math.sin(th) * 0.09; pts.push(c[0] - dx, c[1] - dy, c[2] + 0.06, c[0] + dx, c[1] + dy, c[2] + 0.06); void sens; }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc9b27a, depthTest: false, transparent: true })); l.renderOrder = 30; return l;
  }
  function deformerRachis(res, plan) {
    const v = R.vertebres, cd = rig.cote.droit;
    for (const [id, k] of R.rattache) {
      const c = v[k].centre, sag = !!res.sagittal;
      let Mx;
      if (sag) { const th = -a * res.inclinaison[k] * DEG, dz = -a * res.decalage[k]; Mx = trans([0, 0, dz]).multiply(trans(c)).multiply(new M4().makeRotationX(th)).multiply(trans(c.map(x => -x))); }
      else { const x = res.decalage[k] * cd, tilt = -(res.inclinaison[k] * cd) * DEG, ry = (res.rotation ? res.rotation[k] : 0) * DEG * cd; Mx = trans([x, 0, 0]).multiply(trans(c)).multiply(new M4().makeRotationY(ry)).multiply(new M4().makeRotationZ(tilt)).multiply(trans(c.map(q => -q))); }
      for (const m of meshs(id)) { fixerM0(m); m.matrix.copy(Mx).multiply(m.userData.m0); m.matrixWorldNeedsUpdate = true; etat.spine.add(m); }
    }
  }
  async function scolioseOuCyphose(p, params, estCyphose) {
    await preparerSystemes(['os']);
    const val = params.valeur !== undefined ? params.valeur : p.parametre.defaut, v = R.vertebres;
    const res = estCyphose ? { ...cyphose(v, { cobb: val }), sagittal: true } : scoliose(v, { cobb: val, type: params.type || 'thoracique', coteConvexe: params.cote || 'droit' });
    deformerRachis(res); const ext = res.inclinaison, [i0, i1] = res.plage; let imax = i0, imin = i0; for (let i = i0; i <= i1; i++) { if (ext[i] > ext[imax]) imax = i; if (ext[i] < ext[imin]) imin = i; }
    if (!estCyphose) { etat.lignes = lignesCobb(v, Math.min(imax, imin), Math.max(imax, imin), ext); anat.racine.add(etat.lignes); }
    anat.cadrer([...index.deSysteme('os')].filter(x => /vertebra|^.*rib$/i.test(x.nom_en))); anat.orienter(estCyphose ? (a > 0 ? Math.PI / 2 : -Math.PI / 2) : (a > 0 ? Math.PI : 0), 0.1);   // scoliose : vue de dos ; cyphose : de profil
    const extremes = v[Math.min(imax, imin)].code + ' et ' + v[Math.max(imax, imin)].code;
    return { mesure: (estCyphose ? 'Angle de Cobb sagittal' : 'Angle de Cobb') + ' mesuré sur le modèle : ' + res.cobbMesure.toFixed(1) + ' degrés, entre les vertèbres limites ' + extremes + (res.cobbSecondaire ? '. Seconde courbe : ' + res.cobbSecondaire.toFixed(1) + ' degrés' : '') + '.', cobb: res.cobbMesure, vertebresLimites: extremes };
  }

  /* ── amputations, déficiences ── */
  function appliquerClassement(cl) {
    for (const id of cl.cacher) rejeter(id);
    for (const c of cl.clip) for (const m of meshs(c.id)) couper(m, c.n, c.q, -1);
    anat.appliquer();
  }
  async function amputation(p, params) {
    await preparerSystemes(['os', 'muscles', 'arteres', 'veines', 'nerfs']);
    const cote = params.cote || 'droit', cl = classerAmputation(index, rig, p, cote); appliquerClassement(cl);
    anat.cadrer(index.deSysteme('os').filter(x => x.cote === cote && /femur|tibia|humerus|radius/i.test(x.nom_en))); anat.orienter(a > 0 ? 0 : Math.PI, 0.1);
    const lon = cl.longueurCm ? (p.membre === 'inférieur' ? 'Longueur du moignon sur le modèle : environ ' + Math.round(cl.longueurCm) + ' centimètres sous ' + (p.coupe.segment === 'jambe' ? 'l’interligne du genou' : 'la hanche') + ' (valeur du modèle, repère seulement).' : 'Longueur du moignon sur le modèle : environ ' + Math.round(cl.longueurCm) + ' centimètres sous ' + (p.coupe.segment === 'avantbras' ? 'le coude' : 'l’épaule') + ' (valeur du modèle, repère seulement).') : null;
    return { mesure: lon };
  }
  async function deficience(p) { await preparerSystemes(['os', 'muscles']); const cl = classerDeficience(index, rig, p); appliquerClassement(cl); anat.cadrer(index.deSysteme('os').filter(x => /femur|tibia|radius|humerus/i.test(x.nom_en) && x.cote === 'droit')); anat.orienter(a > 0 ? 0 : Math.PI, 0.1); return { mesure: 'Déficience ' + p.type + ' (ISO 8548-1) simulée sur le côté droit.' }; }

  /* ── attitudes et déformations ── */
  async function pose(p) {
    await preparerSystemes(['os', 'muscles']); const T = mouvement.poserAngles(p.poses);
    anat.cadrer(index.deSysteme('os').filter(x => /femur|tibia|humerus/i.test(x.nom_en))); anat.orienter(a > 0 ? 0 : Math.PI, 0.1);
    let mesure = null;
    if (/genu/.test(p.id)) {
      const pv = n => new V3(...rig.pivots[n]), H = pv('hancheD'), K = pv('genouD').applyMatrix4(T.cuisseD), A = pv('chevilleD').applyMatrix4(T.jambeD);
      const u = K.clone().sub(H), w = A.clone().sub(K), ang = u.angleTo(w) / DEG, ext = K.x + (A.y - K.y) * (u.x / u.y), dev = (A.x - ext) * rig.cote.droit;
      mesure = 'Déviation de l’axe fémoro-tibial mesurée sur le modèle : ' + ang.toFixed(1) + ' degrés en ' + (dev > 0 ? 'valgus' : 'varus') + ' (angle fémoro-tibial ' + (dev > 0 ? (180 + ang).toFixed(0) : (180 - ang).toFixed(0)) + ' degrés).';
    }
    return { mesure };
  }

  /* ── fractures ── */
  async function fracture(p) {
    await preparerSystemes(['os']); const pl = planFracture(index, rig, p); if (!pl) return { erreur: 'os introuvable' };
    for (const m of meshs(pl.id)) {
      fixerM0(m); const d = pl.deplacement, n = pl.n, c = pl.c;
      couper(m, n, c, -1);                                                                    // fragment proximal : le côté négatif de la normale (vers le proximal)
      const f = new THREE.Mesh(m.geometry, m.material.clone()); f.matrixAutoUpdate = false; f.frustumCulled = false; f.userData.m0 = m.userData.m0.clone(); f.name = m.name + '-fragment';
      const U = instrumenter(f.material); const m0 = f.userData.m0, inv = m0.clone().invert(), lin = new THREE.Matrix3().setFromMatrix4(m0).transpose();
      U.uCq.value.set(c[0], c[1], c[2]).applyMatrix4(inv); U.uCn.value.set(n[0], n[1], n[2]).applyMatrix3(lin).normalize(); U.uCs.value = -1;   // fragment distal : on garde le côté positif
      const axe = p.os === 'radius' ? new V3(1, 0, 0) : new V3(0, 0, 1), ang = (p.os === 'radius' ? a : pl.horizontal ? -pl.l : pl.l) * d.angulation * DEG;
      const depl = new V3(...pl.ax).multiplyScalar(-d.raccourcissement).add(new V3(...pl.perp).multiplyScalar(d.decalage));
      const Tf = trans(depl.toArray()).multiply(trans(c)).multiply(new M4().makeRotationAxis(axe, ang)).multiply(trans(c.map(x => -x)));
      f.matrix.copy(Tf).multiply(m0); f.matrixWorldNeedsUpdate = true; m.parent.add(f); etat.clones.push(f);
      const col = new THREE.Color(0xff6a3d); f.material.emissive = col; f.material.emissiveIntensity = 0.35; anat.teinterMesh(m, [1, 0.4, 0.2]);
    }
    anat.cadrer([index.parId.get(pl.id)]); anat.orienter(a > 0 ? 0 : Math.PI, 0.1);
    return { mesure: 'Fracture simulée : fragment distal raccourci de ' + Math.round(p.deplacement.raccourcissement * 1000) + ' millimètres, décalé de ' + Math.round(p.deplacement.decalage * 1000) + ' millimètres et incliné de ' + p.deplacement.angulation + ' degrés (valeurs illustratives).' };
  }

  const api = {
    liste: () => PATHOLOGIES.map(p => ({ id: p.id, nom: p.nom, categorie: p.categorie, parametre: p.parametre || null })),
    etat,
    async afficher(texteOuId, params = {}) {
      const p = PATHOLOGIES.find(x => x.id === texteOuId) || trouverPathologie(texteOuId); if (!p) return { ok: false, erreur: 'je ne connais pas ce cas' };
      reinitialiser(); etat.actif = p; etat.params = params; let r;
      if (p.id === 'scoliose') r = await scolioseOuCyphose(p, params, false); else if (p.id === 'cyphose') r = await scolioseOuCyphose(p, params, true);
      else if (p.categorie === 'amputation') r = await amputation(p, params); else if (p.categorie === 'déficience congénitale') r = await deficience(p);
      else if (p.categorie === 'fracture') r = await fracture(p); else r = await pose(p);
      if (r.erreur) return { ok: false, erreur: r.erreur };
      return { ok: true, pathologie: p, mesure: r.mesure || null, cobb: r.cobb, texte: descriptionParleePatho(p, r.mesure) };
    },
    arreter() { if (!etat.actif) return false; reinitialiser(); return true; },
    detail: () => ({ actif: etat.actif && etat.actif.id, cachees: etat.cacheParNous.size, fragments: etat.clones.length, spine: etat.spine.size, lignesCobb: !!etat.lignes })
  };
  return api;
}
