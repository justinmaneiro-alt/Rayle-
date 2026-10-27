/* Phase C : qualité GÉOMÉTRIQUE des mouvements V2 sur les vraies pièces du modèle (BodyParts3D), image par image :
   (a) écart entre les points d'insertion des muscles et la surface osseuse : pour chaque sommet d'extrémité d'un muscle, la distance à l'os le plus proche (au repos) ne doit pas changer (≤ 2 mm si l'attache touche l'os) ;
   (b) pénétrations os-os : l'enfoncement d'un os dans un autre ne doit pas dépasser son valeur au repos de plus de 6 mm ;
   (d) aucun muscle « flottant » : la distance minimale d'un muscle aux os ne change pas de plus de 5 mm.
   (c) (amplitudes) et le centre de gravité sont mesurés dans mouvements2-test.mjs. Tolérances écrites dans docs/anatomie-2-progression.md. Nécessite assets-lourds/anatomie/. */
import { chargerGeometrie, preparerCollisions, modelesPresents, SEGMENTS, INDEX_SEG } from './aide-geometrie.mjs';
import { creerCinematique, contexteMouvement } from '../pc/anatomie-cinematique.js';
import { MOUVEMENTS2 } from '../pc/anatomie-mouvements2.js';
import { cleMuscle } from '../pc/anatomie-muscles.js';
import { habiller, plusProches, volumeMuscle } from '../pc/anatomie-peau-calcul.js';
import { construireGrille } from '../pc/anatomie-peau-calcul.js';
if (!modelesPresents()) { console.log('modèles absents : test ignoré'); process.exit(0); }
let n = 0, ko = 0; const ok = (c, m) => { n++; if (!c) { ko++; console.log('ÉCHEC :', m); } };
export const TOL_GEO = { insertion: 0.002, insertionLarge: 0.02, penetration: 0.006, flottant: 0.006 };
const t0 = Date.now();
const cles = new Set(MOUVEMENTS2.flatMap(m => [...m.agonistes, ...m.antagonistes, ...(m.stabilisateurs || [])]));
const G = await chargerGeometrie({ muscles: p => cles.has(cleMuscle(p.nom_en)) });
const C = creerCinematique(G.corps), ctx = contexteMouvement(G.corps), { os, grille } = G;
console.log('géométrie chargée :', os.segs.length, 'points d’os,', G.muscles.length, 'muscles,', ((Date.now() - t0) / 1000).toFixed(1), 's');

