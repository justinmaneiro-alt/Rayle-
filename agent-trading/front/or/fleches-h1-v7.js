/* ═════════════ FLÈCHES H1, VERSION 7 (pur, testé) ═════════════
   Règles FIGÉES « fleches-h1-v7 », écrites le 2026-11-08 AVANT le code et tout test, dans leur propre commit (la date de ce commit ouvre
   le bilan de v7). Les seuils viennent de la consigne (8 touches, 0,25 ATR, 1,5 ATR, 24 bougies) ; les autres sont repris de v2 / v6
   (ATR, régime, fusion des bandes, cassure à 0,5 ATR pour les niveaux retournés). Aucun seuil réglé d'après ce qui a été vu sur les
   graphiques. v1 à v6 restent intactes et calculées en parallèle. Informations de lecture du graphique, jamais un ordre. */

export const REGLES_H1_V7 = Object.freeze({
  version: 'fleches-h1-v7', periode: 'H1', ecrites: '2026-11-08',
  // 1. niveaux admis
  touchesMin: 8,                                   // supports / résistances (bandes fusionnées, niveaux retournés compris) : au moins 8 touches
  majeurs: Object.freeze(['semaine', 'mois']),     // plus haut / plus bas de la semaine et du mois précédents (heure de Paris)
  fenetreListe: 1600, casseAtr: 0.5,               // repris de v2 / niveaux-h1-v6
  // 2. rebond confirmé
  toucheAtr: 0.25, confirmationAtr: 1.5,
  // 3. et 4. alternance, espacement
  espacementBougies: 24,
  // bilan (repris de v2)
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100, fraisTaker: 0.0005
});

export const TEXTE_REGLES_H1_V7 = `Règles figées ${REGLES_H1_V7.version} (écrites le ${REGLES_H1_V7.ecrites}, avant le code et tout test, dans leur propre commit) :
- ATR = moyenne simple des 14 dernières étendues vraies (comme v2), mesurée à la bougie qui précède la touche ; régime H1 = biais H1 (EMA 20 / 50), « range » si les moyennes sont mêlées ;
- 1. niveaux admis, connus avant chaque bougie (seules les bougies closes d'avant) : les bandes de supports / résistances (calcul niveaux-periode-v1, fusion à moins de 1 ATR comme niveaux-h1-v5 / v6) d'au moins 8 touches, sans limite de nombre, niveaux retournés compris (mention « ancienne résistance » / « ancien support », cassure par une clôture à ≥ 0,5 ATR comme niveaux-h1-v6) ; les plus hauts et plus bas de la semaine et du mois précédents (heure de Paris), même déjà dépassés ; aucun autre niveau (ni niveau secondaire, ni sommets / creux égaux, ni veille) ; un niveau sous la clôture précédente est un support, au-dessus une résistance ;
- 2. rebond confirmé : une bougie TOUCHE un support admis (son plus bas à au plus 0,25 ATR du niveau) ; dès qu'une bougie suivante CLÔTURE à au moins 1,5 ATR au-dessus du niveau sans qu'aucune bougie depuis la touche (elle comprise) n'ait fait un plus bas sous celui de la touche, une flèche verte est posée à cette clôture, jamais déplacée ensuite ; pas de délai maximal (l'attente s'arrête au premier nouveau plus bas) ; miroir pour une flèche rouge sur une résistance admise ; si plusieurs touches se confirment à la même bougie, la plus ancienne compte ;
- 3. alternance : après une verte, la suivante est rouge, et inversement ; une confirmation du même sens que la dernière flèche ne donne rien (elle est consommée) ;
- 4. au moins 24 bougies entre deux flèches v7 ; une confirmation plus proche ne donne rien (elle est consommée) ;
- 5. rien en régime H1 « range » (régime de la bougie de confirmation) ; hors range, le sens n'est pas filtré par la tendance ;
- affichage : pour chaque flèche, un segment horizontal sur son niveau déclencheur, de la bougie de touche à la bougie de confirmation (type, prix, touches) ; au survol : régime, distance de la touche au niveau, bougie de touche, bougie de confirmation ;
- bilan depuis la date du commit de ces règles, mêmes mesures que v2 (flèches indépendantes à 8 bougies, +1 ATR avant −1 ATR en 8 bougies, R net après frais preneur 0,05 % par côté et spread mesuré, 1000 tirages au hasard même régime et mêmes heures, « pas assez de données » sous 30) ; correction de Holm sur toutes les versions suivies (v1 à v7) ; aucune décision avant 100 flèches indépendantes nouvelles.`;
