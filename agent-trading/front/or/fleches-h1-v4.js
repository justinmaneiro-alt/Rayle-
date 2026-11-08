/* ═════════════ FLÈCHES H1, VERSION 4 (pur, testé) ═════════════
   Règles FIGÉES « fleches-h1-v4 », écrites le 2026-11-08 AVANT le code, le diagnostic chiffré et tout test, dans leur propre commit
   (la date de ce commit ouvre le bilan de v4). Seuils repris tels quels de v2 / v3 (eux-mêmes de fleches-v1) ; le seul seuil nouveau
   (8 touches) vient de la consigne. Aucun seuil réglé d'après ce qui a été vu sur les graphiques. v1, v2, v3 restent intactes et calculées
   en parallèle. Informations de lecture du graphique, jamais un ordre. */

export const REGLES_H1_V4 = Object.freeze({
  version: 'fleches-h1-v4', periode: 'H1', ecrites: '2026-11-08',
  // niveaux admis (parmi les niveaux listés du graphique H1, calculés avec les seules bougies d'avant)
  touchesMin: 8,                                            // supports / résistances : au moins 8 touches
  liquiditesMajeures: Object.freeze(['semaine', 'mois']),   // liquidités hautes / basses : plus haut / plus bas de la semaine ou du mois précédents
  // repris de v2 / v3 (inchangés)
  ecartAtr: 0.15, meche: 0.5, volumeMedianeN: 20, listeAtr: 0.25, fenetreListe: 1600, pivotK: 3,
  opposeeBougies: 8, approcheSortieAtr: 1, memeNiveauAtr: 0.5,
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100, fraisTaker: 0.0005
});

export const TEXTE_REGLES_H1_V4 = `Règles figées ${REGLES_H1_V4.version} (écrites le ${REGLES_H1_V4.ecrites}, avant le code, le diagnostic chiffré et tout test, dans leur propre commit) :
- niveaux admis, parmi les niveaux listés du graphique H1 (règles niveaux-periode-v1, recalculés avant chaque bougie avec les seules bougies closes d'avant, 1600 au plus) : les supports et résistances d'au moins 8 touches, et les liquidités hautes / basses MAJEURES (plus haut / plus bas de la semaine ou du mois précédents, même réunis avec une autre raison) ; aucun autre niveau : ni niveau secondaire (moins de 8 touches), ni sommets / creux égaux seuls, ni veille seule ;
- flèche verte seulement sur un support admis ou une liquidité basse admise ; flèche rouge seulement sur une résistance admise ou une liquidité haute admise ; jamais ailleurs ;
- rejet (seuils repris de v2 / v3, eux-mêmes de fleches-v1) : extrême de la bougie (ou de la précédente) à moins de 0,25 ATR du niveau admis, mèche de rejet ≥ la moitié de la bougie, volume ≥ la médiane des 20 précédentes ;
- confirmation à la clôture : la bougie de rejet doit CLÔTURER du bon côté du niveau, à au moins 0,15 ATR (au-dessus pour une verte, au-dessous pour une rouge) ; flèche posée à cette clôture, jamais redessinée ni retirée ;
- une seule flèche par niveau et par approche : après une flèche sur un niveau (à moins de 0,5 ATR), aucune nouvelle flèche sur ce niveau tant que le prix n'a pas clôturé à au moins 1 ATR de lui, puis n'y est pas revenu ;
- règle C inchangée : aucune flèche en régime H1 « range » (biais H1 : EMA 20 / 50) ; aucune flèche opposée à moins de 8 bougies d'une flèche posée ;
- pas de règle A (toutes les vertes sont sur un support ou une liquidité basse, toutes les rouges sur une résistance ou une liquidité haute : c'est le cas exempté de v3) ;
- bilan depuis la date du commit de ces règles, mêmes mesures que v2 / v3 (flèches indépendantes à 8 bougies, +1 ATR avant −1 ATR en 8 bougies, R net après frais preneur 0,05 % par côté et spread mesuré, 1000 tirages au hasard même régime et mêmes heures, « pas assez de données » sous 30) ; correction de Holm sur les 4 versions ; aucune décision avant 100 flèches indépendantes nouvelles.`;
