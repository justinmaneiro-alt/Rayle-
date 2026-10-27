import { construireContexte } from '../agent-btc/contexte.js';
import { decouper, evaluerVariante, walkForward, monteCarlo, robustesse, jugerHorsEchantillon } from '../agent-btc/evaluation.js';
import { combinaisons, cleParams, FAMILLES } from '../agent-btc/hypotheses.js';
import { CRITERES, empreinteCriteres } from '../agent-btc/criteres.js';
import { statistiques } from '../agent-btc/moteur.js';
import { intervalleEsperance } from '../agent-btc/stats-m5.js';
import { FAMILLES_V2, ORDRE_AGENTS_V2 } from './familles-v2.js';

/* ═════════════ VALIDATION D'UN AGENT PRÊT À L'EMPLOI (V2, phase 6 ; module pur, testé : planetes/mars/tests/v2-agents-test.mjs) ═════════════
   MÊME PROTOCOLE que toute la bibliothèque (aucun critère n'est touché ni assoupli) :
   1. l'historique est découpé : 75 % de zone de recherche (entraînement + walk-forward), 25 % de JEU FINAL qui n'est JAMAIS ouvert ici ;
   2. toutes les variantes de la grille sont simulées (frais, spread, glissement) sur la zone de recherche ;
   3. WALK-FORWARD : à chaque bloc de test de 6 mois, les paramètres sont rechoisis sur l'entraînement SEUL (fenêtre croissante) ; les blocs de test mis bout à bout forment le résultat HORS ÉCHANTILLON ;
   4. Monte Carlo, robustesse des voisins (paramètres décalés d'un cran), seuil du hasard parmi N variantes testées ;
   5. le verdict est jugé par `jugerHorsEchantillon` (critères v1, empreinte au journal).
   Résultat : `valide_oos` (les critères hors échantillon sont TOUS passés ; « jeu final non ouvert » reste affiché) ou `non_valide` avec la liste des critères ratés, ou `insuffisant` (historique trop court).
   RÈGLE D'USAGE : un agent qui n'est pas `valide_oos` ne propose JAMAIS de position et n'envoie JAMAIS d'alerte d'ENTRÉE (proposition.js). On parle de « fiabilité mesurée », jamais de promesse. */
export const STATUTS = Object.freeze({ valide_oos: 'VALIDÉ HORS ÉCHANTILLON', non_valide: 'NON VALIDÉ', insuffisant: 'HISTORIQUE INSUFFISANT' });
export const FIABILITE_TEXTE = 'Fiabilité MESURÉE, pas une promesse : aucun système de trading ne gagne à coup sûr. Ce que tu vois ici est un résultat HORS ÉCHANTILLON (paramètres rechoisis sans regarder le futur), frais inclus, sur du passé : le futur peut être différent.';

/* Paramètres retenus : ceux que le walk-forward a le plus souvent choisis (en cas d'égalité, le premier de la grille). */
export function parametresRetenus(wf) {
  const compte = new Map();
  for (const b of wf.blocs) if (b.params) { const k = cleParams(b.params), e = compte.get(k) || { n: 0, params: b.params }; e.n++; compte.set(k, e); }
  let meilleur = null; for (const e of compte.values()) if (!meilleur || e.n > meilleur.n) meilleur = e;
  return meilleur ? meilleur.params : null;
}

/* Évalue UN agent sur la série M15 (colonnes de agent-btc/colonnes.js). `variantesDejaTestees` : variantes comptées avant (compteur qui ne baisse jamais). Rend un rapport complet. */
export function validerAgent(m15, id, { config = {}, variantesDejaTestees = 0, surProgres = null, ctx = null } = {}) {
  const fam = FAMILLES_V2[id]; if (!fam) return { ok: false, statut: 'insuffisant', raison: 'agent inconnu : ' + id };
  const dec = decouper(m15);
  if (!dec.ok) return { ok: true, id, statut: 'insuffisant', raison: dec.raison, criteres: { version: CRITERES.version, empreinte: empreinteCriteres() }, jeuFinalOuvert: false };
  const c = ctx || construireContexte(m15), plage = { de: 0, a: dec.finA }, grille = combinaisons(fam.grille());
  const lignes = []; let k = 0;
  for (const params of grille) { lignes.push(evaluerVariante(c, id, params, config, plage)); if (surProgres) surProgres(++k / grille.length); }
  const wf = walkForward(lignes, dec, config), mc = monteCarlo(wf.trades), retenus = parametresRetenus(wf);
  const robuste = retenus ? robustesse(c, id, retenus, config, plage) : null, nVar = variantesDejaTestees + lignes.length;
  const juge = jugerHorsEchantillon(wf, { nVariantes: nVar, mc, robuste });
  const ic = intervalleEsperance(wf.trades.map(t => t.R));
  const complet = evaluerRetenu(c, id, retenus, config, plage);
  return { ok: true, id, nom: fam.nom, statut: juge.ok ? 'valide_oos' : 'non_valide', juge, retenus, nVariantes: nVar, variantesDeCetteEvaluation: lignes.length, wf: { stats: wf.stats, blocs: wf.blocs.map(b => ({ debut: b.debut, fin: b.fin, params: b.params, test: b.test && { n: b.test.n, esperance: b.test.esperance } })), trades: wf.trades.length },
    mc, ic, robuste: robuste && { testables: robuste.testables, partPositive: robuste.partPositive, mediane: robuste.mediane, centre: robuste.centre },
    zoneRecherche: { de: m15.t[0], a: m15.t[dec.finA - 1], mois: dec.moisZoneA }, jeuFinalOuvert: false, jeuFinalMois: dec.moisFinal, rechercheComplete: complet,
    criteres: { version: CRITERES.version, empreinte: empreinteCriteres() }, avertissement: FIABILITE_TEXTE };
}
/* Résultat de la zone de recherche entière avec les paramètres retenus (pour la courbe et la liste des trades du backtest visuel ; ce n'est PAS le résultat hors échantillon). */
export function evaluerRetenu(ctx, id, params, config, plage) {
  if (!params) return null; const e = evaluerVariante(ctx, id, params, config, plage);
  return { params, stats: e.stats, trades: e.trades };
}
/* Backtest d'un jeu de paramètres choisi à la main (étape 3 de l'assistant) : zone de recherche seulement, jamais le jeu final. */
export function backtester(m15, id, params, { config = {}, ctx = null } = {}) {
  const fam = FAMILLES_V2[id]; if (!fam) return { ok: false, raison: 'agent inconnu' };
  const dec = decouper(m15), finA = dec.ok ? dec.finA : Math.floor(m15.n * CRITERES.decoupage.fractionRecherche), c = ctx || construireContexte(m15);
  const e = evaluerVariante(c, id, { ...Object.fromEntries(Object.entries(fam.grille()).map(([k, v]) => [k, v[0]])), ...params }, config, { de: 0, a: finA });
  const ic = e.trades.length >= 8 ? intervalleEsperance(e.trades.map(t => t.R)) : null;
  return { ok: true, id, params: e.params, trades: e.trades, stats: e.stats, ic, zone: { debut: m15.t[0], fin: m15.t[finA - 1] }, jeuFinalOuvert: false, avertissement: 'Backtest sur la zone de recherche (les 75 % premiers de l’historique). Ce n’est PAS une validation : lance « Optimiser et valider » pour le résultat hors échantillon.' };
}
export { ORDRE_AGENTS_V2, FAMILLES, statistiques };
