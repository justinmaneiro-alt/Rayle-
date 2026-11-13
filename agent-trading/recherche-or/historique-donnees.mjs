/* Télécharge l'historique H1 : Kraken PF_XAUUSD (api charts) et Binance XAUUSDT (futures), en fichiers de recherche-or/donnees/ (ignorés par git).
   node agent-trading/recherche-or/historique-donnees.mjs */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const D = path.join(path.dirname(fileURLToPath(import.meta.url)), 'donnees'), H = 3600e3;
const j = async u => { for (let k = 0; k < 4; k++) { try { const r = await fetch(u); if (r.ok) return r.json(); } catch (e) { /* nouvel essai */ } await new Promise(r => setTimeout(r, 1500)); } throw new Error('échec ' + u); };
// Kraken : fenêtres de 2000 bougies
const kr = new Map(); let a = Math.floor(Date.now() / 1000);
for (let n = 0; n < 40; n++) { const de = a - 2000 * 3600; const r = await j(`https://futures.kraken.com/api/charts/v1/trade/PF_XAUUSD/1h?from=${de}&to=${a}`); const L = r.candles || []; for (const c of L) kr.set(c.time, [c.time, +c.open, +c.high, +c.low, +c.close, +c.volume]); if (!L.length && n > 3) break; a = de; if (kr.size && a < 1.6e9) break; }
const K = [...kr.values()].sort((x, y) => x[0] - y[0]); fs.writeFileSync(path.join(D, 'kraken-xau-h1-historique.json'), JSON.stringify(K));
console.log('Kraken', K.length, new Date(K[0][0]).toISOString(), new Date(K.at(-1)[0]).toISOString());
// Binance : 1500 par page
const bn = []; let t0 = Date.UTC(2025, 11, 1);
for (;;) { const r = await j(`https://fapi.binance.com/fapi/v1/klines?symbol=XAUUSDT&interval=1h&startTime=${t0}&limit=1500`); if (!r.length) break; for (const c of r) bn.push([c[0], +c[1], +c[2], +c[3], +c[4], +c[5]]); t0 = r.at(-1)[0] + H; if (r.length < 1500) break; }
fs.writeFileSync(path.join(D, 'binance-xauusdt-h1-historique.json'), JSON.stringify(bn));
console.log('Binance', bn.length, new Date(bn[0][0]).toISOString(), new Date(bn.at(-1)[0]).toISOString());
