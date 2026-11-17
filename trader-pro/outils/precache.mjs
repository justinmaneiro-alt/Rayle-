/* Ajoute à precache.json (installation hors ligne) tous les fichiers de trader-pro/ (sauf tests) et leurs dépendances relatives (import statiques et dynamiques).
   Usage : node trader-pro/outils/precache.mjs [nouvelle-version]  → met aussi à jour la version dans precache.json, sw.js, index.html, agent-trading/front/or.html et trader-pro/terminal/version.js (les cinq doivent rester identiques). */
import fs from 'node:fs'; import path from 'node:path';
const racine = process.cwd(), lireJ = f => JSON.parse(fs.readFileSync(path.join(racine, f), 'utf8'));
const pc = lireJ('precache.json'), vu = new Set(), pile = [];
const ajouter = f => { const k = f.split(path.sep).join('/'); if (!vu.has(k) && fs.existsSync(path.join(racine, k))) { vu.add(k); pile.push(k); } };
const parcourir = d => { for (const e of fs.readdirSync(path.join(racine, d), { withFileTypes: true })) { const p = d + '/' + e.name; if (e.isDirectory()) { if (!/^(tests|outils|node_modules)$/.test(e.name)) parcourir(p); } else if (/\.(js|css|json)$/.test(e.name)) ajouter(p); } };
parcourir('trader-pro'); ajouter('agent-trading/front/terminal/apercu-cache.js');   // aperçu immédiat du terminal (hors du dossier trader-pro)
while (pile.length) {
  const f = pile.pop(); if (!/\.js$/.test(f)) continue; const src = fs.readFileSync(path.join(racine, f), 'utf8');
  for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) ajouter(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])));
  for (const m of src.matchAll(/new URL\(['"]([^'"]+\.js)['"],\s*import\.meta\.url\)/g)) ajouter(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])));
}
const avant = new Set(pc.coeur), lourd = new Set(pc.lourd || []);
for (const f of vu) if (!avant.has(f) && !lourd.has(f)) pc.coeur.push(f);
pc.coeur = [...new Set(pc.coeur)].sort();
const version = process.argv[2];
if (version) {
  pc.version = version; pc.genere = new Date().toISOString().slice(0, 10);
  for (const [f, re, rempl] of [['sw.js', /const VERSION = '[^']+';/, `const VERSION = '${version}';`], ['index.html', /window\.RAYLE_VERSION\s*=\s*'[^']+'/, `window.RAYLE_VERSION='${version}'`], ['agent-trading/front/or.html', /window\.RAYLE_OR_VERSION = '[^']+'/, `window.RAYLE_OR_VERSION = '${version}'`], ['trader-pro/terminal/version.js', /export const VERSION = '[^']+'/, `export const VERSION = '${version}'`]]) {
    const t = fs.readFileSync(path.join(racine, f), 'utf8'); if (!re.test(t)) throw new Error('version introuvable dans ' + f); fs.writeFileSync(path.join(racine, f), t.replace(re, rempl));
  }
}
fs.writeFileSync(path.join(racine, 'precache.json'), JSON.stringify(pc));
console.log('precache : ' + pc.coeur.length + ' fichiers (+' + [...vu].filter(f => !avant.has(f)).length + ' nouveaux)' + (version ? ', version ' + version : ''));
