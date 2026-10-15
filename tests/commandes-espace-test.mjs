// Espace : questions de savoir (sans IA) avec l'astre affiché dans l'Univers, état de la scène, et actions de l'agent (outil « commande_espace ») exécutées sur la scène de l'Univers
// avec échecs avoués.   node tests/commandes-espace-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const norm = t => String(t || '').normalize('NFC').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const appels = [], dits = [], mem = new Map();
const etat = { ouvert: true, plein: false, fond: true, scene: { vue: 'terre' } };
const ctx = { console, Math, Date, norm, performance, setTimeout: f => { f(); return 0; }, clearTimeout() {}, vueActive: 'rayle', epoch: 0, addLine() {}, speak: async t => { dits.push(t); }, cutAll() {}, workerReady: () => false, wjson: async () => ({}), errMsg: e => String(e && e.message || e), commandeLocalisation: () => null };
ctx.window = ctx; ctx.globalThis = ctx;
ctx.localStorage = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); } };
ctx.document = { addEventListener() {}, getElementById: () => null, baseURI: 'http://x/' };
ctx.RayleBus = { demander(n) { if (n === 'vue') return ctx.vueActive; }, on() {}, fournir() {}, fusion() {}, emit() {} };
ctx.RayleUI = { reglages: () => ({ fond: ctx.fond || 'espace', palier: ctx.palier || 0 }), changer() {} };
vm.createContext(ctx);
for (const f of ['ui/astro.js', 'ui/espace-lieux.js', 'ui/espace-savoir.js', 'ui/espace.js']) vm.runInContext(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(new URL('../js/rayle/commandes-univers.js', import.meta.url), 'utf8') + '\nthis.commandeUnivers=commandeUnivers;', ctx);
// l'Univers simulé (installé APRÈS commandes-univers.js, qui pose le vrai) : la scène est déjà ouverte en fond ; chaque commande est notée
ctx.RayleUnivers = ctx.window.RayleUnivers = {
  estOuvert: () => etat.ouvert, estPlein: () => etat.ouvert && !etat.fond, estFond: () => etat.ouvert && etat.fond, fondVoulu: () => true, etat: () => etat, assurer: async () => { etat.ouvert = true; }, ouvrir: async () => { etat.ouvert = true; etat.fond = false; }, fermer: async () => {}, charger: async () => ({ instance: () => null }),
  commande: async (nom, a) => { appels.push(nom + (a && a.nom ? ':' + a.nom : '')); if (ctx.refus) return { ok: false, texte: ctx.refus }; if (nom === 'aller' && a.nom) etat.scene = { vue: 'systeme', suivi: a.nom }; return { ok: true, texte: 'Voici ' + (a && a.nom || nom) + '.' }; },
};
vm.runInContext(fs.readFileSync(new URL('../js/rayle/commandes-espace.js', import.meta.url), 'utf8') + '\nthis.echecsActions=echecsActions; this.espaceAgent=espaceAgent; this.commandeEspaceSavoir=commandeEspaceSavoir; this.contexteEspace=contexteEspace;', ctx);
const E = ctx.RayleUI.espace;
let ok = 0; const t = async (n, f) => { try { appels.length = 0; dits.length = 0; ctx.echecsActions.length = 0; Object.assign(etat, { ouvert: true, plein: false, fond: true, scene: { vue: 'terre' } }); ctx.fond = 'espace'; ctx.palier = 0; ctx.vueActive = 'rayle'; ctx.refus = null; mem.clear(); await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

await t('état : la scène de l’Univers (en fond ou en plein écran), l’astre suivi dans le système solaire, Mars dans sa vue', () => {
  let e = E.etat(); assert.equal(e.vue, 'rayle'); assert.equal(e.univers, 'fond'); assert.equal(e.cible, null); assert.equal(e.nom, 'la Terre'); assert.equal(e.fond, 'espace');
  etat.scene = { vue: 'systeme', suivi: 'jupiter' }; e = E.etat(); assert.equal(e.cible, 'jupiter'); assert.equal(e.nom, 'Jupiter');
  etat.scene = { vue: 'systeme', suivi: null }; assert.equal(E.etat().cible, null, 'vue d’ensemble du système : pas d’astre');
  etat.scene = { vue: 'mars' }; assert.equal(E.etat().cible, 'mars');
  Object.assign(etat, { plein: true, fond: false }); assert.equal(E.etat().univers, 'plein');
  etat.ouvert = false; assert.equal(E.etat().univers, null); assert.equal(E.etat().cible, null);
});
await t('agent : une action « espace » déplace la scène de l’Univers, étape par étape, et rend le texte réel', async () => {
  const bon = await ctx.espaceAgent({ type: 'espace', phrases: ['montre-moi Mars'] }); assert.equal(bon, 'Voici mars.'); assert.deepEqual([...appels], ['aller:mars']); assert.equal(ctx.echecsActions.length, 0);
  appels.length = 0; const suite = await ctx.espaceAgent({ type: 'espace', phrases: ['montre Mars', 'retour au système solaire', 'vue d’ensemble'] }); assert.deepEqual([...appels], ['aller:mars', 'retour', 'ensemble']); assert.match(suite, /Voici mars\. Voici retour\. Voici ensemble\./);
  appels.length = 0; await ctx.espaceAgent({ type: 'espace', phrases: ['la Lune de près'] }); assert.deepEqual([...appels], ['lune']);
});
await t('agent : une demande incomprise ou un échec remplace la réponse de l’IA (jamais « fait » pour rien)', async () => {
  await ctx.espaceAgent({ type: 'espace', phrases: ['fais-moi un gâteau'] }); assert.match(ctx.echecsActions[0], /Je n’ai pas compris cette demande pour l’Espace : « fais-moi un gâteau »/); assert.deepEqual([...appels], []);
  ctx.echecsActions.length = 0; await ctx.espaceAgent({ type: 'espace', phrases: [] }); assert.match(ctx.echecsActions[0], /la demande est vide/);
  ctx.echecsActions.length = 0; appels.length = 0; const r = await ctx.espaceAgent({ type: 'espace', phrases: ['montre Mars', 'fais-moi un gâteau', 'montre Saturne'] }); assert.deepEqual([...appels], ['aller:mars'], 'on s’arrête à l’étape incomprise'); assert.equal(ctx.echecsActions.length, 1); assert.equal(r, 'Voici mars.');
  ctx.echecsActions.length = 0; ctx.refus = 'Je ne trouve pas ce lieu.'; await ctx.espaceAgent({ type: 'espace', phrases: ['montre Mars'] }); assert.equal(ctx.echecsActions.length, 0, 'le refus de la scène est le texte rendu : il est dit tel quel');
});
await t('questions de savoir : réponse locale avec l’astre affiché ; contexte IA avec la fiche', () => {
  assert.match(ctx.commandeEspaceSavoir('quelle est la taille de Mars ?'), /6 792/);
  etat.scene = { vue: 'systeme', suivi: 'jupiter' }; assert.match(ctx.commandeEspaceSavoir('et sa masse ?'), /1 898/);
  assert.equal(ctx.commandeEspaceSavoir('quel est le prix du bitcoin ?'), null); assert.match(ctx.contexteEspace('quelle est la couleur de Mars ?'), /FICHE « Mars »/);
});
console.log(ok + ' groupes réussis');