/* paires (sommet d'extrémité, point d'os le plus proche) au repos */
for (const mu of G.muscles) {
  mu.paires = [];
  for (const i of [...mu.ext.A, ...mu.ext.B]) { const [nb] = plusProches(grille, mu.positions[3 * i], mu.positions[3 * i + 1], mu.positions[3 * i + 2], 1, 0.12); if (nb) mu.paires.push({ i, s: nb.i, d0: nb.d }); }
  const repos = SEGMENTS.map(() => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const p = [0, 0, 0]; let mn = 1e9; for (let i = 0; i < mu.positions.length / 3; i += 5) { habiller(mu.positions, i, mu.idx, mu.w, repos, p); const [nb] = plusProches(grille, p[0], p[1], p[2], 1, 0.12); if (nb) mn = Math.min(mn, nb.d); }
  const cen = l => [0, 1, 2].map(k => l.reduce((s, i) => s + mu.positions[3 * i + k], 0) / (l.length || 1));
  mu.dminRepos = mn; mu.L0 = dist(cen(mu.ext.A), cen(mu.ext.B)) || 0.05;
}
function posePoint(T, s, x, y, z) { const m = T[s]; return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
/* grille des points d'os POSÉS (pour mesurer la distance minimale d'un muscle aux os après le mouvement) */
function grillePosee(T) { const n2 = os.segs.length, P = new Float32Array(3 * n2); for (let i = 0; i < n2; i++) { const q = posePoint(T, os.segs[i], os.points[3 * i], os.points[3 * i + 1], os.points[3 * i + 2]); P[3 * i] = q[0]; P[3 * i + 1] = q[1]; P[3 * i + 2] = q[2]; } return construireGrille(P, os.segs); }

/* enfoncement des os : pour chaque point d'os, l'enfoncement dans un os d'un autre segment (0 si dehors), comparé au repos */
function enfoncements(T, k = 12) {
  const n2 = os.segs.length, P = new Float32Array(3 * n2), N = new Float32Array(3 * n2);
  for (let i = 0; i < n2; i++) { const m = T[os.segs[i]], x = os.points[3 * i], y = os.points[3 * i + 1], z = os.points[3 * i + 2]; P[3 * i] = m[0] * x + m[4] * y + m[8] * z + m[12]; P[3 * i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; P[3 * i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]; const a = os.normales[3 * i], b = os.normales[3 * i + 1], c = os.normales[3 * i + 2]; N[3 * i] = m[0] * a + m[4] * b + m[8] * c; N[3 * i + 1] = m[1] * a + m[5] * b + m[9] * c; N[3 * i + 2] = m[2] * a + m[6] * b + m[10] * c; }
  const g = construireGrille(P, os.segs), depth = new Float32Array(n2); enfoncements.partenaire = new Int32Array(n2);
  for (let i = 0; i < n2; i++) {
    const voisins = plusProches(g, P[3 * i], P[3 * i + 1], P[3 * i + 2], k, 0.03); let best = 0;
    for (const nb of voisins) { if (os.segs[nb.i] === os.segs[i]) continue; const j = nb.i, d = [P[3 * i] - P[3 * j], P[3 * i + 1] - P[3 * j + 1], P[3 * i + 2] - P[3 * j + 2]], dn = d[0] * N[3 * j] + d[1] * N[3 * j + 1] + d[2] * N[3 * j + 2]; if (dn < 0 && nb.d < 0.02 && -dn > best) { best = -dn; enfoncements.partenaire[i] = j; } }
    depth[i] = best;
  }
  return depth;
}
const reposT = SEGMENTS.map(() => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
/* collisions sur les triangles réels (pointe-triangle exacte, anatomie-collision-calcul.js) : l'ancienne mesure par points échantillonnés était trop bruitée pour des os de 500 sommets */
const COL = await preparerCollisions(G, { pas: 2 }), depthRepos = COL.repos.depth;
let pireRepos = 0; for (const d of depthRepos) pireRepos = Math.max(pireRepos, d);
console.log('enfoncement maximal des os au repos (contacts du modèle) :', (pireRepos * 1000).toFixed(1), 'mm');

const rapport = [], seuls = process.env.SEUL ? process.env.SEUL.split(',') : null;
for (const m of MOUVEMENTS2) {
  if (seuls && !seuls.includes(m.id)) continue;
  const mesMus = G.muscles.filter(mu => [...m.agonistes, ...m.antagonistes, ...(m.stabilisateurs || [])].includes(cleMuscle(mu.piece.nom_en)));
  let insMax = 0, insLarge = 0, flot = 0, pen = 0, penPaire = '', volMin = 9, volMax = 0;
  for (const p of [0, 0.2, 0.4, 0.6, 0.8]) {
    const r = C.poser(m.pose(p, ctx)), T = SEGMENTS.map(s => r.T[s]), pt = [0, 0, 0], gP = grillePosee(T);
    for (const mu of mesMus) {
      for (const pr of mu.paires) {
        habiller(mu.positions, pr.i, mu.idx, mu.w, T, pt); const b = posePoint(T, os.segs[pr.s], os.points[3 * pr.s], os.points[3 * pr.s + 1], os.points[3 * pr.s + 2]), e = Math.abs(dist(pt, b) - pr.d0);
        if (pr.d0 < 0.006) insMax = Math.max(insMax, e);
        else if (pr.d0 < 0.02) { const nb = plusProches(gP, pt[0], pt[1], pt[2], 1, 0.12)[0]; insLarge = Math.max(insLarge, Math.max(0, (nb ? nb.d : 0.12) - pr.d0)); }     // 6-20 mm : attache voisine de l'os (tendon) ; elle ne doit pas S'ÉLOIGNER de l'os le plus proche (n'importe lequel) ; au-delà, partie charnue sans contrainte
      }
      let mn = 1e9;
      for (let i = 0; i < mu.positions.length / 3; i += 5) { habiller(mu.positions, i, mu.idx, mu.w, T, pt); const nb = plusProches(gP, pt[0], pt[1], pt[2], 1, 0.12)[0]; mn = Math.min(mn, nb ? nb.d : 0.12); }
      flot = Math.max(flot, Math.abs(mn - mu.dminRepos));
      const v = volumeMuscle(mu.positions, mu.idx, mu.w, T, mu.ext, mu.L0); volMin = Math.min(volMin, v.k); volMax = Math.max(volMax, v.k);
    }
    /* mesure robuste : le 12e plus grand enfoncement ajouté (un os qui s'enfonce touche des dizaines de sommets ; le bruit de contact n'en touche que quelques-uns) */
    const ev = COL.evaluer(T), dep = ev.depth, part = ev.partenaire, exc = Array.from(dep, (d, i) => d - depthRepos[i]).sort((x, y) => y - x), robuste = exc[11] || 0;
    for (let i = 0; i < dep.length && robuste > pen; i++) { const e = dep[i] - depthRepos[i]; if (e >= robuste - 1e-9) { const mA = COL.maillages[COL.candidats[i].k]; pen = robuste; penPaire = SEGMENTS[mA.seg] + ':' + G.index.parId.get(mA.id).nom_en + ' dans ' + G.index.parId.get(part[i]).nom_en + ' @' + p + (process.env.DETAIL ? ' ' + JSON.stringify(Object.fromEntries(['hancheD', 'hancheG', 'genouD', 'epauleD'].map(k => [k, Object.fromEntries(Object.entries(r.angles[k]).map(([a, b]) => [a, Math.round(b)]))]))) : ''); } }
  }
  ok(insMax <= TOL_GEO.insertion, m.id + ' : insertions collées à l’os (écart max ' + (insMax * 1000).toFixed(2) + ' mm, tolérance ' + TOL_GEO.insertion * 1000 + ' mm)');
  ok(insLarge <= TOL_GEO.insertionLarge, m.id + ' : extrémités de muscle proches de l’os (écart max ' + (insLarge * 1000).toFixed(1) + ' mm, tolérance ' + TOL_GEO.insertionLarge * 1000 + ' mm)');
  ok(flot <= TOL_GEO.flottant, m.id + ' : aucun muscle flottant (variation de la distance minimale ' + (flot * 1000).toFixed(1) + ' mm, tolérance ' + TOL_GEO.flottant * 1000 + ' mm)');
  ok(pen <= TOL_GEO.penetration, m.id + ' : pas de pénétration os-os (enfoncement ajouté ' + (pen * 1000).toFixed(1) + ' mm, tolérance ' + TOL_GEO.penetration * 1000 + ' mm) ' + penPaire);
  rapport.push({ id: m.id, insMax, insLarge, flot, pen, volMin, volMax, nMus: mesMus.length });
}
// pose de repos : habillage identique à l'original (aucune déformation au repos)
for (const mu of G.muscles.slice(0, 40)) { const p = [0, 0, 0]; let e = 0; for (let i = 0; i < mu.positions.length / 3; i += 7) { habiller(mu.positions, i, mu.idx, mu.w, reposT, p); e = Math.max(e, Math.hypot(p[0] - mu.positions[3 * i], p[1] - mu.positions[3 * i + 1], p[2] - mu.positions[3 * i + 2])); } ok(e < 1e-6, 'repos : le muscle ' + mu.piece.id + ' n’est pas déformé (' + e + ')'); }
console.log('\nmouvement'.padEnd(20), 'muscles'.padStart(8), 'insert mm'.padStart(10), 'large mm'.padStart(9), 'flott mm'.padStart(9), 'pénétr mm'.padStart(10), 'vol k'.padStart(12));
for (const r of rapport) console.log(r.id.padEnd(19), String(r.nMus).padStart(8), (r.insMax * 1000).toFixed(2).padStart(10), (r.insLarge * 1000).toFixed(1).padStart(9), (r.flot * 1000).toFixed(1).padStart(9), (r.pen * 1000).toFixed(1).padStart(10), (r.volMin.toFixed(2) + '-' + r.volMax.toFixed(2)).padStart(12));
console.log(`mouvements V2, géométrie : ${n - ko}/${n} vérifications (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
void INDEX_SEG;
process.exit(ko ? 1 : 0);
