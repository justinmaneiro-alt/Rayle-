// Charge le registre des capacités avec les VRAIS analyseurs de phrases de Raylé (sans navigateur) : utilisé par tests/capacites-test.mjs et scripts/capacites.mjs.
import vm from 'node:vm';
import fs from 'node:fs';

const racine = new URL('../', import.meta.url);
const lire = f => fs.readFileSync(new URL(f, racine), 'utf8');

export async function chargerRegistre() {
  const norm = t => String(t || '').normalize('NFC').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const cmdNorm = n => String(n || '').replace(/[?!.,;:…«»"]/g, ' ').replace(/(?:^|\s)(?:(?:hey|he|eh|ok|okay|dis)\s+)?rayle(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  const ctx = {
    console, performance, setTimeout, clearTimeout, Math, Date, norm, cmdNorm, pick: a => a[0],
    vueActive: 'rayle', etatScene: { cible: null, vol: false, zoom: 1 },
    addLine() {}, speak() {}, cutAll() {}, updateBridgeStatus() {}, miniReactor: { addEventListener() {} }, reactor: { click() {} }
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  const mem = new Map(); ctx.localStorage = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); } };
  ctx.RayleBus = { demander(n) { return n === 'vue' ? ctx.vueActive : undefined; }, on() {}, fournir() {}, fusion() {}, emit() {}, etat() { return {}; } };
  ctx.RayleUI = { fondScene: () => ({ etat: () => ctx.etatScene, zoom: () => true, vers() {}, retour() {} }), reglages: () => ({ fond: 'espace', palier: 0 }), changer() {} };
  vm.createContext(ctx);
  const charger = f => vm.runInContext(lire(f), ctx, { filename: f });
  for (const f of ['ui/themes.js', 'ui/settings.js', 'ui/astro.js', 'ui/ambiance.js', 'ui/espace-lieux.js', 'ui/espace-savoir.js', 'ui/espace.js']) charger(f);
  charger('js/rayle/pays-donnees.js'); charger('js/rayle/commandes-monde.js'); charger('js/rayle/commandes-terminal.js');
  // la Terre sert de carte : phrases de lieux (carte.js), d'appareils (localisation.js), de zoom et de repères (commandes-univers.js)
  Object.assign(ctx, { epoch: 0, errMsg: e => String(e && e.message || e), store: { get: () => '' }, KEY_WDEV: 'k1', KEY_WDEVNOM: 'k2', workerReady: () => false, matchMedia: () => ({ matches: false }), screen: { width: 1920, height: 1080 }, navigator: {}, document: { hidden: false, addEventListener() {}, getElementById: () => null, baseURI: 'http://x/' }, RayleRangement: { estRange: () => false }, commandeLocalisation: () => null });
  charger('js/rayle/carte.js'); charger('js/rayle/localisation.js'); charger('js/rayle/commandes-univers.js');
  for (const f of ['ui/espace-pays-centres.js', 'ui/espace-temps.js', 'ui/espace-terre-donnees.js', 'ui/espace-terre.js']) charger(f);
  vm.runInContext(lire('js/rayle/capacites.js') + '\nthis.RayleCapacites=RayleCapacites;', ctx, { filename: 'js/rayle/capacites.js' });
  const { analyser: anatomie } = await import(new URL('js/anatomie/commandes.js', racine).href);
  const { analyser: drive } = await import(new URL('js/drive/commandes.js', racine).href);
  const S = ctx.RayleUI.savoir;
  const verifiers = {
    espace: p => ctx.analyserChaine(p) || ctx.analyserUnivers(p),            // la scène de l'Univers (fond ou plein écran) : js/rayle/commandes-univers.js
    savoir: p => S.repondre(p, { alea: () => 0 }),
    terminal: p => ctx.analyserCommandeTerminal ? ctx.analyserCommandeTerminal(p, { ouvert: true }) : vm.runInContext('analyserCommandeTerminal', ctx)(p, { ouvert: true }),
    monde: p => vm.runInContext('RayleMonde', ctx).analyser(p),
    anatomie: p => anatomie(p, { vue: 'rayle' }),
    drive: p => drive(p, { fichiers: [{ id: '1', name: 'Cours d’anatomie – UE2' }, { id: '2', name: 'Rapport de stage' }], ouverte: true, configure: true, attente: false }),
    apparence: p => ctx.RayleUI.analyserCommande(cmdNorm(norm(p))),
    carte: p => ctx.analyserCarte(p) || vm.runInContext('RayleLocalisation', ctx).analyser(p) || (a => a && ['zoom-carte', 'effacer-carte'].includes(a.action) ? a : null)(ctx.analyserUnivers(p))
  };
  const verifier = async (famille, phrase) => {
    let r = verifiers[famille](phrase);
    if (!r && famille === 'terminal') r = vm.runInContext('estFermetureTerminal', ctx)(phrase);
    return r;
  };
  return { reg: ctx.RayleCapacites, verifier, ctx };
}
