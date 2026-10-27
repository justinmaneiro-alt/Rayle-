import { creerPilote } from '../pc/agent-btc/pilote-coeur.js';
import { marcheM5 } from '../tests/synth-m5.mjs';
const [a, b, c] = (process.env.D || '0.3,0.15,2').split(',').map(Number);
const derive = h => (h >= 14 && h < 14 + c ? a : h >= 3 && h < 7 ? -(a * c / 4) : 0);
const regle = { nom: 'NY', cote: 'long', conditions: [{ type: 'session', valeurs: [2] }, { type: 'volume', min: 1 }, { type: 'delta', sens: 'avec', ratioMin: 0 }], stop: { type: 'atr', tf: 'h1', k: 1.5 }, R: 2 };
for (const [graine, t0] of [[9, Date.UTC(2019, 0, 1)], [21, Date.UTC(2019, 0, 4)], [5, Date.UTC(2018, 5, 9)], [77, Date.UTC(2020, 1, 2)], [31, Date.UTC(2019, 7, 23)]]) {
  const m = marcheM5({ n: 110700, graine, derive, t0 }), p = creerPilote();
  p.commande({ type: 'profil', patch: { cible: 1 } }); const id = p.commande({ type: 'idee_proposer', regle }).id; p.commande({ type: 'idee_valider', id });
  await p.tranche({ m15: m, budget: { chantiersMax: 1, tempsMs: 120000 } });
  const j = p.etat().recherche.journalCourt.slice(-2); console.log('graine', graine, j.map(x => x.decision + ' ' + (x.raison || '').slice(0, 150)).join(' // '));
}
