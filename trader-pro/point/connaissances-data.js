/* GÉNÉRÉ par trader-pro/outils/connaissances.mjs à partir de docs/connaissances/*.md : ne pas modifier à la main. */
export const CONNAISSANCES = [
 {
  "id": "sessions",
  "fichier": "01-sessions.md",
  "mots": [
   "session",
   "asie",
   "londres",
   "new york",
   "killzone",
   "ouverture",
   "clôture",
   "fixing",
   "comex",
   "week-end",
   "vendredi",
   "heure d'été",
   "décalage"
  ],
  "texte": "# Les sessions de marché\n\n> Tout ce fichier décrit des **tendances générales, pas des règles**. Rayle s'en sert pour t'expliquer ce qu'elle voit, jamais pour décider à ta place.\n\n## Les horaires (heure de Paris), et pourquoi ils bougent\nChaque place financière suit SON heure locale. Les heures de Paris changent donc deux fois par an, et **pas toutes en même temps** :\n- États-Unis : heure d'été du 2e dimanche de mars au 1er dimanche de novembre. Europe : du dernier dimanche de mars au dernier dimanche d'octobre. Japon : jamais.\n- Conséquence : environ **3 semaines en mars** et **1 semaine fin octobre / début novembre**, l'écart Paris – New York est de **5 h au lieu de 6 h**. L'ouverture du Nasdaq (9 h 30 à New York) tombe alors à **14 h 30 à Paris** au lieu de 15 h 30.\n\nRayle calcule les horaires à partir de l'heure locale (`trader-pro/lecture/sessions.js`), jamais avec un décalage fixe. Horaires d'un jour d'hiver commun (Paris UTC+1) :\n\n| Repère | Heure locale | Heure de Paris (hiver) |\n|---|---|---|\n| Ouverture de Tokyo (début de « l'Asie ») | 9 h 00 Tokyo | 1 h 00 |\n| Ouverture de Londres | 8 h 00 Londres | 9 h 00 |\n| Fixing de l'or de Londres (LBMA, matin) | 10 h 30 Londres | 11 h 30 |\n| Futures américains / chevauchement Londres–New York | 8 h 00 New York | 14 h 00 |\n| Ouverture COMEX (or) | 8 h 20 New York | 14 h 20 |\n| Ouverture cash Nasdaq / S&P 500 | 9 h 30 New York | 15 h 30 |\n| Fixing de l'or de Londres (LBMA, après-midi) | 15 h 00 Londres | 16 h 00 |\n| Clôture de Londres | 16 h 30 Londres | 17 h 30 |\n| Clôture cash Nasdaq / S&P 500 | 16 h 00 New York | 22 h 00 |\n| Fin de la session New York pour Rayle | 17 h 00 New York | 23 h 00 |\n\nSessions de Rayle : **Asie** (Tokyo 9 h → Londres 8 h), **Londres** (Londres 8 h → New York 8 h), **New York** (New York 8 h → 17 h), **creux du soir** (New York 17 h → Tokyo 9 h).\n\nSources vérifiées le 24/11/2026 : horaires NYSE 9 h 30–16 h et LSE 8 h–16 h 30 (IG, CMC Markets) ; fixing LBMA 10 h 30 et 15 h heure de Londres ([LBMA](https://www.lbma.org.uk/prices-and-data/lbma-gold-price/lbma-gold-price), [spécification IBA](https://www.ice.com/publicdocs/futures/IBA_Gold_Auction_Specification.pdf)) ; futures de l'or sur Globex du dimanche 17 h au vendredi 16 h heure de Chicago avec pause d'une heure ([CME](https://cmegroup.com/markets/metals/precious/gold.timeAndSales.html)).\n**À revérifier** : CME a annoncé (avis 9766, juin 2026) le passage du contrat d'or 1 once en 24 h/24 à partir du 24/07/2026 ([avis](https://www.cmegroup.com/content/dam/cmegroup/notices/ser/2026/06/ser-9766.pdf)). Bourse de Tokyo : 9 h–15 h 30 depuis novembre 2024 (certaines sources donnent encore 15 h : à confirmer sur le site de JPX).\n\n## Comportements typiques par session (tendances générales)\n- **Asie : le range.** Souvent calme sur l'or et les indices (l'amplitude reste souvent sous la moitié de l'ATR journalier). Le haut et le bas de ce range deviennent des repères pour Londres. Exception : une annonce japonaise ou chinoise.\n- **Ouverture de Londres : le balayage.** Fréquemment, le prix casse brièvement le haut OU le bas du range asiatique (il va chercher les ordres stop), puis revient dans le range et prend sa vraie direction. Rayle regarde si Londres a « balayé puis est revenu » (plutôt un piège) ou « cassé et tient » (plutôt une vraie sortie).\n- **Ouverture de New York : continuation ou retournement.** Soit New York prolonge Londres (surtout les jours d'annonce dans le sens de la tendance), soit elle le retourne autour de l'ouverture cash. Aucun des deux n'est systématique ; Rayle le décrit, elle ne le prédit pas.\n- **Clôture de Londres (17 h 30 Paris l'hiver)** : retournements fréquents car les gros acteurs européens débouclent leurs positions.\n- **Vendredi soir et week-end** : liquidité faible. Les indices et l'or (COMEX) sont fermés ; le Bitcoin et Solana tradent 24 h/24, 7 j/7 avec un volume plus faible : mouvements plus nerveux, moins fiables, écarts d'ouverture du lundi fréquents.\n- **Jours d'annonce (CPI, NFP, FOMC)** : calme relatif avant (le marché attend), mèche violente à la publication, direction souvent incertaine pendant 15 à 60 minutes puis plus claire. Rayle conseille la prudence avant, pas d'agir pendant la mèche.\n\n## Les killzones (créneaux à forte activité)\nHeures locales : **Londres 2 h – 5 h (heure de New York)**, **ouverture de Londres 8 h – 10 h (heure de Londres)**, **New York 7 h – 10 h (heure de New York)**. Ce sont les créneaux où les plus gros mouvements d'une journée commencent le plus souvent. Un mouvement hors killzone n'est pas faux, mais il est en général moins soutenu.\n\n## Exemple réel (fiche de lecture de l'or, 24/11/2026)\nAsie plutôt calme (−0,1 %, amplitude 0,7 ATR), Londres a balayé le bas du range asiatique puis est revenu dessus (+0,6 %), puis New York a retourné le mouvement de Londres avec −2,4 % (amplitude 1,1 ATR du jour) : un comportement « New York retourne Londres » **inhabituellement fort**. Rayle le dit comme un fait et rappelle que la session suivante part de ce niveau."
 },
 {
  "id": "ma200",
  "fichier": "02-ma200.md",
  "mots": [
   "ma200",
   "moyenne mobile",
   "cassure",
   "rebond",
   "retest",
   "réintégration",
   "fausse cassure",
   "tendance",
   "daily",
   "h4"
  ],
  "texte": "# La MA200 (moyenne mobile sur 200 bougies)\n\n> Tendance générale, **pas une règle**. La MA200 est un repère de lecture, pas un signal d'ordre.\n\n## Ce que c'est\nLa moyenne des 200 dernières clôtures de l'unité de temps regardée. Sur le H4, 200 bougies = environ 33 jours de marché ; sur le Daily, environ 10 mois. Plus l'unité est grande, plus la MA200 compte.\n\n## Comment Rayle la lit\n- **Position et pente** : prix au-dessus d'une MA200 qui monte = tendance haussière ; prix en dessous d'une MA200 qui descend = tendance baissière ; prix d'un côté avec une pente de l'autre = situation « mixte », à ne pas surinterpréter.\n- **Distance** : en % et surtout en ATR. Un prix à 7 ATR de la MA200 est très étiré : un rebond sur la MA200 est alors peu probable à court terme, le marché a d'abord tendance à se calmer.\n- **Rebond dans le sens de la tendance** : dans une tendance haussière, un repli jusqu'à la MA200 puis une reprise est le scénario d'achat classique, et inversement à la baisse. Mieux vaut sur H4/Daily que sur H1.\n- **Cassure + retest** : le prix clôture de l'autre côté, revient toucher la MA200, puis repart dans le sens de la cassure. Un retest réussi renforce la cassure ; un retest qui échoue est un avertissement.\n- **Réintégration après une fausse cassure** : si le prix repasse du bon côté en quelques bougies, la cassure est « échouée ». Ces échecs sont fréquents et piègent ceux qui entrent trop tôt ; ils sont souvent suivis d'un mouvement dans l'autre sens.\n- **Premières touches = souvent du bruit** : une mèche qui dépasse la MA200 sans clôture au-delà n'est pas une cassure. Rayle exige une clôture à plus de **0,3 ATR** de la MA200, puis plusieurs clôtures qui tiennent (Daily et H4 : 2 ; H1 : 3), avant de dire « confirmée ».\n- **Cassure + volume** : une cassure sur une bougie dont le volume vaut au moins **×2** la normale est une « vraie cassure » pour Rayle ; sans volume, elle est plus fragile (voir `03-volume.md`).\n\n## Pour le trading Daily\nLa MA200 **Daily** donne le sens de fond ; la MA200 **H4** donne le sens de l'impulsion et le bon moment pour entrer dans le sens du Daily. Quand Daily et H4 sont du même côté, le contexte est le plus lisible ; quand ils s'opposent, la H4 est souvent un simple repli ou rebond dans la tendance Daily.\n\n## Pièges\n- En **range**, le prix traverse la MA200 sans cesse : les cassures sont du bruit. Rayle regarde l'efficacité (Kaufman) : sous 0,3, on est en range.\n- Sur M5/M15, la MA200 n'est utilisée qu'en détection interne ; elle n'a de poids que si le contexte H4/Daily va dans le même sens.\n- Le passé ne garantit rien : dans l'historique de Rayle, seule la cassure confirmée de la MA200 Daily résiste à tous les tests ; les rebonds perdent."
 },
 {
  "id": "volume",
  "fichier": "03-volume.md",
  "mots": [
   "volume",
   "bougie volume",
   "extrême",
   "épuisement",
   "capitulation",
   "absorption",
   "zone",
   "climax"
  ],
  "texte": "# Le volume\n\n> Tendance générale, **pas une règle**. Une bougie à gros volume dit « il s'est passé quelque chose ici », pas « le prix va monter ».\n\n## Le volume relatif\nVolume de la bougie ÷ médiane du volume des 50 bougies précédentes (même actif, même unité). **×2 et plus = fort**, **×3 et plus = extrême**. Sans volume fiable (DXY, volume nul, source changée), Rayle ne dit rien : elle ne devine pas.\n\n## Les lectures classiques\n- **Volume extrême tout en haut d'un mouvement haussier** (contexte « fin de mouvement ») : **épuisement possible**, méfiance. Les derniers acheteurs entrent, les gros vendent dans cette demande. C'est un avertissement, pas un feu rouge : si le prix refait un plus haut ensuite, l'épuisement était faux.\n- **Volume extrême en bas d'un mouvement baissier** : **capitulation possible** (les derniers vendeurs paniquent). Un rebond suit souvent, mais seulement s'il tient au-dessus du bas de la bougie.\n- **Cassure avec volume** : une sortie de range ou une cassure de MA200 à ×2 ou plus est plus sérieuse qu'une cassure sans volume.\n- **Cassure sans volume** : souvent un piège ou un simple glissement ; à surveiller si le prix revient dans le range.\n- **Absorption** : gros volume mais bougie petite ou mèche longue = quelqu'un absorbe l'offre ou la demande. Si le prix ne continue pas malgré le volume, le camp qui poussait s'épuise.\n- **Zones laissées par les bougies extrêmes** : le corps d'une bougie à volume extrême devient une zone de support (achat) ou de résistance (vente) tant qu'aucune clôture ne la traverse. Le prix y revient souvent.\n\n## Les statistiques de Rayle\nPour chaque actif et unité, la base mesure ce qui s'est passé après les bougies à fort volume (continuation ou retournement à +5 bougies, mouvement moyen en ATR), découpé par contexte. **Sous 20 cas, Rayle dit « échantillon trop petit » et ne donne aucun pourcentage.** Exemple réel (or, H4, 24/11/2026) : sur 292 bougies H4 à fort volume, 44 % ont continué et 56 % se sont retournées à +5 bougies : presque pile ou face, donc le volume seul informe peu ; il faut le contexte (niveau, MA200, session).\n\n## Pièges\n- Le volume des indices et de l'or n'est pas le volume mondial (contrats d'une bourse ou d'un perpétuel).\n- Un pic de volume à l'ouverture de New York ou lors d'une annonce est normal ; un pic hors heure d'activité est plus parlant."
 },
 {
  "id": "structure",
  "fichier": "04-structure.md",
  "mots": [
   "support",
   "résistance",
   "pdh",
   "pdl",
   "plus haut",
   "plus bas",
   "balayage",
   "liquidité",
   "double bas",
   "range",
   "tendance",
   "w"
  ],
  "texte": "# La structure de marché\n\n> Tendance générale, **pas une règle**.\n\n- **Supports et résistances** : zones où le prix a réagi plusieurs fois. Plus de touches et plus de récence = niveau plus solide. Un niveau n'a de poids que s'il converge avec un autre repère (MA200, PDH/PDL, zone de volume).\n- **PDH / PDL** (plus haut / plus bas de la veille) et **PWH / PWL** (de la semaine passée) : les repères les plus regardés par les autres traders ; le prix s'y arrête, ou les traverse brièvement.\n- **Balayage de liquidité** : le prix passe au-delà d'un niveau évident (là où se trouvent les stops) puis **revient** de l'autre côté. Souvent suivi d'un mouvement dans la direction opposée au balayage. Rayle le signale quand la bougie revient clôturer en deçà du niveau (jusqu'à une bougie plus tard).\n- **Range asiatique** : haut et bas de la session asiatique, balayés à l'ouverture de Londres (voir `01-sessions.md`).\n- **Égaux hauts / égaux bas** : plusieurs sommets (ou creux) au même prix = réservoir de stops que le prix vient parfois chercher.\n- **Double bas / W** : deux creux proches, le second sans nouveau plus bas, puis cassure du sommet intermédiaire. Le W est confirmé par la cassure, pas par le second creux. Inverse : M.\n- **Range ou tendance** : Rayle mesure l'efficacité sur 20 clôtures (variation nette ÷ somme des variations) : au-dessus de 0,3 on parle de tendance. En range, on travaille les bords ; en tendance, on suit les replis. **Compression** : l'ATR tombe sous 75 % de sa médiane récente ; une volatilité basse précède souvent un mouvement, sans en donner le sens.\n- **Premium / discount** : prix dans la moitié haute (premium) ou basse (discount) du range de la semaine précédente. En tendance haussière, on regarde plutôt les replis en discount."
 },
 {
  "id": "macro",
  "fichier": "05-macro.md",
  "mots": [
   "cpi",
   "nfp",
   "fomc",
   "pce",
   "pib",
   "ism",
   "eia",
   "opep",
   "taux réels",
   "dollar",
   "cot",
   "annonce",
   "inflation",
   "emploi"
  ],
  "texte": "# Macro et annonces\n\n> Tendance générale, **pas une règle**. La réaction dépend de l'**écart avec le consensus**, pas de l'annonce elle-même. Heures de Paris d'hiver (14 h 30 = 8 h 30 à New York ; elles bougent de ±1 h pendant les semaines de décalage).\n\n| Annonce | Quand | Ce qu'elle mesure | Effet habituel |\n|---|---|---|---|\n| **CPI** (inflation) | mensuel, 8 h 30 NY (14 h 30 Paris) | prix à la consommation | Plus fort que prévu : taux et dollar en hausse, **or et indices plutôt en baisse**, crypto plutôt en baisse. Plus faible : l'inverse. |\n| **NFP** (emploi) | 1er vendredi du mois, 8 h 30 NY | créations d'emplois | Chiffre fort : dollar et taux en hausse, or sous pression ; chiffre faible : baisses de taux plus probables, or et indices plutôt soutenus. Révisions et chômage comptent autant. |\n| **FOMC** (taux de la Fed) | 8 réunions par an, 14 h NY (20 h Paris), conférence à 14 h 30 NY | décision et ton | Le **ton et les projections** comptent plus que la décision, déjà anticipée. Mouvements souvent en deux temps : mèche à 14 h, vraie direction pendant la conférence. |\n| **PCE** | mensuel | inflation préférée de la Fed | Même logique que le CPI, effet un peu plus faible car moins surprenant. |\n| **PIB** | trimestriel | croissance | Effet modéré sauf grosse surprise. |\n| **ISM** | début de mois, 10 h NY | enquête industrie / services | Surprise forte : indices et dollar bougent ; l'or réagit via les taux. |\n| **Stocks de pétrole EIA** | mercredi, 10 h 30 NY | stocks de brut américains | Stocks plus bas que prévu : pétrole plutôt en hausse ; plus hauts : plutôt en baisse. |\n| **OPEP / OPEP+** | réunions irrégulières | production | Baisse de production : pétrole en hausse ; hausse : en baisse. Le ton avant la réunion compte. |\n\n## Les liens à connaître\n- **Or** : monte quand les **taux réels** (taux nominaux moins inflation attendue) baissent et quand le **dollar** baisse ; il monte aussi dans les crises (valeur refuge). Mais une inflation forte peut le pénaliser si elle fait monter les taux.\n- **Dollar (DXY)** : soutenu par des taux américains plus hauts que le reste du monde.\n- **Nasdaq / S&P** : sensibles aux taux (valorisations des valeurs de croissance) et aux résultats des grandes entreprises (Nvidia, Apple, Microsoft).\n- **Bitcoin / Solana** : suivent la **liquidité** (taux plus bas = favorable) et l'appétit pour le risque ; réagissent aussi à l'actualité propre (ETF, régulation).\n- **Pétrole** : offre (OPEP, sanctions, stocks), demande (croissance mondiale), dollar.\n- Exemple réel : le 13/10/2022, un CPI américain plus fort que prévu a fait chuter le Nasdaq en début de séance, puis il a terminé en nette hausse : la réaction initiale n'est pas la réaction finale, d'où la prudence pendant la mèche.\n\n## Le COT (positionnement des fonds)\nPublié le vendredi pour le mardi précédent (3 jours de retard). Rayle calcule un **index de 0 à 100** sur 3 ans pour les spéculateurs : au-dessus de 80, positionnement extrêmement acheteur (risque de retournement si tout le monde est déjà dedans) ; sous 20, extrêmement vendeur. Un extrême COT n'est **pas** un timing : il peut durer des semaines. À lire avec la structure et le volume."
 }
];
