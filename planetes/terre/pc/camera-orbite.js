import { R, RAD, vers, lonLat, base, add, sub, mul, dot, cross, unit, norme, tourner, lim, rayonSphere, distanceKm } from './geo.js';

/* ═════════════ CAMÉRA EN ORBITE (pur) ═════════════
   État : le point visé au sol (lon, lat), la distance caméra→point (dist, km), le cap (0 = nord en haut de l'écran) et l'inclinaison
   (0 = vue du dessus). Haut de la vue d'ensemble : l'inclinaison s'efface d'elle-même (on regarde toujours la planète de face).
   Tout est en double précision ; le rendu soustrait la position de la caméra des objets. */
export const DIST_MIN = 0.2, DIST_MAX = R * 7, INCL_MAX = 78 * RAD;
const lisse = (a, b, x) => { const t = lim((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const etatInitial = (o = {}) => ({ lon: 0, lat: 20, dist: R * 3.2, cap: 0, incl: 0, ...o });
export const inclinaisonUtile = e => e.incl * (1 - lisse(1500, 7000, e.dist));

/* Pose complète : position de la caméra, base (droite, haut, avant), altitude de la caméra. hCible : altitude du sol visé (km). */
export function pose(e, hCible = 0) {
  const b = base(e.lon, e.lat), P = mul(b.haut, R + hCible);
  const hd = add(mul(b.nord, Math.cos(e.cap)), mul(b.est, Math.sin(e.cap)));
  const ie = inclinaisonUtile(e);
  const cam = add(P, mul(add(mul(b.haut, Math.cos(ie)), mul(hd, -Math.sin(ie))), e.dist));
  const avant = unit(sub(P, cam));
  const hautS = add(mul(b.haut, Math.sin(ie)), mul(hd, Math.cos(ie)));
  const droite = unit(cross(avant, hautS)), haut = cross(droite, avant);
  return { cam, droite, haut, avant, cible: P, altitude: norme(cam) - R, base: b, hd };
}
/* Rayon de visée (unitaire) pour un pixel normalisé (nx, ny ∈ [-1, 1], ny vers le haut). */
export function rayon(p, fov, aspect, nx, ny) {
  const t = Math.tan(fov / 2);
  return unit(add(add(p.avant, mul(p.droite, nx * t * aspect)), mul(p.haut, ny * t)));
}
export const pointAuSol = (p, fov, aspect, nx, ny, hCible = 0) => rayonSphere(p.cam, rayon(p, fov, aspect, nx, ny), R + hCible);

/* Fait tourner la caméra autour du centre de la Terre (rotation d'axe unitaire et d'angle donnés) : la cible et le cap suivent. */
export function tournerEtat(e, axe, ang) {
  const b = base(e.lon, e.lat);
  const hd = add(mul(b.nord, Math.cos(e.cap)), mul(b.est, Math.sin(e.cap)));
  const haut2 = tourner(b.haut, axe, ang), hd2 = tourner(hd, axe, ang);
  const ll = lonLat(haut2), b2 = base(ll.lon, ll.lat);
  return { ...e, lon: ll.lon, lat: lim(ll.lat, -89.5, 89.5), cap: Math.atan2(dot(hd2, b2.est), dot(hd2, b2.nord)) };
}
/* « Saisir le sol » : amène le point A (saisi au départ) sous le pixel (nx, ny). Renvoie le nouvel état, ou le même si le pixel est dans le ciel. */
export function saisir(e, A, fov, aspect, nx, ny, hCible = 0) {
  const p = pose(e, hCible), B = pointAuSol(p, fov, aspect, nx, ny, hCible);
  if (!B) return e;
  const a = unit(A), b = unit(B), c = cross(b, a), s = norme(c);
  if (s < 1e-12) return e;
  return tournerEtat(e, mul(c, 1 / s), Math.atan2(s, dot(b, a)));
}
/* Zoom (facteur < 1 : on se rapproche). Si un pixel est donné, le point du sol sous lui reste sous lui. */
export function zoomer(e, facteur, fov, aspect, nx = null, ny = null, hCible = 0) {
  const A = nx === null ? null : pointAuSol(pose(e, hCible), fov, aspect, nx, ny, hCible);
  const n = { ...e, dist: lim(e.dist * facteur, DIST_MIN, DIST_MAX) };
  return A ? saisir(n, A, fov, aspect, nx, ny, hCible) : n;
}
export function incliner(e, dCap, dIncl) {
  return { ...e, cap: e.cap + dCap, incl: lim(e.incl + dIncl, 0, INCL_MAX) };
}

/* Vol cinématique de l'état a vers l'état b (t ∈ [0,1]) : arc de grand cercle, la caméra prend de la hauteur au milieu du trajet. */
export function etatVol(a, b, t, { arc = null } = {}) {
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const va = unit(vers(a.lon, a.lat)), vb = unit(vers(b.lon, b.lat));
  const ang = Math.acos(lim(dot(va, vb), -1, 1));
  let v;
  if (ang < 1e-9) v = vb;
  else { const axe = unit(cross(va, vb)); v = tourner(va, axe, ang * e); }
  const ll = lonLat(v);
  const grand = Math.max(a.dist, b.dist), monte = arc ?? Math.max(0, Math.log(Math.min(R * 3, ang * R * 0.8) / grand));   // plus on va loin, plus on prend de la hauteur (bornée)
  let dCap = (b.cap - a.cap) % (2 * Math.PI); if (dCap > Math.PI) dCap -= 2 * Math.PI; if (dCap < -Math.PI) dCap += 2 * Math.PI;
  const ld = Math.log(a.dist) + (Math.log(b.dist) - Math.log(a.dist)) * e + Math.sin(Math.PI * e) * monte;
  return { lon: ll.lon, lat: ll.lat, dist: lim(Math.exp(ld), DIST_MIN, DIST_MAX), cap: a.cap + dCap * e, incl: a.incl + (b.incl - a.incl) * e };
}
export const dureeVol = (a, b) => lim(1.6 + distanceKm(a.lon, a.lat, b.lon, b.lat) / R * 1.4 + Math.abs(Math.log(a.dist / b.dist)) * 0.12, 1.6, 5.5);
