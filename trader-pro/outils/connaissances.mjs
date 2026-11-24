/* Génère trader-pro/point/connaissances-data.js à partir de docs/connaissances/*.md (le dossier docs/ n'est pas déployé : les textes sont embarqués).
   Usage : node trader-pro/outils/connaissances.mjs [--verifier]  (--verifier : échoue si le module généré n'est pas à jour) */
import fs from 'node:fs'; import path from 'node:path';
const racine = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), dossier = path.join(racine, 'docs/connaissances'), sortie = path.join(racine, 'trader-pro/point/connaissances-data.js');
export function lireConnaissances() {
  return fs.readdirSync(dossier).filter(f => /^\d\d-.*\.md$/.test(f)).sort().map(f => {
    const brut = fs.readFileSync(path.join(dossier, f), 'utf8').replace(/\r\n/g, '\n'), m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(brut); if (!m) throw new Error(f + ' : en-tête manquant');
    const meta = Object.fromEntries(m[1].split('\n').map(l => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
    return { id: meta.id, fichier: f, mots: meta.mots.split(',').map(s => s.trim().toLowerCase()).filter(Boolean), texte: m[2].trim() };
  });
}
export const genererModule = () => `/* GÉNÉRÉ par trader-pro/outils/connaissances.mjs à partir de docs/connaissances/*.md : ne pas modifier à la main. */\nexport const CONNAISSANCES = ${JSON.stringify(lireConnaissances(), null, 1)};\n`;
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  const m = genererModule();
  if (process.argv.includes('--verifier')) { const a = fs.existsSync(sortie) ? fs.readFileSync(sortie, 'utf8').replace(/\r\n/g, '\n') : ''; if (a !== m) { console.error('connaissances-data.js n’est pas à jour : lancer node trader-pro/outils/connaissances.mjs'); process.exit(1); } console.log('connaissances à jour'); }
  else { fs.writeFileSync(sortie, m); console.log('écrit : ' + sortie); }
}
