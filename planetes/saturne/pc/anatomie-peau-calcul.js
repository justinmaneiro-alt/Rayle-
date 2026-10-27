/* ═════════════ ANATOMIE : HABILLAGE DES OS PAR PONDÉRATION AUTOMATIQUE (module pur, Phase C) ═════════════
   Les os sont des pièces rigides : chacun suit le segment du corps articulé auquel il appartient. Les muscles, ligaments, vaisseaux, nerfs et organes, eux, sont « habillés » :
   chaque sommet est rattaché aux segments osseux les plus proches par une pondération de proximité (skinning à 4 influences au plus).
   - Un sommet collé à un os (origine ou terminaison d'un muscle) prend à 99 % le segment de cet os : l'insertion est « collée » à la surface osseuse, quelle que soit la pose.
   - Près d'une articulation, deux os sont à peu près à égale distance : les poids se partagent et la matière se déforme sans déchirure.
   - Un muscle qui change de longueur est ensuite corrigé en volume (le ventre se gonfle quand le muscle se raccourcit, s'amincit quand il s'allonge : conservation approximative du volume).
   Les fonctions travaillent sur des tableaux de nombres (positions en mètres, repère du modèle) : elles servent à la fois au nuanceur (poids) et aux tests de qualité (mesure des insertions). */
const CELLULE = 0.015;                 // taille de la grille spatiale (15 mm)
const cle = (i, j, k) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);

/* Grille spatiale des points d'os : points (Float32Array x,y,z), segs (Uint8Array : index de segment de chaque point). */
export function construireGrille(points, segs) {
  const cases = new Map(), n = segs.length;
  for (let p = 0; p < n; p++) { const c = cle(Math.floor(points[3 * p] / CELLULE), Math.floor(points[3 * p + 1] / CELLULE), Math.floor(points[3 * p + 2] / CELLULE)); let l = cases.get(c); if (!l) cases.set(c, l = []); l.push(p); }
  return { cases, points, segs, n };
}
/* Les `k` points d'os les plus proches de (x, y, z) : { i: index du point, d: distance }. Recherche par couronnes de cases jusqu'à `rayonMax`. */
export function plusProches(g, x, y, z, k = 8, rayonMax = 0.12) {
  const ci = Math.floor(x / CELLULE), cj = Math.floor(y / CELLULE), ck = Math.floor(z / CELLULE), trouves = []; let r = 0;
  const maxR = Math.ceil(rayonMax / CELLULE);
  while (r <= maxR) {
    for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) for (let dk = -r; dk <= r; dk++) {
      if (Math.max(Math.abs(di), Math.abs(dj), Math.abs(dk)) !== r) continue;
      const l = g.cases.get(cle(ci + di, cj + dj, ck + dk)); if (!l) continue;
      for (const p of l) { const dx = g.points[3 * p] - x, dy = g.points[3 * p + 1] - y, dz = g.points[3 * p + 2] - z; trouves.push({ i: p, d: Math.sqrt(dx * dx + dy * dy + dz * dz) }); }
    }
    if (trouves.length >= k && r >= 1) { trouves.sort((a, b) => a.d - b.d); if (trouves[k - 1].d <= r * CELLULE) break; }
    r++;
  }
  trouves.sort((a, b) => a.d - b.d); return trouves.slice(0, k);
}

/* Poids de chaque sommet : somme, par segment, de 1 / (distance + eps)^p sur les `k` points d'os les plus proches ; on garde les 4 segments dominants, poids normalisés.
   positions : Float32Array(3 m). Rend { idx: Uint8Array(4 m), w: Float32Array(4 m), proche: Float32Array(m) (distance au point d'os le plus proche) }. */
