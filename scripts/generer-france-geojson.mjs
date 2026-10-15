// Contours officiels de la France (régions et départements) pour la carte de la Terre.
//   node scripts/generer-france-geojson.mjs
// Source : IGN Admin Express publié sur data.gouv.fr (Licence Ouverte Etalab 2.0), via le jeu « france-geojson » ; noms et codes confirmés par geo.api.gouv.fr.
// Les contours complets pèsent plusieurs Mo : on les simplifie (Douglas-Peucker, ~250 m) et on arrondit à 4 décimales (~10 m) pour garder des fichiers légers,
// servis localement (hors ligne, instantanés). Écrit ui/assets/geo/france-regions.json et france-departements.json.
import fs from 'node:fs';

const EPS = 0.0025;                 // tolérance de simplification (degrés ≈ 250 m)
const ARRONDI = 1e4;

function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (!dx && !dy) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function dp(pts, eps) {              // Douglas-Peucker itératif
  const n = pts.length, garde = new Uint8Array(n); garde[0] = garde[n - 1] = 1;
  const pile = [[0, n - 1]];
  while (pile.length) {
    const [i, j] = pile.pop(); let max = 0, k = -1;
    for (let m = i + 1; m < j; m++) { const d = distSeg(pts[m], pts[i], pts[j]); if (d > max) { max = d; k = m; } }
    if (max > eps && k > 0) { garde[k] = 1; pile.push([i, k], [k, j]); }
  }
  return pts.filter((_, i) => garde[i]);
}
const arrondir = p => [Math.round(p[0] * ARRONDI) / ARRONDI, Math.round(p[1] * ARRONDI) / ARRONDI];
function aire(anneau) { let s = 0; for (let i = 0; i < anneau.length - 1; i++) s += anneau[i][0] * anneau[i + 1][1] - anneau[i + 1][0] * anneau[i][1]; return Math.abs(s / 2); }
function simplifierAnneau(a) {
  let r = dp(a, EPS).map(arrondir);
  r = r.filter((p, i) => i === 0 || p[0] !== r[i - 1][0] || p[1] !== r[i - 1][1]);
  if (r.length < 4) return null;
  const f = r[0], l = r[r.length - 1]; if (f[0] !== l[0] || f[1] !== l[1]) r.push(f);
  return r.length >= 4 && aire(r) > 2e-6 ? r : null;       // les îlots minuscules disparaissent
}
function simplifier(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates, sortie = [];
  for (const poly of polys) {
    const ext = simplifierAnneau(poly[0]); if (!ext) continue;
    const trous = poly.slice(1).map(simplifierAnneau).filter(Boolean);
    sortie.push([ext, ...trous]);
  }
  return sortie.length === 1 ? { type: 'Polygon', coordinates: sortie[0] } : { type: 'MultiPolygon', coordinates: sortie };
}
async function json(url, essais = 4) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url, { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch (e) { if (i >= essais) throw new Error(url + ' : ' + e.message); await new Promise(r => setTimeout(r, 800 * (i + 1))); }
  }
}
// geo.api.gouv.fr ne publie plus les contours des régions et départements (seulement leurs noms et codes, et les contours des communes) :
// on part du jeu « france-geojson » (IGN Admin Express, Licence Ouverte), dérivé des données de data.gouv.fr.
const SOURCE = 'https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/';
async function collection(fichier) {
  const brut = await json(SOURCE + fichier);
  const features = brut.features.map(f => ({ type: 'Feature', properties: { nom: f.properties.nom, code: f.properties.code }, geometry: simplifier(f.geometry) }));
  features.sort((a, b) => String(a.properties.code).localeCompare(String(b.properties.code)));
  return { type: 'FeatureCollection', attribution: 'IGN Admin Express (data.gouv.fr), Licence Ouverte Etalab 2.0', features };
}
fs.mkdirSync('ui/assets/geo', { recursive: true });
for (const [source, fichier] of [['regions-avec-outre-mer.geojson', 'france-regions.json'], ['departements-avec-outre-mer.geojson', 'france-departements.json']]) {
  const fc = await collection(source);
  const txt = JSON.stringify(fc);
  fs.writeFileSync('ui/assets/geo/' + fichier, txt);
  console.log(fichier, fc.features.length, 'entités,', (txt.length / 1024).toFixed(0), 'Ko');
}
