# Rayle v12 — mêmes graphiques partout, Bookmap, voix Vivienne garantie, rapports qui expliquent

Journal de la session autonome du 22/11/2026 (instructions : `prompt-rayle-v12-corrections.md`, non copié dans le dépôt). Version publiée : voir `sw.js` (2026.11.22.5 et suivantes).

## Phase 1 — Une seule série de prix, échelle du Classique, chevauchement

### Causes trouvées (et corrigées à la source)

1. **BTC : historique du Volume figé au 30/07 (117 800), puis une bougie à 60 709.** Sur la page d'un actif autre que l'or, `agent-trading/front/or/adaptateur-instrument.js` remplace `window.fetch` pour répondre aux requêtes du moteur du Classique (Kraken / Binance XAUUSDT) avec les bougies Yahoo. Il interceptait **toute** URL `https://fapi.binance.com/fapi/v1/klines…`, donc aussi les requêtes du mode Volume pour `BTCUSDT`, et y répondait avec `bougies.filter(…).slice(0, limit)` : les 1 500 bougies **les plus anciennes** (fin 07/2025) au lieu des 1 500 les plus récentes. Le Volume raccordait donc son historique long, puis la bougie en direct, avec un trou de 15 mois. Preuve par sonde Chrome : `chargerBarres('btc','H4')` rendait 2024-11-23 → 2025-07-30 dans la page BTC et 2026-03 → 2026-11 hors de la page.
   Corrections : (a) l'adaptateur ne détourne plus que les requêtes du moteur (`symbol` absent ou `XAUUSDT`) ; (b) sans `startTime`, il rend les `limit` bougies les plus **récentes** avant `endTime` (sémantique de Binance) ; (c) il expose `window.__fetchReel`.
2. **Échelle cassée du Classique (bougies écrasées, moitié droite vide, échelle 2 400 – 6 000).** La référence de volume Binance (XAUUSDT) a des bougies à des heures où le prix n'en a pas (week-ends, pauses : 1 886 dates en trop sur l'or H1). `graphique-or.js` les envoyait à la série de volume : ces dates en trop **s'ajoutent à l'axe du temps** de Lightweight Charts, décalent tous les indices logiques (dernière bougie à l'indice 13 921 au lieu de 12 035), et la vue par défaut (calculée sur le *nombre* de bougies) tombait des mois en arrière, avec l'échelle des prix de cette période. Correction : le volume n'est dessiné que sous les bougies qui existent, avec la même date graphique que la bougie du même instant. Filets de sécurité : `recaler()` (échelle automatique + 150 dernières bougies, marge à droite), appelé au retour du Volume, au bouton **Auto**, et par une garde toutes les 1,2 s tant que l'utilisateur n'a pas touché le graphique.
3. **Chevauchement** du sélecteur Classique | Volume (flottant à `right: 74px`) avec **Log** et **Auto** : le sélecteur passe à `right: 6px`, la barre Log / Auto descend à `top: 40px`.

### Architecture : une seule série

- `trader-pro/terminal/serie-unique.js` : `serieUnique(unite)` rend les bougies de l'actif de la page **exactement comme le Classique** (sa série `moteur.serie()` pour l'unité affichée ; pour une autre unité, la même fonction de chargement que le moteur, `chargerHistorique` + `serieAffichee`). Prix remis à l'échelle d'origine (EUR/USD, USD/CHF ×10 000, DXY ×100). Exposée aussi comme `window.__serieUnique(unite)` (rapports, cerveau).
- `trader-pro/commun/bougies-uniques.js` (pur, testé) : `canoniser(unique, volume, pas)` rattache le volume (`v`) et le volume acheteur (`bv`) du mode Volume aux bougies de la série unique par la date (milieu de la bougie en cas de grilles décalées, futures à :00 et indice à :30). **Aucun prix ne vient plus du Volume.** `comparer(A, B)` sert au test.
- `volume-ui.js` : `unifier()` après `chargerBarres` (aussi pour les séries annexes ICT / HTF) ; si la série du Classique n'est pas prête (20 s), le Volume affiche provisoirement sa source et **réessaie** toutes les 6 s. Exception voulue : l'or avec la source « futures COMEX » choisie à la main.
- `serie-continue.js` : `raccorder(…, { avantSeulement: true })` — l'historique long ne sert qu'**avant** la première bougie de la série unique (grilles :00 / :30 des indices).
- Mode Volume : `etat().canon` indique l'origine de la série.

