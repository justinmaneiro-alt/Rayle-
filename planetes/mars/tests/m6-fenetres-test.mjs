import { creerM6 } from '../pc/agent-m6/m6-etat.js';
import { construireReels } from '../pc/trading/fenetres-m6.js';
import { FENETRES as EXEMPLES } from '../pc/exemples.js';

/* Les six fenêtres de performance de l'agent sur la table de Mars : chaque fenêtre dit ce qu'elle est (RÉEL / SIMULÉ / BACKTEST / ESTIMÉ),
   dit « en préparation » plutôt que d'inventer un chiffre, et ne montre jamais NaN ni undefined. */
let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const NOW = Date.UTC(2026, 9, 23, 14), H = 3600e3;
const ID6 = ['gardien-prop', 'journal-tilt', 'propositions-agent', 'perf-strategies', 'regime-marche', 'proba-evaluation'];
const m6 = creerM6({ etat: null, maintenant: () => NOW });
const propre = o => !/undefined|NaN|\[object/.test(JSON.stringify(o));

// ── rien d'activé : le gardien et le journal sont RÉELS, le reste dit « bientôt » ──
const r0 = construireReels(m6.vue(), {}, {}, null);
v('les six fenêtres sont construites', ID6.every(id => r0[id]));
v('aucune valeur manquante (undefined / NaN)', propre(r0), JSON.stringify(r0).match(/.{30}(undefined|NaN).{30}/));
v('gardien : RÉEL, trois jauges (perte du jour, drawdown, objectif) et niveau', r0['gardien-prop'].etiquette === 'RÉEL' && r0['gardien-prop'].jauges.length === 3 && /VERT/.test(r0['gardien-prop'].pied));
v('gardien : parts de jauge entre 0 et 1', r0['gardien-prop'].jauges.every(j => j.part >= 0 && j.part <= 1));
v('gardien : l’objectif est celui du compte (+322 $ sur 1 000 $)', /322/.test(r0['gardien-prop'].jauges[2].texte) && /1\s?000/.test(r0['gardien-prop'].jauges[2].texte), r0['gardien-prop'].jauges[2].texte);
v('journal et tilt : RÉEL, sans trade → tilt vert', r0['journal-tilt'].etiquette === 'RÉEL' && r0['journal-tilt'].liste.some(l => l.g === 'Tilt'));
v('propositions : agent non activé → « active l’agent » (aucun chiffre inventé)', r0['propositions-agent'].etat === 'bientot' && /active/.test(r0['propositions-agent'].message));
v('performance des stratégies : rien de validé → « bientôt », pas de courbe inventée', r0['perf-strategies'].etat === 'bientot' && !r0['perf-strategies'].courbes);
v('régime : pas calculé → « bientôt », pas de score inventé', r0['regime-marche'].etat === 'bientot' && !r0['regime-marche'].liste);
v('probabilité : aucune simulation → « bientôt »', r0['proba-evaluation'].etat === 'bientot' && !r0['proba-evaluation'].liste);

// ── agent activé, une stratégie validée, une alerte d'entrée bloquée, un régime et une simulation ──
const courbeR = Array.from({ length: 40 }, (_, i) => i * 0.3 + Math.sin(i) * 0.4);
const vuesPaires = {
  BTC: {
    donnees: { n: 1000 },
    strategies: [
      { id: 's1', nom: 'New York + volume', statut: 'validee', horsEchantillon: { courbeR, Rtotal: 21.4 } },
      { id: 's2', nom: 'Brouillon', statut: 'en_recherche', horsEchantillon: { courbeR } },
      { id: 's3', nom: 'Prépa', statut: 'en_recherche', setup: { statut: 'preparation' } }
    ],
    alertes: [{ type: 'ENTREE', t: NOW - H, sens: 1, nomStrategie: 'New York + volume', gardien: { decision: 'BLOCK' } }]
  }
};
const regimes = { BTC: { ok: true, score: 62, etiquette: { nom: 'Neutre prudent' }, zone: { code: 'NEUTRE' } }, SOL: { ok: false } };
const sim = { ok: true, hypothetique: true, n: 200, plage: { de: 0.5 }, niveaux: [{ risquePct: 0.5, pObjectif: { moy: 0.41, bas: 0.33, haut: 0.49 }, pDrawdown: { moy: 0.12 }, pJour: { moy: 0.2 } }] };
const maintenant = Date.now;
Date.now = () => NOW;
const r1 = construireReels(m6.vue(), vuesPaires, regimes, sim);
Date.now = maintenant;
v('rendu propre avec des données', propre(r1), JSON.stringify(r1).match(/.{30}(undefined|NaN).{30}/));
v('performance : BACKTEST, uniquement les stratégies validées (la stratégie en recherche est exclue)', r1['perf-strategies'].etiquette === 'BACKTEST' && r1['perf-strategies'].courbes.length === 1 && /New York/.test(r1['perf-strategies'].courbes[0].nom));
v('performance : mention « hors échantillon, frais déduits » et « ne garantit rien »', /hors échantillon/.test(r1['perf-strategies'].pied) && /ne garantit rien/.test(r1['perf-strategies'].pied));
v('propositions : une entrée BLOQUÉE par le gardien est affichée comme telle, étiquette SIMULÉ', r1['propositions-agent'].etiquette === 'SIMULÉ' && r1['propositions-agent'].liste[0].d === 'BLOCK' && /ACHAT/.test(r1['propositions-agent'].liste[0].g));
v('propositions : la préparation est listée « à surveiller »', r1['propositions-agent'].liste.some(l => /préparation/.test(l.g) && l.d === 'à surveiller'));
v('propositions : « aucun ordre n’est passé »', /aucun ordre/.test(r1['propositions-agent'].pied));
v('régime : MIXTE, seul le régime calculé est affiché (SOL non calculé absent)', r1['regime-marche'].etiquette === 'MIXTE' && r1['regime-marche'].liste.length === 1 && /62\/100/.test(r1['regime-marche'].liste[0].d));
v('régime : explique l’échelle (100 = sain)', /100 = sain/.test(r1['regime-marche'].entete));
v('probabilité : HYPOTHÉTIQUE pour une hypothèse, fourchette 33 à 49 %, « pas une promesse »', r1['proba-evaluation'].etiquette === 'HYPOTHÉTIQUE' && r1['proba-evaluation'].liste.some(l => /33 à 49 %/.test(l.d)) && /pas une promesse/.test(r1['proba-evaluation'].pied));
const simReelle = { ...sim, hypothetique: false };
v('probabilité : ESTIMÉ pour de vrais trades', construireReels(m6.vue(), {}, {}, simReelle)['proba-evaluation'].etiquette === 'ESTIMÉ');

// ── coupe-circuit : le gardien le dit ──
const m6b = creerM6({ etat: null, maintenant: () => NOW });
for (let k = 0; k < 3; k++) m6b.commande({ type: 'journal_ajouter', trade: { paire: 'BTC', sens: 'achat', t: NOW - (6 - 2 * k) * H, tSortie: NOW - (5.5 - 2 * k) * H, prixEntree: 80000, prixSortie: 79800, quantite: 0.05, stop: 79000, objectif: 83000, strategie: 'S1', frais: 2 } });
const rb = construireReels(m6b.vue(), {}, {}, null);
v('3 pertes d’affilée : « COUPE-CIRCUIT » dans le pied du gardien, pertes d’affilée visibles', /COUPE-CIRCUIT/.test(rb['gardien-prop'].pied) && rb['journal-tilt'].liste.some(l => l.g === 'Pertes d’affilée' && l.d === '3'), rb['gardien-prop'].pied);

// ── les six fenêtres existent dans les exemples de la table avec leur onglet ──
const ex = Object.fromEntries(EXEMPLES.map(e => [e.id, e]));
v('la table déclare les six fenêtres, chacune avec un onglet du poste à ouvrir', ID6.every(id => ex[id] && ex[id].onglet), ID6.filter(id => !ex[id] || !ex[id].onglet).join());
v('la table compte 21 fenêtres', EXEMPLES.length === 21, EXEMPLES.length);

console.log(ok + ' réussis, ' + ko + ' échecs');
process.exit(ko ? 1 : 0);
