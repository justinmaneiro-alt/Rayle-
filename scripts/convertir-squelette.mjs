// Convertit le squelette OBJ « Human Skeleton 3D Model » (Armen Barsegyan, CC0, https://cgicoffee.com/blog/2017/10/free-human-skeleton-3d-model)
// en un seul GLB aux nœuds nommés, dans le repère de Raylé (mètres, y vers le haut, face vers +z, pieds à y = 0, côté GAUCHE du patient en x > 0).
//   node scripts/convertir-squelette.mjs <human_skeleton.obj> [sortie.glb]
// Ce que fait le script :
//   - échelle 0,1 (le modèle mesure 17,5 unités pour 1,75 m), normales lissées recalculées, aucune texture ni UV (Raylé applique ses propres matériaux) ;
//   - sépare les objets qui regroupent les deux côtés (côtes, clavicules) selon le signe de x ;
//   - découpe les mains et les pieds en composantes connexes, puis classe ces composantes en carpe / métacarpiens / phalanges et talus / calcanéus / tarse / métatarsiens / phalanges ;
//   - découpe les 23 disques intervertébraux ; écarte le doublon « l02 » (copie décalée de L1) et la face parasite « jaw0 » ;
//   - écrit les nœuds avec les noms attendus par js/anatomie/correspondance-squelette.js.
import fs from 'node:fs';

const [, , entree, sortie = 'ui/assets/anatomie/squelette-cc0.glb'] = process.argv;
if (!entree) { console.error('usage : node scripts/convertir-squelette.mjs <human_skeleton.obj> [sortie.glb]'); process.exit(1); }
const ECHELLE = 0.1;

// ───────── lecture de l'OBJ ─────────
const V = [], G = {}; let g = '';
for (const l of fs.readFileSync(entree, 'utf8').split('\n')) {
  if (l.startsWith('g ')) { g = l.slice(2).trim(); G[g] = G[g] || []; }
  else if (l.startsWith('v ')) V.push(l.split(/\s+/).slice(1, 4).map(n => +n * ECHELLE));
  else if (l.startsWith('f ')) { const t = l.trim().split(/\s+/).slice(1).map(x => parseInt(x) - 1); for (let i = 1; i + 1 < t.length; i++) G[g].push([t[0], t[i], t[i + 1]]); }
}
const centre = t => [0, 1, 2].map(k => (V[t[0]][k] + V[t[1]][k] + V[t[2]][k]) / 3);
const boite = tris => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const t of tris) for (const i of t) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], V[i][k]); mx[k] = Math.max(mx[k], V[i][k]); } return { mn, mx, c: mn.map((x, k) => (x + mx[k]) / 2), d: mx.map((x, k) => x - mn[k]), n: tris.length }; };
const cle = i => V[i].map(x => Math.round(x * 1e5)).join(',');
function composantes(tris) {                       // sommets confondus par position → composantes connexes
  const id = new Map(), par = []; const f = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const vid = i => { const k = cle(i); if (!id.has(k)) { id.set(k, par.length); par.push(par.length); } return id.get(k); };
  for (const t of tris) { const a = vid(t[0]), b = vid(t[1]), c = vid(t[2]); par[f(a)] = f(b); par[f(b)] = f(c); }
  const m = new Map(); for (const t of tris) { const r = f(vid(t[0])); if (!m.has(r)) m.set(r, []); m.get(r).push(t); }
  return [...m.values()];
}
const cote = (tris, nom) => ({ [nom + '_G']: tris.filter(t => centre(t)[0] > 0), [nom + '_D']: tris.filter(t => centre(t)[0] <= 0) });

