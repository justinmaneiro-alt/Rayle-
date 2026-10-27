/* ═════════════ ASTÉROÏDES : formes et répartition (génération pure, testée sous Node : galaxie/tests/asteroides-test.mjs) ═════════════
   Cinq modèles de base générés par bruit à partir d'une icosphère : patatoïde, allongé, aplati, fragment anguleux (facettes), cratères.
   Chaque modèle existe en plusieurs finesses (nombre de subdivisions) : les gros cailloux, rares et proches, sont détaillés ; les petits, très nombreux,
   restent légers. La répartition (tailles, couleurs, orbites, rotations) est aussi calculée ici. */
export const TYPES = ['patate', 'allonge', 'aplati', 'fragment', 'crateres'];
/* Finesse par niveau de qualité : subdivisions de l'icosphère pour [petits, moyens, gros]. 0→12 sommets, 1→42, 2→162, 3→642, 4→2562. */
export const FINESSES = { haute: [2, 3, 4], moyenne: [2, 2, 3], basse: [1, 2, 2] };

function aleatoire(graine) { let a = graine >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* Bruit de valeurs 3D lisse (déterministe). */
function bruit3(graine) {
  const h = (x, y, z) => { let n = (x * 374761393 + y * 668265263 + z * 2147483647 + graine * 1274126177) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const l = t => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = l(x - ix), fy = l(y - iy), fz = l(z - iz);
    const a = (dx, dy) => h(ix + dx, iy + dy, iz) * (1 - fz) + h(ix + dx, iy + dy, iz + 1) * fz;
    const m = (dx) => a(dx, 0) * (1 - fy) + a(dx, 1) * fy;
    return m(0) * (1 - fx) + m(1) * fx;
  };
}

/* Icosphère indexée de rayon 1 : `n` subdivisions. */
export function icosphere(n) {
  const t = (1 + Math.sqrt(5)) / 2;
  const P = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(p => { const l = Math.hypot(...p); return p.map(c => c / l); });
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < n; s++) {
    const milieu = new Map(), G = [];
    const mid = (a, b) => { const k = a < b ? a * 100000 + b : b * 100000 + a; let i = milieu.get(k); if (i === undefined) { const p = [(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2, (P[a][2] + P[b][2]) / 2], l = Math.hypot(...p); P.push(p.map(c => c / l)); i = P.length - 1; milieu.set(k, i); } return i; };
    for (const [a, b, c] of F) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); G.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    F = G;
  }
  return { sommets: P, faces: F };
}

