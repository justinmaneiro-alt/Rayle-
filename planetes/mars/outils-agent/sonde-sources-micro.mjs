// Sonde REELLE (depuis ce PC) des sources gratuites de financement, interet ouvert, liquidations, ratios long/short des contrats a terme BTC.
// Pour chaque source : statut HTTP, delai, en-tete CORS (utilisable depuis le navigateur ?), forme de la reponse, profondeur d'historique. Aucune cle, aucun secret.
// Lancer :  node planetes/mars/outils-agent/sonde-sources-micro.mjs   (ecrit docs/sources-micro-btc.json)
import fs from 'node:fs';
const ORIGINE = 'http://127.0.0.1:8000';
const S = [
  ['binance_funding', 'Binance : historique du financement (8 h)', 'https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=3'],
  ['binance_funding_ancien', 'Binance : financement, plus ancien (profondeur)', 'https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&startTime=1569888000000&limit=2'],
  ['binance_premium', 'Binance : indice de prime et financement en cours', 'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT'],
  ['binance_oi', 'Binance : interet ouvert actuel', 'https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT'],
  ['binance_oi_hist', 'Binance : interet ouvert historique (5 min)', 'https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=5m&limit=3'],
  ['binance_ls', 'Binance : ratio long/short des comptes', 'https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=5m&limit=3'],
  ['binance_taker', 'Binance : ratio acheteur/vendeur agressif (contrats)', 'https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=5m&limit=3'],
  ['binance_liq', 'Binance : ordres de liquidation', 'https://fapi.binance.com/fapi/v1/allForceOrders?symbol=BTCUSDT&limit=3'],
  ['bybit_funding', 'Bybit : historique du financement', 'https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=3'],
  ['bybit_oi', 'Bybit : interet ouvert historique (15 min)', 'https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=15min&limit=3'],
  ['okx_funding', 'OKX : historique du financement', 'https://www.okx.com/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=3'],
  ['okx_liq', 'OKX : liquidations recentes', 'https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&uly=BTC-USDT&state=filled&limit=3'],
  ['okx_oi', 'OKX : interet ouvert et volume (rubik)', 'https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=BTC&period=1H'],
  ['deribit_funding', 'Deribit : historique du financement (perpetuel)', 'https://www.deribit.com/api/v2/public/get_funding_rate_history?instrument_name=BTC-PERPETUAL&start_timestamp=1700000000000&end_timestamp=1700100000000'],
  ['binance_vision_liste', 'data.binance.vision : liste des archives de metriques (OI, ratios) des contrats USD-M', 'https://data.binance.vision/?prefix=data/futures/um/daily/metrics/BTCUSDT/&delimiter=/'],
  ['binance_vision_liq', 'data.binance.vision : archives de liquidations', 'https://data.binance.vision/?prefix=data/futures/um/daily/liquidationSnapshot/BTCUSDT/&delimiter=/']
];
const resultats = [];
for (const [id, nom, url] of S) {
  const t0 = Date.now(); const r = { id, nom, url, date: new Date().toISOString() };
  try {
    const rep = await fetch(url, { headers: { Origin: ORIGINE, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    r.statut = rep.status; r.ms = Date.now() - t0; r.cors = rep.headers.get('access-control-allow-origin') || null;
    const txt = await rep.text(); r.octets = txt.length;
    try { const j = JSON.parse(txt); r.json = true; r.extrait = JSON.stringify(j).slice(0, 260); } catch (e) { r.json = false; r.extrait = txt.replace(/\s+/g, ' ').slice(0, 200); }
  } catch (e) { r.erreur = String(e.message || e).slice(0, 150); r.ms = Date.now() - t0; }
  resultats.push(r); console.log((r.statut || 'ERR') + '\t' + (r.cors ? 'CORS:' + r.cors : 'sans CORS') + '\t' + r.ms + ' ms\t' + id + '\t' + (r.extrait || r.erreur || '').slice(0, 110));
  await new Promise(r => setTimeout(r, 300));
}
fs.writeFileSync(new URL('../../../docs/sources-micro-btc.json', import.meta.url), JSON.stringify({ sondeLe: new Date().toISOString(), depuis: 'PC de Justin (France), Node', resultats }, null, 1));
