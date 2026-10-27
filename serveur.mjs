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
import { creerMulti } from './app-pc/multi-ecrans.mjs';
import { creerRoutesVeilleur } from './app-pc/veilleur-routes.mjs';
import { creerTelecommande } from './app-pc/telecommande.mjs';
import { creerPontCamera } from './app-pc/camera-pont.mjs';

const RACINE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.woff2': 'font/woff2'
};
// Jamais servis : secrets, dépôt git, dépendances, sauvegardes
const INTERDITS = /(^|\/)(\.git|node_modules|worker|\.claude|\.serena)(\/|$)|(^|\/)\.env|\.dev\.vars|\.zip$/i;

export function creerServeur({ portReseau, dossierDonnees = process.env.RAYLE_DONNEES || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Rayle') : undefined), ip } = {}) {
  const multi = creerMulti();   // mode multi-écrans : écrans et fenêtres (routes /__multi/…, app-pc/multi-ecrans.mjs)
  const veilleur = creerRoutesVeilleur();   // Veilleur d'alertes en arrière-plan (routes /__veilleur/…, app-pc/veilleur-routes.mjs)
  const tele = creerTelecommande({ racine: RACINE, dossierDonnees, port: portReseau, ip });   // télécommande tactile (K2) : désactivée tant que Justin ne l'active pas dans ⚙ Réglages
  const camera = creerPontCamera({ racine: RACINE, dossierDonnees, ip });   // caméra du téléphone (V2 phase 11) : désactivée tant que Justin ne l'active pas dans ⚙ Gestes
  const serveur = http.createServer((req, res) => {
    let chemin;
    try { chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end('requête invalide'); }
    if (chemin.startsWith('/__multi/')) return multi.gerer(req, res, chemin);
    if (chemin.startsWith('/__veilleur/')) return veilleur.gerer(req, res, chemin);
    if (chemin.startsWith('/__tele/')) return tele.gererLocal(req, res, chemin);
    if (chemin.startsWith('/__cam/')) return camera.gererLocal(req, res, chemin);
    if (chemin === '/clavier/telecommande-calcul.js') chemin = '/core/commun/telecommande-calcul.js';   // même fichier que sur le réseau local
    if (chemin === '/clavier') chemin = '/clavier/';   // clavier en éventail (K1), aussi disponible en local
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
  serveur.on('upgrade', (req, sock) => { if (String(req.url).startsWith('/__cam/')) camera.upgradeLocal(req, sock); else tele.upgradeLocal(req, sock); });
  serveur.on('close', () => { tele.fermerTout(); camera.fermerTout(); });
  serveur.tele = tele; serveur.camera = camera;
  return serveur;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const principal = creerServeur({ portReseau: Number(process.env.RAYLE_PORT_RESEAU) || PORT + 1 });
  principal.listen(PORT, '127.0.0.1', () => console.log('Raylé : http://127.0.0.1:' + PORT + '   (Ctrl+C pour arrêter ; fichiers toujours revalidés)'));
  principal.on('error', e => { console.log(e.code === 'EADDRINUSE' ? 'Le port ' + PORT + ' est déjà utilisé : Raylé tourne peut-être déjà (http://127.0.0.1:' + PORT + '). Ferme-le ou choisis un autre port : node serveur.mjs <port>.' : 'Serveur impossible : ' + e.message); process.exit(1); });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { principal.tele.fermerTout(); principal.camera.fermerTout(); process.exit(0); });
  // Option explicite (reste disponible depuis K1) : « node serveur.mjs --reseau-local » active la télécommande dès le démarrage, comme l'interrupteur de ⚙ Réglages.
  if (process.argv.includes('--reseau-local')) {
    try {
      const e = await principal.tele.activer();
      const { qrTexte } = await import('./app-pc/qr-console.mjs');
      console.log('\nTélécommande (réseau local, seulement /clavier) :\n  ' + e.url + '\n  Code d\'appairage à saisir sur la tablette : ' + e.code + '\n');
      try { console.log(qrTexte(e.url) + '\n'); } catch (x) { console.log('(QR code indisponible : ' + x.message + ')'); }
    } catch (e) { console.log('Réseau local non démarré : ' + e.message); }
  }
}
