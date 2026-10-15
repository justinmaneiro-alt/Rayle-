// Tracé des nerfs périphériques : BodyParts3D n'a pas de nerfs périphériques ; leur trajet est reconstitué d'après les descriptions de Gray's Anatomy (1918, domaine public) et placé sur les
// structures réelles du modèle (os, muscles, artères de BodyParts3D) : un nerf compagnon d'une artère suit le tracé de cette artère (nerf médian et artère brachiale, nerf fémoral et artère
// fémorale…), un nerf qui passe contre un os prend un point de cet os. Le résultat est un TRACÉ SCHÉMATIQUE (tube de rayon constant), pas une mesure : il est signalé comme tel dans les fiches.
//
// Langage des points (côté gauche ; « {c} » devient left / right dans les noms de concepts, et le décalage en x change de signe à droite) :
//   ['c', concept, [dx, dy, dz]]                  barycentre des sommets du concept + décalage (m)
//   ['x', concept, 'x'|'y'|'z', 'min'|'max', [dx, dy, dz]]   sommet extrême du concept dans la direction donnée + décalage
//   ['l', concept, t0, t1, [dx, dy, dz], n]       n points sur l'axe central du concept (artère, muscle allongé) entre les fractions t0 et t1, orienté pour prolonger le tracé
//   ['p', x, y, z]                                point littéral (repère de BodyParts3D, mètres)
export { NERFS_TRACES } from './traces-nerfs-donnees.mjs';

/** Lecture d'un point du langage ci-dessus → [x, y, z] ou liste de points ; `depuis` : point précédent (orientation des axes centraux) */
export function evaluer(bp, pt, cote, depuis) {
  const sg = cote === 'D' ? -1 : 1, c = cote === 'D' ? 'right' : 'left', off = o => [(o ? o[0] : 0) * sg, o ? o[1] : 0, o ? o[2] : 0];
  const concept = s => s.replace('{c}', c), maillage = nom => { const m = bp.maillage(concept(nom)); if (!m) throw new Error('concept absent : ' + concept(nom)); return m; };
  const kind = pt[0];
  if (kind === 'p') return [[pt[1] * sg, pt[2], pt[3]]];
  if (kind === 'c') { const m = maillage(pt[1]), n = m.pos.length / 3, s = [0, 0, 0]; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) s[k] += m.pos[3 * i + k] / n; const o = off(pt[2]); return [[s[0] + o[0], s[1] + o[1], s[2] + o[2]]]; }
  if (kind === 'x') {
    const m = maillage(pt[1]), ax = { x: 0, y: 1, z: 2 }[pt[2]], max = pt[3] === 'max', n = m.pos.length / 3; let b = 0, bv = max ? -1e9 : 1e9;
    for (let i = 0; i < n; i++) { const v = m.pos[3 * i + ax]; if (max ? v > bv : v < bv) { bv = v; b = i; } }
    const o = off(pt[4]); return [[m.pos[3 * b] + o[0], m.pos[3 * b + 1] + o[1], m.pos[3 * b + 2] + o[2]]];
  }
  if (kind === 'l') {
    const ligne = axeCentral(maillage(pt[1])), o = off(pt[4]), [t0, t1, n] = [pt[2], pt[3], pt[5] || 4];
    let L = ligne; if (depuis) { const d0 = dist(depuis, L[0]), d1 = dist(depuis, L[L.length - 1]); if (d1 < d0) L = L.slice().reverse(); }
    // t0 / t1 sont des fractions de la ligne orientée ; t0 > t1 permet de parcourir à l'envers
    const pts = []; for (let k = 0; k < n; k++) { const t = n === 1 ? t0 : t0 + (t1 - t0) * k / (n - 1), p = interp(L, t); pts.push([p[0] + o[0], p[1] + o[1], p[2] + o[2]]); }
    return pts;
  }
  throw new Error('point inconnu : ' + kind);
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function interp(L, t) {
  t = Math.min(Math.max(t, 0), 1); let tot = 0; const seg = []; for (let i = 1; i < L.length; i++) { const d = dist(L[i - 1], L[i]); seg.push(d); tot += d; }
  let r = t * tot; for (let i = 0; i < seg.length; i++) { if (r <= seg[i] || i === seg.length - 1) { const u = seg[i] ? Math.min(r / seg[i], 1) : 0; return [0, 1, 2].map(k => L[i][k] + (L[i + 1][k] - L[i][k]) * u); } r -= seg[i]; }
  return L[L.length - 1];
}

/** Axe central d'un maillage allongé : sommets regroupés en tranches le long de l'axe principal (4 mm), barycentre de chaque tranche, du plus petit au plus grand paramètre */
export function axeCentral(m, pas = .004) {
  const n = m.pos.length / 3, c = [0, 0, 0]; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += m.pos[3 * i + k] / n;
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let i = 0; i < n; i++) { const x = m.pos[3 * i] - c[0], y = m.pos[3 * i + 1] - c[1], z = m.pos[3 * i + 2] - c[2]; xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z; }
  let v = [1, .7, .4]; for (let k = 0; k < 60; k++) { const w = [xx * v[0] + xy * v[1] + xz * v[2], xy * v[0] + yy * v[1] + yz * v[2], xz * v[0] + yz * v[1] + zz * v[2]], l = Math.hypot(...w) || 1; v = w.map(q => q / l); }
  const tr = new Map();
  for (let i = 0; i < n; i++) { const t = (m.pos[3 * i] - c[0]) * v[0] + (m.pos[3 * i + 1] - c[1]) * v[1] + (m.pos[3 * i + 2] - c[2]) * v[2], k = Math.floor(t / pas); let e = tr.get(k); if (!e) tr.set(k, e = [0, 0, 0, 0]); e[0] += m.pos[3 * i]; e[1] += m.pos[3 * i + 1]; e[2] += m.pos[3 * i + 2]; e[3]++; }
  return [...tr.entries()].sort((a, b) => a[0] - b[0]).map(([, e]) => [e[0] / e[3], e[1] / e[3], e[2] / e[3]]);
}