// ───────── nœuds ─────────
const N = {};
const ajoute = (nom, tris) => { if (!tris.length) throw new Error('nœud vide : ' + nom); N[nom] = tris; };
const direct = {
  crane: 'skull01', dents_sup: 'teeth', mandibule: 'jaw1', dents_inf: 'jteeth01', sacrum: 'sacrum02', coccyx: 'coccyx', sternum: 'sternum01', cartilages_sternaux: 'Sterum_cartilage', symphyse_pubienne: 'sympubis01',
  scapula_G: 'scapula01', scapula_D: 'scapula02', humerus_G: 'lhumorus', humerus_D: 'rhumorus', radius_G: 'lradius', radius_D: 'rradius', ulna_G: 'lulna', ulna_D: 'rulna',
  os_coxal_G: 'oscoxael', os_coxal_D: 'oscoxaer', femur_G: 'lfemur', femur_D: 'rfemur', patella_G: 'lpatella', patella_D: 'rpatella', tibia_G: 'ltibia', tibia_D: 'rtibia', fibula_G: 'lfibula', fibula_D: 'rfibula'
};
for (const [n, o] of Object.entries(direct)) ajoute(n, G[o]);
const vert = { C1: 'atlas', C2: 'axis', C3: 'c3', C4: 'c4', C5: 'c5', C6: 'c6', C7: 'c7', T1: 't02', L1: 'l1', L2: 'l2', L3: 'l3', L4: 'l4', L5: 'l5' };
for (let i = 2; i <= 12; i++) vert['T' + i] = 't' + i;
for (const [n, o] of Object.entries(vert)) ajoute('vertebre_' + n, G[o]);
for (let i = 1; i <= 12; i++) for (const [n, t] of Object.entries(cote(G['rib' + i], 'cote_' + i))) ajoute(n, t);
for (const [n, t] of Object.entries(cote(G.clavical01, 'clavicule'))) ajoute(n, t);

// disques : 23 composantes, du bas (L5-S1) vers le haut (C2-C3)
{
  const NOMS = ['L5S1', 'L4L5', 'L3L4', 'L2L3', 'L1L2', 'T12L1', 'T11T12', 'T10T11', 'T9T10', 'T8T9', 'T7T8', 'T6T7', 'T5T6', 'T4T5', 'T3T4', 'T2T3', 'T1T2', 'C7T1', 'C6C7', 'C5C6', 'C4C5', 'C3C4', 'C2C3'];
  const cs = composantes(G.disks).sort((a, b) => boite(a).c[1] - boite(b).c[1]);
  if (cs.length !== NOMS.length) throw new Error('disques : ' + cs.length + ' composantes au lieu de ' + NOMS.length);
  cs.forEach((t, i) => ajoute('disque_' + NOMS[i], t));
}

// main : carpe (en haut) ; le pouce et les 4 doigts sont d'un seul tenant, coupés en métacarpien (partie haute) et phalanges
function main(tris, c) {
  const comp = composantes(tris).map(t => ({ t, b: boite(t) }));
  const carpe = comp.filter(o => o.b.c[1] > .85).map(o => o.t);
  const rayons = comp.filter(o => !carpe.includes(o.t));
  if (carpe.length < 1 || rayons.length !== 5) throw new Error('main ' + c + ' : carpe ' + carpe.length + ', rayons ' + rayons.length);
  const meta = [], phal = [];
  for (const r of rayons) {
    const y0 = r.b.mn[1], y1 = r.b.mx[1], pouce = r.b.d[1] < .1, coupe = y1 - (y1 - y0) * (pouce ? .5 : .46);   // les doigts descendent : le métacarpien est la partie haute
    for (const t of r.t) (centre(t)[1] >= coupe ? meta : phal).push(t);
  }
  ajoute('carpe_' + c, [].concat(...carpe)); ajoute('metacarpiens_' + c, meta); ajoute('phalanges_main_' + c, phal);
}
main(G.lhand, 'G'); main(G.rhand, 'D');

// pied : talus (haut, en arrière), calcanéus (bas, tout en arrière), tarse antérieur (3 pièces), 5 rayons métatarsien + phalanges
function pied(tris, c) {
  const comp = composantes(tris).map(t => ({ t, b: boite(t) }));
  const rayons = comp.filter(o => o.b.d[2] > .1).sort((a, b) => Math.abs(a.b.c[0]) - Math.abs(b.b.c[0]));      // les plus longs (selon z) : rayons ; le premier = hallux (le plus médial)
  const cinq = rayons.filter(o => o.b.mx[2] > .09);
  const autres = comp.filter(o => !cinq.includes(o));
  if (cinq.length !== 5) throw new Error('pied ' + c + ' : rayons ' + cinq.length);
  const arriere = autres.slice().sort((a, b) => a.b.c[2] - b.b.c[2]);
  const calcaneus = arriere.filter(o => o.b.d[2] > .05).sort((a, b) => b.b.d[2] - a.b.d[2])[0];
  const talus = autres.filter(o => o !== calcaneus).sort((a, b) => a.b.c[2] - b.b.c[2]).sort((a, b) => b.b.c[1] - a.b.c[1])[0];
  const tarse = autres.filter(o => o !== calcaneus && o !== talus);
  ajoute('talus_' + c, talus.t); ajoute('calcaneus_' + c, calcaneus.t); ajoute('tarse_' + c, [].concat(...tarse.map(o => o.t)));
  const meta = [], phal = [];
  cinq.forEach((r, i) => {
    const z0 = r.b.mn[2], z1 = r.b.mx[2], coupe = z0 + (z1 - z0) * (i === 0 ? .56 : .62);
    for (const t of r.t) (centre(t)[2] <= coupe ? meta : phal).push(t);
  });
  ajoute('metatarsiens_' + c, meta); ajoute('phalanges_pied_' + c, phal);
}
pied(G.lfoot, 'G'); pied(G.rfoot, 'D');