export function poidsSommets(positions, g, { k = 6, p = 3, eps = 0.0015, defaut = 0, de = 0, a = positions.length / 3, epinglage = [0.005, 0.014] } = {}) {
  const m = a - de, idx = new Uint8Array(4 * m), w = new Float32Array(4 * m), proche = new Float32Array(m), acc = new Map();
  for (let v = 0; v < m; v++) {
    const o = 3 * (v + de), voisins = plusProches(g, positions[o], positions[o + 1], positions[o + 2], k); acc.clear();
    if (!voisins.length) { idx[4 * v] = defaut; w[4 * v] = 1; proche[v] = 1; continue; }
    proche[v] = voisins[0].d;
    for (const nb of voisins) { const s = g.segs[nb.i]; acc.set(s, (acc.get(s) || 0) + 1 / Math.pow(nb.d + eps, p)); }
    // contrainte d'insertion : un sommet qui touche (≤ 5 mm) un os est rattaché à lui seul ; la contrainte s'efface entre 5 et 14 mm
    const t = Math.max(0, Math.min(1, (voisins[0].d - epinglage[0]) / (epinglage[1] - epinglage[0]))), pin = 1 - t * t * (3 - 2 * t);
    if (pin > 0) { let tot = 0; for (const c of acc.values()) tot += c; const sn = g.segs[voisins[0].i]; for (const [s, c] of acc) acc.set(s, c / tot * (1 - pin)); acc.set(sn, (acc.get(sn) || 0) + pin); }
    const tri = [...acc.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4); let somme = 0; for (const [, c] of tri) somme += c;
    for (let j = 0; j < tri.length; j++) { idx[4 * v + j] = tri[j][0]; w[4 * v + j] = tri[j][1] / somme; }
    // écarte les influences négligeables (< 2 %) pour garder des poids nets
    let s2 = 0; for (let j = 0; j < 4; j++) { if (w[4 * v + j] < 0.02) w[4 * v + j] = 0; s2 += w[4 * v + j]; } for (let j = 0; j < 4; j++) w[4 * v + j] /= s2 || 1;
  }
  return { idx, w, proche };
}

/* Axe principal d'un nuage de points (itération de puissance sur la covariance) : centre, axe unitaire, t ∈ [0, 1] de chaque sommet le long de l'axe, rayon moyen autour de l'axe. */
export function axePrincipal(positions) {
  const n = positions.length / 3; let cx = 0, cy = 0, cz = 0; for (let i = 0; i < n; i++) { cx += positions[3 * i]; cy += positions[3 * i + 1]; cz += positions[3 * i + 2]; } cx /= n; cy /= n; cz /= n;
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let i = 0; i < n; i++) { const x = positions[3 * i] - cx, y = positions[3 * i + 1] - cy, z = positions[3 * i + 2] - cz; xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z; }
  let a = [1, 0.7, 0.3]; for (let it = 0; it < 24; it++) { const b = [xx * a[0] + xy * a[1] + xz * a[2], xy * a[0] + yy * a[1] + yz * a[2], xz * a[0] + yz * a[1] + zz * a[2]], L = Math.hypot(...b) || 1; a = [b[0] / L, b[1] / L, b[2] / L]; }
  const t = new Float32Array(n); let tMin = Infinity, tMax = -Infinity;
  for (let i = 0; i < n; i++) { const s = (positions[3 * i] - cx) * a[0] + (positions[3 * i + 1] - cy) * a[1] + (positions[3 * i + 2] - cz) * a[2]; t[i] = s; if (s < tMin) tMin = s; if (s > tMax) tMax = s; }
  const L = tMax - tMin || 1e-6; let r = 0; for (let i = 0; i < n; i++) { const s = t[i]; t[i] = (s - tMin) / L; const px = positions[3 * i] - cx - s * a[0], py = positions[3 * i + 1] - cy - s * a[1], pz = positions[3 * i + 2] - cz - s * a[2]; r += Math.sqrt(px * px + py * py + pz * pz); }
  return { centre: [cx, cy, cz], axe: a, t, longueur: L, rayon: r / n };
}
/* Sommets des deux extrémités (t < part et t > 1 - part), 40 au plus par extrémité (échantillon régulier). */
export function extremites(t, part = 0.18, max = 40) {
  const A = [], B = []; for (let i = 0; i < t.length; i++) { if (t[i] < part) A.push(i); else if (t[i] > 1 - part) B.push(i); }
  const ech = l => (l.length <= max ? l : Array.from({ length: max }, (_, j) => l[Math.floor(j * l.length / max)]));
  return { A: ech(A), B: ech(B) };
}

