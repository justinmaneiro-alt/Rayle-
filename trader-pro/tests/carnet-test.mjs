/* Tests purs du carnet (v6, A4). Usage : node trader-pro/tests/carnet-test.mjs */
import { regrouperCote, carnetRegroupe, grosOrdresBruts, creerSuiviGros, desequilibreN, creerHistoDeseq, fusionnerCarnets, pointsCourbe, PALIERS, PALIER_DEFAUT } from '../volume/carnet-calcul.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
/* le défaut de la v4 : 20 niveaux au tick de 0,1 $ → « 61 850 » affiché 10 fois. Avec un palier de 10 $, une seule ligne. */
const bids = Array.from({ length: 20 }, (_, i) => [61853.2 - i * 0.1, 1 + i * 0.01]), asks = Array.from({ length: 20 }, (_, i) => [61853.3 + i * 0.1, 1]);
const g = regrouperCote(bids, 10, 'achat'); v(g.length <= 2, 'BTC 10 $ : 20 niveaux au tick 0,1 $ → au plus 2 lignes (' + g.length + ')'); v(new Set(g.map(x => x.prix)).size === g.length, 'chaque ligne a un prix unique');
v(Math.abs(g.reduce((s, x) => s + x.qte, 0) - bids.reduce((s, x) => s + x[1], 0)) < 1e-9, 'la somme des quantités est conservée');
v(g[0].prix === 61850 && g[0].cumul === g[0].qte, 'acheteurs arrondis vers le bas (61 853,2 → 61 850), cumul démarre à la quantité');
const a = regrouperCote(asks, 10, 'vente'); v(a[0].prix === 61860, 'vendeurs arrondis vers le haut (61 853,3 → 61 860)');
/* tri, cumul croissant, pas de doublon pour chaque palier de chaque actif */
for (const [actif, L] of Object.entries(PALIERS)) for (const pal of L) { const gros = Array.from({ length: 400 }, (_, i) => [1000 - i * pal * 0.3, 1]); const r = regrouperCote(gros, pal, 'achat'); const u = new Set(r.map(x => x.prix)); v(u.size === r.length, actif + ' palier ' + pal + ' : prix uniques'); v(r.every((x, i) => i === 0 || (x.prix < r[i - 1].prix && x.cumul > r[i - 1].cumul)), actif + ' palier ' + pal + ' : tri décroissant et cumul croissant'); }
v(PALIER_DEFAUT.btc === 10 && PALIER_DEFAUT.or === 0.5 && PALIER_DEFAUT.sol === 0.05 && PALIERS.btc.includes(PALIER_DEFAUT.btc) && PALIERS.or.includes(PALIER_DEFAUT.or) && PALIERS.sol.includes(PALIER_DEFAUT.sol), 'paliers par défaut : BTC 10, or 0,5, SOL 0,05, tous dans la liste');
/* carnet affiché : spread, milieu, gros ordres (> 3 × médiane) */
const book = { t: 1, bids: Array.from({ length: 60 }, (_, i) => [100 - i * 0.5, i === 7 ? 40 : 2]), asks: Array.from({ length: 60 }, (_, i) => [100.5 + i * 0.5, 2]) };
const c = carnetRegroupe(book, 0.5, { n: 14 }); v(Math.abs(c.spread - 0.5) < 1e-9 && Math.abs(c.milieu - 100.25) < 1e-9, 'spread 0,5 et prix médian 100,25'); v(c.achats.filter(x => x.gros).length === 1 && c.achats.find(x => x.gros).qte === 40, 'un seul gros ordre repéré (40 contre médiane 2)'); v(c.achats.length === 14 && c.ventes.length === 14, '14 lignes par côté');
v(grosOrdresBruts(book).length === 1, 'gros ordres bruts : 1'); v(carnetRegroupe({ bids: [], asks: [] }, 1) === null, 'carnet vide → null');
/* persistance > 2 min */
const S = creerSuiviGros(); S.observer(book, 0); v(S.persistants(60000).length === 0, 'pas encore persistant à 1 min'); S.observer(book, 100000); S.observer(book, 125000); v(S.persistants(125000).length === 1, 'persistant après 2 min (125 s)');
S.observer({ bids: book.bids.map(x => [x[0], 2]), asks: book.asks }, 140000); v(S.persistants(160000).length === 0, 'plus persistant une fois retiré (absent > 10 s)');
/* déséquilibre */
const d = desequilibreN({ bids: [[1, 3], [0.9, 3]], asks: [[1.1, 1], [1.2, 1]] }, 2); v(Math.abs(d.ratio - 0.5) < 1e-9 && Math.abs(d.part - 0.75) < 1e-9, 'déséquilibre 6 contre 2 → +50 %'); v(desequilibreN({ bids: [], asks: [] }, 5) === null, 'déséquilibre : carnet vide → null');
const H = creerHistoDeseq({ pasMs: 1000, dureeMs: 5000 }); for (let t = 0; t <= 9000; t += 500) H.ajouter({ bids: [[1, 2]], asks: [[1.1, 1]] }, t); v(H.liste().length >= 4 && H.liste().length <= 6 && H.liste().at(-1).t - H.liste()[0].t <= 5000, 'historique : une mesure par seconde, 5 s gardées (' + H.liste().length + ')');
v(pointsCourbe([-1, 0, 1], 100, 20) === '0.0,20.0 50.0,10.0 100.0,0.0', 'mini-courbe : points SVG');
/* fusion REST + flux */
const prof = { t: 1, bids: [[100, 1], [99, 1], [98, 1], [97, 1]], asks: [[101, 1], [102, 1], [103, 1], [104, 1]] }, flux = { t: 2, bids: [[100.2, 5], [99.5, 5]], asks: [[100.8, 5], [101.5, 5]] };
const F = fusionnerCarnets(prof, flux); v(F.bids[0][0] === 100.2 && F.bids.map(x => x[0]).join() === '100.2,99.5,99,98,97', 'fusion : acheteurs flux puis profondeur sous la plage du flux (' + F.bids.map(x => x[0]).join() + ')'); v(F.asks.map(x => x[0]).join() === '100.8,101.5,102,103,104', 'fusion : vendeurs flux puis profondeur au-delà');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `carnet-test : tout passe (${ok})`); process.exit(ko ? 1 : 0);
