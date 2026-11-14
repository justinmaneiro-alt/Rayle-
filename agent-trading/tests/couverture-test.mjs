/* Couverture (Phase 6 A) : jeux synthétiques à résultat connu. node agent-trading/tests/couverture-test.mjs */
import assert from 'node:assert/strict';
import { alignerSeries, rendements, diffs, pearson, ecartType, matrice, matriceHoraire, stabilite, evaluerCouvertures, exposition, couvertureDegradee, MIN_OBS, cleDate } from '../front/marches/couverture-calcul.js';
import { expositions, parId, messageSansDonnee, SYMBOLE_VALIDE, UNIVERS } from '../front/marches/univers.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const proche = (a, b, e, m) => ok(Math.abs(a - b) <= e, `${m} : ${a} ≠ ${b}`);
/* générateur déterministe */
const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const gauss = a => () => { const u = Math.max(a(), 1e-12), v = a(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const T0 = Date.UTC(2020, 0, 1), J = 86400e3, serie = (r, c0 = 100, saut = null) => { const o = []; let c = c0; for (let i = 0; i <= r.length; i++) { o.push([T0 + i * J, c]); if (i < r.length) c *= 1 + r[i]; } return o; };
const alea = gauss(mulberry(42)), N = 600;

/* pearson, écart-type, alignement */
proche(pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1, 1e-12, 'corrélation parfaite'); proche(pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1, 1e-12, 'anti-corrélation'); ok(Number.isNaN(pearson([1, 1, 1, 1], [1, 2, 3, 4])), 'variance nulle → NaN'); ok(Number.isNaN(pearson([1, 2], [1, 2])), 'trop court → NaN');
proche(ecartType([2, 4, 4, 4, 5, 5, 7, 9]), 2.138089935, 1e-6, 'écart-type échantillon');
const al = alignerSeries({ a: [[T0, 1], [T0 + J, 2], [T0 + 2 * J, 3]], b: [[T0 + J, 5], [T0 + 2 * J, 6], [T0 + 3 * J, 7]] }); ok(al.dates.length === 2 && al.c.a[0] === 2 && al.c.b[0] === 5, 'dates communes seulement (week-ends crypto ignorés)');
{ const r = rendements([100, 110, 99]); proche(r[0], 0.1, 1e-12, 'rendements, pas des prix'); proche(r[1], -0.1, 1e-12, 'rendement négatif'); } ok(diffs([4, 4.5, 4.25]).join() === '0.5,-0.25', 'taux : différences de points');

/* matrice : A, B = 0,8·A + bruit, C indépendant. Corrélation de rendements attendue ≈ 0,8/sqrt(0,8²+0,6²)=0,8 */
const rA = Array.from({ length: N }, alea).map(x => x * 0.01), rB = rA.map(x => 0.8 * x + 0.6 * alea() * 0.01), rC = Array.from({ length: N }, alea).map(x => x * 0.01);
const S = { A: serie(rA), B: serie(rB), C: serie(rC) }, M = matrice(S, [30, 90, 250]);
ok(M.observations === N, 'observations : ' + M.observations); proche(M.fenetres[250].m[0][1], 0.8, 0.08, 'corr A,B sur 250 j'); ok(Math.abs(M.fenetres[250].m[0][2]) < 0.2, 'corr A,C ≈ 0'); proche(M.fenetres[250].m[0][0], 1, 1e-9, 'diagonale = 1');
ok(M.fenetres[250].n === 250 && M.fenetres[30].assez === false, 'sous 60 observations : pas assez de données'); ok(M.fenetres[30].m[0][1] === null, 'fenêtre de 30 jours : null (pas de chiffre inventé)');
ok(M.stabilite['A|B'].etat === 'stable', 'A,B stable : ' + JSON.stringify(M.stabilite['A|B'])); ok(M.stabilite['A|C'].etat !== 'stable' || Math.abs(M.fenetres[250].m[0][2]) < 0.2, 'A,C : pas présentée comme couverture stable');
// instabilité : corrélation +0,9 sur la 1re moitié, -0,9 sur la 2e
{ const x = Array.from({ length: 400 }, alea).map(v => v * 0.01), y = x.map((v, i) => (i < 200 ? 0.9 : -0.9) * v + 0.4 * alea() * 0.01); const st = stabilite(x, y); ok(st.etat === 'instable' && st.changementsDeSigne >= 1, 'corrélation qui change de signe : instable ' + JSON.stringify(st)); }
ok(stabilite(rA.slice(0, 30), rB.slice(0, 30)).etat === 'pas assez de données', 'stabilité sous 60 obs');
// horaire : 5 jours, heures communes
{ const H = 3600e3, h0 = Date.UTC(2026, 0, 5), rr = Array.from({ length: 300 }, alea).map(v => v * 0.002), a = [], b = []; let ca = 100, cb = 50; for (let i = 0; i < 300; i++) { a.push([h0 + i * H, ca]); b.push([h0 + i * H, cb]); ca *= 1 + rr[i]; cb *= 1 + rr[i] * 0.5; } const mh = matriceHoraire({ a, b }, 5); ok(mh.n >= MIN_OBS && mh.assez, 'horaire 5 j : ' + mh.n + ' obs'); proche(mh.m[0][1], 1, 1e-6, 'horaire : corrélation parfaite'); }

/* couvertures : cible A (achat). B ≈ 0,8·A → utile ; C indépendant → inutile ; D instable → instable ; E trop court → insuffisant */
{ const rD = rA.map((v, i) => (i < N * 0.6 ? 0.9 : -0.9) * v + 0.3 * alea() * 0.01), rE = rA.slice(0, 60).map(v => v), rF = rA.map(v => -0.9 * v + 0.3 * alea() * 0.01);
  const R = evaluerCouvertures({ cible: { id: 'A', sens: 1 }, series: { A: serie(rA), B: serie(rB), C: serie(rC), D: serie(rD), E: serie(rE), F: serie(rF) } }), par = Object.fromEntries(R.classement.map(x => [x.id, x]));
  ok(par.B.verdict === 'utile' && par.B.jambe === 'vendre', 'B utile, jambe : vendre B pour couvrir un achat de A : ' + JSON.stringify([par.B.verdict, par.B.jambe, par.B.redVol])); ok(par.B.redVol > 0.25 && par.B.rho > 0.7 && par.B.rhoTest > 0.7, 'réduction de volatilité sur la période de TEST, corrélation de réglage et de test');
  proche(par.B.partDuRisque, Math.abs(par.B.rho), 1e-9, 'part du risque = |ρ| (couverture en risque, pas en taille nominale)'); ok(par.B.nReglage + par.B.nTest === par.B.n && par.B.nTest > 100 && par.B.nReglage > par.B.nTest, 'réglage et test séparés (60 / 40)');
  ok(par.C.verdict === 'inutile', 'C inutile : ' + par.C.raison); ok(par.D.verdict === 'instable', 'D instable : ' + par.D.raison); ok(par.E.verdict === 'données insuffisantes', 'E trop court : ' + par.E.raison);
  ok(par.F.verdict === 'utile' && par.F.jambe === 'acheter', 'F anti-corrélé : acheter F pour couvrir un achat de A : ' + par.F.jambe);
  ok(R.classement[0].verdict === 'utile' && R.classement[R.classement.length - 1].verdict === 'données insuffisantes', 'classement : utiles d’abord, insuffisants à la fin');
  ok(par.B.coutAnnuelPct === null && /aucune valeur supposée/.test(par.B.coutNote), 'coût non renseigné : jamais inventé');
  const R2 = evaluerCouvertures({ cible: { id: 'A', sens: 1 }, series: { A: serie(rA), B: serie(rB) }, couts: { B: { spreadPct: 0.02, swapJourPct: 0.01 } } }); ok(R2.classement[0].coutAnnuelPct > 0 && /saisies par toi/.test(R2.classement[0].coutNote), 'coût saisi : calculé, étiqueté « saisi par toi »');
  ok(par.B.esperancePerduePctAn !== null && par.B.crise.n >= 5, 'espérance perdue et comportement en crise renseignés'); ok(R.mentions.length === 3 && /pas l’espérance/.test(R.mentions[0]), 'mentions permanentes');
  const Rv = evaluerCouvertures({ cible: { id: 'A', sens: -1 }, series: { A: serie(rA), B: serie(rB) } }); ok(Rv.classement[0].jambe === 'acheter', 'vente de A : jambe inverse (acheter B)');
  ok(evaluerCouvertures({ cible: { id: 'Z', sens: 1 }, series: {} }).erreur, 'actif sans donnée : erreur claire'); }
/* taux d'intérêt : variation en points */
{ const taux = serie(Array.from({ length: 300 }, alea).map(v => v * 0.004), 4); ok(evaluerCouvertures({ cible: { id: 'A', sens: 1 }, series: { A: serie(rA.slice(0, 300)), US10Y: taux } }).classement.length === 1, 'taux traité sans erreur'); }

/* exposition : EUR/USD long = dollar -1 ; USD/CHF long = dollar +1 et franc -1 ; deux achats d'indices = doublon */
ok(expositions('EURUSD', 1).dollar === -1 && expositions('EURUSD', -1).dollar === 1, 'EUR/USD'); ok(expositions('USDCHF', 1).dollar === 1 && expositions('USDCHF', 1).franc === -1, 'USD/CHF'); ok(expositions('US100', 1).actions === 1 && expositions('BTC', -1).crypto === -1 && expositions('XAUUSD', 1).or === 1, 'actions, crypto, or');
{ const e = exposition([{ actif: 'US100', sens: 1, risque: 1 }, { actif: 'US500', sens: 1, risque: 1 }, { actif: 'EURUSD', sens: 1, risque: 2 }, { actif: 'USDCHF', sens: 1, risque: 1 }]); ok(e.nets.actions === 2 && e.nets.dollar === -1, 'nets : actions 2, dollar -2+1 = -1 : ' + JSON.stringify(e.nets)); ok(e.doublons.some(d => d.facteur === 'actions' && d.positions.length === 2), 'doublon détecté : deux indices achetés'); ok(!e.doublons.some(d => d.facteur === 'dollar'), 'dollar : positions opposées, pas de doublon');
  const c = exposition([{ actif: 'US100', sens: 1, risque: 1 }, { actif: 'US500', sens: -1, risque: 1 }]); ok(c.nets.actions === 0 && c.doublons.length === 0, 'achat et vente d’indices : net 0'); }
ok(couvertureDegradee(0.8, -0.2) === true && couvertureDegradee(0.8, 0.75) === false && couvertureDegradee(0.8, 0.3) === true && couvertureDegradee(NaN, 0.5) === null, 'couverture dégradée');
/* univers et actions saisies */
ok(UNIVERS.every(u => u.source && u.retard && u.profondeur), 'chaque actif dit sa source, son retard et sa profondeur'); ok(!UNIVERS.some(u => u.id === 'INFLATION'), 'l’inflation n’est pas dans l’univers des corrélations'); ok(parId.US2Y.fred === 'DGS2' && parId.EURUSD.yahoo === 'EURUSD=X', 'sources');
ok(SYMBOLE_VALIDE.test('AAPL') && SYMBOLE_VALIDE.test('BRK-B') && !SYMBOLE_VALIDE.test('a b') && !SYMBOLE_VALIDE.test('<x>'), 'symboles'); ok(/Rien n.est estimé à la place/.test(messageSansDonnee('TSLA')), 'message honnête sans donnée gratuite');
ok(cleDate(Date.UTC(2026, 10, 14, 23, 59)) === '2026-11-14', 'date UTC');
console.log('couverture : ' + n + ' vérifications OK');
