# Manuel interne de Rayle

Fiches courtes, une par outil de l'application. Format de chaque fiche : **C'est quoi** · **Comment le lire** · **Pour un trader H4/Daily** · **Pièges et limites** · **Où le trouver** (lignes `Fenêtre` et `Mots-clés` : pour l'IA, pas pour l'oral).
Règle d'or : ces fiches expliquent COMMENT lire un outil ; les chiffres viennent toujours des outils de lecture (jamais d'ici). Aucun outil de l'application n'envoie d'ordre : tout est de la lecture. Aide à la décision, c'est Justin qui décide.

## Terminal : modes Classique et Volume
Mots-clés: terminal, mode classique, mode volume, périodes, h1, h4, jour, unité de temps
Fenêtre: terminal
C'est quoi : le terminal a deux modes. Classique : graphique en bougies avec la MA200, les niveaux que Justin trace, les flèches, Fibonacci et l'outil position. Volume : l'analyse par le volume (profil, footprint, delta, carnet) et les bougies Weekly/HTF avec les repères ICT. Les unités de temps sont H1, H4 et Jour ; le reste de l'appli raisonne surtout en H4 et Daily.
Pièges : le graphique de la tablette peut mettre quelques secondes à se charger ; chaque dessin est évalué sur l'unité où il a été tracé.

## Terminal : la MA200 et ses flèches
Mots-clés: ma200, moyenne mobile, 200, flèches ma200, cassure ma200, rebond ma200, tendance
Fenêtre: terminal (classique) · Surligner: ligne de la MA200
C'est la moyenne simple des 200 dernières clôtures de l'unité affichée (MA200 H4 sur H4, MA200 Jour sur Jour ; sur H1 on voit la MA200 H4). La flèche est posée sur la bougie de confirmation, jamais en arrière. CASSURE : une bougie clôture de l'autre côté avec au moins 0,3 ATR de marge, la tendance change. REBOND : en tendance haussière le prix revient toucher la MA par le haut et clôture au-dessus (flèche verte) ; en baissière l'inverse. Une seule flèche de rebond par retour : le prix doit d'abord s'éloigner d'1 ATR.
Pour un trader H4/Daily : c'est le filtre de tendance de base. Prix au-dessus = on cherche des achats, en dessous = des ventes.
Pièges : en range, le prix traverse la MA200 sans cesse et les cassures sont des faux signaux ; une flèche n'est pas un ordre ; plus l'écart à la MA est grand, moins un rebond est probable à court terme.
Où : Terminal, mode Classique, ligne de la MA200 et petites flèches sur les bougies.

## Terminal : flèches de niveaux et rebonds
Mots-clés: flèches de niveaux, niveaux tracés, rebond sur niveau, cassure de niveau, retest, boîte, trendline, ligne
Fenêtre: terminal (classique)
C'est quoi : sur les niveaux que Justin a tracés lui-même (ligne horizontale, trendline, boîte), Rayle pose une flèche à la CLÔTURE de bougie. REBOND : le prix touche le niveau, la bougie clôture du bon côté avec une mèche de rejet nette (au moins 50 % de la bougie) et un volume au-dessus de la moyenne des 20 précédentes. CASSURE : clôture au-delà d'au moins 0,25 ATR avec volume supérieur à la moyenne ; le niveau passe en « cassé ». RETEST : retour sur le niveau cassé qui clôture du côté de la cassure.
Pièges : seules les bougies clôturées comptent (jamais une bougie en formation) ; un niveau mal placé donne de mauvaises flèches ; l'évaluation se fait sur l'unité où le niveau a été tracé.
Où : Terminal ; les niveaux sont les dessins de Justin.

## Terminal : Fibonacci
Mots-clés: fibonacci, fibo, retracement, 618, 382, 50
Fenêtre: terminal (classique)
C'est quoi : un outil de dessin qui place les retracements (38,2 %, 50 %, 61,8 %…) entre deux points. Les flèches « rebond Fibonacci » suivent la même logique que les autres niveaux : touche, rejet, volume.
Pour un trader H4/Daily : zone de repli probable dans une tendance, à confirmer par la structure et le volume. Piège : les niveaux n'ont aucun pouvoir en soi, ils valent par la confluence avec un autre niveau (MA200, POC, PDH/PDL). Dépend du choix des deux points.
Où : Terminal, barre d'outils de dessin.

## Terminal : outil position et calculateur de lots
Mots-clés: position, calculateur, lots, taille de position, stop, risque, xtb, ratio
Fenêtre: terminal (classique)
C'est quoi : on pose entrée, stop et objectifs sur le graphique ; le calculateur donne la taille en lots XTB pour un risque fixé en euros (conversion par le taux EUR/USD). Le contrat est connu pour l'or (1 lot = 100 onces) et le Bitcoin (1 lot = 1 bitcoin) ; pour les indices et Solana la valeur par lot est marquée « à vérifier dans xStation ».
Pièges : si la valeur du contrat n'est pas vérifiée, le calcul n'est qu'un point de départ ; ne jamais s'y fier sans contrôler dans xStation. Le ratio gain/risque affiché ne dit rien sur la probabilité.

