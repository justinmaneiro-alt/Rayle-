/* PHASE 1 : télécharge l'historique XAU/USD de Dukascopy (gratuit) par année : M15 (bid), H1 bid et H1 ask (pour le spread). Reprend là où il s'est arrêté.
   Usage : node telecharger.mjs [anneeDebut] [anneeFin]    Données : donnees/ (ignoré par git). Horodatages en UTC (millisecondes). */
import { getHistoricalRates } from 'dukascopy-node';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ici = path.dirname(fileURLToPath(import.meta.url)), D = path.join(ici, 'donnees');
const a0 = +process.argv[2] || 2003, a1 = +process.argv[3] || 2025;
for (let a = a0; a <= a1; a++) for (const [tf, pt, nom] of [['h1', 'bid', 'h1-bid'], ['h1', 'ask', 'h1-ask'], ['m15', 'bid', 'm15-bid']]) {
  const f = path.join(D, `xauusd-${nom}-${a}.json`); if (fs.existsSync(f)) continue;
  for (let essai = 1; essai <= 4; essai++) {
    try {
      const r = await getHistoricalRates({ instrument: 'xauusd', dates: { from: new Date(Date.UTC(a, 0, 1)), to: new Date(Date.UTC(a + 1, 0, 1)) }, timeframe: tf, priceType: pt, format: 'json', volumes: true, ignoreFlats: false, batchSize: 8, pauseBetweenBatchesMs: 300, useCache: false });
      fs.writeFileSync(f, JSON.stringify(r.map(b => [b.timestamp, b.open, b.high, b.low, b.close, b.volume]))); console.log(a, nom, r.length); break;
    } catch (e) { console.log(a, nom, 'essai', essai, String(e.message).slice(0, 100)); await new Promise(r => setTimeout(r, 3000 * essai)); }
  }
}
console.log('fini');