/** Courbe de Catmull-Rom centripète échantillonnée tous les `pas` mètres → liste de points */
export function lisserCourbe(P, pas = .005) {
  if (P.length < 3) return P;
  const out = [], a = .5, ext = [[2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1], 2 * P[0][2] - P[1][2]], ...P, [2 * P[P.length - 1][0] - P[P.length - 2][0], 2 * P[P.length - 1][1] - P[P.length - 2][1], 2 * P[P.length - 1][2] - P[P.length - 2][2]]];
  for (let i = 1; i + 2 < ext.length; i++) {
    const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
    const t1 = Math.pow(dist(p0, p1), a) + 1e-9, t2 = t1 + Math.pow(dist(p1, p2), a) + 1e-9, t3 = t2 + Math.pow(dist(p2, p3), a) + 1e-9, N = Math.max(2, Math.ceil(dist(p1, p2) / pas));
    for (let s = 0; s < N; s++) {
      const t = t1 + (t2 - t1) * s / N, A1 = p0.map((_, k) => (t1 - t) / t1 * p0[k] + t / t1 * p1[k]), A2 = p0.map((_, k) => (t2 - t) / (t2 - t1) * p1[k] + (t - t1) / (t2 - t1) * p2[k]), A3 = p0.map((_, k) => (t3 - t) / (t3 - t2) * p2[k] + (t - t2) / (t3 - t2) * p3[k]);
      const B1 = A1.map((_, k) => (t2 - t) / t2 * A1[k] + t / t2 * A2[k]), B2 = A1.map((_, k) => (t3 - t) / (t3 - t1) * A2[k] + (t - t1) / (t3 - t1) * A3[k]);
      out.push(B1.map((_, k) => (t2 - t) / (t2 - t1) * B1[k] + (t - t1) / (t2 - t1) * B2[k]));
    }
  }
  out.push(P[P.length - 1]); return out;
}

/** Tube de section circulaire (n côtés) le long d'une ligne, avec repère transporté parallèlement ; rayon constant r (rétrécit aux deux bouts) → { pos, idx } */
export function tube(ligne, r, n = 8) {
  const L = ligne.length, pos = [], idx = [];
  let T = [0, 0, 1], N = [1, 0, 0];
  const tang = i => { const a = ligne[Math.max(i - 1, 0)], b = ligne[Math.min(i + 1, L - 1)], d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d) || 1; return d.map(x => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], norm = a => { const l = Math.hypot(...a) || 1; return a.map(x => x / l); };
  T = tang(0); const ref = Math.abs(T[1]) < .9 ? [0, 1, 0] : [1, 0, 0]; N = norm(cross(cross(T, ref), T));
  for (let i = 0; i < L; i++) {
    const Ti = tang(i); const proj = N[0] * Ti[0] + N[1] * Ti[1] + N[2] * Ti[2]; N = norm([N[0] - proj * Ti[0], N[1] - proj * Ti[1], N[2] - proj * Ti[2]]); const Bn = cross(Ti, N);
    const u = i / (L - 1), rr = r * Math.min(1, .35 + 2.2 * Math.min(u, 1 - u));
    for (let k = 0; k < n; k++) { const a = 2 * Math.PI * k / n, ca = Math.cos(a), sa = Math.sin(a); pos.push(ligne[i][0] + rr * (ca * N[0] + sa * Bn[0]), ligne[i][1] + rr * (ca * N[1] + sa * Bn[1]), ligne[i][2] + rr * (ca * N[2] + sa * Bn[2])); }
  }
  for (let i = 0; i + 1 < L; i++) for (let k = 0; k < n; k++) { const a = i * n + k, b = i * n + (k + 1) % n, c = (i + 1) * n + k, d = (i + 1) * n + (k + 1) % n; idx.push(a, c, b, b, c, d); }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx) };
}

/** Évalue un tracé complet pour un côté → liste de { ligne, r } (une seule ligne pour la plupart des nerfs ; les plexus en ont plusieurs : racines puis tronc) */
export function tracer(bp, trace, cote) {
  return (trace.lignes || [{ pts: trace.pts }]).map(l => ({ ligne: tracerLigne(bp, l.pts, cote), r: l.r || trace.r }));
}
function tracerLigne(bp, pts, cote) {
  let P = [];
  for (const pt of pts) { const r = evaluer(bp, pt, cote, P.length ? P[P.length - 1] : null); P.push(...r); }
  // supprime les points quasi confondus
  const U = [P[0]]; for (const p of P.slice(1)) if (dist(p, U[U.length - 1]) > .004) U.push(p);
  return lisserCourbe(U, .005);
}
