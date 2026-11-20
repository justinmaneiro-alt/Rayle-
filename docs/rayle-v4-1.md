# Rayle v4.1 — Footprint dans les bougies, niveaux de réaction, zoom vertical

Document de travail (2026-11-20, session autonome). Une section par phase : décisions, limites, ce qui n'a pas pu être fait. Le mode Classique et le mode Volume v4 ne sont pas cassés (règle de départ).

## Phase 1 — Historique des transactions pour toutes les bougies

### Vérifications (faites avant d'écrire une ligne)
- **data.binance.vision** (futures « um », `aggTrades`) est joignable sans clé. Format d'une ligne : `agg_trade_id, price, quantity, first_trade_id, last_trade_id, transact_time, is_buyer_maker` ; `is_buyer_maker = true` ⇒ l'agresseur est le **vendeur**.
- **XAUUSDT y figure, mais seulement depuis le 2025-12-11** (premier fichier quotidien, listé par l'API S3 du dépôt public). L'or n'a donc **pas** de footprint avant le 11/12/2025 : mention « pas d'empreinte disponible pour cette période » (phase 2).
- BTCUSDT : depuis 2020-01 ; SOLUSDT : depuis 2020-09. Poids mesuré d'un jour : or ≈ 600 k lignes / 7,7 Mo zip ; Bitcoin ≈ 1,5 M lignes / 18 Mo zip ; Solana ≈ 0,27 M lignes.

### Décisions
- **Profondeur** : or = tout ce qui existe (depuis le 11/12/2025) ; **Bitcoin et Solana = 3 ans** (1 095 jours), conformément à la limite proposée. Le Bitcoin pèse environ 2,5 s de calcul par jour : ≈ 45 min pour 3 ans, bien dans le budget gratuit d'Actions.
- **Cases de prix** (toutes multiples entières de la case la plus fine, donc regroupements exacts) :
  | Actif | H1 | H4 | Daily |
  |---|---|---|---|
  | Or | 0,5 · 1 · 2 $ | 1 · 2 · 5 $ | 2 · 5 · 10 $ |
  | Bitcoin | 5 · 10 · 25 $ | 10 · 25 · 50 $ | 50 · 100 · 250 $ |
  | Solana | 0,05 · 0,1 · 0,25 $ | 0,1 · 0,25 · 0,5 $ | 0,25 · 0,5 · 1 $ |
  Le navigateur peut regrouper lui-même une taille en un multiple entier (zoom vertical, phase 4) : toute taille lisible est atteignable.
- **Calcul** (`outils-donnees/footprint-historique.mjs`, module pur et testé) : une transaction met à jour **une seule** case (la plus fine, par heure UTC) ; H4, Daily et les tailles plus larges se déduisent par regroupement exact (la somme est conservée, testé). Les grilles H1 / H4 / Daily sont celles de Binance (UTC), donc **les mêmes bougies** que celles du mode Volume.
- **Format** : `<actif>/<unité>/<taille>/<AAAA-MM>.json.gz` = `{ pas, u, b: [[t secondes, [[indice, vendeur, acheteur, n], …]], …] }` ; prix de la case = indice × pas. `index.json` (lu par le navigateur : plage, tailles, mois disponibles) ; `etat.json` (jours déjà faits, lu par la tâche seulement).
- **Hébergement** : branche orpheline `footprint`, servie par `raw.githubusercontent.com` (CDN). **Aucun passage par le Worker Cloudflare ni par KV**, aucun redéploiement du site pour une mise à jour de données.
- **Reprise** : jours traités du plus récent au plus ancien, avec un budget de temps (120 min) ; une exécution interrompue reprend à la suivante. Les archives du jour J-1 sont prises la nuit suivante (03 h 40 UTC).
- **Zip** : lecture en flux avec `zlib.createInflateRaw` (pas d'outil externe, marche sous Windows comme sous Linux).
- **Jour en cours** : l'archive du jour n'existe que le lendemain. Complété en direct par le flux de transactions déjà reçu (phase 2) ; ce qui s'est passé avant l'ouverture de l'appli est marqué « partielle ».
- **Pas de footprint** pour l'or avant le 11/12/2025, le Nasdaq 100, le S&P 500 et l'EUR/USD (pas de transactions gratuites avec côté). Ces bougies gardent leur volume (et Δ estimé) avec la mention « pas d'empreinte disponible pour cette période ou cet actif ».

### Mesure locale (2 jours de chacun)
- 2 jours : or 1,5 M transactions, Bitcoin 3,7 M, Solana 0,48 M en ≈ 15 s ; ≈ 35 ko/jour (or) et ≈ 70 ko/jour (Bitcoin) de fichiers compressés (toutes tailles et unités). Projection 3 ans : Bitcoin ≈ 75 Mo, Solana ≈ 30 Mo, or (11 mois) ≈ 12 Mo. **Taille réelle de la première exécution complète : voir plus bas (phase 5).**
- Contrôle : volume du jour de l'or du 19/11/2026 comparé aux bougies Binance (voir tests de phase 5).

## Phase 2 — Footprint dans les bougies (au zoom)

### Ce qui a été fait
- **Modules** (nouveaux, purs et testés sauf le dessin) : `trader-pro/volume/footprint-calcul.js` (regroupement de prix, choix de la taille de case, POC, déséquilibres, empilés), `footprint-donnees.js` (index + mois à la demande depuis la branche `footprint`, direct, rattrapage de l'heure en cours), `footprint-rendu.js` (dessin). `volume-ui.js` les branche ; **l'ancien affichage « V … / Δ … » est conservé** sous le seuil de lisibilité.
- **Seuil de lisibilité** (mesuré sur les coordonnées, donc indépendant de la version de la bibliothèque) : « bid × ask » dès 70 px par bougie ; « delta » et « volume » dès 44 px ; entre 30 et le seuil : V / Δ de la v4 ; en dessous de 30 : rien.
- **Dans chaque bougie, de haut en bas** : une ligne par case de prix ; vendeurs agressifs à gauche × acheteurs à droite, fond coloré proportionnel au volume de la case (rouge à gauche, vert à droite) ; **POC de la bougie encadré en jaune** ; **déséquilibres** (≥ 3:1, en diagonale : acheteurs de la case k contre vendeurs de k − 1, vendeurs de k contre acheteurs de k + 1) en **gras** et plus clair ; **empilés (≥ 3 cases consécutives du même côté)** soulignés par un trait dans la marge (vert à droite = acheteurs, rouge à gauche = vendeurs) ; **delta et volume totaux sous la bougie**.
- **Trois modes** (Calques → « Empreinte (affichage au zoom) ») : bid × ask (défaut), delta par niveau, volume seul (profil horizontal vendeur / acheteur dans la bougie). Le choix est gardé.
- **Survol (souris) ou toucher** d'une case : prix de la case, acheteurs, vendeurs, delta, nombre de transactions, POC / déséquilibre. Sur une bougie sans empreinte : la raison.
- **Corps et mèches** : les bougies natives sont rendues transparentes pendant l'empreinte et redessinées **en fin contour** (vert / rouge) par-dessus les cases ; elles redeviennent normales en dessous du seuil.
- **Taille de case adaptée au zoom vertical** : la plus petite taille précalculée dont la ligne fait ≥ 12 px (6 px en mode volume) ; au-delà, un **multiple entier** de la plus grande taille (regroupement exact côté appareil). Ne dessine que les bougies visibles et ne charge que les mois visibles (1 fichier gzip par taille et par mois, mis en cache).
- **Jour en cours** : flux Binance (`aggTrade`, déjà reçu par l'appli) **toujours utilisé pour l'empreinte, même si le carnet choisi est Kraken** (même volume que l'archive) + **rattrapage REST** de l'heure en cours (8 pages de 1 000 transactions au plus, débit public limité). Si le rattrapage rejoint le flux, l'heure est complète ; sinon, ou pour les bougies H4 / Daily qui ont commencé avant l'ouverture, la bougie est marquée **« empreinte partielle »**.
- **Honnêteté** : sans transactions pour une bougie, aucune empreinte n'est dessinée ; la bougie affiche « pas d'empreinte » et le pied de page dit « pas d'empreinte disponible pour cette période ou cet actif » (Nasdaq, S&P, EUR/USD ; or avant le 11/12/2025 ; archive injoignable : dit aussi). Le pied de page ne dit plus que « l'historique de transactions gratuit est court » : il annonce la plage de l'archive.
- Décision : les cases à la première et à la dernière ligne d'une bougie ne sont **jamais** signalées en déséquilibre (pas de voisine à comparer) ; un déséquilibre exige aussi que la case dominante pèse ≥ 4 % du plus gros volume de la bougie (sinon 1 contre 0 serait « infini : 3:1 »).

### Découverte pendant les tests : les flux Binance ont changé d'adresse
En testant le direct (mesuré depuis Node et depuis Chrome, le 20/11/2026) : l'ancienne adresse unique `wss://fstream.binance.com/stream?streams=…` **ne livre plus ni les transactions (aggTrade) ni les bougies (kline)**, seulement le carnet. Conséquence dans la v4 en ligne : « gros flux » toujours vide, bougie en cours non mise à jour en direct. **Corrigé** : `urlsBinance()` ouvre deux connexions : `/market/stream` (transactions + bougie) et `/public/stream` (carnet) ; test ajouté (`volume-live-test.mjs`). Les deux états apparaissent dans la note (« Binance », « Binance carnet »).

## Phase 3 — Niveaux de réaction (cyan)

- **Module** `trader-pro/volume/reaction-calcul.js` (pur, testé, 18 tests). **Réaction** = plus bas / plus haut local sur 3 bougies de chaque côté, suivi dans les 24 bougies d'un mouvement **≥ 1 ATR** dans l'autre sens. **Niveau** = au moins **2 réactions** à moins de 0,35 ATR les unes des autres (deux réactions à moins de 4 bougies comptent pour une).
- **Force** = Σ (mouvement suivant plafonné à 3 ATR × décroissance d'ancienneté, demi-vie 500 / 600 / 800 bougies en Daily / H4 / H1) × poids de l'unité (**Daily 1,6 > H4 1,25 > H1 1**) **+ 0,8 par source de confluence distincte** parmi : HVN du profil, POC nu (semaine, mois), **déséquilibres empilés de l'empreinte** (collectés au fil des bougies visibles), absorption (flèches Volume ; **celles repérées sur un niveau de réaction ne le renforcent pas** : pas de cercle vicieux).
- **Affichage** : les **3 à 6** plus forts (séparés d'au moins 1 ATR), en lignes fines cyan `#27d3e6` (épaisseur 1 à 2 px et opacité selon la force relative, fine bande de la zone) avec l'étiquette **« Réaction ×4 · 3 612 · Daily »**. Sous l'empreinte. Interrupteur dans Calques (« Niveaux de réaction (cyan) », activé par défaut).
- **Dans l'empreinte** : liseré cyan sur les cases rencontrant la bande du niveau (bords gauche et droit + trait). **Dans le carnet de droite** : lignes de prix à moins de 0,1 ATR de la bande en cyan (aussi dans le « volume par niveau de prix » des actifs sans carnet) ; liste « Niveaux de réaction » (prix, support / résistance, nombre de réactions, force %, unité, confluences).
- **Voix** : « Rayle, quels sont les niveaux de réaction de l'or ? » (aussi « …du bitcoin en daily ») → les 4 plus proches du prix, avec le nombre de réactions et les confluences. Test d'intention ajouté.
- **Flèches Volume** : les niveaux de réaction passent **en premier** dans les candidats d'absorption et de cassure (libellé « Réaction ×N »). **Pas de regard vers l'avenir** : un niveau n'existe pour une flèche qu'à partir de l'instant où sa 2e réaction est confirmée (`actifDepuis`) ; testé (niveaux pas encore actifs ⇒ flèches identiques à la v4). Limite assumée : le prix du niveau est la moyenne finale de ses réactions (écart de moins de 0,35 ATR avec celui qu'il avait à ce moment).
- **Vérifié à l'œil** (captures `donnees-privees/captures-test/reaction-or-*.png`, hors dépôt) : or Daily 6 niveaux (4 779 ×3, 4 595 ×5, 4 374 ×3, 4 219 ×4, 4 081 ×3, 3 959 ×3) ; or H4 6 niveaux de 7 à 10 réactions. Les niveaux tombent sur des pivots visibles (4 595 : sommet de l'été ; 4 219 / 4 081 : creux et sommets d'octobre). **Limite** : le prix de l'or ayant chuté de ~25 % sous ses supports, la plupart des niveaux affichés sont des résistances loin au-dessus du prix actuel ; ils sont fidèles à l'historique mais pas tous utiles à l'écran par défaut.
- Les statistiques de flèches de la v4 restent proches du hasard (33 % à 2 R / stop 1 R) ; rien n'indique que les niveaux de réaction changent cela : ce sont des repères de lecture, pas des signaux.

## Phase 4 — Étirer le graphique dans tous les sens (Classique et Volume)

Module commun **`trader-pro/commun/echelles.js`** (géométrie pure testée : `echelles-test.mjs`, 15 tests ; branchement DOM testé dans Chrome : `echelles-chrome.mjs`, PC et tablette tactile), branché sur le graphique du mode Volume **et** sur celui du Classique (`integration.js`, via `graph.chart()` / `graph.serie()`).

| Geste | Comportement |
|---|---|
| Glisser sur l'**axe des prix** (à droite) | étire / écrase les bougies en hauteur (natif Lightweight Charts, conservé et réglé explicitement) |
| Glisser sur l'**axe du temps** (en bas) | bougies plus larges / plus serrées (natif) |
| Pincement à deux doigts | **dans la direction du geste** : horizontal = largeur seule, vertical = hauteur seule, diagonal = les deux (un sens n'est pris en compte que si les doigts y étaient écartés d'au moins 28 px au départ) ; facteurs bornés (0,2 à 6) |
| Molette | zoom horizontal (natif) |
| **Ctrl + molette** | zoom **vertical** autour du curseur (le prix sous le curseur ne bouge pas) |
| Double clic / double appui sur l'axe des prix | retour à l'échelle automatique ; sur l'axe du temps : retour à l'espacement initial |
| Bouton **Auto** (coin de l'axe des prix) | allumé quand l'échelle est automatique ; un appui y revient |
| **Log** | Volume : case « Échelle logarithmique des prix » dans **Calques** ; Classique (qui n'a pas de menu Calques) : petit bouton « Log » à côté d'« Auto » ; le choix est gardé (Classique : par actif) |

- **Décision technique** : le pincement natif (horizontal seulement) est coupé, car il redimensionnait aussi la largeur lors d'un pincement vertical. Comme le code du Classique (tactile, outils de dessin) ré-applique `handleScale` plusieurs fois (même chaque seconde), `applyOptions` est **enveloppé** : tout `handleScale` appliqué ensuite est normalisé (pincement natif toujours coupé) ; `handleScale: false` (outil de dessin actif) coupe aussi mon pincement et ma molette Ctrl. Aucun fichier du Classique n'a été modifié pour cela.
- **Panneaux du bas** (volume, CVD, MFI ; volume et RSI dans le Classique) : **chacun a sa propre échelle** (panneaux distincts de Lightweight Charts) ; **la séparation entre panneaux se déplace en glissant** (réglage natif de la bibliothèque, laissé actif) pour agrandir le graphique principal.
- **L'échelle suit les bougies seulement quand l'empreinte est affichée** (MA200 et VWAP, souvent loin du prix, sont exclus de l'échelle automatique pendant l'empreinte : sinon les cases étaient écrasées).
- **Le footprint profite de l'étirement** : la taille de case est recalculée à chaque image à partir du nombre de pixels par dollar ; mesuré dans le test : un étirement vertical ×3 fait passer la case de 2 $ à 1 $ (taille précalculée plus fine) ; au-delà de la plus fine, les cases ne descendent pas sous le pas d'archive (0,5 $ pour l'or, 5 $ Bitcoin, 0,05 $ Solana).
- Résultats des tests Chrome : PC et tablette tactile (pincements vertical, horizontal, diagonal, double appui sur l'axe) : tout passe. **Limite du banc** : dans le Classique, le Chrome sans GPU du banc n'affiche pas les bougies du graphique classique ; le glisser sur l'axe du temps n'y est donc pas mesurable (il l'est dans le Volume).

## Phase 5 — Contrôles et publication
- Tests Chrome (PC, tablette) : footprint H1/H4/Daily or et Bitcoin (archive locale de 25 jours), mention « pas d'empreinte » sur bougies anciennes, niveaux de réaction or Daily/H4, étirement souris et doigt, retour Auto : tout passe. Dessin de l'empreinte ≈ 6 ms en moyenne (rendu logiciel du banc), 4 500 bougies chargées, seules les visibles dessinées ; 400 bougies visibles : affichage léger.
- Worker Cloudflare : rien de nouveau (aucun KV, aucun appel Worker). Les données viennent de la branche `footprint` (CDN GitHub).
- **Non vérifié** : taille réelle des fichiers de la première exécution complète (le robot `footprint` tournait encore au moment de la rédaction ; estimation 3 ans : Bitcoin ≈ 75 Mo, Solana ≈ 30 Mo, or ≈ 12 Mo) ; rendu téléphone (non lancé) ; classique : axe du temps non mesurable sur le banc.
- Version 2026.11.20.3.
