import { CRITERES2 } from '../agent-btc/criteres-v2.js';

/* ═════════════ CRITÈRES DE L'ASSISTANT DE MARCHÉ PAR RÉGIME (M6c ; ÉCRITS LE 2026-10-23 AVANT TOUT TEST) ═════════════
   Ces seuils sont fixés ici AVANT de regarder le moindre résultat de l'assistant et ne sont JAMAIS ajustés pour faire passer une règle.
   Ils s'ajoutent aux critères de la version 2 (criteres-v2.js, elle-même v1 `c9995253` + ajouts), qui restent EXIGÉS tels quels : on n'en assouplit aucun
   (≥ 150 trades hors échantillon, +20 R net, espérance ≥ +0,25 R, IC95 bas > 0, Sharpe déflaté ≥ 95 % avec le nombre TOTAL de variantes, Monte Carlo, voisins, jeu final ouvert une seule fois).
   Une règle qui ne passe pas TOUT reste en mode « INFORMATION » : l'assistant décrit le marché, il ne propose aucun signal d'entrée.
   Paramètres des règles : choisis a priori (valeurs usuelles du métier), grilles minuscules, déclarés dans regles-regime.js avant les mesures. */
export const CRITERES_M6C = Object.freeze({
  version: 1,
  figesLe: '2026-10-23',
  base: CRITERES2,                                     // v2 intacte, toujours exigée
  hasard: Object.freeze({                              // entrées ALÉATOIRES avec les mêmes stops / mêmes sorties / même régime éligible
    tirages: 300, centileMin: 0.95                     // l'espérance de la règle doit dépasser 95 % des tirages aléatoires
  }),
  croisement: Object.freeze({ margeMin: 0 }),          // espérance de la règle > espérance d'un croisement de moyennes mobiles (EMA 20/50 H1, mêmes stops)
  filtre: Object.freeze({ gainMinR: 0.05 }),           // avec filtre de régime − sans filtre ≥ +0,05 R par trade (sinon le filtre n'apporte rien : il est dit inutile)
  achatConservation: Object.freeze({ rapportMin: 1 }), // rendement / creux de la règle (au risque choisi) ≥ celui de l'achat-conservation sur la même période
  stabilite: Object.freeze({
    anneesPositivesMin: 0.6, tradesParAnneeMin: 5,     // ≥ 60 % des années (≥ 5 trades) positives
    regimeAbsurdeR: -0.2, tradesParRegimeMin: 30       // aucun régime avec ≥ 30 trades et une espérance < −0,2 R (la règle ne doit pas saigner dans un régime où elle trade)
  }),
  cotes: Object.freeze({ tradesMin: 30 }),             // un côté (long ou court) n'est proposé que s'il a ≥ 30 trades hors échantillon ET une espérance > 0 ; sinon il reste en information
  paires: Object.freeze({ positivesMin: 2 }),          // mêmes paramètres sur BTC, SOL, DOGE : espérance > 0 hors échantillon sur ≥ 2 paires sur 3 (la paire jugée en fait partie)
  detecteur: Object.freeze({                           // précision du détecteur de régime (mesure, pas de réglage) : le régime annoncé a-t-il une suite conforme, mieux que la base ?
    horizonH1: 48, liftMin: 1.15, tauxMin: 0.55, echantillonMin: 200
  }),
  alertes: Object.freeze({ reposMinEntreeH: 4, reposMinRangeH: 12, reposMinSortieH: 1 })   // fréquence maximale des alertes par type (heures) — jamais plus
});

export function empreinteM6c(c = CRITERES_M6C) {
  const s = JSON.stringify(c); let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
export function texteM6c(c = CRITERES_M6C) {
  return [
    'Base : critères de la version 2 intacts (≥ ' + c.base.objectif.tradesMin + ' trades hors échantillon, ≥ +' + c.base.objectif.rNetMin + ' R net, espérance ≥ +' + c.base.horsEchantillon.esperanceMin + ' R, IC95 bas > 0, Sharpe déflaté ≥ ' + Math.round(c.base.deflation.dsrMin * 100) + ' %, Monte Carlo, voisins).',
    'Hasard : l’espérance dépasse ' + Math.round(c.hasard.centileMin * 100) + ' % de ' + c.hasard.tirages + ' tirages d’entrées aléatoires avec les mêmes stops et le même régime éligible.',
    'Croisement de moyennes mobiles (EMA 20/50 H1, mêmes stops) : la règle fait mieux. Filtre de régime : gain ≥ +' + c.filtre.gainMinR + ' R par trade, sinon il est déclaré inutile.',
    'Achat-conservation : rendement ÷ creux au moins égal. Stabilité : ≥ ' + Math.round(c.stabilite.anneesPositivesMin * 100) + ' % d’années positives ; aucun régime à plus de ' + c.stabilite.tradesParRegimeMin + ' trades sous ' + c.stabilite.regimeAbsurdeR + ' R.',
    'Long et court séparés : un côté n’est proposé qu’avec ≥ ' + c.cotes.tradesMin + ' trades et une espérance > 0. Mêmes paramètres sur 3 paires : positive sur ≥ ' + c.paires.positivesMin + ' paires.',
    'Jeu final : ouvert UNE seule fois, seulement si tout le reste passe. Sinon : mode information, aucun signal d’entrée.'
  ];
}
