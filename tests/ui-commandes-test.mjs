// Commandes vocales d'apparence (ui/settings.js) : « thème Aurore », « fond globe », « mode éco ».   node tests/ui-commandes-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const norm = t => String(t || '').normalize('NFC').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cmdNorm = n => String(n || '').replace(/[?!.,;:…«»"]/g, ' ').replace(/(?:^|\s)(?:(?:hey|he|eh|ok|okay|dis)\s+)?rayle(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
const ctx = { console, performance };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['../ui/themes.js', '../ui/settings.js']) vm.runInContext(fs.readFileSync(new URL(f, import.meta.url), 'utf8'), ctx);
const analyser = txt => { const r = ctx.RayleUI.analyserCommande(cmdNorm(norm(txt))); return r ? r.type + ':' + r.valeur : null; };

let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };

t('thèmes', () => {
  assert.equal(analyser('Raylé, passe en thème Aurore'), 'theme:aurore');
  assert.equal(analyser('mets le thème Arc Reactor'), 'theme:arc');
  assert.equal(analyser('thème arc réacteur'), 'theme:arc');
  assert.equal(analyser('Passe en thème Mark Rouge.'), 'theme:rouge');
  assert.equal(analyser('thème ambre solaire'), 'theme:ambre');
  assert.equal(analyser('active le thème nébuleuse'), 'theme:nebuleuse');
  assert.equal(analyser('remets le thème Raylé originel'), 'theme:originel');
  assert.equal(analyser('passe en Aurore'), 'theme:aurore');
  assert.equal(analyser('change de thème'), 'theme:+');
  assert.equal(analyser('thème suivant'), 'theme:+');
});
t('fonds', () => {
  assert.equal(analyser('Raylé, fond globe'), 'fond:globe');
  assert.equal(analyser('mets le fond en ville'), 'fond:ville');
  assert.equal(analyser("passe sur l'arrière-plan globe"), null);   // trop tordu : pas reconnu, c'est voulu (passe à l'IA)
  assert.equal(analyser('fond ville'), 'fond:ville');
  assert.equal(analyser('enlève le fond'), 'fond:aucun');
  assert.equal(analyser('pas de fond'), 'fond:aucun');
  assert.equal(analyser('fond noir'), 'fond:aucun');
});
t('niveau d’animation', () => {
  assert.equal(analyser('Raylé, mode éco'), 'anim:eco');
  assert.equal(analyser('passe en mode économie'), 'anim:eco');
  assert.equal(analyser('mode max'), 'anim:max');
  assert.equal(analyser('animations au maximum'), 'anim:max');
  assert.equal(analyser('mets le mode automatique'), 'anim:auto');
});
t('entité', () => {
  assert.equal(analyser('Raylé, entité neurones'), 'entite:neurones');
  assert.equal(analyser('entité sphère'), 'entite:sphere');
  assert.equal(analyser('passe en entité cerveau'), 'entite:neurones');
  assert.equal(analyser('mets l’entité en réseau de neurones'), 'entite:neurones');
  assert.equal(analyser('remets l’entité particules'), 'entite:sphere');
  assert.equal(analyser('passe en mode neurones'), 'entite:neurones');
});
t('ne vole pas les autres commandes ni les questions', () => {
  for (const q of ['quel thème tu préfères ?', 'au fond, combien vaut le bitcoin ?', 'mets le graphique en rouge', 'mets les couleurs du graphique en rouge',
    'passe sur le Bitcoin', 'ouvre le terminal', 'mode graphique', 'ferme tout', 'explique-moi la ville de Lyon', 'quel est le prix de l’or',
    'rouge', 'la ville de Paris', 'le globe terrestre fait combien de kilomètres', 'combien de neurones dans le cerveau', 'neurones', 'cerveau',
    'explique-moi les réseaux de neurones', 'c’est quoi une sphère'])
    assert.equal(analyser(q), null, q);
});
console.log(ok + ' groupe(s) réussi(s)');