/* Construit un modèle : positions déformées, normales lissées, UV, index. Le rayon moyen reste proche de 1. */
export function construireForme(type, subdivisions, graine = 1) {
  const r = aleatoire(graine * 7919 + TYPES.indexOf(type) * 104729), bruit = bruit3(graine * 31 + TYPES.indexOf(type) * 7), bruit2 = bruit3(graine * 57 + 5);
  const { sommets, faces } = icosphere(subdivisions);
  const E = { patate: [1.0, 0.82, 0.92], allonge: [1.75, 0.62, 0.7], aplati: [1.25, 0.42, 1.05], fragment: [1.15, 0.8, 0.95], crateres: [1.0, 0.88, 0.95] }[type];
  // plans de coupe (fragment : facettes anguleuses) et cratères
  const coupes = [], cratères = [];
  if (type === 'fragment') for (let i = 0; i < 9; i++) { const d = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1], l = Math.hypot(...d) || 1; coupes.push({ n: d.map(c => c / l), d: 0.62 + r() * 0.22 }); }
  if (type === 'crateres' || type === 'patate') for (let i = 0; i < (type === 'crateres' ? 7 : 2); i++) { const d = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1], l = Math.hypot(...d) || 1; cratères.push({ c: d.map(c => c / l), rayon: (type === 'crateres' ? 0.28 : 0.2) + r() * (type === 'crateres' ? 0.3 : 0.15), prof: type === 'crateres' ? 0.13 + r() * 0.08 : 0.06 + r() * 0.04 }); }
  const amplitude = { patate: 0.3, allonge: 0.26, aplati: 0.24, fragment: 0.12, crateres: 0.2 }[type], freq = type === 'fragment' ? 1.5 : 1.25;
  const N = sommets.length, pos = new Float32Array(N * 3), uv = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const [x, y, z] = sommets[i];
    let rad = 1 + amplitude * (bruit(x * freq + 3, y * freq + 3, z * freq + 3) - 0.5) * 2 + 0.07 * (bruit2(x * 4 + 9, y * 4 + 9, z * 4 + 9) - 0.5) * 2;   // grandes bosses + petites aspérités
    for (const c of cratères) {
      const ang = Math.acos(Math.max(-1, Math.min(1, x * c.c[0] + y * c.c[1] + z * c.c[2])));
      if (ang < c.rayon) rad -= c.prof * (1 - (ang / c.rayon) ** 2);                              // cuvette
      else if (ang < c.rayon * 1.25) rad += c.prof * 0.35 * Math.exp(-(((ang - c.rayon) / (c.rayon * 0.12)) ** 2));   // bourrelet
    }
    let px = x * rad * E[0], py = y * rad * E[1], pz = z * rad * E[2];
    for (const p of coupes) { const dist = px * p.n[0] + py * p.n[1] + pz * p.n[2]; if (dist > p.d) { px -= p.n[0] * (dist - p.d); py -= p.n[1] * (dist - p.d); pz -= p.n[2] * (dist - p.d); } }   // plan de coupe : facette plate
    pos[i * 3] = px; pos[i * 3 + 1] = py; pos[i * 3 + 2] = pz;
    uv[i * 2] = px * 0.5 + 0.5 + pz * 0.37; uv[i * 2 + 1] = py * 0.5 + 0.5 + pz * 0.21;   // projection sans couture
  }
  const index = new Uint16Array(faces.length * 3); faces.forEach((f, i) => { index[i * 3] = f[0]; index[i * 3 + 1] = f[1]; index[i * 3 + 2] = f[2]; });
  // normales : moyenne des faces voisines (fragment : aussi lissé, les facettes viennent de la géométrie)
  const nor = new Float32Array(N * 3);
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2], vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { nor[k * 3] += nx; nor[k * 3 + 1] += ny; nor[k * 3 + 2] += nz; }
  }
  for (let i = 0; i < N; i++) { const l = Math.hypot(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]) || 1; nor[i * 3] /= l; nor[i * 3 + 1] /= l; nor[i * 3 + 2] /= l; }
  return { pos, nor, uv, index, sommets: N, triangles: faces.length };
}