### Tests

- Pur, dans `npm test` : `bougies-uniques-test` (14).
- **Bloquant, Chrome** : `npm run test:bougies` (= `trader-pro/tests/bougies-uniques-chrome.mjs tablette`) : pour chaque actif (OR, NASDAQ, SP500, BTC, SOL, EURUSD, USDCHF, DXY) et chaque unité (H1, H4, Jour), les 300 dernières bougies du Classique et du Volume ont la même date et les mêmes O, H, L, C (la bougie en cours : moins de 1 % d'écart) ; code de sortie 1 sinon. Résultat : 8 actifs × 3 unités = 24/24 identiques.
  **Pétrole** : il n'existe ni dans le Classique ni dans le Volume (pas d'instrument) ; il ne peut donc pas être comparé (il n'apparaît que dans Marchés).
- `echelle-classique-chrome.mjs [vue] [actif] [unité] [allers-retours]` : échelle correcte au chargement, à chaque retour du Volume, après changement d'unité (OR H4 ×3, OR Jour ×10 : tout passe).
- Limite : les séries annexes du Volume pour une unité autre que celle du Classique (onglets ICT, HTF) utilisent la même fonction de chargement que le moteur, mais pas le même objet mémoire.

## Phase 2 — Bookmap (terminal Volume)

**Utilisation.** Mode Volume → bouton **Bookmap** (barre du haut, à côté de Footprint). Grisé, avec l'infobulle qui explique pourquoi, pour le Nasdaq, le S&P 500, EUR/USD, USD/CHF et le dollar (pas de carnet public gratuit). Disponible pour **Bitcoin, Solana et l'or** (perpétuels Binance).

**Ce qui est affiché** (un canvas 2D qui remplace le graphique en bougies tant que Bookmap est allumé ; le panneau de droite du Volume reste) :
- **Carte de chaleur** : une ligne par niveau de prix (case ≈ 0,003 % du prix, 1/2/5 × 10^k, jamais sous le pas de cotation : BTC 1 $, SOL 0,01, or 0,1), une colonne par seconde (échelle **Secondes**, ≈ 5 minutes visibles) ou par 10 secondes (échelle **Minutes**, ≈ 50 minutes). Chaque case garde la quantité **maximale** vue pendant la seconde (un mur éphémère reste visible). Palette noir → bleu nuit → turquoise → jaune → blanc.
- **Bulles** : chaque transaction au-dessus du seuil ; vert = achat agressif, rouge = vente agressive ; rayon ∝ √(volume / seuil). Seuil réglable : multiple (×0,25 … ×4) du seuil automatique (97,5e centile des tailles récentes, mesuré en continu ; rien tant qu'il y a moins de 20 transactions).
- **Ligne de prix** blanche (milieu du carnet), **profil du carnet actuel** à droite (barres vertes / rouges, normalisé au 95e centile), axe des prix avec étiquette du prix, axe du temps.
- Réglages : contraste, seuil des bulles, échelle de temps (mémorisés par actif). Gestes : glisser (prix et temps), molette ou pincement (zoom vertical), double appui ou **Auto** (recentrer).

**Données.** `bookmap-flux.js` : carnet complet **par différences toutes les 100 ms** (`@depth@100ms`, adresse « public » de Binance) reconstruit selon la méthode officielle (instantané REST de 1 000 niveaux, contrôle `pu`/`u`, resynchronisation automatique à chaque trou, remise à zéro à chaque reconnexion) + transactions agrégées (`@aggTrade`, côté de l'agresseur). Mesuré sur BTC : ≈ 10 mises à jour par seconde, 0 resynchronisation en 30 s, 2 800 à 3 500 niveaux dans le carnet local. Les flux ne tournent que **Bookmap allumé** ; ils sont coupés au retour au Classique, à la fermeture du Volume ou au changement d'actif. Tant que Bookmap est affiché, le graphique caché du Volume n'est plus redessiné à chaque message (la charge de l'appli mesurée sur ce PC passe de 3,6 s à 1,2 s de tâches longues par 4 s).

**Stockage local (IndexedDB `rayle-bookmap`).** Blocs d'environ 30 s (colonnes + bulles), jamais envoyés nulle part ; purge des blocs plus vieux que la durée gardée ; relecture au démarrage (seulement les blocs du même palier). **Durée gardée selon la mémoire de l'appareil** (`navigator.deviceMemory`) : ≥ 8 Go → 6 h ; ≥ 4 Go → 3 h ; 2 Go → 1 h 30 ; moins → 1 h ; mémoire inconnue (Safari, Firefox) → 2 h ; toujours limitée à 5 % de l'espace libre (≈ 12 Mo par heure de carte). **Honnêteté** : Binance ne fournit aucun historique du carnet et je n'ai pas trouvé de source gratuite : la carte **commence à l'ouverture de la page** (ou reprend celle de la visite précédente, avec un trou visible pour le temps où la page était fermée). C'est écrit dans la note sous la carte, et une ligne pointillée marque « la carte commence ici ».

**Fluidité.** On ne dessine que la zone visible : une image de ≈ 300 × 220 pixels agrandie, table d'intensité précalculée (aucune puissance par case), rafraîchie une fois par seconde (nouvelle colonne) ou à 20 images/s pendant un geste, rien quand la page est cachée. Mesures (Chrome, ce PC sans GPU) : 8 à 25 ms par image, BTC et or, processeur ralenti ×4 compris. La tablette réelle n'est pas disponible depuis cette session.

**Rayle l'explique** : fiche « Volume : le Bookmap (carte de chaleur de la liquidité) » dans `manuel-rayle.md` (« Rayle, explique-moi le Bookmap », « c'est quoi les bulles vertes et rouges »).

**Tests.** Purs (`npm test`) : `bookmap-test` (33 : carnet local officiel, grille, bulles, palette, durée). Chrome (flux réels) : `bookmap-chrome.mjs [vue] [BTC|OR|SOL] [secondes] [ralentissement]`, `bookmap-reprise-chrome.mjs` (actifs grisés, carte relue après rechargement : 18 colonnes).

## Phase 3 — Vivienne (Azure) en priorité, vérifiable

**Constat du code.** Toute prise de parole (réponses, rapports, alertes, briefing) passe par `speak()` (`core/voice/voix.js`) → `VoixMoteurs.chaine(choisi())` = **[voix choisie, Piper de secours]** (jamais `speechSynthesis`, test `voix-unique-test`). La voix choisie par défaut est Vivienne **si `azureDispo()`**. Voici pourquoi Piper pouvait parler à sa place — quatre causes réelles, toutes corrigées :

1. **Un HTTP 429 d'Azure = « quota du mois atteint » = 6 heures de Piper.** Le Worker `rayle-voix` renvoyait `mois: true` à chaque 429 de Microsoft ; or l'offre gratuite F0 n'accepte **qu'une requête à la fois (et 20 par minute)** : la préparation de l'étape suivante d'un rapport, en parallèle de la lecture, déclenchait des 429. Corrigé des deux côtés : le Worker fait une reprise après 1,3 s puis répond `limiteDebit: true` (+ `Retry-After`), et ne dit `mois: true` que si la réponse parle de quota ou si le compteur local est dépassé ; le navigateur met les requêtes Azure **en file (une à la fois, 1,2 s d'écart)**, attend et reprend (jusqu'à 4 tentatives sur un 429) ; seule la vraie fin de quota (`mois`) met Azure en pause 6 h.
2. **Toute annulation (nouvelle phrase, « stop », « suivant ») mettait Azure en pause 60 s** (l'`AbortError` était pris pour un délai dépassé). Corrigé : une annulation n'a plus aucun effet sur Azure ; `fetchT` écoute maintenant le signal de l'appelant.
3. **Après la moindre panne : 60 s de Piper.** Maintenant : une reprise, puis Piper, et **20 s** de pause au plus (la raison est gardée).
4. **État d'Azure inconnu = Piper** (tant que `/sante` n'avait pas répondu, `azureDispo()` était faux). Maintenant : inconnu = on essaie Azure d'abord. Délai de requête 14 s → 25 s.
   Et : une voix Piper restée mémorisée (ancien essai) passait devant Vivienne ; **migration unique** (`rayle_voix_v12_vivienne`) : retour au choix automatique ; Piper reste choisissable dans Réglages → Voix.
   Bonus : la même phrase demandée deux fois en même temps (préparation + lecture) ne part qu'**une fois** chez Azure (les caractères sont comptés).

**Indicateur discret** (pastille en bas à gauche, 3 s après la fin de la parole) : « **Vivienne · Azure** » ; en secours « **Siwis · secours** » (en orange), avec la **raison au survol**. La raison est aussi gardée (`rayle_voix_secours`) et affichée dans **État des données** (« Dernier passage en voix de secours : … — raison : … », et « Azure en pause jusqu'à … »). Elle s'efface quand Azure reparle.

**Découpage.** Inchangé et vérifié : une étape de rapport = une requête Azure (blocs de 3 500 caractères au plus pour une réponse longue), l'étape suivante préparée en avance ; maintenant sans doublon de requête.

**Tests.** `worker-voix/tests/azure-test.mjs` (26, dont 429 de débit / reprise / quota), `trader-pro/tests/voix-priorite-azure-chrome.mjs` (20, vraie voix de l'appli, Azure simulé qui sait limiter le débit et tomber en panne : état inconnu → Azure ; 2 × 429 → 3 tentatives, aucun Piper, aucune pause ; annulation → aucune pause ; une requête à la fois ; panne → Piper + raison + indicateur ; retour automatique à Vivienne ; jamais `speechSynthesis`), `voix-v9-chrome.mjs` (34, régression ; « une seule tentative » devient « une reprise puis Piper »).

## Phase 4 — Rapports qui expliquent au lieu de réciter

**Ce qui change.**
1. **Plus de case de texte.** La carte `#ra-panneau` (en bas de l'écran, `core/commun/reponse-anim.js`) écrivait le texte de la réponse au rythme de la voix : le paragraphe `.ra-texte` n'existe plus, et la carte elle-même ne s'ouvre que s'il y a des **chiffres clés** à montrer (les étiquettes, les « bulles »). Le coin de la petite Rayle (`#miniDit`) ne recopie plus ce que Rayle dit (il garde l'écho de ce que *tu* dis). Les chiffres restent dans les fenêtres, les cartes et les bulles. (Le sous-titre de la galaxie et l'option « sous-titres » des Réglages sont inchangés : ce sont des choix distincts.)
2. **Nouvelle narration** — `trader-pro/rapports/narration.js` (calcul pur, testé) remplace les phrases récitées de `construire.js` (les **cartes** et les **détails** gardent tous les chiffres) :
   - **voir → comprendre → surveiller** dans cet ordre ; Rayle *interprète* (« les fonds ont commencé à racheter : c'est souvent un début de retournement ») au lieu de lire les mesures ;
   - **au plus deux chiffres parlés par étape**, arrondis (« 3 620 environ », « environ 3 pour cent »), seulement s'ils servent ; les dates deviennent « mardi en soirée », « il y a quelques mois » ; les titres d'actualité ou de risque venus d'ailleurs ne sont dits que sans chiffre ;
   - phrases courtes, termes expliqués en quelques mots (« la zone de valeur, là où se fait l'essentiel des échanges », « le prix le plus échangé ») ; ATR, percentile, « contrats nets », « fois la moyenne », « POC nu » ne sont plus récités ;
   - le COT dit **qui achète, qui vend, si ça change, si c'est un extrême et ce que ça implique** ; le prix se lit en « fond haussier, court terme dans le même sens » ; les scénarios disent la condition, l'invalidation et pourquoi la confiance est forte ou faible, sans lister les paliers.
3. **Consigne donnée à l'IA** (`core/intelligence/cerveau.js`, bloc « STYLE À L'ORAL ») et au manuel interne (fiche « Rapports guidés ») : mêmes règles pour les réponses d'analyse libres. `cerveau.js`, `reponse-anim.js/.css` sont verrouillés par la v8 : empreintes mises à jour (`verrou-v8-test --maj`) après les bancs `images-chrome` (28/28), `banc-30-chrome` (3/3), `cerveau-chrome` (15/16 : la seule réserve — « la réponse affichée contient le prix arrondi » — est une faiblesse ancienne du test : 3578,56 arrondi à 3579 n'est pas une sous-chaîne de « 3578.56 ») et `pilotage-chrome` (13/16 : l'ouverture du terminal dans le cadre dépasse les 90 s du test sur ce PC, avant et indépendamment de la narration ; contrôle équivalent fait dans `rapports-v12-chrome`).
4. **Bonus quota** : un rapport est nettement plus court à l'oral (mesures ci-dessous). Les estimations de coût affichées avant la lecture sont recalculées (`COUT_MOYEN_ETAPE`).

**Longueur et chiffres, avant → après** (mêmes données de test, `trader-pro/tests/rapports-textes.mjs`) :

| Rapport | Caractères avant | Caractères après | Chiffres max / étape avant | après |
|---|---|---|---|---|
| Complet sur l’or | 4311 | 3203 (-26 %) | 16 | 2 |
| COT Nasdaq | 1971 | 1382 (-30 %) | 14 | 1 |
| Marché global | 3698 | 2895 (-22 %) | 13 | 2 |
Avec les **vraies données de production** (banc Chrome, vraie voix) : complet sur l'or ≈ 3 300 caractères (≈ 5 000 à 5 300 avant : −35 %), COT Nasdaq ≈ 1 450 (≈ 2 000 avant : −27 %), marché global ≈ 2 850 (≈ 4 400 avant : −35 %). Au plus 2 chiffres par étape dans les trois cas.

**Comparaison avant / après sur 3 rapports** (extraits, données de test) :

**Rapport complet sur l’or — étape « Scénarios »**

- *Avant* : Scénarios. Scénario haussier : si clôture H4 au-dessus de 3 624,55 (PDH), entrée possible : retest de 3 624,55 après la cassure, ou rebond sur 3 584,92 (POC H4). Invalidation : clôture H4 sous 3 576,82. Objectifs : 3 675 (PWH), puis 3 729,04 (FVG baissier (bas)). Confiance fort : 4 signal(aux) sur 4 dans le même sens (Weekly, Daily, H4, prix par rapport à la MA200 Daily). Scénario alternatif. Scénario baissier : si clôture H4 sous 3 584,92 (POC H4), entrée possible : retest de 3 584,92 par en dessous, ou rejet sur 3 624,55 (PDH). Invalidation : clôture H4 au-dessus de 3 632,66. Objectifs : 3 512,86 (PWL), puis 3 458,82 (PDL). C’est toi qui décides : ce sont des conditions à surveiller, pas des ordres.
- *Après* : Scénario principal : haussier, s’il clôture en H4 au-dessus de PDH, 3 620 environ, avec pour objectif PWH. Il serait invalidé sous 3 580 environ. Confiance forte : Weekly, Daily, H4 et la MA200 vont dans le même sens. Scénario inverse : une clôture H4 sous POC H4. Conditions à surveiller, pas des ordres : c’est toi qui décides.

**Rapport complet sur l’or — étape « Daily »**

- *Avant* : Daily : tendance haussière, marché en tendance, plus hauts et plus bas hauts (structure haussière). Le prix est au-dessus de la MA200 Daily à 3 422,79 (écart +5,3 pour cent). Dernière bougie Daily : haussière, grande (1,5 ATR), encore en cours, doji et marteau (pin bar haussière), rejet du support POC H4 (clôture au-dessus), rejet du support VAL H4 (clôture au-dessus), volume fort (1,78 fois la moyenne). La bougie d’avant : inside bar, rejet du support POC H4 (clôture au-dessus). On est sur le support ton niveau tracé en H4 3 602,22 (à 0,0 %).
- *Après* : En Daily, la tendance est haussière : les sommets et les creux montent. Le prix est nettement au-dessus de la MA200 Daily : tendance de fond haussière. Dernière bougie Daily : haussière, grande, pas encore terminée. Longue mèche basse : les vendeurs ont été repoussés, plutôt favorable aux acheteurs. Elle a rebondi sur le support POC H4. Volume fort : l’intérêt est réel. Le prix est juste sur un de tes niveaux tracés. À surveiller : une clôture sous 3 600 environ ouvrirait la baisse.

**Rapport COT sur le Nasdaq — étape « Positions nettes »**

- *Avant* : Rapport COT sur le Nasdaq 100, mesure du mardi 17/11/2026, publiée le vendredi. Fonds spéculatifs (managed money) : positions nettes 128 739 contrats, en baisse de 6 570 sur la semaine. Ce sont les gros spéculateurs, qui suivent les tendances. Commerciaux (producteurs et négociants) : -115 865 contrats nets, +5 913 sur la semaine. Ce sont les producteurs et intermédiaires, qui couvrent leur activité. Les petits spéculateurs ne sont pas fournis par la source utilisée : je ne peux pas les lire.
- *Après* : Rapport COT sur le Nasdaq : les positions de mardi, publiées vendredi. Les gros fonds, qui suivent les tendances, sont plutôt acheteurs. Mais ils ont allégé cette semaine : l’élan s’essouffle. Les commerciaux, qui se couvrent, font l’inverse : c’est normal. Les petits spéculateurs ne sont pas dans ma source.

**Rapport COT sur le Nasdaq — étape « Historique »**

- *Avant* : Historique sur 200 semaines : 3 épisode(s) d’extrême acheteur et 2 d’extrême vendeur. Derniers extrêmes acheteurs : 06/05/2025 (indice 84) ; 02/06/2026 (indice 82), puis +2,3 pour cent de prix en huit semaines. Derniers extrêmes vendeurs : 29/10/2024 (indice 17) ; 02/12/2025 (indice 19).
- *Après* : La dernière fois qu’ils étaient aussi acheteurs, c’était il y a quelques mois. Huit semaines plus tard, le prix avait en moyenne gagné environ 2,5 pour cent. La dernière fois qu’ils étaient aussi vendeurs, c’était il y a environ un an. Petit échantillon : une indication, pas une règle.

**Rapport marché global — étape « Or »**

- *Avant* : OR : Daily haussier, H4 haussier : haussier, prix 3 602,94. On est sur le support ton niveau tracé en H4 3 602,22 (à 0,0 %).
- *Après* : L'or : fond haussier, court terme dans le même sens. Il est sur un de tes niveaux tracés : une clôture sous 3 600 environ ouvrirait la baisse.

**Tests.** `narration-test` (22, dans `npm test`), `rapports-test` (54 : au plus 2 chiffres parlés par étape sur les 4 types de rapport, longueur −20 % au moins, plus de jargon récité, voir/comprendre/surveiller), `moteur-test` (84), `rapports-v12-chrome.mjs` (réel : voir phase 5).

## Phase 5 — Contrôles et publication

| Contrôle | Résultat |
|---|---|
| `npm test` (tests purs, dont `bougies-uniques-test` 14, `bookmap-test` 33, `narration-test` 22, `rapports-test` 54, `moteur-test` 84, `azure-test` 26) | passe en entier |
| **Mêmes bougies partout** (`npm run test:bougies` : OR, NASDAQ, SP500, BTC, SOL, EURUSD, USDCHF, DXY × H1, H4, Jour, 300 dernières bougies, tablette) | **24/24 identiques**, après toutes les modifications (pétrole : aucun instrument dans le Classique ni le Volume, non comparable) |
| BTC en Volume et en Classique | même série (même dernière date, mêmes O H L C) ; plus de saut de 15 mois (117 833 → 60 709) ; plus de « −48 % » sur une bougie |
| Échelle du Classique après 10 allers-retours Classique / Volume | OR Jour ×10, BTC H4 ×10, OR H4 ×3 : `cassee: false`, dernière bougie à droite avec 5 bougies de marge, 100 % de la hauteur occupée, échelle automatique |
| Chevauchement Classique \| Volume / Log / Auto | aucun recouvrement sur tablette 1024×768, téléphone 412×915, PC 1600×900 (rectangles mesurés) |
| Bookmap BTC et or (tablette simulée, vraies données Binance) | BTC : 30 colonnes en 30 s, ≈ 10 mises à jour/s, 0 resynchronisation ; dessin 20 ms (processeur normal), 56 ms (ralenti ×4) ; or : 18 ms ; carte relue après rechargement (18 colonnes) ; Nasdaq et EUR/USD : bouton grisé avec la raison |
| Vivienne (Azure) | `voix-priorite-azure-chrome` 20/20, `voix-v9-chrome` 34/34 ; pendant les 3 rapports en vrai (`rapports-v12-chrome` : Piper simulé pour le détecter) : **Piper n'a jamais parlé**, l'indicateur dit « Vivienne · Azure » à chaque échantillon |
| Rapports en vrai (vraies données, vraie voix, Azure simulé) | complet sur l'or 11/11, COT Nasdaq 11/11, marché global 11/11 : au plus **2 chiffres parlés par étape**, pas de jargon récité, **aucune case de texte** (ni `.ra-texte`, ni le coin de la petite Rayle, ni aucun élément visible portant le texte dit) ; `rapports-chrome` complet or 21/21, COT 19/19, marché 19/20 (seul écart : un blanc de 2,9 s au lieu de 2 s, voir limites) |
| Régressions | `images-chrome` 28/28, `banc-30-chrome` 3/3, `bookmap-reprise-chrome` 18/18 ; `cerveau-chrome` 15/16 et `pilotage-chrome` 13/16 (voir phase 4 : deux faiblesses anciennes des tests, pas de la v12) |

### Les 3 choses à tester en premier (sur la tablette)
1. **BTC en mode Volume** : ouvre la page Bitcoin, H4, passe de Classique à Volume et reviens plusieurs fois. Même prix, même historique (plus de trou en juillet 2025), échelle toujours bien cadrée, et le sélecteur ne cache plus Log / Auto.
2. **« Rayle, rapport complet sur l'or »** puis **« rapport COT sur le Nasdaq »** : elle explique au lieu de réciter, la pastille en bas à gauche dit « Vivienne · Azure », et plus aucune case de texte en bas de l'écran. Si tu l'entends autrement, regarde la raison (survol de la pastille orange, ou Réglages → État des données).
3. **Bookmap** : mode Volume sur Bitcoin ou l'or → bouton **Bookmap**. Laisse tourner quelques minutes : la carte commence à l'ouverture et se garde ensuite sur l'appareil ; essaie le contraste, le seuil des bulles, « Secondes » / « Minutes » ; « Rayle, explique-moi le Bookmap ».

### Limites honnêtes
- **Tablette réelle et Galaxy S23 : non essayés** (inaccessibles depuis cette session). Tout est mesuré en Chrome simulé (vue, agent utilisateur, processeur ralenti ×4) sur un PC sans GPU. La fluidité du Bookmap (20 à 56 ms par image, une image par seconde au repos) et le blanc entre deux étapes de rapport (jusqu'à ≈ 3 s à la première ouverture du terminal en simulation) sont à confirmer sur l'appareil.
- Le **Bookmap n'a pas d'historique avant l'ouverture de la page** (Binance n'en fournit pas) ; les heures gardées dépendent de la mémoire de l'appareil (1 h à 6 h). Binance seulement (pas Kraken) ; si une région bloque Binance, le flux reste « injoignable » et le bouton ne fait rien d'utile.
- **Pétrole** : absent du Classique comme du Volume (aucun instrument) : il n'entre pas dans le test « mêmes bougies partout ».
- Les séries annexes du Volume (onglets ICT / HTF) pour une unité autre que celle du Classique reposent sur la même fonction de chargement que le moteur, pas sur le même objet en mémoire.
- Le Worker principal `rayle` n'est **pas** touché ; `rayle-voix` est redéployé (correctif du HTTP 429).
