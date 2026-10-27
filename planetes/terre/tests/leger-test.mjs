// Carte plate de la Terre (mode léger tablette / téléphone) : calculs purs. Lancer : node planetes/terre/tests/leger-test.mjs
import * as C from '../leger/carte-calcul.js';
import { imagerie } from '../pc/sources.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const proche = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ── projection ──
let p = C.versPixel(0, 0, 0); v('centre du monde au zoom 0 : (128, 128)', proche(p.x, 128) && proche(p.y, 128), JSON.stringify(p));
p = C.versPixel(-180, C.LAT_MAX, 3); v('coin haut gauche', proche(p.x, 0) && Math.abs(p.y) < 1e-6);
for (const [lon, lat, z] of [[2.35, 48.85, 7], [139.7, 35.7, 11.5], [-122.4, 37.8, 3], [0, 80, 5], [179.9, -60, 9.25]]) { const a = C.versPixel(lon, lat, z), q = C.versLonLat(a.x, a.y, z); v('aller-retour ' + lon + ',' + lat, proche(q.lon, lon, 1e-9) && proche(q.lat, lat, 1e-9)); }
v('Paris au niveau 7 : tuile (64, 44)', (() => { const q = C.versPixel(2.35, 48.85, 7); return Math.floor(q.x / 256) === 64 && Math.floor(q.y / 256) === 44; })());
v('longitude normalisée', C.normaliserLon(190) === -170 && C.normaliserLon(-190) === 170 && C.normaliserLon(360) === 0);

// ── contraintes ──
const L = 800, H = 600;
v('zoom minimal : le monde remplit l’écran', C.monde(C.zoomMin(L, H)) >= L - 0.01 && C.monde(C.zoomMin(L, H)) <= L + 0.1, String(C.zoomMin(L, H)));
let vue = C.contraindre({ lon: 0, lat: 89, zoom: 6 }, L, H); v('pas au-delà du pôle : la vue reste dans le monde', C.versPixel(vue.lon, vue.lat, vue.zoom).y >= H / 2 - 1e-6);
vue = C.contraindre({ lon: 10, lat: 0, zoom: 0.1 }, L, H); v('zoom trop faible relevé', vue.zoom >= C.zoomMin(L, H) - 1e-9);
vue = C.contraindre({ lon: 10, lat: 0, zoom: 30 }, L, H, { zoomMax: 12 }); v('zoom trop fort plafonné', vue.zoom === 12);

// ── glisser ──
const v0 = { lon: 2, lat: 48, zoom: 8 }, v1 = C.deplacer(v0, 100, 0);
v('glisser de 100 px vers la droite : la carte va vers l’ouest (la longitude diminue)', v1.lon < v0.lon && proche(v1.lat, v0.lat, 1e-9));
v('glisser puis revenir = identique', (() => { const r = C.deplacer(v1, -100, 0); return proche(r.lon, v0.lon, 1e-9) && proche(r.lat, v0.lat, 1e-9); })());
v('la longitude boucle au-delà de 180', (() => { const r = C.deplacer({ lon: 179, lat: 0, zoom: 4 }, -2000, 0); return r.lon >= -180 && r.lon <= 180; })());

// ── zoom autour d'un point : le point visé ne bouge pas à l'écran ──
const point = (vu, px, py) => { const c = C.versPixel(vu.lon, vu.lat, vu.zoom); return C.versLonLat(c.x - L / 2 + px, c.y - H / 2 + py, vu.zoom); };
for (const [px, py, dz] of [[100, 100, 1], [700, 500, 0.5], [400, 300, -1], [50, 550, 2.3]]) {
  const base = { lon: 20, lat: 40, zoom: 6 }, avant = point(base, px, py), apres = C.zoomerAutour(base, L, H, px, py, dz), apresPoint = point(apres, px, py);
  v('zoom ' + dz + ' autour de (' + px + ',' + py + ') : le point visé reste en place', proche(avant.lon, apresPoint.lon, 1e-7) && proche(avant.lat, apresPoint.lat, 1e-7), JSON.stringify([avant, apresPoint]));
}
v('zoomer de 1 = monde ×2', proche(C.zoomerAutour(v0, L, H, L / 2, H / 2, 1).zoom, 9));

// ── pincement ──
const pc = C.pincement({ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 50, y: 100 }, { x: 250, y: 100 });
v('doigts qui s’écartent ×2 → +1 niveau de zoom', proche(pc.deltaZoom, 1) && pc.m1.x === 150);
v('doigts qui se rapprochent → zoom arrière', C.pincement({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 0 }).deltaZoom < 0);
v('deux doigts au même endroit : pas de division par zéro', Number.isFinite(C.pincement({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 9, y: 9 }, { x: 9, y: 9 }).deltaZoom));

