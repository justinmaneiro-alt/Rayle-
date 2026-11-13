/* Images d'exemple des signaux Telegram (données réelles Kraken H1) : node agent-trading/recherche-or/signal-exemples.mjs */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as V6 from '../front/or/fleches-simples-v6.js'; import { zonesDirect } from '../front/or/zones-direct.js'; import { pngSignal, legendeSignal } from '../signal-image.mjs'; import { serie13 } from './fleches-v6-diag.mjs';
const ici = path.dirname(fileURLToPath(import.meta.url)), sortie = path.join(ici, '..', '..', 'outils-restructuration', 'captures'), H = 3600e3;
const K = serie13(), r = V6.calculer(K, zonesDirect, { maintenant: K.at(-1).t + H, bougies: 1e5 });
const vente = r.fleches.find(f => f.type === 'retournement' && f.dir < 0 && !f.contre && f.tCloture === Date.UTC(2026, 10, 9, 21)), achat = r.fleches.find(f => f.type === 'retournement' && f.dir > 0 && !f.contre && f.tCloture === Date.UTC(2026, 10, 10, 10)), ma = r.fleches.find(f => f.type === 'ma_cassure' && f.dir < 0 && f.tCloture >= Date.UTC(2026, 10, 10));
fs.mkdirSync(sortie, { recursive: true });
for (const [nom, f] of [['vente', vente], ['achat', achat], ['ma200', ma]]) { if (!f) { console.log('pas de flèche pour', nom); continue; } const png = await pngSignal({ bougies: K, f }); fs.writeFileSync(path.join(sortie, `signal-exemple-${nom}.png`), png); console.log(nom, png.length, 'octets\n' + legendeSignal(f)); }
