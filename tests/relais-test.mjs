// Phase 3B : liste blanche du relais PC (relais-pc/actions.mjs) et compréhension des phrases (js/rayle/relais.js) :   node tests/relais-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { plan, urlSure, trouverFichier } from '../relais-pc/actions.mjs';

let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };
const S = (op, valeur) => ({ type: 'systeme', op, valeur });

t('relais PC : liste blanche, jamais de shell ni de texte libre', () => {
  assert.ok(plan({ type: 'eval', op: 'x' }).erreur);
  assert.ok(plan(S('rm', '-rf')).erreur);
  assert.ok(plan(S('ouvrir_app', 'format c')).erreur);
  assert.deepEqual(plan(S('ouvrir_app', 'calculatrice')).etapes, [{ prog: 'calc.exe', args: [] }]);
  assert.equal(plan(S('ouvrir_app', 'xtb')).etapes[0].args[1], 'https://xstation5.xtb.com/');
  assert.equal(plan(S('ouvrir_app', 'monoutil'), { apps: { monoutil: ['C:\\outil.exe', '--x'] } }).etapes[0].prog, 'C:\\outil.exe');
  for (const u of ['javascript:alert(1)', 'file:///C:/Windows', 'https://a.com/"&calc', 'https://a.com/ x']) assert.equal(urlSure(u), '', u);
  assert.ok(plan(S('ouvrir_site', 'https://x.com/a b')).erreur);
  assert.equal(plan(S('ouvrir_site', 'https://www.youtube.com')).etapes[0].args[1], 'https://www.youtube.com/');
  assert.ok(plan(S('volume', '500')).erreur); assert.ok(plan(S('volume', '20; calc')).erreur);
  assert.equal(plan(S('volume', '40')).etapes.length, 2);
  assert.deepEqual(plan(S('eteindre')).etapes[0].args.slice(0, 3), ['/s', '/t', '30']);
  assert.deepEqual(plan(S('annuler')).etapes[0].args, ['/a']);
});
t('relais PC : fichiers seulement dans les dossiers autorisés, jamais un programme', () => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-')), doc = path.join(r, 'Documents'), ext = path.join(r, 'Ailleurs');
  fs.mkdirSync(path.join(doc, 'BTS', 'Dossier E4'), { recursive: true }); fs.mkdirSync(ext);
  fs.writeFileSync(path.join(doc, 'BTS', 'cours anatomie.pdf'), 'x'); fs.writeFileSync(path.join(doc, 'virus.exe'), 'x'); fs.writeFileSync(path.join(ext, 'secret.txt'), 'x');
  const racines = [fs.realpathSync(doc)];
  assert.match(trouverFichier('cours anatomie', racines).chemin, /cours anatomie\.pdf$/);
  assert.equal(trouverFichier('dossier e4', racines).dossier, true);
  assert.equal(trouverFichier('secret', racines), null);
  assert.equal(trouverFichier('virus', racines).refuse, true);
  assert.ok(plan(S('ouvrir_fichier', 'virus'), {}, racines).erreur);
  assert.equal(plan(S('ouvrir_fichier', '..\\..\\Ailleurs\\secret'), {}, racines).erreur.startsWith('rien trouvé'), true);
  fs.rmSync(r, { recursive: true, force: true });
});

// Page : compréhension des phrases
const ctx = { console, window: {}, $: () => null, store: { get: () => '' }, KEY_WDEV: 'd', KEY_WDEVNOM: 'n' };
ctx.window = ctx; vm.createContext(ctx);
let api; ctx.__RAYLE_TEST_RELAIS__ = o => { api = o; };
vm.runInContext(fs.readFileSync(new URL('../js/rayle/relais.js', import.meta.url), 'utf8'), ctx);
const R = api.RayleRelais;
const C = q => { const x = R.cible(q); if (!x) return null; const a = R.classer(x.reste, x.genre, q); return a ? JSON.parse(JSON.stringify(Object.assign({ genre: x.genre }, a))) : null; };
t('page : phrases de la phase 3B', () => {
  assert.deepEqual(C('Raylé, ouvre XTB sur le PC'), { genre: 'pc', type: 'systeme', op: 'ouvrir_app', valeur: 'xtb' });
  assert.deepEqual(C('monte le son de la tablette'), { genre: 'tablette', type: 'systeme', op: 'volume', valeur: 'plus' });
  assert.deepEqual(C('allume la lampe du téléphone'), { genre: 'telephone', type: 'systeme', op: 'lampe', valeur: 'on' });
  assert.deepEqual(C('ouvre YouTube sur la tablette'), { genre: 'tablette', type: 'systeme', op: 'ouvrir_app', valeur: 'youtube' });
  assert.equal(C('ouvre YouTube sur le PC').op, 'ouvrir_site');
  assert.equal(C('regarde mon écran PC').op, 'capture');
  assert.equal(C('verrouille le PC').op, 'verrouiller');
  assert.equal(C('éteins le PC').op, 'eteindre');
  assert.equal(C('annule l’arrêt du PC').op, 'annuler');
  assert.equal(C('mets le volume du PC à 30 %').valeur, '30');
  assert.equal(C('chanson suivante sur le téléphone').valeur, 'suivant');
  assert.ok(C('allume la lampe du PC').erreur);
  for (const q of ['affiche l’or en H4 sur la tablette', 'lis-moi la météo sur le téléphone', 'mets en veille la tablette', 'quel est le meilleur téléphone ?', 'coupe la tablette']) assert.equal(C(q), null, q);
});
console.log(ok + ' groupes réussis');
