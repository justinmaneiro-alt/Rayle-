// Fichiers atteignables depuis les points d'entrée (analyse statique : chaînes de chemins trouvées dans le code).
// Usage : node outils-restructuration/atteignables.mjs [--bloquer=dir1,dir2] [--racines=a,b] [--detail=dir]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const arg = (n, d) => { const a = process.argv.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const bloquer = arg('bloquer', '').split(',').filter(Boolean);
const racines = arg('racines', 'index.html,terminal.html,sw.js,serveur.mjs,agent-trading/front/or.html,agent-trading/front/terminal.html,camera/index.html').split(',');
const detail = arg('detail', '');
const fichiers = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean).filter(f => !fs.existsSync(f) ? false : true);
const set = new Set(fichiers);
const EXT = /\.(js|mjs|css|html|json|webmanifest|svg|png|jpg|glb|wasm)$/;
const lisibles = fichiers.filter(f => /\.(js|mjs|css|html|webmanifest)$/.test(f));
const parDossier = new Map();
for (const f of fichiers) { const d = path.posix.dirname(f); if (!parDossier.has(d)) parDossier.set(d, []); parDossier.get(d).push(f); }
const estBloque = f => bloquer.some(b => f === b || f.startsWith(b.endsWith('/') ? b : b + '/'));

function voisins(f) {
  const txt = fs.readFileSync(f, 'utf8'), out = new Set(), dir = path.posix.dirname(f);
  // chaînes entre guillemets / apostrophes / accents graves
  for (const m of txt.matchAll(/(['"`(])([^'"`()\s<>]{3,200})\1?/g)) {
    let s = m[2].split('?')[0].split('#')[0];
    if (!s || /^(https?:|data:|blob:|mailto:)/.test(s)) continue;
    const cands = [];
    if (s.startsWith('./') || s.startsWith('../')) cands.push(path.posix.normalize(path.posix.join(dir, s)));
    else { cands.push(s.replace(/^\//, '')); cands.push(path.posix.normalize(path.posix.join(dir, s))); }
    for (const c of cands) if (set.has(c)) out.add(c);
  }
  // concaténations : 'dossier/'+x+'.js' -> tout le dossier
  for (const m of txt.matchAll(/['"]([a-zA-Z0-9_./-]+\/)['"]\s*\+/g)) {
    const d = m[1].replace(/\/$/, '');
    for (const c of [d, path.posix.normalize(path.posix.join(dir, d))]) if (parDossier.has(c)) for (const x of parDossier.get(c)) out.add(x);
  }
  // src= / href= / url() sans guillemets déjà couverts ; import relatif nu
  return out;
}

const vus = new Set(), file = racines.filter(r => set.has(r) && !estBloque(r));
while (file.length) {
  const f = file.pop();
  if (vus.has(f)) continue; vus.add(f);
  if (!/\.(js|mjs|css|html|webmanifest)$/.test(f)) continue;
  for (const v of voisins(f)) if (!vus.has(v) && !estBloque(v)) file.push(v);
}
const morts = fichiers.filter(f => !vus.has(f) && !estBloque(f) && !/(^|\/)tests?(-navigateur)?\//.test(f) && !/\.(md|log|txt)$/.test(f));
const tot = new Map();
for (const f of morts) { const d = f.split('/').slice(0, 2).join('/'); tot.set(d, (tot.get(d) || 0) + 1); }
console.log('atteignables :', vus.size, ' non atteints (hors tests/docs) :', morts.length);
console.log([...tot].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([d, n]) => n + '\t' + d).join('\n'));
if (detail) console.log('\n' + morts.filter(f => f.startsWith(detail)).join('\n'));
fs.writeFileSync('outils-restructuration/atteignables-morts.txt', morts.join('\n'));
