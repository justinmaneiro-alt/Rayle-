/* ═════════════ FLÈCHES H1, VERSION 6, ET NIVEAUX H1 AFFICHÉS v6 (pur, testé) ═════════════
   Règles FIGÉES « fleches-h1-v6 » et « niveaux-h1-v6 », écrites le 2026-11-08 AVANT le code et tout test, dans leur propre commit
   (la date de ce commit ouvre le bilan de v6). v6 = fleches-h1-v5 + deux ajouts. Seuils repris de v5 / v2 ; les seuils nouveaux viennent
   de la consigne (0,5 ATR, 6 bougies) ou sont fixés ici une fois pour toutes (2 niveaux retournés par côté). Aucun seuil réglé d'après ce
   qui a été vu sur les graphiques. v1 à v5 restent intactes et calculées en parallèle. Informations de lecture, jamais un ordre. */

export const REGLES_NIVEAUX_H1_V6 = Object.freeze({
  version: 'niveaux-h1-v6', base: 'niveaux-h1-v5', periode: 'H1',
  casseAtr: 0.5,          // un niveau est cassé par une clôture à au moins 0,5 ATR au-delà
  retournesParCote: 2     // niveaux retournés ajoutés à l'affichage : au plus 2 de chaque côté, les plus proches du prix (en plus des 6)
});

export const REGLES_H1_V6 = Object.freeze({
  version: 'fleches-h1-v6', periode: 'H1', ecrites: '2026-11-08', base: 'fleches-h1-v5', niveaux: REGLES_NIVEAUX_H1_V6.version,
  // repris de v5 (inchangés)
  ecartAtr: 0.15, meche: 0.5, volumeMedianeN: 20, pivotK: 3, listeAtr: 0.25, fenetreListe: 1600,
  opposeeBougies: 8, approcheSortieAtr: 1, memeNiveauAtr: 0.5,
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100, fraisTaker: 0.0005,
  sensParRegime: Object.freeze({ haussier: 'hausse', baissier: 'baisse' }),
  niveauxHausse: Object.freeze(['support', 'liquidité basse']), niveauxBaisse: Object.freeze(['résistance', 'liquidité haute']),
  // ajout 1 : rebond confirmé (exception au sens aligné)
  confirmationBougies: 6, confirmationAtr: 0.5
});

export const TEXTE_REGLES_H1_V6 = `Règles figées ${REGLES_H1_V6.version} et ${REGLES_NIVEAUX_H1_V6.version} (écrites le ${REGLES_H1_V6.ecrites}, avant le code et tout test, dans leur propre commit ; = fleches-h1-v5 + deux ajouts) :
- tout v5 est repris tel quel : flèche de rejet dans le sens du régime H1 (haussier → verte sur support / liquidité basse, baissier → rouge sur résistance / liquidité haute), rien en régime « range », seulement sur un niveau affiché à au plus 0,25 ATR, seuils de rejet de v2 (clôture à ≥ 0,15 ATR du bon côté, mèche ≥ la moitié, volume ≥ la médiane des 20), règle A d'origine, une flèche par approche, aucune flèche opposée à moins de 8 bougies, posée à la clôture, jamais redessinée ;
- ajout 1, rebond confirmé (seule exception au sens aligné) : une bougie TOUCHE un niveau affiché (son plus bas à au plus 0,25 ATR d'un support ou d'une liquidité basse affichés pour une verte ; son plus haut d'une résistance ou d'une liquidité haute affichées pour une rouge ; ATR de la bougie d'avant) ; si, dans les 6 bougies qui suivent, une bougie CLÔTURE à au moins 0,5 ATR du bon côté du niveau (au-dessus pour une verte, au-dessous pour une rouge) sans qu'aucune bougie entre-temps (elle comprise) ne fasse un plus bas sous celui de la touche (verte) ou un plus haut au-dessus (rouge), une flèche contre le régime est posée à la clôture de cette bougie de confirmation, jamais déplacée ensuite ; seulement si le régime H1 de cette bougie est contraire à la flèche (baissier pour une verte, haussier pour une rouge ; jamais en range) ; une chute qui perce les niveaux l'un après l'autre fait de nouveaux plus bas et ne donne donc aucune verte ; une seule flèche par niveau et par approche, aucune flèche opposée à moins de 8 bougies (règles de v5) ; la règle A de v2 ne s'applique pas à ce cas (le « pas de nouveau plus bas / plus haut » la remplace) ; la bougie de touche n'a pas de condition de mèche ni de volume (la confirmation à la clôture la remplace) ;
- ajout 2, niveaux retournés (${REGLES_NIVEAUX_H1_V6.version}) : parmi les bandes de niveaux-h1-v5 (même calcul, fusion à moins de 1 ATR), une bande dépassée par une CLÔTURE à au moins 0,5 ATR au-delà (au-dessus pour une résistance, au-dessous pour un support), après sa dernière touche et alors que le prix était de l'autre côté, est « retournée » : tant que le prix reste du nouveau côté, l'ancienne résistance est affichée comme support (« ancienne résistance ») et l'ancien support comme résistance (« ancien support ») ; une bande retournée déjà affichée garde sa place avec cette mention ; sinon elle est ajoutée, au plus 2 de chaque côté, les plus proches du prix, en plus des 6 ; ces niveaux sont utilisés par les flèches v6 comme tous les niveaux affichés ;
- bilan depuis la date du commit de ces règles, mêmes mesures que v2 / v5 (flèches indépendantes à 8 bougies, +1 ATR avant −1 ATR en 8 bougies comptées depuis la bougie de la flèche, R net après frais preneur 0,05 % par côté et spread mesuré, 1000 tirages au hasard même régime et mêmes heures, « pas assez de données » sous 30) ; correction de Holm sur toutes les versions suivies (v1 à v6) ; aucune décision avant 100 flèches indépendantes nouvelles.`;
