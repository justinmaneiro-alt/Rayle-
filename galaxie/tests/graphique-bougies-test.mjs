import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const G = createRequire(import.meta.url)('../../core/commun/graphique-bougies-calcul.js');
let n = 0; const ok = (nom, f) => { f(); n++; console.log('OK  ' + nom); };

ok('rotation : parcourt les 5 instruments en H1 puis change d’unité', () => {
  assert.deepEqual(G.paire(0), { instrument: 'BTC', unite: 'H1' });
  assert.deepEqual(G.paire(4), { instrument: 'US100', unite: 'H1' });
  assert.deepEqual(G.paire(5), { instrument: 'BTC', unite: 'M15' });
  assert.deepEqual(G.paire(10), { instrument: 'BTC', unite: 'H4' });
  assert.deepEqual(G.paire(15), { instrument: 'BTC', unite: 'D1' });
  assert.deepEqual(G.paire(20), { instrument: 'BTC', unite: 'H1' });
});
ok('indexDe est l’inverse de paire', () => { for (let i = 0; i < 20; i++) { const p = G.paire(i); assert.equal(G.indexDe(p.instrument, p.unite), i); } assert.equal(G.indexDe('XXX', 'H1'), -1); });
ok('intervalle borné, 20 s par défaut', () => { assert.equal(G.intervalleValide(undefined), 20); assert.equal(G.intervalleValide('abc'), 20); assert.equal(G.intervalleValide(1), 5); assert.equal(G.intervalleValide(9999), 300); assert.equal(G.intervalleValide(30), 30); });
ok('étiquettes : jamais « RÉEL » sans données', () => {
  assert.equal(G.etiquette(null).etat, 'indispo'); assert.equal(G.etiquette({ bougies: [] }).etat, 'indispo');
  const b = [{ t: 1, o: 1, h: 2, l: 1, c: 2, v: 0 }];
  assert.equal(G.etiquette({ bougies: b, meta: {} }).texte, 'RÉEL'); assert.equal(G.etiquette({ bougies: b, meta: { differe: true } }).texte, 'DIFFÉRÉ');
  assert.equal(G.etiquette({ bougies: b, meta: { secours: true } }).texte, 'SECOURS'); assert.equal(G.etiquette({ bougies: b, meta: {}, erreur: 'x' }).texte, 'PÉRIMÉ');
});
ok('données du graphique : secondes, dernières bougies, volume discret', () => {
  const b = Array.from({ length: 200 }, (_, i) => ({ t: 1e12 + i * 3600e3, o: 10, h: 12, l: 9, c: i % 2 ? 11 : 9, v: 5 }));
  const d = G.donneesGraphique(b, 'H1'); assert.equal(d.bougies.length, 96); assert.equal(d.bougies[0].time, Math.floor(b[104].t / 1000)); assert.ok(d.avecVolume);
  assert.equal(G.donneesGraphique(b.map(x => ({ ...x, v: 0 })), 'H1').avecVolume, false);
});
ok('variation et prix', () => { assert.equal(G.variation(1.234).texte, '+1,23 %'); assert.equal(G.variation(-0.5).sens, 'baisse'); assert.equal(G.variation(null).texte, '—'); assert.match(G.prix(67890.4, 1), /67.890,4/); });
ok('échelle plancher : l’or très calme ne zigzague plus', () => {
  const calme = [2650.1, 2650.4, 2650.2, 2650.5, 2650.3, 2650.6]; const e = G.echelle(calme);
  assert.ok(e.max - e.min >= 2650 * 0.005 - 1e-6);
  const c = G.courbe(calme, 100, 20); const ys = c.d.match(/ ([\d.]+)/g).map(s => +s); assert.ok(Math.max(...ys) - Math.min(...ys) < 6, 'amplitude verticale réduite');
  const fort = [100, 110, 90, 120]; assert.ok(G.echelle(fort).max === 120 && G.echelle(fort).min === 90);
  assert.equal(G.courbe([1], 10, 10), null);
});
console.log('\n' + n + ' tests réussis');
