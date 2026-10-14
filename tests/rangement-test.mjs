// Ranger Raylé (js/rayle/rangement.js) et commandes vocales associées (js/rayle/commandes-univers.js), DOM simulé :   node tests/rangement-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const classes = new Set(), stockage = {}, evts = [], gestes = {};
const style = {}; const attrs = {};
const reactor = {
  style: { setProperty() {}, removeProperty(k) { delete style[k]; }, set left(v) { style.left = v; }, get left() { return style.left; }, set top(v) { style.top = v; }, get top() { return style.top; }, set right(v) { style.right = v; }, set bottom(v) { style.bottom = v; } },
  setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: k => { delete attrs[k]; }, setPointerCapture() {}, releasePointerCapture() {},
  getBoundingClientRect: () => ({ left: 900, top: 100 }), title: '',
  addEventListener(n, f, cap) { (gestes[n] = gestes[n] || []).push(f); },
};
const btnListeners = [];
const bouton = { setAttribute() {}, addEventListener: (n, f) => btnListeners.push(f) };
const docListeners = {};
const ctx = {
  console, localStorage: { getItem: k => (k in stockage ? stockage[k] : null), setItem: (k, v) => { stockage[k] = String(v); } },
  innerWidth: 1000, innerHeight: 800, location: { search: '' },
  addEventListener() {},
  RayleBus: { emit: (n, d) => evts.push([n, d]), fusion() {}, fournir() {}, on() {} },
  document: {
    body: { classList: { toggle: (c, v) => (v ? classes.add(c) : classes.delete(c)) } },
    getElementById: id => id === 'reactor' ? reactor : id === 'btnRanger' ? bouton : null,
    addEventListener: (n, f) => { (docListeners[n] = docListeners[n] || []).push(f); },
  },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../js/rayle/rangement.js', import.meta.url), 'utf8'), ctx);
const R = ctx.RayleRangement;
let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };
const tire = (n, e) => (gestes[n] || []).forEach(f => f(e));
const evt = (o = {}) => Object.assign({ pointerId: 1, pointerType: 'touch', button: 0, clientX: 950, clientY: 140, stopImmediatePropagation() { this.stoppe = true; }, preventDefault() {} }, o);

t('au départ Raylé est ouverte', () => { assert.equal(R.estRange(), false); assert.equal(classes.has('rayle-rangee'), false); });
t('ranger : classe, position par défaut, bus', () => {
  R.ranger(); assert.equal(R.estRange(), true); assert.ok(classes.has('rayle-rangee'));
  assert.match(style.left, /px$/); assert.match(style.top, /px$/);
  assert.ok(evts.some(([n, d]) => n === 'rayle:rangee' && d.actif === true));
});
t('la bulle reste entièrement dans l’écran', () => { const x = parseInt(style.left), y = parseInt(style.top); assert.ok(x >= 0 && x + 76 <= 1000); assert.ok(y >= 0 && y + 76 <= 800); });
t('un simple toucher rouvre (et n’actionne pas le micro)', () => {
  const e = evt(); tire('pointerdown', e); tire('pointerup', e); tire('click', e);
  assert.equal(R.estRange(), false); assert.equal(classes.has('rayle-rangee'), false); assert.ok(e.stoppe);
});
t('glisser déplace la bulle, la mémorise et ne rouvre pas', () => {
  R.ranger();
  tire('pointerdown', evt({ clientX: 950, clientY: 140 }));
  tire('pointermove', evt({ clientX: 120, clientY: 600 }));
  tire('pointerup', evt({ clientX: 120, clientY: 600 }));
  tire('click', evt());
  assert.equal(R.estRange(), true, 'ne doit pas se rouvrir après un glissement');
  const p = JSON.parse(stockage.rayle_bulle_pos);
  assert.equal(p.fx, 0, 's’accroche au bord gauche'); assert.ok(p.fy > .6 && p.fy < .9);
  assert.equal(parseInt(style.left), 10);
});
t('la position est retrouvée au prochain rangement', () => { R.rouvrir(); R.ranger(); assert.equal(R.position().fx, 0); assert.equal(parseInt(style.left), 10); });
t('rouvrir retire les styles de position', () => { R.rouvrir(); assert.equal(style.left, undefined); });
t('Échap rouvre', () => { R.ranger(); docListeners.keydown.forEach(f => f({ key: 'Escape' })); assert.equal(R.estRange(), false); });
t('le bouton « Ranger » range', () => { btnListeners.forEach(f => f()); assert.equal(R.estRange(), true); R.rouvrir(); });
t('un petit clic de souris qui bouge à peine rouvre quand même', () => {
  R.ranger(); tire('pointerdown', evt({ pointerType: 'mouse', clientX: 950, clientY: 140 })); tire('pointermove', evt({ pointerType: 'mouse', clientX: 952, clientY: 141 })); tire('pointerup', evt({ pointerType: 'mouse' })); tire('click', evt({ pointerType: 'mouse' }));
  assert.equal(R.estRange(), false);
});
t('écran qui tourne : la bulle reste visible', () => {
  R.ranger(); tire('pointerdown', evt()); tire('pointermove', evt({ clientX: 960, clientY: 700 })); tire('pointerup', evt());
  ctx.innerWidth = 500; ctx.innerHeight = 300; R.rouvrir(); R.ranger();
  const x = parseInt(style.left), y = parseInt(style.top); assert.ok(x + 76 <= 500 && y + 76 <= 300, x + ',' + y);
  ctx.innerWidth = 1000; ctx.innerHeight = 800; R.rouvrir();
});

