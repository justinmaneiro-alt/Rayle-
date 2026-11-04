/* Lance tous les tests Node de l'agent de trading : `cd agent-trading && npm test`.
   Les tests du moteur (hors dépôt) ne tournent que s'il est présent. Données de test dans un dossier temporaire (jamais les vraies). */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ici = path.dirname(fileURLToPath(import.meta.url)), racine = path.join(ici, '..');
const liste = [path.join(ici, 'front-test.mjs')];
const mt = path.join(racine, 'moteur', 'tests');
if (fs.existsSync(mt)) for (const f of ['phase1-test.mjs', 'rejouer-test.mjs', 'phase2-test.mjs', 'phase3-test.mjs', 'phase5-test.mjs', 'prix-unique-test.mjs', 'grandes-test.mjs', 'strategie-v2-test.mjs', 'strategie-v3-test.mjs']) liste.push(path.join(mt, f));
const env = Object.assign({}, process.env, { AGENT_TRADING_DONNEES: fs.mkdtempSync(path.join(os.tmpdir(), 'agent-trading-test-')) });
let echec = false;
for (const f of liste) { const r = spawnSync(process.execPath, [f], { stdio: 'inherit', env, cwd: racine }); if (r.status !== 0) echec = true; }
console.log(echec ? 'CERTAINS TESTS ÉCHOUENT' : 'tous les tests passent'); process.exit(echec ? 1 : 0);