// ───────── écriture du GLB (positions + normales lissées + indices, un maillage par nœud) ─────────
const bin = []; let off = 0; const vues = [], acc = [], meshes = [], noeuds = [];
const pousse = (buf, cible) => { const pad = (4 - (buf.byteLength % 4)) % 4; const b = Buffer.concat([Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength), Buffer.alloc(pad)]); vues.push({ buffer: 0, byteOffset: off, byteLength: buf.byteLength, target: cible }); bin.push(b); off += b.length; return vues.length - 1; };
let totalSommets = 0, totalTris = 0;
for (const [nom, tris] of Object.entries(N)) {
  const id = new Map(), pos = [], idx = [];
  for (const t of tris) for (const i of t) { const k = cle(i); if (!id.has(k)) { id.set(k, pos.length / 3); pos.push(...V[i]); } idx.push(id.get(k)); }
  const nor = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]], p = j => [pos[3 * j], pos[3 * j + 1], pos[3 * j + 2]];
    const A = p(a), B = p(b), C = p(c), u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];      // pondérée par l'aire
    for (const j of [a, b, c]) for (let k = 0; k < 3; k++) nor[3 * j + k] += n[k];
  }
  for (let j = 0; j < nor.length; j += 3) { const l = Math.hypot(nor[j], nor[j + 1], nor[j + 2]) || 1; nor[j] /= l; nor[j + 1] /= l; nor[j + 2] /= l; }
  const P = new Float32Array(pos), I = pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let j = 0; j < P.length; j += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[j + k]); mx[k] = Math.max(mx[k], P[j + k]); }
  const vp = pousse(P, 34962), vn = pousse(nor, 34962), vi = pousse(I, 34963);
  acc.push({ bufferView: vp, componentType: 5126, count: P.length / 3, type: 'VEC3', min: mn, max: mx }); const ap = acc.length - 1;
  acc.push({ bufferView: vn, componentType: 5126, count: nor.length / 3, type: 'VEC3' }); const an = acc.length - 1;
  acc.push({ bufferView: vi, componentType: I instanceof Uint32Array ? 5125 : 5123, count: I.length, type: 'SCALAR' }); const ai = acc.length - 1;
  meshes.push({ name: nom, primitives: [{ attributes: { POSITION: ap, NORMAL: an }, indices: ai, mode: 4 }] }); noeuds.push({ name: nom, mesh: meshes.length - 1 });
  totalSommets += P.length / 3; totalTris += idx.length / 3;
}
const json = { asset: { version: '2.0', generator: 'Rayle scripts/convertir-squelette.mjs', copyright: 'Armen Barsegyan, CC0 1.0 (domaine public) : https://cgicoffee.com/blog/2017/10/free-human-skeleton-3d-model' },
  scene: 0, scenes: [{ name: 'squelette', nodes: noeuds.map((_, i) => i) }], nodes: noeuds, meshes, accessors: acc, bufferViews: vues, buffers: [{ byteLength: off }] };
let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const corps = Buffer.concat(bin), entete = Buffer.alloc(12), c1 = Buffer.alloc(8), c2 = Buffer.alloc(8);
entete.writeUInt32LE(0x46546c67, 0); entete.writeUInt32LE(2, 4); entete.writeUInt32LE(12 + 8 + js.length + 8 + corps.length, 8);
c1.writeUInt32LE(js.length, 0); c1.writeUInt32LE(0x4e4f534a, 4); c2.writeUInt32LE(corps.length, 0); c2.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(sortie, Buffer.concat([entete, c1, js, c2, corps]));
console.log(Object.keys(N).length + ' nœuds, ' + totalSommets + ' sommets, ' + totalTris + ' triangles → ' + sortie + ' (' + (fs.statSync(sortie).size / 1024).toFixed(0) + ' Ko)');
