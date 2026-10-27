// Serveur d'ESSAI sur le réseau local (K1) : uniquement la page /clavier et ses fichiers (dossier clavier/), protégée par un jeton aléatoire.
// Activé seulement par « node serveur.mjs --reseau-local ». Sans le jeton : refus. Aucune autre route (ni /__multi, ni /__veilleur, ni le reste du site).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { qrTexte } from './qr-console.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

// Adresse du réseau local : celle d'une carte privée (192.168.x.x, 10.x.x.x, 172.16-31.x.x), sinon la première IPv4 non interne.
export function adresseLocale() {
  const toutes = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal);
  const privee = toutes.find(i => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address));
  return (privee || toutes[0] || {}).address || null;
}

const memeJeton = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function creerServeurReseau(racine, jeton) {
  const dossier = path.join(racine, 'clavier');
  return http.createServer((req, res) => {
    const refus = (code, msg) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(msg); };
    if (req.method !== 'GET' && req.method !== 'HEAD') return refus(405, 'méthode refusée');
    let url;
    try { url = new URL(req.url, 'http://x'); } catch (e) { return refus(400, 'requête invalide'); }
    let chemin;
    try { chemin = decodeURIComponent(url.pathname); } catch (e) { return refus(400, 'requête invalide'); }
    if (chemin !== '/clavier' && !chemin.startsWith('/clavier/')) return refus(403, 'interdit');
    const cookie = /(?:^|;\s*)rayle_k1=([0-9a-f]+)/.exec(req.headers.cookie || '');
    const parUrl = memeJeton(url.searchParams.get('jeton'), jeton);
    if (!parUrl && !memeJeton(cookie && cookie[1], jeton)) return refus(403, 'jeton requis');
    const sous = chemin === '/clavier' || chemin === '/clavier/' ? 'index.html' : chemin.slice('/clavier/'.length);
    const fichier = path.normalize(path.join(dossier, sous));
    if (path.relative(dossier, fichier).startsWith('..') || path.isAbsolute(path.relative(dossier, fichier))) return refus(403, 'interdit');
    fs.stat(fichier, (err, st) => {
      if (err || !st.isFile()) return refus(404, 'introuvable');
      const entetes = { 'Content-Type': TYPES[path.extname(fichier).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
      if (parUrl) entetes['Set-Cookie'] = 'rayle_k1=' + jeton + '; Path=/clavier; HttpOnly; SameSite=Strict';
      res.writeHead(200, entetes);
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(fichier).pipe(res);
    });
  });
}

// Démarre le serveur réseau ; renvoie { serveur, url, jeton }. Affiche l'adresse et le QR code dans la console.
export function demarrerReseauLocal({ racine, port, ip = adresseLocale(), silencieux = false }) {
  if (!ip) throw new Error('aucune adresse de réseau local trouvée (êtes-vous connecté au Wi-Fi ?)');
  const jeton = crypto.randomBytes(12).toString('hex');
  const serveur = creerServeurReseau(racine, jeton);
  return new Promise((ok, ko) => {
    serveur.once('error', ko);
    serveur.listen(port, ip, () => {
      const url = 'http://' + ip + ':' + serveur.address().port + '/clavier?jeton=' + jeton;
      if (!silencieux) {
        console.log('\nClavier d\'essai (réseau local, seulement /clavier, jeton aléatoire) :\n  ' + url + '\n');
        try { console.log(qrTexte(url) + '\n'); } catch (e) { console.log('(QR code indisponible : ' + e.message + ')'); }
        console.log('Il s\'arrête avec ce serveur (Ctrl+C). Pare-feu : voir docs/k1-progression.md.');
      }
      ok({ serveur, url, jeton });
    });
  });
}
