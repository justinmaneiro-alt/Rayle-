/* ═════════════ GÉOMÉTRIE DU GLOBE (pur, sans navigateur) ═════════════
   Unité : le kilomètre. Terre sphérique de rayon R (assez précis pour l'affichage ; les tuiles Web Mercator sont projetées sur cette sphère).
   Repère : Y vers le pôle nord, X vers (longitude 0, latitude 0), l'est vers -Z. Tout est calculé en double précision :
   le rendu soustrait la position de la caméra AVANT de passer au GPU (sinon le sol tremble à l'échelle d'une rue). */
export const R = 6371.0088;
export const RAD = Math.PI / 180;
export const LAT_MAX = Math.atan(Math.sinh(Math.PI)) / RAD;   // 85,0511° : limite du Web Mercator

export const lim = (v, a, b) => Math.max(a, Math.min(b, v));
export const vers = (lon, lat, h = 0) => {            // degrés, altitude (km) → [x, y, z] depuis le centre
  const r = R + h, a = lat * RAD, o = lon * RAD, c = Math.cos(a);
  return [r * c * Math.cos(o), r * Math.sin(a), -r * c * Math.sin(o)];
};
export const lonLat = v => {                          // inverse : [x, y, z] → { lon, lat, h }
  const r = Math.hypot(v[0], v[1], v[2]);
  return { lon: Math.atan2(-v[2], v[0]) / RAD, lat: Math.asin(lim(v[1] / r, -1, 1)) / RAD, h: r - R };
};
export const base = (lon, lat) => {                   // repère local : haut, est, nord
  const a = lat * RAD, o = lon * RAD, sa = Math.sin(a), ca = Math.cos(a), so = Math.sin(o), co = Math.cos(o);
  return { haut: [ca * co, sa, -ca * so], est: [-so, 0, -co], nord: [-sa * co, ca, sa * so] };
};

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norme = a => Math.hypot(a[0], a[1], a[2]);
export const unit = a => { const n = norme(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
/* Rotation de Rodrigues d'un vecteur autour d'un axe unitaire. */
export const tourner = (v, axe, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang), d = dot(axe, v), x = cross(axe, v);
  return [v[0] * c + x[0] * s + axe[0] * d * (1 - c), v[1] * c + x[1] * s + axe[1] * d * (1 - c), v[2] * c + x[2] * s + axe[2] * d * (1 - c)];
};
/* Distance sur la sphère (km) entre deux points (degrés). */
export const distanceKm = (lon1, lat1, lon2, lat2) => {
  const a = lat1 * RAD, b = lat2 * RAD, dl = (lon2 - lon1) * RAD;
  const h = Math.sin((b - a) / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

/* ── Tuiles Web Mercator (schéma XYZ : y = 0 au nord) ── */
export const lonDeX = (x, z) => x / 2 ** z * 360 - 180;
export const latDeY = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** z))) / RAD;
export const xDeLon = (lon, z) => (lon + 180) / 360 * 2 ** z;
export const yDeLat = (lat, z) => { const a = lim(lat, -LAT_MAX, LAT_MAX) * RAD; return (1 - Math.log(Math.tan(a) + 1 / Math.cos(a)) / Math.PI) / 2 * 2 ** z; };
export const tuileDe = (lon, lat, z) => ({ z, x: Math.min(2 ** z - 1, Math.max(0, Math.floor(xDeLon(lon, z)))), y: Math.min(2 ** z - 1, Math.max(0, Math.floor(yDeLat(lat, z)))) });
export const cle = (z, x, y) => z + '/' + x + '/' + y;
export const parent = t => ({ z: t.z - 1, x: t.x >> 1, y: t.y >> 1 });
/* Point de la tuile (u, v) ∈ [0,1]² (v = 0 au nord) → longitude, latitude. */
export const tuileLonLat = (z, x, y, u, v) => ({ lon: lonDeX(x + u, z), lat: latDeY(y + v, z) });
export const tuileCentre = (z, x, y) => { const p = tuileLonLat(z, x, y, 0.5, 0.5); return { lon: p.lon, lat: p.lat, v: vers(p.lon, p.lat) }; };
/* Largeur d'une tuile (km) à sa latitude centrale. */
export const tuileLargeurKm = (z, x, y) => 2 * Math.PI * R * Math.cos(tuileCentre(z, x, y).lat * RAD) / 2 ** z;
/* Rayon de la sphère englobante d'une tuile autour de son centre (km), marge d'altitude comprise. */
export function tuileRayon(z, x, y, marge = 9) {
  const c = tuileCentre(z, x, y).v;
  let m = 0;
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]]) { const p = tuileLonLat(z, x, y, u, v); m = Math.max(m, norme(sub(vers(p.lon, p.lat), c))); }
  return m + marge;
}
/* Sous-rectangle d'une tuile (z,x,y) dans son ancêtre de niveau zs : { zs, xs, ys, ox, oy, k } ; uv_source = (ox, oy) + uv_tuile × k. */
export function ancetre(z, x, y, zs) {
  if (zs >= z) return { zs: z, xs: x, ys: y, ox: 0, oy: 0, k: 1 };
  const d = z - zs, n = 2 ** d;
  return { zs, xs: x >> d, ys: y >> d, ox: (x & (n - 1)) / n, oy: (y & (n - 1)) / n, k: 1 / n };
}

/* ── Rayon contre sphère (centre = origine) : point d'impact le plus proche ou null ── */
export function rayonSphere(o, d, rayon) {
  const b = dot(o, d), c = dot(o, o) - rayon * rayon, disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? add(o, mul(d, t)) : null;
}
/* Distance à l'horizon (km) depuis une altitude (km). */
export const horizonKm = alt => Math.sqrt(Math.max(0, (R + alt) ** 2 - R * R));
/* Le point P (sur la sphère) est-il du côté de la caméra par rapport à l'horizon ? Marge de 1,5 % de l'angle d'horizon : ce qui frôle le limbe est caché (pas d'étiquette posée sur la tranche du globe). */
export const faceCamera = (P, cam) => {
  const rp = norme(P), rc = norme(cam);
  if (rc <= rp) return false;
  return Math.acos(lim(dot(P, cam) / (rp * rc), -1, 1)) < Math.acos(rp / rc) * 0.985;
};
