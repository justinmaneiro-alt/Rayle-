/* ═════════════ BIBLIOTHÈQUE D'IDÉES (M6 ; module pur, testé : planetes/mars/tests/m6-etat-test.mjs) ═════════════
   Chaque idée — la tienne, celle de l'agent, celle d'un projet open source — est une HYPOTHÈSE testable, avec sa SOURCE, son MÉCANISME (pourquoi elle pourrait marcher), son CRÉDIT et son STATUT.
   Cycle de vie :  brouillon (texte ou lien collé) → à valider (traduite en règle structurée, par le constructeur ou par le Worker À LA DEMANDE) → validée par TOI → en test (file de la recherche des paires choisies)
   → testée (rejetée / candidate / validée par le protocole habituel). Une idée de projet qui demande du code non écrit est « à implémenter ». RIEN n'est testé sans ton accord, et tout est testé avec EXACTEMENT les mêmes critères.
   Les projets cités sont lus comme des DONNÉES NON FIABLES (jamais exécutés) ; les idées sont réécrites ici, avec crédit (voir CREDITS.md). Une idée n'est jamais présentée comme une vérité : « ICT » et « smart money » sont des conventions de langage. */
export const STATUTS_IDEE = Object.freeze({
  brouillon: 'brouillon : texte ou lien collé, pas encore traduit en règle',
  a_valider: 'à valider : règle structurée proposée, en attente de ton accord',
  validee: 'validée par toi : prête à être testée',
  en_test: 'en test : dans la file de la recherche',
  testee: 'testée : le protocole habituel a rendu son verdict',
  implementee: 'implémentée comme famille de la recherche (file ICT)',
  a_implementer: 'à implémenter : demande du code qui n’est pas encore écrit',
  refusee: 'refusée par toi'
});
const PROJETS = Object.freeze({
  ske: { nom: 'SKE-Labs/agent-trading-skills', licence: 'Apache-2.0', lien: 'https://github.com/SKE-Labs/agent-trading-skills' },
  monty: { nom: 'tradermonty/claude-trading-skills', licence: 'MIT', lien: 'https://github.com/tradermonty/claude-trading-skills' },
  victor: { nom: 'VictorVVedtion/trading-skills', licence: 'MIT', lien: 'https://github.com/VictorVVedtion/trading-skills' },
  jake: { nom: 'Jakeschincariol/day-trader-skill', licence: 'MIT', lien: 'https://github.com/Jakeschincariol/day-trader-skill' }
});
const idee = (id, titre, resume, mecanisme, p, statut, extra = {}) => ({ id, titre, resume, mecanisme, source: { type: 'projet', ...PROJETS[p], auteur: PROJETS[p].nom }, credit: 'Idée décrite dans ' + PROJETS[p].nom + ' (' + PROJETS[p].licence + '), réécrite ici en JavaScript.', statut, ...extra });

