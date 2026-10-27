/* ═════════════ TERRE, MODE LÉGER : CALCULS DE LA CARTE PLATE (pur, testé sous Node : planetes/terre/tests/leger-test.mjs) ═════════════
   Une carte Web Mercator « glissante » (comme toutes les cartes des téléphones) : un centre (lon, lat), un zoom fractionnaire, la taille de l'écran. Aucune dépendance, aucun DOM.
   Les mêmes sources de tuiles que le globe (sources.js) ; seule la façon de les dessiner change : une image plate au lieu d'une sphère, donc presque aucun travail pour la carte graphique. */
export const TAILLE = 256, LAT_MAX = Math.atan(Math.sinh(Math.PI)) * 180 / Math.PI;
const RAD = Math.PI / 180;
export const lim = (v, a, b) => Math.max(a, Math.min(b, v));
export const monde = zoom => TAILLE * 2 ** zoom;                                  // largeur du monde en pixels
export function versPixel(lon, lat, zoom) {                                        // degrés → pixels du monde (origine en haut à gauche)
  const m = monde(zoom), a = lim(lat, -LAT_MAX, LAT_MAX) * RAD;
  return { x: (lon + 180) / 360 * m, y: (1 - Math.log(Math.tan(a) + 1 / Math.cos(a)) / Math.PI) / 2 * m };
}
export function versLonLat(x, y, zoom) {                                           // pixels du monde → degrés
  const m = monde(zoom);
  return { lon: x / m * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / m))) / RAD };
}
export const normaliserLon = lon => ((((lon + 180) % 360) + 360) % 360) - 180;

/* Limites : on ne montre jamais plus que le monde (zoom minimal), ni au-delà du pôle ; la longitude boucle. */
export function zoomMin(l, h) { return Math.max(0, Math.log2(Math.max(l, h, TAILLE) / TAILLE)); }
export function contraindre(vue, l, h, { zoomMax = 12 } = {}) {
  const zoom = lim(vue.zoom, zoomMin(l, h), zoomMax), c = versPixel(vue.lon, vue.lat, zoom), m = monde(zoom);
  const y = lim(c.y, h / 2, m - h / 2), r = versLonLat(c.x, y, zoom);   // zoomMin garantit m >= h
  return { lon: normaliserLon(r.lon), lat: lim(r.lat, -LAT_MAX, LAT_MAX), zoom };
}
/* Glissement de (dx, dy) pixels : la carte suit le doigt. */
export function deplacer(vue, dx, dy) {
  const c = versPixel(vue.lon, vue.lat, vue.zoom), r = versLonLat(c.x - dx, c.y - dy, vue.zoom);
  return { ...vue, lon: normaliserLon(r.lon), lat: lim(r.lat, -LAT_MAX, LAT_MAX) };
}
/* Zoom autour d'un point de l'écran (px, py mesurés depuis le coin haut gauche de la carte) : le point visé reste sous le doigt. */
export function zoomerAutour(vue, l, h, px, py, deltaZoom) {
  const z2 = vue.zoom + deltaZoom, c = versPixel(vue.lon, vue.lat, vue.zoom), f = 2 ** deltaZoom;
  const mondeX = c.x - l / 2 + px, mondeY = c.y - h / 2 + py;                       // point visé, en pixels du monde au zoom actuel
  const nx = mondeX * f - (px - l / 2), ny = mondeY * f - (py - h / 2), r = versLonLat(nx, ny, z2);
  return { lon: normaliserLon(r.lon), lat: lim(r.lat, -LAT_MAX, LAT_MAX), zoom: z2 };
}
/* Pincement : de deux doigts (a0, b0) à deux doigts (a1, b1) → { deltaZoom, dx, dy } à appliquer (zoom autour du milieu, puis glissement du milieu). */
export function pincement(a0, b0, a1, b1) {
  const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y) || 1, d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y) || 1;
  return { deltaZoom: Math.log2(d1 / d0), m0: { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, m1: { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 } };
}
export const echelleKm = (lat, zoom) => 40075.017 * Math.cos(lat * RAD) / monde(zoom);   // kilomètres par pixel

/* Niveau de tuiles à demander : l'entier le plus proche du zoom, plafonné ; en dessous de 1 on prend le niveau 1 (4 tuiles) pour garder des images nettes. */
export const niveauTuiles = (zoom, zMax = 12, dpr = 1) => lim(Math.round(zoom + Math.log2(Math.max(1, dpr)) * 0.5), 0, zMax);

