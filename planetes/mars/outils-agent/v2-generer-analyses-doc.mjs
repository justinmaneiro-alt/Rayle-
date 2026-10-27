// Génère docs/ANALYSES_SOURCES.md (registre + fiches + sondage réel).   Lancer :  node planetes/mars/outils-agent/v2-generer-analyses-doc.mjs
import fs from 'node:fs';
import { REGISTRE_FLUX } from '../pc/finance/flux-calcul.js';
import { documentSources, FICHES } from '../pc/finance/analyses-calcul.js';
const chemin = new URL('../../../docs/resultats-v2/sources-analyses.json', import.meta.url), sonde = fs.existsSync(chemin) ? JSON.parse(fs.readFileSync(chemin, 'utf8')) : null;
fs.writeFileSync(new URL('../../../docs/ANALYSES_SOURCES.md', import.meta.url), documentSources(REGISTRE_FLUX.filter(f => FICHES[f.id]), sonde) + '\n');
console.log(Object.keys(FICHES).length + ' sources décrites dans docs/ANALYSES_SOURCES.md');