## Terminal : badge de régime
Mots-clés: régime, tendance ou range, badge, efficacité, kaufman, volatilité
Fenêtre: terminal (classique)
C'est quoi : un badge qui dit si le marché est en tendance ou en range sur l'unité affichée, avec la volatilité. Le calcul utilise le ratio d'efficacité de Kaufman sur les 20 dernières clôtures : variation nette divisée par la somme des variations absolues (0 = bruit pur, 1 = ligne droite) ; au-dessus de 0,30 on parle de tendance.
Pour un trader : en tendance on suit (cassures, rebonds sur la MA200) ; en range on évite de poursuivre les cassures et on travaille les bords. Piège : le régime change vite autour du seuil ; il décrit le passé récent.

## Terminal : voyant d'alignement Daily / H4
Mots-clés: alignement, voyant, daily h4, vert orange
Fenêtre: terminal (classique)
C'est quoi : un voyant qui compare la tendance MA200 du Daily et celle du H4. Vert = alignées (même sens), orange = Daily et H4 s'opposent, gris = pas assez de bougies (moins de 200).
Pour un trader : trade dans le sens du Daily avec un déclencheur H4 = situation la plus propre ; orange = prudence, la H4 peut être un simple repli.
Piège : l'alignement dit le sens, pas le bon moment.

## Terminal : filtre annonces
Mots-clés: annonces, filtre annonces, calendrier, fed, fomc, nfp, cpi, news
Fenêtre: terminal (classique) ; marches (section aujourdhui)
C'est quoi : les annonces économiques majeures (Fed, inflation, emploi…) sont repérées sur le graphique et dans le calendrier, classées par type. Elles servent à ne pas ouvrir un trade juste avant une annonce.
Pièges : une annonce peut créer des mèches énormes et des faux signaux ; les heures sont à lire dans le fuseau affiché. L'impact réel dépend de l'écart avec le consensus, pas du simple fait qu'elle tombe.

## Terminal : statistiques des flèches
Mots-clés: statistiques, taux de réussite, espérance, r, flèches stats, significatif
Fenêtre: terminal (classique)
C'est quoi : pour chaque type de flèche, chaque actif et H4/Jour, sur tout l'historique : taux de réussite (cible à 2 R atteinte avant le stop), R médian après 10 et 20 bougies, espérance en R, nombre de cas. Moins de 30 cas : « non significatif ».
Repère : avec cible 2 R et stop 1 R, une marche aléatoire gagne environ 1 fois sur 3. Un taux proche de 33 % ne prouve aucun avantage.
Pièges : le passé ne garantit rien ; peu de cas = bruit ; ces statistiques sont mesurées sans coûts de trading.

## Volume : Volume Profile (POC, VAH, VAL, HVN, LVN)
Mots-clés: volume profile, profil de volume, poc, vah, val, hvn, lvn, zone de valeur
Fenêtre: terminal, mode volume
C'est quoi : la répartition du volume par prix. POC = prix le plus échangé. VAH et VAL = haut et bas de la zone de valeur (environ 70 % du volume). HVN = zone de fort volume (le prix s'y attarde, support/résistance probable). LVN = zone de faible volume (le prix la traverse vite).
Pour un trader H4/Daily : le prix attiré vers le POC, rejeté ou accepté aux bords de la zone de valeur ; un LVN est une zone de vide où les mouvements accélèrent.
Pièges : dépend de la période choisie ; sur les indices et l'or le volume est celui du marché utilisé comme source, pas le volume mondial.

## Volume : POC nus
Mots-clés: poc nu, poc nus, naked poc
Fenêtre: terminal, mode volume
C'est quoi : les POC de périodes passées que le prix n'a pas encore retestés. Ils agissent souvent comme des aimants.
Pièges : un POC nu ancien vaut moins qu'un récent ; il n'a de poids qu'en confluence avec un autre niveau.

## Volume : VWAP ancrés
Mots-clés: vwap, ancré, prix moyen pondéré
Fenêtre: terminal, mode volume
C'est quoi : le prix moyen pondéré par le volume depuis un point d'ancrage (un creux, un sommet, l'ouverture d'une période). Il représente le coût moyen de ceux qui ont acheté ou vendu depuis ce point.
Lecture : prix au-dessus = les acheteurs depuis l'ancrage sont gagnants, la VWAP sert de support ; en dessous elle sert de résistance. Piège : le choix de l'ancrage change tout.

