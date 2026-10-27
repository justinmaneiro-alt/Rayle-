import assert from 'node:assert/strict';
import * as G from '../pc/geo.js';
import { selectionner, couper, aCharger } from '../pc/quadtree.js';
import { soleilReel } from '../pc/soleil-reel.js';
import * as C from '../pc/camera-orbite.js';
import * as S from '../pc/sources.js';
import { construireTuile } from '../pc/geometrie-tuile.js';

let ok = 0;
const t = (nom, f) => { try { f(); ok++; console.log('OK  ' + nom); } catch (e) { console.log('KO  ' + nom + ' — ' + e.message); process.exitCode = 1; } };
const proche = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, (msg || '') + ' ' + a + ' ≠ ' + b);

t('lon/lat ↔ vecteur', () => {
  for (const [lo, la] of [[0, 0], [2.35, 48.85], [-122.4, 37.8], [139.7, 35.7], [180, -33], [10, 89]]) {
    const v = G.vers(lo, la, 3), r = G.lonLat(v);
    proche(r.lat, la, 1e-9); proche(((r.lon - lo + 540) % 360) - 180, 0, 1e-9); proche(r.h, 3, 1e-9);
  }
});
t('repère local orthonormé, est vers la longitude croissante', () => {
  const b = G.base(10, 45);
  proche(G.dot(b.haut, b.est), 0, 1e-12); proche(G.dot(b.haut, b.nord), 0, 1e-12); proche(G.dot(b.est, b.nord), 0, 1e-12);
  const p = G.vers(10.001, 45), q = G.vers(10, 45);
  assert.ok(G.dot(G.sub(p, q), b.est) > 0);
  const n = G.vers(10, 45.001); assert.ok(G.dot(G.sub(n, q), b.nord) > 0);
});
t('tuiles Web Mercator', () => {
  proche(G.lonDeX(0, 1), -180, 1e-12); proche(G.lonDeX(2, 1), 180, 1e-12);
  proche(G.latDeY(0, 0), G.LAT_MAX, 1e-9); proche(G.latDeY(1, 1), 0, 1e-9);
  const tu = G.tuileDe(1.4442, 43.6047, 10);          // Toulouse
  assert.deepEqual(tu, { z: 10, x: 516, y: 373 });
  const c = G.tuileCentre(tu.z, tu.x, tu.y); proche(c.lon, 1.4442, 0.2); proche(c.lat, 43.6047, 0.2);
  proche(G.yDeLat(G.latDeY(300, 9), 9), 300, 1e-6);
});
t('ancêtre : sous-rectangle', () => {
  const a = G.ancetre(16, 33000, 22000, 13);
  assert.equal(a.zs, 13); assert.equal(a.xs, 33000 >> 3); assert.equal(a.k, 1 / 8);
  proche(a.ox, (33000 & 7) / 8, 1e-12);
  assert.deepEqual(G.ancetre(5, 3, 4, 8), { zs: 5, xs: 3, ys: 4, ox: 0, oy: 0, k: 1 });
});
t('Soleil : équinoxe et solstice', () => {
  const e = soleilReel(new Date('2026-03-20T14:46:00Z')); proche(e.lat, 0, 0.3, 'décl. équinoxe');
  const s = soleilReel(new Date('2026-06-21T08:24:00Z')); proche(s.lat, 23.44, 0.1, 'décl. solstice');
  const n = soleilReel(new Date('2026-03-20T12:00:00Z')); assert.ok(Math.abs(n.lon) < 5, 'midi UTC : le soleil est près du méridien 0, lon=' + n.lon);
  const m = soleilReel(new Date('2026-03-20T18:00:00Z')); proche(m.lon, -90, 6, 'à 18 h UTC le soleil est à l’ouest');
  proche(G.norme(e.direction), 1, 1e-9);
});
t('sources : image du jour (nuages réels) à la place de Blue Marble', () => {
  const a = S.imagerie(4, 8, 5, { jour: '2026-10-16' }); assert.ok(a.url.includes('VIIRS_SNPP_CorrectedReflectance_TrueColor/default/2026-10-16/GoogleMapsCompatible_Level9/4/5/8.jpg'), a.url); assert.equal(a.source, 'viirs');
  assert.equal(S.imagerie(8, 100, 100, { jour: '2026-10-16' }).source, 'viirs'); assert.equal(S.imagerie(9, 200, 200, { jour: '2026-10-16' }).source, 'eox');
  assert.equal(S.imagerie(9, 200, 200, { jour: '2026-10-16', eox: false }).zSource, 9); assert.equal(S.imagerie(12, 2000, 2000, { jour: '2026-10-16', eox: false }).zSource, 9);
});
t('sources : adresses et niveaux', () => {
  const a = S.imagerie(3, 4, 2); assert.ok(a.url.includes('BlueMarble') && a.url.endsWith('/3/2/4.jpeg'), a.url);
  const b = S.imagerie(10, 515, 373); assert.ok(b.url.includes('eox') && b.url.endsWith('/10/373/515.jpg'), b.url);
  const c = S.imagerie(16, 33000, 22000); assert.equal(c.zSource, 14); assert.equal(c.rect[2], 1 / 4);
  const d = S.imagerie(10, 515, 373, { eox: false }); assert.equal(d.zSource, 8); assert.ok(d.url.includes('BlueMarble'));
  const r = S.relief(15, 20000, 10000); assert.equal(r.zSource, 12); assert.ok(r.url.startsWith('https://elevation-tiles-prod.s3.amazonaws.com/'));
  const v = S.vecteur('https://x/{z}/{x}/{y}.pbf', 16, 33000, 22000); assert.equal(v.zSource, 14); assert.equal(v.url, `https://x/14/${33000 >> 2}/${22000 >> 2}.pbf`);
  proche(S.hauteurTerrarium(128, 0, 0), 0, 1e-9); proche(S.hauteurTerrarium(129, 44, 128), 300.5, 1e-9);
});

