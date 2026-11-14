// Petit serveur local pour développer Raylé :   node serveur.mjs [port]      (par défaut : 8000)  →  http://127.0.0.1:8000
// Remplace « python -m http.server » : il dit au navigateur de TOUJOURS revalider les fichiers (Cache-Control: no-cache).
// Avec python, Chrome garde en cache des versions périmées des modules JavaScript pendant plusieurs minutes après une modification :
// la page peut alors mélanger d'anciens et de nouveaux fichiers, et les commandes vocales de la galaxie cessent de marcher.
// Sans dépendance. N'écoute que sur la machine locale (127.0.0.1), SAUF avec --reseau (ou RAYLE_RESEAU=1) : écoute alors aussi le réseau local (téléphone, tablette), refuse tout client
// qui n'est pas sur un réseau privé, et publie /__reseau (adresses du PC) pour la page « Connecter le téléphone » (connecter-telephone.html).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { gererTerminal } from './app-pc/terminal-sources.mjs';
import { gererDonnees } from './app-pc/terminal-donnees.mjs';
import { creerVoixLocale } from './app-pc/voix-locale.mjs';
import { gererMarches } from './marches/donnees/api.js';   // RAYLE MARCHÉS : couche de données publiques (lecture seule)

const RACINE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv.slice(2).find(a => /^\d+$/.test(a))) || Number(process.env.PORT) || 8000;
const RESEAU = process.argv.includes('--reseau') || process.env.RAYLE_RESEAU === '1';
const IP_PRIVEE = /^(?:::ffff:)?(?:127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|::1|f[cd][0-9a-f]{2}:.*|fe80:.*)$/i;
const ORIGINE_PRIVEE = /^https?:\/\/(?:localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\]|[^./:]+\.local)(?::\d+)?$/i;
export function adressesReseau(port = PORT) { const L = []; for (const l of Object.values(os.networkInterfaces())) for (const a of l || []) if (a.family === 'IPv4' && !a.internal && IP_PRIVEE.test(a.address)) L.push('http://' + a.address + ':' + port); return L; }
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.woff2': 'font/woff2'
};
// Jamais servis : secrets, dépôt git, dépendances, sauvegardes
const INTERDITS = /(^|\/)(\.git|node_modules|worker|\.claude|\.serena)(\/|$)|(^|\/)(backups|captures[^/]*)(\/|$)|(^|\/)\.env|\.dev\.vars|\.zip$/i;

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
    // réseau local : jamais un client hors réseau privé ; CORS seulement pour les origines privées (jamais « * »)
    if (!IP_PRIVEE.test(req.socket.remoteAddress || '')) { res.writeHead(403); return res.end('réseau privé seulement'); }
    const origine = req.headers.origin; if (origine && ORIGINE_PRIVEE.test(origine)) { res.setHeader('Access-Control-Allow-Origin', origine); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'content-type, x-rayle-token'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); } }
    if (chemin === '/__reseau') { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify({ reseau: RESEAU, port: PORT, adresses: RESEAU ? adressesReseau() : [], local: 'http://127.0.0.1:' + PORT })); }
    if (chemin.startsWith('/__voix/')) return voixLocale.gerer(req, res, chemin);
    if (chemin.startsWith('/marches/') && req.method !== 'POST') { gererMarches(new Request('http://' + (req.headers.host || '127.0.0.1') + req.url, { method: req.method }), { env: process.env }).then(async r => { res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); }).catch(e => { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'marchés : ' + (e && e.message || e) })); }); return; }
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
  principal.listen(PORT, RESEAU ? '0.0.0.0' : '127.0.0.1', () => { console.log('Raylé : http://127.0.0.1:' + PORT + '   (Ctrl+C pour arrêter ; fichiers toujours revalidés)'); if (RESEAU) { console.log('Réseau local OUVERT (clients privés seulement). Téléphone : ' + (adressesReseau().join('  ou  ') || 'aucune adresse trouvée') + '   ·   page « Connecter le téléphone » : http://127.0.0.1:' + PORT + '/connecter-telephone.html'); } });
  principal.on('error', e => { console.log(e.code === 'EADDRINUSE' ? 'Le port ' + PORT + ' est déjà utilisé : Raylé tourne peut-être déjà (http://127.0.0.1:' + PORT + '). Ferme-le ou choisis un autre port : node serveur.mjs <port>.' : 'Serveur impossible : ' + e.message); process.exit(1); });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { process.exit(0); });
}
