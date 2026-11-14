import assert from 'node:assert/strict';
import * as T from '../mobile/terre-calcul.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const proche = (a, b, e, m) => ok(Math.abs(a - b) <= e, m + ' : ' + a + ' ≠ ' + b);
// Soleil : équinoxe de mars 2026 (20 mars 14:46 UTC) → déclinaison ≈ 0 ; solstice de juin (21 juin 08:24 UTC) → ≈ +23,4° ; décembre → ≈ -23,4°
proche(T.pointSousSoleil(Date.UTC(2026, 2, 20, 14, 46)).lat, 0, 0.6, 'équinoxe'); proche(T.pointSousSoleil(Date.UTC(2026, 5, 21, 8, 24)).lat, 23.43, 0.4, 'solstice juin'); proche(T.pointSousSoleil(Date.UTC(2026, 11, 21, 15, 50)).lat, -23.43, 0.4, 'solstice décembre');
// longitude sous le Soleil : à midi UTC, proche de 0° (équation du temps ≤ 4° en longitude) ; à 18:00 UTC ≈ -90°
proche(T.pointSousSoleil(Date.UTC(2026, 3, 15, 12, 0)).lon, 0, 5, 'midi UTC → longitude ≈ 0'); proche(T.pointSousSoleil(Date.UTC(2026, 3, 15, 18, 0)).lon, -90, 5, '18 h UTC → -90');
// vecteurs
const v = T.versVecteur(0, 0); proche(v.x, 1, 1e-9, 'lat0 lon0 → +X'); const e = T.versVecteur(0, 90); proche(e.z, -1, 1e-9, 'est → -Z'); const nord = T.versVecteur(90, 0); proche(nord.y, 1, 1e-9, 'nord → +Y');
for (const [la, lo] of [[48.85, 2.35], [-33.9, 151.2], [35.7, 139.7], [-54, -68]]) { const r = T.depuisVecteur(T.versVecteur(la, lo)); proche(r.lat, la, 1e-9, 'aller-retour lat'); proche(r.lon, lo, 1e-9, 'aller-retour lon'); }
// rayon / sphère
const pt = T.toucherSphere({ x: 5, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }); proche(pt.x, 1, 1e-9, 'touche la sphère'); ok(T.toucherSphere({ x: 5, y: 3, z: 0 }, { x: -1, y: 0, z: 0 }) === null, 'rayon qui rate'); ok(T.toucherSphere({ x: 5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }) === null, 'sphère derrière');
proche(T.distanceAngulaire({ lat: 0, lon: 0 }, { lat: 0, lon: 90 }), 90, 1e-9, 'distance 90°'); proche(T.distanceAngulaire({ lat: 10, lon: 20 }, { lat: 10, lon: 20 }), 0, 1e-6, 'distance 0');
// résolution
ok(T.choisirResolution({ maxTexture: 2048, memoireGo: 8 }).haute === null, 'GPU limité : pas de 4k'); ok(T.choisirResolution({ maxTexture: 16384, memoireGo: 8 }).haute === '4k', 'GPU large : 4k'); ok(T.choisirResolution({ maxTexture: 16384, memoireGo: 1 }).haute === null, 'peu de mémoire : pas de 4k');
ok(T.choisirResolution({ qualite: 'economie' }).haute === null && T.choisirResolution({ qualite: 'economie' }).nuages === false, 'économie'); ok(T.choisirResolution({ qualite: 'elevee', maxTexture: 8192, memoireGo: 2 }).haute === '4k', 'élevée force la 4k si le GPU la porte');
// séismes
const L = T.lireSeismes({ features: [{ id: 'a', geometry: { coordinates: [10, 20, 5] }, properties: { mag: 4.5, place: 'X', time: 1, url: 'https://earthquake.usgs.gov/e/a' } }, { id: 'b', geometry: { coordinates: [1, 2, 3] }, properties: { mag: 6.1, url: 'http://mauvais.example/' } }, { id: 'c', geometry: { coordinates: ['x', 2] }, properties: { mag: 3 } }, { id: 'd', geometry: { coordinates: [1, 2] }, properties: {} }] });
ok(L.length === 2 && L[0].id === 'b' && L[0].lien === null && L[1].lien, 'séismes triés, lien non USGS écarté, champs absents ignorés'); ok(T.lireSeismes(null).length === 0, 'séismes vides'); ok(T.couleurSeisme(6.2) !== T.couleurSeisme(3), 'couleur');
// progression, inertie, limites, météo
proche(T.progression({ a: { total: 100, charge: 50 }, b: { total: 100, charge: 100 } }), 0.75, 1e-9, 'progression'); ok(T.progression({}) === 0, 'progression vide');
ok(T.amortir(1, 1) < 0.05 && T.amortir(0.001, 0.1) === 0, 'inertie'); ok(T.limiterLat(120) === 85 && T.limiterDistance(0) === 1.35 && T.limiterDistance(99) === 9, 'limites');
ok(T.texteMeteo(0) === 'ciel dégagé' && T.texteMeteo(12345) === 'conditions inconnues', 'météo');
console.log('terre mobile (calcul) : ' + n + ' vérifications OK');
