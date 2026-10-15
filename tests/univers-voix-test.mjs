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
  assert.ok(ex.length >= 8);
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
await t('analyse : navigation entre les planètes (entrer, sortir, retour, tourner, zoomer)', () => {
  assert.equal(A('retour au système solaire').action, 'retour'); assert.equal(A('retourne au système solaire').action, 'retour'); assert.equal(A('reviens au système').action, 'retour'); assert.equal(A('rentre dans le système solaire').action, 'retour');
  assert.equal(A('montre le système solaire').action, 'systeme', 'les anciennes phrases gardent leur sens');
  assert.equal(A('entre dans Mars').nom, 'mars'); assert.equal(A('entre dans la Terre').nom, 'terre'); assert.equal(A('rentre dans la planète Saturne').nom, 'saturne'); assert.equal(A('plonge dans Jupiter').nom, 'jupiter');
  assert.equal(A('entre dedans').action, 'entrer'); assert.equal(A('entre dedans').nom, '');
  assert.equal(A('sors de Mars').action, 'sortir'); assert.equal(A('sors de la planète').action, 'sortir'); assert.equal(A('quitte la planète').action, 'sortir');
  assert.equal(A('fais tourner Jupiter').nom, 'jupiter'); assert.equal(A('fais tourner Jupiter').action, 'tourner'); assert.equal(A('fais tourner la planète').nom, '');
  assert.equal(A('arrête de tourner').oui, false); assert.equal(A('arrête la rotation').oui, false); assert.equal(A('arrête de faire tourner Jupiter').nom, 'jupiter');
  assert.equal(A('zoome').facteur, .6); assert.ok(A('dézoome').facteur > 1); assert.ok(A('recule un peu').facteur > 1);
  assert.equal(A('va sur Mars').nom, 'mars'); assert.equal(A('montre-moi Saturne').nom, 'saturne'); assert.equal(A('zoome sur Mars').nom, 'mars', '« zoome sur X » reste un vol vers X');
});
await t('analyse : phrases voisines de la navigation ignorées', () => {
  const nav = ['retour', 'entrer', 'sortir', 'tourner', 'zoom'];
  for (const p of ['sors la poubelle', 'quitte la pièce', 'entre le code', 'entre dans la pièce', 'fais tourner la musique', 'arrête la musique', 'zoome sur le graphique', 'retour à la ligne', 'reviens à la maison']) { const a = A(p); assert.ok(!(a && nav.includes(a.action)), p + ' → ' + JSON.stringify(a)); }
});
await t('voix : entrer, sortir, retour, tourner, zoomer — transmis à l’Univers avec les bons arguments', async () => {
  reset('espace'); assert.equal(await C('entre dans Mars'), 'ok entrer'); assert.equal(appels[0][1].nom, 'mars');
  reset('espace'); assert.equal(await C('sors de la planète'), 'ok sortir');
  reset('espace'); assert.equal(await C('retour au système solaire'), 'ok retour');
  reset('espace'); assert.equal(await C('fais tourner Jupiter'), 'ok tourner'); assert.equal(appels[0][1].nom, 'jupiter');
  reset('espace'); await C('arrête de tourner'); assert.equal(appels[0][0], 'tourner'); assert.equal(appels[0][1].oui, false);
  reset('espace'); await C('zoome'); assert.equal(appels[0][0], 'zoom'); assert.equal(appels[0][1].facteur, .6);
  reset('espace'); await C('recule'); assert.ok(appels[0][1].facteur > 1);
});
await t('voix : Univers fermé — entrer/tourner l’ouvrent ; retour, sortir, zoom, « arrête de tourner » ne volent pas les autres commandes', async () => {
  reset(); assert.equal(await C('entre dans Mars'), 'ok entrer'); assert.equal(appels[0][0], 'ouvrir');
  reset(); assert.equal(await C('retour au système solaire'), null); assert.equal(await C('sors de la planète'), null); assert.equal(await C('zoome'), null); assert.equal(await C('arrête de tourner'), null); assert.equal(appels.length, 0);
  reset(); assert.equal(await C('entre dedans'), null, 'sans nom ni Univers ouvert : rien à faire');
  reset(); assert.equal(await C('fais tourner la Terre'), null, '« fais tourner la Terre » reste au fond Espace tant que l’Univers est fermé'); assert.equal(appels.length, 0);
  reset(); assert.equal(await C('fais tourner Jupiter'), 'ok tourner'); assert.equal(appels[0][0], 'ouvrir');
});

