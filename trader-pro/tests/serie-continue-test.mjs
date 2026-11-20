/* Tests purs de la série continue (v6, A2). Usage : node trader-pro/tests/serie-continue-test.mjs */
import { fusionner, ecartSources, raccorder, controler, PAS } from '../commun/serie-continue.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const J = PAS.J, bar = (i, c, extra = {}) => ({ t: i * J, o: c, h: c * 1.01, l: c * 0.99, c, v: 1, ...extra });
const serie = (a, b, f = i => 100 + i) => Array.from({ length: b - a }, (_, k) => bar(a + k, f(a + k)));

/* fusion : la source la plus récente gagne, tri, pas de doublon, rejet des bougies incohérentes */
const A = serie(0, 10), B = serie(8, 20, i => 200 + i);
const F = fusionner(A, B); v(F.length === 20, 'fusion : 20 bougies sans doublon'); v(F[8].c === 208 && F[9].c === 209, 'fusion : la source récente gagne sur la période commune');
v(fusionner([{ t: 1, o: 1, h: 0.5, l: 1, c: 1 }, { t: 2, o: NaN, h: 1, l: 1, c: 1 }]).length === 0, 'fusion : bougie h<l ou non finie rejetée');

/* recalage : l'historique long a 2 % d'écart avec la source récente → raccord continu */
const longue = serie(0, 30, i => 100 + i), recente = serie(20, 40, i => (100 + i) * 1.02);
const r = raccorder(longue, recente); v(r.methode === 'bougies communes' && Math.abs(r.ratio - 1.02) < 1e-9, 'raccord : écart 2 % mesuré sur les bougies communes (' + r.ratio + ')');
v(Math.abs(r.bougies[19].c / r.bougies[20].c - (119 * 1.02) / (120 * 1.02)) < 1e-9, 'raccord : pas de saut d\'échelle à la jonction'); v(r.bougies.length === 40, 'raccord : 40 bougies');
const sans = raccorder(serie(0, 10, () => 100), serie(10, 20, () => 100)); v(sans.methode === 'aucun' && sans.ratio === 1, 'raccord : séries contiguës identiques, aucun recalage');
const saut = raccorder(serie(0, 10, () => 100), serie(12, 20, () => 103)); v(saut.methode === 'saut de raccord' && Math.abs(saut.ratio - 1.03) < 1e-9, 'raccord : sans bougie commune, saut de 3 % recalé');
v(ecartSources(serie(0, 3), serie(0, 3)) === null, 'écart : moins de 5 bougies communes → pas de mesure');

/* contrôle : bougie isolée à > 30 % rejetée, trou BTC signalé */
const S = serie(0, 40); S[20] = bar(20, 30000, {}); S[20].h = 30300; S[20].l = 29700;   // le BTC « à 30 000 » au milieu d'une série à ~120
const C = controler(S, { unite: 'J', actif: 'btc' }); v(C.incidents.length === 1 && C.incidents[0].type === 'isolee', 'contrôle : bougie isolée détectée'); v(C.bougies.length === 39, 'contrôle : la bougie isolée est retirée');
const T = serie(0, 40).filter((_, i) => i < 15 || i > 25); const CT = controler(T, { unite: 'J', actif: 'btc' }); v(CT.trous.length === 1 && CT.trous[0].manquantes === 11, 'contrôle : trou de 11 bougies sur un marché 24/7 (' + JSON.stringify(CT.trous) + ')');
const T2 = serie(0, 40).filter((_, i) => i !== 15); v(controler(T2, { unite: 'J', actif: 'btc' }).trous.length === 0, 'contrôle : 1 bougie manquante tolérée (≤ 2)');
const W = serie(0, 40).filter((_, i) => ![10, 11, 12, 13].includes(i)); v(controler(W, { unite: 'J', actif: 'or' }).trous.length === 0, 'contrôle : week-end / férié (4 jours) non signalé sur un marché non 24/7');
const G = serie(0, 40).filter((_, i) => i < 10 || i > 25); v(controler(G, { unite: 'J', actif: 'or' }).trous.length === 1, 'contrôle : 15 jours manquants signalés sur un marché non 24/7');
const E = serie(0, 40, i => (i < 21 ? 120 : 60)); v(controler(E, { unite: 'J', actif: 'btc' }).incidents.length === 0, 'contrôle : une vraie chute durable (2 bougies) n\'est pas rejetée');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `serie-continue-test : tout passe (${ok})`); process.exit(ko ? 1 : 0);
