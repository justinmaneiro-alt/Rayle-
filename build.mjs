// Construction du dossier déployable `dist/` : l'application (public/) + son backend (backend/) + de quoi la lancer sur un serveur Node.
//   node build.mjs [--url=https://rayle.mondomaine.fr | --meme-origine] [--sans-backend]
// · --meme-origine : l'application appelle le backend sur sa propre adresse (cas d'un seul serveur Node) ; sinon --url = adresse du Worker / du serveur d'API
// · le backend est copié depuis worker/portable (dossier non publié sur GitHub) ; --sans-backend pour ne livrer que l'application (hébergement statique)
// Contrôles : version de index.html = version de sw.js ; toutes les ressources de démarrage existent ; poids total affiché.
import fs from 'node:fs';
import path from 'node:path';

const arg = n => { const a = process.argv.find(x => x === '--' + n || x.startsWith('--' + n + '=')); return a ? (a.includes('=') ? a.slice(n.length + 3) : true) : null; };
const SORTIE = 'dist', PUB = path.join(SORTIE, 'public');
const aEcrire = [];
const exclure = [/(^|\/)tests?(-navigateur)?\//i, /\.md$/i, /\.log$/i, /(^|\/)node_modules\//, /(^|\/)captures[^/]*\//, /(^|\/)package(-lock)?\.json$/, /\.test\.|-test\.m?js$/, /(^|\/)outils\//, /(^|\/)_sources\//];
const INCLURE_DOSSIERS = ['core', 'skins', 'terminal', 'galaxie', 'planetes', 'marches', 'agent-trading/front', 'icones'];
const INCLURE_FICHIERS = ['index.html', 'offline.html', 'config.js', 'manifest.webmanifest', 'sw.js', 'favicon.svg', 'terminal.html', 'galaxie.html'];
const INCLURE_PLUS = ['data/anatomie_fr.json', 'assets-lourds/manifeste.json', 'assets-lourds/anatomie'];

function lister(dossier, sortie = []) {
  if (!fs.existsSync(dossier)) return sortie;
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = (dossier + '/' + e.name).replace(/\\/g, '/');
    if (exclure.some(r => r.test(p))) continue;
    if (e.isDirectory()) lister(p, sortie); else sortie.push(p);
  }
  return sortie;
}
const fichiers = new Set();
for (const d of INCLURE_DOSSIERS) lister(d).forEach(f => fichiers.add(f));
for (const f of INCLURE_FICHIERS) if (fs.existsSync(f)) fichiers.add(f);
for (const p of INCLURE_PLUS) { if (fs.existsSync(p)) { if (fs.statSync(p).isDirectory()) lister(p).forEach(f => fichiers.add(f)); else fichiers.add(p); } }

// 1. contrôles de version
const index = fs.readFileSync('index.html', 'utf8'), sw = fs.readFileSync('sw.js', 'utf8');
const vIndex = (index.match(/RAYLE_VERSION='([^']+)'/) || [])[1], vSw = (sw.match(/const VERSION = '([^']+)'/) || [])[1];
if (!vIndex || vIndex !== vSw) { console.error('ERREUR : version de index.html (' + vIndex + ') différente de sw.js (' + vSw + ') : les changer ensemble.'); process.exit(1); }

