// Base de connaissances « Espace » (ui/espace-savoir.js) : sources, texte parlé sans symboles, réponses (action, explication, comparaison), honnêteté.   node tests/espace-savoir-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ctx = { console, Math, Date }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../ui/espace-savoir.js', import.meta.url), 'utf8'), ctx);
const S = ctx.RayleUI.savoir;
const R = (q, o) => S.repondre(q, Object.assign({ alea: () => 0 }, o));
let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

t('couverture : Soleil, Lune, 8 planètes, lunes majeures, ceinture, comètes, trou noir, ISS, Hubble, Webb, Curiosity, Perseverance, grandes missions', () => {
  for (const id of ['soleil', 'lune', 'mercure', 'venus', 'terre', 'mars', 'jupiter', 'saturne', 'uranus', 'neptune', 'io', 'europe', 'ganymede', 'callisto', 'titan', 'encelade', 'triton', 'phobos', 'deimos', 'charon',
    'ceinture', 'halley', 'tchouri', 'trounoir', 'iss', 'hubble', 'webb', 'curiosity', 'perseverance', 'voyager1', 'voyager2', 'apollo11', 'cassini', 'newhorizons', 'rosetta']) assert.ok(S.fiche(id), id);
  for (const id of ['mercure', 'venus', 'terre', 'mars', 'jupiter', 'saturne', 'uranus', 'neptune'])
    for (const k of ['diametre', 'masse', 'distance', 'jour', 'annee', 'gravite', 'atmosphere', 'temperature', 'lunes']) assert.ok(S.fiche(id).champs[k], id + ' : ' + k);
});
t('chaque champ cite une source qui existe, avec adresse et date de consultation', () => {
  for (const f of Object.values(S.fiches)) for (const [k, c] of Object.entries(f.champs)) {
    assert.equal(c.length, 3, f.id + '.' + k); assert.ok(typeof c[0] === 'string' && c[0].length > 8, f.id + '.' + k);
    const s = S.SOURCES[c[2]]; assert.ok(s, f.id + '.' + k + ' : source « ' + c[2] + ' » inconnue'); assert.match(s.u, /^https:\/\//); assert.match(s.d, /^2026-10-13$/);
  }
});
t('texte parlé : aucun symbole, aucun markdown (°, %, ×, ², →, *, #, _), pas de chiffre collé à une unité', () => {
  const tous = [];
  for (const f of Object.values(S.fiches)) { tous.push(f.resume); for (const c of Object.values(f.champs)) tous.push(c[0]); tous.push(S.expliquer(f.id, () => 0)); }
  for (const x of tous) { assert.ok(!/[°%×²³→*#_`]/.test(x), 'symbole dans : ' + x); assert.ok(!/\d(?:km|kg|m\/s|K)\b/.test(x), 'unité collée : ' + x); }
});
t('les chiffres de la NASA sont repris tels quels (Mars, Jupiter, Terre, Soleil, ISS…)', () => {
  const v = (id, k) => S.fiche(id).champs[k][1];
  assert.equal(v('mars', 'diametre'), 6792); assert.equal(v('terre', 'diametre'), 12756); assert.equal(v('jupiter', 'diametre'), 142984); assert.equal(v('saturne', 'diametre'), 120536);
  assert.equal(v('venus', 'annee'), 224.701); assert.equal(v('mars', 'gravite'), 3.73); assert.equal(v('terre', 'masse'), 5.97); assert.equal(v('mercure', 'distance'), 57.9);
  assert.equal(v('lune', 'distance'), .3844); assert.equal(v('iss', 'masse'), 419725); assert.equal(v('iss', 'volume'), 1005); assert.equal(v('perseverance', 'records'), 45.22); assert.equal(v('curiosity', 'masse'), 899);
  assert.equal(v('saturne', 'lunes'), 274); assert.equal(v('jupiter', 'lunes'), 95); assert.equal(v('neptune', 'lunes'), 16); assert.equal(v('uranus', 'lunes'), 28);
  assert.match(S.fiche('venus').champs.temperature[0], /464 degrés/); assert.match(S.fiche('mars').champs.atmosphere[0], /95 pour cent de gaz carbonique/);
  assert.match(S.fiche('halley').champs.histoire[0], /1986.*2061/);
});
t('action simple / question précise : une phrase et un fait', () => {
  assert.match(R('quelle est la taille de Mars ?'), /^Mars mesure 6 792 kilomètres/);
  assert.match(R('combien de lunes a Saturne ?'), /274 lunes/); assert.match(R('quelle est la température sur Vénus'), /464 degrés/);
  assert.match(R('quand Voyager 1 a été lancé ?'), /5 septembre 1977/); assert.match(R('quelle est la vitesse de l’ISS ?'), /27 600 kilomètres par heure/);
  assert.match(R('la gravité de la Lune'), /1,62/);
  const x = R('quelle est la distance de Mars ?'); assert.ok(x.startsWith('Pour Mars, il est à 228 millions'), x);
});
t('explication : l’essentiel, des détails marquants, puis une ouverture', () => {
  const x = R('parle-moi de Mars'); assert.match(x, /^Mars est la quatrième planète/); assert.match(x, /6 792 kilomètres/); assert.match(x, /Si tu veux, je peux aussi te parler de/);
  assert.ok(x.split('. ').length >= 4);
  assert.match(R('c’est quoi l’ISS ?'), /^La Station spatiale internationale est un laboratoire habité/); assert.match(R('dis-moi tout sur Perseverance'), /Jezero/);
  assert.match(R('explique-moi la ceinture d’astéroïdes'), /entre les orbites de Mars et de Jupiter/);
});
t('comparaison point par point, avec réponse directe pour « plus gros que »', () => {
  const x = R('compare Mars et la Terre');
  for (const m of ['Pour la taille', 'Pour la masse', 'Pour la distance au Soleil', 'Pour la durée de l’année', 'Pour la pesanteur', 'Pour la température moyenne', 'Pour les lunes']) assert.ok(x.includes(m), m);
  assert.match(x, /1,9 fois moins/); assert.match(R('Mars est-elle plus grosse que la Terre ?'), /^Non, le diamètre de Mars est plus petit que celui de la Terre/);
  assert.match(R('Jupiter est plus chaud que Mars ?'), /^(Non|Oui), la température moyenne/); assert.match(R('compare Vénus et la Terre'), /presque identiques/);
});
t('honnêteté : une donnée absente de la fiche est annoncée, jamais inventée', () => {
  const x = R('quelle est la masse de Phobos ?'); assert.match(x, /Je n’ai pas cette donnée dans ma fiche sur Phobos/); assert.match(x, /je préfère ne pas l’inventer/);
  assert.match(R('quelle est l’atmosphère de Charon ?'), /Je n’ai pas cette donnée/);
  assert.equal(R('quelle est la couleur de Mars ?'), null);               // pas de champ : l’IA répond, avec la fiche dans son contexte
});
t('faux amis : le mois de mars, la météo, la Bourse, « par terre » ne déclenchent pas la base', () => {
  for (const q of ['combien de jours en mars ?', 'le 5 mars quelle heure est-il', 'quel temps fait-il demain au soleil ?', 'quel est le cours du Nasdaq ?', 'combien ça pèse par terre ?', 'quelle est la date de mars prochain']) assert.equal(R(q), null, q);
  assert.ok(R('quelle est la distance de mars ?'));
});
t('pronoms : « et sa taille ? » se rapporte à l’astre affiché', () => {
  assert.match(R('et sa taille ?', { cible: 'jupiter' }), /^Jupiter mesure 142 984/); assert.equal(R('et sa taille ?'), null);
  assert.match(R('et sa gravité ?', { cible: 'mars' }), /3,73/);
});
t('contexte pour l’IA : fiche, sources, consigne d’honnêteté', () => {
  const c = S.contexte('quelle est la couleur de Mars ?');
  assert.match(c, /FICHE « Mars »/); assert.match(c, /\[P\]/); assert.match(c, /NASA Planetary Fact Sheet/); assert.match(c, /Si une donnée demandée n’y figure pas, dis que tu ne l’as pas/);
  assert.equal(S.contexte('bonjour'), '');
});
t('alias : noms usuels, accents et tirets', () => {
  assert.equal(S.trouver('la planète rouge'), 'mars'); assert.equal(S.trouver('station spatiale internationale'), 'iss'); assert.equal(S.trouver('Curiosité'), 'curiosity');
  assert.equal(S.trouver('Déimos'), 'deimos'); assert.equal(S.trouver('la comète de Halley'), 'halley'); assert.deepEqual([...S.trouverTous('Mars et la Terre')], ['mars', 'terre']);
});
console.log(ok + ' groupes réussis');