/* Tuiles à dessiner pour la vue. Chaque tuile : niveau z, colonnes/lignes x,y (x enroulé sur le monde), position écran (px, py) et taille. L'ordre va du centre vers les bords. */
export function tuilesVisibles(vue, l, h, { zMax = 12, dpr = 1 } = {}) {
  const z = niveauTuiles(vue.zoom, zMax, dpr), echelle = 2 ** (vue.zoom - z), t = TAILLE * echelle, n = 2 ** z;
  const c = versPixel(vue.lon, vue.lat, vue.zoom), x0 = c.x - l / 2, y0 = c.y - h / 2;
  const i0 = Math.floor(x0 / t), i1 = Math.floor((x0 + l) / t), j0 = Math.max(0, Math.floor(y0 / t)), j1 = Math.min(n - 1, Math.floor((y0 + h) / t));
  const liste = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) liste.push({ z, x: ((i % n) + n) % n, y: j, px: i * t - x0, py: j * t - y0, t });
  const cx = l / 2, cy = h / 2;
  return liste.sort((a, b) => Math.hypot(a.px + a.t / 2 - cx, a.py + a.t / 2 - cy) - Math.hypot(b.px + b.t / 2 - cx, b.py + b.t / 2 - cy));
}
/* Ancêtre d'une tuile à un niveau plus grossier, avec le sous-rectangle (u, v, k) de l'ancêtre qui la couvre : sert à montrer tout de suite une image floue pendant que la nette arrive. */
export function ancetreTuile(z, x, y, zs) {
  const d = z - zs; if (d <= 0) return { z, x, y, u: 0, v: 0, k: 1 };
  const k = 1 / 2 ** d;
  return { z: zs, x: x >> d, y: y >> d, u: (x - ((x >> d) << d)) * k, v: (y - ((y >> d) << d)) * k, k };
}

/* Épingles d'actualité : sujets avec lieu → positions écran, regroupées par cases de `case` pixels (une case = une épingle, le plus important d'abord, avec le nombre de sujets qu'elle porte). */
export function epingles(sujets, vue, l, h, { caseTaille = 34, max = 60 } = {}) {
  const c = versPixel(vue.lon, vue.lat, vue.zoom), m = monde(vue.zoom), cases = new Map();
  for (const s of sujets) {
    if (!s.lieu) continue;
    const p = versPixel(s.lieu.lon, s.lieu.lat, vue.zoom);
    let dx = p.x - c.x; if (dx > m / 2) dx -= m; else if (dx < -m / 2) dx += m;      // le monde boucle : on prend la copie la plus proche du centre
    const x = l / 2 + dx, y = h / 2 + (p.y - c.y);
    if (x < -20 || x > l + 20 || y < -20 || y > h + 20) continue;
    const cle = Math.floor(x / caseTaille) + ':' + Math.floor(y / caseTaille), e = cases.get(cle);
    if (!e) cases.set(cle, { x, y, sujet: s, n: 1 });
    else { e.n++; if ((s.importance || 0) > (e.sujet.importance || 0)) { e.sujet = s; e.x = x; e.y = y; } }
  }
  return [...cases.values()].sort((a, b) => (b.sujet.importance || 0) - (a.sujet.importance || 0)).slice(0, max);
}
/* Quel appareil prend la carte plate ? 'auto' : tout sauf un PC ; 'leger' : toujours ; '3d' : jamais. */
export function carteChoisie(preference, appareil) {
  if (preference === 'leger') return true;
  if (preference === '3d') return false;
  return appareil !== 'pc';
}
/* Texte d'échelle « 50 km » arrondi à 1, 2, 5 × 10^n, avec sa longueur en pixels (≤ maxPx). */
export function barreEchelle(lat, zoom, maxPx = 110) {
  const kmParPx = echelleKm(lat, zoom), brut = kmParPx * maxPx, p = 10 ** Math.floor(Math.log10(brut));
  const km = [5, 2, 1].map(f => f * p).find(v => v <= brut) || p, px = km / kmParPx;
  return { km, px, texte: km >= 1 ? Math.round(km) + ' km' : Math.round(km * 1000) + ' m' };
}
/* Zoom qui montre un lieu à la distance de caméra (km) qu'utilise le globe pour ce type de lieu (pays 3200, région 700, ville 9…). */
export function zoomPourDistance(km) {
  const d = Number(km); if (!Number.isFinite(d) || d <= 0) return 8;
  return d >= 2000 ? 3.6 : d >= 1000 ? 4.6 : d >= 500 ? 5.6 : d >= 150 ? 7.4 : d >= 50 ? 9 : d >= 20 ? 10.6 : 12;
}
