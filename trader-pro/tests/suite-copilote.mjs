/* Lance, l'un après l'autre, tous les tests du copilote (moteur de lecture, connaissances, réseau d'information, annonces, points, copilote en direct, Workers).
   Pourquoi un lanceur : la ligne « npm test » dépassait la longueur maximale d'une commande Windows. Usage : node trader-pro/tests/suite-copilote.mjs */
import { spawnSync } from 'node:child_process';
const TESTS = ['lecture-test', 'lecture-worker-test', 'connaissances-test', 'reseau-test', 'reseau-worker-test', 'reseau-ui-test', 'annonce-test', 'point-test', 'point-voix-test', 'copilote-test', 'copilote-worker-test', 'phase5-test'];
let echecs = 0;
for (const t of TESTS) {
  const r = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning', `trader-pro/tests/${t}.mjs`], { encoding: 'utf8' });
  const derniere = String(r.stdout || '').trim().split('\n').pop();
  if (r.status !== 0) { echecs++; console.log(`✗ ${t} : ${derniere}\n${String(r.stdout || '').split('\n').filter(l => /✗/.test(l)).join('\n')}${r.stderr ? '\n' + String(r.stderr).slice(0, 600) : ''}`); } else console.log(`✓ ${t} : ${derniere}`);
}
console.log(echecs ? `${echecs} suite(s) en échec` : 'copilote : tous les tests passent'); process.exit(echecs ? 1 : 0);
