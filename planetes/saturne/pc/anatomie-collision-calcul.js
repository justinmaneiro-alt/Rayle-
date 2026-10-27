/* ═════════════ ANATOMIE : COLLISIONS OS-OS (module pur, tests et calibration) ═════════════
   Mesure l'ENFONCEMENT d'un point d'un os dans la surface d'un autre os : distance au triangle le plus proche (pointe-triangle exacte) et signe donné par la normale de ce triangle
   (orientée vers l'extérieur d'après les normales de sommets). Les triangles sont rangés dans une grille spatiale (cases de 2 cm). Sert à calibrer les pivots articulaires
   (outils/calibrer-pivots.mjs) et à mesurer les pénétrations pendant les mouvements (tests/mouvements2-geometrie-test.mjs). Aucune dépendance au navigateur. */
const CASE = 0.02;
const cle = (i, j, k) => ((i + 256) * 512 + (j + 256)) * 512 + (k + 256);

/* maillage : { P: Float32Array sommets (repère du modèle), N: Float32Array normales, I: Uint32Array indices, seg: index de segment } */
export function normalesFaces(m) {
  const nT = m.I.length / 3, F = new Float32Array(3 * nT);
  for (let t = 0; t < nT; t++) {
    const a = m.I[3 * t], b = m.I[3 * t + 1], c = m.I[3 * t + 2];
    const ux = m.P[3 * b] - m.P[3 * a], uy = m.P[3 * b + 1] - m.P[3 * a + 1], uz = m.P[3 * b + 2] - m.P[3 * a + 2], vx = m.P[3 * c] - m.P[3 * a], vy = m.P[3 * c + 1] - m.P[3 * a + 1], vz = m.P[3 * c + 2] - m.P[3 * a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    const sx = m.N[3 * a] + m.N[3 * b] + m.N[3 * c], sy = m.N[3 * a + 1] + m.N[3 * b + 1] + m.N[3 * c + 1], sz = m.N[3 * a + 2] + m.N[3 * b + 2] + m.N[3 * c + 2];
    if (nx * sx + ny * sy + nz * sz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    F[3 * t] = nx; F[3 * t + 1] = ny; F[3 * t + 2] = nz;
  }
  return F;
}
/* Grille de triangles de plusieurs maillages déjà posés (positions finales). meshes : liste de { P, I, F (normales de faces), seg }. */
export function grilleTriangles(meshes) {
  const cases = new Map(), tris = [];
  for (const m of meshes) {
    const nT = m.I.length / 3;
    for (let t = 0; t < nT; t++) {
      const a = m.I[3 * t], b = m.I[3 * t + 1], c = m.I[3 * t + 2], id = tris.length;
      tris.push({ m, t, a, b, c });
      let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
      for (const v of [a, b, c]) { const x = m.P[3 * v], y = m.P[3 * v + 1], z = m.P[3 * v + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      for (let i = Math.floor(x0 / CASE); i <= Math.floor(x1 / CASE); i++) for (let j = Math.floor(y0 / CASE); j <= Math.floor(y1 / CASE); j++) for (let k = Math.floor(z0 / CASE); k <= Math.floor(z1 / CASE); k++) { const c2 = cle(i, j, k); let l = cases.get(c2); if (!l) cases.set(c2, l = []); l.push(id); }
    }
  }
  return { cases, tris };
}
/* Point le plus proche de p sur le triangle (a, b, c) : rend [x, y, z] (algorithme de Ericson, « Real-Time Collision Detection »). */
function pointTriangle(p, a, b, c, out) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2], acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2], apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; return out; }
  const bpx = p[0] - b[0], bpy = p[1] - b[1], bpz = p[2] - b[2], d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { out[0] = b[0]; out[1] = b[1]; out[2] = b[2]; return out; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); out[0] = a[0] + v * abx; out[1] = a[1] + v * aby; out[2] = a[2] + v * abz; return out; }
  const cpx = p[0] - c[0], cpy = p[1] - c[1], cpz = p[2] - c[2], d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return out; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); out[0] = a[0] + w * acx; out[1] = a[1] + w * acy; out[2] = a[2] + w * acz; return out; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); out[0] = b[0] + w * (c[0] - b[0]); out[1] = b[1] + w * (c[1] - b[1]); out[2] = b[2] + w * (c[2] - b[2]); return out; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; out[0] = a[0] + abx * v + acx * w; out[1] = a[1] + aby * v + acy * w; out[2] = a[2] + abz * v + acz * w; return out;
}
/* Enfoncement du point p (appartenant au segment `seg`) dans les triangles des AUTRES segments : profondeur (m, 0 si dehors) et triangle responsable. rayon : portée de la recherche (2 cm). */
export function enfoncement(grille, p, seg, rayon = 0.02) {
  const ci = Math.floor(p[0] / CASE), cj = Math.floor(p[1] / CASE), ck = Math.floor(p[2] / CASE), r = Math.max(1, Math.ceil(rayon / CASE)), vus = new Set(), q = [0, 0, 0], A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0];
  let meilleur = null, dmin = rayon;
  for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) for (let k = ck - r; k <= ck + r; k++) {
    const l = grille.cases.get(cle(i, j, k)); if (!l) continue;
    for (const id of l) {
      if (vus.has(id)) continue; vus.add(id); const T = grille.tris[id]; if (T.m.seg === seg) continue; const P = T.m.P;
      A[0] = P[3 * T.a]; A[1] = P[3 * T.a + 1]; A[2] = P[3 * T.a + 2]; B[0] = P[3 * T.b]; B[1] = P[3 * T.b + 1]; B[2] = P[3 * T.b + 2]; C[0] = P[3 * T.c]; C[1] = P[3 * T.c + 1]; C[2] = P[3 * T.c + 2];
      pointTriangle(p, A, B, C, q); const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (d < dmin) { dmin = d; meilleur = { T, q: [q[0], q[1], q[2]] }; }
    }
  }
  if (!meilleur) return { profondeur: 0, d: rayon, triangle: null };
  /* signe : normale lissée (interpolation des normales de sommets au point le plus proche) : plus fiable que la normale de la face près des arêtes et des sommets convexes */
  const T = meilleur.T, m = T.m, a = T.a, b = T.b, c = T.c, qx = meilleur.q[0], qy = meilleur.q[1], qz = meilleur.q[2];
  const v0x = m.P[3 * b] - m.P[3 * a], v0y = m.P[3 * b + 1] - m.P[3 * a + 1], v0z = m.P[3 * b + 2] - m.P[3 * a + 2], v1x = m.P[3 * c] - m.P[3 * a], v1y = m.P[3 * c + 1] - m.P[3 * a + 1], v1z = m.P[3 * c + 2] - m.P[3 * a + 2], v2x = qx - m.P[3 * a], v2y = qy - m.P[3 * a + 1], v2z = qz - m.P[3 * a + 2];
  const d00 = v0x * v0x + v0y * v0y + v0z * v0z, d01 = v0x * v1x + v0y * v1y + v0z * v1z, d11 = v1x * v1x + v1y * v1y + v1z * v1z, d20 = v2x * v0x + v2y * v0y + v2z * v0z, d21 = v2x * v1x + v2y * v1y + v2z * v1z, den = d00 * d11 - d01 * d01 || 1;
  const wb = (d11 * d20 - d01 * d21) / den, wc = (d00 * d21 - d01 * d20) / den, wa = 1 - wb - wc;
  let nx = wa * m.N[3 * a] + wb * m.N[3 * b] + wc * m.N[3 * c], ny = wa * m.N[3 * a + 1] + wb * m.N[3 * b + 1] + wc * m.N[3 * c + 1], nz = wa * m.N[3 * a + 2] + wb * m.N[3 * b + 2] + wc * m.N[3 * c + 2]; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
  const dn = (p[0] - qx) * nx + (p[1] - qy) * ny + (p[2] - qz) * nz;
  return { profondeur: dn < 0 ? -dn : 0, d: dmin, triangle: T };
}
