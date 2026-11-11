// Petit serveur local pour développer Raylé :   node serveur.mjs [port]      (par défaut : 8000)  →  http://127.0.0.1:8000
// Remplace « python -m http.server » : il dit au navigateur de TOUJOURS revalider les fichiers (Cache-Control: no-cache).
// Avec python, Chrome garde en cache des versions périmées des modules JavaScript pendant plusieurs minutes après une modification :
// la page peut alors mélanger d'anciens et de nouveaux fichiers, et les commandes vocales de la galaxie cessent de marcher.
// Sans dépendance. N'écoute que sur la machine locale (127.0.0.1).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { gererTerminal } from './app-pc/terminal-sources.mjs';
import { gererDonnees } from './app-pc/terminal-donnees.mjs';
import { creerVoixLocale } from './app-pc/voix-locale.mjs';

const RACINE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.woff2': 'font/woff2'
};
// Jamais servis : secrets, dépôt git, dépendances, sauvegardes
const INTERDITS = /(^|\/)(\.git|node_modules|worker|\.claude|\.serena)(\/|$)|(^|\/)\.env|\.dev\.vars|\.zip$/i;

/* Backend Raylé embarqué (actualités, météo, calendrier, COT, macro, sources…) : même code que le Worker Cloudflare (worker/portable/coeur.js, hors dépôt public),
   servi sur la MÊME adresse que l'application : aucun CORS, aucun jeton (l'écoute est locale). Absent : l'application utilise le Worker distant. */
let gererApi = null;
try { ({ gerer: gererApi } = await import('./worker/portable/coeur.js')); } catch (e) { console.log('Backend embarqué indisponible (worker/portable absent) : ' + (e && e.message)); }
const ROUTES_API = /^\/(?:health|ping|sources|actualites|meteo|evenements|calendar|calendrier|cot|macro|sec|wgc|ce-jour-la|chat|tts)(?:\/|$)/;
async function repondreApi(req, res) {
  try {
    const corps = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((ok, ko) => { const p = []; req.on('data', c => p.push(c)); req.on('end', () => ok(Buffer.concat(p))); req.on('error', ko); });
    const entetes = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (v != null) entetes.set(k, Array.isArray(v) ? v.join(', ') : v);
    const r = await gererApi(new Request('http://' + (req.headers.host || '127.0.0.1') + req.url, { method: req.method, headers: entetes, body: corps }), process.env, null, 'pc-local');
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'backend local : ' + (e && e.message || e) })); }
}

export function creerServeur({ portReseau, dossierDonnees = process.env.RAYLE_DONNEES || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Rayle') : undefined), ip } = {}) {
  const voixLocale = creerVoixLocale({ racine: RACINE });   // voix gratuite et locale (Kokoro, Piper) : routes /__voix/…, réservées à 127.0.0.1
  const serveur = http.createServer((req, res) => {
    let chemin;
    try { chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end('requête invalide'); }
    if (chemin.startsWith('/__voix/')) return voixLocale.gerer(req, res, chemin);
    if (gererApi && ROUTES_API.test(chemin)) return repondreApi(req, res);
    if (/^\/__(bougies|cot|actus|banques|institutions|sante|gld|calendrier2)$/.test(chemin) && gererDonnees(req, res, chemin)) return;   // données du Terminal (app-pc/terminal-donnees.mjs)
    if ((chemin.startsWith('/__relais/') || chemin === '/__rapports' || chemin === '/__yahoo' || chemin === '/__calendrier') && gererTerminal(req, res, chemin)) return;   // sources publiques du terminal lues par le PC (app-pc/terminal-sources.mjs)
    if (chemin.endsWith('/')) chemin += 'index.html';
    const fichier = path.normalize(path.join(RACINE, chemin));
    const rel = path.relative(RACINE, fichier).replace(/\\/g, '/');
    if (rel.startsWith('..') || path.isAbsolute(rel) || INTERDITS.test(rel)) { res.writeHead(403); return res.end('interdit'); }
    fs.stat(fichier, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Cache-Control': 'no-store' }); return res.end('introuvable'); }
      const etag = '"' + crypto.createHash('sha1').update(st.size + ':' + st.mtimeMs).digest('hex').slice(0, 16) + '"';
      const entetes = {
        'Content-Type': TYPES[path.extname(fichier).toLowerCase()] || 'application/octet-stream',
        'Content-Length': st.size, 'Last-Modified': st.mtime.toUTCString(), 'ETag': etag,
        'Cache-Control': 'no-cache'   // le navigateur peut garder le fichier, mais doit demander au serveur s'il a changé avant de s'en servir
      };
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, entetes); return res.end(); }
      res.writeHead(200, entetes);
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(fichier).pipe(res);
    });
  });
  serveur.on('close', () => { voixLocale.arreter(); });
  return serveur;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const principal = creerServeur({ portReseau: Number(process.env.RAYLE_PORT_RESEAU) || PORT + 1 });
  principal.listen(PORT, '127.0.0.1', () => console.log('Raylé : http://127.0.0.1:' + PORT + '   (Ctrl+C pour arrêter ; fichiers toujours revalidés)'));
  principal.on('error', e => { console.log(e.code === 'EADDRINUSE' ? 'Le port ' + PORT + ' est déjà utilisé : Raylé tourne peut-être déjà (http://127.0.0.1:' + PORT + '). Ferme-le ou choisis un autre port : node serveur.mjs <port>.' : 'Serveur impossible : ' + e.message); process.exit(1); });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { process.exit(0); });
}
