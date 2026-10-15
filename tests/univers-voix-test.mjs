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
await t('voix : astres, Mars, ISS, qualité', async () => {
  reset('espace'); assert.equal(await C('va sur Mars'), 'ok aller'); assert.equal(appels[0][1].nom, 'mars');
  reset('espace'); assert.equal(await C('montre le système solaire'), 'ok systeme');
  reset('espace'); await C('atterris sur Mars'); assert.equal(appels[0][0], 'atterrir');
  reset('espace'); assert.equal(await C('présente l’ISS'), '__deja_dit__'); assert.equal(appels[0][1].presenter, true);
  reset('espace'); await C('mets la qualité en haute'); assert.deepEqual(JSON.parse(JSON.stringify(appels[0])), ['qualite', { niveau: 'haute' }]);
  reset('espace'); await C('passe l’animation'); assert.equal(appels[0][0], 'passer');
});
await t('voix : pièces du rover seulement dans la vue Mars', async () => {
  reset('espace', { vue: 'terre' }); assert.equal(await C('montre la caméra du rover'), null);
  reset('espace', { vue: 'mars' }); assert.equal(await C('montre la caméra du rover'), 'ok piece'); assert.equal(appels[0][1].nom, 'camera');
});
await t('la bataille navale n’existe plus : ses phrases ne déclenchent rien', async () => {
  for (const p of ['bascule sur la bataille navale', 'lance une escarmouche', 'montre l’intérieur de la frégate', 'tire', 'va dans la cuisine', 'suis la frégate espagnole']) assert.notEqual(A(p) && A(p).type, 'navale', p);
  reset(); assert.equal(await C('bascule sur la bataille navale'), null); assert.equal(appels.length, 0);
});
console.log(ok + ' tests réussis');
