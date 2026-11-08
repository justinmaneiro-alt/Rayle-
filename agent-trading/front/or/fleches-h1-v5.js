/* ═════════════ FLÈCHES H1, VERSION 5, ET NIVEAUX H1 AFFICHÉS (pur, testé) ═════════════
   Règles FIGÉES « fleches-h1-v5 » et « niveaux-h1-v5 », écrites le 2026-11-08 AVANT le code et tout test, dans leur propre commit
   (la date de ce commit ouvre le bilan de v5). v5 = fleches-h1-v2 telle quelle + trois corrections. Seuils repris de v2 (eux-mêmes de
   fleches-v1) ; les seuls seuils nouveaux viennent de la consigne (5 touches) ou sont fixés ici une fois pour toutes (6 par côté).
   Aucun seuil réglé d'après ce qui a été vu sur les graphiques. v1, v2, v3, v4 restent intactes et calculées en parallèle.
   Informations de lecture du graphique, jamais un ordre. */

/* niveaux H1 affichés (dessin du graphique en H1 ET niveaux des flèches v5) : même calcul que niveaux-periode-v1 (pivots, regroupement,
   bandes, fusion des bandes à moins de 1 ATR), seule la SÉLECTION change */
export const REGLES_NIVEAUX_H1_V5 = Object.freeze({
  version: 'niveaux-h1-v5', base: 'niveaux-periode-v1', periode: 'H1',
  touchesMin: 5,   // une bande est affichée si elle a au moins 5 touches (plus haut / plus bas majeurs : toujours gardés)
  parCote: 6,      // au plus 6 au-dessus et 6 au-dessous du prix (au lieu de 4)
  forts: 2         // les 2 plus importantes de chaque côté bien visibles, les autres discrètes (comme avant)
});

export const REGLES_H1_V5 = Object.freeze({
  version: 'fleches-h1-v5', periode: 'H1', ecrites: '2026-11-08', base: 'fleches-h1-v2', niveaux: REGLES_NIVEAUX_H1_V5.version,
  // repris de v2 (inchangés)
  ecartAtr: 0.15, meche: 0.5, volumeMedianeN: 20, pivotK: 3, listeAtr: 0.25, fenetreListe: 1600,
  opposeeBougies: 8, approcheSortieAtr: 1, memeNiveauAtr: 0.5,
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100, fraisTaker: 0.0005,
  // correction 1 : sens aligné sur le régime H1
  sensParRegime: Object.freeze({ haussier: 'hausse', baissier: 'baisse' }),
  niveauxHausse: Object.freeze(['support', 'liquidité basse']), niveauxBaisse: Object.freeze(['résistance', 'liquidité haute'])
});

export const TEXTE_REGLES_H1_V5 = `Règles figées ${REGLES_H1_V5.version} et ${REGLES_NIVEAUX_H1_V5.version} (écrites le ${REGLES_H1_V5.ecrites}, avant le code et tout test, dans leur propre commit ; = fleches-h1-v2 telle quelle + trois corrections) :
- base v2 inchangée : ATR (moyenne simple des 14 dernières étendues vraies), régime H1 (biais : EMA 20 / 50), rejet (extrême à moins de 0,25 ATR du niveau, clôture à au moins 0,15 ATR du bon côté, mèche ≥ la moitié de la bougie, volume ≥ la médiane des 20 précédentes), règle A d'origine (pas de verte après un rejet sur résistance tant qu'un creux plus haut n'est pas confirmé, miroir pour les rouges), règle B (seulement sur un niveau listé), règle C (rien en range, une flèche par approche, aucune flèche opposée à moins de 8 bougies), flèche posée à la clôture de la bougie de rejet, jamais redessinée ;
- correction 1, sens aligné sur le régime H1 : régime haussier → seulement des flèches vertes, sur un support ou une liquidité basse ; régime baissier → seulement des flèches rouges, sur une résistance ou une liquidité haute ; régime « range » → aucune flèche ; jamais de flèche contre le régime ;
- correction 2, niveaux H1 affichés (${REGLES_NIVEAUX_H1_V5.version}) : même calcul que niveaux-periode-v1 (pivots, regroupement à 0,5 ATR, bandes, fusion des bandes à moins de 1 ATR bord à bord), mais une bande n'est gardée que si elle a au moins 5 touches (plus haut et plus bas majeurs toujours gardés), jusqu'à 6 au-dessus et 6 au-dessous du prix (au lieu de 4), les 2 plus importantes de chaque côté bien visibles ; zones de liquidité inchangées ; étiquettes sans chevauchement (une étiquette qui chevaucherait est omise, détail au survol) ; échelle calée sur les bougies visibles, jamais sur les niveaux lointains (repère ▲ / ▼ hors champ) ;
- correction 3 : les flèches v5 sont posées sur les niveaux effectivement affichés (même liste que le dessin : niveaux ${REGLES_NIVEAUX_H1_V5.version} et zones de liquidité, calculés avec les seules bougies closes avant la bougie), à au plus 0,25 ATR du niveau ; jamais sur un niveau non affiché ;
- bilan depuis la date du commit de ces règles, mêmes mesures que v2 (flèches indépendantes à 8 bougies, +1 ATR avant −1 ATR en 8 bougies, R net après frais preneur 0,05 % par côté et spread mesuré, 1000 tirages au hasard même régime et mêmes heures, « pas assez de données » sous 30) ; correction de Holm sur toutes les versions suivies (v1 à v5) ; aucune décision avant 100 flèches indépendantes nouvelles.`;
