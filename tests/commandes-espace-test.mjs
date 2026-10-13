// Commandes contextuelles de l'Espace (zoome dessus, et sa lune, garde cette vue, enchaînements, noms mal formés) et actions de l'agent avec échecs avoués.
//   node tests/commandes-espace-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const norm = t => String(t || '').normalize('NFC').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const appels = [], dits = [], mem = new Map();
const scene = { cible: null, vol: false, zoom: 1 };
const ctx = { console, Math, Date, norm, performance, setTimeout: f => { f(); return 0; }, clearTimeout() {}, vueActive: 'rayle' };
ctx.window = ctx; ctx.globalThis = ctx;
ctx.localStorage = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); } };
ctx.RayleBus = { demander(n, a) { if (n === 'vue') return ctx.vueActive; if (n === 'rayle:dire') { dits.push(a); return true; } }, on() {}, fournir() {}, fusion() {}, emit() {} };
ctx.RayleUI = {
  reglages: () => ({ fond: ctx.fond || 'espace', palier: ctx.palier || 0 }), changer(k, v) { appels.push('changer:' + k + ':' + v); ctx.fond = v; },
  fondScene: () => ({ etat: () => scene, vers(c) { appels.push('vers:' + c); scene.cible = c; }, retour() { appels.push('retour'); scene.cible = null; }, zoom(f) { if (!scene.cible) return false; appels.push('zoom:' + f); scene.zoom *= f; return true; } })
};
vm.createContext(ctx);
for (const f of ['ui/astro.js', 'ui/espace-lieux.js', 'ui/espace-savoir.js', 'ui/espace.js']) vm.runInContext(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(new URL('../js/rayle/commandes-espace.js', import.meta.url), 'utf8') + '\nthis.echecsActions=echecsActions; this.espaceAgent=espaceAgent; this.commandeEspaceSavoir=commandeEspaceSavoir; this.contexteEspace=contexteEspace;', ctx);
const E = ctx.RayleUI.espace;
let ok = 0; const t = async (n, f) => { try { appels.length = 0; dits.length = 0; ctx.echecsActions.length = 0; Object.assign(scene, { cible: null, vol: false, zoom: 1 }); ctx.fond = 'espace'; ctx.palier = 0; ctx.vueActive = 'rayle'; mem.clear(); await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

await t('« zoome dessus » : rapproche l’astre affiché ; sans astre, l’échec est dit (jamais « fait » pour rien)', async () => {
  let r = E.commandeDetaillee('zoome dessus'); assert.equal(r.ok, false); assert.match(r.texte, /rien à rapprocher/); assert.deepEqual([...appels], []);
  E.commandeDetaillee('montre-moi Mars'); r = E.commandeDetaillee('zoome dessus'); assert.equal(r.ok, true); assert.match(r.texte, /Je me rapproche de Mars/); assert.ok(appels.includes('zoom:0.65'));
  r = E.commandeDetaillee('recule'); assert.match(r.texte, /Je prends du recul sur Mars/); assert.ok(appels.includes('zoom:1.5'));
});
await t('zoom impossible en mode Éco : Raylé l’explique et échoue honnêtement', async () => {
  ctx.palier = 2; E.commandeDetaillee('montre-moi Mars'); const r = E.commandeDetaillee('zoome dessus'); assert.equal(r.ok, false); assert.match(r.texte, /Je ne peux pas zoomer ici/);
});
await t('« et sa lune ? » : depuis la Terre, la Lune ; depuis Mars, Phobos et Déimos ; depuis Vénus, aucune', async () => {
  let r = E.commandeDetaillee('et sa lune ?'); assert.ok(appels.includes('vers:lune')); assert.ok(r.ok);
  appels.length = 0; scene.cible = 'mars'; r = E.commandeDetaillee('et ses lunes'); assert.match(r.texte, /^Mars : Il a deux petites lunes, Phobos et Déimos/); assert.ok(!appels.some(a => a.startsWith('vers:')));
  scene.cible = 'venus'; r = E.commandeDetaillee('et sa lune'); assert.match(r.texte, /aucune lune/);
  scene.cible = 'perseverance'; r = E.commandeDetaillee('et sa lune'); assert.equal(r.ok, false); assert.match(r.texte, /préfère ne pas l’inventer/);
});
await t('« garde cette vue » : mémorise l’astre affiché ; « reviens à la Terre » et « reviens » (seulement sur l’accueil)', async () => {
  E.commandeDetaillee('montre-moi Saturne'); let r = E.commandeDetaillee('garde cette vue'); assert.match(r.texte, /Saturne devient ta vue par défaut/); assert.equal(E.etat().accueil, 'saturne');
  r = E.commandeDetaillee('reviens à la Terre'); assert.match(r.texte, /Retour sur la Terre/); assert.ok(appels.includes('retour'));
  E.commandeDetaillee('montre-moi Jupiter'); appels.length = 0; assert.ok(E.commandeDetaillee('reviens')); assert.ok(appels.includes('retour'));
  E.commandeDetaillee('montre-moi Jupiter'); ctx.vueActive = 'terminal'; assert.equal(E.commandeDetaillee('reviens'), null, 'dans le terminal « reviens » est pour le terminal');
});
await t('« et Mars ? » : on enchaîne sur un autre astre sans répéter le verbe', async () => {
  E.commandeDetaillee('montre-moi Jupiter'); const r = E.commandeDetaillee('et Mars ?'); assert.ok(appels.includes('vers:mars')); assert.match(r.texte, /Direction Mars/);
  assert.equal(E.commandeDetaillee('et le bitcoin ?'), null);
});
await t('enchaînement : « montre Mars puis Perseverance » → Mars tout de suite, puis le rover, annoncé par Raylé', async () => {
  const r = E.commandeDetaillee('montre Mars puis Perseverance'); assert.ok(r.ok); assert.match(r.texte, /Direction Mars\..*Ensuite : le rover Perseverance/);
  await r.suite; assert.deepEqual([...appels].filter(a => a.startsWith('vers:')), ['vers:mars', 'vers:perseverance']); assert.equal(dits.length, 1); assert.match(dits[0], /Perseverance/);
});
await t('enchaînement à trois étapes avec retour ; une nouvelle commande annule la suite', async () => {
  const r = E.commandeDetaillee('va sur Saturne puis montre Titan puis reviens'); assert.equal(r, null, 'Titan n’est pas une cible de vol : toute la chaîne est refusée, rien n’est fait à moitié');
  const s = E.commandeDetaillee('va sur Saturne puis reviens'); await s.suite; assert.deepEqual([...appels].filter(a => /^(vers|retour)/.test(a)), ['vers:saturne', 'retour']);
  appels.length = 0; const u = E.commandeDetaillee('montre Mars puis montre Vénus'); E.commandeDetaillee('montre Neptune'); await u.suite; assert.ok(!appels.includes('vers:venus'), 'annulée par la commande suivante');
});
await t('une chaîne peut mêler vol et zoom', async () => {
  const r = E.commandeDetaillee('montre Mars puis zoome dessus puis recule'); await r.suite; assert.ok(appels.includes('zoom:0.65') && appels.includes('zoom:1.5'));
});
await t('noms mal formés corrigés : perseverence, jupitere, curiosité, urannus ; mais pas Venise, Marseille ni Solana', async () => {
  for (const [q, c] of [['montre-moi perseverence', 'perseverance'], ['montre moi jupitere', 'jupiter'], ['montre la curiosité', 'curiosity'], ['va sur urannus', 'uranus'], ['montre-moi neptunne', 'neptune']]) { const a = E.analyser(q); assert.ok(a && a.cible === c, q + ' → ' + JSON.stringify(a)); }
  assert.match(E.commandeDetaillee('montre-moi perseverence').texte, /^J’ai compris le rover Perseverance\. Direction/);
  for (const q of ['montre-moi Venise', 'montre-moi Marseille', 'montre-moi Solana', 'montre moi le graphique']) assert.equal(E.analyser(q), null, q);
});
await t('« emmène-moi voir Saturne » est compris (verbe + « voir »)', () => { assert.equal(E.analyser('emmène-moi voir Saturne').cible, 'saturne'); });
await t('état : écran, astre, échelle, vue sauvegardée', () => {
  E.commandeDetaillee('échelle réaliste'); E.commandeDetaillee('montre-moi Mars'); const e = E.etat();
  assert.equal(e.vue, 'rayle'); assert.equal(e.cible, 'mars'); assert.equal(e.nom, 'Mars'); assert.equal(e.echelle, 'realiste'); assert.equal(e.fond, 'espace');
});
await t('agent : action « espace » exécutée ; une demande incomprise ou un échec remplace la réponse de l’IA', async () => {
  const bon = await ctx.espaceAgent({ type: 'espace', phrases: ['montre-moi Mars'] }); assert.match(bon, /Direction Mars/); assert.equal(ctx.echecsActions.length, 0);
  const enchaine = await ctx.espaceAgent({ type: 'espace', phrases: ['montre Mars', 'montre Perseverance'] }); assert.match(enchaine, /Ensuite : le rover Perseverance/);
  ctx.echecsActions.length = 0; Object.assign(scene, { cible: null });
  await ctx.espaceAgent({ type: 'espace', phrases: ['zoome dessus'] }); assert.equal(ctx.echecsActions.length, 1); assert.match(ctx.echecsActions[0], /rien à rapprocher/);
  ctx.echecsActions.length = 0; await ctx.espaceAgent({ type: 'espace', phrases: ['fais-moi un gâteau'] }); assert.match(ctx.echecsActions[0], /Je n’ai pas compris cette demande pour l’Espace : « fais-moi un gâteau »/);
  ctx.echecsActions.length = 0; await ctx.espaceAgent({ type: 'espace', phrases: [] }); assert.match(ctx.echecsActions[0], /la demande est vide/);
});
await t('questions de savoir : réponse locale avec l’astre affiché ; contexte IA avec la fiche', () => {
  assert.match(ctx.commandeEspaceSavoir('quelle est la taille de Mars ?'), /6 792/); scene.cible = 'jupiter'; assert.match(ctx.commandeEspaceSavoir('et sa masse ?'), /1 898/);
  assert.equal(ctx.commandeEspaceSavoir('quel est le prix du bitcoin ?'), null); assert.match(ctx.contexteEspace('quelle est la couleur de Mars ?'), /FICHE « Mars »/);
});
await t('objets sans vue 3D : une lune → vol vers sa planète ; Pluton, Hubble → échec avoué ; la ceinture → allumée ; « l’Europe » reste pour la page Monde', async () => {
  let r = E.commandeDetaillee('montre-moi Titan'); assert.ok(r.ok); assert.ok(appels.includes('vers:saturne')); assert.match(r.texte, /^Je n’ai pas de vue 3D de Titan : je ne peux pas le survoler lui-même\. Je t’emmène vers Saturne/); assert.match(r.texte, /Direction Saturne/);
  appels.length = 0; r = E.commandeDetaillee('montre-moi Pluton'); assert.equal(r.ok, false); assert.deepEqual([...appels], []); assert.match(r.texte, /^Je n’ai pas de vue 3D de Pluton\./); assert.match(r.texte, /préfère ne pas l’inventer/); assert.match(r.texte, /Mes cibles de vol sont/);
  r = E.commandeDetaillee('montre-moi Hubble'); assert.equal(r.ok, false); assert.match(r.texte, /Je n’ai pas de vue 3D de Hubble\. Hubble est un télescope spatial/);
  r = E.commandeDetaillee('montre-moi Phobos'); assert.ok(appels.includes('vers:mars'));
  r = E.commandeDetaillee('montre-moi la ceinture d’astéroïdes'); assert.ok(r.ok); assert.match(r.texte, /J’affiche/);
  for (const q of ['montre-moi l’Europe', 'zoom sur l’Europe', 'montre-moi le Japon']) assert.equal(E.analyser(q), null, q);
  assert.equal(E.analyser('emmène-moi voir la station').cible, 'iss'); assert.equal(E.analyser('montre-moi la station Châtelet'), null);
});
await t('fiche dite à voix haute : une phrase et un fait sourcé, sans symbole ; rubriques de la fiche tirées de la base', () => {
  for (const c of ['soleil', 'lune', 'mars', 'jupiter', 'saturne', 'uranus', 'neptune', 'iss', 'perseverance', 'curiosity', 'trounoir']) {
    const f = E.fiche(c, { iss: { etat: () => ({ alt: 421, lat: 12, lon: -40, simule: false }) } });
    assert.ok(f.parle.length > 40, c); assert.ok(!/[°%×²³→*#_₂]/.test(f.parle), c + ' : symbole dans « ' + f.parle + ' »'); assert.ok(f.rubriques.length >= 2, c + ' : rubriques');
  }
  assert.match(E.fiche('mars').parle, /Valles Marineris/); assert.ok(!/Il porte le plus grand volcan.*Il porte/.test(E.fiche('mars').parle));
  assert.match(E.fiche('perseverance').parle, /^Le rover Perseverance explore le cratère Jezero, sur Mars\./);
  assert.ok(E.fiche('mars').rubriques.some(r => r.t === 'Atmosphère' && /95 pour cent/.test(r.v)));
});
console.log(ok + ' groupes réussis');