/* Idées de départ. « implementee » = déjà dans la file de la recherche (agent-m6/ict.js) ; « a_implementer » = à écrire. */
export const CATALOGUE_IDEES = Object.freeze([
  idee('cat-fvg', 'Fair value gap : retour dans le trou et rejet', 'Trou de trois bougies après un déplacement ; entrée à la première retouche qui refuse de le traverser.', 'Un déplacement rapide laisserait des échanges non faits que le prix reviendrait combler. Convention ICT : à vérifier statistiquement, pas à croire.', 'ske', 'implementee', { famille: 'ict_fvg' }),
  idee('cat-ob', 'Order block : retour sur la dernière bougie contraire', 'Dernière bougie de sens contraire avant un déplacement qui casse la structure ; entrée à son retour.', 'Les ordres qui ont lancé le déplacement pourraient défendre ce niveau. Hypothèse, pas un fait observable dans des bougies.', 'ske', 'implementee', { famille: 'ict_order_block' }),
  idee('cat-liq', 'Balayage de liquidité : extrême égal dépassé puis refermé', 'Un plancher (ou plafond) touché plusieurs fois est dépassé par une mèche puis refermé à l’intérieur.', 'Des stops s’accumuleraient sous les extrêmes égaux ; leur déclenchement offrirait de la liquidité aux grands acteurs. Hypothèse.', 'ske', 'implementee', { famille: 'ict_sweep' }),
  idee('cat-pd', 'Premium / discount : acheter bas, vendre haut dans l’intervalle, avec la tendance', 'Moitié basse d’un intervalle en tendance haussière pour acheter, moitié haute en tendance baissière pour vendre.', 'Entrer du bon côté du milieu de l’intervalle améliorerait le rapport gain / risque. La position dans l’intervalle seule n’est pas un signal : test avec une tendance et un déclencheur.', 'ske', 'implementee', { famille: 'ict_premium_discount' }),
  idee('cat-double', 'Double creux / double sommet : cassure de la ligne de cou', 'Deux extrêmes confirmés au même niveau, entrée à la cassure de l’extrême opposé entre les deux.', 'Figure classique de retournement. Son pouvoir prédictif net des frais est très discuté.', 'ske', 'implementee', { famille: 'figure_double' }),
  idee('cat-drapeau', 'Drapeau : impulsion, pause serrée, reprise', 'Impulsion forte, consolidation serrée, sortie de la pause dans le sens de l’impulsion.', 'Figure classique de continuation : la pause serait une respiration, pas un retournement.', 'ske', 'implementee', { famille: 'figure_drapeau' }),
  idee('cat-funding', 'Financement extrême : jouer contre la foule', 'Taux de financement très élevé (acheteurs surchargés) ou très négatif (vendeurs surchargés) puis retournement du prix.', 'Un positionnement à levier trop unilatéral serait fragile (liquidations en chaîne). Déjà testé pour BTC en M4 (aucune stratégie robuste).', 'ske', 'implementee', { famille: 'financement_extreme' }),
  idee('cat-kz', 'Kill zones : n’entrer qu’à l’ouverture de Londres ou de New York', 'Restreindre toute entrée aux fenêtres d’ouverture des séances.', 'La liquidité et la volatilité se concentrent aux ouvertures. Se teste comme FILTRE de session ajouté à n’importe quelle stratégie (déjà couvert par les filtres de session de la recherche).', 'ske', 'implementee', { famille: 'regle:session' }),
  idee('cat-mss', 'Changement de structure de marché (MSS) puis retour', 'Cassure du dernier creux (dans une hausse) ou sommet (dans une baisse), puis entrée au retest.', 'Un premier signe de changement de tendance avant le retournement. À écrire : détecteur de structure avec pivots confirmés.', 'ske', 'a_implementer'),
  idee('cat-breaker', 'Breaker block : un order block cassé devient un obstacle de l’autre côté', 'Zone d’order block franchie, puis retestée par l’autre côté.', 'Un niveau défendu qui cède deviendrait un niveau défendu en sens inverse. À écrire.', 'ske', 'a_implementer'),
  idee('cat-ote', 'Entrée optimale (OTE) : repli de 62 à 79 % du dernier mouvement', 'Entrée dans la bande de repli de Fibonacci 0,62-0,79 après une impulsion.', 'La recherche empirique ne soutient pas de pouvoir particulier des niveaux de Fibonacci : se teste contre des bandes de largeur égale placées ailleurs.', 'ske', 'a_implementer'),
  idee('cat-tete', 'Tête-épaules : cassure de la ligne de cou', 'Trois sommets dont le central est le plus haut, entrée à la cassure de la ligne de cou.', 'Figure classique de retournement. À écrire (trois pivots confirmés).', 'ske', 'a_implementer'),
  idee('cat-triangle', 'Triangle : sortie de la compression', 'Sommets de plus en plus bas et creux de plus en plus hauts, entrée à la sortie du triangle.', 'Une compression de la volatilité précéderait une expansion (déjà proche de la famille « squeeze »). À écrire avec deux droites de tendance.', 'ske', 'a_implementer'),
  idee('cat-residuel', 'Alpha résiduel : ce qui reste d’une piste proche une fois enlevé le facteur connu', 'Prolonger la meilleure piste proche par un filtre de contexte.', 'Une piste presque bonne peut cacher un contexte où elle marche vraiment. Risque d’ajuster au hasard : chaque filtre est compté dans le nombre de variantes testées.', 'monty', 'implementee', { famille: 'pivot:residuel' }),
  idee('cat-pivot', 'Pivot de stratégie quand la recherche stagne', 'Changer de famille d’hypothèses quand la meilleure piste ne progresse plus.', 'Insister sur une famille épuisée gaspille la puissance de calcul et gonfle inutilement le seuil du hasard.', 'monty', 'implementee', { famille: 'pivot:stagnation' })
]);