/* Répartition de la ceinture : N astéroïdes (tailles très variées, couleurs, orbites légèrement excentriques, rotations lentes). */
export const CLASSES_COULEUR = ['gris', 'brun', 'ocre', 'carbone', 'metal'];
export function repartirCeinture(N, interieur, exterieur, graine = 17) {
  const r = aleatoire(graine);
  const a = { type: new Uint8Array(N), classe: new Uint8Array(N), lod: new Uint8Array(N), taille: new Float32Array(N), echelle: new Float32Array(N * 3),
    r0: new Float32Array(N), angle: new Float32Array(N), omega: new Float32Array(N), exc: new Float32Array(N), peri: new Float32Array(N), y0: new Float32Array(N), incl: new Float32Array(N), noeud: new Float32Array(N),
    axe: new Float32Array(N * 3), vitRot: new Float32Array(N), orient: new Float32Array(N * 4), teinte: new Float32Array(N * 3) };
  const milieu = (interieur + exterieur) / 2, demi = (exterieur - interieur) / 2;
  for (let i = 0; i < N; i++) {
    a.type[i] = Math.floor(r() * TYPES.length);
    const u = r(); a.taille[i] = 0.05 + Math.pow(u, 16) * 0.4;   // beaucoup de petits, quelques gros
    const s1 = 0.8 + r() * 0.45, s2 = 0.8 + r() * 0.45, s3 = 0.8 + r() * 0.45;
    a.echelle[i * 3] = a.taille[i] * s1; a.echelle[i * 3 + 1] = a.taille[i] * s2; a.echelle[i * 3 + 2] = a.taille[i] * s3;
    const m = (r() + r() + r() - 1.5) / 1.5;   // plutôt au milieu de la ceinture
    a.r0[i] = milieu + demi * Math.max(-1, Math.min(1, m)) * 1.05;
    a.angle[i] = r() * Math.PI * 2; a.omega[i] = 0.012 * Math.pow(milieu / a.r0[i], 1.5) * (0.92 + r() * 0.16);
    a.exc[i] = r() * 0.045; a.peri[i] = r() * Math.PI * 2;                                  // légère variation d'orbite
    a.y0[i] = (r() - 0.5) * 1.6 * (0.4 + r()); a.incl[i] = r() * 0.03; a.noeud[i] = r() * Math.PI * 2;
    const ax = r() * 2 - 1, ay = r() * 2 - 1, az = r() * 2 - 1, la = Math.hypot(ax, ay, az) || 1; a.axe[i * 3] = ax / la; a.axe[i * 3 + 1] = ay / la; a.axe[i * 3 + 2] = az / la;
    a.vitRot[i] = (0.03 + r() * r() * 0.5) * (r() < 0.5 ? -1 : 1);                          // rotation lente, aléatoire sur chacun
    // orientation initiale aléatoire (quaternion)
    const q = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1], lq = Math.hypot(...q) || 1; for (let k = 0; k < 4; k++) a.orient[i * 4 + k] = q[k] / lq;
    // couleur : gris, brun, ocre, noir carbone, quelques fragments métalliques
    const c = r(), metallique = (TYPES[a.type[i]] === 'allonge' || TYPES[a.type[i]] === 'fragment') && r() < 0.12;
    a.classe[i] = metallique ? 4 : c < 0.45 ? 0 : c < 0.72 ? 1 : c < 0.88 ? 2 : 3;
    const hsl = [[0.1, 0.04, 0.3 + r() * 0.2], [0.07, 0.35, 0.2 + r() * 0.14], [0.09, 0.5, 0.32 + r() * 0.16], [0.08, 0.1, 0.05 + r() * 0.05], [0.6, 0.08, 0.55 + r() * 0.12]][a.classe[i]];
    const [h, s, l] = hsl, q2 = l < 0.5 ? l * (1 + s) : l + s - l * s, p2 = 2 * l - q2;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p2 + (q2 - p2) * 6 * t : t < 1 / 2 ? q2 : t < 2 / 3 ? p2 + (q2 - p2) * (2 / 3 - t) * 6 : p2; };
    a.teinte[i * 3] = f(h + 1 / 3); a.teinte[i * 3 + 1] = f(h); a.teinte[i * 3 + 2] = f(h - 1 / 3);
  }
  // finesse selon la taille : les 4 % les plus gros sont détaillés, les 20 % suivants moyens, le reste léger
  const tri = Array.from(a.taille).sort((x, y) => x - y), s80 = tri[Math.floor(N * 0.8)], s96 = tri[Math.floor(N * 0.96)];
  for (let i = 0; i < N; i++) a.lod[i] = a.taille[i] >= s96 ? 2 : a.taille[i] >= s80 ? 1 : 0;
  return a;
}

/* Position et quaternion d'un astéroïde à l'instant t (secondes de simulation). */
export function etatAsteroide(a, i, t, sortie) {
  const ang = a.angle[i] + a.omega[i] * t;
  const rr = a.r0[i] * (1 + a.exc[i] * Math.cos(ang - a.peri[i]));
  sortie.x = Math.cos(ang) * rr; sortie.z = Math.sin(ang) * rr;
  sortie.y = a.y0[i] + rr * a.incl[i] * Math.sin(ang - a.noeud[i]);
  const h = a.vitRot[i] * t / 2, s = Math.sin(h), c = Math.cos(h), ax = a.axe[i * 3], ay = a.axe[i * 3 + 1], az = a.axe[i * 3 + 2];
  const rx = ax * s, ry = ay * s, rz = az * s, rw = c, ox = a.orient[i * 4], oy = a.orient[i * 4 + 1], oz = a.orient[i * 4 + 2], ow = a.orient[i * 4 + 3];
  sortie.qx = rw * ox + rx * ow + ry * oz - rz * oy; sortie.qy = rw * oy - rx * oz + ry * ow + rz * ox; sortie.qz = rw * oz + rx * oy - ry * ox + rz * ow; sortie.qw = rw * ow - rx * ox - ry * oy - rz * oz;
  return sortie;
}
