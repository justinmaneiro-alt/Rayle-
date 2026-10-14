// Système solaire de l'Univers : positions héliocentriques (cohérentes avec ui/astro.js), fiches des astres, présentations variées, TLE :   node tests/univers-systeme-test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { ASTRES, ORDRE_PLANETES, LUNES, positionHelio, pointsOrbite, comparaisons, UA_KM } from '../js/univers/donnees/planetes.js';
import { composerAstre, oublier } from '../js/univers/donnees/presentation.js';
import { trouverAstre } from '../js/univers/espace/vue-systeme.js';
import { parserTLE } from '../js/univers/espace/satellites.js';

const ctx = {}; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../ui/astro.js', import.meta.url), 'utf8'), ctx);
const A = ctx.RayleUI.astro;
let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };
const graine = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let x = Math.imul(s ^ s >>> 15, 1 | s); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };

t('positions héliocentriques : la distance Terre–planète égale celle d’ui/astro.js (géocentrique), à 0,2 % près, sur 6 dates', () => {
  for (const ts of [Date.UTC(2000, 0, 1), Date.UTC(2010, 5, 15), Date.UTC(2020, 11, 21), Date.UTC(2026, 9, 14), Date.UTC(2030, 2, 3), Date.UTC(2040, 7, 8)]) {
    const T = positionHelio('terre', ts);
    for (const id of ORDRE_PLANETES) {
      if (id === 'terre') continue; const P = positionHelio(id, ts), g = A.planete(id, ts), d = Math.hypot(P.x - T.x, P.y - T.y, P.z - T.z);
      assert.ok(Math.abs(d - g.dist) / g.dist < .002, `${id} ${new Date(ts).toISOString().slice(0, 10)} : ${d.toFixed(4)} UA contre ${g.dist.toFixed(4)}`);
    }
  }
});
t('la Terre est du côté opposé au Soleil vu de la Terre (longitude héliocentrique ≈ 21° le 14 octobre 2026)', () => {
  const p = positionHelio('terre', Date.UTC(2026, 9, 14)); const lon = ((Math.atan2(p.y, p.x) * 180 / Math.PI) + 360) % 360; assert.ok(Math.abs(lon - 21) < 1.2, String(lon));
  assert.ok(p.r > .983 && p.r < 1.017);
});
t('distances au Soleil : chaque planète reste entre périhélie et aphélie', () => {
  const lim = { mercure: [.307, .467], venus: [.718, .728], terre: [.983, 1.017], mars: [1.38, 1.67], jupiter: [4.95, 5.46], saturne: [9.0, 10.1], uranus: [18.3, 20.1], neptune: [29.8, 30.4] };
  for (const [id, [a, b]] of Object.entries(lim)) for (let k = 0; k < 40; k++) { const r = positionHelio(id, Date.UTC(2026, 0, 1) + k * 5e9).r; assert.ok(r >= a - .02 && r <= b + .02, id + ' ' + r); }
});
t('orbites tracées : 256 points sur l’ellipse, fermée, aux bonnes distances', () => {
  const o = pointsOrbite('mars', Date.UTC(2026, 9, 14), 256); assert.equal(o.length, 256);
  const r = o.map(p => Math.hypot(p.x, p.y, p.z)); assert.ok(Math.min(...r) > 1.37 && Math.max(...r) < 1.68);
  const e = pointsOrbite('terre', Date.UTC(2026, 9, 14), 64), P = positionHelio('terre', Date.UTC(2026, 9, 14)); assert.ok(e.some(p => Math.hypot(p.x - P.x, p.y - P.y, p.z - P.z) < .15), 'la Terre est sur son orbite');
});
t('fiches : 9 corps + Lune + Cérès + Vesta + ceinture + ISS, chiffres cohérents', () => {
  for (const id of ['soleil', ...ORDRE_PLANETES, 'lune', 'ceres', 'vesta', 'asteroides', 'iss']) {
    const a = ASTRES[id]; assert.ok(a, id); assert.ok(a.nom && a.art, id);
    for (const k of ['composition', 'missions', 'records', 'anecdotes']) assert.ok(Array.isArray(a[k]) && a[k].length >= 1, id + ' ' + k);
    for (const k of ['composition', 'atmosphere', 'missions', 'records', 'anecdotes']) for (const x of a[k]) assert.ok(x.length > 25 && /[.!?]$/.test(x), id + ' ' + k + ' : ' + x.slice(0, 40));
  }
  for (const id of ORDRE_PLANETES) { const a = ASTRES[id]; assert.ok(a.rayonKm > 2000 && a.a > .3 && a.periodeJ > 80 && a.masse > .05 && a.g > 3, id); assert.ok(a.composition.length + a.atmosphere.length + a.missions.length + a.records.length + a.anecdotes.length >= 10, id + ' : assez de faits'); }
  assert.equal(ASTRES.jupiter.lunes, 95); assert.ok(Math.abs(ASTRES.mars.rayonKm / 6371 - .532) < .01); assert.ok(ASTRES.neptune.a > 30 && ASTRES.neptune.a < 30.2);
});
t('lunes principales : Terre 1, Mars 2, Jupiter 4 (galiléennes), Saturne 7, Uranus 5, Neptune ≥ 1', () => {
  assert.equal(LUNES.terre.length, 1); assert.equal(LUNES.mars.length, 2); assert.deepEqual(LUNES.jupiter.map(l => l.nom), ['Io', 'Europe', 'Ganymède', 'Callisto']); assert.equal(LUNES.saturne.length, 7); assert.equal(LUNES.uranus.length, 5); assert.ok(LUNES.neptune.some(l => l.nom === 'Triton' && l.periodeJ < 0), 'Triton est rétrograde');
  assert.ok(LUNES.jupiter.every((l, i, a) => !i || l.distRp > a[i - 1].distRp), 'ordre des distances');
});
t('comparaisons avec la Terre : calculées, sans « undefined »', () => {
  const c = comparaisons('mars'); assert.ok(c.length >= 5); assert.ok(c.some(x => /53 pour cent/.test(x)) && c.some(x => /0,38 fois/.test(x)), c.join(' | '));
  assert.ok(comparaisons('jupiter').some(x => /11 fois/.test(x))); assert.deepEqual(comparaisons('terre'), []); for (const id of ORDRE_PLANETES) for (const x of comparaisons(id)) assert.ok(!/undefined|NaN|Infinity/.test(x), id + ' : ' + x);
});
t('présentation d’un astre : introduction, 3 angles, conclusion ; 30 versions différentes', () => {
  oublier(); const vus = new Set(), angles = new Set();
  for (let i = 0; i < 30; i++) { const c = composerAstre(ASTRES.saturne, { rnd: graine(i * 31 + 5) }); assert.equal(c.segments[0].angle, 'intro'); assert.equal(c.segments.at(-1).angle, 'fin'); assert.equal(c.segments.length, 5); c.segments.forEach(s => { assert.ok(!/undefined|NaN/.test(s.texte)); angles.add(s.angle); }); vus.add(c.segments.map(s => s.texte).join(' ')); }
  assert.ok(vus.size >= 28, 'versions : ' + vus.size); for (const a of ['composition', 'atmosphere', 'missions', 'records', 'anecdotes', 'comparaisons']) assert.ok(angles.has(a), 'angle jamais tiré : ' + a);
});
t('présentation : Raylé varie aussi pour l’ISS et la ceinture (pas d’angle « atmosphère » sans données)', () => {
  const c = composerAstre(ASTRES.iss, { rnd: graine(9), angles: 5 }); assert.ok(!c.segments.some(s => s.angle === 'atmosphere')); const d = composerAstre(ASTRES.asteroides, { rnd: graine(4) }); assert.ok(d.segments.length >= 4);
});
t('trouverAstre : noms usuels, accents, articles', () => {
  const r = { 'Mars': 'mars', 'la Terre': 'terre', 'Vénus': 'venus', 'le Soleil': 'soleil', 'Jupiter': 'jupiter', 'Saturne': 'saturne', 'les astéroïdes': 'asteroides', 'la ceinture d’astéroïdes': 'asteroides', 'Cérès': 'ceres', 'planète Mars': 'mars' };
  for (const [k, v] of Object.entries(r)) assert.equal(trouverAstre(k), v, k); assert.equal(trouverAstre('Paris'), null); assert.equal(trouverAstre('la France'), null);
});
t('TLE : lecture de CelesTrak (3 lignes par objet)', () => {
  const x = 'ISS (ZARYA)             \n1 25544U 98067A   26286.82178372  .00006592  00000+0  12831-3 0  9991\n2 25544  51.6325  73.0089 0006710 259.3258 100.6975 15.48855783590140\nHST                     \n1 20580U 90037B   26287.10600204  .00003600  00000+0  14000-3 0  9998\n2 20580  28.4700 213.0000 0002500 120.0000 240.0000 15.09000000000009\nligne parasite\n';
  const r = parserTLE(x); assert.equal(r.length, 2); assert.equal(r[0].nom, 'ISS (ZARYA)'); assert.equal(r[1].nom, 'HST'); assert.equal(r[0].l1[0], '1'); assert.deepEqual(parserTLE(''), []);
});
t('UA : 1 UA = 149 597 870,7 km', () => { assert.equal(UA_KM, 149597870.7); });
console.log(ok + ' tests réussis');
