/* Aide de test : charge les VRAIES géométries du modèle (assets-lourds/anatomie) dans Node, construit les points d'os (avec normales et segment), les sommets des muscles
   (positions en repère du modèle) et leurs poids d'habillage. Sert aux mesures de qualité des mouvements (insertions des muscles, pénétrations os-os). */
import fs from 'node:fs';
import { THREE, chargerGlb, lireIndex, modelesPresents } from './aide-three.mjs';
import { creerIndex } from '../pc/anatomie-index.js';
import { construireCorps, SEGMENTS, INDEX_SEG } from '../pc/anatomie-corps.js';
import { construireGrille, poidsSommets, axePrincipal, extremites } from '../pc/anatomie-peau-calcul.js';
export { modelesPresents, SEGMENTS, INDEX_SEG };

const decoder = (geo, m) => {   // positions et normales en repère du modèle (matrice du maillage appliquée)
  const pa = geo.attributes.position, na = geo.attributes.normal, n = pa.count, P = new Float32Array(3 * n), N = na ? new Float32Array(3 * n) : null, v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m);
  for (let i = 0; i < n; i++) { v.set(pa.getX(i), pa.getY(i), pa.getZ(i)).applyMatrix4(m); P[3 * i] = v.x; P[3 * i + 1] = v.y; P[3 * i + 2] = v.z; if (N) { v.set(na.getX(i), na.getY(i), na.getZ(i)).applyMatrix3(nm).normalize(); N[3 * i] = v.x; N[3 * i + 1] = v.y; N[3 * i + 2] = v.z; } }
  return { P, N };
};
const maillages = async fichiers => { const sortie = new Map(); for (const f of fichiers) { const g = await chargerGlb(f); g.updateMatrixWorld(true); g.traverse(o => { if (o.isMesh) sortie.set(o.name, o); }); } return sortie; };

export async function chargerGeometrie({ muscles = null, echantillonOs = 4, decalages = undefined } = {}) {
  const index = creerIndex(lireIndex());
  const fichiersOs = [...new Set(index.deSysteme('os').map(p => p.fichier))], mOs = await maillages(fichiersOs);
  const pointsOs = id => { const m = mOs.get(id); return m ? decoder(m.geometry, m.matrixWorld).P : null; };
  const corps = construireCorps(index, { pointsOs, ...(decalages === undefined ? {} : { decalages }) });
  const pts = [], nor = [], segs = [], pieceDe = [];
  for (const p of index.deSysteme('os')) {
    const seg = corps.segmentOs[p.id], mesh = mOs.get(p.id); if (!seg || !mesh) continue;
    const { P, N } = decoder(mesh.geometry, mesh.matrixWorld); const n = P.length / 3;
    for (let i = 0; i < n; i += echantillonOs) { pts.push(P[3 * i], P[3 * i + 1], P[3 * i + 2]); nor.push(N[3 * i], N[3 * i + 1], N[3 * i + 2]); segs.push(INDEX_SEG[seg]); pieceDe.push(p.id); }
  }
  const os = { points: Float32Array.from(pts), normales: Float32Array.from(nor), segs: Uint8Array.from(segs), pieceDe };
  const grille = construireGrille(os.points, os.segs);
  let mus = null;
  if (muscles) {
    const ids = index.deSysteme('muscles').filter(muscles), fichiers = [...new Set(ids.map(p => p.fichier))], mM = await maillages(fichiers); mus = [];
    for (const p of ids) {
      const mesh = mM.get(p.id); if (!mesh) continue; const { P } = decoder(mesh.geometry, mesh.matrixWorld), poids = poidsSommets(P, grille), ax = axePrincipal(P), ext = extremites(ax.t);
      mus.push({ piece: p, positions: P, ...poids, ...ax, ext });
    }
  }
  return { index, corps, os, grille, muscles: mus, maillagesOs: mOs };
}
void fs;

/* ── collisions os-os sur les triangles réels ── */
import { normalesFaces, grilleTriangles, enfoncement } from '../pc/anatomie-collision-calcul.js';
/* Prépare les maillages d'os (positions, normales, indices en repère du modèle) et les points candidats : sommets à moins de `portee` d'un os d'un autre segment AU REPOS. */
export async function preparerCollisions(G, { portee = 0.02, pas = 2 } = {}) {
  const maillages = [];
  for (const p of G.index.deSysteme('os')) {
    const seg = G.corps.segmentOs[p.id], mesh = G.maillagesOs.get(p.id); if (!seg || !mesh) continue;
    const { P, N } = decoder(mesh.geometry, mesh.matrixWorld), I = mesh.geometry.index ? Uint32Array.from(mesh.geometry.index.array) : Uint32Array.from({ length: P.length / 3 }, (_, i) => i);
    maillages.push({ id: p.id, seg: INDEX_SEG[seg], P, N, I });
  }
  const faces = m => { const F = normalesFaces(m); return F; };
  for (const m of maillages) m.F = faces(m);
  const gRepos = grilleTriangles(maillages), candidats = [];
  for (let k = 0; k < maillages.length; k++) { const m = maillages[k]; for (let v = 0; v < m.P.length / 3; v += pas) { const e = enfoncement(gRepos, [m.P[3 * v], m.P[3 * v + 1], m.P[3 * v + 2]], m.seg, portee); if (e.d < portee) candidats.push({ k, v }); } }
  const posees = (T, segments = null) => maillages.map(m => {
    if (segments && !segments.has(m.seg)) return null;
    const t = T[m.seg], n = m.P.length / 3, P = new Float32Array(3 * n), N = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) { const x = m.P[3 * i], y = m.P[3 * i + 1], z = m.P[3 * i + 2], a = m.N[3 * i], b = m.N[3 * i + 1], c = m.N[3 * i + 2]; P[3 * i] = t[0] * x + t[4] * y + t[8] * z + t[12]; P[3 * i + 1] = t[1] * x + t[5] * y + t[9] * z + t[13]; P[3 * i + 2] = t[2] * x + t[6] * y + t[10] * z + t[14]; N[3 * i] = t[0] * a + t[4] * b + t[8] * c; N[3 * i + 1] = t[1] * a + t[5] * b + t[9] * c; N[3 * i + 2] = t[2] * a + t[6] * b + t[10] * c; }
    const q = { id: m.id, seg: m.seg, P, N, I: m.I }; q.F = normalesFaces(q); return q;
  });
  const garder = q => q.filter(Boolean);
  const reposT = SEGMENTS.map(() => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  /* enfoncement de chaque point candidat pour des transformations T (tableau indexé par segment) : { depth: Float32Array, partenaire: [id de pièce] } */
  function evaluer(T, { segments = null } = {}) {
    const q = posees(T, segments), g = grilleTriangles(garder(q)), depth = new Float32Array(candidats.length), partenaire = new Array(candidats.length);
    for (let i = 0; i < candidats.length; i++) { const c = candidats[i], m = q[c.k]; if (!m) continue; const e = enfoncement(g, [m.P[3 * c.v], m.P[3 * c.v + 1], m.P[3 * c.v + 2]], m.seg, 0.02); if (e.profondeur > 0) { depth[i] = e.profondeur; partenaire[i] = e.triangle.m.id; } }
    return { depth, partenaire };
  }
  const repos = evaluer(reposT);
  return { maillages, candidats, evaluer, repos, reposT };
}
