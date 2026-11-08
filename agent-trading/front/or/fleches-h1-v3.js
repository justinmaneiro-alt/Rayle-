/* ═════════════ FLÈCHES H1, VERSION 3 (pur, testé) ═════════════
   Règles FIGÉES « fleches-h1-v3 », écrites le 2026-11-08 AVANT le code et tout test, dans leur propre commit (la date de ce commit ouvre
   le bilan de v3). v3 = v2 avec la règle A corrigée ; B et C inchangées ; aucun seuil réglé sur des flèches déjà vues (tous repris de v2,
   eux-mêmes repris de fleches-v1). v2 reste intacte et calculée en parallèle. Informations de lecture du graphique, jamais un ordre. */

export const REGLES_H1_V3 = Object.freeze({
  version: 'fleches-h1-v3', periode: 'H1', ecrites: '2026-11-08', base: 'fleches-h1-v2',
  // repris de v2 (inchangés)
  ecartAtr: 0.15, meche: 0.5, volumeMedianeN: 20, pivotK: 3,
  listeAtr: 0.25, fenetreListe: 1600,
  opposeeBougies: 8, approcheSortieAtr: 1, memeNiveauAtr: 0.5,
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100,
  fraisTaker: 0.0005,
  // A corrigée : le blocage ne vaut que hors des niveaux « du bon côté »
  sansBlocageHausse: Object.freeze(['support', 'liquidité basse']),
  sansBlocageBaisse: Object.freeze(['résistance', 'liquidité haute'])
});

export const TEXTE_REGLES_H1_V3 = `Règles figées ${REGLES_H1_V3.version} (écrites le ${REGLES_H1_V3.ecrites}, avant le code et tout test, dans leur propre commit ; = fleches-h1-v2 avec la règle A corrigée) :
- ATR, régime H1, niveaux listés et rejet : exactement comme fleches-h1-v2 (seuils de fleches-v1 : clôture à ≥ 0,15 ATR du niveau, mèche ≥ la moitié de la bougie, volume ≥ la médiane des 20 précédentes) ;
- A corrigée : après un rejet sur résistance, une flèche verte n'attend un creux plus haut confirmé QUE si elle est posée ailleurs que sur un support ou une liquidité basse listés ; un achat sur un support ou une liquidité basse listés est autorisé dès la première touche, sans attendre de creux plus haut. Miroir : après un rebond sur support, une flèche rouge n'attend un sommet plus bas confirmé que si elle est posée ailleurs que sur une résistance ou une liquidité haute listées ;
- B inchangée : seulement sur un niveau ou une liquidité listés, à moins de 0,25 ATR ;
- C inchangée : aucune flèche en régime H1 « range » ; une seule flèche par approche (même niveau à moins de 0,5 ATR : une autre flèche seulement après une clôture à au moins 1 ATR du niveau) ; aucune flèche opposée à moins de 8 bougies ;
- flèche posée à la clôture de la bougie de confirmation (la bougie de rejet), jamais redessinée ni retirée ;
- bilan depuis la date du commit de ces règles : mêmes mesures que v2 (flèches indépendantes à 8 bougies, +1 ATR avant −1 ATR en 8 bougies, R net après frais preneur 0,05 % par côté et spread mesuré, 1000 tirages au hasard même régime et mêmes heures, « pas assez de données » sous 30) ; correction de Holm sur les 3 versions (v1, v2, v3) ; aucune décision avant 100 flèches indépendantes nouvelles.`;