/* Sources reconnues pour les crédits (CREDITS.md et page « bibliothèque »). */
export const INSPIRATIONS = Object.freeze([
  { projet: PROJETS.monty, idees: ['Score de régime crypto 0-100 (100 = risk-on) avec composantes pondérées et redistribution des poids manquants', 'Détection de stagnation de la recherche et pivot de stratégie', 'Analyse du résiduel d’une stratégie', 'Bilan hebdomadaire des trades et coaching de discipline'] },
  { projet: PROJETS.victor, idees: ['Contrôle avant trade en neuf points avec PASS / WARN / FAIL', 'Échelle vert / orange / rouge du détecteur de tilt (revanche, grossissement après perte, rafale de trades)'] },
  { projet: PROJETS.jake, idees: ['Simulation de milliers de sessions et rejeu de toutes les occurrences passées (« machine à remonter le temps »)', 'Gardien de risque PASS / BLOCK : une sortie n’est jamais bloquée par une limite du jour'] },
  { projet: PROJETS.ske, idees: ['Définitions des fair value gaps, order blocks, zones de liquidité, premium / discount, kill zones', 'Principe : tout concept ICT est une hypothèse à tester contre le hasard, avec les coûts, en walk-forward', 'Figures chartistes (double sommet / creux, drapeau)'] }
]);

/* Un brouillon à partir d'un texte ou d'un lien collé. Le lien n'est JAMAIS ouvert par l'agent : il est conservé tel quel comme référence, et le texte collé est la seule matière traduite. */
export function nouvelleIdee({ texte = '', lien = '', titre = '', auteur = 'utilisateur', mecanisme = '', maintenant = Date.now(), id = null }) {
  const t = String(texte || '').trim().slice(0, 1500), l = String(lien || '').trim().slice(0, 300);
  if (!t && !l) return { ok: false, erreur: 'rien à enregistrer : colle un texte ou un lien' };
  if (l && !/^https?:\/\/[^\s]+$/i.test(l)) return { ok: false, erreur: 'ce lien n’est pas une adresse web valide' };
  const src = auteur === 'agent' ? { type: 'agent', nom: 'agent Raylé' } : auteur === 'projet' ? { type: 'projet', nom: 'projet externe' } : { type: 'utilisateur', nom: 'Justin' };
  return { ok: true, idee: { id: id || 'idee-' + maintenant.toString(36) + '-' + Math.random().toString(36).slice(2, 6), titre: (titre || t.split(/[.\n]/)[0] || l).slice(0, 90), texte: t, lien: l, source: src, credit: auteur === 'utilisateur' ? 'Idée de Justin.' : auteur === 'agent' ? 'Idée proposée par l’agent à partir de ses diagnostics.' : 'Source externe : ' + (l || 'texte collé') + ' (à créditer précisément).', mecanisme: String(mecanisme || '').slice(0, 400), statut: 'brouillon', regle: null, famille: null, creeLe: maintenant, historique: [{ t: maintenant, statut: 'brouillon' }], resultats: {} } };
}
