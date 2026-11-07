/* ═════════════ SOURCES DE L'OR (navigateur ou Node : fetch injectable) ═════════════
   Kraken PF_XAUUSD : par le relais dédié « rayle-or-relais » (Kraken n'envoie pas d'en-tête CORS). Binance XAUUSDT : en direct (CORS ouvert).
   Erreurs explicites, jamais de bougie inventée. */
import { RELAIS, BINANCE, PERIODES } from './config-or.js';
import { depuisKraken, depuisBinance, fusionner } from './bougies-or.js';

async function json(url, fetchFn, ms = 12000) {
  const r = await fetchFn(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined });
  if (!r.ok) throw new Error(`${new URL(url).host} a répondu ${r.status}`);
  return r.json();
}
/* bougies Kraken récentes (≤ 2000 par appel : limite de l'API) */
export async function bougiesKraken(periode, { n = 1500, fetchFn = fetch, relais = RELAIS, maintenant = Date.now() } = {}) {
  const P = PERIODES[periode], from = Math.floor((maintenant - n * P.ms) / 1000);
  return depuisKraken(await json(`${relais}/kraken/bougies?res=${P.kraken}&from=${from}`, fetchFn));
}
export async function tickerKraken({ fetchFn = fetch, relais = RELAIS } = {}) { const d = await json(`${relais}/kraken/ticker`, fetchFn); return d.ticker || null; }
export async function instrumentKraken({ fetchFn = fetch, relais = RELAIS } = {}) { const d = await json(`${relais}/kraken/instrument`, fetchFn); return d.instrument || null; }

/* bougies Binance entre deux instants (pagination par 1500) */
export async function bougiesBinance(periode, { depuis, jusqua = Date.now(), fetchFn = fetch, max = 60 } = {}) {
  const P = PERIODES[periode]; let t = depuis, tout = [];
  for (let k = 0; k < max && t < jusqua; k++) {
    const L = depuisBinance(await json(`${BINANCE.klines}?symbol=${BINANCE.symbole}&interval=${P.binance}&startTime=${t}&limit=1500`, fetchFn));
    if (!L.length) break; tout = fusionner(tout, L); const der = L[L.length - 1].t; if (der + P.ms <= t) break; t = der + P.ms;
    if (L.length < 1500) break;
  }
  return tout.filter(b => b.t < jusqua);
}
export async function ticker24hBinance({ fetchFn = fetch } = {}) { return json(`${BINANCE.ticker}?symbol=${BINANCE.symbole}`, fetchFn); }
