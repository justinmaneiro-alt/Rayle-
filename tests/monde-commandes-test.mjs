// Commandes vocales de la page Monde (js/rayle/commandes-monde.js) :   node tests/monde-commandes-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ctx = { console, RayleBus: { fournir() {}, demander() {} } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../js/rayle/pays-donnees.js', import.meta.url), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(new URL('../js/rayle/commandes-monde.js', import.meta.url), 'utf8') + '\nthis.analyser=RayleMonde.analyser;', ctx);
const A = t => { const r = ctx.analyser(t); return r ? JSON.stringify(r) : null; };
let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };

t('ouvrir et changer de vue', () => {
  assert.equal(A('Raylé, ouvre la carte du monde'), '{"type":"ouvrir"}');
  assert.equal(A('la carte du monde'), '{"type":"ouvrir"}');
  assert.equal(A('carte TradingView'), '{"type":"vue","valeur":"tv"}');
  assert.equal(A('passe sur la carte économique'), '{"type":"vue","valeur":"tv"}');
  assert.equal(A('vue Terre'), '{"type":"vue","valeur":"terre"}');
});
t('pays et régions', () => {
  assert.equal(A('montre-moi le Japon'), '{"type":"lieu","a2":"JP"}');
  assert.equal(A('Raylé, montre-moi les États-Unis'), '{"type":"lieu","a2":"US"}');
  assert.equal(A('zoom sur l’Europe'), '{"type":"lieu","region":"europe"}');
  assert.equal(A('va en Chine'), '{"type":"lieu","a2":"CN"}');
  assert.equal(A('affiche le Brésil sur la carte'), '{"type":"lieu","a2":"BR"}');
  assert.equal(A('montre-moi le Moyen-Orient'), '{"type":"lieu","region":"moyenorient"}');
  assert.equal(A('ouvre la fiche de l’Allemagne'), '{"type":"lieu","a2":"DE"}');
});
t('questions', () => {
  assert.equal(A('Qu’est-ce qui se passe en Chine ?'), '{"type":"question","a2":"CN"}');
  assert.equal(A('quoi de neuf au Japon'), '{"type":"question","a2":"JP"}');
  assert.equal(A('que se passe-t-il en Iran en ce moment'), '{"type":"question","a2":"IR"}');
  assert.equal(A('qu’est-ce qui se passe en Europe'), '{"type":"question","region":"europe"}');
});
t('indicateurs et couches', () => {
  assert.equal(A('affiche l’inflation sur la carte'), '{"type":"indicateur","valeur":"inflation"}');
  assert.equal(A('montre le chômage dans le monde'), '{"type":"indicateur","valeur":"chomage"}');
  assert.equal(A('affiche les taux directeurs sur la carte'), '{"type":"indicateur","valeur":"taux"}');
  assert.equal(A('carte de l’inflation'), '{"type":"indicateur","valeur":"inflation"}');
  assert.equal(A('masque les actualités'), '{"type":"couche","nom":"actus","oui":false}');
  assert.equal(A('affiche les places boursières sur la carte'), '{"type":"couche","nom":"places","oui":true}');
});
t('ne vole pas les autres commandes', () => {
  for (const q of ['montre-moi Toulouse', 'itinéraire vers Lyon', 'montre-moi les actus', 'affiche le Bitcoin', 'passe sur l’or', 'quelle est l’inflation aux États-Unis ?',
    'ouvre le terminal', 'fond globe', 'affiche le dashboard', 'montre-moi le graphique', 'qu’est-ce qui se passe sur le Nasdaq', 'va sur le Bitcoin', 'carte de Paris'])
    assert.equal(A(q), null, q);
});
console.log(ok + ' groupes réussis');
