/* Test pur : volume net entrant / sortant (achats agresseurs − ventes agresseurs). Usage : node trader-pro/tests/volume-net-test.mjs */
import assert from 'node:assert/strict';
import { depuisKlinesBinance, estimationBougies, cumul, enJours, resume, lireFlux, urlKlines, SOURCES_FLUX } from '../commun/volume-net.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }, egal = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const H = 3600e3, T0 = Date.UTC(2026, 10, 1);
/* klines Binance : [ouverture, o, h, l, c, volume, fermeture, volumeEnQuote, trades, achatsAgresseursBase, achatsAgresseursQuote, ignore] */
const kl = (i, quote, achatsQuote, c = 100) => [T0 + i * H, '100', '101', '99', String(c), '10', T0 + (i + 1) * H - 1, String(quote), 50, '5', String(achatsQuote), '0'];
const L = depuisKlinesBinance([kl(0, 1000, 700), kl(1, 1000, 250), kl(2, 2000, 1000)]);
egal(L.map(x => x.net), [400, -500, 0], 'net = achats agresseurs − ventes agresseurs (en valeur)'); egal(L.map(x => x.achats), [700, 250, 1000], 'achats = volume acheté par les agresseurs'); egal(L.map(x => x.ventes), [300, 750, 1000], 'ventes = volume − achats'); ok(L.every(x => x.reel === true), 'données réelles marquées « réel »');
egal(depuisKlinesBinance([[1, 2], null, 'x']).length, 0, 'lignes invalides ignorées'); egal(depuisKlinesBinance(null), [], 'entrée vide');
egal(cumul(L).map(x => x.v), [400, -100, -100], 'cumul'); const r = resume(L); egal([r.net, r.achats, r.ventes, r.total], [-100, 1950, 2050, 4000], 'résumé'); ok(Math.abs(r.partNette + 0.025) < 1e-9, 'part nette');
/* jours */
const J2 = enJours([...L, { t: T0 + 30 * H, net: 10, total: 20, achats: 15, ventes: 5 }]); egal(J2.length, 2, 'regroupement par jour UTC'); egal(J2[0].net, -100, 'somme du jour');
/* estimation : jamais « réel » */
const B = [{ t: T0, o: 100, h: 110, l: 90, c: 110, v: 1000 }, { t: T0 + H, o: 100, h: 110, l: 90, c: 90, v: 1000 }, { t: T0 + 2 * H, o: 100, h: 110, l: 90, c: 100, v: 0 }, { t: T0 + 3 * H, o: 100, h: 100, l: 100, c: 100, v: 500 }];
const E = estimationBougies(B); egal(E.length, 2, 'bougies sans volume ou sans amplitude écartées'); ok(E[0].net === 1000 && E[1].net === -1000, 'pression ±1 sur clôture au plus haut / plus bas'); ok(E.every(x => x.reel === false), 'estimation marquée non réelle'); egal(estimationBougies(B, { enValeur: true })[0].net, 110000, 'en valeur = pression × volume × prix');
/* URL */
ok(/fapi\.binance\.com\/fapi\/v1\/klines\?symbol=XAUUSDT&interval=4h/.test(urlKlines(SOURCES_FLUX.or, 'H4')), 'or : futures XAUUSDT'); ok(/data-api\.binance\.vision\/api\/v3\/klines\?symbol=BTCUSDT&interval=1d/.test(urlKlines(SOURCES_FLUX.btc, 'J')), 'bitcoin : spot BTCUSDT');
/* lecture */
const ex = Array.from({ length: 30 }, (_, i) => kl(i, 1000 + i, 500 + 3 * i));
const reponse = corps => async () => ({ ok: true, status: 200, json: async () => corps });
let f = await lireFlux('btc', 'H1', { fetchFn: reponse(ex) }); egal([f.source, f.unite], ['reel', 'USD'], 'Bitcoin : vraies données'); ok(f.barres.length === 30 && /Binance/.test(f.nom), 'barres et source');
const barres = Array.from({ length: 40 }, (_, i) => ({ t: T0 + i * H, o: 100, h: 110, l: 90, c: i % 2 ? 110 : 90, v: 1000 }));
f = await lireFlux('or', 'H4', { fetchFn: async () => { throw new Error('réseau coupé'); }, bougies: barres }); egal([f.source, f.unite], ['estimation', 'unités de volume'], 'or sans Binance : estimation étiquetée, pas en dollars'); ok(/réseau coupé/.test(f.raison) && /estimation/.test(f.nom), 'raison et étiquette');
f = await lireFlux('us100', 'J', { fetchFn: reponse([]), bougies: barres }); egal([f.source, f.unite], ['estimation', 'titres'], 'Nasdaq 100 : estimation en titres'); ok(/pas en dollars/.test(f.nom) && /pas de données acheteur/.test(f.raison), 'pas de faux dollars sur un indice');
f = await lireFlux('us500', 'J', { bougies: [] }); egal([f.source, f.barres.length], [null, 0], 'sans volume : non disponible'); ok(/non disponible/.test(f.raison), 'raison');
f = await lireFlux('btc', 'J', { fetchFn: async () => ({ ok: false, status: 451, json: async () => ({}) }), bougies: barres }); egal([f.source, f.unite], ['estimation', 'USD'], 'Binance refuse : estimation en USD (volume Yahoo des cryptos) étiquetée'); ok(/451/.test(f.raison), 'raison avec le code');
f = await lireFlux('sol', 'H1', { fetchFn: reponse(ex.slice(0, 3)), bougies: [] }); egal(f.source, null, 'réponse trop courte et pas de repli : non disponible');
console.log(`volume-net-test : ${n} vérifications, tout passe`);
