/* Tests purs du footprint historique (archives Binance aggTrades) : lecture, agrégation par case, regroupement exact, fusion mensuelle, zip. node trader-pro/tests/footprint-historique-test.mjs */
import zlib from 'node:zlib';
import { lireLigne, creerAgregateur, regrouper, bougiesDeUnite, bougiesTaillees, fusionnerMois, entreeZip, agregerJour, joursEntre, nomTaille, ACTIFS, moisDe } from '../../outils-donnees/footprint-historique.mjs';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const H = 3600e3, T0 = Date.UTC(2026, 10, 18);   // 18/11/2026 00:00 UTC

const l1 = lireLigne('103415231,4145.28,77.139,234554189,234554207,1794268800188,true'), l2 = lireLigne('1,4145.5,2,1,1,1794268800189,false');
v(l1 && l1.p === 4145.28 && l1.q === 77.139 && l1.t === 1794268800188 && l1.vendeur === true && l2.vendeur === false, 'ligne : prix, quantité, temps, côté (is_buyer_maker vrai = agresseur vendeur)');
v(lireLigne('agg_trade_id,price,quantity,first_trade_id,last_trade_id,transact_time,is_buyer_maker') === null && lireLigne('a,b') === null, 'en-tête et lignes cassées ignorées');

/* agrégation : 3 transactions dans la même case de 0,5 $, une dans la case suivante, une à l'heure suivante */
const A = creerAgregateur(0.5);
A.ajouter(4145.0, 2, T0 + 1000, true); A.ajouter(4145.2, 3, T0 + 2000, false); A.ajouter(4145.4, 1, T0 + 3000, false); A.ajouter(4145.5, 5, T0 + 4000, false); A.ajouter(4145.6, 4, T0 + H + 5, true);
const h0 = A.heures.get(T0); const c0 = [...h0].sort((a, b) => a[0] - b[0]);
v(c0.length === 2 && c0[0][0] === 8290 && c0[0][1][0] === 2 && c0[0][1][1] === 4 && c0[0][1][2] === 3 && c0[1][0] === 8291 && c0[1][1][1] === 5, 'cases de 0,5 $ : vendeur 2, acheteur 4, 3 transactions ; case suivante : acheteur 5');
v(regrouper([[8290, 2, 4, 3], [8291, 0, 5, 1]], 2).length === 1 && regrouper([[8290, 2, 4, 3], [8291, 0, 5, 1]], 2)[0].join() === '4145,2,9,4', 'regroupement ×2 exact : 8290 et 8291 → 4145 (somme)');
const D1 = bougiesDeUnite(A.heures, 'H1'), D4 = bougiesDeUnite(A.heures, 'H4'), DJ = bougiesDeUnite(A.heures, 'J');
v(D1.size === 2 && D4.size === 1 && DJ.size === 1, 'deux heures → 2 bougies H1, 1 bougie H4, 1 bougie Daily');
const tot = c => c.reduce((s, x) => s + x[1] + x[2], 0);
v(Math.abs(tot(D1.get(T0)) + tot(D1.get(T0 + H)) - 15) < 1e-9 && Math.abs(tot(D4.get(T0)) - 15) < 1e-9 && Math.abs(tot(DJ.get(T0)) - 15) < 1e-9, 'volume total conservé en H1, H4 et Daily (15)');
const T = bougiesTaillees(A.heures, 'H4', 0.5, 2); v(T.length === 1 && T[0][0] === T0 / 1000 && T[0][1].length === 1 && T[0][1][0][3] === 5, 'H4 en cases de 2 $ : une seule case, 5 transactions');

/* fusion mensuelle : la bougie récente remplace la même bougie, les autres sont conservées, tri par temps */
const F = fusionnerMois([[10, [[1, 1, 1, 1]]], [30, [[1, 3, 3, 3]]]], [[20, [[1, 2, 2, 2]]], [30, [[1, 9, 9, 9]]]]); v(F.map(x => x[0]).join() === '10,20,30' && F[2][1][0][1] === 9, 'fusion : tri, doublon remplacé');

/* zip : archive d'une entrée, deflate, avec descripteur de données (tailles à 0 dans l'en-tête) */
const csv = 'agg_trade_id,price,quantity,first_trade_id,last_trade_id,transact_time,is_buyer_maker\n' + [[4145.0, 2, 'true'], [4145.2, 3, 'false'], [4145.6, 4, 'true']].map((x, i) => `${i},${x[0]},${x[1]},0,0,${T0 + 1000 * (i + 1)},${x[2]}`).join('\n') + '\n';
const nom = Buffer.from('X.csv'), comp = zlib.deflateRawSync(Buffer.from(csv)), ent = Buffer.alloc(30); ent.writeUInt32LE(0x04034b50, 0); ent.writeUInt16LE(8, 8); ent.writeUInt16LE(nom.length, 26);
const zip = Buffer.concat([ent, nom, comp, Buffer.from('PK-fin-de-zip-bidon')]);
v(entreeZip(zip).methode === 8 && entreeZip(zip).debut === 30 + nom.length, 'zip : méthode et début des données');
const r = await agregerJour(zip, 0.5); v(r.transactions === 3 && r.heures.size === 1 && Math.abs(tot([...r.heures.get(T0)].map(([i, e]) => [i, e[0], e[1]])) - 9) < 1e-9, 'archive zip lue en flux : 3 transactions, volume 9');

v(joursEntre('2026-02-27', '2026-03-02').join() === '2026-02-27,2026-02-28,2026-03-01,2026-03-02' && moisDe(T0) === '2026-11' && nomTaille(0.5) === '0.5' && nomTaille(5) === '5', 'jours, mois, noms de taille');
v(ACTIFS.every(a => Object.values(a.tailles).every(L => L.every(t => Math.abs(t / a.fin - Math.round(t / a.fin)) < 1e-9))), 'toutes les tailles sont des multiples entiers de la case la plus fine (regroupements exacts)');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
