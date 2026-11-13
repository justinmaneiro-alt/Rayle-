/* Sceau des règles de la v8 « Direct » avant l'étude de l'historique (plus d'historique de flèches + bilan honnête).
   node agent-trading/recherche-or/historique-sceller.mjs [--verifier]   → historique-fleches-sceau.json
   Hash SHA-256 (fins de ligne normalisées) de tous les fichiers de règles atteints par import depuis fleches-simples-v8.js et zones-direct.js, + des paramètres P. */
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ici = path.dirname(fileURLToPath(import.meta.url)), FRONT = path.join(ici, '../front/or'), SORTIE = path.join(ici, 'historique-fleches-sceau.json');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
export function fichiersRegles() {
  const vus = new Set(), pile = ['fleches-simples-v8.js', 'zones-direct.js', 'signal-niveaux.js'];
  while (pile.length) { const f = pile.pop(); if (vus.has(f)) continue; vus.add(f); const t = fs.readFileSync(path.join(FRONT, f), 'utf8'); for (const m of t.matchAll(/(?:import|export)[^'"\n]*?from\s*['"]\.\/([^'"]+\.js)['"]/g)) pile.push(m[1]); for (const m of t.matchAll(/import\s*['"]\.\/([^'"]+\.js)['"]/g)) pile.push(m[1]); }
  return [...vus].sort();
}
export async function sceau() {
  const fichiers = {}; for (const f of fichiersRegles()) fichiers[f] = sha(fs.readFileSync(path.join(FRONT, f), 'utf8').replace(/\r\n/g, '\n'));
  const V8 = await import(pathToFileURL(path.join(FRONT, 'fleches-simples-v8.js')).href);
  const params = JSON.stringify(V8.P, Object.keys(V8.P).sort());
  return { version: V8.VERSION, fichiers, parametres: JSON.parse(params), sha256Parametres: sha(params), sha256Global: sha(JSON.stringify(fichiers) + params) };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await sceau();
  if (process.argv.includes('--verifier')) { const ref = JSON.parse(fs.readFileSync(SORTIE, 'utf8')); const ok = ref.sha256Global === s.sha256Global; console.log(ok ? 'sceau identique : ' + s.sha256Global : 'SCEAU DIFFÉRENT (règles modifiées)'); process.exit(ok ? 0 : 1); }
  s.scelleLe = new Date().toISOString(); fs.writeFileSync(SORTIE, JSON.stringify(s, null, 1) + '\n'); console.log('sceau écrit', s.sha256Global, Object.keys(s.fichiers).length, 'fichiers');
}