## Volume : footprint
Mots-clés: footprint, empreinte, order flow, déséquilibre, empilé, cases
Fenêtre: terminal, mode volume
C'est quoi : chaque bougie est découpée par prix, avec le volume des vendeurs agressifs (bid) et des acheteurs agressifs (ask) par case. Déséquilibre : à une case, les acheteurs sont comparés aux vendeurs de la case du dessous (et l'inverse), rapport d'au moins 3. Trois déséquilibres consécutifs du même côté = déséquilibre empilé, souvent un support ou une résistance.
Pièges : l'empreinte n'existe que là où des données côté acheteur/vendeur sont disponibles ; une bougie sans données n'a pas d'empreinte (rien n'est inventé). Lecture fine, utile surtout pour affiner une entrée.

## Volume : delta et CVD
Mots-clés: delta, cvd, volume delta, achats agressifs, ventes agressives
Fenêtre: terminal, mode volume
C'est quoi : delta = achats agressifs moins ventes agressives de la bougie. CVD = cumul du delta dans le temps. Réel quand la bourse fournit le volume côté acheteur (Binance : or via XAUUSDT, Bitcoin, Solana) ; ESTIMÉ à partir de la forme de la bougie pour les indices et les futures, et alors étiqueté comme tel.
Lecture : prix qui monte avec un CVD qui monte = mouvement soutenu ; prix qui monte avec un CVD qui baisse = divergence, essoufflement possible.
Pièges : un delta estimé est une approximation ; la divergence n'est pas un signal à elle seule.

## Volume : MFI
Mots-clés: mfi, money flow index
Fenêtre: terminal, mode volume
C'est quoi : un oscillateur de 0 à 100 sur 14 périodes qui combine prix et volume (un RSI pondéré par le volume). Au-dessus de 80 : suracheté, en dessous de 20 : survendu.
Pièges : en forte tendance il reste longtemps en zone extrême ; à lire avec la structure, pas seul.

## Volume : le carnet (déséquilibre, murs, grosses transactions)
Mots-clés: carnet, order book, déséquilibre du carnet, murs, gros ordres, grosses transactions, liquidité
Fenêtre: terminal, mode volume, onglet carnet
C'est quoi : les ordres en attente côté acheteur (bids) et vendeur (asks), regroupés par palier de prix. Déséquilibre = part des acheteurs contre vendeurs. Mur = un palier avec une quantité très supérieure aux voisins. Grosses transactions = exécutions bien au-dessus de la taille habituelle.
Pièges : le carnet est en direct seulement quand le terminal Volume est ouvert sur l'actif (Binance/Kraken) ; les murs peuvent être retirés avant d'être touchés (spoofing) ; ne jamais en déduire une direction seule.

## Volume : les bougies à fort volume (bouton « Bougies volume »)
Mots-clés: bougies volume, bougie à fort volume, gros volume, volume extrême, volume relatif, cyan, magenta, et après, zones de volume, que se passe-t-il après les grosses bougies, statistiques de volume
Fenêtre: terminal, mode volume, bouton Bougies volume, onglet Bougies volume (colonne de droite)
C'est quoi : le bouton « Bougies volume » (à la place de l'ancien Bookmap) repère sur le graphique les bougies dont le volume est anormalement grand. Volume relatif = volume de la bougie divisé par la médiane du volume des 50 bougies précédentes (même actif, même unité de temps, la bougie elle-même exclue). Fort volume : au moins 2 fois la médiane (réglable : 1,5 / 2 / 2,5 / 3). Volume extrême : au moins 3 fois. Fort volume acheteur (clôture au-dessus de l'ouverture) = bougie cyan ; fort volume vendeur = bougie magenta ; les autres bougies sont grisées (vert et rouge atténués). Un extrême a en plus un petit point au-dessus (acheteur) ou au-dessous (vendeur) de la mèche, et sa barre de volume prend la même couleur. Une bougie encore en cours qui dépasse déjà le seuil est entourée en pointillé avec la mention « en cours » : sa couleur n'est définitive qu'à la clôture.
Zones : chaque bougie extrême laisse une fine zone (son corps) prolongée vers la droite, jusqu'à ce que le prix la traverse en clôture ; on garde les 8 plus récentes encore intactes (bouton Zones pour les masquer).
« Et après ? » : un clic sur une bougie colorée ouvre une petite fenêtre : volume en multiple de la médiane, acheteur ou vendeur, position par rapport à la MA200, contexte (fin de mouvement, sortie de range, milieu de mouvement), ce qui s'est réellement passé à +1, +3, +5 et +10 bougies (en % et en ATR 14), le plus grand mouvement favorable et défavorable, haut et bas de la bougie repris ou non, puis ce qui se passe en général après des bougies similaires.
Contexte (calculé avec le passé seulement) : fin de mouvement = au moins 5 des 7 bougies précédentes dans le même sens et la bougie au plus haut (ou plus bas) des 20 dernières ; sortie de range = clôture au-dessus du plus haut (ou sous le plus bas) des 20 bougies précédentes ; sinon milieu de mouvement.
Onglet « Bougies volume » : tableau pour l'actif et l'unité affichés (achat fort, vente forte, achat extrême, vente extrême : nombre de cas, continuation et retournement à +5 bougies, mouvement moyen à +5 et +10 en ATR), découpé par contexte et par position vs MA200, plus les 5 dernières bougies à fort volume (un toucher centre le graphique dessus). Disponible en H1, H4 et Daily pour l'or, le Nasdaq 100, le S&P 500, le Bitcoin, Solana et le pétrole ; pour les autres actifs : volume non disponible.
Comment le dire : toujours donner les chiffres ET la taille de l'échantillon, sans rien promettre. Moins de 20 cas : « échantillon trop petit », aucun pourcentage. Ce sont des statistiques descriptives sur l'historique affiché, pas un signal. Appelle l'outil bougies_volume pour avoir les chiffres.
Pièges : si la source du volume change dans l'historique (l'or : futures COMEX avant le 5 août 2026, puis Binance et Kraken), la médiane n'utilise que des bougies de la même source ; sans volume fiable, une bougie n'est pas colorée (jamais de volume inventé). Une bougie à fort volume dit qu'il s'est passé quelque chose, pas dans quel sens ira le prix.
Alertes : voix de Rayle et message Telegram quand une bougie à volume extrême se clôture en H4 ou Daily (ex. « Bougie de volume extrême vendeur sur l'or en H4, ×3,4 la médiane, sous la MA200. »). Elles sont désactivées par défaut ; on les règle en bas de l'onglet Bougies volume.
Où le trouver : terminal, mode Volume, bouton « Bougies volume » dans la barre du haut (à côté de Footprint, actif par défaut) ; aussi en mode Classique (désactivé par défaut).

## Volume : flèches d'absorption, de cassure et de faux breakout
Mots-clés: absorption, cassure validée, faux breakout, flèches volume
Fenêtre: terminal, mode volume
C'est quoi : ABSORPTION : volume fort sur un niveau, petit corps, longue mèche du côté du niveau, delta qui se retourne (les ordres agressifs sont absorbés). CASSURE VALIDÉE : clôture au-delà de la VAH, de la VAL ou d'un HVN venant de l'autre côté, volume fort, delta dans le sens. FAUX BREAKOUT : le prix dépasse un niveau puis revient dedans.
Pièges : une flèche à la fois par type tous les quelques bougies (anti-bruit) ; calculées sans regarder le futur, mais restent des repères, pas des ordres.

## Volume : niveaux de réaction
Mots-clés: niveaux de réaction, réaction, zones de réaction
Fenêtre: terminal, mode volume
C'est quoi : un prix où le marché a réagi au moins 2 fois, chaque réaction étant suivie d'un mouvement d'au moins 1 ATR dans l'autre sens. Les réactions proches (moins de 0,35 ATR) forment un seul niveau. La force augmente avec la confluence : HVN, POC nus, déséquilibres empilés, absorptions.
Pièges : un niveau n'existe qu'à partir de la 2e réaction confirmée ; plus un niveau est testé, plus il s'use.

## Bougies HTF / ICT : PDH, PDL, PWH, PWL
Mots-clés: pdh, pdl, pwh, pwl, plus haut de la veille, plus bas de la semaine, repères ict
Fenêtre: terminal, mode volume, onglet htf
C'est quoi : PDH/PDL = plus haut et plus bas de la veille ; PWH/PWL = de la semaine précédente ; ouverture du jour, de la semaine, du mois. Les périodes utilisées sont les périodes terminées, jamais la bougie en cours.
Pour un trader : ce sont des aimants et des zones de réaction fréquents ; un prix qui balaie le PDH puis revient est une lecture classique de « prise de liquidité ».
Pièges : repères de lecture, pas des signaux ; le jour est celui de la séance UTC décalée de 6 h pour les futures et le forex.

## Bougies HTF / ICT : premium et discount
Mots-clés: premium, discount, équilibre, 50 %, zone chère, zone bon marché
Fenêtre: terminal, mode volume, onglet htf
C'est quoi : on découpe un intervalle (haut-bas de la période) en deux moitiés autour de 50 % : au-dessus = premium (zone chère, plutôt pour vendre dans une tendance baissière), au-dessous = discount (zone bon marché, plutôt pour acheter dans une tendance haussière).
Pièges : dépend de l'intervalle choisi ; ne dit rien sans le sens de la tendance.

## Bougies HTF / ICT : FVG
Mots-clés: fvg, fair value gap, déséquilibre de prix, imbalance, gap
Fenêtre: terminal, mode volume, onglet htf
C'est quoi : un trou entre la mèche haute de la bougie 1 et la mèche basse de la bougie 3 (ou l'inverse) quand la bougie 2 est très directionnelle. Le prix revient souvent en combler une partie. L'appli n'affiche que les FVG encore ouverts.
Pièges : tous ne sont pas retestés ; un FVG comblé complètement perd son sens ; à regarder sur Daily/H4 plutôt qu'en petites unités.

