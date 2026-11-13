/* Séries H1 de l'étude de l'historique des flèches (voir historique-donnees.mjs pour le téléchargement).
   composite() : référence Binance XAUUSDT DÉCALÉE de −4,88 $ avant la 1re bougie Kraken, puis Kraken PF_XAUUSD (comme le graphique de l'appli).  dukascopy() : XAU/USD spot (bid), 2003 → 2026-11-11. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { charger } from './donnees.mjs';
const D = path.join(path.dirname(fileURLToPath(import.meta.url)), 'donnees'), H = 3600e3;
export const DECALAGE_BINANCE = -4.88;
const lire = f => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).map(b => ({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
export function composite({ maintenant = Date.now() } = {}) {
  const K = lire('kraken-xau-h1-historique.json'), Bn = lire('binance-xauusdt-h1-historique.json'), t0 = K[0].t;
  const ref = Bn.filter(b => b.t < t0).map(b => ({ t: b.t, o: b.o + DECALAGE_BINANCE, h: b.h + DECALAGE_BINANCE, l: b.l + DECALAGE_BINANCE, c: b.c + DECALAGE_BINANCE, v: b.v, ref: true }));
  const S = [...ref, ...K].filter(b => b.t + H <= maintenant && b.c > 0), kn = new Map(K.map(b => [b.t, b])), ecarts = Bn.filter(b => kn.has(b.t)).map(b => kn.get(b.t).c - b.c).sort((x, y) => x - y);
  return { serie: S, nRef: ref.length, nKraken: S.length - ref.length, ecartMedian: ecarts.length ? ecarts[ecarts.length >> 1] : null, ecartN: ecarts.length };
}
export function dukascopy() { const { h1 } = charger({ debut: 2003, fin: 2026 }); return h1.map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })).filter(b => b.c > 0 && b.t + H <= Date.now()); }