// commandes vocales
const ctx2 = { console, document: { addEventListener() {}, getElementById: () => null, baseURI: 'http://x/' }, RayleBus: { on() {}, emit() {} }, RayleRangement: R, commandeLocalisation: () => null };
ctx2.window = ctx2;
vm.createContext(ctx2);
vm.runInContext(fs.readFileSync(new URL('../js/rayle/commandes-univers.js', import.meta.url), 'utf8') + '\nglobalThis.__a=analyserUnivers; globalThis.__c=commandeUnivers;', ctx2);
const A = ctx2.__a, C = ctx2.__c;
t('analyse : réduis-toi / range-toi / mets-toi en bulle', () => {
  for (const p of ['réduis-toi', 'Raylé, réduis-toi', 'range-toi', 'range toi stp', 'mets-toi en bulle', 'fais-toi petite', 'cache-toi', 'Ranger']) assert.deepEqual(JSON.parse(JSON.stringify(A(p))), { type: 'rangement', action: 'ranger' }, p);
});
t('analyse : rouvre-toi / reviens / sors', () => { for (const p of ['rouvre-toi', 'reviens', 'Raylé reviens', 'réapparais']) assert.deepEqual(JSON.parse(JSON.stringify(A(p))), { type: 'rangement', action: 'rouvrir' }, p); });
t('analyse : phrases voisines ignorées', () => { for (const p of ['range mes documents', 'réduis le volume', 'quelle heure est-il', 'reviens demain']) assert.equal(A(p), null, p); });
t('voix : ranger puis rouvrir', async () => {
  assert.match(await C('réduis-toi'), /écoute/); assert.equal(R.estRange(), true);
  assert.match(await C('réduis-toi'), /déjà rangée/);
  assert.equal(await C('rouvre-toi'), 'Me revoici.'); assert.equal(R.estRange(), false);
  assert.equal(await C('reviens'), null, 'reviens seul, Raylé ouverte : laissé aux autres commandes');
});
t('univers : « reviens sur la Terre » appartient au fond Espace tant que l’Univers est fermé', async () => {
  ctx2.RayleUnivers = { estOuvert: () => false }; assert.equal(await C('reviens sur la Terre'), null);
});
console.log(ok + ' tests réussis');
