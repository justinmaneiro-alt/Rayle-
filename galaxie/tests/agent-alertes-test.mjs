// Alertes de position : nouvelle, ordre devenu position, première lecture (fraîcheur), démos ignorées, texte honnête.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const A = createRequire(import.meta.url)('../../core/commun/agent-alertes.js');
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); };
const NOW = 1_800_000_000_000, p = (id, statut, extra = {}) => ({ id, statut, sens: 1, actif: 'BTC', tf: 'M15', entree: 77846, stop: 77386, cible: 78804, tSignal: NOW - 60e3, ...extra });
const vue = { actives: [p('a', 'ouverte'), p('b', 'en_attente'), p('c', 'ouverte', { demo: true }), p('d', 'ouverte', { fantome: true }), p('e', 'cloturee')] };
ok(A.positionsVivantes(vue).map(x => x.id).join() === 'a,b', 'démo, fantôme et terminées ignorées');
let r = A.evenements(vue, { a: 'ouverte' }, { maintenant: NOW }); ok(r.alertes.length === 1 && r.alertes[0].p.id === 'b' && r.alertes[0].type === 'nouvelle', 'seule la position jamais vue alerte');
ok(r.suivant.a === 'ouverte' && r.suivant.b === 'en_attente', 'mémoire mise à jour');
ok(A.evenements(vue, r.suivant, { maintenant: NOW }).alertes.length === 0, 'rien de nouveau : silence');
const apres = { actives: [p('a', 'ouverte'), p('b', 'ouverte')] };
r = A.evenements(apres, { a: 'ouverte', b: 'en_attente' }, { maintenant: NOW }); ok(r.alertes.length === 1 && r.alertes[0].type === 'ouverte' && r.alertes[0].p.id === 'b', 'ordre limite touché → alerte « ouverte »');
ok(A.evenements(vue, null, { maintenant: NOW, premiere: true }).alertes.length === 2, 'première lecture : une position toute récente est signalée (on ne rate pas ce qui vient d’arriver)');
const vieille = { actives: [p('v', 'ouverte', { tSignal: NOW - 5 * 3600e3 })] };
ok(A.evenements(vieille, null, { maintenant: NOW, premiere: true }).alertes.length === 0 && A.evenements(vieille, null, { maintenant: NOW, premiere: true }).suivant.v === 'ouverte', 'première lecture : une vieille position est mémorisée sans sonner');
const vueV = { actifs: { SOL: { positions: [p('s1', 'ouverte', { actif: undefined, sens: -1 }), p('s2', 'terminee')] } } };
const nv = A.positionsVivantes(vueV); ok(nv.length === 1 && nv[0].actif === 'SOL', 'forme du tableau vivant, actif déduit');
const t = A.texte(nv[0]); ok(/VENTE SOL/.test(t.titre) && /SIMULATION/.test(t.corps), 'texte : sens, simulation');
ok(/Position ouverte/.test(A.texte(p('x', 'ouverte'), 'ouverte').titre) && /1:2,1/.test(A.texte(p('x', 'ouverte')).corps), 'texte « ouverte », ratio 1:2,1');
ok(A.positionsVivantes(null).length === 0 && A.positionsVivantes({}).length === 0, 'vue vide sans erreur');
console.log('agent-alertes : ' + n + ' vérifications OK');

/* ── taille simulée, levier, texte détaillé (action, entrée, taille, TP, SL, levier) ── */
{
  let k = 0; const okk = (c, m) => { k++; assert.ok(c, m); };
  const pos = { actif: 'BTC', tf: 'M15', sens: 1, statut: 'en_attente', entree: 100, stop: 99, cible1: 102 };
  const ts = A.tailleSimulee(pos, { capital: 10000, risquePct: 1 });
  okk(Math.abs(ts.risqueUsd - 100) < 1e-9 && Math.abs(ts.notionnel - 10000) < 1e-6 && Math.abs(ts.levier - 1) < 1e-9, 'risque 100 $ sur 1 % de distance = 10 000 $, levier 1×');
  okk(Math.abs(A.tailleSimulee({ ...pos, stop: 99.5 }, { capital: 10000, risquePct: 1 }).levier - 2) < 1e-9, 'stop deux fois plus serré : levier 2×');
  okk(A.tailleSimulee({ ...pos, stop: 100 }) === null, 'entrée = stop : pas de taille inventée');
  okk(A.tailleSimulee(pos, { capital: -5, risquePct: 0 }).capital === 10000, 'réglages invalides : défaut');
  const t = A.texte(pos, 'nouvelle', { capital: 10000, risquePct: 1 });
  okk(/Action Achat/.test(t.corps) && /entrée 100/.test(t.corps) && /taille 10.000 \$/.test(t.corps) && /TP 102/.test(t.corps) && /SL 99/.test(t.corps) && /levier 1,0×/.test(t.corps) && /SIMULATION/.test(t.corps), 'texte complet : ' + t.corps);
  okk(/Action Vente/.test(A.texte({ ...pos, sens: -1, stop: 101, cible1: 98 }).corps) && /^TEST/.test(A.texte(pos, 'test').titre), 'vente et titre TEST');
  console.log('agent-alertes (taille) : ' + k + ' vérifications OK');
}
