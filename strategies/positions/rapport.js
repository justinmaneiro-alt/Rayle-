import { NIVEAUX } from '../criteres-v4.js';
import { fmt } from './agents.js';
import { bilanAgent, phraseEtat, phraseHebdo, signe, fr } from './bilan.js';

/* ═════════════ TEXTES DES POSITIONS : ALERTES TELEGRAM ET RAPPORT DU MATIN (V7, phase 6 ; module pur, testé : galaxie/tests/positions-rapport-test.mjs) ═════════════
   Tout est construit à partir des chiffres (jamais d'un modèle de langage). Toujours : sens, actif, unité, entrée (ordre limite), stop, cibles, rapport gain / risque, durée de validité, raison, niveau de preuve
   avec les vraies statistiques, ce qui invalide la position. Jamais d'ordre exécuté. */
export const PIED = 'Aucun ordre n’est exécuté : c’est une proposition, tu décides. Les résultats passés ne garantissent rien.';
const heure = t => new Date(t).toISOString().slice(11, 16) + ' UTC';
const sens = p => (p.sens > 0 ? 'ACHAT' : 'VENTE');
export const etiquetteNiveau = n => ({ validee: 'VALIDÉE', candidate: 'CANDIDATE (observation, non validé)', non_concluante: 'TESTÉE, NON CONCLUANTE', non_testee: 'IDÉE NON TESTÉE' }[n] || n);
const pct = x => (x == null ? '—' : Math.round(x * 100) + ' %');

/* La phrase de preuve d'une proposition : les statistiques RÉELLES de son type de setup, ou le message clair « preuve insuffisante ». */
export function phrasePreuve(p) {
  const e = p.preuve || {};
  if (e.niveau === 'validee') return 'Preuve : VALIDÉE — ' + stats(e) + '.';
  if (e.niveau === 'candidate') return 'Preuve : CANDIDATE (en observation) — ' + stats(e) + '. Pas encore validée : prends-la comme un test, pas comme un signal fiable.';
  if (e.niveau === 'non_concluante') return 'Preuve : testée, NON CONCLUANTE — ' + stats(e) + '. Preuve insuffisante : prends-la comme une idée, pas comme un signal fiable.';
  return 'Preuve : idée NON TESTÉE (trop peu de trades mesurés). Preuve insuffisante : prends-la comme une idée, pas comme un signal fiable.';
}
function stats(e) {
  if (!e.n) return 'aucun trade mesuré';
  return 'réussite ' + pct(e.tauxReussite) + ', rapport gain / risque moyen ' + fr(e.rrMoyen, 1) + ', espérance après frais ' + signe(e.esperance, 2) + ' R' + (e.fourchette ? ' (fourchette à 95 % : ' + signe(e.fourchette[0], 2) + ' à ' + signe(e.fourchette[1], 2) + ' R)' : '') + ' sur ' + e.n + ' trades hors échantillon';
}
/* Carte d'une proposition : lignes de texte (Telegram, rapport, fenêtre). */
export function ligneProposition(p) {
  const zone = p.zone ? fmt(p.zone[0]) + ' – ' + fmt(p.zone[1]) : fmt(p.limite);
  return [
    sens(p) + ' ' + p.actif + ' ' + p.tf + (p.diamant || (p.confluence && p.confluence.diamant) ? ' 💎' : '') + ' — ' + (p.nomType || p.type) + ' (agent ' + (p.agent === 'rebond' ? 'Rebond' : p.agent === 'continuation' ? 'Continuation' : 'Extrêmes') + ')',
    'Zone d’entrée (ordre limite) : ' + zone + ' · limite ' + fmt(p.limite) + ' · stop ' + fmt(p.stop) + ' · cible 1 ' + fmt(p.cible) + (p.cibleNom ? ' (' + p.cibleNom + ')' : '') + (p.cible2 ? ' · cible 2 ' + fmt(p.cible2) : '') + ' · rapport ' + fr(p.rr, 1) + ' pour 1',
    'Valable jusqu’à ' + heure(p.tValide) + '. Pourquoi : ' + p.raison,
    phrasePreuve(p),
    'Annulée si : ' + p.invalidation + '.'
  ];
}
export function alertePosition(p, { mode = 'SIMULATION' } = {}) {
  const niveau = p.preuve ? p.preuve.niveau : 'non_testee', titre = niveau === 'validee' ? (mode === 'REEL' ? 'POSITION PROPOSÉE (validée)' : 'POSITION PROPOSÉE (validée, SIMULATION : le type est encore en phase de simulation en direct)') : 'Observation (non validé) — ' + etiquetteNiveau(niveau);
  return [titre, ...ligneProposition(p), PIED];
}
export function alerteSurveillance(z, actif) { return ['Trade à surveiller — ' + actif, 'Le prix approche d’une zone diamant en ' + z.tf + ' à ' + fmt(z.niveau) + ' (' + (z.cote === 'support' ? 'support' : 'résistance') + ', à ' + fr(z.distancePct, 2) + ' %).', z.resume, 'Rien à faire tant qu’il n’y a pas de balayage et de reprise : je te dirai si une position se forme.', PIED]; }

/* Lignes du rapport du matin : positions du jour, bilan de la veille, meilleure piste de la recherche et preuve manquante. */
export function lignesRapportPositions({ vue, bilan, pistes = [], maintenant = Date.now() } = {}) {
  const L = [];
  const props = (vue && vue.propositions) || [];
  L.push('Positions du jour : ' + (props.length ? props.length + ' proposée(s).' : 'aucune ne passe le filtre qualité pour l’instant.'));
  for (const p of props.slice(0, 4)) L.push('• ' + sens(p) + ' ' + p.actif + ' ' + p.tf + ' : limite ' + fmt(p.limite) + ', stop ' + fmt(p.stop) + ', cible ' + fmt(p.cible) + ' (' + fr(p.rr, 1) + ' pour 1) — ' + (p.preuve ? etiquetteNiveau(p.preuve.niveau).toLowerCase() : 'non testée') + (p.preuve && p.preuve.n ? ' (' + signe(p.preuve.esperance, 2) + ' R sur ' + p.preuve.n + ' trades)' : '') + '.');
  if (!props.length && vue && vue.hypothese && vue.hypothese.pourquoi) L.push('Meilleure position hypothétique : ' + vue.hypothese.pourquoi + ' ' + (vue.hypothese.quand || ''));
  if (vue && vue.zonesDiamant && vue.zonesDiamant.length) L.push('Zones diamant à surveiller : ' + vue.zonesDiamant.slice(0, 3).map(z => z.tf + ' ' + fmt(z.niveau)).join(', ') + '.');
  if (bilan && bilan.tous) { const b = bilan.tous; L.push('Bilan (simulation) : ' + phraseEtat(b)); if (b.cloturees) L.push(phraseHebdo(b)); }
  if (pistes && pistes.length) L.push(...pistes.slice(0, 2));
  return L;
}
export { NIVEAUX, bilanAgent };
