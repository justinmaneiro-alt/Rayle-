/* Génère la liste de référence des flèches de « Direct (v7 validée) » sur la série Kraken : node agent-trading/archives/direct-v7-valide/liste-reference.mjs */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as V7 from '../../front/or/fleches-simples-v7.js'; import { zonesDirect } from '../../front/or/zones-direct.js'; import { serie13 } from '../../recherche-or/fleches-v6-diag.mjs';
const ici = path.dirname(fileURLToPath(import.meta.url)), K = serie13(), r = V7.calculer(K, zonesDirect, { maintenant: K.at(-1).t + 3600e3, bougies: 1e5 });
const L = r.fleches.map(f => [f.id, f.type, f.dir, f.tCloture, !!f.contre, !!f.invalidee].join('|'));
if (process.argv[1] === fileURLToPath(import.meta.url)) { fs.writeFileSync(path.join(ici, 'liste-reference.json'), JSON.stringify({ serie: 'recherche-or/donnees/kraken-xau-h1-13-nov.json', n: K.length, flèches: L }, null, 1)); console.log(L.length, 'flèches'); }
export { L };
