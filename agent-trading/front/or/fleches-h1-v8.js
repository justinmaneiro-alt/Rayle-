/* ═════════════ FLÈCHES H1, VERSION 8 (pur, testé) ═════════════
   Règles FIGÉES « fleches-h1-v8 », écrites le 2026-11-08 AVANT le code et tout test, dans leur propre commit (la date de ce commit ouvre
   le bilan de v8). v8 = les flèches de fleches-h1-v2 telles quelles, filtrées par trois critères. Les seuils viennent de la consigne
   (8 touches, 120 bougies, 1 ATR, 24 bougies, 48 bougies, 2 % / 1 %) ou sont repris de v2 / v7 (0,25 ATR, bandes, plus hauts / bas
   majeurs). Aucun seuil réglé d'après ce qui a été vu sur les graphiques. v1 à v7 restent intactes et calculées en parallèle.
   Informations de lecture du graphique, jamais un ordre. */

export const REGLES_H1_V8 = Object.freeze({
  version: 'fleches-h1-v8', periode: 'H1', ecrites: '2026-11-08', base: 'fleches-h1-v2',
  // 1. gros niveau (bandes et plus hauts / bas majeurs de fleches-h1-v7)
  touchesMin: 8, toleranceAtr: 0.25,
  // 2. extrême de swing
  swingBougies: 120, swingAtr: 1,
  // 3. alternance et espacement
  espacementBougies: 24,
  // mesures (jamais utilisées comme filtre)
  excursionBougies: 48, gainPct: 2, pertePct: 1,
  // bilan (repris de v2)
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100, fraisTaker: 0.0005
});

export const TEXTE_REGLES_H1_V8 = `Règles figées ${REGLES_H1_V8.version} (écrites le ${REGLES_H1_V8.ecrites}, avant le code et tout test, dans leur propre commit ; = les flèches de fleches-h1-v2 telles quelles, filtrées) :
- base : chaque flèche de fleches-h1-v2 (même déclencheur, règles A, B et C de v2, confirmation à la clôture, jamais redessinée), dans l'ordre du temps ; ATR = celui de la flèche v2 (moyenne simple des 14 étendues vraies à la bougie d'avant) ;
- 1. gros niveau : le prix de la flèche (son niveau déclencheur) est dans une bande d'au moins 8 touches (bandes de fleches-h1-v7 : calcul niveaux-periode-v1, fusion à moins de 1 ATR, niveaux retournés compris, connues avant la bougie) élargie de 0,25 ATR de chaque côté, ou à au plus 0,25 ATR d'un plus haut / plus bas de la semaine ou du mois précédents (heure de Paris) ;
- 2. extrême de swing : une flèche rouge n'est gardée que si la clôture de sa bougie est à moins de 1 ATR du plus haut des 120 dernières bougies H1 (elle comprise) ; une verte, à moins de 1 ATR du plus bas des 120 dernières bougies ;
- 3. alternance et espacement : la flèche gardée doit être de sens opposé à la dernière flèche v8 (verte puis rouge puis verte…) et au moins 24 bougies après elle ; sinon elle est écartée ;
- affichage : segment sur le niveau déclencheur, de sa dernière touche connue avant la flèche (bande : dernier pivot ; plus haut / bas majeur : début de la semaine ou du mois où il est devenu « précédent » ; 12 bougies avant la flèche à défaut) jusqu'à la flèche ; infobulle : régime, niveau, touches, distance de l'extrême au niveau, rang de swing (position de la clôture dans la plage des 120 dernières bougies, 0 % = plus bas, 100 % = plus haut) ;
- mesures, jamais utilisées comme filtre : excursion favorable maximale et excursion défavorable maximale dans les 48 bougies suivantes (depuis la clôture de la flèche), en ATR et en % ; flèche « +2 % avant −1 % » si, dans ces 48 bougies, le prix va d'au moins 2 % dans le sens de la flèche avant d'aller de 1 % contre elle (les deux dans la même bougie = contre) ; non mesurable tant que les 48 bougies ne sont pas closes ;
- bilan depuis la date du commit de ces règles, mêmes mesures que v2 (flèches indépendantes à 8 bougies, +1 ATR avant −1 ATR en 8 bougies, R net après frais preneur 0,05 % par côté et spread mesuré, 1000 tirages au hasard même régime et mêmes heures, « pas assez de données » sous 30) ; correction de Holm sur toutes les versions suivies (v1 à v8) ; aucune décision avant 100 flèches indépendantes nouvelles.`;