/* ───── position de l'entité ───── */
await t('analyse : position de l’entité (coin, centre, côté) — tournures du quotidien', () => {
  const coin = (p, c) => { const a = A(p); assert.ok(a && a.type === 'entite-position' && a.mode === 'coin', p); if (c !== undefined) assert.equal(a.coin, c, p); };
  coin('mets-toi dans le coin'); coin('Rayle, mets-toi dans le coin', null); coin('petite dans un coin'); coin('va dans un angle');
  coin('mets-toi en haut à gauche', 'hg'); coin('place-toi en haut à droite', 'hd'); coin('installe-toi en bas à gauche', 'bg'); coin('mets-toi en bas à droite', 'bd');
  coin('mets-toi dans le coin en haut à droite', 'hd'); coin('va dans le coin en bas à gauche', 'bg'); coin('petite dans le coin supérieur gauche', 'hg');
  for (const p of ['au centre', 'mets-toi au centre', 'grande au centre', 'place-toi au milieu', 'reste au centre']) assert.equal(A(p).mode, 'centre', p);
  for (const [p, c] of [['sur le côté gauche', 'gauche'], ['mets-toi sur le côté droit', 'droite'], ['grande sur le côté gauche', 'gauche'], ['colle-toi à droite', 'droite'], ['va à gauche', 'gauche'], ['mets-toi sur le côté droit de l’écran', 'droite']]) { assert.equal(A(p).mode, 'cote', p); assert.equal(A(p).cote, c, p); }
  assert.equal(A('épingle cette position pour cette vue').action, 'memoriser'); assert.equal(A('fixe cette position').action, 'memoriser'); assert.equal(A('verrouille cette position ici').action, 'memoriser');
  for (const p of ['retiens cette position', 'garde cette position', 'mémorise cette position']) assert.ok(!(A(p) && A(p).type === 'entite-position'), p + ' : « retiens / garde / mémorise » appartiennent à la mémoire de notes');
  assert.equal(A('oublie la position de cette vue').action, 'oublier'); assert.equal(A('réinitialise ta position').action, 'defaut'); assert.equal(A('oublie toutes les positions').action, 'defaut');
});
await t('analyse : une phrase avec d’autres mots n’est pas une position ; « mets-toi sur le côté » seul reste « ranger »', () => {
  for (const p of ['va à gauche sur la carte', 'mets la carte au centre', 'mets le graphique à gauche', 'tourne à gauche', 'ouvre le coin cuisine', 'quel est le centre de la France', 'mets-toi au centre commercial']) assert.ok(!(A(p) && A(p).type === 'entite-position'), p);
  assert.equal(A('mets-toi sur le côté').type, 'rangement'); assert.equal(A('range-toi').type, 'rangement'); assert.equal(A('reviens au centre').action, 'rouvrir', 'rouvrir la bulle reste prioritaire');
});
await t('voix : la position est appliquée à l’entité, avec une réponse claire', async () => {
  const pos = { mode: 'centre', coin: 'bd', cote: 'droite', vue: 'systeme', memorisee: false }, journal = [];
  const NOM = { hg: 'en haut à gauche', hd: 'en haut à droite', bg: 'en bas à gauche', bd: 'en bas à droite' };
  ctx.RayleEntitePosition = ctx.window.RayleEntitePosition = {
    etat: () => Object.assign({}, pos), phrase: () => pos.mode === 'coin' ? 'dans le coin ' + NOM[pos.coin] : pos.mode === 'cote' ? 'sur le côté ' + (pos.cote === 'gauche' ? 'gauche' : 'droit') : 'au centre',
    coin: c => { pos.mode = 'coin'; pos.coin = c; journal.push(['coin', c]); }, centre: () => { pos.mode = 'centre'; journal.push(['centre']); }, cote: c => { pos.mode = 'cote'; pos.cote = c; journal.push(['cote', c]); },
    memoriserVue: oui => { pos.memorisee = oui; journal.push(['memoriser', oui]); }, reinitialiser: () => journal.push(['defaut']),
  };
  reset('espace'); assert.equal(await C('Rayle, mets-toi en haut à gauche'), 'Je me mets dans le coin en haut à gauche.'); assert.deepEqual(journal.at(-1), ['coin', 'hg']);
  assert.equal(await C('au centre'), 'Je me mets au centre.'); assert.deepEqual(journal.at(-1), ['centre']);
  assert.equal(await C('sur le côté gauche'), 'Je me mets sur le côté gauche.'); assert.deepEqual(journal.at(-1), ['cote', 'gauche']);
  pos.mode = 'coin'; pos.coin = 'bd'; assert.equal(await C('mets-toi dans le coin'), 'Je me mets dans le coin en bas à droite.', 'sans précision : on garde l’angle actuel'); assert.deepEqual(journal.at(-1), ['coin', 'bd']);
  assert.equal(await C('mets-toi en haut'), null, '« haut » seul n’est pas une position');
  assert.equal(await C('mets-toi à gauche dans le coin'), 'Je me mets dans le coin en bas à gauche.', 'seul le côté est donné : on garde haut/bas actuel'); assert.deepEqual(journal.at(-1), ['coin', 'bg']);
});
await t('voix : mémoriser / oublier la position d’une vue ; un ordre de position sort Raylé de sa bulle', async () => {
  const journal = [], pos = { mode: 'coin', coin: 'hd', cote: 'droite', vue: 'mars', memorisee: false };
  ctx.RayleEntitePosition = ctx.window.RayleEntitePosition = { etat: () => Object.assign({}, pos), phrase: () => 'dans le coin en haut à droite', coin() {}, centre() {}, cote() {}, memoriserVue: oui => { pos.memorisee = oui; journal.push(oui); }, reinitialiser: () => journal.push('defaut') };
  reset('espace'); assert.match(await C('épingle cette position pour cette vue'), /pour Mars/); assert.deepEqual(journal, [true]);
  assert.match(await C('oublie la position de cette vue'), /j’ai oublié la position de Mars/i); assert.deepEqual(journal, [true, false]);
  assert.match(await C('oublie la position de cette vue'), /pas de position mémorisée/);
  assert.match(await C('réinitialise ta position'), /par défaut/);
  let rouvert = 0; ctx.RayleRangement = ctx.window.RayleRangement = { estRange: () => true, rouvrir: () => { rouvert++; } };
  await C('mets-toi au centre'); assert.equal(rouvert, 1); ctx.RayleRangement = ctx.window.RayleRangement = { estRange: () => false };
  delete ctx.RayleEntitePosition; delete ctx.window.RayleEntitePosition; assert.equal(await C('mets-toi au centre'), null, 'module absent : rien');
});
console.log(ok + ' tests réussis');
