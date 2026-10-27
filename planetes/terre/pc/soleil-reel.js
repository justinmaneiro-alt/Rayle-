import { vers, unit, RAD } from './geo.js';

/* ═════════════ POSITION RÉELLE DU SOLEIL (pur) ═════════════
   Formules astronomiques abrégées (précision ≈ 0,01°, bien assez pour une ligne jour/nuit).
   Renvoie le point où le Soleil est au zénith (latitude = déclinaison) et la direction du Soleil dans le repère du globe. */
const norm360 = a => ((a % 360) + 360) % 360;

export function soleilReel(date = new Date()) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;      // jours depuis J2000
  const L = norm360(280.460 + 0.9856474 * d), g = norm360(357.528 + 0.9856003 * d) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * d) * RAD;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const asc = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmst = norm360(280.46061837 + 360.98564736629 * d);
  let lon = norm360(asc / RAD - gmst); if (lon > 180) lon -= 360;
  const lat = decl / RAD;
  return { lon, lat, direction: unit(vers(lon, lat)) };
}
