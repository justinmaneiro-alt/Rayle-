// Fermeture des imports dans marches/ à partir des fichiers utilisés par le code gardé.
import fs from 'node:fs'; import path from 'node:path';
const roots = fs.readFileSync('outils-restructuration/_roots.txt', 'utf8').split('\n').filter(Boolean);
const vus = new Set(), pile = [...roots];
while (pile.length) {
  const f = pile.pop(); if (vus.has(f) || !fs.existsSync(f)) continue; vus.add(f);
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/(?:from\s+|import\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) { const p = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])); if (p.startsWith('marches/')) pile.push(p); }
}
const tous = fs.readdirSync('marches', { recursive: true }).map(x => 'marches/' + x.split(path.sep).join('/')).filter(x => x.endsWith('.js') && !x.includes('/tests/'));
console.log('gardés', vus.size, 'sur', tous.length);
console.log('A RETIRER :', tous.filter(x => !vus.has(x)).join(' '));
