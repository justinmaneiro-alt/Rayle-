/* Tests de l'historique du graphique de l'or (faux Kraken et faux Binance) : node agent-trading/tests/historique-test.mjs */
import assert from 'node:assert/strict';
import { chargerHistorique, chargerPlusAncien, serieAffichee, fenetres, PROFONDEUR, decalerBougies } from '../front/or/historique-or.js';
import { PERIODES } from '../front/or/config-or.js';
let n = 0; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; }, ok = (c, m) => { assert.ok(c, m); n++; };
const JOUR = 86400e3, MAINTENANT = Date.UTC(2026, 10, 7, 18, 7);
const MISE_EN_LIGNE = Date.UTC(2026, 7, 5, 14, 45), DEBUT_BINANCE = Date.UTC(2025, 11, 11);
/* faux réseau : Kraken (2000 bougies au plus par appel, rien avant la mise en ligne), Binance (1500 au plus, prix = Kraken − 5) */
function faux(periode, appels) {
  const P = PERIODES[periode].ms, prix = t => 4000 + Math.sin(t / 3e8) * 50;
  return async url => {
    const u = new URL(url); appels.push(u.host);
    if (u.pathname.startsWith('/kraken/bougies')) {
      const f = +u.searchParams.get('from') * 1000, t = u.searchParams.get('to') ? +u.searchParams.get('to') * 1000 : MAINTENANT, c = [];
      for (let x = Math.ceil(Math.max(f, MISE_EN_LIGNE) / P) * P; x <= Math.min(t, MAINTENANT) && c.length < 2000; x += P) c.push({ time: x, open: prix(x), high: prix(x) + 1, low: prix(x) - 1, close: prix(x), volume: 1 });
      return { ok: true, json: async () => ({ candles: c, more_candles: false }) };
    }
    const s = +u.searchParams.get('startTime'), e = +u.searchParams.get('endTime') || MAINTENANT, L = [];
    for (let x = Math.ceil(Math.max(s, DEBUT_BINANCE) / P) * P; x <= Math.min(e, MAINTENANT) && L.length < 1500; x += P) { const p = prix(x) - 5; L.push([x, p, p + 1, p - 1, p, 10, x + P - 1, 40000, 5, 6]); }
    return { ok: true, json: async () => L };
  };
}
eq(fenetres(0, 10, 1, 4), [{ de: 6, a: 10 }, { de: 2, a: 6 }, { de: 0, a: 2 }], 'fenêtres de la plus récente à la plus ancienne');
ok(PROFONDEUR.M5 >= 30 && PROFONDEUR.M15 >= 182 && PROFONDEUR.H1 >= 730, 'profondeurs demandées : 30 j M5, 6 mois M15, 2 ans H1');

// M5 : 30 jours entièrement dans Kraken (pas de référence)
let a = []; const H5 = await chargerHistorique('M5', { maintenant: MAINTENANT, fetchFn: faux('M5', a) });
ok(H5.k.length >= 30 * 288 - 2, `M5 : au moins 30 jours de Kraken (${H5.k.length} bougies)`); eq(H5.ref.length, 0, 'M5 : pas de référence nécessaire'); eq(H5.krakenEpuise, false);
ok(H5.k.every((b, i) => !i || b.t - H5.k[i - 1].t === 5 * 60e3), 'M5 : aucune bougie manquante ni en double entre les pages');

// M15 : 6 mois → Kraken depuis la mise en ligne, référence avant
a = []; const H15 = await chargerHistorique('M15', { maintenant: MAINTENANT, fetchFn: faux('M15', a) });
eq(H15.k[0].t, MISE_EN_LIGNE, 'M15 : Kraken jusqu’à la mise en ligne du perpétuel'); eq(H15.krakenEpuise, true, 'M15 : Kraken épuisé');
ok(H15.ref.length > 0 && H15.ref[H15.ref.length - 1].t < MISE_EN_LIGNE, 'M15 : la référence ne couvre que l’avant-perpétuel');
ok(MAINTENANT - H15.debut >= 182 * JOUR, 'M15 : 6 mois affichables');
const S = serieAffichee(H15, H15.k, 5);
ok(S.every((b, i) => !i || b.t > S[i - 1].t), 'série affichée strictement croissante (référence puis Kraken)');
ok(S.filter(b => b.ref).length === H15.ref.length && S.find(b => !b.ref).t === MISE_EN_LIGNE, 'référence marquée « ref », Kraken non marqué');
const r0 = H15.ref[0]; eq(S[0].c, r0.c + 5, 'référence décalée de l’écart mesuré (+5 $)'); eq(decalerBougies([{ t: 1, o: 1, h: 2, l: 0, c: 1, v: 3 }], null)[0].c, 1, 'écart inconnu : aucun décalage inventé');
ok(H15.vol.length >= H15.k.length, 'volume Binance sur toute la période');

// H1 : 2 ans demandés, la référence s'arrête au début de sa série
a = []; const H1 = await chargerHistorique('H1', { maintenant: MAINTENANT, fetchFn: faux('H1', a) });
eq(H1.refEpuise, true, 'H1 : début de la série de référence atteint'); ok(H1.ref[0].t >= DEBUT_BINANCE && H1.ref[0].t < DEBUT_BINANCE + 2 * 3600e3, 'H1 : référence depuis le début de sa série');

// glisser vers la gauche : M5, un morceau Kraken de plus, puis la référence quand Kraken est épuisé
a = []; let H = H5; const f5 = faux('M5', a), avant = H.k[0].t;
H = await chargerPlusAncien(H, { fetchFn: f5 }); ok(H.k[0].t === avant - 2000 * 5 * 60e3, 'morceau plus ancien : 2000 bougies Kraken de plus');
for (let i = 0; i < 20 && !H.krakenEpuise; i++) H = await chargerPlusAncien(H, { fetchFn: f5 });
eq(H.k[0].t, MISE_EN_LIGNE, 'on remonte jusqu’à la mise en ligne, pas avant');
const nRef = H.ref.length; H = await chargerPlusAncien(H, { fetchFn: f5 }); ok(H.ref.length > nRef && H.ref.at(-1).t < MISE_EN_LIGNE, 'ensuite : la référence complète, avant le perpétuel');
console.log(`historique-test : ${n} vérifications OK`);
