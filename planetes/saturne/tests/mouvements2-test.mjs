/* Phase C : qualité des mouvements V2 (moteur de cinématique, module pur). Mesure, image par image, sur tout le cycle de chaque mouvement :
   (c) le dépassement des amplitudes de référence (ROM, ±2° de tolérance), (d) le centre de gravité par rapport à la base d'appui (marge ≥ 0 en chaîne fermée et en appui unipodal), les pieds posés
   (cheville atteinte à moins d'1 mm de sa cible : aucun glissement), la continuité (écart maximal entre deux images voisines), la fermeture de la boucle, la cohérence des muscles.
   Les mesures de géométrie (insertions des muscles, pénétrations os-os) sont dans mouvements2-geometrie-test.mjs. Tolérances écrites dans docs/anatomie-2-progression.md. Nécessite assets-lourds/anatomie/index.json. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerIndex } from '../pc/anatomie-index.js';
import { MUSCLES, cleMuscle } from '../pc/anatomie-muscles.js';
import { construireCorps } from '../pc/anatomie-corps.js';
import { creerCinematique, contexteMouvement } from '../pc/anatomie-cinematique.js';
import { MOUVEMENTS2 } from '../pc/anatomie-mouvements2.js';
import { point } from '../pc/anatomie-mat4.js';
const chemin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets-lourds/anatomie/index.json');
if (!fs.existsSync(chemin)) { console.log('index.json absent : test ignoré'); process.exit(0); }
let n = 0, ko = 0; const ok = (c, m) => { n++; if (!c) { ko++; console.log('ÉCHEC :', m); } };
const index = creerIndex(JSON.parse(fs.readFileSync(chemin, 'utf8'))), corps = construireCorps(index), C = creerCinematique(corps), ctx = contexteMouvement(corps);

/* ── tolérances (écrites dans le journal) ── */
export const TOL = { rom: 2, pied: 0.001, marge: -0.002, bouclePos: 0.002, vitesse: { calme: { angle: 700, pos: 4 }, dynamique: { angle: 1800, pos: 14 } }, frames: 120 };   // vitesses maximales : degrés par seconde, mètres par seconde (un saut de pose entre deux images les dépasse largement)
const POINTS = ['hancheD', 'genouD', 'chevilleD', 'epauleD', 'coudeD', 'poignetD', 'hancheG', 'genouG', 'chevilleG', 'epauleG', 'coudeG', 'poignetG', 'cervicale'];
const SEG_DE = { hanche: 'cuisse', genou: 'jambe', cheville: 'pied', epaule: 'bras', coude: 'avantbras', poignet: 'main' };
const posPoints = r => POINTS.map(nom => { const b = nom.replace(/[DG]$/, ''), S = nom.slice(-1); const seg = nom === 'cervicale' ? 'tete' : SEG_DE[b] + S; return point(r.T[seg], corps.pivots[nom]); });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const rapport = [];
for (const m of MOUVEMENTS2) {
  const N = TOL.frames, dyn = m.type === 'dynamique', lim = dyn ? TOL.vitesse.dynamique : TOL.vitesse.calme, dt = m.duree / N; let prev = null, prevA = null, maxA = 0, maxP = 0, maxManque = 0, margeMin = 9, nMarge = 0, maxRom = 0;
  const hors = [], serie = [];
  for (let i = 0; i <= N; i++) {
    const r = C.poser(m.pose(i === N ? 1 - 1e-9 : i / N, ctx)); serie.push(r);
    ok(r.T.bassin.every(Number.isFinite) && Object.values(r.T).every(M => M.every(Number.isFinite)), m.id + ' : transformations finies (image ' + i + ')');
    maxManque = Math.max(maxManque, r.manque || 0);
    if (r.equilibre && r.appui.polygone.length >= 3 && !dyn) { margeMin = Math.min(margeMin, r.marge); nMarge++; }
    for (const [j, v] of Object.entries(r.angles)) { const base = j.replace(/[DG]$/, ''), rom = corps.ROM[base]; if (!rom) continue; for (const [c, x] of Object.entries(v)) { if (!rom[c]) continue; const [lo, hi] = rom[c], exc = Math.max(lo - x, x - hi, 0); maxRom = Math.max(maxRom, exc); if (exc > TOL.rom) hors.push(j + '.' + c + '=' + x.toFixed(0) + '@' + i); } }
    const P = posPoints(r); if (prev) for (let k = 0; k < P.length; k++) maxP = Math.max(maxP, dist(P[k], prev[k]));
    if (prevA) for (const j of Object.keys(r.angles)) for (const c of Object.keys(r.angles[j])) if (['fl', 'ab', 'ele', 'rot', 'rotHaut'].includes(c)) { const d = Math.abs(r.angles[j][c] - prevA[j][c]); if (Number.isFinite(d)) maxA = Math.max(maxA, d); }
    prev = P; prevA = r.angles;
  }
  ok(maxManque <= TOL.pied, m.id + ' : pieds posés atteints (manque max ' + (maxManque * 1000).toFixed(2) + ' mm, tolérance ' + TOL.pied * 1000 + ' mm)');
  ok(hors.length === 0, m.id + ' : amplitudes de référence respectées (±' + TOL.rom + '°) : ' + hors.slice(0, 4).join(', '));
  if (nMarge) ok(margeMin >= TOL.marge, m.id + ' : le centre de gravité reste dans la base d’appui (marge min ' + (margeMin * 100).toFixed(1) + ' cm sur ' + nMarge + ' images)');
  ok(maxA / dt <= lim.angle, m.id + ' : continuité des angles (vitesse angulaire max ' + (maxA / dt).toFixed(0) + ' °/s, tolérance ' + lim.angle + ' °/s)');
  ok(maxP / dt <= lim.pos, m.id + ' : continuité des articulations (vitesse max ' + (maxP / dt).toFixed(1) + ' m/s, tolérance ' + lim.pos + ' m/s)');
  const A = serie[0], B = serie[N]; let ecartBoucle = 0; for (const s of Object.keys(A.T)) for (let k = 0; k < 16; k++) ecartBoucle = Math.max(ecartBoucle, Math.abs(A.T[s][k] - B.T[s][k]) * (k >= 12 ? 1 : 0.1));
  ok(ecartBoucle <= TOL.bouclePos, m.id + ' : la dernière image rejoint la première (écart ' + (ecartBoucle * 1000).toFixed(2) + ' mm)');
  // pieds posés : la cheville atteinte est celle de la cible (jambe et pied coïncident, pas de glissement du pied par rapport à la jambe)
  for (const r of [serie[0], serie[Math.floor(N / 3)], serie[Math.floor(N / 2)], serie[Math.floor(2 * N / 3)]]) for (const S of ['D', 'G']) { const f = r.pieds[S]; if (!f) continue; const pj = point(r.T['jambe' + S], corps.pivots['cheville' + S]), pp = point(r.T['pied' + S], corps.pivots['cheville' + S]); ok(dist(pj, pp) < 2e-3, m.id + ' : jambe et pied joints à la cheville ' + S + ' (' + (dist(pj, pp) * 1000).toFixed(2) + ' mm)'); }
  rapport.push({ id: m.id, type: m.type, maxRom, maxA, maxP: maxP * 100, margeMin: nMarge ? margeMin * 100 : null, manque: maxManque * 1000 });
  // description et muscles
  ok(m.id && m.nom && m.alias.length && m.duree > 1 && m.articulation && m.categorie, 'mouvement complet : ' + m.id);
  ok(m.agonistes.length > 0 && m.antagonistes.length > 0, 'agonistes et antagonistes : ' + m.id);
  for (const k of [...m.agonistes, ...m.antagonistes, ...(m.stabilisateurs || [])]) ok(MUSCLES[k] && index.pieces.some(p => cleMuscle(p.nom_en) === k), 'muscle de ' + m.id + ' connu dans le modèle : ' + k);
  ok(m.agonistes.every(k => !m.antagonistes.includes(k)), 'aucun muscle à la fois agoniste et antagoniste : ' + m.id);
}
ok(MOUVEMENTS2.length >= 24, 'au moins 24 mouvements (' + MOUVEMENTS2.length + ')');
ok(MOUVEMENTS2.map(m => m.id).filter((x, i, t) => t.indexOf(x) !== i).length === 0, 'identifiants uniques');
for (const id of ['accroupissement', 'fente', 'escalier', 'assis_debout', 'flexion_tronc', 'lancer', 'saut', 'marche', 'course', 'flexion_hanche', 'prehension', 'rotation_tronc', 'inclinaison_tronc']) ok(MOUVEMENTS2.some(m => m.id === id), 'mouvement demandé présent : ' + id);

