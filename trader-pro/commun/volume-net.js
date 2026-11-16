/* ═════════════ VOLUME NET ENTRANT / SORTANT (achats agresseurs − ventes agresseurs) ═════════════
   « Agresseur » = l'ordre au marché qui prend la liquidité. Volume net en USD = achats agresseurs − ventes agresseurs, déjà multiplié par le prix (en valeur).
   VRAIES données gratuites : Binance publie, pour chaque bougie, le volume acheté par les agresseurs (« taker buy ») : or (futures XAUUSDT), Bitcoin (BTCUSDT), Solana (SOLUSDT) ; valeur en USDT ≈ USD.
   Pas de données acheteur / vendeur gratuites pour les indices (Nasdaq 100, S&P 500) : on propose une ESTIMATION clairement étiquetée (pression de la bougie × volume de l'indice, en titres, PAS en dollars)
   ou « non disponible ». Aucun faux chiffre : chaque série porte sa source (« réel » / « estimation ») et son unité. Module PUR (fetch injectable), testé. */

export const SOURCES_FLUX = Object.freeze({
  or: { type: 'binance-futures', symbole: 'XAUUSDT', nom: 'Binance Futures XAUUSDT (taker buy)' },
  btc: { type: 'binance-spot', symbole: 'BTCUSDT', nom: 'Binance BTCUSDT (taker buy)' },
  sol: { type: 'binance-spot', symbole: 'SOLUSDT', nom: 'Binance SOLUSDT (taker buy)' }
});
export const INTERVALLES = Object.freeze({ H1: '1h', H4: '4h', J: '1d' });
export const urlKlines = (src, unite, limite = 200) => (src.type === 'binance-futures' ? 'https://fapi.binance.com/fapi/v1/klines' : 'https://data-api.binance.vision/api/v3/klines') + `?symbol=${src.symbole}&interval=${INTERVALLES[unite]}&limit=${limite}`;

/* klines Binance : [ouverture, o, h, l, c, volume, fermeture, volumeEnQuote, nbTrades, achatsAgresseursBase, achatsAgresseursQuote, ignore] */
export function depuisKlinesBinance(K) {
  return (K || []).filter(k => Array.isArray(k) && k.length >= 11).map(k => {
    const total = +k[7], achats = +k[10], ventes = total - achats; return { t: +k[0], achats, ventes, net: achats - ventes, total, c: +k[4], reel: true };
  }).filter(x => Number.isFinite(x.t) && Number.isFinite(x.net) && x.total >= 0);
}
/* estimation à partir de bougies { t, o, h, l, c, v } : pression = (2c − h − l) / (h − l) ∈ [−1, 1] ; net = pression × volume (× prix si `enValeur`). JAMAIS présentée comme réelle. */
export function estimationBougies(B, { enValeur = false } = {}) {
  return (B || []).filter(b => b.v > 0 && b.h > b.l).map(b => { const p = (2 * b.c - b.h - b.l) / (b.h - b.l), m = enValeur ? b.v * b.c : b.v; return { t: b.t, net: p * m, total: m, achats: m * (1 + p) / 2, ventes: m * (1 - p) / 2, c: b.c, reel: false }; });
}
/* cumul des barres (en partant de zéro au début de la plage) */
export function cumul(L) { let s = 0; return (L || []).map(x => ({ t: x.t, v: (s += x.net) })); }
/* jours pour le score : regroupe des barres H1 / H4 / J en jours UTC (un jour = somme de ses barres) */
export function enJours(L) {
  const m = new Map(); for (const x of L || []) { const j = Math.floor(x.t / 86400e3) * 86400e3, o = m.get(j) || { t: j, net: 0, total: 0, achats: 0, ventes: 0 }; o.net += x.net; o.total += x.total; o.achats += x.achats; o.ventes += x.ventes; m.set(j, o); }
  return [...m.values()].sort((a, b) => a.t - b.t);
}
/* résumé d'une plage : { net, achats, ventes, total, partNette } */
export function resume(L) { const net = L.reduce((s, x) => s + x.net, 0), tot = L.reduce((s, x) => s + x.total, 0), ach = L.reduce((s, x) => s + x.achats, 0); return { net, achats: ach, ventes: tot - ach, total: tot, partNette: tot ? net / tot : null }; }

/* lecture complète d'un actif pour une unité : renvoie { source: 'reel' | 'estimation' | null, unite: 'USD' | 'titres', nom, barres, raison } ; `bougies` = repli (bougies de l'instantané pro pour cette unité) */
export async function lireFlux(id, unite, { fetchFn = (typeof fetch !== 'undefined' ? fetch : null), bougies = [], delai = 8000, limite = 200 } = {}) {
  const src = SOURCES_FLUX[id]; let erreur = null;
  if (src && fetchFn) {
    try {
      const r = await fetchFn(urlKlines(src, unite, limite), { signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(delai) : undefined });
      if (!r.ok) throw new Error('Binance a répondu ' + r.status); const L = depuisKlinesBinance(await r.json());
      if (L.length >= 5) return { source: 'reel', unite: 'USD', nom: src.nom, barres: L, raison: null };
      throw new Error('réponse trop courte');
    } catch (e) { erreur = String(e && e.message || e); }
  }
  /* pas de source réelle (indices) ou elle a échoué : estimation si des volumes existent, sinon « non disponible » */
  const indice = id === 'us100' || id === 'us500', usd = id === 'btc' || id === 'sol', E = estimationBougies(bougies, { enValeur: usd });   // volume Yahoo des cryptos = déjà en USD ; or : contrats / onces ; indices : titres
  if (E.length >= 5) return { source: 'estimation', unite: usd ? 'USD' : indice ? 'titres' : 'unités de volume', nom: 'estimation à partir des bougies (pression de la bougie × volume)' + (indice ? ' ; volume de l’indice en titres, pas en dollars' : usd ? '' : ' ; volume en contrats / onces, pas en dollars'), barres: E.slice(-limite), raison: erreur ? 'données réelles indisponibles (' + erreur + ')' : 'pas de données acheteur / vendeur gratuites pour cet actif' };
  return { source: null, unite: null, nom: null, barres: [], raison: (erreur ? 'données réelles indisponibles (' + erreur + ') et ' : '') + 'aucun volume exploitable : non disponible' };
}