const FOV = 50 * Math.PI / 180, ASPECT = 16 / 9, HAUTEUR = 1440;
const vue = (e, h = 0) => { const p = C.pose(e, h); return { p, cam: p.cam, avant: p.avant, droite: p.droite, haut: p.haut }; };
const choix = (e, o = {}) => { const { cam, avant, droite, haut } = vue(e); return selectionner({ cam, avant, droite, haut, fov: FOV, aspect: ASPECT, hauteurEcran: HAUTEUR, ...o }); };

t('caméra : pose, altitude, base orthonormée', () => {
  const p = C.pose(C.etatInitial({ lon: 2, lat: 48, dist: 5000, incl: 0.5, cap: 0.7 }));
  proche(G.dot(p.droite, p.haut), 0, 1e-9); proche(G.dot(p.droite, p.avant), 0, 1e-9); proche(G.dot(p.haut, p.avant), 0, 1e-9);
  proche(G.norme(p.avant), 1, 1e-12);
  const q = C.pose(C.etatInitial({ lon: 2, lat: 48, dist: 20 }));
  proche(q.altitude, 20, 1e-6); proche(G.dot(q.haut, G.base(2, 48).nord), 1, 1e-9, 'vue du dessus, cap 0 : le nord est en haut');
});
t('caméra : saisir le sol garde le point sous le pointeur', () => {
  let e = C.etatInitial({ lon: 5, lat: 40, dist: 3000 });
  const A = C.pointAuSol(C.pose(e), FOV, ASPECT, 0.3, -0.2);
  const e2 = C.saisir(e, A, FOV, ASPECT, -0.4, 0.3);
  const B = C.pointAuSol(C.pose(e2), FOV, ASPECT, -0.4, 0.3);
  assert.ok(G.norme(G.sub(A, B)) < 1e-6, 'écart ' + G.norme(G.sub(A, B)));
});
t('caméra : le zoom ancré garde le point sous le curseur', () => {
  const e = C.etatInitial({ lon: 5, lat: 40, dist: 2000, incl: 0.4, cap: 0.3 });
  const A = C.pointAuSol(C.pose(e), FOV, ASPECT, 0.5, 0.2);
  const z = C.zoomer(e, 0.5, FOV, ASPECT, 0.5, 0.2);
  assert.ok(z.dist < e.dist);
  const B = C.pointAuSol(C.pose(z), FOV, ASPECT, 0.5, 0.2);
  assert.ok(G.norme(G.sub(A, B)) < 1e-5, 'écart ' + G.norme(G.sub(A, B)));
  assert.equal(C.zoomer(e, 1e-9, FOV, ASPECT).dist, C.DIST_MIN);
});
t('caméra : l’inclinaison s’efface en orbite', () => {
  assert.equal(C.inclinaisonUtile({ incl: 1, dist: 30000 }), 0);
  proche(C.inclinaisonUtile({ incl: 1, dist: 100 }), 1, 1e-9);
});
t('caméra : vol de Paris à Tokyo (départ, arrivée, jamais sous le sol)', () => {
  const a = C.etatInitial({ lon: 2.35, lat: 48.85, dist: 5 }), b = C.etatInitial({ lon: 139.7, lat: 35.7, dist: 5 });
  const d = C.etatVol(a, b, 0), f = C.etatVol(a, b, 1);
  proche(d.lon, a.lon, 1e-6); proche(f.lon, b.lon, 1e-6); proche(f.lat, b.lat, 1e-6); proche(f.dist, 5, 1e-6);
  let max = 0;
  for (let i = 0; i <= 100; i++) { const e = C.etatVol(a, b, i / 100); assert.ok(e.dist >= C.DIST_MIN && e.dist <= C.DIST_MAX); max = Math.max(max, e.dist); }
  assert.ok(max > 2000, 'la caméra monte pendant un long trajet : ' + max);
  assert.ok(C.dureeVol(a, b) > 3 && C.dureeVol(a, b) <= 5.5);
});
t('tuiles : vue d’ensemble depuis l’orbite (peu de tuiles, niveaux bas)', () => {
  const f = choix(C.etatInitial({ lon: 2, lat: 45, dist: R4() }));
  assert.ok(f.length >= 4 && f.length <= 120, 'nombre ' + f.length);
  assert.ok(Math.max(...f.map(x => x.z)) <= 6, 'z max ' + Math.max(...f.map(x => x.z)));
});
function R4() { return G.R * 3.2; }
t('tuiles : vue rasante sur Toulouse (z élevé, quelques dizaines de tuiles)', () => {
  const f = choix(C.etatInitial({ lon: 1.4442, lat: 43.6047, dist: 3, incl: 1.2, cap: 0.5 }));
  const zmax = Math.max(...f.map(x => x.z));
  assert.ok(zmax >= 15, 'z max ' + zmax);
  assert.ok(f.length < 400, 'nombre ' + f.length);
  const proche = f[0]; const c = G.tuileCentre(proche.z, proche.x, proche.y);
  assert.ok(G.distanceKm(c.lon, c.lat, 1.4442, 43.6047) < 5, 'la tuile la plus proche est près de la cible');
});
t('tuiles : derrière l’horizon rien n’est choisi', () => {
  const f = choix(C.etatInitial({ lon: 2, lat: 45, dist: 400 }));
  for (const x of f) { const c = G.tuileCentre(x.z, x.x, x.y); assert.ok(G.distanceKm(c.lon, c.lat, 2, 45) < 8000); }
});
t('couper : ni trou ni recouvrement', () => {
  const f = choix(C.etatInitial({ lon: 1.4442, lat: 43.6047, dist: 50 }));
  const prets = new Set();
  const pret = (z, x, y) => prets.has(z + '/' + x + '/' + y);
  assert.deepEqual(couper(f, pret), [], 'rien de prêt : rien à montrer (la sphère de base couvre)');
  for (const n of aCharger(f)) prets.add(n.z + '/' + n.x + '/' + n.y);
  const tout = couper(f, pret);
  assert.ok(tout.length > 0);
  const surface = l => l.reduce((s, x) => s + 4 ** -x.z, 0);
  const chevauche = l => l.some((a, i) => l.some((b, j) => i !== j && a.z <= b.z && (b.x >> (b.z - a.z)) === a.x && (b.y >> (b.z - a.z)) === a.y));
  assert.ok(!chevauche(tout), 'recouvrement');
  // un parent reste affiché tant qu’un des quatre enfants n’est pas prêt
  const fine = f.find(x => x.z === Math.max(...f.map(y => y.z)));
  prets.delete(fine.z + '/' + fine.x + '/' + fine.y);
  const part = couper(f, pret);
  assert.ok(!chevauche(part), 'recouvrement après retrait');
  assert.ok(Math.abs(surface(part) - surface(tout)) < 1e-12, 'même surface couverte (le parent remplace l’enfant manquant)');
  assert.ok(!part.some(x => x.z === fine.z && x.x === fine.x && x.y === fine.y));
});
t('à charger : ancêtres d’abord', () => {
  const f = choix(C.etatInitial({ lon: 1.4442, lat: 43.6047, dist: 20 }));
  const l = aCharger(f);
  for (let i = 1; i < l.length; i++) assert.ok(l[i - 1].z <= l[i].z);
  assert.ok(l[0].z <= Math.min(...f.map(x => x.z)));
});
t('maille d’une tuile : taille, jupe, orientation vers l’extérieur', () => {
  const g = construireTuile(10, 516, 373, 16), m = 19;
  assert.equal(g.position.length, m * m * 3); assert.equal(g.index.length, (m - 1) * (m - 1) * 6);
  let max = 0; for (let i = 0; i < g.position.length; i += 3) max = Math.max(max, Math.hypot(g.position[i], g.position[i + 1], g.position[i + 2]));
  assert.ok(max < 40, 'positions relatives au centre : ' + max + ' km');   // une tuile z10 fait ≈ 28 km de large
  assert.equal(g.jupe.reduce((s, v) => s + v, 0), m * 4 - 4);
  for (let i = 0; i < g.index.length; i += 3) {
    const [a, b, c] = [g.index[i], g.index[i + 1], g.index[i + 2]].map(v => v * 3), P = g.position;
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], w = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const nn = G.cross(u, w); if (G.norme(nn) < 1e-12) continue;
    assert.ok(G.dot(nn, [g.rad[a], g.rad[a + 1], g.rad[a + 2]]) > 0, 'face tournée vers l’extérieur (triangle ' + i / 3 + ')');
  }
  const c = G.tuileCentre(10, 516, 373); assert.ok(G.norme(G.sub(g.centre, c.v)) < 1e-9);
});
console.log(ok + ' tests réussis' + (process.exitCode ? ', des échecs' : ''));
