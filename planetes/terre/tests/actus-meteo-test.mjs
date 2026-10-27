import assert from 'node:assert/strict';
import { dateRelative, modeleActus, phraseActus, urlSure } from '../pc/actus-contenu.js';
import * as M from '../pc/meteo-contenu.js';
import * as RADAR from '../pc/radar.js';
import { projeter } from '../pc/projection.js';
import * as C from '../pc/camera-orbite.js';

let ok = 0;
const t = (nom, f) => { try { f(); ok++; console.log('OK  ' + nom); } catch (e) { console.log('KO  ' + nom + ' — ' + e.message); process.exitCode = 1; } };
const NOW = Date.parse('2026-10-17T12:00:00Z');

t('dates relatives en français, date inconnue ou future → vide', () => {
  assert.equal(dateRelative('2026-10-17T11:59:40Z', NOW), 'à l’instant');
  assert.equal(dateRelative('2026-10-17T11:48:00Z', NOW), 'il y a 12 min');
  assert.equal(dateRelative('2026-10-17T09:00:00Z', NOW), 'il y a 3 h');
  assert.equal(dateRelative('2026-10-16T09:00:00Z', NOW), 'hier');
  assert.equal(dateRelative('2026-10-14T09:00:00Z', NOW), 'il y a 3 j');
  assert.ok(/^le 1 oct/.test(dateRelative('2026-10-01T09:00:00Z', NOW)));
  assert.equal(dateRelative(null, NOW), ''); assert.equal(dateRelative('n’importe quoi', NOW), ''); assert.equal(dateRelative('2026-10-18T12:00:00Z', NOW), '');
});
t('adresses : seules http et https', () => {
  assert.equal(urlSure('https://a.fr/x?y=1'), 'https://a.fr/x?y=1'); assert.equal(urlSure('javascript:alert(1)'), null); assert.equal(urlSure('data:text/html,x'), null); assert.equal(urlSure('pas une url'), null);
});
const REP = { pays: { code: 'FR', nom: 'France' }, titres: [
  { titre: 'Premier titre', url: 'https://a.fr/1', source: 'Le Monde', date: '2026-10-17T11:00:00Z', langue: 'fr' },
  { titre: 'Lien piégé', url: 'javascript:alert(1)', source: 'X', date: null },
  { titre: '  ', url: 'https://a.fr/2', source: 'Y' },
  { titre: 'EN DIRECT – Deuxième titre', url: 'https://b.fr/2', source: 'franceinfo', date: null }
], sources: [{ nom: 'Le Monde', ok: true }, { nom: 'Libération', ok: false, erreur: 'HTTP 503' }, { nom: 'franceinfo', ok: true }], gdelt: { ok: true } };
t('modèle des actualités : liens sûrs, médias ok et en panne, note', () => {
  const m = modeleActus(REP, NOW);
  assert.equal(m.lignes.length, 2); assert.equal(m.lignes[0].quand, 'il y a 1 h'); assert.equal(m.lignes[1].quand, '');
  assert.deepEqual(m.indisponibles, ['Libération']); assert.ok(m.sources.includes('Le Monde') && m.sources.includes('franceinfo'));
  assert.equal(m.titre, 'Actualités · France'); assert.ok(/GDELT/.test(m.note));
  assert.equal(modeleActus({ pays: { nom: 'Monde' }, titres: [], sources: [] }).titre, 'À la une dans le monde');
  assert.ok(/copie/i.test(modeleActus({ ...REP, perime: true }, NOW).note));
});
t('phrase parlée : uniquement les titres reçus, avec leur média', () => {
  const m = modeleActus(REP, NOW), p = phraseActus(m, 2);
  assert.ok(p.includes('Le Monde titre : Premier titre.') && p.includes('franceinfo titre : Deuxième titre.') && !p.includes('EN DIRECT'), p);
  assert.ok(/aucun titre/.test(phraseActus(modeleActus({ pays: { nom: 'Japon' }, titres: [], sources: [] }))));
});
t('météo : codes WMO en français', () => {
  assert.equal(M.decrire(0), 'Ciel dégagé'); assert.equal(M.decrire(63), 'Pluie'); assert.equal(M.decrire(95), 'Orage'); assert.equal(M.decrire(1234), null); assert.equal(M.decrire(null), null);
  assert.equal(M.icone(3), 'nuage'); assert.equal(M.icone(75), 'neige'); assert.equal(M.icone(999), 'inconnu');
});
t('météo : direction du vent (d’où il vient), formats', () => {
  assert.equal(M.directionVent(0), 'nord'); assert.equal(M.directionVent(288), 'ouest-nord-ouest'); assert.equal(M.directionVent(359), 'nord'); assert.equal(M.directionVent(null), null);
  assert.equal(M.directionCourte(90), 'E'); assert.equal(M.directionCourte(225), 'SO');
  assert.equal(M.nombre(17.94, 0, '°'), '18°'); assert.equal(M.nombre(1021.7, 1, ' hPa'), '1021,7 hPa'); assert.equal(M.nombre(null), 'indisponible'); assert.equal(M.nombre(NaN), 'indisponible');
  assert.equal(M.heure('2026-10-17T14:00'), '14 h'); assert.equal(M.heure('2026-10-17T14:30'), '14 h 30');
});
t('météo : intensité de pluie pour l’animation', () => {
  assert.equal(M.intensitePluie(0), 0); assert.equal(M.intensitePluie(null), 0); assert.ok(M.intensitePluie(0.2) > 0 && M.intensitePluie(0.2) < 0.35);
  assert.ok(M.intensitePluie(2) > M.intensitePluie(0.2)); assert.equal(M.intensitePluie(50), 1);
});
const HEURES = Array.from({ length: 24 }, (_, i) => ({ h: `2026-10-17T${String(i).padStart(2, '0')}:00`, temp: 15 + Math.sin(i / 4) * 4, pluie: i === 5 ? 3 : 0, code: 3 }));
t('météo : tracé des 24 h (courbe, barres de pluie)', () => {
  const g = M.tracerHeures(HEURES);
  assert.ok(g.chemin.startsWith('M') && g.chemin.split('L').length === 24); assert.equal(g.barres.length, 24);
  assert.ok(g.barres[5].h > g.barres[4].h && g.barres[4].h === 0); assert.ok(g.tmax > g.tmin);
  assert.equal(M.tracerHeures([{ temp: 1 }]), null); assert.equal(M.tracerHeures(null), null);
  const trou = HEURES.map((h, i) => (i === 3 ? { ...h, temp: null } : h)); assert.ok(!M.tracerHeures(trou).chemin.includes('NaN'));
});
t('météo : phrase parlée uniquement avec les valeurs reçues', () => {
  const m = { modele: 'Météo-France (AROME)', actuel: { temp: 17.9, code: 3, vent: 11.4, direction: 288 }, jours: [{ tmin: 11, tmax: 21 }], heures: [{ pluie: 0 }, { pluie: 0.2 }] };
  const p = M.phraseMeteo(m, 'Castres');
  assert.ok(/Castres/.test(p) && /18 degrés/.test(p) && /couvert/.test(p) && /ouest-nord-ouest/.test(p) && /entre 11 et 21/.test(p) && /0,2 millimètre/.test(p) && /Météo-France/.test(p), p);
  assert.ok(/indisponible/.test(M.phraseMeteo({ actuel: { temp: null } })) && /indisponible/.test(M.phraseMeteo(null)));
  assert.ok(!/vent/i.test(M.phraseMeteo({ actuel: { temp: 10, code: 0, vent: null }, jours: [], heures: [] })), 'pas de vent inventé');
});
const IDX = { version: '2.0', generated: 1792229434, host: 'https://tilecache.rainviewer.com', radar: { past: [{ time: 1792228800, path: '/v2/radar/e496aa7e8b26' }, { time: 1792222200, path: '/v2/radar/a7c2eacfc096' }, { time: 1, path: 'mauvais' }, { time: 1792229400, path: '/v2/radar/0af40ec43b09' }], nowcast: [] } };
t('radar : index lu, trié, chemins douteux écartés', () => {
  const i = RADAR.lireIndex(IDX);
  assert.equal(i.images.length, 3); assert.ok(i.images[0].temps < i.images[2].temps); assert.equal(i.hote, 'https://tilecache.rainviewer.com');
  assert.equal(RADAR.lireIndex(null), null); assert.equal(RADAR.lireIndex({ host: 'http://x', radar: { past: [] } }), null); assert.equal(RADAR.lireIndex({ ...IDX, host: 'javascript:1' }), null);
});
t('radar : tuile et sous-rectangle au-delà du zoom 7', () => {
  const i = RADAR.lireIndex(IDX);
  const a = RADAR.tuileRadar(i, 2, 5, 16, 11); assert.equal(a.url, 'https://tilecache.rainviewer.com/v2/radar/0af40ec43b09/256/5/16/11/2/1_1.png'); assert.deepEqual(a.rect, [0, 0, 1]);
  const b = RADAR.tuileRadar(i, 99, 10, 515, 373); assert.ok(b.url.includes('/256/7/64/46/') && b.rect[2] === 1 / 8, b.url);   // rang borné, z7 étiré
  assert.equal(RADAR.tuileRadar(i, -5, 3, 0, 0).temps, i.images[0].temps);
});
t('projection : le centre de la vue tombe au centre de l’écran, l’autre face du globe est cachée', () => {
  const e = C.etatInitial({ lon: 10, lat: 40, dist: 3000 }), p = C.pose(e), fov = 50 * Math.PI / 180;
  const c = projeter(p, fov, 1600, 900, 10, 40, 0); assert.ok(Math.abs(c.x - 800) < 1 && Math.abs(c.y - 450) < 1, JSON.stringify(c));
  assert.equal(projeter(p, fov, 1600, 900, -170, -40, 0), null);
  const nord = projeter(p, fov, 1600, 900, 10, 45, 0); assert.ok(nord.y < 450, 'le nord est en haut');
  const est = projeter(p, fov, 1600, 900, 15, 40, 0); assert.ok(est.x > 800, 'l’est est à droite');
});
console.log(ok + ' tests réussis');
