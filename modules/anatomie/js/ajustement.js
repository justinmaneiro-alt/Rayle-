/* ═════════════ AJUSTEMENT D'UN MODÈLE GLB SUR LA FORME SCHÉMATIQUE D'UN OS ═════════════
   Les muscles, nerfs, repères palpables et appareillages de l'application sont placés par rapport aux formes schématiques ; un squelette réaliste, lui, a ses propres
   proportions. Pour que tout reste cohérent (un muscle s'insère sur l'os qu'on voit), chaque os du GLB est recalé sur la forme schématique qu'il remplace :
     'boite' : même centre, taille uniforme déduite de la diagonale des boîtes englobantes ;
     'axe'   : os long ; l'axe principal (analyse en composantes principales) du modèle est aligné sur celui de la forme schématique, la longueur est adaptée, l'extrémité
               proximale reste proximale : les articulations (hanche, genou, épaule, coude…) restent là où l'application les attend ;
     'aucun' : le modèle est laissé tel quel.
   Fonctions pures (three.js passé en argument), testées sans navigateur. */

/** Points (au plus ~3000) des sommets de tous les maillages sous obj, dans le repère du monde */
export function points(THREE, obj, maxi = 3000) {
  obj.updateWorldMatrix(true, true);
  const brut = [];
  obj.traverse(o => {
    const p = o.isMesh && o.geometry && o.geometry.attributes.position; if (!p || !p.count) return;
    const pas = Math.max(1, Math.floor(p.count / 1500));
    for (let i = 0; i < p.count; i += pas) brut.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
  });
  if (brut.length <= maxi) return brut;
  const pas = brut.length / maxi; return Array.from({ length: maxi }, (_, i) => brut[Math.floor(i * pas)]);
}

const centre = pts => pts.reduce((s, p) => s.add(p), new pts[0].constructor()).multiplyScalar(1 / pts.length);

/** Axe principal d'un nuage de points : vecteur unitaire, centre, étendue [min, max] le long de l'axe, ou null si le nuage est dégénéré */
export function axePrincipal(THREE, pts) {
  if (pts.length < 4) return null;
  const c = centre(pts); let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of pts) { const x = p.x - c.x, y = p.y - c.y, z = p.z - c.z; xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z; }
  let v = new THREE.Vector3(1, .7, .4).normalize();                    // itération de la puissance : vecteur propre dominant de la covariance
  for (let k = 0; k < 40; k++) {
    const n = new THREE.Vector3(xx * v.x + xy * v.y + xz * v.z, xy * v.x + yy * v.y + yz * v.z, xz * v.x + yz * v.y + zz * v.z);
    const l = n.length(); if (l < 1e-18) return null; v = n.multiplyScalar(1 / l);
  }
  let mn = Infinity, mx = -Infinity; for (const p of pts) { const t = p.clone().sub(c).dot(v); if (t < mn) mn = t; if (t > mx) mx = t; }
  if (!(mx - mn > 1e-6)) return null;
  return { axe: v, centre: c, min: mn, max: mx, longueur: mx - mn };
}

/** Matrice (monde → monde) qui recale les points du modèle sur ceux de la forme schématique ; null si le mode est 'aucun' ou si le calcul est impossible */
export function matriceAjustement(THREE, ptsModele, ptsForme, mode = 'boite', bornes = [.7, 1.35]) {
  if (mode === 'aucun' || !ptsModele.length || !ptsForme.length) return null;
  const clamp = k => Math.min(Math.max(k, bornes[0]), bornes[1]);
  if (mode === 'axe') {
    const m = axePrincipal(THREE, ptsModele), f = axePrincipal(THREE, ptsForme);
    if (m && f) {
      if (m.axe.dot(f.axe) < 0) { m.axe.negate(); const a = -m.max, b = -m.min; m.min = a; m.max = b; }     // même sens : l'extrémité proximale reste proximale
      const milieuM = m.centre.clone().addScaledVector(m.axe, (m.min + m.max) / 2), milieuF = f.centre.clone().addScaledVector(f.axe, (f.min + f.max) / 2);
      const s = clamp(f.longueur / m.longueur), q = new THREE.Quaternion().setFromUnitVectors(m.axe, f.axe);
      return new THREE.Matrix4().makeTranslation(milieuF.x, milieuF.y, milieuF.z)
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeScale(s, s, s))
        .multiply(new THREE.Matrix4().makeTranslation(-milieuM.x, -milieuM.y, -milieuM.z));
    }
  }
  const bm = new THREE.Box3().setFromPoints(ptsModele), bf = new THREE.Box3().setFromPoints(ptsForme);
  const dm = bm.getSize(new THREE.Vector3()).length(), df = bf.getSize(new THREE.Vector3()).length();
  if (!(dm > 0) || !(df > 0)) return null;
  const s = clamp(df / dm), cm = bm.getCenter(new THREE.Vector3()), cf = bf.getCenter(new THREE.Vector3());
  return new THREE.Matrix4().makeTranslation(cf.x, cf.y, cf.z).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-cm.x, -cm.y, -cm.z));
}

/** Applique l'ajustement à un groupe `pack` (enfant d'un parent à matrice identité) : pack.matrix ← M · pack.matrix. Renvoie l'échelle appliquée, ou null. */
export function ajuster(THREE, pack, ptsForme, mode) {
  pack.updateMatrix(); pack.updateMatrixWorld(true);
  const M = matriceAjustement(THREE, points(THREE, pack), ptsForme, mode); if (!M) return null;
  const nouvelle = M.clone().multiply(pack.matrix);
  pack.matrixAutoUpdate = false; pack.matrix.copy(nouvelle); pack.matrixWorldNeedsUpdate = true; pack.updateMatrixWorld(true);
  return new THREE.Vector3().setFromMatrixScale(M).x;
}