## Bougies HTF / ICT : order blocks
Mots-clés: order block, ob, bloc d'ordres, reversal candle, mean threshold, breaker, vrai order block
Fenêtre: terminal (mode ICT), mode volume, onglet htf
C'est quoi : la dernière bougie contraire (baissière pour un order block haussier) avant le retournement. Checklist en trois points, à passer un par un avec oui ou non : 1) prise de liquidité : la candidate, ou la bougie juste avant, balaie un creux (un sommet pour un baissier) — c'est ce qui donne la version la plus puissante ; 2) reversal candle : une bougie CLÔTURE au-delà du plus haut de la candidate (sous son plus bas pour un baissier), une mèche seule ne compte pas ; 3) FVG sur la reversal candle ou juste après (sans FVG, pas d'order block). Valide quand les points 2 et 3 sont réunis. Simple : la reversal candle casse seulement la candidate ; fort : le déplacement casse aussi un vrai sommet ou creux de structure. Mean threshold : le milieu de la zone, une clôture au-delà l'affaiblit. Statuts : frais, testé, cassé (clôture au-delà de l'extrémité opposée) puis breaker.
Pièges : la mèche seule ; le FVG trop tard (plusieurs bougies après) ne valide rien ; les stops laissés derrière (une consolidation aux creux intacts juste sous la zone attire le prix, qui vient souvent la chasser avant de partir). Notion d'interprétation : l'appli ne donne pas de statistique de réussite pour les order blocks (outil lecture_ict : drapeaux liquidite, fort, stopsDerriere). Dis-le clairement si on te demande des chiffres.

## ICT : lecture par unité de temps
Mots-clés: ict, unité de temps, unite, m15, h1, h4, daily, top-down, top down, en h1, en h4, en m15, en daily, graphique h1, multi-unités
Fenêtre: terminal (mode ICT)
C'est quoi : l'ICT se lit UNITÉ PAR UNITÉ, sans jamais mélanger. L'unité de référence est celle du graphique ouvert (lecture_graphique), sauf si Justin en nomme une. La réponse commence par « En M15 : », « En H1 : », « En H4 : » ou « En Daily : » et ne cite aucun élément d'une autre unité sans demande ; au moindre doute, chaque élément porte son unité (« FVG H4 »). M15 = exécution (killzones, sweeps de session, FVG et order blocks M15 ; ne donne pas la tendance de fond). H1 = le setup (structure H1, EQH / EQL, PDH / PDL, Asie et Londres, premium / discount, minuit). H4 = la carte (ITH / ITL, dealing range, PD arrays, PWH / PWL). Daily = la direction et la cible (biais du jour par PDH / PDL, LTH / LTL, FVG daily, NWOG, plages de 20, 40 et 60 jours). Top-down seulement sur demande : une rubrique par unité, de la plus haute (Daily) à la plus basse (M15), puis UNE phrase qui relie les unités et signale les contradictions.
Pièges : un FVG H4 n'est jamais « le FVG » dans une réponse H1 ; changer d'unité en cours de réponse ; ni « achète » ni « vends » : de quel côté la lecture penche, ce qui manque, l'invalidation.

## ICT : tendance de l'unité (STH, ITH, LTH)
Mots-clés: sth, stl, ith, itl, lth, ltl, tendance de l'unité, bos, mss, déplacement, bruit, swing, structure ict
Fenêtre: terminal (mode ICT)
C'est quoi : STH / STL = une bougie plus haute (plus basse) que ses deux voisines, confirmée à la clôture de la suivante. ITH = un STH encadré par deux STH plus bas (ITL : un STL encadré par deux STL plus hauts) ; LTH / LTL : même logique sur les ITH / ITL. La tendance de l'unité est haussière si la dernière cassure EN CLÔTURE est celle d'un ITH (sans ITL cassé depuis), baissière dans le cas symétrique, indécise sans cassure ou quand les deux côtés se cassent à tour de rôle (range). BOS = cassure dans le sens de la tendance, MSS = cassure qui la renverse ; un déplacement est une grande bougie franche (corps ≥ 1,5 ATR, petites mèches). Badge du terminal : « Tendance H1 : haussière · ITL 2 641 tient ».
Pièges : la cassure d'un simple STH ou STL n'est que du bruit, jamais un changement de tendance ; une mèche au-delà d'un ITH sans clôture ne casse rien ; chaque unité a sa propre structure (le H1 peut être haussier quand le H4 est baissier).

## ICT : outil lecture_ict
Mots-clés: lecture_ict, lecture ict, qu'est-ce que tu vois en ict, checklist ict, penche, invalidation, biais du jour, killzone, eqh, eql, liquidité, pd array
Fenêtre: terminal (mode ICT)
C'est quoi : lecture_ict({ actif, unite }) renvoie, pour UNE unité seulement et avec les mêmes calculs que l'affichage du terminal (ict-v2) : la tendance (ITH / ITL de référence, dernière cassure), les liquidités avec leurs distances (EQH, EQL, PDH, PDL, PWH, PWL, extrêmes de l'Asie et de Londres), les PD arrays (FVG, order blocks, breakers), le premium / discount avec l'OTE, la killzone en cours (M15 et H1), le biais du jour (Daily), la checklist de dix conditions (vrai, faux ou inconnu quand l'outil ne peut pas savoir, par exemple les annonces), et « penche » : achat, vente ou neutre avec les raisons, ce qui manque et l'invalidation. Sans unité, c'est l'unité du graphique ouvert. Pour un top-down, un appel par unité. Le résultat contient aussi `objets` : la liste nommée de ce que le bouton ICT du terminal dessine (zones rectangulaires, lignes de liquidité interne / externe, BOS / MSS, Fibonacci, killzones, scénario), avec les mêmes noms que sur l'écran, les prix et « pourquoi il est tracé » : c'est elle qui répond à « c'est quoi la zone verte à 3 550 ? ».
Comment le dire : « la lecture ICT en H1 penche à l'achat (ou à la vente, ou reste neutre) », ce qui est réuni, ce qui manque, l'invalidation au prix exact de l'outil ; une valeur absente se dit « indisponible ». Jamais d'ordre, jamais de promesse : Justin décide.
Pièges : les mesures statistiques de l'appli (ict-stats.json) ne concernent que le H1 (moteur ict-v1) ; pour M15, H4 et Daily, les éléments sont des descriptions, pas des taux de réussite.

## Bougies HTF / ICT : égaux hauts et bas
Mots-clés: égaux hauts, égaux bas, equal highs, equal lows, eqh, eql
Fenêtre: terminal, mode volume, onglet htf
C'est quoi : deux sommets (ou deux creux) presque au même prix ; au-dessus/dessous s'accumulent des ordres stop. Le marché vient souvent les chercher.
Pièges : un double sommet peut aussi être un vrai retournement ; attendre la réaction après le balayage.

## Bougies HTF / ICT : balayages de liquidité
Mots-clés: balayage, sweep, prise de liquidité, chasse aux stops
Fenêtre: terminal, mode volume, onglet htf
C'est quoi : le prix dépasse un haut ou un bas évident (PDH, PWL, égaux hauts) puis revient immédiatement de l'autre côté. Lecture classique : les stops ont été pris et le mouvement réel va dans l'autre sens.
Pièges : se confirme seulement à la clôture de bougie ; avant, c'est peut-être une vraie cassure.

## Marchés : rapport COT
Mots-clés: cot, commitments of traders, cftc, commerciaux, spéculateurs, gros spéculateurs, petits spéculateurs, positionnement, extrême
Fenêtre: marches, section cot (choisir l'actif) · Surligner: ligne COT
C'est quoi : le rapport hebdomadaire de la CFTC sur les positions nettes. Commerciaux (producteurs, couverture) ; gros spéculateurs (fonds) ; petits spéculateurs (particuliers). Publié le vendredi avec les positions du MARDI précédent : la date affichée est celle du mardi.
COT Index : position nette ramenée à son plus bas/haut sur 3 ans, de 0 (très vendeur) à 100 (très acheteur). Au-dessus de 80 ou en dessous de 20 : extrême de positionnement.
Pour un trader H4/Daily : un extrême ne donne pas la date d'un retournement, il dit que le marché est encombré d'un côté ; les commerciaux sont souvent à contre-courant des fonds.
Pièges : donnée en retard de 3 jours ; ne couvre pas l'actif entier ; rien n'est estimé quand la donnée manque.

## Marchés : macro et taux
Mots-clés: macro, taux, taux us, rendement, dollar, dxy, inflation
Fenêtre: marches, section macro
C'est quoi : le contexte de fond : taux américains, dollar, inflation, indicateurs. Un dollar fort et des taux en hausse pèsent en général sur l'or et les actifs risqués ; l'inverse les soutient.
Pièges : ce sont des relations moyennes, qui s'inversent parfois ; vérifier avec les prix réels.

## Marchés : score de marché
Mots-clés: score de marché, score, composite, confiance
Fenêtre: marches (section actifs) ; dashboard
C'est quoi : un composite de −100 (très baissier) à +100 (très haussier) par actif, en six composantes : Tendance 30, Momentum 20, Positionnement COT 15, Macro 15, Volatilité 10, Flux de volume 10 (points sur 100). Une composante sans donnée est retirée et la confiance baisse d'autant.
Pièges : le score décrit l'état du marché, il ne prévoit rien ; une confiance basse veut dire que des composantes manquent.

## Marchés : volume net USD
Mots-clés: volume net, flux, achats agresseurs, entrant, sortant
Fenêtre: marches
C'est quoi : achats agresseurs moins ventes agresseurs, en dollars. Données réelles pour l'or, le Bitcoin et Solana (Binance, volume acheteur « taker buy »). Pour les indices, une ESTIMATION étiquetée (pression de la bougie × volume, en titres) ou « non disponible ».
Pièges : l'unité n'est pas la même selon l'actif ; ne pas comparer une estimation et une mesure réelle.

## Marchés : calendrier
Mots-clés: calendrier, annonces du jour, agenda économique
Fenêtre: marches, section aujourdhui
C'est quoi : les annonces économiques du jour et de la semaine avec leur impact (fort, moyen). Utile pour savoir quand ne pas être exposé ou quand s'attendre à de la volatilité. Les heures sont affichées en heure de Paris.

## Couverture
Mots-clés: couverture, hedge, corrélation, bêta, protection
Fenêtre: couverture
C'est quoi : trouver l'actif qui protège le mieux une position. β = covariance/variance : si β est positif (actifs corrélés), la couverture va dans le sens opposé à la position, s'il est négatif, dans le même sens. La taille de la couverture vaut |β| × la taille de la position. Un backtest « sans regard vers l'avenir » compare la position seule et la position couverte.
Pièges : les corrélations changent (la stabilité est mesurée) ; une couverture réduit le risque mais aussi le gain ; elle ne protège jamais à 100 %.

## Risque global
Mots-clés: risque global, risque, limite du jour, limite de la semaine, facteurs, corrélation
Fenêtre: portefeuille, section risque
C'est quoi : le risque total de mes positions ouvertes (perte en euros si chaque stop est touché), les limites du jour et de la semaine, et les facteurs communs : or + argent + EUR/USD à l'achat = un seul gros pari contre le dollar. Lecture seule : une alerte, jamais un blocage.
Pièges : il faut avoir importé l'historique XTB et défini les stops ; une corrélation estimée est dite comme telle.

## Statistiques par setup
Mots-clés: setup, setups, statistiques par setup, journal, erreurs, discipline
Fenêtre: portefeuille, section setups
C'est quoi : mes trades regroupés par type de setup, avec taux de réussite, R moyen et erreurs fréquentes. Montre quels setups rapportent vraiment et lesquels coûtent.
Pièges : peu de trades = peu de signification ; un seul grand gain peut masquer un setup perdant.

## Mes actifs
Mots-clés: mes actifs, cher ou pas cher, verdict, indicateurs, horizons, percentile
Fenêtre: invest, section mesactifs · Surligner: carte de l'actif
C'est quoi : pour Bitcoin, Solana, l'or, le Nasdaq 100, le S&P 500 et le pétrole, une liste d'indicateurs calculés chaque jour. Chacun a sa valeur, son percentile dans SA propre histoire et un score de −1 à +1. Verdict par horizon : moyenne pondérée mise sur 0–100 (Très attractif ≥ 72, Attractif ≥ 58, Neutre ≥ 42, Peu attractif ≥ 28, à éviter en dessous), avec une confiance (part des indicateurs disponibles × accord entre eux).
Pièges : les poids changent selon l'horizon (la tendance compte pour 1–10 jours, la valeur pour 1–3 ans) ; la donnée est mise à jour une fois par jour.

## Investissement : facteurs et horizons
Mots-clés: investissement, facteurs, horizons, fiche, actions, fonds, secteurs, valeur, qualité
Fenêtre: invest
C'est quoi : des fiches d'actions, de fonds et de secteurs avec des scores par facteur (valorisation, qualité, tendance…) et par horizon (1–10 jours, 1–6 mois, 1–3 ans, 5–10 ans).
Pièges : un score élevé n'est pas une promesse ; les facteurs ne pèsent pas pareil selon l'horizon ; les données de fonds et d'actions sont celles de l'application, avec leur date.

## État des données
Mots-clés: état des données, fraîcheur, source en panne, retard
Fenêtre: réglages
C'est quoi : la liste des sources de l'appli avec dernière mise à jour, prochaine prévue, erreurs sur 24 h et état (vert, en retard au-delà de 2 fois le délai normal, en panne au-delà de 5 fois). À regarder avant de se fier à un chiffre : Rayle affiche toujours l'heure des données utilisées.


## Lecture des bougies (Weekly, Daily, H4) et position du prix
Mots-clés: lecture des bougies, bougie, pin bar, marteau, étoile filante, avalement, doji, inside bar, outside bar, marubozu, mèche de rejet, sur un support, proche, loin, position du prix, ATR, balayage
Fenêtre: terminal
C'est quoi : pour les 3 à 5 dernières bougies d'une unité, Rayle lit (1) la FORME : corps, mèches, taille en ATR (petite < 0,6 ATR, normale < 1,3, grande < 2, très grande au-delà) ; (2) les FIGURES : pin bar ou marteau (mèche basse ≥ 60 % de la bougie, corps ≤ 34 %, mèche ≥ 2 fois le corps), étoile filante (même chose côté haut), avalement haussier ou baissier (le corps avale celui de la bougie précédente), doji (corps ≤ 10 % de l'amplitude), inside bar (contenue dans la précédente), outside bar (englobe la précédente), marubozu (corps ≥ 90 %), longue mèche de rejet ; (3) le CONTEXTE : la bougie touche-t-elle un support, une résistance, la MA200, un niveau de volume (POC, VAH, VAL), un repère ICT (PDH, PDL, PWH, PWL) ou un FVG ? A-t-elle balayé le plus haut ou le plus bas des 20 dernières bougies puis réintégré ? ; (4) le VOLUME de la bougie comparé à la moyenne des 20 précédentes (fort ≥ 1,5 fois, faible ≤ 0,7 fois) et le delta s'il est mesuré.
Position du prix, en ATR de l'unité lue : « sur » un niveau = à 0,25 ATR ou moins ; « pas loin » = jusqu'à 1 ATR ; au-delà, « loin ». Un niveau sous le prix est un support, au-dessus une résistance. Sans niveau proche, Rayle dit « entre deux zones : support à X, résistance à Y ».
Pièges : une figure seule ne veut rien dire, c'est son contexte (sur un support, après une baisse, avec du volume) qui compte ; la dernière bougie Daily ou Weekly est souvent encore en cours ; sans volume mesuré (certains actifs), Rayle ne l'invente pas ; les seuils sont des conventions mesurées, pas des vérités.

## Rapports guidés (visite animée)
Mots-clés: rapport, rapport complet, rapport COT, rapport marché, rapport macro, visite guidée, suivant, reviens, pause, reprends, stop, détaille ça, historique des rapports, coût en caractères, quota Azure
Fenêtre: terminal
C'est quoi : « Rayle, rapport complet sur l'or » ouvre elle-même, l'une après l'autre, les pages concernées (Marchés, Weekly dans le terminal, Daily, H4, Volume, COT, Mes actifs, scénarios annotés, Portefeuille et risque), met en évidence ce dont elle parle (niveaux, bougies, cases du COT) et lit les vraies valeurs, avec l'heure des données. Autres rapports : « rapport COT sur l'or / le Nasdaq / l'EUR/USD », « rapport sur le marché » (huit actifs puis les deux plus intéressants), « quelles annonces cette semaine et quel impact ? ». Commandes pendant le rapport : suivant, reviens, pause, reprends, stop, détaille ça, montre-moi sur le graphique, plus vite, plus lentement ; une autre question met le rapport en attente (la voix est unique), « reprends » le relance. Chaque rapport est gardé dans l'historique (Historique dans la barre) : consultable, exportable en PDF (impression), comparable au précédent (« depuis hier, le prix a atteint le support… »).
Style (v12) : Rayle EXPLIQUE au lieu de réciter : à chaque étape elle dit ce qu'on voit, ce que ça veut dire, puis ce qu'il faut surveiller, avec au plus un ou deux chiffres arrondis (« autour de 3 550 », « environ 3 pour cent ») ; tous les chiffres restent sur les cartes à l'écran et dans « détaille ça ». Budget : une étape = une requête de voix Azure ; un rapport complet coûte environ 3 200 caractères, un rapport COT 1 400, le marché global 2 800, sur le quota gratuit de 500 000 par mois ; l'estimation est affichée avant la lecture, le coût réel à la fin.
Pièges : si une donnée manque, Rayle le dit en une phrase et passe à la suite ; le COT est lent et daté du mardi ; les petits spéculateurs ne sont pas dans la source ; l'EUR/USD n'a pas de page COT (les chiffres sont dans la carte) ; les scénarios sont des conditions à surveiller, jamais des ordres.

## Marchés : le réseau d'information (Actualité)
Mots-clés: actualité, réseau d'information, à la une, score d'importance, trump, powell, fil d'histoire, revirement, personnalités, truth social, quoi de neuf
Fenêtre: marches (onglet Actualité)
C'est quoi : un fil d'infos noté de 0 à 100 qui regroupe FinancialJuice, investingLive, les posts de Trump (Truth Social), la Fed, la BCE, la Maison Blanche, le Trésor, l'OPEP, SEC EDGAR, CoinDesk et Google News par personnalité. Une même info reprise par 5 sources = UNE carte « 5 sources ». Les infos liées (même personne, même sujet, 72 h) forment un FIL en chronologie, avec un REVIREMENT repéré quand le propos s'inverse.
Comment le lire : le score additionne qui parle, le sujet, les actifs touchés, la nouveauté, le nombre de sources et la RÉACTION RÉELLE du marché mesurée 5, 15 et 60 minutes après (« le marché a réagi : Nasdaq −0,9 % en 15 min »). Un clic sur le score donne le détail. « À la une » = les 5 infos les plus importantes des 24 dernières heures.
Pour un trader H4/Daily : une info à 80 et plus qui touche ton actif mérite un coup d'œil au graphique (MA200, niveaux), jamais une réaction automatique. Les scénarios sont des hypothèses.
Pièges : X / Twitter n'a pas d'API gratuite (les déclarations arrivent par les fils de marché et Google News, avec un peu de retard) ; une source hors ligne est marquée comme telle dans Sources et réglages ; peu de précédents = « pas assez d'historique ».
Où : Marchés, onglet Actualité ; alertes à la voix et par Telegram à partir de 80 (réglable), mode nuit réglable. Appelle l'outil reseau_info pour les chiffres.

## Marchés : annonces économiques notées
Mots-clés: annonce, calendrier, cpi, nfp, fomc, consensus, scénarios, réaction historique, note d'importance
Fenêtre: marches (onglet Aujourd'hui)
C'est quoi : chaque annonce du calendrier a une note d'importance de 0 à 100 (type d'annonce, actifs concernés, écart possible avec le consensus, contexte du moment, réaction historique mesurée). Un clic ouvre une page : consensus, précédent, heure exacte de Paris et session à ce moment-là, réaction de mes actifs aux dernières fois (15 min, 1 h, 4 h, clôture, avec le nombre de cas), scénarios « au-dessus / en dessous / conforme au consensus » avec les niveaux à surveiller et ce qui les invaliderait, puis la réaction réelle après publication.
Comment le dire : toujours « tendance habituelle, pas une règle » ; moins de 3 cas = « pas assez de cas » ; jamais de « vas-y » ni « n'y va pas ».
Pièges : la source gratuite ne donne pas toujours le chiffre publié ; la première réaction (la mèche) est souvent corrigée ; l'historique se construit semaine après semaine (NFP et stocks de pétrole sont amorcés sur 58 jours).
