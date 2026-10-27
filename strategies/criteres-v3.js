import { CRITERES } from '../planetes/mars/pc/agent-btc/criteres.js';
import { CRITERES2 } from '../planetes/mars/pc/agent-btc/criteres-v2.js';

/* ═════════════ CRITÈRES DE VALIDATION DE L'AGENT UNIQUE — VERSION 3 (écrits le 2026-10-27, AVANT toute recherche V3) ═════════════
   Source de vérité du code ; `strategies/criteres-v3.json` en est la copie lisible par d'autres programmes (écrite par `node strategies/ecrire-criteres.mjs`, vérifiée par le test) et
   `strategies/CRITERES.md` l'explique en français. RÈGLE : ces seuils ne sont JAMAIS assouplis pour « avoir un résultat ». Les changer = nouvelle version (v4), nouveau jeu final, et la recherche
   repart de zéro (le compteur de variantes, lui, ne baisse jamais).
   La version 3 = la version 1 (empreinte c9995253, intacte) + la version 2 (intacte) + les ajouts ci-dessous, tous PLUS stricts ou nouveaux. Unité : R = multiple du risque, frais + spread + glissement déduits. */
export const CRITERES3 = Object.freeze({
  version: 3,
  figesLe: '2026-10-27',
  base: Object.freeze({ v1: CRITERES.version, v2: CRITERES2.version }),
  walkForward: Object.freeze({ fenetresMin: 4 }),                                        // au moins 4 blocs de test successifs, paramètres rechoisis sur l'entraînement SEUL
  horsEchantillon: Object.freeze({ tradesMin: 150, esperanceMin: 0.25 }),
  bootstrap: Object.freeze({ tirages: 5000, niveau: 0.95, basMin: 0, graine: 20261027 }),   // la borne basse de l'intervalle de l'espérance (rééchantillonnage) doit rester > 0
  deflation: Object.freeze({ dsrMin: 0.95 }),                                            // Sharpe déflaté avec le nombre TOTAL de variantes testées (jamais remis à zéro)
  voisins: Object.freeze({ partPositiveMin: 0.7, voisinsMin: 4, medianeVsMeilleur: 0.5 }),
  prop: Object.freeze({ risquePct: 1, drawdownMaxPct: 6, perteJourMaxPct: 3, objectifPct: 10 }),   // compte prop Kraken de 10 000 $ : jamais plus de 6 % de creux ni de 3 % de perte dans un jour (simulés)
  robustesse: Object.freeze({
    actifsPositifsMin: 2, actifsTotal: 3, tradesParActifMin: 40,                         // résultat positif sur au moins 2 des 3 actifs…
    sinonUnActif: Object.freeze({ dsrMin: 0.99, basIcMin: 0.1 }),                        // …OU limité à un actif avec une preuve plus solide
    regimesPositifsMin: 2, tradesParRegimeMin: 20                                        // positif dans au moins 2 des 3 régimes (hausse, baisse, range) ayant assez de trades
  }),
  causalite: Object.freeze({ coupes: 6 }),                                               // « poison du futur » : les signaux calculés sur un début de série (coupé juste après 6 signaux réels, plus 2 coupes quelconques) doivent être IDENTIQUES à ceux de la série entière
  simulationDirect: Object.freeze({ semainesMin: 4, tradesMin: 30, capital: 10000 }),    // avant toute alerte d'ENTRÉE réelle : 4 semaines OU 30 trades simulés sans dérive (le plus long des deux), alertes marquées « SIMULATION »
  rythme: Object.freeze({ positionsParSemaineMax: 5, alerteTropPermissive: 8 }),         // 1 à 5 positions par semaine ; au-delà de 8, le moteur est jugé trop permissif et doit se resserrer
  derive: Object.freeze({ cusumSeuil: 4, tradesMin: 8 }),                                // dérive (CUSUM) : la stratégie est mise en PAUSE
  aucuneStrategie: 'Aucune stratégie validée pour l’instant. Preuves insuffisantes.'
});

/* Empreinte courte et stable (même calcul que les versions 1 et 2). */
export function empreinteV3(c = CRITERES3) {
  const s = JSON.stringify(c); let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
