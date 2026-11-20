/* Tests purs du suivi du modèle par lui-même : instantané mensuel, mesure à 1 / 3 / 6 / 12 mois, honnêteté sur le recul. node trader-pro/tests/suivi-modele-test.mjs */
import { creerInstantane, mesurer, messageRecul, moisDe, benchDe, HORIZONS, ECHEANCES, CODES } from '../invest/suivi-modele.js';
import { LIBELLES } from '../invest/modele.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const T = m => Date.UTC(2026, m - 1, 1, 6);
const fHaut = { val: 90, qua: 90, mom: 90, gro: 90, ris: 90, iv: 90, moat: 90, bil: 90, mc: 90, set: 90 }, fMoy = Object.fromEntries(Object.keys(fHaut).map(k => [k, 50])), fBas = Object.fromEntries(Object.keys(fHaut).map(k => [k, 5]));
const act = (id, f, px, extra = {}) => ({ id, y: id, n: id, c: 'action', p: 'US', z: 'US', s: 'Tech', px, f, comp: 1, r: {}, ...extra });
const lignes = (px) => [act('A', fHaut, px.A), act('B', fMoy, px.B), act('C', fBas, px.C), act('D', fHaut, px.D, { p: 'FR', z: 'Europe' }), { id: 'ETF1', c: 'ETF', px: 10, f: fHaut, r: {} }, { id: 'US500', c: 'indice', px: px.I, f: {}, r: {} }, { id: 'FRA40', c: 'indice', px: px.J, f: {}, r: {} }];
const manifeste = (m, extra = {}) => ({ t: T(m), version: 2, ajust: {}, ...extra });
/* instantané */
const s1 = creerInstantane(lignes({ A: 100, B: 100, C: 100, D: 100, I: 5000, J: 7000 }), manifeste(11));
v(s1.mois === '2026-11' && s1.n === 4 && s1.ids.join() === 'A,B,C,D', 'instantané : mois du calcul, seulement les actions (ETF et indices exclus) : ' + s1.ids.join());
v(HORIZONS.every(h => s1.h[h].s.length === 4 && s1.h[h].l.length === 4), 'un score et un verdict par action pour chacun des 4 horizons');
v(s1.h.moyen.l[0] <= CODES[LIBELLES.ATTR] && s1.h.moyen.l[2] >= CODES[LIBELLES.PEU] && s1.h.moyen.s[0] > s1.h.moyen.s[1] && s1.h.moyen.s[1] > s1.h.moyen.s[2], 'scores cohérents : A (forte) > B (moyenne) > C (faible) : ' + [s1.h.moyen.s[0], s1.h.moyen.s[1], s1.h.moyen.s[2]].join(' > '));
v(s1.px.join() === '100,100,100,100' && s1.idx.US500 === 5000 && s1.idx.FRA40 === 7000, 'cours et indices de référence enregistrés'); v(s1.b.join() === 'US500,US500,US500,FRA40' && benchDe({ p: 'XX', z: 'Europe' }) === 'EU50' && benchDe({ p: 'XX', z: 'US' }) === 'US500', 'indice de référence par pays');
v(JSON.stringify(s1).length < 60000, 'format compact : ' + JSON.stringify(s1).length + ' octets pour 4 actions'); v(moisDe(T(3)) === '2026-03', 'mois');
/* trois instantanés : novembre, décembre (+1 mois), février (+3 mois) */
const snap = (m, px) => creerInstantane(lignes(px), manifeste(m));
const S = [snap(11, { A: 100, B: 100, C: 100, D: 100, I: 5000, J: 7000 }), snap(12, { A: 110, B: 100, C: 90, D: 105, I: 5100, J: 7000 }), snap(14, { A: 130, B: 102, C: 80, D: 120, I: 5200, J: 7140 })].map((s, i) => ({ ...s, mois: ['2026-11', '2026-12', '2027-02'][i] }));
const M = mesurer(S), m1 = M.mesures.moyen[1], m3 = M.mesures.moyen[3];
v(Math.abs(m1.TRES.moy - (0.10 + 0.05) / 2) < 1e-9 && m1.TRES.n === 2, '1 mois, « Très attractif » (A et D) : +7,5 % en moyenne (n = 2)');
v(Math.abs(m1.EVITER.moy - (-0.10)) < 1e-9 && Math.abs(m1.NEUTRE.moy) < 1e-9 || m1.PEU, '1 mois : « À éviter / Peu attractif » : −10 %, « Neutre » : 0 %');
const idx1 = (0.02 + 0) / 2; v(Math.abs(m1.TRES.indice - idx1) < 1e-9 && Math.abs(m1.TRES.exces - (0.075 - idx1)) < 1e-9, 'performance contre l’indice de référence du pays (US500 +2 %, FRA40 0 %) : excès ' + (m1.TRES.exces * 100).toFixed(2) + ' points');
v(Math.abs(m3.TRES.moy - (0.30 + 0.20) / 2) < 1e-9, '3 mois, « Très attractif » : +25 %'); v(M.mesures.moyen[6].TRES === undefined && M.mesures.moyen[12].TRES === undefined, 'pas de mesure à 6 et 12 mois tant que le recul n’existe pas (aucun chiffre inventé)');
v(ECHEANCES.join() === '1,3,6,12', 'échéances 1, 3, 6, 12 mois');
v(M.recul.snapshots === 3 && M.recul.mois === 3 && /3 mois de recul : trop tôt pour conclure/.test(M.recul.message), 'honnêteté : « 3 mois de recul : trop tôt pour conclure »');
/* aberrations (split) écartées */
const Sa = [snap(11, { A: 100, B: 100, C: 100, D: 100, I: 5000, J: 7000 }), snap(12, { A: 600, B: 100, C: 100, D: 105, I: 5100, J: 7000 })].map((s, i) => ({ ...s, mois: ['2026-11', '2026-12'][i] })), Ma = mesurer(Sa);
v(Ma.aberrants === 1 && Ma.mesures.moyen[1].TRES.n === 1, 'variation de +500 % (split probable) écartée et comptée');
/* messages */
v(/Aucun instantané/.test(messageRecul(0, 0)) && /Premier instantané du .* première mesure à 1 mois/.test(messageRecul(1, 0, [{ t: T(11) }])) && /2 mois de recul : trop tôt pour conclure/.test(messageRecul(3, 2)) && /14 mois de recul : lecture possible/.test(messageRecul(15, 14)), 'messages selon le recul');
v(mesurer([]).recul.message.includes('Aucun') && mesurer([S[0]]).recul.snapshots === 1, 'zéro ou un seul instantané : pas de mesure');
/* même mois relancé : pas de doublon de mois dans la mesure */
v(Object.keys(mesurer([S[0], S[0]]).mesures.moyen[1]).length === 0, 'deux fois le même mois : aucune mesure à 1 mois');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
