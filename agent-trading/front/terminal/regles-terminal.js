/* ═════════════ RÈGLES FIGÉES « alertes-terminal-v1 » (écrites le 2026-11-08 AVANT le code et tout test, dans leur propre commit) ═════════════
   Surveillance des outils dessinés dans le terminal de Rayle, sur les 5 actifs et toutes les unités. Les seuils sont ceux de la consigne
   (0,5 ATR, 0,25 ATR, 1 ATR, 0,5 ATR, 48 bougies, 30 événements) ; les autres sont fixés ici une fois pour toutes. Ces règles sont DISTINCTES
   de « fleches-v10 » (or, H1) : v1 à v10, leurs règles et leurs registres ne sont pas modifiés et restent calculés à part.
   Information de lecture, pas un signal ni une promesse ; jamais un ordre. */
export const REGLES_TERMINAL = Object.freeze({
  version: 'alertes-terminal-v1', ecrites: '2026-11-08',
  atrN: 14,                    // ATR = moyenne simple des 14 dernières étendues vraies de l'unité surveillée, connue à la clôture de la bougie d'avant
  approcheAtr: 0.5,            // approche : extrême de la bougie à moins de 0,5 ATR de l'objet
  toucheAtr: 0.25,             // touche : extrême à au plus 0,25 ATR (ou au-delà)
  reboundAtr: 1,               // rebond confirmé : clôture à au moins 1 ATR du bon côté, sans nouvel extrême depuis la touche
  cassureAtr: 0.5,             // cassure confirmée : clôture à au moins 0,5 ATR au-delà de l'objet
  finApprocheAtr: 1,           // une approche finit à la première clôture à au moins 1 ATR de l'objet, de son côté
  excursionBougies: 48,        // registre : excursion favorable / défavorable sur les 48 bougies suivantes de l'unité surveillée
  minEvenements: 30,           // bilans : « pas assez de données » sous 30 événements (ou 30 trades)
  delaiAlerteMin: 30,          // une alerte du même type pour le même objet au plus toutes les 30 minutes
  // zones de réaction (profil de volume)
  profilBougies: 500,          // profil calculé sur les 500 dernières bougies closes de l'unité affichée (prix Kraken, jamais la bande ancienne)
  profilCases: 60,             // 60 cases de prix entre le plus bas et le plus haut de ces bougies
  zonesMax: 4,                 // au plus 4 zones proposées : les cases dont le volume est un maximum local et ≥ 1,5 × la médiane des cases
  zonesSeuil: 1.5,
  zoneTenue: { rejet: 0.5, depassement: 0.25 }   // un test « tient » si le prix s'en éloigne d'au moins 0,5 ATR avant de la dépasser de 0,25 ATR
});

export const TEXTE_REGLES_TERMINAL = `Règles figées ${REGLES_TERMINAL.version} (écrites le ${REGLES_TERMINAL.ecrites}, avant le code et tout test, dans leur propre commit) :
- unité surveillée : celle affichée quand l'objet est créé (modifiable ensuite) ; détection sur les bougies CLOSES de cette unité, prix Kraken de l'actif (ou la source de secours étiquetée) ; aucun repeint : un événement de la bougie i n'utilise que les bougies jusqu'à i ; ATR = moyenne simple des 14 dernières étendues vraies à la bougie d'avant ; chaque objet n'est surveillé qu'à partir de sa création ;
- valeur de l'objet : ligne horizontale = son prix ; zone = de son bas à son haut, à partir de son premier point ; ligne de tendance et rayon = la droite passant par leurs deux ancres, à l'heure de la bougie, prolongée à droite ; ligne verticale, texte et mesure : jamais surveillés ;
- côté : support si la clôture précédente est au-dessus de l'objet, résistance si elle est au-dessous (zone : au-dessus du haut / au-dessous du bas ; dedans, le dernier côté connu) ; distance = écart entre l'extrême de la bougie tourné vers l'objet et l'objet, 0 s'il l'atteint ou le dépasse ;
- approche : distance ≤ 0,5 ATR alors que l'approche précédente est finie ; touche : distance ≤ 0,25 ATR, une fois par approche ; une approche finit à la première clôture à au moins 1 ATR de l'objet, de son côté ;
- rebond confirmé : après une touche, la première bougie qui CLÔTURE à au moins 1 ATR du bon côté sans qu'aucune bougie depuis la touche (elle comprise) n'ait fait un nouvel extrême au-delà de celui de la touche → petite flèche verte sur un support, rouge sur une résistance, posée à cette clôture, jamais déplacée ; une seule par objet et par approche ;
- cassure confirmée : une CLÔTURE à au moins 0,5 ATR au-delà de l'objet (au-delà de son bord éloigné pour une zone) → petite croix à cette bougie ; l'objet devient « retourné » (ancien support → résistance et inversement) et une nouvelle approche peut commencer ;
- alerte de prix libre (case « m'alerter ») : le prix atteint l'objet (distance 0), une fois par approche ;
- alertes : historique (objet, type, prix, heure), son discret, notification, Telegram seulement si activé (désactivé par défaut) ; jamais deux alertes identiques (même objet, même type, même bougie) ; au plus une du même type pour le même objet toutes les 30 minutes ; elles ne fonctionnent que tant que Rayle est ouvert (un événement survenu Rayle fermé est inscrit au registre, sans alerte) ;
- registre daté, en ajout seul : chaque approche, touche, rebond confirmé et cassure, puis (quand les 48 bougies suivantes sont closes) son excursion favorable et défavorable en ATR et en %, dans le sens du rebond (cassure : dans le sens de la cassure) ; jamais utilisé comme décision ; bilan par type d'outil, « pas assez de données » sous 30 événements ;
- zones de réaction : profil de volume des 500 dernières bougies closes de l'unité affichée en 60 cases ; zones = cases maximum local du volume et ≥ 1,5 × la médiane des cases (4 au plus, les plus fortes) ; statistiques réelles sur ces bougies : un « test » = une approche (règles ci-dessus) ; il « tient » si le prix s'en éloigne d'au moins 0,5 ATR avant de la dépasser de 0,25 ATR ; affichage « testée N fois, a tenu M », jamais un pourcentage ; choisie comme support ou résistance, la zone devient un objet ordinaire avec les mêmes alertes ;
- positions (outil Position) : états en attente (entrée non touchée), ouverte (entrée touchée), objectif atteint, stop touché (stop avant objectif si les deux sont dans la même bougie), annulée (retirée avant l'entrée), clôturée à la main ; +1 R atteint dans le sens de la position → proposition de passer à break-even ; résultat en R au prix de sortie ; sens : achat si le stop est sous l'entrée.`;