// 2. liste des fichiers de démarrage (précache du service worker) : feuilles de style et scripts de index.html
const demarrage = new Set(['./', 'index.html', 'offline.html', 'manifest.webmanifest', 'favicon.svg', 'icones/rayle-192.png', 'config.js']);
for (const m of index.matchAll(/(?:src|href)="([^":?#]+\.(?:js|css|svg|png|webmanifest))"/g)) demarrage.add(m[1]);
const manquants = [...demarrage].filter(f => f !== './' && !fs.existsSync(f));
if (manquants.length) { console.error('ERREUR : fichiers de démarrage absents : ' + manquants.join(', ')); process.exit(1); }

// 3. écriture
fs.rmSync(SORTIE, { recursive: true, force: true });
let octets = 0;
for (const f of fichiers) {
  const cible = path.join(PUB, f); fs.mkdirSync(path.dirname(cible), { recursive: true });
  if (f === 'sw.js') { fs.writeFileSync(cible, sw.replace(/const COEUR = \[[^\]]*\];[^\n]*/, 'const COEUR = ' + JSON.stringify([...demarrage]) + ';   // /*COEUR*/')); octets += fs.statSync(cible).size; continue; }
  if (f === 'config.js') {
    const url = arg('meme-origine') ? null : (typeof arg('url') === 'string' ? arg('url') : null);
    const base = fs.readFileSync(f, 'utf8');
    fs.writeFileSync(cible, arg('meme-origine') ? base.replace(/workerUrl:\s*'[^']*'/, 'workerUrl: location.origin') : url ? base.replace(/workerUrl:\s*'[^']*'/, "workerUrl: '" + url.replace(/\/+$/, '') + "'") : base);
    octets += fs.statSync(cible).size; continue;
  }
  fs.copyFileSync(f, cible); octets += fs.statSync(f).size;
}
// 4. backend + lancement
if (!arg('sans-backend')) {
  const src = 'worker/portable';
  if (!fs.existsSync(src)) { console.error('AVERTISSEMENT : worker/portable absent : backend non livré (utiliser --sans-backend pour ne pas voir ce message).'); }
  else {
    for (const f of lister(src)) { if (/rapport-.*\.json$/.test(f)) continue; const cible = path.join(SORTIE, 'backend', f.slice(src.length + 1)); fs.mkdirSync(path.dirname(cible), { recursive: true }); fs.copyFileSync(f, cible); }
    // les modules « terre/ » et « flux.js » sont déjà dans portable/ ; package.json minimal pour le mode module
    fs.writeFileSync(path.join(SORTIE, 'backend', 'package.json'), JSON.stringify({ name: 'rayle-backend', private: true, type: 'module', scripts: { start: 'node node.js' } }, null, 2));
    fs.writeFileSync(path.join(SORTIE, 'package.json'), JSON.stringify({ name: 'rayle-serveur', private: true, version: vIndex, scripts: { start: 'node demarrer.mjs' }, engines: { node: '>=18' } }, null, 2));
    fs.writeFileSync(path.join(SORTIE, 'demarrer.mjs'), "// Lance l'application ET son backend sur un seul port. Variables : voir .env.exemple\nimport fs from 'node:fs';\nimport path from 'node:path';\nimport { fileURLToPath } from 'node:url';\nconst ici = path.dirname(fileURLToPath(import.meta.url));\ntry { for (const l of fs.readFileSync(path.join(ici, '.env'), 'utf8').split(/\\r?\\n/)) { const m = /^\\s*([A-Z0-9_]+)\\s*=\\s*(.*?)\\s*$/.exec(l); if (m && !l.trim().startsWith('#') && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^[\"']|[\"']$/g, ''); } } catch (e) { /* pas de .env : variables du système */ }\nprocess.env.STATIC_DIR = process.env.STATIC_DIR || path.join(ici, 'public');\nprocess.env.PORT = process.env.PORT || '8788';\nconst { creerServeur } = await import('./backend/node.js');\ncreerServeur(process.env).listen(+process.env.PORT, process.env.HOTE || '0.0.0.0', () => console.log('Rayle ' + JSON.parse(fs.readFileSync(path.join(ici, 'package.json'), 'utf8')).version + ' : http://localhost:' + process.env.PORT + '/  (sante : /health)'));\n");
    fs.writeFileSync(path.join(SORTIE, '.env.exemple'), '# Copier en .env puis remplir. Jamais ce fichier dans Git.\nPORT=8788\n# Jeton demandé aux appareils (en-tête X-Rayle-Token) ; à choisir long et secret. Sans lui, les routes de lecture sont ouvertes.\nRAYLE_TOKEN=\n# Origines autorisées pour le navigateur, séparées par des virgules (inutile si application et backend sont sur la même adresse)\nORIGINE=https://rayle.mondomaine.fr\n# Identité envoyée à la SEC (EDGAR l\'exige)\nSEC_UA=Rayle usage-personnel\n# IA de la conversation (facultatives, gratuites) : au moins une pour que Rayle réponde\nGROQ_API_KEY=\nMISTRAL_API_KEY=\nCEREBRAS_API_KEY=\nOPENROUTER_API_KEY=\n');
  }
}
console.log('dist/ construit : ' + fichiers.size + ' fichiers, ' + (octets / 1048576).toFixed(1) + ' Mo (application), version ' + vIndex + ', ' + demarrage.size + ' fichiers de démarrage précachés.');
