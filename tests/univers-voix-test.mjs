// Commandes vocales des modes de l'Univers (js/rayle/commandes-univers.js) : analyse pure + exécution avec un Univers simulé.   node tests/univers-voix-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

let ok = 0; const t = async (nom, f) => { try { await f(); ok++; console.log('  ✔ ' + nom); } catch (e) { console.error('  ✘ ' + nom + '\n    ' + (e && e.stack || e)); process.exitCode = 1; } };
const appels = [], dits = [];
const etat = { ouvert: false, theme: null, scene: null };
const ctx = {
  console, document: { addEventListener() {}, getElementById: () => null, baseURI: 'http://x/' }, RayleBus: { on() {}, emit() {} }, RayleRangement: { estRange: () => false }, commandeLocalisation: () => null,
  epoch: 0, addLine() {}, speak: async t => { dits.push(t); }, cutAll() {}, workerReady: () => false, wjson: async () => ({}),
  RAYLE_UNIVERS_SIMULE: {
    estOuvert: () => etat.ouvert, etat: () => etat,
    ouvrir: async (th, o) => { appels.push(['ouvrir', th, o]); etat.ouvert = true; etat.theme = th; },
    commande: async (nom, a) => { appels.push([nom, a]); return { ok: true, texte: 'ok ' + nom }; },
    charger: async () => ({ instance: () => ({ _: { connait: n => /^(?:mars|france|jupiter)$/.test(n) } }) }),
    fermer: async () => { etat.ouvert = false; },
  },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../js/rayle/commandes-univers.js', import.meta.url), 'utf8') + '\nglobalThis.__a=analyserUnivers; globalThis.__c=commandeUnivers;', ctx);
ctx.RayleUnivers = ctx.window.RayleUnivers = ctx.RAYLE_UNIVERS_SIMULE;
const A = p => { const r = ctx.__a(p); return r && JSON.parse(JSON.stringify(r)); }, C = ctx.__c;
const reset = (th = null, scene = null) => { appels.length = 0; dits.length = 0; etat.ouvert = !!th; etat.theme = th; etat.scene = scene; };

await t('analyse : bataille navale (ouvrir, lieu, scénarios)', () => {
  for (const p of ['bascule sur la bataille navale', 'passe en bataille navale', 'lance une bataille navale', 'va sur la bataille navale', 'Raylé, ouvre la bataille navale']) assert.equal(A(p) && A(p).action, 'ouvrir', p);
  assert.equal(A('bascule sur la bataille navale dans la Manche').lieu, 'manche');
  assert.deepEqual(A('lance une escarmouche'), { type: 'navale', action: 'scenario', scenario: 'escarmouche' });
  assert.equal(A('lance une bataille').scenario, 'bataille'); assert.equal(A('fais un duo').scenario, 'duo'); assert.equal(A('montre une balade').scenario, 'balade');
});
await t('analyse : intérieur des navires', () => {
  assert.deepEqual(A('montre l’intérieur de la frégate'), { type: 'navale', action: 'interieur', navire: 'fregate', visite: false });
  assert.equal(A('montre l intérieur du vaisseau de ligne').navire, 'vaisseau');
  assert.equal(A('visite la frégate anglaise').nation, 'angleterre');
  assert.equal(A('monte dans le brick').navire, 'brick');
  assert.deepEqual(A('visite guidée'), { type: 'navale', action: 'visite' });
  assert.equal(A('va dans la cuisine').piece, 'cuisine'); assert.equal(A('descends dans la cale').piece, 'cale'); assert.equal(A('emmène-moi à la soute à poudre').piece, 'soute');
  assert.equal(A('va dans la cabine du capitaine').piece, 'cabine'); assert.equal(A('montre les hamacs').piece, 'hamacs'); assert.equal(A('va aux batteries').piece, 'batterie'); assert.equal(A('va à l’infirmerie').piece, 'infirmerie');
  assert.equal(A('sors du navire').action, 'sortir');
});
await t('analyse : ordres dans la bataille', () => {
  for (const p of ['tire', 'feu', 'fais feu', 'tire une bordée', 'à vos canons']) assert.equal(A(p) && A(p).action, 'tirer', p);
  assert.deepEqual(A('vue du pont'), { type: 'navale', action: 'camera', mode: 'pont' }); assert.equal(A('vue d’ensemble').mode, 'ensemble'); assert.equal(A('caméra libre').mode, 'libre');
  assert.equal(A('suis la frégate espagnole').nation, 'espagne');
  assert.equal(A('mets la tempête').meteo, 'tempete'); assert.equal(A('fais venir le brouillard').meteo, 'brouillard'); assert.equal(A('mets la nuit').moment, 'nuit'); assert.equal(A('passe en crépuscule').moment, 'crepuscule');
  assert.equal(A('coupe le son').muet, true); assert.equal(A('remets le son').muet, false); assert.equal(A('quel temps fait-il en mer').action, 'infometeo');
});
await t('analyse : système solaire, astres, Mars, ISS, qualité', () => {
  assert.equal(A('montre le système solaire').action, 'systeme'); assert.equal(A('va dans le système solaire').action, 'systeme');
  assert.equal(A('va sur Mars').nom, 'mars'); assert.equal(A('montre Jupiter').nom, 'jupiter'); assert.equal(A('direction Saturne').nom, 'saturne');
  assert.equal(A('montre l’échelle réelle').reelle, true); assert.equal(A('passe à l’échelle didactique').reelle, false);
  assert.equal(A('atterris sur Mars').action, 'atterrir'); assert.equal(A('atterris sur Mars avec Curiosity').rover, 'curiosity');
  assert.equal(A('montre le rover Perseverance').action, 'rover'); assert.equal(A('montre l’autre rover').action, 'autre-rover'); assert.equal(A('montre la caméra du rover').action, 'piece-rover');
  assert.equal(A('où est l’ISS').action, 'iss'); assert.equal(A('présente la station spatiale').presenter, true); assert.equal(A('montre les satellites').oui, true); assert.equal(A('retire les satellites').oui, false);
  assert.equal(A('retourne dans l’espace').action, 'terre'); assert.equal(A('reviens sur la Terre').action, 'terre');
  assert.equal(A('qualité haute').niveau, 'haute'); assert.equal(A('mets la qualité en basse').niveau, 'basse'); assert.equal(A('mets la qualité moyenne').niveau, 'moyenne'); assert.equal(A('passe en qualité automatique').niveau, 'auto');
  assert.equal(A('passe l’animation').action, 'passer'); assert.equal(A('saute la cinématique').action, 'passer');
});
await t('analyse : phrases voisines ignorées', () => {
  for (const p of ['quelle heure est-il', 'mets de la musique', 'lance un minuteur', 'tire la porte', 'passe à la suite', 'bonjour']) assert.equal(A(p), null, p);
});
await t('analyse : les présentations existantes marchent toujours', () => {
  assert.equal(A('présente la France').action, 'presenter'); assert.equal(A('montre l’océan Pacifique').action, 'aller'); assert.equal(A('montre la prochaine éclipse').action, 'eclipse');
});
await t('capacités : les exemples du registre « univers » déclenchent bien une commande', async () => {
  const reg = fs.readFileSync(new URL('../js/rayle/capacites.js', import.meta.url), 'utf8'), bloc = /id:'univers'[\s\S]*?ex:\[(.*?)\],verif/.exec(reg)[1], ex = [...bloc.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1].replace(/\\'/g, "'"));
  assert.ok(ex.length >= 10);
  for (const p of ex) { if (/appareils|réduis/.test(p)) continue; assert.ok(A(p), 'exemple sans effet : ' + p); }
});
await t('voix : bascule vers la bataille navale (Univers fermé → ouvre le thème)', async () => {
  reset(); const r = await C('bascule sur la bataille navale'); assert.equal(r, '__deja_dit__'); assert.deepEqual(appels[0].slice(0, 2), ['ouvrir', 'navale']); assert.match(dits[0], /bataille navale/);
});
await t('voix : bataille navale depuis l’espace (transition continue)', async () => {
  reset('espace'); await C('passe en bataille navale dans la Manche'); assert.equal(appels[0][1], 'navale'); assert.equal(appels[0][2].lieu, 'manche');
});
await t('voix : « montre l’intérieur de la frégate » ouvre la frégate puis y entre', async () => {
  reset(); const r = await C('montre l’intérieur de la frégate'); assert.equal(appels[0][0], 'ouvrir'); assert.equal(appels[0][2].navires[0].type, 'fregate');
  assert.equal(appels[1][0], 'interieur'); assert.equal(appels[1][1].type, 'fregate'); assert.equal(r, 'ok interieur');
});
await t('voix : ordres de bataille seulement dans le thème navale', async () => {
  reset('espace'); assert.equal(await C('tire'), null); assert.equal(await C('mets la tempête'), null); assert.equal(await C('va dans la cuisine'), null);
  reset('navale'); assert.equal(await C('tire'), 'ok tirer'); assert.equal(appels[0][0], 'tirer');
  await C('mets la tempête'); assert.deepEqual(JSON.parse(JSON.stringify(appels[1])), ['meteo', { meteo: 'tempete' }]);
  await C('vue du pont'); assert.equal(appels[2][1].mode, 'pont'); await C('va dans la cale'); assert.equal(appels[3][0], 'piece'); assert.equal(appels[3][1].piece, 'cale');
  await C('sors du navire'); assert.equal(appels[4][0], 'sortir-interieur');
});
await t('voix : retour vers l’espace depuis la bataille navale', async () => {
  reset('navale'); assert.equal(await C('reviens sur la Terre'), '__deja_dit__'); assert.equal(appels[0][0], 'espace');
  reset('navale'); assert.equal(await C('retourne dans l’espace'), '__deja_dit__'); assert.equal(appels[0][0], 'espace');
});
await t('voix : astres, Mars, ISS, qualité', async () => {
  reset('espace'); assert.equal(await C('va sur Mars'), 'ok aller'); assert.equal(appels[0][1].nom, 'mars');
  reset('espace'); assert.equal(await C('montre le système solaire'), 'ok systeme');
  reset('espace'); await C('atterris sur Mars'); assert.equal(appels[0][0], 'atterrir');
  reset('espace'); assert.equal(await C('présente l’ISS'), '__deja_dit__'); assert.equal(appels[0][1].presenter, true);
  reset('espace'); await C('mets la qualité en haute'); assert.deepEqual(JSON.parse(JSON.stringify(appels[0])), ['qualite', { niveau: 'haute' }]);
  reset('espace'); await C('passe l’animation'); assert.equal(appels[0][0], 'passer');
  reset('navale'); await C('montre le système solaire'); assert.equal(appels[0][1], 'espace'); assert.equal(appels[1][0], 'systeme');
});
await t('voix : pièces du rover seulement dans la vue Mars', async () => {
  reset('espace', { vue: 'terre' }); assert.equal(await C('montre la caméra du rover'), null);
  reset('espace', { vue: 'mars' }); assert.equal(await C('montre la caméra du rover'), 'ok piece'); assert.equal(appels[0][1].nom, 'camera');
});
await t('voix : « présente la frégate » va vers la bataille navale', async () => {
  reset('navale'); assert.equal(await C('présente la frégate'), '__deja_dit__'); assert.equal(appels[0][0], 'presenter'); assert.equal(appels[0][1].type, 'fregate');
});
console.log(ok + ' tests réussis');
