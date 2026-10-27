import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';

/* Faux serveurs de tuiles pour les tests de la Terre : imagerie synthétique, relief (une bosse), tuile vectorielle réelle (Paris, fixture),
   TileJSON et géocodage. Modes de panne : /panne/... renvoie 404 ou 500 ; le journal liste toutes les requêtes reçues. */
const FIX = n => fileURLToPath(new URL('../planetes/terre/tests/fixtures/' + n, import.meta.url));
let pbf = fs.readFileSync(FIX('paris-z14-8299-5636.pbf.gz')); while (pbf[0] === 0x1f && pbf[1] === 0x8b) pbf = zlib.gunzipSync(pbf);
const png = (w, h, f) => { const p = new PNG({ width: w, height: h }); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = f(x, y); const i = (y * w + x) * 4; p.data[i] = r; p.data[i + 1] = g; p.data[i + 2] = b; p.data[i + 3] = 255; } return PNG.sync.write(p); };
const damier = png(256, 256, (x, y) => (((x >> 5) + (y >> 5)) & 1 ? [90, 130, 80] : [70, 100, 140]));
const terrarium = png(256, 256, (x, y) => { const h = 1200 * Math.exp(-(((x - 128) ** 2 + (y - 128) ** 2) / 4000)) - 0; const v = h + 32768; return [Math.floor(v / 256), Math.floor(v % 256), Math.floor((v % 1) * 256)]; });
const radarPng = png(256, 256, (x, y) => { const d = Math.hypot(x - 128, y - 128) / 128; return d < 0.9 ? [40 + Math.floor(150 * d), 120, 255] : [0, 0, 0]; });   // (le fond noir est rendu transparent plus bas)
const radarAlpha = (() => { const p = PNG.sync.read(radarPng); for (let i = 0; i < p.data.length; i += 4) p.data[i + 3] = (p.data[i] === 0 && p.data[i + 1] === 0) ? 0 : 200; return PNG.sync.write(p); })();
const GEOCODAGE = { results: [
  { name: 'Toulouse', latitude: 43.6043, longitude: 1.4437, feature_code: 'PPLA', country_code: 'FR', country: 'France', admin1: 'Occitanie', population: 479553, elevation: 146 },
  { name: 'Toulouse', latitude: 29.95, longitude: -90.07, feature_code: 'PPL', country_code: 'US', country: 'États-Unis', admin1: 'Louisiane' } ] };

export function demarrerFauxServeur(port = 8123) {
  const journal = [];
  const reglages = { radar: 'ok', relief: 'ok', image: 'ok', vecteur: 'ok', tilejson: 'ok', latence: 0 };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), p = u.pathname; journal.push(p);
    const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
    const fin = (code, type, corps) => setTimeout(() => { res.writeHead(code, { ...cors, 'Content-Type': type }); res.end(corps); }, reglages.latence);
    if (p === '/radar/index') return reglages.radar === 'ok' ? fin(200, 'application/json', JSON.stringify({ version: '2.0', generated: Math.floor(Date.now() / 1000), host: `http://127.0.0.1:${port}/rv`, radar: { past: Array.from({ length: 13 }, (_, i) => ({ time: Math.floor(Date.now() / 1000) - (12 - i) * 600, path: '/v2/radar/img' + i })), nowcast: [] } })) : fin(500, 'text/plain', 'x');
    if (p.startsWith('/rv/')) return fin(200, 'image/png', radarAlpha);
    if (p.startsWith('/gibs/') || p.startsWith('/eox/') || p.startsWith('/gibsroot/')) return reglages.image === 'ok' ? fin(200, 'image/png', damier) : fin(reglages.image === '500' ? 500 : 404, 'text/plain', 'x');
    if (p.startsWith('/relief/')) return reglages.relief === 'ok' ? fin(200, 'image/png', terrarium) : fin(404, 'text/plain', 'x');
    if (p === '/vecteur') return reglages.tilejson === 'ok' ? fin(200, 'application/json', JSON.stringify({ tiles: [`http://127.0.0.1:${port}/vt/{z}/{x}/{y}.pbf`] })) : fin(500, 'text/plain', 'x');
    if (p.startsWith('/vt/')) return reglages.vecteur === 'ok' ? fin(200, 'application/x-protobuf', pbf) : fin(404, 'text/plain', 'x');
    if (p === '/geocodage') return fin(200, 'application/json', JSON.stringify(GEOCODAGE));
    fin(404, 'text/plain', 'inconnu');
  });
  return new Promise(ok => srv.listen(port, '127.0.0.1', () => ok({
    journal, reglages, port, base: `http://127.0.0.1:${port}`,
    injection: { gibs: `http://127.0.0.1:${port}/gibs`, eox: `http://127.0.0.1:${port}/eox`, relief: `http://127.0.0.1:${port}/relief`, vecteur: `http://127.0.0.1:${port}/vecteur`, geocodage: `http://127.0.0.1:${port}/geocodage`, radar: `http://127.0.0.1:${port}/radar/index`, gibsRacine: `http://127.0.0.1:${port}/gibsroot` },
    fermer: () => new Promise(r => srv.close(r))
  })));
}
