/* Performances historiques (Phase 6 B) : jeux synthétiques au résultat connu. node agent-trading/tests/performances-test.mjs */
import assert from 'node:assert/strict';
import * as P from '../front/marches/performances-calcul.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const proche = (a, b, e, m) => ok(Math.abs(a - b) <= e, `${m} : ${a} ≠ ${b}`);
const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const gauss = a => () => { const u = Math.max(a(), 1e-12), v = a(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const J = 86400e3, jour = (an, mois, j) => Date.UTC(an, mois, j);
/* série quotidienne ouvrée de `ans` ans à partir de 2000 : r(i, date) → rendement du jour */
function fabrique(ans, r, c0 = 100) { const o = []; let c = c0, t = jour(2000, 0, 3); const fin = jour(2000 + ans, 0, 1); for (let i = 0; t < fin; t += J) { const d = new Date(t).getUTCDay(); if (d === 0 || d === 6) continue; o.push([t, c]); c *= 1 + r(i++, t); } return o; }

/* rendements : croissance mensuelle constante 1 % → 12 mois = 1,01^12 − 1 = 12,68 % (à ±0,6 : mois de longueurs inégales) */
{ const s = fabrique(8, (i, t) => Math.pow(1.01, 12 / 252) - 1); proche(P.rendementMois(s, 12), 12.68, 0.7, 'rendement 12 mois'); proche(P.rendementMois(s, 6), 6.15, 0.5, 'rendement 6 mois'); ok(P.rendementMois(s.slice(0, 50), 12) === null, 'historique trop court : null, pas de chiffre inventé');
  const A = P.parAnnee(s); ok(A.length >= 8 && A.slice(1, -1).every(x => Math.abs(x.pct - 12.68) < 0.8 && x.complet), 'par année civile : ≈ 12,68 % chaque année complète'); ok(A[0].partiel === true, 'première année marquée partielle');
  ok(P.pourcentHausse(s, 'mois').pct === 100 && P.pourcentHausse(s, 'semaine').pct > 99, '100 % de mois en hausse sur une série croissante'); const d = P.drawdown(s); ok(d.max === 0 || d.max > -0.01, 'aucun drawdown sur une série croissante : ' + d.max); }
/* drawdown connu : 100 → 120 → 60 (−50 %) → 90 → 130 */
{ const s = [100, 120, 60, 90, 130].map((c, i) => [jour(2020, 0, 1) + i * 10 * J, c]); const d = P.drawdown(s); ok(d.max === -50 && d.dureeJours === 30, 'drawdown −50 % sur 30 jours : ' + JSON.stringify(d)); ok(P.drawdown([100, 120, 60].map((c, i) => [i * J, c])).enCoursPct === -50, 'drawdown en cours'); }
/* séries et volatilité */
{ const s = [1, 2, 3, 4, 3, 2, 1, 2].map((c, i) => [i * J, c]); const r = P.series(s); ok(r.plusLongueHausse === 3 && r.plusLongueBaisse === 3, 'séries : 3 hausses puis 3 baisses : ' + JSON.stringify(r)); }
{ const al = gauss(mulberry(7)), s = fabrique(10, () => al() * 0.01), R = P.analyse(s, {}); proche(R.volAnnuellePct, 15.9, 1.5, 'volatilité annualisée ≈ 1 % × √252'); ok(R.n === s.length && R.mentions.length === 3, 'n et mentions'); }
/* Holm */
{ const a = P.holm([0.01, 0.04, 0.03]); proche(a[0], 0.03, 1e-12, 'Holm 1'); proche(a[1], 0.06, 1e-12, 'Holm 2'); proche(a[2], 0.06, 1e-12, 'Holm 3 (monotone)'); ok(P.holm([0.5, 0.9]).every(x => x <= 1), 'Holm ≤ 1'); }
/* persistance : marche aléatoire → jamais « persisté » ; processus à dérive mensuelle persistante (AR) → « persisté de façon significative » */
{ const al = gauss(mulberry(11)), s = fabrique(40, () => al() * 0.01), pe = P.persistance(s); ok(pe.verdict === 'pas mieux que le hasard' || pe.verdict === 'indéterminé', 'marche aléatoire : ' + pe.verdict + ' (' + pe.raison + ')'); ok(pe.tirages === 1000 && pe.graine === P.REGLES.graine, '1 000 tirages, graine fixe'); ok(pe.horizons[6].nTest >= 30, 'au moins 30 mois de test'); ok(pe.horizons[6].pHolm >= pe.horizons[6].pBrut - 1e-9, 'p corrigé ≥ p brut');
  const pe2 = P.persistance(s); ok(JSON.stringify(pe2) === JSON.stringify(pe), 'reproductible'); }
{ const al = gauss(mulberry(5)); let mu = 0, k = 0, mois = -1; const s = fabrique(40, (i, t) => { const m = new Date(t).getUTCMonth() + 12 * new Date(t).getUTCFullYear(); if (m !== mois) { mois = m; mu = 0.85 * mu + 0.01 * al(); } return mu / 21 + 0.002 * al(); });
  const pe = P.persistance(s); ok(pe.verdict === 'persisté de façon significative', 'dérive persistante : ' + pe.verdict + ' / ' + pe.raison + ' / ' + JSON.stringify(pe.horizons[pe.horizonChoisi])); ok(pe.horizons[pe.horizonChoisi].moyTestPct > 0, 'moyenne hors échantillon positive'); }
{ const v = P.persistance(fabrique(4, () => 0.0003)); ok(v.verdict === 'indéterminé' && /seulement [0-9]+ mois de test/.test(v.raison), 'historique court (4 ans) : indéterminé, jamais un verdict : ' + v.raison); ok(P.persistance(fabrique(1, () => 0.0003)).verdict === 'pas assez de données', 'historique très court : pas assez de données'); }
/* stratégie : tendance haussière pure, aucun coût → total > 0 ; spread et swap abaissent le résultat ; swap absent signalé */
{ const s = fabrique(6, (i) => 0.0004), a = P.simulerTendance(s, {}), b = P.simulerTendance(s, { spreadPct: 0.5 }), c = P.simulerTendance(s, { swapLongJourPct: -0.02, swapCourtJourPct: -0.02 });
  ok(a.totalPct > 50 && a.swapAbsent === true && /swap non saisi/.test(a.avertissement), 'tendance pure : gain, swap absent signalé : ' + a.totalPct); ok(b.totalPct < a.totalPct && b.nTrades === a.nTrades, 'le spread réduit le résultat'); ok(c.swapAbsent === false && c.avertissement === null && c.effetSwapPts < -10 && c.totalPct < a.totalPct, 'le swap réduit le résultat et son effet est affiché : ' + c.effetSwapPts);
  const lev = P.simulerTendance(s, { levier: 3 }); ok(lev.totalPct > a.totalPct, 'levier 3 : gain plus grand sur une tendance pure'); ok(a.neRienFaire.totalPct === 0 && a.acheterEtGarder.totalPct > a.totalPct, 'comparaison : ne rien faire = 0, acheter-garder = référence');
  ok(a.hasard.tirages === 1000 && a.hasard.percentile >= 0 && a.hasard.percentile <= 100, 'comparaison au hasard : percentile ' + a.hasard.percentile); }
/* marche aléatoire : la stratégie ne bat pas le hasard à 95 % ; classement honnête */
{ const al = gauss(mulberry(99)), s = fabrique(15, () => al() * 0.01), R = P.analyse(s, { spreadPct: 0.05, swapLongJourPct: -0.005, swapCourtJourPct: -0.005 });
  ok(R.classement === 'pas de tendance exploitable', 'marche aléatoire : ' + R.classement + ' (percentile ' + (R.strategie && R.strategie.hasard.percentile) + ', persistance ' + R.persistance.verdict + ')'); ok(/Ni la persistance/.test(R.classementNote), 'note honnête'); ok(R.strategie.retournements.n > 5 && R.strategie.retournements.pirePct10j <= R.strategie.retournements.moyennePct10j, 'comportement aux retournements renseigné'); }
{ const R = P.analyse(fabrique(2, () => 0.0005), {}); ok(R.classement === 'données insuffisantes' && R.strategie === null, 'moins de 3 ans : données insuffisantes'); ok(P.analyse([[1, 2]], {}).statut === 'données insuffisantes', 'série vide'); }
/* B6 */
ok(P.memeSensQueFleche('haussière', 1).ok === true && P.memeSensQueFleche('baissière', 1).ok === false && P.memeSensQueFleche('sans tendance', 1).ok === null && P.memeSensQueFleche('haussière', 0).ok === null, 'même sens que la dernière flèche (lecture seule)');
/* tendance de fond */
{ const s = fabrique(5, () => 0.0006), t = P.tendanceDeFond(s); ok(t[12].sens === 'haussière' && t[3].sens === 'haussière' && t[12].regularitePct >= 90, 'tendance de fond haussière régulière : ' + JSON.stringify(t[12])); const d = P.tendanceDeFond(fabrique(5, () => -0.0006)); ok(d[6].sens === 'baissière', 'baissière'); }
console.log('performances : ' + n + ' vérifications OK');