/* Position d'un sommet habillé : somme pondérée des transformations des segments (T : tableau de matrices 4×4 en colonnes, index = segment). */
export function habiller(positions, i, idx, w, T, sortie = [0, 0, 0]) {
  const x = positions[3 * i], y = positions[3 * i + 1], z = positions[3 * i + 2]; sortie[0] = sortie[1] = sortie[2] = 0;
  for (let j = 0; j < 4; j++) { const wj = w[4 * i + j]; if (!wj) continue; const m = T[idx[4 * i + j]]; sortie[0] += wj * (m[0] * x + m[4] * y + m[8] * z + m[12]); sortie[1] += wj * (m[1] * x + m[5] * y + m[9] * z + m[13]); sortie[2] += wj * (m[2] * x + m[6] * y + m[10] * z + m[14]); }
  return sortie;
}
/* Correction de volume d'un muscle : à partir des deux extrémités habillées, rapport de longueur s et facteur radial k = 1/√s (borné), appliqué avec un profil en sinus le long du muscle
   (nul aux attaches : elles restent collées à l'os). Rend { centre, axe, k, s } à transmettre au nuanceur. */
export function volumeMuscle(positions, idx, w, T, ext, L0, bornes = [0.8, 1.28]) {
  const moy = liste => { const c = [0, 0, 0], p = [0, 0, 0]; for (const i of liste) { habiller(positions, i, idx, w, T, p); c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return c.map(x => x / (liste.length || 1)); };
  const A = moy(ext.A), B = moy(ext.B), L = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) || 1e-6, s = L / L0, k = Math.max(bornes[0], Math.min(bornes[1], 1 / Math.sqrt(s)));
  return { centre: [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2], axe: [(B[0] - A[0]) / L, (B[1] - A[1]) / L, (B[2] - A[2]) / L], k, s };
}

/* ── centre d'une tête articulaire (fémur, humérus) : ajustement d'une sphère aux sommets (moindres carrés, itéré en ne gardant que les sommets proches de la sphère) ──
   P : Float32Array des sommets de l'os (repère du modèle), c0 : estimation grossière du centre. Rend { centre, rayon, n }.
   Équation de la sphère : |p|² = 2 p·c + k avec k = r² − |c|² (linéaire en c et k). */
export function ajusterSphere(P, c0, { rMax = 0.04, iterations = 10, rayon0 = 0.024, tolerance = 0.0025 } = {}) {
  let c = c0.slice(), r = rayon0, n = 0;
  for (let it = 0; it < iterations; it++) {
    const AtA = Array.from({ length: 4 }, () => new Float64Array(4)), Atb = new Float64Array(4); n = 0;
    for (let i = 0; i < P.length / 3; i++) {
      const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2], d = Math.hypot(x - c[0], y - c[1], z - c[2]);
      if (it === 0 ? d > rMax : Math.abs(d - r) > (it < 4 ? 2.5 * tolerance : tolerance)) continue;
      const row = [2 * x, 2 * y, 2 * z, 1], t = x * x + y * y + z * z; n++;
      for (let a = 0; a < 4; a++) { for (let b = 0; b < 4; b++) AtA[a][b] += row[a] * row[b]; Atb[a] += row[a] * t; }
    }
    if (n < 12) return { centre: c0, rayon: rayon0, n: 0 };
    const M = AtA.map((l, a) => [...l, Atb[a]]);
    for (let col = 0; col < 4; col++) {
      let piv = col; for (let l = col + 1; l < 4; l++) if (Math.abs(M[l][col]) > Math.abs(M[piv][col])) piv = l; [M[col], M[piv]] = [M[piv], M[col]];
      if (Math.abs(M[col][col]) < 1e-14) return { centre: c0, rayon: rayon0, n: 0 };
      for (let l = 0; l < 4; l++) if (l !== col) { const f = M[l][col] / M[col][col]; for (let b = col; b < 5; b++) M[l][b] -= f * M[col][b]; }
    }
    const u = [0, 1, 2, 3].map(k => M[k][4] / M[k][k]); c = [u[0], u[1], u[2]]; r = Math.sqrt(Math.max(0, u[3] + c[0] * c[0] + c[1] * c[1] + c[2] * c[2]));
    if (!Number.isFinite(r) || r < 0.012 || r > 0.05) return { centre: c0, rayon: rayon0, n: 0 };
  }
  return { centre: c, rayon: r, n };
}
