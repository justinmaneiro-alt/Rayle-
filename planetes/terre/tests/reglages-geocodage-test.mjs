import assert from 'node:assert/strict';
import * as REG from '../pc/reglages-terre.js';
import { chercher, distanceVol, libelle, nettoyer } from '../pc/geocodage.js';
import { formaterDistance, formaterCoord } from '../pc/interface-terre.js';

let ok = 0;
const t = async (nom, f) => { try { await f(); ok++; console.log('OK  ' + nom); } catch (e) { console.log('KO  ' + nom + ' — ' + e.message); process.exitCode = 1; } };

await t('réglages : valeurs par défaut et bornes', () => {
  const d = REG.normaliser(null);
  assert.deepEqual(d, { exag: 2, eox: true, batiments: true, noms: true, nuages: true, ocean: true, radar: false, nuagesReels: false, meteoAnim: true, fps: false, regional: true, ombres: true, profil: 'auto' });
  assert.equal(REG.normaliser({ exag: 99 }).exag, 10); assert.equal(REG.normaliser({ exag: -3 }).exag, 1); assert.equal(REG.normaliser({ exag: 'abc' }).exag, 2);
  assert.equal(REG.normaliser({ profil: 'turbo' }).profil, 'auto'); assert.equal(REG.normaliser({ eox: 'oui' }).eox, true); assert.equal(REG.normaliser({ eox: false }).eox, false);
});
await t('réglages : profil effectif (jeu > choix > galaxie)', () => {
  const r = REG.normaliser({});
  assert.equal(REG.profilEffectif(r, { niveauGalaxie: 'moyenne' }), 'moyenne');
  assert.equal(REG.profilEffectif({ ...r, profil: 'haute' }, { niveauGalaxie: 'basse' }), 'haute');
  assert.equal(REG.profilEffectif({ ...r, profil: 'haute' }, { niveauGalaxie: 'haute', jeu: true }), 'basse');
  assert.equal(REG.profilEffectif(r, { niveauGalaxie: 'inconnu' }), 'haute');
});
await t('géocodage : distances de vol selon le type de lieu', () => {
  assert.ok(distanceVol('PCLI') > distanceVol('ADM1') && distanceVol('ADM1') > distanceVol('ADM2') && distanceVol('ADM2') > distanceVol('PPLC'));
  assert.ok(distanceVol('PPLC') > distanceVol('PPL')); assert.ok(distanceVol(undefined) > 0);
});
await t('géocodage : recherche avec un faux serveur', async () => {
  const vues = [];
  const faux = async (u, o) => { vues.push(u); return { ok: true, json: async () => ({ results: [{ name: 'Castres', latitude: 43.6, longitude: 2.24, feature_code: 'PPLA2', country: 'France', admin1: 'Occitanie', population: 41000, elevation: 170 }, { name: 'sans coordonnées' }] }) }; };
  const r = await chercher('Castres', { fetchFn: faux });
  assert.equal(r.length, 1); assert.equal(r[0].nom, 'Castres'); assert.equal(r[0].distance, 18); assert.equal(libelle(r[0]), 'Castres, Occitanie, France');
  assert.ok(/name=Castres/.test(vues[0]) && /language=fr/.test(vues[0]));
  assert.ok(!/key|token|appid/i.test(vues[0]), 'aucune clé dans la requête');
  assert.deepEqual(await chercher('a', { fetchFn: faux }), []);                     // trop court : pas de requête
  assert.equal(vues.length, 1);
});
await t('géocodage : source en panne → erreur explicite', async () => {
  await assert.rejects(() => chercher('Paris', { fetchFn: async () => ({ ok: false, status: 503 }) }), /indisponible/);
});
await t('interface : formats d’altitude et de coordonnées', () => {
  assert.equal(formaterDistance(0.35), '350 m'); assert.equal(formaterDistance(2.5), '2,5 km'); assert.ok(/^12\s?345 km$/.test(formaterDistance(12345).replace(/ | /g, ' ')));
  assert.equal(formaterCoord(43.6047, 'N', 'S'), '43,605° N'); assert.equal(formaterCoord(-1.4442, 'E', 'O'), '1,444° O');
});
console.log(ok + ' tests réussis');
