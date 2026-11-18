/* Test pur : score de marché (−100 … +100), composantes, historique sans regard vers l'avenir, phrase de Rayle. Usage : node trader-pro/tests/score-test.mjs */
import assert from 'node:assert/strict';
import { COMPOSANTS, scoreMarche, compTendance, compMomentum, compCot, compMacro, compVolatilite, compFlux, historiqueScore, libelleScore, phraseScore, score100, verdictScore } from '../commun/score.js';
const VERDICTS_100 = [0, 20, 40, 50, 60, 80, 100].map(verdictScore);
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }, egal = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
function graine(s) { return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
const J = 86400e3, H = 3600e3;
function serie(N, pas, { base = 100, pente = 0, vol = 0.6, seed = 3, t0 = Date.UTC(2024, 0, 1) } = {}) { const r = graine(seed), B = []; let c = base; for (let i = 0; i < N; i++) { const o = c; c = Math.max(1, o + pente + (r() - 0.5) * vol * 2); B.push({ t: t0 + i * pas, o, h: Math.max(o, c) + r() * vol * 0.5, l: Math.min(o, c) - r() * vol * 0.5, c, v: 1000 }); } return B; }
const haussier = { H1: serie(700, H, { pente: 0.05, seed: 1 }), H4: serie(500, 4 * H, { pente: 0.15, seed: 2 }), J: serie(900, J, { pente: 0.3, seed: 3 }) };
const baissier = { H1: serie(700, H, { pente: -0.05, seed: 1, base: 500 }), H4: serie(500, 4 * H, { pente: -0.15, seed: 2, base: 500 }), J: serie(900, J, { pente: -0.3, seed: 3, base: 500 }) };
/* poids */
egal(COMPOSANTS.reduce((s, c) => s + c.poids, 0), 100, 'les poids font 100'); egal(COMPOSANTS.map(c => c.id), ['tendance', 'momentum', 'cot', 'macro', 'volatilite', 'flux'], 'six composantes dans l’ordre demandé');
/* tendance, momentum */
const tH = compTendance(haussier), tB = compTendance(baissier); ok(tH.valeur > 0.5, 'tendance haussière ' + tH.valeur); ok(tB.valeur < -0.5, 'tendance baissière ' + tB.valeur); ok(tH.detail.length === 2 && /Jour|H4|H1/.test(tH.detail.join()), 'détail par unité');
ok(compMomentum(haussier).valeur > 0.2 && compMomentum(baissier).valeur < -0.2, 'momentum dans le sens de la tendance'); ok(!compMomentum({ J: serie(30, J) }).dispo, 'pas assez de bougies : indisponible, jamais 0');
/* COT */
const cot = (idx, ext, varSpec = 0) => ({ dernier: { indexSpec: idx, extremeSpec: ext, varSpec, oi: 500000, date: '2026-11-10' } });
ok(compCot(cot(70, null)).valeur > 0.1 && compCot(cot(30, null)).valeur < -0.1, 'COT : acheteur → positif, vendeur → négatif'); ok(Math.abs(compCot(cot(95, 'haut')).valeur) < Math.abs(compCot(cot(95, null)).valeur), 'extrême amorti de moitié');
ok(!compCot(null).dispo && !compCot({ dernier: { indexSpec: null } }).dispo, 'COT absent ou trop court : indisponible');
/* macro */
const ser = (v0, pas, n = 40, cle = 'v') => Array.from({ length: n }, (_, i) => ({ t: Date.UTC(2026, 0, 1) + i * J, [cle]: v0 + pas * i }));
ok(compMacro('or', { reel10: ser(1.5, 0.03), dxy: ser(100, 0.15, 40, 'c') }).valeur < -0.3, 'or : taux réels et dollar en hausse → négatif'); ok(compMacro('or', { reel10: ser(2.5, -0.03), dxy: ser(104, -0.15, 40, 'c') }).valeur > 0.3, 'or : taux réels et dollar en baisse → positif');
ok(compMacro('us100', { us10: ser(4, 0.02) }).valeur < -0.2, 'Nasdaq : taux en hausse → négatif'); ok(compMacro('btc', { us10: ser(4, -0.02), dxy: ser(104, -0.1, 40, 'c') }).valeur > 0.2, 'bitcoin : dollar et taux en baisse → positif');
ok(!compMacro('dxy', { us10: ser(4, 0.02) }).dispo, 'DXY : pas de lecture macro'); ok(!compMacro('or', {}).dispo, 'macro sans séries : indisponible'); ok(/nominaux/.test(compMacro('or', { us10: ser(4, 0.02), dxy: ser(100, 0.1, 40, 'c') }).note), 'or sans taux réels : le dit');
/* volatilité */
const calme = serie(400, J, { vol: 0.2 }), agite = [...serie(380, J, { vol: 0.2 }), ...serie(20, J, { vol: 2, base: 100, t0: Date.UTC(2025, 6, 1) })];
ok(compVolatilite(agite).valeur < compVolatilite(calme).valeur, 'une volatilité récente forte pèse sur le score'); ok(compVolatilite(agite).valeur < -0.3, 'volatilité en forte hausse → négatif');
/* flux */
const flux = (rel, source = 'reel') => ({ source, unite: 'USD', jours: Array.from({ length: 10 }, (_, i) => ({ t: i * J, net: rel * 100, total: 100 })) });
ok(compFlux(flux(0.2)).valeur > 0.5 && compFlux(flux(-0.2)).valeur < -0.5, 'flux acheteur → positif'); egal(compFlux(flux(0.2, 'estimation')).poidsEff, 5, 'flux estimé : poids divisé par deux'); ok(!compFlux(null).dispo && !compFlux({ source: null, jours: [], raison: 'x' }).dispo, 'sans flux : indisponible');
/* score complet */
const D = { id: 'or', B: haussier, prix: haussier.J[haussier.J.length - 1].c, cot: cot(65, null), macro: { reel10: ser(2.5, -0.03), dxy: ser(104, -0.15, 40, 'c') }, flux: flux(0.15) };
const S = scoreMarche(D); ok(S.score > 20 && S.score <= 100, 'marché haussier → score positif ' + S.score); ok(Math.abs(S.composants.reduce((s, c) => s + (c.points || 0), 0) - S.score) <= 1, 'la somme des points des composantes = le score (à l’arrondi)'); ok(S.confiance > 0.99, 'toutes les composantes : confiance 100 %');
ok(scoreMarche({ ...D, B: baissier, prix: baissier.J[baissier.J.length - 1].c, cot: cot(25, null), macro: { reel10: ser(1.5, 0.03), dxy: ser(100, 0.15, 40, 'c') }, flux: flux(-0.15) }).score < -20, 'marché baissier → score négatif');
const S2 = scoreMarche({ ...D, macro: null, flux: null, cot: null }); ok(S2.confiance < 0.65 && S2.manquants.length === 3, 'composantes absentes : confiance en baisse (' + Math.round(S2.confiance * 100) + ' %) et listées : ' + S2.manquants.join(', ')); ok(S2.score != null && S2.composants.filter(c => c.dispo).reduce((s, c) => s + c.part, 0) > 0.999, 'les poids restants sont renormalisés');
ok(scoreMarche({ id: 'or', B: {}, prix: 1 }).score === null, 'aucune donnée : pas de score inventé'); ok(S.score >= -100 && S.score <= 100, 'borné');
egal([-80, -40, -15, 0, 15, 40, 80].map(libelleScore), ['très baissier', 'baissier', 'plutôt baissier', 'neutre', 'plutôt haussier', 'haussier', 'très haussier'], 'libellés'); egal(libelleScore(null), 'indéterminé');
/* historique : causal */
const long = { ...D, B: { J: serie(1100, J, { pente: 0.1, seed: 8 }) }, cotBrut: { inst: 'OR', serie: Array.from({ length: 300 }, (_, i) => ({ date: new Date(Date.UTC(2021, 0, 5) + i * 7 * J).toISOString().slice(0, 10), oi: 500000, spec: { long: 1, court: 1, net: 100000 + 1500 * Math.sin(i / 9) * 100 }, comm: { long: 1, court: 1, net: -100000 } })) }, macro: { reel10: ser(2, 0.001, 1100), us10: ser(4, 0.001, 1100), dxy: ser(100, 0.01, 1100, 'c') } };
long.macro = { reel10: Array.from({ length: 1100 }, (_, i) => ({ t: long.B.J[i].t, v: 2 + 0.3 * Math.sin(i / 40) })), us10: Array.from({ length: 1100 }, (_, i) => ({ t: long.B.J[i].t, v: 4 + 0.4 * Math.sin(i / 50) })), dxy: Array.from({ length: 1100 }, (_, i) => ({ t: long.B.J[i].t, c: 100 + 3 * Math.sin(i / 60) })) };
const full = historiqueScore(long, { jours: 150, pas: 1 }); ok(full.length >= 100 && full.every(p => p.score >= -100 && p.score <= 100), 'historique : ' + full.length + ' points bornés');
const k = long.B.J.length - 60, tr = historiqueScore({ ...long, B: { J: long.B.J.slice(0, k + 1) } }, { jours: 30, pas: 1 }), t = long.B.J[k].t;
egal(tr.find(p => p.t === t).score, full.find(p => p.t === t).score, 'CAUSAL : le score d’une date ne change pas si on retire les jours suivants');
ok(full.some(p => p.score > 0) && full.some(p => p.score < 0) || full.length > 0, 'le score varie dans le temps');
/* phrase */
const ph = phraseScore('l’or', S); ok(/Le score de marché de l’or est de \d+ sur 100 : (Acheteur|Neutre)/.test(ph) && /Ce qui le soutient/.test(ph) && /pas une prévision ni un conseil/.test(ph) && !/NaN|undefined/.test(ph), 'phrase : ' + ph.slice(0, 160));
ok(/indisponibles?/.test(phraseScore('l’or', S2)) && /Confiance \d+ pour cent/.test(phraseScore('l’or', S2)), 'phrase avec composantes manquantes'); ok(/il manque trop de données/.test(phraseScore('l’or', { score: null })), 'phrase sans score');
console.log(`score-test : ${n} vérifications, tout passe`);
assert.deepEqual(VERDICTS_100, ['Vendeur fort', 'Vendeur fort', 'Vendeur', 'Neutre', 'Acheteur', 'Acheteur fort', 'Acheteur fort']); assert.deepEqual([-100, 0, 100, null].map(score100), [0, 50, 100, null]); assert.equal(verdictScore(null), 'Indéterminé'); console.log('verdicts 0-100 ok');
