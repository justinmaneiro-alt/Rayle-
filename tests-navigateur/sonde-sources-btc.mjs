/* Sonde des sources gratuites de bougies Bitcoin (M3a) : depuis ce poste (Node) et en indiquant l'en-tête CORS (donc utilisable DIRECTEMENT par le navigateur de Rayle).
   Pour chaque source : répond ? combien de bougies M15 par requête ? profondeur d'historique (une requête très ancienne) ? volume acheteur/vendeur fourni ? latence.
   Sortie : tableau et JSON (docs/sources-btc.json). Les adresses viennent de planetes/mars/pc/agent-btc/sources.js quand il existe ; sinon la sonde a les siennes. */
const ORIGINE = 'http://127.0.0.1:8000';
const il_y_a = jours => Date.now() - jours * 86400e3;
const SOURCES = {
  'Binance (api.binance.com)': { url: `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=1000`, ancien: `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=1000&startTime=${Date.UTC(2022, 0, 1)}`, nb: j => j.length, t0: j => j[0][0], delta: j => j[0].length >= 10 },
  'Binance (data-api.binance.vision)': { url: `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=1000`, ancien: `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=1000&startTime=${Date.UTC(2022, 0, 1)}`, nb: j => j.length, t0: j => j[0][0], delta: j => j[0].length >= 10 },
  'Binance US (api.binance.us)': { url: `https://api.binance.us/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=1000`, ancien: `https://api.binance.us/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=1000&startTime=${Date.UTC(2022, 0, 1)}`, nb: j => j.length, t0: j => j[0][0], delta: j => j[0].length >= 10 },
  'Kraken': { url: `https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=15`, ancien: `https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=15&since=${Math.floor(Date.UTC(2022, 0, 1) / 1000)}`, nb: j => (j.result[Object.keys(j.result).find(k => k !== 'last')] || []).length, t0: j => j.result[Object.keys(j.result).find(k => k !== 'last')][0][0] * 1000, delta: () => false },
  'Bitstamp': { url: `https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=900&limit=1000`, ancien: `https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=900&limit=1000&start=${Math.floor(Date.UTC(2022, 0, 1) / 1000)}`, nb: j => j.data.ohlc.length, t0: j => j.data.ohlc[0].timestamp * 1000, delta: () => false },
  'Coinbase Exchange': { url: `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=900`, ancien: `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=900&start=2022-01-01T00:00:00Z&end=2022-01-04T00:00:00Z`, nb: j => j.length, t0: j => j[j.length - 1][0] * 1000, delta: () => false },
  'OKX': { url: `https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=15m&limit=300`, ancien: `https://www.okx.com/api/v5/market/history-candles?instId=BTC-USDT&bar=15m&limit=100&after=${Date.UTC(2022, 0, 4)}`, nb: j => j.data.length, t0: j => +j.data[j.data.length - 1][0], delta: () => false },
  'Bybit': { url: `https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=15&limit=1000`, ancien: `https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=15&limit=1000&end=${Date.UTC(2022, 0, 15)}`, nb: j => j.result.list.length, t0: j => +j.result.list[j.result.list.length - 1][0], delta: () => false },
  'Bitfinex': { url: `https://api-pub.bitfinex.com/v2/candles/trade:15m:tBTCUSD/hist?limit=1000`, ancien: `https://api-pub.bitfinex.com/v2/candles/trade:15m:tBTCUSD/hist?limit=1000&start=${Date.UTC(2022, 0, 1)}&sort=1`, nb: j => j.length, t0: j => j[j.length - 1][0], delta: () => false },
  'Gemini': { url: `https://api.gemini.com/v2/candles/btcusd/15m`, ancien: null, nb: j => j.length, t0: j => j[j.length - 1][0], delta: () => false }
};
async function essayer(nom, s, ancien) {
  const url = ancien ? s.ancien : s.url, d0 = Date.now(), r = { requete: ancien ? 'historique 2022' : 'récent' };
  if (!url) return { ...r, ok: null, note: 'pas testé' };
  try {
    const rep = await fetch(url, { headers: { Origin: ORIGINE, 'User-Agent': 'Mozilla/5.0 Rayle-sonde' }, signal: AbortSignal.timeout(15000) });
    r.http = rep.status; r.cors = rep.headers.get('access-control-allow-origin') || null; r.ms = Date.now() - d0;
    if (!rep.ok) { r.ok = false; r.erreur = (await rep.text()).slice(0, 90); return r; }
    const j = await rep.json(); r.ok = true; r.bougies = s.nb(j); const t0 = s.t0(j); r.plusAncienne = new Date(t0).toISOString().slice(0, 16); r.delta = s.delta(j);
  } catch (e) { r.ok = false; r.erreur = String(e.cause && e.cause.code || e.message).slice(0, 90); r.ms = Date.now() - d0; }
  return r;
}
const sortie = {};
for (const [nom, s] of Object.entries(SOURCES)) {
  const a = await essayer(nom, s, false), b = await essayer(nom, s, true);
  sortie[nom] = { recent: a, historique: b };
  console.log(nom.padEnd(36), a.ok ? `OK ${a.http} ${a.bougies} bougies, CORS=${a.cors || 'NON'}, ${a.ms} ms, plus ancienne ${a.plusAncienne}, split acheteur/vendeur=${a.delta}` : `ÉCHEC ${a.http || ''} ${a.erreur}`);
  console.log(''.padEnd(36), b.ok === null ? '(historique non testé)' : b.ok ? `historique 2022 → ${b.bougies} bougies dès ${b.plusAncienne} (${b.ms} ms)` : `historique ÉCHEC ${b.http || ''} ${b.erreur}`);
}
import fs from 'node:fs';
fs.mkdirSync('../docs', { recursive: true });
fs.writeFileSync('../docs/sources-btc.json', JSON.stringify({ date: new Date().toISOString(), depuis: 'PC de développement (Node, France)', sortie }, null, 1));
