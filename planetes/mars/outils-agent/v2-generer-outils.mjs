// Génère docs/OUTILS_TERMINAL.md depuis la table de la voix.   Lancer :  node planetes/mars/outils-agent/v2-generer-outils.mjs
import fs from 'node:fs';
import { documentMarkdown, OUTILS } from '../pc/agents-v2/outils-terminal.js';
fs.writeFileSync(new URL('../../../docs/OUTILS_TERMINAL.md', import.meta.url), documentMarkdown() + '\n');
console.log(OUTILS.length + ' outils écrits dans docs/OUTILS_TERMINAL.md');
