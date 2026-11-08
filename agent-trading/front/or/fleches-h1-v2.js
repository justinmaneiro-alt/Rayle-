/* ═════════════ FLÈCHES H1, VERSION 2 (pur, testé) ═════════════
   Règles FIGÉES « fleches-h1-v2 », écrites le 2026-11-08 AVANT tout test et toute mesure, dans leur propre commit (la date de ce commit
   ouvre le bilan : seules les flèches posées après comptent). Seuils repris tels quels de « fleches-v1 » (jamais retouchés d'après les
   flèches déjà vues) ; les seuils nouveaux sont ceux de la consigne (0,25 ATR, 8 bougies) ou fixés ici une fois pour toutes (1 ATR).
   Affichées UNIQUEMENT en H1 ; v1 reste calculée en arrière-plan. Informations de lecture du graphique, jamais un ordre. */

export const REGLES_H1_V2 = Object.freeze({
  version: 'fleches-h1-v2', periode: 'H1', ecrites: '2026-11-08',
  // repris de fleches-v1 (inchangés)
  ecartAtr: 0.15, meche: 0.5, volumeMedianeN: 20, pivotK: 3,
  // B : seulement sur un niveau ou une liquidité LISTÉS (ceux du graphique H1, calculés avec les seules bougies d'avant)
  listeAtr: 0.25, fenetreListe: 1600,
  // C : pas en range ; une flèche par approche ; pas de flèche opposée à moins de 8 bougies
  opposeeBougies: 8, approcheSortieAtr: 1, memeNiveauAtr: 0.5,
  // bilan
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100,
  fraisTaker: 0.0005   // futures Kraken, preneur : 0,05 % par côté ; + spread mesuré
});

export const TEXTE_REGLES_H1_V2 = `Règles figées ${REGLES_H1_V2.version} (écrites le ${REGLES_H1_V2.ecrites}, avant tout test, dans leur propre commit ; affichées seulement en H1) :
- ATR = moyenne simple des 14 dernières étendues vraies (comme fleches-v1) ; régime H1 = règle du biais H1 : clôture au-dessus des EMA 20 et 50 et EMA 20 > EMA 50 = haussier, l'inverse = baissier, sinon « range » ;
- niveaux listés = supports, résistances et zones de liquidité du graphique H1 (règles niveaux-periode-v1), recalculés à chaque bougie avec les seules bougies closes AVANT elle (1600 au plus) ;
- rejet : l'extrême de la bougie (ou de la précédente) à moins de 0,25 ATR d'un niveau listé (B), clôture à au moins 0,15 ATR du niveau du côté d'où vient le prix, mèche de rejet ≥ la moitié de la bougie, volume ≥ la médiane des 20 précédentes (seuils de fleches-v1) ; liquidité haute : rejets vers le bas seulement, liquidité basse : vers le haut seulement ;
- A : pas de flèche verte après un rejet sur résistance tant qu'un creux plus haut (pivot de 3 bougies, au-dessus du creux confirmé précédent, formé après ce rejet) n'est pas confirmé ; miroir : pas de flèche rouge après un rebond sur support tant qu'un sommet plus bas n'est pas confirmé ;
- C : aucune flèche quand le régime H1 de la bougie est « range » ; une seule flèche par approche (même niveau à moins de 0,5 ATR : une autre flèche seulement après une clôture à au moins 1 ATR du niveau) ; aucune flèche opposée à moins de 8 bougies d'une flèche posée ;
- flèche posée à la clôture de la bougie de rejet, jamais redessinée ni retirée ;
- bilan depuis la date du commit des règles, par version : flèches indépendantes (une flèche à moins de 8 bougies de la précédente est regroupée avec elle) ; réussite = +1 ATR atteint avant −1 ATR dans les 8 bougies (les deux dans la même bougie = −1 ATR) ; R net = résultat en ATR (à défaut de cible ou de stop : clôture de la 8e bougie) moins les frais futures preneur (0,05 % par côté) et le spread mesuré ; contre 1000 flèches au hasard (même régime, même heure de Paris, même sens) ; « pas assez de données » sous 30 flèches ; aucune décision avant 100 flèches indépendantes nouvelles par version.`;
