/* Serveur statique de snapshots avec CORS ouvert (essais locaux, branche « donnees » simulée) : node outils-donnees/serveur-snapshots.mjs <dossier> [port] */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const dossier = path.resolve(process.argv[2] || 'donnees-sortie'), port = +(process.argv[3] || 8801);
http.createServer((req, res) => {
  const f = path.join(dossier, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '').replace(/\.\./g, ''));
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('absent'); }
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' }); fs.createReadStream(f).pipe(res);
}).listen(port, '127.0.0.1', () => console.log('snapshots sur http://127.0.0.1:' + port + '/ ← ' + dossier));
