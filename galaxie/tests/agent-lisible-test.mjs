import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const K = createRequire(import.meta.url)('../../core/commun/agent-lisible-calcul.js');
let n = 0; const ok = (nom, f) => { f(); n++; console.log('ok  ' + nom); };
const T0 = Date.UTC(2026, 9, 30, 10, 0, 0), PAS = 900e3;
const pos = (id, o = {}) => ({ id, actif: 'BTC', sens: 1, statut: 'en_attente', entree: 100, stop: 98, cible1: 106, cible2: 110, rr: 3, rr2: 5, t: T0, tValide: T0 + 4 * 3600e3, nom: 'Setup', raison: 'raison', invalidation: 'inval', confiance: 'conf', confluences: ['a'], niveau: 'a_lessai', ...o });
const term = (id, R, o = {}) => pos(id, { statut: 'cloturee', resultat: { statut: 'cloturee', R, motif: 'cible' }, tSortie: T0 + 3600e3, ...o });

ok('état vide : aucun trade terminé', () => { const c = K.quatreChiffres(null); assert.equal(c.vide, true); assert.equal(c.n, 0); assert.match(K.htmlChiffres(c), /Pas encore de trade terminé/); });
ok('quatre chiffres < 20 trades : « échantillon trop petit pour juger »', () => {
  const c = K.quatreChiffres({ bilan: { tous: { stats: { n: 7, taux: 0.57, esperance: 0.18, total: 1.3 } } } });
  assert.deepEqual([c.n, c.taux, c.rMoyen, c.cumul, c.petit], [7, 0.57, 0.18, 1.3, true]); const h = K.htmlChiffres(c);
  assert.match(h, /trop petit pour juger/); assert.match(h, /57 %/); assert.match(h, /\+0,18/); assert.match(h, /\+1,3 R/);
});
ok('20 trades ou plus : plus de mention d’échantillon', () => { const c = K.quatreChiffres({ bilan: { tous: { stats: { n: 20, taux: 0.5, esperance: -0.1, total: -2 } } } }); assert.equal(c.petit, false); assert.doesNotMatch(K.htmlChiffres(c), /trop petit/); assert.match(K.htmlChiffres(c), /al-perte/); });
ok('3 positions au plus sur le graphique, les plus proches du prix', () => {
  const vue = { actives: [pos('a', { entree: 100 }), pos('b', { entree: 140 }), pos('c', { entree: 101 }), pos('d', { entree: 99.5 }), pos('e', { entree: 300 }), pos('f', { actif: 'SOL', entree: 100 })] };
  const r = K.positionsVisibles(vue, 'BTC', 100, 3); assert.equal(r.visibles.length, 3); assert.deepEqual(r.visibles.map(p => p.id), ['a', 'd', 'c']); assert.deepEqual(r.autres.map(p => p.id).sort(), ['b', 'e']);
  assert.equal(K.positionsVisibles(vue, 'SOL', 100).visibles.length, 1);
});
ok('les autres positions restent dans la liste (rien de perdu)', () => {
  const vue = { actives: [1, 2, 3, 4, 5].map(i => pos('p' + i, { entree: 100 + i })) }; const g = K.groupes(vue, 'BTC');
  assert.equal(g.attente.length, 5); assert.equal(K.positionsVisibles(vue, 'BTC', 100).visibles.length, 3);
});
ok('aucune fausse position : démo et fantômes ignorés', () => { const vue = { actives: [pos('d', { demo: true }), pos('f', { fantome: true })], recentes: [term('x', 1, { demo: true })] }; assert.equal(K.positionsActif(vue, 'BTC').length, 0); assert.equal(K.groupes(vue, 'BTC').terminees.length, 0); });
ok('état vide propre', () => { const h = K.htmlVide({ dernierCycle: T0 }, 'BTC'); assert.match(h, /Aucune position en attente\. Kepler surveille BTC \/ SOL \/ DOGE\./); assert.match(h, /Dernière analyse/); assert.doesNotMatch(h, /DÉMO/); });
ok('trois groupes : En attente / En cours / Terminées (replié)', () => {
  const vue = { actives: [pos('a'), pos('b', { statut: 'ouverte' })], recentes: [term('t1', 1.2), term('t2', -1)] }; const h = K.htmlListes(K.groupes(vue, 'BTC'));
  assert.match(h, /data-groupe="attente" open/); assert.match(h, /data-groupe="cours" open/); assert.doesNotMatch(h, /data-groupe="terminees" open/);
  assert.match(h, /✔ \+1,2 R/); assert.match(h, /✖ −1,0 R/);
});
ok('la ligne d’attente : sens, actif, entrée, stop, objectif, ratio, validité, bouton voir ; pas de phrase', () => {
  const h = K.htmlLigne(pos('a'), 'attente'); for (const x of ['ACHAT', 'BTC', '100', '98', '106', '1:3', 'valable jusqu’à', 'data-al-voir="a"']) assert.ok(h.includes(x), x);
  assert.match(h, /class="al-expl" hidden/);          // l’explication est fermée
  assert.match(h, /Ce qui l’invalide/);               // mais présente au clic
});
ok('étiquette courte', () => { assert.equal(K.etiquette(pos('a')), 'ACHAT en attente · 1:3'); assert.equal(K.etiquette(pos('a', { sens: -1, statut: 'ouverte', rr: 1.8 })), 'VENTE en cours · 1:1,8'); });
ok('étiquettes trop proches fusionnées en une seule', () => {
  const r = K.fusionnerEtiquettes([{ y: 100, texte: 'A' }, { y: 108, texte: 'B' }, { y: 200, texte: 'C' }], 18); assert.equal(r.length, 2); assert.equal(r[0].texte, 'A / B'); assert.equal(r[0].fusion, true); assert.equal(r[0].y, 104); assert.equal(r[1].texte, 'C');
  assert.equal(K.fusionnerEtiquettes([{ y: 10, texte: 'A' }, { y: 40, texte: 'B' }], 18).length, 2);
});
ok('marqueurs des positions terminées : ✔ vert / ✖ rouge, une par bougie', () => {
  const vue = { recentes: [term('a', 1.5), term('b', -1, { tSortie: T0 + 2 * PAS }), term('c', 2, { actif: 'SOL' }), pos('enc')] }; const m = K.marqueursTermines(vue, 'BTC');
  assert.equal(m.length, 2); assert.deepEqual(m.map(x => x.gain), [false, true]); assert.ok(m.find(x => x.gain).texte.startsWith('✔')); assert.ok(m.find(x => !x.gain).texte.startsWith('✖'));
});
ok('courbe de performance alignée sur les bougies (une valeur par bougie, 0 avant le premier trade)', () => {
  const bougies = [0, 1, 2, 3, 4].map(i => ({ time: (T0 + i * PAS) / 1000 })); const vue = { courbe: [[T0 + 2 * PAS + 5000, 1.5], [T0 + 4 * PAS, 0.5]] };
  const c = K.courbeAlignee(vue, bougies); assert.equal(c.length, 5); assert.deepEqual(c.map(p => p.value), [0, 0, 1.5, 1.5, 0.5]); assert.deepEqual(c.map(p => p.time), bougies.map(b => b.time));
  assert.deepEqual(K.courbeAlignee({}, bougies).map(p => p.value), [0, 0, 0, 0, 0]);
});
ok('barre d’état : service en marche / arrêté depuis, dernière bougie, trois actifs, « simulation, aucun ordre réel »', () => {
  const vue = { donnees: { BTC: { derniereBougie: T0 } } };
  let h = K.htmlBarreEtat({ service: { enMarche: true }, vue, actif: 'SOL', comptes: { BTC: 2, SOL: 0, DOGE: 0 } });
  assert.match(h, /Service en marche/); assert.match(h, /Dernière bougie : indisponible/); assert.match(h, /data-al-actif="SOL" aria-selected="true"/); assert.match(h, /simulation, aucun ordre réel/); assert.equal((h.match(/data-al-actif=/g) || []).length, 3); assert.match(h, /al-n">2</);
  h = K.htmlBarreEtat({ service: { enMarche: false, arretDepuis: 3 * 3600e3 }, vue, actif: 'BTC' }); assert.match(h, /Service arrêté depuis 3 h/); assert.match(h, /Dernière bougie \d\d:\d\d/);
  assert.match(K.htmlBarreEtat({ service: null, vue: null, actif: 'BTC' }), /état inconnu/);
});
ok('« Détails » contient tout ce qui a été rangé', () => { const ids = K.DETAILS.map(d => d.id); for (const x of ['agent', 'details', 'positions', 'bilan', 'pourquoi', 'liquidite', 'equipe', 'occasions', 'donnees']) assert.ok(ids.includes(x), x); });
ok('texte échappé', () => { assert.doesNotMatch(K.htmlLigne(pos('<x>', { raison: '<script>' }), 'attente'), /<script>/); });
console.log(n + ' vérifications');
