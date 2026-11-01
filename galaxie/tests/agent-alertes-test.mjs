// Alertes de nouvelle position : détection unique, deux formes de vue, démos ignorées, texte honnête.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const A = createRequire(import.meta.url)('../../core/commun/agent-alertes.js');
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); };
const p = (id, statut, extra = {}) => ({ id, statut, sens: 1, actif: 'BTC', tf: 'M15', entree: 77846, stop: 77386, cible: 78804, ...extra });
const vueT = { actives: [p('a', 'ouverte'), p('b', 'en_attente'), p('c', 'ouverte', { demo: true }), p('d', 'ouverte', { fantome: true }), p('e', 'cloturee')] };
ok(A.positionsVivantes(vueT).map(x => x.id).join() === 'a,b', 'démo, fantôme et terminées ignorés');
ok(A.nouvelles(vueT, ['a']).map(x => x.id).join() === 'b', 'une position déjà signalée ne re-sonne pas');
ok(A.nouvelles(vueT, new Set(['a', 'b'])).length === 0, 'rien de nouveau');
const vueV = { actifs: { SOL: { positions: [p('s1', 'ouverte', { actif: undefined, sens: -1 }), p('s2', 'terminee')] } } };
const nv = A.positionsVivantes(vueV); ok(nv.length === 1 && nv[0].actif === 'SOL', 'forme du tableau vivant, actif déduit');
const t = A.texte(nv[0]); ok(/VENTE SOL/.test(t.titre) && /SIMULATION/.test(t.corps) && /1:2,1/.test(A.texte(p('x', 'ouverte')).corps), 'texte : sens, simulation, ratio 1:2,1');
ok(A.positionsVivantes(null).length === 0 && A.positionsVivantes({}).length === 0, 'vue vide sans erreur');
console.log('agent-alertes : ' + n + ' vérifications OK');
