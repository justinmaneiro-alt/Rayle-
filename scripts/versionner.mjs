// Cache-busting : écrit ?v=VERSION sur tous les CSS/JS locaux (balises de index.html, imports des modules du terminal, chargements dynamiques).
// Usage : node scripts/versionner.mjs 2026.10.10.3   (à lancer avant chaque publication ; sans argument, affiche la version actuelle)
import fs from 'node:fs';
const v = process.argv[2];
const lire = f => fs.readFileSync(f, 'utf8');
if (!v) { console.log((lire('index.html').match(/css\/rayle\.css\?v=([^"]+)/) || [])[1] || 'aucune'); process.exit(0); }
if (!/^[\w.-]+$/.test(v)) throw new Error('version invalide');
const ecrire = (f, fn) => { const a = lire(f), b = fn(a); if (a !== b) fs.writeFileSync(f, b); console.log((a !== b ? 'maj ' : 'ok  ') + f); };
ecrire('index.html', s => s.replace(/(<(?:script|link)[^>]*(?:src|href)=")((?:css|js|ui)\/[^"?]+)(?:\?v=[^"]*)?"/g, `$1$2?v=${v}"`).replace(/(window\.RAYLE_VERSION=')[^']*'/, `$1${v}'`).replace(/(Version )[\w.-]+/, `$1${v}`));
for (const f of fs.readdirSync('js/terminal').filter(x => x.endsWith('.js')).map(x => 'js/terminal/' + x))
  ecrire(f, s => s.replace(/(from\s+'\.\/[\w-]+\.js)(?:\?v=[^']*)?'/g, `$1?v=${v}'`).replace(/(js\/vendor\/lightweight-charts\.js)(?:\?v=[^']*)?'/g, `$1?v=${v}'`));
ecrire('js/commun/vues.js', s => s.replace(/(js\/(?:terminal\/terminal|anatomie\/fenetre|anatomie\/cerveau-fenetre)\.js)(?:\?v=[^']*)?'/g, `$1?v=${v}'`));
// module Anatomie & Orthopédie : imports statiques (from './x.js') et dynamiques (import('./x.js')) de chaque fichier, puis son chargement depuis Raylé
for (const f of fs.readdirSync('js/anatomie').filter(x => x.endsWith('.js')).map(x => 'js/anatomie/' + x))
  ecrire(f, s => s.replace(/(from\s+'\.\/[\w-]+\.js)(?:\?v=[^']*)?'/g, `$1?v=${v}'`).replace(/(import\('\.\/[\w-]+\.js)(?:\?v=[^']*)?'\)/g, `$1?v=${v}')`));
ecrire('js/rayle/commandes-anatomie.js', s => s.replace(/(js\/anatomie\/index\.js)(?:\?v=[^']*)?'/, `$1?v=${v}'`));
// module Documents Drive : imports statiques de chaque fichier de js/drive/, puis son chargement depuis Raylé
for (const f of fs.readdirSync('js/drive').filter(x => x.endsWith('.js')).map(x => 'js/drive/' + x))
  ecrire(f, s => s.replace(/(from\s+'\.\/[\w-]+\.js)(?:\?v=[^']*)?'/g, `$1?v=${v}'`).replace(/(import\('\.\/[\w-]+\.js)(?:\?v=[^']*)?'\)/g, `$1?v=${v}')`));
ecrire('js/rayle/commandes-drive.js', s => s.replace(/(js\/drive\/index\.js)(?:\?v=[^']*)?'/, `$1?v=${v}'`));
// Univers 3D (Espace, Mars, Bataille navale…) : imports statiques et dynamiques de tous les fichiers de js/univers/ (récursif), constante VERSION du noyau, puis son chargement depuis Raylé
const fichiersUnivers = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? fichiersUnivers(d + '/' + e.name) : e.name.endsWith('.js') ? [d + '/' + e.name] : []);
for (const f of fichiersUnivers('js/univers'))
  ecrire(f, s => s.replace(/(from\s+'\.{1,2}\/[\w\-./]+\.js)(?:\?v=[^']*)?'/g, `$1?v=${v}'`).replace(/(import\('\.{1,2}\/[\w\-./]+\.js)(?:\?v=[^']*)?'\)/g, `$1?v=${v}')`).replace(/(const VERSION = ')[^']*'/, `$1${v}'`));
ecrire('js/rayle/commandes-univers.js', s => s.replace(/(js\/univers\/noyau\.js)(?:\?v=[^']*)?'/, `$1?v=${v}'`));