/* ── vérifications physiques des conventions de signe ── */
const pt = (spec, seg, piv) => point(C.poser(spec).T[seg], corps.pivots[piv]), a = corps.ant;
ok(pt({ joints: { hancheD: { fl: 60 } } }, 'cuisseD', 'genouD')[2] * a > 0.2, 'flexion de hanche : le genou part vers l’avant');
ok(pt({ joints: { genouD: { fl: 90 } } }, 'jambeD', 'chevilleD')[2] * a < -0.2, 'flexion de genou : la cheville part vers l’arrière');
ok(pt({ joints: { epauleD: { fl: 90 } } }, 'brasD', 'coudeD')[2] * a > 0.2, 'flexion d’épaule : le coude part vers l’avant');
ok(Math.abs(pt({ joints: { epauleD: { ab: 90 } } }, 'brasD', 'coudeD')[0]) > Math.abs(corps.pivots.coudeD[0]) + 0.15, 'abduction d’épaule : le coude s’écarte du corps');
ok(pt({ joints: { coudeD: { fl: 90 } } }, 'avantbrasD', 'poignetD')[2] * a > 0.15, 'flexion du coude : la main part vers l’avant');
ok(pt({ joints: { hancheD: { ab: 40 } } }, 'cuisseD', 'genouD')[0] * corps.cote.droit > Math.abs(corps.pivots.genouD[0]) + 0.1, 'abduction de hanche : la jambe s’écarte');
ok(point(C.poser({ joints: { chevilleD: { fl: 20 } } }).T.piedD, corps.pied.D.orteils)[1] > corps.pied.D.orteils[1] + 0.03, 'dorsiflexion : les orteils montent');
ok(point(C.poser({ joints: { lombaire: { fl: 40 } } }).T.tete, corps.pivots.cervicale)[2] * a > 0.1, 'flexion du tronc : la tête part vers l’avant');
ok(point(C.poser({ joints: { tronc: { ab: 20 } } }).T.tete, corps.pivots.cervicale)[0] * corps.cote.droit > 0.05, 'inclinaison à droite : la tête part vers la droite');
{ const r = C.poser({ joints: { epauleD: { ab: 120 } } }), g0 = corps.pivots.epauleD, g1 = point(r.T.scapD, g0); ok(g1[1] > g0[1] + 0.005, 'rythme scapulo-huméral : la scapula monte avec l’élévation du bras (' + ((g1[1] - g0[1]) * 100).toFixed(1) + ' cm)'); ok(r.angles.scapD.rotHaut > 20 && r.angles.scapD.rotHaut < 75, 'rythme scapulo-huméral : rotation de la scapula ' + r.angles.scapD.rotHaut.toFixed(0) + '°'); }
{ const r = C.poser({}); let id = true; for (const M of Object.values(r.T)) for (let k = 0; k < 16; k++) if (Math.abs(M[k] - (k % 5 === 0 ? 1 : 0)) > 1e-9) id = false; ok(id, 'pose de repos = transformations identité (le modèle n’est pas déformé au repos)'); }
// squat : tronc incliné de façon réaliste, rachis neutre, genoux dans l'axe des pieds
{ const sq = MOUVEMENTS2.find(x => x.id === 'accroupissement'), r = C.poser(sq.pose(0.5, ctx)), ang = r.angles;
  ok(Math.abs(ang.lombaire.fl) < 5 && Math.abs(ang.tronc.fl) < 5, 'squat : rachis neutre (lombaire ' + ang.lombaire.fl.toFixed(1) + '°, thoracique ' + ang.tronc.fl.toFixed(1) + '°)');
  ok(ang.hancheD.fl > 85 && ang.genouD.fl > 85 && ang.chevilleD.fl > 15 && ang.chevilleD.fl < 35.5, 'squat : hanche ' + ang.hancheD.fl.toFixed(0) + '°, genou ' + ang.genouD.fl.toFixed(0) + '°, cheville ' + ang.chevilleD.fl.toFixed(0) + '°');
  const inc = Math.atan2(point(r.T.tete, corps.pivots.cervicale)[2] - point(r.T.bassin, corps.pivots['lombo-sacree'])[2], point(r.T.tete, corps.pivots.cervicale)[1] - point(r.T.bassin, corps.pivots['lombo-sacree'])[1]) * 180 / Math.PI * a;
  ok(inc > 20 && inc < 55, 'squat : inclinaison du tronc ' + inc.toFixed(0) + '° (réaliste : 20 à 55°)');
  const genou = r.pieds.D.genou, che = r.pieds.D.cheville, pied = point(r.T.piedD, corps.pied.D.orteils), dirPied = [pied[0] - point(r.T.piedD, corps.pied.D.talon)[0], pied[2] - point(r.T.piedD, corps.pied.D.talon)[2]];
  const dirGenou = [genou[0] - che[0], genou[2] - che[2]], cosang = (dirPied[0] * dirGenou[0] + dirPied[1] * dirGenou[1]) / (Math.hypot(...dirPied) * Math.hypot(...dirGenou));
  ok(Math.acos(Math.max(-1, Math.min(1, cosang))) * 180 / Math.PI < 25, 'squat : genou dans l’axe du pied (écart ' + (Math.acos(Math.max(-1, Math.min(1, cosang))) * 180 / Math.PI).toFixed(0) + '°)');
  const A0 = C.poser(sq.pose(0, ctx)), B0 = C.poser(sq.pose(0.5, ctx)); ok(dist(A0.pieds.D.cheville, B0.pieds.D.cheville) < 1e-6 && dist(A0.pieds.G.cheville, B0.pieds.G.cheville) < 1e-6, 'squat : les pieds ne bougent pas pendant le mouvement');
}
console.log('\nmouvement'.padEnd(20), 'type'.padEnd(18), 'ROM+°'.padStart(6), 'Δangle°'.padStart(8), 'Δpos cm'.padStart(8), 'marge cm'.padStart(9), 'pied mm'.padStart(8));
for (const r of rapport) console.log(r.id.padEnd(19), r.type.padEnd(18), r.maxRom.toFixed(1).padStart(6), r.maxA.toFixed(1).padStart(8), r.maxP.toFixed(1).padStart(8), (r.margeMin === null ? '—' : r.margeMin.toFixed(1)).padStart(9), r.manque.toFixed(2).padStart(8));
console.log(`mouvements V2 (${MOUVEMENTS2.length}) : ${n - ko}/${n} vérifications`);
process.exit(ko ? 1 : 0);
