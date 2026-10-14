// Génère ui/espace-pays-centres.js : centre (latitude, longitude) et étendue de chaque pays du jeu de contours world-atlas (js/vendor/world-110m.json, ISC) ;
// le centre est celui de la boîte englobante du plus grand polygone du pays (approximation d'un point d'intérêt, pas une frontière).
//   node scripts/generer-centres-pays.mjs
import fs from 'node:fs';
import vm from 'node:vm';

const topo = JSON.parse(fs.readFileSync('js/vendor/world-110m.json', 'utf8'));
const ctx = { self: {}, window: {}, exports: {}, module: { exports: {} } }; ctx.self = ctx.window = ctx;
vm.createContext(ctx); vm.runInContext(fs.readFileSync('js/vendor/topojson-client.min.js', 'utf8'), ctx);
const T = ctx.exports;
const features = T.feature(topo, topo.objects.countries).features;
const aire = r => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a) / 2; };
const lignes = [];
for (const f of features) {
  const g = f.geometry; if (!g || f.id == null || f.id === '' || isNaN(+f.id)) continue;      // quelques territoires (Kosovo, Chypre du Nord, Somaliland) n'ont pas de code ISO numérique
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let best = null, ba = -1; for (const p of polys) { const a = aire(p[0]); if (a > ba) { ba = a; best = p[0]; } }
  let ring = best; { const xs = ring.map(p => p[0]); if (Math.max(...xs) - Math.min(...xs) > 180) ring = ring.map(([x, y]) => [x < 0 ? x + 360 : x, y]); }      // polygone qui traverse l'antiméridien (Russie, Fidji)
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const etendue = Math.max(y1 - y0, (x1 - x0) * Math.cos(((y0 + y1) / 2) * Math.PI / 180));       // degrés d'arc, approximatif
  const cx = (x0 + x1) / 2; lignes.push([String(f.id).padStart(3, '0'), +((y0 + y1) / 2).toFixed(1), +(cx > 180 ? cx - 360 : cx).toFixed(1), +etendue.toFixed(1)]);
}
lignes.sort((a, b) => a[0].localeCompare(b[0]));
const sortie = `"use strict";
/* Centres des pays (généré par scripts/generer-centres-pays.mjs depuis les contours world-atlas, ISC) : [code ISO numérique, latitude, longitude, étendue en degrés d'arc].
   Approximation (centre de la boîte du plus grand polygone) : un point pour viser le pays, pas une frontière. Les noms français viennent de window.RaylePays (js/rayle/pays-donnees.js). */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  UI.espacePaysCentres=${JSON.stringify(lignes)};
})();
`;
fs.writeFileSync('ui/espace-pays-centres.js', sortie);
console.log(lignes.length + ' pays → ui/espace-pays-centres.js (' + sortie.length + ' octets)');
