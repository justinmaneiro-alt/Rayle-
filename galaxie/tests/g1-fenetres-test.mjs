import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const F = createRequire(import.meta.url)('../../core/commun/g1-fenetres-calcul.js');
let n = 0; const ok = (nom, f) => { f(); n++; console.log('OK  ' + nom); };

ok('neuf contenus, identifiants valides', () => { assert.equal(F.ONGLETS.length, 9); assert.ok(F.idValide('meteo') && F.idValide('sante') && !F.idValide('xx')); });
ok('voix : ouvrir la fenêtre météo / marché / actualités', () => {
  assert.deepEqual(F.reconnaitre('ouvre la fenêtre météo'), { action: 'ouvrir', id: 'meteo' });
  assert.deepEqual(F.reconnaitre('Raylé, montre-moi la fenêtre du marché'), { action: 'ouvrir', id: 'marche' });
  assert.deepEqual(F.reconnaitre('affiche la fenêtre des actualités'), { action: 'ouvrir', id: 'actus' });
  assert.deepEqual(F.reconnaitre('ouvre la fenêtre systèmes'), { action: 'ouvrir', id: 'systemes' });
});
ok('voix : tâches, santé, messages sans dire « fenêtre »', () => {
  assert.deepEqual(F.reconnaitre('montre-moi mes tâches'), { action: 'ouvrir', id: 'afaire' });
  assert.deepEqual(F.reconnaitre('ouvre ma santé'), { action: 'ouvrir', id: 'sante' });
  assert.deepEqual(F.reconnaitre('affiche mes messages'), { action: 'ouvrir', id: 'messages' });
});
ok('voix : ne vole pas les commandes existantes', () => {
  assert.equal(F.reconnaitre('montre-moi la météo'), null); assert.equal(F.reconnaitre('ouvre le marché'), null); assert.equal(F.reconnaitre('quel temps fait-il'), null);
  assert.equal(F.reconnaitre('montre-moi les actualités'), null); assert.equal(F.reconnaitre(''), null);
});
ok('voix : fermer la fenêtre', () => { assert.deepEqual(F.reconnaitre('ferme la fenêtre'), { action: 'fermer' }); assert.deepEqual(F.reconnaitre('retour au noyau'), { action: 'fermer' }); });
ok('tâches : compteurs ouvertes / en retard / aujourd’hui', () => {
  const maintenant = new Date(2026, 9, 24, 12).getTime();
  const t = F.normaliserTaches([{ id: 'a', texte: 'Rapport', fait: false, date: '2026-10-23' }, { id: 'b', texte: 'Courses', date: '2026-10-24' }, { id: 'c', texte: 'Cours', fait: true, date: '2026-10-20' }, { id: 'd', texte: 'Sans date' }, { texte: '  ' }, null]);
  assert.equal(t.length, 4); assert.deepEqual(F.compteurs(t, maintenant), { ouvertes: 3, retard: 1, aujourdhui: 1, faites: 1 });
  assert.deepEqual(F.trier(t, maintenant).map(x => x.id), ['a', 'b', 'd', 'c']);
});
ok('tâches : ajouter, cocher, supprimer ; texte vide refusé ; vide reste vide', () => {
  let t = F.ajouter([], 'Appeler le labo', '2026-10-25', 'x1'); assert.equal(t.length, 1); assert.equal(F.ajouter(t, '   ').length, 1);
  t = F.basculer(t, 'x1'); assert.equal(t[0].fait, true); assert.equal(F.supprimer(t, 'x1').length, 0); assert.deepEqual(F.compteurs([]), { ouvertes: 0, retard: 0, aujourdhui: 0, faites: 0 });
  assert.deepEqual(F.normaliserTaches('n’importe quoi'), []);
});
ok('éclats : déterministes, angulaires, trois anneaux', () => {
  const a = F.eclats(18, 7), b = F.eclats(18, 7); assert.deepEqual(a, b); assert.equal(a.length, 18);
  assert.ok(a.every(e => e.pts.length >= 3 && e.pts.length <= 4 && e.opacite > 0 && e.opacite <= 1)); assert.deepEqual([...new Set(a.map(e => e.anneau))].sort(), [0, 1, 2]);
});
ok('journal : borné, sans doublon consécutif', () => {
  let j = []; j = F.ajouterJournal(j, { texte: 'a', type: 'x', t: 1 }); j = F.ajouterJournal(j, { texte: 'a', type: 'x', t: 2 }); assert.equal(j.length, 1);
  for (let i = 0; i < 60; i++) j = F.ajouterJournal(j, { texte: 'e' + i }); assert.equal(j.length, 40); assert.equal(F.ajouterJournal(j, { texte: '  ' }).length, 40);
});
console.log('\n' + n + ' tests réussis');
