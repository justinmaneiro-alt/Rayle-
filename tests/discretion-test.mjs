// Rayle se fait discrète (js/rayle/discretion.js) avec un DOM simulé :   node tests/discretion-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const classes = new Set(), rc = new Set(['reactor', 'idle']);
let espace = {}, panneaux = 0, quick = false, maintenant = 1e6;
const ctx = {
  console, setInterval: () => 0, MutationObserver: class { observe() {} },
  Date: { now: () => maintenant },
  RayleBus: { etat: n => (n === 'espace' ? espace : null), on() {}, emit() {} },
  document: {
    body: { classList: { toggle: (c, v) => (v ? classes.add(c) : classes.delete(c)) } },
    getElementById: id => id === 'reactor' ? { classList: { contains: c => rc.has(c) } } : id === 'anQuick' && quick ? { hidden: false, classList: { contains: () => false } } : null,
    querySelector: () => (panneaux ? {} : null),
  },
};
vm.createContext(ctx);
const code = fs.readFileSync(new URL('../js/rayle/discretion.js', import.meta.url), 'utf8').replace('setInterval(maj,250);', 'globalThis.__maj=maj;');
vm.runInContext(code, ctx);
const maj = () => ctx.__maj();
const discrete = () => classes.has('rayle-discrete');
let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };

t('rien d’affiché : entité normale', () => { maj(); assert.equal(discrete(), false); });
t('planète affichée pendant qu’elle parle : discrète', () => { espace = { focusedTarget: 'mars', savedHomeLocation: null }; rc.delete('idle'); rc.add('speaking'); maj(); assert.equal(discrete(), true); });
t('réponse finie : elle revient après le délai', () => { rc.delete('speaking'); rc.add('idle'); maintenant += 2000; maj(); assert.equal(discrete(), true); maintenant += 2000; maj(); assert.equal(discrete(), false); });
t('planète quittée pendant qu’elle parle : elle revient', () => { rc.delete('idle'); rc.add('speaking'); maj(); espace = { focusedTarget: null }; maj(); assert.equal(discrete(), false); });
t('astre d’accueil : pas de masquage', () => { espace = { focusedTarget: 'lune', savedHomeLocation: 'lune' }; maj(); assert.equal(discrete(), false); });
t('modèle 3D rapide ouvert', () => { espace = {}; quick = true; maj(); assert.equal(discrete(), true); quick = false; rc.delete('speaking'); maintenant += 6000; maj(); assert.equal(discrete(), false); });
t('panneau ouvert en réflexion', () => { panneaux = 1; rc.add('thinking'); maj(); assert.equal(discrete(), true); panneaux = 0; maj(); assert.equal(discrete(), false); });
console.log(ok + ' tests réussis');
