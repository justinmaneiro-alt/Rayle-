/* Test RÉSEAU (vraies API) : les bougies du graphique (relais rayle-or-relais) sont exactement celles de l'API Kraken ; le relais répond ;
   la taille du contrat est celle de Kraken ; l'écart Kraken − Binance est mesurable. Usage : node agent-trading/tests/or-reseau-test.mjs */
import assert from 'node:assert/strict';
import { bougiesKraken, instrumentKraken, bougiesBinance } from '../front/or/sources-or.js';
import { depuisKraken, ecartMesure } from '../front/or/bougies-or.js';
import { KRAKEN } from '../front/or/config-or.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
for (const per of ['M5', 'M15', 'H1', 'H4']) {
  const res = { M5: '5m', M15: '15m', H1: '1h', H4: '4h' }[per], now = Date.now();
  const relais = await bougiesKraken(per, { n: 50, maintenant: now });
  const from = Math.floor((now - 50 * { M5: 300, M15: 900, H1: 3600, H4: 14400 }[per] * 1000) / 1000);
  const direct = depuisKraken(await (await fetch(`https://futures.kraken.com/api/charts/v1/trade/PF_XAUUSD/${res}?from=${from}`)).json());
  const m = new Map(direct.map(b => [b.t, b])), communes = relais.slice(0, -1).filter(b => m.has(b.t));   // la dernière bougie peut bouger entre les deux appels
  ok(communes.length >= 10, `${per} : bougies communes`);
  for (const b of communes) { const d = m.get(b.t); assert.deepEqual([b.o, b.h, b.l, b.c], [d.o, d.h, d.l, d.c], `${per} : prix de la bougie ${new Date(b.t).toISOString()} identiques à l'API Kraken`); assert.ok(Math.abs(b.v - d.v) <= 1e-6 * Math.max(1, d.v), `${per} : volume identique`); }
  n++;
}
const ins = await instrumentKraken(); ok(ins && ins.contractSize === KRAKEN.tailleContrat && ins.tickSize === KRAKEN.pasPrix && ins.contractValueTradePrecision === 3, 'contrat Kraken : 1 once, pas 0,01, précision 0,001');
const k = await bougiesKraken('M15', { n: 100 }), b = await bougiesBinance('M15', { depuis: Date.now() - 100 * 900e3 }); const e = ecartMesure(k, b);
ok(e.ecart != null && Math.abs(e.ecart) < 40, 'écart Kraken − Binance mesuré : ' + e.ecart);
console.log(`or-reseau-test : ${n} vérifications OK (écart ${e.ecart?.toFixed(2)} $)`);
