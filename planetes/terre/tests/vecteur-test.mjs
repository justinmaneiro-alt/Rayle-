import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { PbfReader } from '../vendor/pbf.js';
import { VectorTile } from '../vendor/vector-tile.js';
import { dessiner, lieux, batiments } from '../pc/rastre-vecteur.js';
import * as S from '../pc/style-vecteur.js';
import { ancetre, norme } from '../pc/geo.js';

let ok = 0;
const t = (nom, f) => { try { f(); ok++; console.log('OK  ' + nom); } catch (e) { console.log('KO  ' + nom + ' — ' + e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };
const charger = nom => {
  let b = fs.readFileSync(fileURLToPath(new URL('./fixtures/' + nom, import.meta.url)));
  while (b[0] === 0x1f && b[1] === 0x8b) b = zlib.gunzipSync(b);
  return new VectorTile(new PbfReader(b));
};
const paris = charger('paris-z14-8299-5636.pbf.gz'), europe = charger('europe-z5-16-11.pbf.gz');

/* Contexte 2D factice : compte les appels. */
const faux = () => { const n = {}; const c = new Proxy({}, { get: (o, k) => k in o ? o[k] : (...a) => { n[k] = (n[k] || 0) + 1; }, set: (o, k, v) => { o[k] = v; return true; } }); return { c, n }; };

t('style : frontières par niveau', () => {
  assert.ok(S.traitFrontiere({ admin_level: 2 }, 2).largeur > 0);
  assert.equal(S.traitFrontiere({ admin_level: 6 }, 5), null);
  assert.ok(S.traitFrontiere({ admin_level: 6 }, 9));
  assert.ok(S.traitFrontiere({ admin_level: 2, disputed: 1 }, 5).tirets);
  assert.equal(S.traitFrontiere({ admin_level: 4, maritime: 1 }, 2), null);
});
t('style : routes selon le zoom', () => {
  assert.equal(S.traitRoute({ class: 'motorway' }, 6), null); assert.ok(S.traitRoute({ class: 'motorway' }, 7));
  assert.equal(S.traitRoute({ class: 'minor' }, 8), null);
  assert.ok(S.traitRoute({ class: 'minor' }, 14).largeur > S.traitRoute({ class: 'minor' }, 13).largeur);
  assert.ok(S.traitRoute({ class: 'minor' }, 16, 1.2).largeur >= 7 / 1.2 - 1e-9, 'à fort zoom : largeur réelle (7 m)'); assert.ok(S.traitRoute({ class: 'primary' }, 16, 1.2).lisere);
  assert.equal(S.traitRoute({ class: 'ferry' }, 14), null);
});
t('style : lieux et importance', () => {
  assert.equal(S.classeLieu('place', { class: 'city' }), 'city');
  assert.equal(S.classeLieu('place', { class: 'unknown_class' }), null);
  assert.equal(S.classeLieu('water_name', { class: 'lake' }), null);
  assert.equal(S.nomLieu({ name: 'Wien', 'name:fr': 'Vienne' }), 'Vienne');
  assert.ok(S.importance('city', { rank: 1, capital: 2 }) < S.importance('city', { rank: 5 }));
  assert.ok(S.importance('city', { rank: 20 }) < S.importance('town', { rank: 1 }));
});
t('dessin : un zoom 5 trace des frontières, pas de routes locales', () => {
  const { c, n } = faux();
  dessiner(c, europe, { zAff: 5, taille: 256, rect: [0, 0, 1] });
  assert.ok(n.stroke >= 1 && n.lineTo > 50, JSON.stringify(n));
});
t('dessin : un zoom 14 sur Paris trace des routes', () => {
  const { c, n } = faux();
  dessiner(c, paris, { zAff: 14, taille: 512, rect: [0, 0, 1] });
  assert.ok(n.lineTo > 2000, JSON.stringify(n));
});
t('lieux : l’Europe au zoom 5 contient Paris ou Londres, sans doublons de marge', () => {
  const l = lieux(europe, { z: 5, x: 16, y: 11, zs: 5, xs: 16, ys: 11, rect: [0, 0, 1] });
  assert.ok(l.length > 20);
  const noms = new Set(l.map(x => x.n));
  assert.ok(noms.has('Paris') || noms.has('Londres'), 'quelques noms : ' + [...noms].slice(0, 8));
  assert.equal(new Set(l.map(x => x.n + x.c)).size, l.length, 'pas de doublon');
  const g = l.find(x => x.c === 'country'); assert.ok(g, 'un pays'); assert.ok(g.lat > -90 && g.lat < 90);
});
t('lieux : un sous-rectangle ne garde que ses lieux', () => {
  const tous = lieux(paris, { z: 14, x: 8299, y: 5636, zs: 14, xs: 8299, ys: 5636, rect: [0, 0, 1] });
  const a = ancetre(16, 8299 * 4 + 1, 5636 * 4 + 2, 14);
  const part = lieux(paris, { z: 16, x: 8299 * 4 + 1, y: 5636 * 4 + 2, zs: 14, xs: 8299, ys: 5636, rect: [a.ox, a.oy, a.k] });
  assert.ok(part.length <= tous.length);
});
t('bâtiments : Paris au zoom 15 donne des volumes valides', () => {
  const b = batiments(paris, { z: 14, x: 8299, y: 5636, zs: 14, xs: 8299, ys: 5636, rect: [0, 0, 1] });
  assert.ok(b && b.n > 200, 'bâtiments ' + (b && b.n));
  const nv = b.pos.length / 3;
  assert.equal(b.rad.length, b.pos.length); assert.equal(b.nrm.length, b.pos.length); assert.equal(b.h.length, nv); assert.equal(b.uvc.length, nv * 2);
  assert.equal(b.idx.length % 3, 0);
  let max = 0; for (const i of b.idx) max = Math.max(max, i); assert.ok(max < nv, 'indices valides');
  let loin = 0; for (let i = 0; i < nv; i++) loin = Math.max(loin, Math.hypot(b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]));
  assert.ok(loin < 3, 'positions relatives au centre de la tuile (km) : ' + loin);   // une tuile z14 fait 2,5 km de large
  let hmax = 0; for (let i = 0; i < nv; i++) hmax = Math.max(hmax, b.h[i]); assert.ok(hmax > 0.01 && hmax < 0.6, 'hauteur max en km : ' + hmax);
  for (let i = 0; i < nv; i++) { const l = Math.hypot(b.nrm[i * 3], b.nrm[i * 3 + 1], b.nrm[i * 3 + 2]); assert.ok(Math.abs(l - 1) < 1e-3, 'normale unitaire à ' + i + ' : ' + l); if (i > 2000) break; }
  assert.ok(b.n <= 3500);
});
t('bâtiments : sous-rectangle (zoom 16) plus petit que la tuile entière', () => {
  const tout = batiments(paris, { z: 14, x: 8299, y: 5636, zs: 14, xs: 8299, ys: 5636, rect: [0, 0, 1] });
  const a = ancetre(16, 8299 * 4 + 1, 5636 * 4 + 1, 14);
  const part = batiments(paris, { z: 16, x: 8299 * 4 + 1, y: 5636 * 4 + 1, zs: 14, xs: 8299, ys: 5636, rect: [a.ox, a.oy, a.k] });
  assert.ok(part && part.n < tout.n / 4, `${part && part.n} < ${tout.n}`);
});
console.log(ok + ' tests réussis');
