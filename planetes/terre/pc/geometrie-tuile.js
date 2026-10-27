import { R, RAD, tuileLonLat, tuileCentre, tuileRayon } from './geo.js';

/* ═════════════ MAILLE D'UNE TUILE (pur) ═════════════
   Grille (n+1)² sommets, plus une « jupe » : un anneau de sommets en doublon sur le bord, abaissé par le nuanceur, qui cache les fentes
   entre deux tuiles de niveaux différents. Les positions sont données par rapport au centre de la tuile (précision), au niveau de la mer ;
   le relief est ajouté par le nuanceur de sommets le long de la direction radiale (aRad).
   Convention : v = 0 au nord, comme les lignes d'une image. */
export function construireTuile(z, x, y, n = 32) {
  const c = tuileCentre(z, x, y), m = n + 3;
  const position = new Float32Array(m * m * 3), rad = new Float32Array(m * m * 3), uv = new Float32Array(m * m * 2), jupe = new Float32Array(m * m);
  let k = 0;
  for (let j = 0; j < m; j++) {
    const v = Math.min(1, Math.max(0, (j - 1) / n));
    for (let i = 0; i < m; i++, k++) {
      const u = Math.min(1, Math.max(0, (i - 1) / n));
      const p = tuileLonLat(z, x, y, u, v), a = p.lat * RAD, o = p.lon * RAD, ca = Math.cos(a);
      const dx = ca * Math.cos(o), dy = Math.sin(a), dz = -ca * Math.sin(o);
      position[k * 3] = R * dx - c.v[0]; position[k * 3 + 1] = R * dy - c.v[1]; position[k * 3 + 2] = R * dz - c.v[2];
      rad[k * 3] = dx; rad[k * 3 + 1] = dy; rad[k * 3 + 2] = dz;
      uv[k * 2] = u; uv[k * 2 + 1] = v;
      jupe[k] = (i === 0 || j === 0 || i === m - 1 || j === m - 1) ? 1 : 0;
    }
  }
  const index = new Uint16Array((m - 1) * (m - 1) * 6);
  let q = 0;
  for (let j = 0; j < m - 1; j++) for (let i = 0; i < m - 1; i++) {
    const a = j * m + i, b = a + 1, c2 = a + m, d = c2 + 1;
    index[q++] = a; index[q++] = c2; index[q++] = b; index[q++] = b; index[q++] = c2; index[q++] = d;
  }
  return { position, rad, uv, jupe, index, centre: c.v, lon: c.lon, lat: c.lat, rayon: tuileRayon(z, x, y, 12) };
}
