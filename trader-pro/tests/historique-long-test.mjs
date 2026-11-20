/* Tests purs de l'historique long : H4, découpage par année, compression, écart mesuré. node trader-pro/tests/historique-long-test.mjs */
import zlib from 'node:zlib';
import { enH4, jourUtc, nettoyer, parAnnee, compacter, decompacter, mesurerEcart, gz, ecartsDe, ACTIFS, PROFONDEUR_ANNEES } from '../../outils-donnees/historique-long.mjs';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const H = 3600e3, J = 86400e3, T0 = Date.UTC(2024, 0, 2);
const h1 = Array.from({ length: 12 }, (_, i) => ({ t: T0 + i * H, o: 100 + i, h: 105 + i, l: 95 + i, c: 101 + i, v: 10 }));
const h4 = enH4(h1);
v(h4.length === 3 && h4[0].t === T0 && h4[0].o === 100 && h4[0].c === 104 && h4[0].h === 108 && h4[0].l === 95 && h4[0].v === 40, 'H1 → H4 sur la grille UTC : ouverture, haut, bas, clôture, volume');
v(jourUtc(Date.UTC(2024, 0, 1, 22)) === T0 && jourUtc(Date.UTC(2024, 0, 2, 14, 30)) === T0, 'bougie journalière ramenée au jour de calendrier (Dukascopy 22 h la veille, Yahoo 14 h 30)');
v(nettoyer([{ t: 2, o: 1, h: 2, l: 1, c: 1.5 }, { t: 1, o: 1, h: 2, l: 1, c: 1.5 }, { t: 3, o: 0, h: 2, l: 1, c: 1 }, { t: 1, o: 1, h: 3, l: 1, c: 2 }]).map(b => b.t).join() === '1,2', 'nettoyage : trié, sans doublon, sans prix nul');
const P = parAnnee([{ t: Date.UTC(2019, 11, 31) }, { t: Date.UTC(2020, 0, 1) }, { t: Date.UTC(2020, 5, 1) }]); v(P[2019].length === 1 && P[2020].length === 2, 'découpage par année UTC');
const B = [{ t: 1700000000000, o: 1.23456789012, h: 2, l: 1, c: 1.5, v: 7.6 }]; const c = compacter(B); v(c[0][0] === 1700000000 && decompacter(c)[0].t === 1700000000000 && Math.abs(decompacter(c)[0].o - 1.23456789) < 1e-8, 'format compact : secondes, 9 chiffres significatifs');
v(JSON.parse(zlib.gunzipSync(gz(c)).toString())[0][0] === 1700000000, 'gzip aller-retour');
/* écart : le Terminal est 1 % au-dessus de l'historique long sur les 300 derniers jours */
const long = Array.from({ length: 600 }, (_, i) => ({ t: T0 + i * J, o: 100, h: 101, l: 99, c: 100 + i * 0.01 }));
const live = long.slice(300).map(b => ({ ...b, c: b.c * 1.01 })); const E = mesurerEcart(live, long, t => Math.floor(t / J), { fenetre: 250 });
v(E.mesure && Math.abs(E.ratio - 1.01) < 1e-6 && E.n === 250 && E.a === live[live.length - 1].t, 'écart mesuré : ratio 1,01 sur les 250 bougies communes les plus récentes');
v(!mesurerEcart(live.slice(0, 5), long).mesure && mesurerEcart(live.slice(0, 5), long).ratio === 1, 'trop peu de bougies communes : pas de recalage inventé (ratio 1, mesure: false)');
const pro = { j: live.map(b => [b.t + 4 * H, b.o, b.h, b.l, b.c, 0]), h1: [], h4: [] }; const ec = ecartsDe(pro, { J: { bougies: long }, H4: { bougies: long }, H1: { bougies: long } });
v(ec.J.mesure && ec.H4 && ec.H4.deJ === true && Math.abs(ec.H4.ratio - 1.01) < 1e-6, 'H4 sans H1 mesurable : écart repris du Daily (dit)');
v(ACTIFS.length === 6 && ACTIFS.every(a => a.duka || a.binance) && PROFONDEUR_ANNEES.J >= 20 && PROFONDEUR_ANNEES.H4 >= 5 && PROFONDEUR_ANNEES.H1 >= 2, 'six actifs ; Daily ≥ 20 ans, H4 ≥ 5 ans, H1 ≥ 2 ans');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
