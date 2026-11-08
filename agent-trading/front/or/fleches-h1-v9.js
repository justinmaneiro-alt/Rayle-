/* ═════════════ FLÈCHES H1, VERSION 9 (pur, testé) ═════════════
   Règles FIGÉES « fleches-h1-v9 », écrites le 2026-11-08 AVANT le code et tout test, dans leur propre commit (la date de ce commit ouvre
   le bilan de v9). v9 = les flèches de fleches-h1-v2 telles quelles, avec seulement trois filtres. Seuils de la consigne (5 touches,
   24 bougies) ou repris de v2 / v7 / v8 (0,25 ATR, bandes, plus hauts / bas majeurs, mesures sur 48 bougies). Aucun autre filtre, aucun
   seuil réglé d'après les graphiques. v1 à v8 restent intactes et calculées en parallèle. Informations de lecture, jamais un ordre. */

export const REGLES_H1_V9 = Object.freeze({
  version: 'fleches-h1-v9', periode: 'H1', ecrites: '2026-11-08', base: 'fleches-h1-v2',
  // 1. niveau déclencheur
  touchesMin: 5, toleranceAtr: 0.25,
  // 2. et 3. alternance, espacement
  espacementBougies: 24,
  // pas de filtre d'extrême de swing (rang de swing seulement affiché)
  swingBougies: 120, swingAtr: Infinity,
  // mesures (jamais utilisées comme filtre)
  excursionBougies: 48, gainPct: 2, pertePct: 1,
  // bilan (repris de v2)
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100, fraisTaker: 0.0005
});

export const TEXTE_REGLES_H1_V9 = `Règles figées ${REGLES_H1_V9.version} (écrites le ${REGLES_H1_V9.ecrites}, avant le code et tout test, dans leur propre commit ; = les flèches de fleches-h1-v2 telles quelles, trois filtres seulement) :
- base : chaque flèche de fleches-h1-v2 (même déclencheur, règles A, B et C de v2, confirmation à la clôture, jamais redessinée), dans l'ordre du temps ; ATR = celui de la flèche v2 ;
- 1. niveau déclencheur : le prix de la flèche est dans une bande d'au moins 5 touches (même calcul que les bandes de fleches-h1-v7 / v8 : niveaux-periode-v1, fusion à moins de 1 ATR, niveaux retournés compris, connues avant la bougie) élargie de 0,25 ATR de chaque côté, ou à au plus 0,25 ATR d'un plus haut / plus bas de la semaine ou du mois précédents (heure de Paris) ;
- 2. alternance : de sens opposé à la dernière flèche v9 (verte puis rouge puis verte…) ; sinon écartée ;
- 3. au moins 24 bougies après la dernière flèche v9 ; sinon écartée ;
- aucun autre filtre (pas d'extrême de swing, pas de filtre de tendance) ;
- affichage : flèches bien visibles ; segment sur le niveau déclencheur (de sa dernière touche connue avant la flèche, comme fleches-h1-v8), sans étiquette permanente ; infobulle au survol : régime, niveau, touches, distance de l'extrême au niveau, excursions ;
- mesures, jamais utilisées comme filtre : excursion favorable et défavorable maximales dans les 48 bougies suivantes, en ATR et en % (comme fleches-h1-v8) ;
- bilan depuis la date du commit de ces règles, mêmes mesures que v2 (flèches indépendantes à 8 bougies, +1 ATR avant −1 ATR en 8 bougies, R net après frais preneur 0,05 % par côté et spread mesuré, 1000 tirages au hasard même régime et mêmes heures, « pas assez de données » sous 30) ; correction de Holm sur toutes les versions suivies (v1 à v9) ; aucune décision avant 100 flèches indépendantes nouvelles.`;
