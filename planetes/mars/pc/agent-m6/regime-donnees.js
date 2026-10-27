import { URL_FUNDING } from './paires.js';

/* ═════════════ DONNÉES GRATUITES DU RÉGIME (M6) : financement, peur et cupidité, capitalisation mondiale ═════════════
   Vérifiées EN VRAI le 2026-10-23 depuis le PC (France), toutes avec « Access-Control-Allow-Origin: * » (appel direct du navigateur, sans clé) :
   - Binance fapi /fundingRate (BTC, SOL, DOGE perpétuels USDT) : jusqu'à 1000 taux par appel, un toutes les 8 h ;
   - alternative.me /fng/ : indice peur et cupidité (1 valeur par jour) ;
   - CoinGecko /api/v3/global : capitalisation mondiale, variation sur 24 h, dominance du bitcoin (limite gratuite d'environ 10 à 30 appels par minute : cache de 10 minutes).
   Kraken Futures publie aussi le financement mais sans CORS (donc non appelable depuis la page). Chaque lecture rend { etat: 'reel' | 'indisponible', … } : une panne est dite, jamais comblée. `lire(url)` est injecté. */
export const URL_FNG = 'https://api.alternative.me/fng/?limit=1';
export const URL_GLOBAL = 'https://api.coingecko.com/api/v3/global';

export async function lireFinancement(paire, lire, depuis = Date.now() - 35 * 86400e3) {
  try {
    const j = await lire(URL_FUNDING(paire, depuis, 150)); if (!Array.isArray(j)) throw new Error('réponse inattendue');
    const liste = j.map(x => ({ t: +x.fundingTime, taux: +x.fundingRate })).filter(x => Number.isFinite(x.t) && Number.isFinite(x.taux)).sort((a, b) => a.t - b.t);
    return liste.length ? { etat: 'reel', liste, source: 'Binance fapi' } : { etat: 'indisponible', erreur: 'aucun taux reçu' };
  } catch (e) { return { etat: 'indisponible', erreur: String(e && e.message || e).slice(0, 120) }; }
}
export async function lireFearGreed(lire) {
  try { const j = await lire(URL_FNG), d = j && j.data && j.data[0]; if (!d) throw new Error('réponse inattendue'); return { etat: 'reel', valeur: +d.value, libelle: { 'Extreme Fear': 'peur extrême', Fear: 'peur', Neutral: 'neutre', Greed: 'cupidité', 'Extreme Greed': 'cupidité extrême' }[d.value_classification] || d.value_classification, t: +d.timestamp * 1000 }; }
  catch (e) { return { etat: 'indisponible', erreur: String(e && e.message || e).slice(0, 120) }; }
}
export async function lireGlobal(lire) {
  try { const j = await lire(URL_GLOBAL), d = j && j.data; if (!d || d.market_cap_change_percentage_24h_usd == null) throw new Error('réponse inattendue'); return { etat: 'reel', variation24h: d.market_cap_change_percentage_24h_usd, dominanceBtc: d.market_cap_percentage && d.market_cap_percentage.btc }; }
  catch (e) { return { etat: 'indisponible', erreur: String(e && e.message || e).slice(0, 120) }; }
}
/* Les trois d'un coup, avec cache (TTL en ms) ; `cache` est un objet { cle: { t, v } } conservé par l'appelant. */
export async function chargerContexteRegime({ paire, lire, cache = {}, ttl = 10 * 60e3, maintenant = Date.now() }) {
  const une = async (cle, f) => { const c = cache[cle]; if (c && maintenant - c.t < ttl) return c.v; const v = await f(); if (v.etat === 'reel') cache[cle] = { t: maintenant, v }; return v; };
  const [fin, fg, gl] = await Promise.all([une('fin:' + paire, () => lireFinancement(paire, lire)), une('fg', () => lireFearGreed(lire)), une('global', () => lireGlobal(lire))]);
  return { funding: fin.etat === 'reel' ? fin.liste : null, financementEtat: fin, fearGreed: fg, global: gl };
}
