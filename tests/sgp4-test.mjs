// SGP4 (ui/sgp4.js) : cas d'essai officiel de Vallado (satellite 00005) et cohérence de l'orbite de l'ISS.   node tests/sgp4-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ctx = { console, Math, Date };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../ui/sgp4.js', import.meta.url), 'utf8'), ctx);
const S = ctx.RayleUI.sgp4;
let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };
const proche = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, m + ' : ' + a + ' vs ' + b + ' (±' + tol + ')');

// Cas d'essai du rapport « Revisiting Spacetrack Report #3 » (sgp4-ver.tle, satellite 00005) : valeurs de référence publiées
const L1 = '1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753';
const L2 = '2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667';
t('satellite 00005 : position et vitesse à t = 0 (référence de Vallado, ±50 m)', () => {
  const s = S.lireTLE(L1, L2);
  const p0 = S.propager(s, s.epoqueMs);
  proche(p0.x, 7022.46529266, .05, 'x(0)'); proche(p0.y, -1400.08296755, .05, 'y(0)'); proche(p0.z, 0.03995155, .05, 'z(0)');
  proche(p0.vx, 1.893841015, .0005, 'vx(0)'); proche(p0.vy, 6.405893759, .0005, 'vy(0)'); proche(p0.vz, 4.534807250, .0005, 'vz(0)');
});

// ISS : TLE du 13 octobre 2026 (CelesTrak)
const I1 = '1 25544U 98067A   26286.11204827  .00005858  00000+0  11499-3 0  9991';
const I2 = '2 25544  51.6319  76.5194 0006724 256.4602 103.5638 15.48846742590035';
t('ISS : altitude 380–440 km, latitude ≤ 51,7°, vitesse ≈ 7,66 km/s, sur 3 jours', () => {
  const s = S.lireTLE(I1, I2);
  for (let m = 0; m <= 3 * 1440; m += 7) {
    const tt = s.epoqueMs + m * 60000, p = S.propager(s, tt), g = S.geodesique(p, tt), v = Math.hypot(p.vx, p.vy, p.vz);
    assert.ok(g.alt > 380 && g.alt < 440, 'altitude ' + g.alt + ' à +' + m + ' min');
    assert.ok(Math.abs(g.lat) <= 51.95, 'latitude ' + g.lat);
    assert.ok(v > 7.6 && v < 7.7, 'vitesse ' + v);
  }
});
t('ISS : période ≈ 93 min et décalage vers l’ouest ≈ 23° par orbite', () => {
  const s = S.lireTLE(I1, I2), T = 1440 / 15.48846742;
  proche(T, 92.97, .1, 'période (min)');
  const t0 = s.epoqueMs, a = S.geodesique(S.propager(s, t0), t0), b = S.geodesique(S.propager(s, t0 + T * 60000), t0 + T * 60000);
  let d = a.lon - b.lon; d = ((d % 360) + 360) % 360;
  proche(d, 23.2, 1.2, 'décalage de la trace (°)'); proche(a.lat, b.lat, 1, 'même latitude après une période');
});
// Positions relevées sur le service public api.wheretheiss.at le 13/10/2026 (12 h 59 et 14 h 29 UTC), 10 à 12 h après l'époque du TLE ci-dessous
t('ISS : accord avec le service de position en direct (0,02° ≈ 2 km)', () => {
  const s = S.lireTLE(I1, I2);
  for (const [ts, lat, lon, alt] of [[1791896379, -40.575493, 79.770035, 429.094], [1791901779, -33.489643, 45.898560, 426.631]]) {
    const tt = ts * 1000, g = S.geodesique(S.propager(s, tt), tt);
    proche(g.lat, lat, .02, 'latitude'); proche(g.lon, lon, .02, 'longitude'); proche(g.alt, alt, 1, 'altitude');
  }
});
t('TLE illisible ou orbite lointaine : erreur claire', () => {
  assert.throws(() => S.lireTLE('abc', 'def'), /illisible/);
  assert.throws(() => S.lireTLE('1 25544U 98067A   26286.11204827  .00005858  00000+0  11499-3 0  9991', '2 25544  51.6319  76.5194 0006724 256.4602 103.5638  1.00271798590035'), /lointaine/);
});
console.log(ok + ' tests réussis');