// ── tuiles visibles ──
let t = C.tuilesVisibles({ lon: 2.35, lat: 48.85, zoom: 7.2 }, L, H);
v('niveau 7 pour le zoom 7,2', t.every(q => q.z === 7));
v('la tuile qui contient Paris est dessinée, au centre en premier', t[0].x === 64 && t[0].y === 44, JSON.stringify(t[0]));
v('les tuiles couvrent tout l’écran', (() => { const xs = t.map(q => q.px), ys = t.map(q => q.py), ts = t[0].t; return Math.min(...xs) <= 0 && Math.max(...xs) + ts >= L && Math.min(...ys) <= 0 && Math.max(...ys) + ts >= H; })());
v('pas de doublon', new Set(t.map(q => q.z + '/' + q.x + '/' + q.y + '@' + Math.round(q.px))).size === t.length);
v('taille d’une tuile = 256 × 2^(zoom − niveau)', proche(t[0].t, 256 * 2 ** (7.2 - 7), 1e-6));
t = C.tuilesVisibles({ lon: 179.5, lat: 0, zoom: 5 }, L, H);
v('à l’antiméridien : les colonnes bouclent (0 et 31 voisines)', t.some(q => q.x === 31) && t.some(q => q.x === 0));
t = C.tuilesVisibles({ lon: 0, lat: 84, zoom: 6 }, L, H); v('près du pôle : aucune ligne hors du monde', t.every(q => q.y >= 0 && q.y < 64));
v('niveau plafonné au zoom maximal', C.tuilesVisibles({ lon: 0, lat: 0, zoom: 14 }, L, H, { zMax: 12 })[0].z === 12);
v('écran haute densité : un niveau de plus à partir de ×4', C.niveauTuiles(6.4, 12, 1) === 6 && C.niveauTuiles(6.4, 12, 4) === 7);
v('nombre de tuiles raisonnable (écran 1366×1024, zoom 8,4)', C.tuilesVisibles({ lon: 2, lat: 48, zoom: 8.4 }, 1366, 1024).length <= 45);

// ── ancêtre ──
const a = C.ancetreTuile(7, 65, 44, 5); v('ancêtre de (7,65,44) au niveau 5 : (5,16,11), sous-rectangle 1/4', a.z === 5 && a.x === 16 && a.y === 11 && proche(a.k, 0.25) && proche(a.u, 0.25) && proche(a.v, 0), JSON.stringify(a));
v('même niveau : tuile entière', (b => b.k === 1 && b.u === 0)(C.ancetreTuile(4, 3, 2, 4)));

// ── sources : mêmes adresses que le globe ──
v('niveau 5 : Blue Marble de la NASA', /gibs/.test(imagerie(5, 16, 11, { eox: true }).url));
v('niveau 8 avec Sentinel-2 autorisé : EOX', imagerie(8, 129, 88, { eox: true }).source === 'eox');
v('niveau 8 sans Sentinel-2 (réglage) : NASA', imagerie(8, 129, 88, { eox: false }).source === 'gibs');

// ── épingles ──
const sujets = [
  { id: 'a', importance: 5, lieu: { lat: 48.85, lon: 2.35 } }, { id: 'b', importance: 2, lieu: { lat: 48.86, lon: 2.36 } }, { id: 'c', importance: 3, lieu: { lat: 35.7, lon: 139.7 } }, { id: 'd', importance: 1 }
];
let e = C.epingles(sujets, { lon: 2.35, lat: 48.85, zoom: 6 }, L, H);
v('deux sujets voisins sont regroupés (le plus important porte l’épingle)', e.length === 1 && e[0].n === 2 && e[0].sujet.id === 'a', JSON.stringify(e));
v('sujet sans lieu ignoré, sujet hors écran ignoré', e.every(x => x.sujet.id !== 'd' && x.sujet.id !== 'c'));
e = C.epingles(sujets, { lon: 2.35, lat: 48.85, zoom: 11 }, L, H); v('en zoomant, les épingles restent dans l’écran', e.length >= 1 && e.every(x => x.x > -20 && x.x < L + 20));
e = C.epingles([{ id: 'x', importance: 1, lieu: { lat: 0, lon: 179.5 } }], { lon: -179.5, lat: 0, zoom: 4 }, L, H); v('le monde boucle : un lieu à 179,5° est visible depuis −179,5°', e.length === 1, JSON.stringify(e));
v('au plus 60 épingles', C.epingles(Array.from({ length: 300 }, (_, i) => ({ id: i, importance: 1, lieu: { lat: -60 + i * 0.4, lon: -170 + i * 1.1 } })), { lon: 0, lat: 0, zoom: 2 }, 1600, 1000).length <= 60);

// ── choix du mode ──
v('auto : PC → globe 3D, tablette et téléphone → carte plate', C.carteChoisie('auto', 'pc') === false && C.carteChoisie('auto', 'tablette') === true && C.carteChoisie('auto', 'telephone') === true);
v('préférence « leger » : toujours la carte plate, « 3d » : jamais', C.carteChoisie('leger', 'pc') === true && C.carteChoisie('3d', 'telephone') === false);

v('zoom d’un lieu selon la distance de caméra du globe (pays < région < ville)', C.zoomPourDistance(3200) < C.zoomPourDistance(700) && C.zoomPourDistance(700) < C.zoomPourDistance(160) && C.zoomPourDistance(160) < C.zoomPourDistance(9) && C.zoomPourDistance(NaN) === 8);
// ── échelle ──
const be = C.barreEchelle(48, 8); v('barre d’échelle : valeur ronde et longueur ≤ 110 px', be.px <= 110 && be.px > 20 && /km|m/.test(be.texte) && [1, 2, 5].includes(be.km / 10 ** Math.floor(Math.log10(be.km))), JSON.stringify(be));
console.log(`${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
