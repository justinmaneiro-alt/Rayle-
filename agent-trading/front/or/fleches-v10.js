/* ═════════════ VERSION 10 : SURVEILLANCE DE MES OUTILS DESSINÉS, FLÈCHES ET CROIX (pur, testé) ═════════════
   Règles FIGÉES « fleches-v10 », écrites le 2026-11-08 AVANT le code et tout test, dans leur propre commit (la date de ce commit ouvre le
   bilan de v10). Les seuils viennent de la consigne (0,5 ATR, 0,25 ATR, 1 ATR, 0,5 ATR, 48 bougies, 30 événements) ou sont repris de v2
   (ATR, bilan) ; les autres sont fixés ici une fois pour toutes. Aucun seuil réglé d'après les graphiques. v1 à v9 restent intactes et
   calculées en parallèle. Informations de lecture, pas un signal ni une promesse ; jamais un ordre. */

export const REGLES_V10 = Object.freeze({
  version: 'fleches-v10', ecrites: '2026-11-08',
  unite: 'H1',                     // détection sur les bougies H1 CLOSES de Kraken PF_XAUUSD (prix du graphique)
  atrN: 14,                        // ATR = moyenne simple des 14 dernières étendues vraies H1, connue à la clôture de la bougie d'avant
  approcheAtr: 0.5,                // approche : extrême de la bougie à moins de 0,5 ATR de l'objet
  toucheAtr: 0.25,                 // touche : extrême de la bougie à au plus 0,25 ATR de l'objet (ou au-delà)
  reboundAtr: 1,                   // rebond confirmé : clôture à au moins 1 ATR du bon côté, sans nouvel extrême depuis la touche
  cassureAtr: 0.5,                 // cassure confirmée : clôture à au moins 0,5 ATR au-delà de l'objet
  finApprocheAtr: 1,               // une approche finit à la première clôture à au moins 1 ATR de l'objet (de son côté)
  excursionBougies: 48,            // registre : excursion favorable / défavorable sur les 48 bougies H1 suivantes, en ATR et en %
  minEvenements: 30,               // bilan par type d'outil : « pas assez de données » sous 30 événements
  delaiAlerteMin: 30,              // alertes : une alerte identique (même objet, même type) au plus toutes les 30 minutes
  // bilan des flèches (repris de v2)
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100, fraisTaker: 0.0005
});

export const TEXTE_REGLES_V10 = `Règles figées ${REGLES_V10.version} (écrites le ${REGLES_V10.ecrites}, avant le code et tout test, dans leur propre commit) :
- surveillance : sur les bougies H1 CLOSES de Kraken PF_XAUUSD (aucun repeint : un événement de la bougie i n'utilise que les bougies jusqu'à i) ; ATR = moyenne simple des 14 dernières étendues vraies H1 à la bougie d'avant ; chaque objet n'est surveillé qu'à partir de sa création (ou de sa confirmation pour un niveau proposé) ;
- valeur de l'objet à la bougie : ligne horizontale = son prix ; zone = de son bas à son haut ; ligne de tendance et rayon = la droite passant par leurs deux ancres, à l'heure de la bougie (surveillée à partir de la première ancre, prolongée à droite) ; position = ses trois prix ;
- côté : l'objet est un support si la clôture précédente est au-dessus de lui, une résistance si elle est au-dessous (zone : clôture au-dessus du haut ou au-dessous du bas ; dans la zone, le dernier côté connu) ; distance = écart entre l'extrême de la bougie tourné vers l'objet (plus bas pour un support, plus haut pour une résistance) et l'objet, 0 s'il l'atteint ou le dépasse ;
- approche : distance ≤ 0,5 ATR alors que l'approche précédente est finie ; une alerte légère ; touche : distance ≤ 0,25 ATR, une fois par approche ; une approche finit à la première clôture à au moins 1 ATR de l'objet, de son côté ;
- rebond confirmé (flèche v10) : après une touche, la première bougie qui CLÔTURE à au moins 1 ATR du bon côté (au-dessus d'un support, au-dessous d'une résistance), sans qu'aucune bougie depuis la touche (elle comprise) n'ait fait un nouvel extrême au-delà de celui de la touche ; petite flèche verte sur un support, rouge sur une résistance, posée à cette clôture, jamais déplacée ; une seule par objet et par approche ; un nouvel extrême annule l'attente (une nouvelle touche de la même approche peut la relancer) ;
- cassure confirmée : une CLÔTURE à au moins 0,5 ATR au-delà de l'objet → petite croix à cette bougie ; l'objet est marqué « retourné » (ancien support → résistance et inversement) et une nouvelle approche peut commencer ;
- position : touche de l'entrée, du stop, de l'objectif (une fois chacune), et +1 R atteint dans le sens de la position (proposer de passer à break-even) ; sens : achat si le stop est sous l'entrée ;
- alerte de prix libre (case « m'alerter ») : le prix atteint l'objet (distance 0), une fois par approche ;
- alertes : historique (objet, type, prix, heure) ; jamais deux alertes identiques (même objet, même type, même bougie) ; au plus une alerte du même type pour le même objet toutes les 30 minutes ; elles ne fonctionnent que tant que Rayle est ouvert ;
- registre daté, en ajout seul : chaque approche, touche, rebond confirmé et cassure, puis (quand les 48 bougies suivantes sont closes) son excursion favorable et défavorable, en ATR et en %, dans le sens du rebond (cassure : dans le sens de la cassure) ; jamais utilisé comme décision ; bilan par type d'outil, « pas assez de données » sous 30 événements ;
- bilan des flèches v10 depuis la date du commit de ces règles, mêmes mesures que v2 (flèches indépendantes à 8 bougies, +1 ATR avant −1 ATR en 8 bougies, R net après frais preneur 0,05 % par côté et spread mesuré, 1000 tirages au hasard même régime et mêmes heures, « pas assez de données » sous 30) ; correction de Holm sur toutes les versions suivies (v1 à v10) ; aucune décision avant 100 flèches indépendantes nouvelles.`;
