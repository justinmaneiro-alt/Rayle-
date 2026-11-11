/* Télécharge les bougies DAILY des 10 actifs de l'étude de tendance (RAPPORT-TENDANCE-DAILY.md) dans donnees/ (ignoré par git).
   Dukascopy (dukascopy-node, gratuit, sans clé) : XAU/USD, EUR/USD, USD/JPY, USD/CHF, AUD/USD, GBP/USD, S&P 500 (usa500idxusd), Nasdaq 100 (usatechidxusd), prix bid, timeframe d1.
   Binance (API publique de données de marché, sans clé) : BTCUSDT et SOLUSDT, klines 1d (BTC depuis 2017-08, SOL depuis 2020-08 : pas d'historique avant). Yahoo n'est pas utilisé.
   Fichier : daily-<id>.json = [[t UTC ms, o, h, l, c, volume], …] en ordre croissant. Usage : node tendance-donnees.mjs */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { getHistoricalRates } from 'dukascopy-node';
const D = path.join(path.dirname(fileURLToPath(import.meta.url)), 'donnees'); fs.mkdirSync(D, { recursive: true });
const DUKA = { XAU: 'xauusd', EURUSD: 'eurusd', USDJPY: 'usdjpy', USDCHF: 'usdchf', AUDUSD: 'audusd', GBPUSD: 'gbpusd', SPX: 'usa500idxusd', NDX: 'usatechidxusd' };
const fin = new Date(Date.UTC(2026, 10, 12)), debut = new Date(Date.UTC(2011, 0, 1));
for (const [id, ins] of Object.entries(DUKA)) {
  const f = path.join(D, `daily-${id}.json`); if (fs.existsSync(f)) { console.log(id, 'déjà là'); continue; }
  for (let essai = 1; essai <= 4; essai++) {
    try { const r = await getHistoricalRates({ instrument: ins, dates: { from: debut, to: fin }, timeframe: 'd1', priceType: 'bid', format: 'json', volumes: true });
      fs.writeFileSync(f, JSON.stringify(r.map(b => [b.timestamp, b.open, b.high, b.low, b.close, b.volume]))); console.log(id, r.length, new Date(r[0].timestamp).toISOString().slice(0, 10), '→', new Date(r[r.length - 1].timestamp).toISOString().slice(0, 10)); break; }
    catch (e) { console.log(id, 'essai', essai, String(e.message).slice(0, 100)); await new Promise(r => setTimeout(r, 3000 * essai)); }
  }
}
for (const [id, sym, dep] of [['BTC', 'BTCUSDT', Date.UTC(2017, 7, 17)], ['SOL', 'SOLUSDT', Date.UTC(2020, 7, 11)]]) {
  const f = path.join(D, `daily-${id}.json`); if (fs.existsSync(f)) { console.log(id, 'déjà là'); continue; }
  const out = []; let t = dep;
  while (t < fin.getTime()) { const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=1d&startTime=${t}&limit=1000`); if (!r.ok) throw new Error('Binance ' + r.status); const L = await r.json(); if (!L.length) break; for (const k of L) out.push([k[0], +k[1], +k[2], +k[3], +k[4], +k[5]]); t = L[L.length - 1][0] + 86400e3; if (L.length < 1000) break; }
  fs.writeFileSync(f, JSON.stringify(out)); console.log(id, out.length, new Date(out[0][0]).toISOString().slice(0, 10), '→', new Date(out[out.length - 1][0]).toISOString().slice(0, 10));
}
