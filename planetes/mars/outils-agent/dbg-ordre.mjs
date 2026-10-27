import { creerPilote } from '../pc/agent-btc/pilote-coeur.js';
import { marcheM5, DERIVE_PLANTEE } from '../tests/synth-m5.mjs';
const m = marcheM5({ n: 110000, graine: 9, derive: DERIVE_PLANTEE });
const p = creerPilote();
const regle = { nom: 'New York + volume + delta', cote: 'long', conditions: [{ type: 'session', valeurs: [2] }, { type: 'volume', min: 1 }, { type: 'delta', sens: 'avec', ratioMin: 0 }], stop: { type: 'atr', tf: 'h1', k: 1.5 }, R: 2 };
p.commande({ type: 'profil', patch: { cible: 1 } }); const id = p.commande({ type: 'idee_proposer', regle }).id; p.commande({ type: 'idee_valider', id });
await p.tranche({ m15: m, budget: { chantiersMax: 3, tempsMs: 120000 } });
for (const j of p.etat().recherche.journalCourt) console.log(j.chantier, '|', j.decision, '|', (j.raison || '').slice(0, 330));
console.log(p.bibliotheque.liste().map(s => s.nom + ' ' + s.statut));
