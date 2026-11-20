# Rayle v6 — terminal Volume professionnel + fiabilité sans serveur

Document de travail (2026-11-20, session autonome). Une section par phase : décisions, mesures, limites. Tout ce qui n'a pas pu être fait ou vérifié est dit.

---
# PARTIE A — Terminal Volume professionnel

## Phase A0 — Diagnostic de la chaîne de données

### Constat (mesuré le 20/11/2026, 17 h–18 h UTC)
- **Les quatre workflows existent et sont actifs** : `donnees` (boucle de 5 h, republie toutes les 5 min), `historique` (hebdomadaire dimanche 03:17 UTC + à la demande), `footprint` (chaque nuit 03:40 UTC), `invest`.
- **`permissions: contents: write` déjà présent** dans les trois workflows de données : l'écriture n'est pas en cause.
- **Branches et chemins** : `donnees` (instantanés + bougies Yahoo), `historique` (années gzip), `footprint` (mois gzip) et `donnees-invest` existent toutes ; les adresses de l'appli (`raw.githubusercontent.com/justinmaneiro-alt/Rayle-/<branche>/…`) correspondent.
- **Cause des 404 de la vidéo** : le robot `donnees` est une boucle de 5 h avec `cancel-in-progress: false`. L'exécution démarrée à 12:11 (ancien code) tenait le groupe de concurrence : les poussées de la v4 (qui ajoutent les futures NQ / ES / 6E) restaient « en attente » puis étaient annulées (`cancelled` dans `gh run list`). Les fichiers `bougies-NQ_F-*`, `bougies-ES_F-*`, `bougies-6E_F-*` n'existaient donc pas. **Corrigé en lançant le workflow à la main** (`gh workflow run donnees`, run 44779520705, 17:03 UTC) : tous les fichiers répondent maintenant 200 (vérifié par `curl`, voir ci-dessous).
- **Footprint « archive en cours de chargement »** : la branche `footprint` a été publiée par la première exécution complète (1 h 12) vers 14:48 UTC ; avant, `index.json` répondait 404, ce que le client traitait comme « archive vide » sans le dire. Vérifié maintenant : `index.json` 200, 3 476 octets, 3 actifs.
- **Pas de piège de concurrence à régler en changeant `cancel-in-progress`** : passer à `true` ferait se battre la boucle et sa relance automatique (chaque run annulé relance un nouveau run). On garde `false` et on documente : après un push qui change le robot, lancer `gh workflow run donnees` (ou annuler l'ancienne boucle).

### Vérification des fichiers (réponses HTTP 200)
`footprint/index.json`, `donnees/bougies-{NQ_F,ES_F,6E_F,GC_F}-{1h,1d}.json`, `historique/index.json`, `historique/btc/J/2026.json.gz` : tous 200.

### Repli propre (A0.3)
`chargerBarres` (volume-donnees.js) : si le fichier des futures manque → bougies de l'indice ou de la paire au comptant (`^NDX`, `^GSPC`, `EURUSD=X`), sans volume, badge **« Volume indisponible · bougies de secours »** ; si Binance est injoignable (crypto, or) → instantané du robot (Yahoo BTC-USD, SOL-USD, GC=F) ; si Binance est injoignable pour les futures et le repli aussi, l'erreur est dite. Jamais d'écran vide quand une source répond.

### Fichiers produits, taille, fréquence (mesuré)
| Branche | Contenu | Taille totale | Fréquence |
|---|---|---|---|
| `donnees` | 106 fichiers : bougies 5 m / 15 m / H1 / Daily (Yahoo : futures NQ, ES, 6E, GC ; indices ; paires), `pro-*.json` (analyse), `jour-*`, `marches-*`, actualités, COT, calendrier | 23,7 Mo (dont bougies H1 0,4 à 1,6 Mo par fichier) | boucle de 5 h : lot rapide toutes les 5 min, bougies toutes les 15 min, horaire toutes les heures |
| `historique` | 244 fichiers gzip (une année par fichier, par actif et unité) + `index.json` (écart de raccord mesuré) | 4,3 Mo | hebdomadaire + à la demande |
| `footprint` | 776 fichiers gzip (mois, par actif / unité / taille de case) + `index.json` + `etat.json` | 90 Mo | chaque nuit (jour J-1) |
| `donnees-invest` | scores Investissement, fonds | 85 Mo (5 055 fichiers) | nightly (workflow `invest`) |

---

## Phase A1 — Moteur graphique façon TradingView

- **Moteur** : TradingView Lightweight Charts v5.2 (Apache 2.0) était déjà la base du Classique et du Volume ; réutilisé tel quel (un seul graphique pour toute la vie du mode). VWAP, profil, empreinte et niveaux restent dessinés par la primitive personnalisée. Attribution : logo TradingView natif (`attributionLogo`) + mention dans « Détails ».
- **Glisser vertical** (manquait) : `commun/echelles.js` → `decalerIntervalle` (pur, testé) + écouteurs `pointer*` : un glisser dans le graphique (souris, ou un doigt) déplace aussi la plage de prix (en log : sur le logarithme) et **coupe l'échelle auto** ; l'horizontal reste celui de la bibliothèque. Désactivé quand `handleScroll` est coupé (outil de dessin actif) ou pendant un pincement. Vérifié dans Chrome : plage 3521 → déplacée, auto coupé.
- **Déjà en place (v4.1)** : molette = zoom horizontal, Ctrl + molette = zoom vertical, pincement directionnel, glisser sur les axes, double clic / double appui sur un axe = auto, bouton Auto et Log.
- **Ajouts v6** : bouton **« » »** (retour à la dernière bougie, visible seulement quand on s'en est éloigné ; marge de 12 bougies à droite), **légende** OHLC + variation + volume + delta en haut à gauche, qui suit le curseur (sinon dernière bougie), **panneaux du bas masquables** (Volume, CVD, MFI/RVOL, cases dans Calques ; séparateurs déjà déplaçables), échelles propres par panneau (v4.1).
- Plus d'écran noir : l'état « Chargement… » est affiché, puis les bougies ; chaque couche annexe est protégée par `try/catch` dans la primitive.

## Phase A2 — Données de prix propres et continues

- **Module pur** `commun/serie-continue.js` (16 tests) : `fusionner` (la source la plus récente gagne), `raccorder` (historique long recalé par le **rapport médian mesuré sur les bougies communes**, sinon sur le saut de raccord s'il est < 5 %), `controler` (rejet des bougies incohérentes ; **bougie isolée** à plus de 30 % de ses deux voisines ; **trous** de plus de 2 bougies sur crypto 24/7, plus de 5 à 6 jours ailleurs).
- **Branché dans le mode Volume** : la source récente (Binance / Yahoo) s'affiche tout de suite, puis l'historique long (branche `historique`, 40 ans en Daily, 8 ans en H4, 3 ans en H1) est raccordé en arrière-plan (années chargées en parallèle) sans bouger la vue (conservée par le temps, pas par l'indice).
- **Mesuré dans Chrome** : BTC Daily **4 448 bougies du 2014-09-17 au 2026-11-20** (écart de raccord +0,02 %, 2 630 bougies communes), BTC H4 17 280 bougies (depuis 2019), or Daily 7 389 (depuis 2003), or H4 13 182 ; aucun saut de plus de 30 %, aucun trou sur BTC.
- **Une seule source de vérité** : le Classique et le Volume lisent la même branche `historique` raccordée de la même façon (le Classique via `enrichirLong`) ; seule la source « récente » diffère (volume Binance contre instantané du robot), et l'écart est mesuré à chaque chargement.
- Limites : le volume des bougies « longues » est celui de la source d'historique (Dukascopy : volume de ticks pour l'or et le forex) ; la légende ne le distingue pas encore bougie par bougie.

## Phase A3 — Profils d'actif

Module `volume/profils-actifs.js` (une seule table) : **Crypto / perpétuel** (BTC, SOL, or : volume réel côté agresseur, carnet, empreinte, onglet par défaut Carnet), **Futures indices** (US100, US500 : futures CME NQ / ES, différé, pas de carnet ni d'empreinte, onglet par défaut Bougies HTF / ICT, sessions sur le H1), **Forex / indice dollar** (EUR/USD : futures 6E ; **USD/CHF** : prix du comptant `CHF=X` + volume des futures CME 6S ; **DXY** : indice `DX-Y.NYB`). Un petit badge « profil » à côté du nom ; ce qui n'existe pas est **masqué** (onglet Carnet, bouton Footprint, calques de carnet, panneaux de volume sans volume) et chaque masquage est expliqué par une ligne dans « Détails ».
- Nouveaux actifs : **USD/CHF** et **DXY** ajoutés à la liste du mode Volume.
- **Décision DXY** : Yahoo n'a plus `DX=F` (« symbol may be delisted ») et `DX-Y.NYB` publie un volume nul (14 316 bougies H1, 0 avec volume, mesuré). Le DXY s'affiche donc avec ses prix et **sans volume** (badge « Volume indisponible pour cet actif »), les panneaux Volume / CVD / MFI sont masqués. Aucun volume n'est inventé (pas de proxy EUR/USD).
- `6S=F` ajouté aux futures du robot (13 248 bougies H1 avec volume, mesuré) ; en attendant la première exécution du robot après le déploiement, l'USD/CHF tombe sur le repli A0 (bougies du comptant sans volume).
- Le dernier onglet choisi est mémorisé **par actif** (`rayle_tpv_onglet_<actif>`).

## Phase A4 — Panneau de droite à onglets

Module `volume/panneau-droite.js` ; calculs purs testés : `carnet-calcul.js` (42 tests), `ict-calcul.js` + `ict-affichage.js` (35 tests).
- **Carnet** : regroupement par **palier** (BTC 1 / 5 / 10 / 50 $, or 0,1 / 0,5 / 1 / 5 $, SOL 0,01 / 0,05 / 0,1 ; défauts 10 / 0,5 / 0,05) ; acheteurs arrondis vers le bas, vendeurs vers le haut ; **une ligne = un prix unique** (le « 61 850 ×10 » de la v4 venait de 20 niveaux au tick de 0,1 $ arrondis à l'affichage) ; barres proportionnelles ou **cumul** ; spread et prix médian au centre ; **gros ordres** (> 3 × la médiane des 50 premiers paliers) surlignés ; ceux qui restent plus de 2 minutes sont tracés en fins pointillés avec étiquette sur l'axe ; jauges de déséquilibre 10 et 25 niveaux + mini-courbe des 15 dernières minutes ; **gros flux** avec seuil réglable (auto par défaut).
  **Carnet profond** : le flux Binance ne donne que 20 niveaux (quelques dollars sur le BTC) : toutes les 3 s, **seulement quand l'onglet Carnet est visible et la page active**, un appel REST public `depth?limit=1000` complète le carnet ; le flux fait foi dans sa plage. Rien ne passe par le Worker.
- **Bougies HTF / ICT** : miniature (même moteur, mêmes gestes) Daily / Weekly / Monthly ; repères activables un par un : **PDH/PDL, PWH/PWL, PMH/PML, ouvertures jour / semaine / mois, premium / discount** (50 % de la semaine précédente, moitié haute teintée rouge, basse verte), **FVG Daily et Weekly ouverts** (retirés une fois comblés, réduits s'ils sont comblés en partie), **order blocks** Daily et Weekly valides, **égaux hauts / bas « $$$ »**, **sweeps** ; **lecture en une ligne** (« Prix en discount de la semaine · entre le PDL et le PDH · FVG Daily haussier ouvert à … · liquidité au-dessus à … ») ; bouton **« Afficher sur le graphique principal »** (lignes fines, zones grisées, étiquettes sur l'axe seulement). **Sessions** Asie / Londres / New York (UTC 00–08 / 08–13 / 13–21) en fines bandes sur le H1 des indices et du forex, avec plus haut et plus bas de chaque session.
- **Bougie du jour** : grande bougie Daily (ou Weekly) en direct, **bougie de la veille en fantôme**, **profil de volume à l'intérieur** avec POC et zone de valeur (H1 : approximation indiquée), volume relatif vs moyenne de 20 jours **au même moment de la journée**, delta et CVD de séance, range / ATR.
- **Bug trouvé par la vérification à la main sur l'or** (`tests/ict-verif-or.mjs`, calcul indépendant par dates) : le décalage de 6 h servant à classer les bougies qui ouvrent la veille au soir était aussi appliqué à « maintenant » : après 18 h UTC, la bougie du jour passait pour terminée et **PDH / PDL étaient ceux du jour en cours**. Corrigé (`periodeFinie`) + test de régression à 6 heures différentes. Résultat vérifié : PDH 3 764,97 · PDL 3 596,04 · PWH 4 156,24 · PWL 3 777,01 · PMH 4 228,70 · PML 3 881,02, identiques au calcul indépendant.
- Autre bug corrigé : volume relatif du jour affiché « +5 260 % » (fraction de séance mal calculée) ; sans volume sur la bougie en cours, aucun rapport n'est affiché.

## Phase A5 — Footprint
- Seulement pour le profil crypto / perpétuel ; bascule **« Footprint »** dans la barre ; apparaît automatiquement quand la bougie est assez large (≥ 70 px).
- **Au plus 25 cases par bougie** (`tailleCible` reçoit un pas minimal = plus grande bougie visible / 25 ; regroupement exact) ; police ≥ 10 px ; chiffres abrégés ; POC encadré **en blanc** ; déséquilibres ≥ 3:1 en gras, empilés marqués dans la marge ; delta et volume sous la bougie.
- **Bougies sans données** : contour gris, **aucun texte** ; la raison est donnée au survol / toucher. Si l'archive est absente ou injoignable et qu'il n'y a rien en direct, **retour aux bougies normales** (jamais de cases grises partout).
- **Plus jamais bloqué sur « en cours de chargement »** : l'index a un délai de 12 s, un 404 est dit (« la tâche footprint n'a pas encore publié »), nouvel essai chaque minute ; le texte du pied de page est dans « Détails ».
- Mesuré dans Chrome : BTC H1 sur des bougies du 8/11 (archive) : 10 bougies avec empreinte, cases de 25 $ ; empreinte visible sur l'or et le BTC, y compris d'anciennes bougies.

## Phase A6 — Niveaux et lisibilité
- **Niveaux de réaction** : **masqués par défaut** (calque), calculés quand même (les flèches Volume s'en servent : leurs statistiques ne changent pas) ; affichés : **3 plus forts à moins de 3 ATR Daily du prix**, zones fines semi-transparentes, étiquette « R×4 » **sur l'axe seulement**. Fini le cyan `#27d3e6`.
- **Palette fixe** (`volume/palette.js`) : vert / rouge = bougies et delta ; or = MA200 ; **un seul bleu** = VWAP ; blanc / gris = POC, VAH, VAL ; une teinte discrète (`#7fb3c2`) = tous les niveaux ; gris = zones.
- **Étiquettes** : zéro texte flottant dans la zone des bougies (hors sigle des sessions) ; toutes les étiquettes sont sur l'**axe des prix, empilées sans chevauchement** (`etiquettes-axe.js`, `empiler` pur : 8 tests).
- **Volume Profile** à droite, semi-transparent, 20 % de la largeur au plus. **VWAP** : semaine + ancré (2 au maximum) ; bandes ±1σ / ±2σ masquées par défaut.
- **Préréglages** dans Calques : **Épuré**, **Volume complet**, **ICT**, **Footprint** ; mémorisés **par actif** (options par actif : `rayle_tpv_opts6_<actif>`).
- **Badge court** (« Volume réel · Binance + Kraken · direct », « Futures CME NQ · différé · il y a 3 min », « Volume indisponible… ») ; **pied de page d'une ligne** ; tout le reste dans « Détails ».

## Phase A7 — Contrôles
Tests Chrome (`trader-pro/tests/volume-v6-chrome.mjs`, blocs a1 à a6, PC) : or, BTC, SOL, US100, US500, EUR/USD, USD/CHF, DXY en H1, H4, Daily : tous chargés, aucun écran vide ni 404 ; historique BTC continu **de 2014 à aujourd'hui** (Daily), 2019 (H4), 2024 (H1) ; carnet sans prix en double ; trois onglets ; repères ICT cohérents (PDH/PDL/PWH/PWL de l'or vérifiés) ; préréglage Épuré épuré. Rendu vérifié sur capture PC, tablette (1024 × 768) et téléphone (412 × 915).
Limites : le test automatique « double appui sur l'axe des prix » (tablette, `echelles-chrome.mjs`) est **instable** : réussi 31 / 31 sur une exécution, un échec sur une autre, sans lien établi avec la v6 ; les gestes tactiles n'ont pas été éprouvés sur un vrai appareil. Les sauts de plus de 30 % de l'historique SOL de 2020-2021 sont **réels** (le test ne regarde que depuis 2023).

---
# PARTIE B — Fiabilité sans serveur, risque global, preuve, briefing

## Phase B1 — Architecture « sans serveur »

### Inventaire des données (source → chemin → qui produit → dépendance au PC)
| Donnée | Source | Chemin | Producteur | PC ? |
|---|---|---|---|---|
| Cours, bougies 5 m / 15 m / H1 / Daily (or, indices, BTC, SOL, forex, futures) | Yahoo Finance | branche `donnees` : `bougies-*.json`, `pro-*.json`, `jour-*.json` | GitHub Actions, boucle de 5 h (lot rapide toutes les 5 min, bougies toutes les 15 min) | non |
| Historique long (Daily 20 ans, H4 8 ans, H1 3 ans) | Dukascopy, Yahoo, Binance | branche `historique` (gzip par année) | Actions, hebdomadaire | non |
| Footprint (transactions par case de prix) | Binance (archives publiques) | branche `footprint` (gzip par mois) | Actions, chaque nuit | non |
| Volume réel, carnet, transactions en direct | Binance, Kraken (WebSocket / REST publics) | directement depuis l'appareil | appareil | non |
| Actualités, calendrier, COT, macro, santé du marché | flux publics | branche `donnees` : `actus-*`, `calendrier2`, `cot-*`, `marches-*`, `sante` | Actions | non |
| Scores Investissement, fonds | SEC EDGAR + Yahoo | branche `donnees-invest` ; recalcul quotidien aussi par le Worker (cron, lots de 3) | Actions + Worker | non |
| Corrélations (Couverture) | calculées | `marches-correlations.json` | Actions | non |
| Données personnelles (dessins, niveaux, alertes, journal, import XTB, Ma liste, Mon plan, réglages, risque, positions) | l'utilisateur | appareil (localStorage) + **Worker Portefeuille / D1** (copie commune) | appareils + Worker | **non** |
**Aucun chemin « lu par le PC » ne sert plus de source principale** : le serveur local (`serveur.mjs`, `app-pc/terminal-donnees.mjs`) n'est qu'un mode de développement et de secours ; l'application publiée sur GitHub Pages ne l'appelle jamais.

### Répartition cible et justification
- **GitHub Actions + branches de données (CDN GitHub)** = tout ce qui est volumineux ou calculé : instantanés, historiques, footprint, signaux, contrôles qualité. Choix « branche orpheline servie par `raw.githubusercontent.com` » plutôt que stockage Cloudflare : **aucune requête Worker, aucune écriture KV / D1**, pas de redéploiement du site, historique git écrasé à chaque publication (le dépôt ne grossit pas), gratuit sans limite pratique pour un dépôt public. Contrepartie : le CDN met ~5 min à propager et ne garantit pas l'horaire (d'où la boucle de 5 h qui se relance seule, car le déclencheur `schedule` de GitHub ne passe en pratique que toutes les 4 à 12 h).
- **Worker Cloudflare (plan gratuit)** = léger et temps réel : synchronisation personnelle, évaluation des alertes à la clôture des bougies (comparaisons, pas d'analyse lourde), Telegram, briefing, revue du dimanche, budget. **Un seul déclencheur planifié** (`*/5 * * * *`) qui décide de la tâche selon l'heure (voir B3, B6).
- **Appareils** = affichage. Si le Worker ne répond pas : lecture directe des sources publiques qui l'autorisent (Kraken, Binance, branches `donnees` / `historique` / `footprint`) en mode dégradé, avec une étiquette visible (« copie locale », âge de chaque donnée, voyant de la page État des données).
- **Hors ligne** : le service worker (`sw.js`, déjà en place) garde la coque et le code, et la couche de données (`couche.js`, IndexedDB) garde la dernière copie de chaque donnée avec son âge : Rayle s'ouvre sans réseau et dit l'âge de chaque donnée (pastille « source · âge » sur chaque chiffre).
- **Parade des 60 jours** (`.github/workflows/maintien.yml`) : chaque lundi, commit horodaté sur une branche `maintien` (activité réelle du dépôt), `gh workflow enable` sur chaque workflow de données, relance de la boucle `donnees` si aucune exécution n'est en cours. La boucle `donnees` se relance déjà seule (workflow_dispatch, qui n'est pas soumis à la règle des 60 jours). **Limite assumée** : GitHub ne documente pas précisément ce qui compte comme « activité » ; la combinaison commit + réactivation + relance couvre les cas connus, sans preuve définitive.

### Synchronisation des données personnelles
- Déjà en place (Worker Portefeuille + D1) : dessins, journal par setup, alertes de prix, import XTB, réglages du portefeuille.
- **Nouveau (v6)** : route `GET / PUT /sync` (`worker/src/sync.js`) pour **Ma liste, Mon plan, réglages des flèches, risque, positions, heures de silence** ; **une seule ligne D1**, **dernière modification gagnante** (horodatage borné à « maintenant + 5 min », liste blanche de 7 clés, 60 ko maximum par clé), **trace des 30 derniers conflits**, **aucune écriture D1 quand rien n'a changé**. Client `commun/sync-perso.js` : interrogation **toutes les 45 s, page visible seulement** ; un appareil neuf prend la copie du serveur (aucun doublon) ; une modification locale est horodatée avant d'être comparée à celle du serveur. 16 tests (deux appareils, SQLite réel, conflit, hors ligne, mauvais code, valeurs géantes).
- **Non déployé** : le Worker Portefeuille n'a jamais été déployé (base D1 à créer, `wrangler login` nécessaire) — voir « Déploiement » en fin de document.

## Budget gratuit Cloudflare (calcul, mesure, garde-fous)

Limites du plan gratuit : 100 000 requêtes Worker / jour, 10 ms de CPU par exécution, 50 sous-requêtes externes par exécution, 5 déclencheurs planifiés pour tout le compte, KV 100 000 lectures et **1 000 écritures** / jour, D1 5 millions de lignes lues et 100 000 écrites / jour.
- **Prévision** (`commun/budget-cf.js`, `budgetPrevu`, 3 appareils actifs 6 h chacun, interrogation toutes les 45 s) : ≈ 1 700 requêtes / jour (dont 288 passages du cron), ≈ 0 lecture ou écriture KV (**Rayle n'écrit jamais dans KV**), ≈ 3 600 lignes D1 lues, ≈ 620 écrites ; **tout sous 3 % des limites** (test : < 30 %). 1 seul déclencheur planifié utilisé par Rayle (le Worker principal `rayle` en a au moins un : total connu ≤ 2 sur 5 ; sa configuration n'est pas dans le dépôt).
- **Pourquoi c'est si bas** : les données lourdes passent par le CDN GitHub (branches), pas par le Worker ; la synchronisation personnelle est **une seule ligne D1** lue toutes les 45 s **seulement par un appareil dont la page est visible** ; l'état des données est lu sur le CDN ; aucune écriture D1 quand rien n'a changé.
- **Mesure réelle** : `worker/src/budget.js` compte les requêtes et les lignes D1 en mémoire et les écrit dans D1 **une fois par passage du cron** (288 écritures / jour) ; `GET /budget` (protégé par le code) rend la consommation du jour ; la page « État des données » l'affiche avec des barres (sinon : la prévision, et le dit). La mesure **sous-estime légèrement** si Cloudflare recycle l'instance entre deux passages.
- **À 70 %** d'une limite : un message Telegram (une fois par jour et par limite) et un facteur de ralentissement (×4) renvoyé aux appareils dans l'en-tête `X-Rayle-Ralentir` ; le client de synchronisation allonge son intervalle. Les alertes de trading (cron) ne sont jamais ralenties.
- **Un seul cron** (`worker/src/cron.js`, toutes les 5 minutes) choisit les tâches selon l'heure : budget, alertes de prix, rappel d'import, Investissement (toujours) ; clôtures H1 / H4 / Daily (minutes 0 à 4 des heures de clôture) ; briefing (7 h 45 Paris, jours de semaine) ; revue (dimanche 18 h Paris) ; heure d'été / d'hiver gérée (testé). Chaque tâche est isolée : une panne n'arrête pas les autres. CPU : seulement des comparaisons et de petites lectures ; calculs lourds la nuit dans GitHub Actions.

## Phase B2 — Page « État des données »

- **Page** `commun/etat-donnees-ui.js` (ouverte depuis **Réglages → « État des données »** et par un toucher sur le **voyant** de la barre du haut) : pour chaque source — dernière mise à jour, **prochaine prévue**, erreurs sur 24 h (comptées sur l'appareil + fichiers en échec côté robot), état ; rapport des contrôles de la nuit ; budget gratuit.
- **Règle unique** (`commun/fraicheur.js`, 25 tests) : **orange au-delà de 2 × le délai normal, rouge au-delà de 5 ×** ; délais par famille de fichiers (bougies 15 min, analyse 30 min, marchés 30 min, calendrier 6 h, COT 8 jours, historique 8 jours, footprint 2 jours…). **Voyant global** vert / orange / rouge.
- **Pastille sur chaque chiffre périmé** : le helper `pastille(source, t)` déjà utilisé par toutes les fenêtres pro ajoute désormais un point orange / rouge selon l'âge et le délai déduit de la source (rien si le délai est inconnu : jamais de fausse alerte). Couverture : toute fenêtre qui affiche un chiffre via `pastille` ; les quelques chiffres dessinés à la main sans ce helper (certaines cartes du shell, du Terminal Classique) n'ont pas été reprises.
- **Contrôles de la nuit** (`.github/workflows/controle.yml`, 02 h 10 UTC ; `outils-donnees/controle-nuit.mjs` ; `commun/controle-qualite.js`, 19 tests) : prix aberrants (saut de plus de 12 amplitudes médianes), trous (marchés 24/7), doublons, valeurs nulles, bougies incohérentes, **incohérence entre fenêtres** (prix de l'analyse contre dernière clôture H1, > 3 % = grave), **un seul calendrier**. Rapport publié sur la branche `controle` ; **alerte Telegram seulement si un problème GRAVE persiste 2 nuits de suite** (une alerte par épisode). Lu à blanc sur les vraies données publiées : aucun problème grave ; informations réelles trouvées : 67 à 68 bougies Daily FX « incohérentes » chez Yahoo (CHF=X, EURUSD=X), quelques gros sauts réels (2025-04-09, 2025-08-01…), deux trous de 20 bougies sur BTC et SOL H1 (fin 2025-11-29).
- **Voix** : « Rayle, est-ce que mes données sont à jour ? » → `phraseDonnees` (« Oui, tout est à jour : 12 sources vérifiées… » ou « Non, pas tout : Analyse H4 / Jour (en retard, 3 h)… » ; si l'état n'est pas lisible, Rayle le dit).

## Phase B3 — Alertes 100 % côté Worker

- **Flux** : GitHub Actions (étape `outils-donnees/signaux.mjs` dans la boucle `donnees`, toutes les 5 min) publie `signaux.json` (≈ 10 ko, mesuré sur les vraies données : 6 actifs) = flèches **MA200 H4 / Daily** (mêmes fonctions que le Terminal) + flèches **Volume** H1 / H4 / Daily + dernières bougies closes par unité. Le Worker (`worker/src/alertes-cloture.js`) n'a donc aucun calcul lourd : 1 sous-requête pour `signaux.json`, 1 pour Telegram, comparaisons seulement.
- **Mes niveaux** : lignes, boîtes, tendances, Fibonacci (0,382 / 0,5 / 0,618 / 0,705) lus depuis `dessins:<actif>` de D1 (synchronisation) : « cassure » (clôture de l'autre côté) et « rejet » (mèche au-delà, clôture du même côté). Un niveau tracé sur la tablette déclenche donc l'alerte tablette éteinte.
- **Déclenchement** : cron unique, minutes 0 à 4 des heures de clôture H1 / H4 / Daily ; l'identifiant d'événement contient l'heure de la bougie : jamais deux fois, même si un passage est manqué.
- **Anti-spam** : un message groupé par passage (6 lignes + « … et N autres »), **heures de silence réglables** (clé synchronisée `rayle_alertes_silence_v1`, heure de Paris, traverse minuit) : les événements sont retenus puis envoyés en **un seul résumé** à la fin du silence ; Telegram refuse → réessai sans doublon ; sans secrets Telegram → noté une fois dans l'historique.
- **Historique** consultable : `GET /alertes/historique` (100 dernières, avec l'état « telegram / retenue / non configuré »).
- **Voix sans doublon** : quand le Worker est configuré, l'appli ouverte annonce toujours par la voix mais n'envoie plus elle-même le message Telegram (`alertesParWorker`).
- **Réglage** : Volume H1 coupé par défaut (trop bavard) ; réglable via `rayle_tp_fleches_alertes` (`{ actif, volume, volumeH1 }`).
- **Limites assumées** : le volume de `signaux.json` vient de Yahoo (futures, différé) — Binance refuse les serveurs américains de GitHub — donc les flèches Volume du Worker peuvent différer légèrement de celles du terminal ; mode Volume « zones d'achat Investissement » et alertes de prix Marchés restent portés par les tâches existantes du Worker (`alertes-invest`, `alertes-prix`). 27 tests (SQLite réel, Telegram simulé).

## Phase B4 — Risque au niveau du portefeuille

- **Module pur** `portefeuille/risque-global.js` (14 tests) + onglet **« Risque global »** du Portefeuille (`vue-risque.js`).
- **Positions** : positions ouvertes de l'import XTB + **saisies rapides** (formulaire de l'onglet, clé synchronisée `rayle_pf_positions_v1`) ; **fermeture en un toucher**. Réglages (synchronisés `rayle_pf_risque_v1`) : capital, **risque par position (100 € par défaut)**, limite de perte du jour (2 %) et de la semaine (5 %).
- **Tableau** : perte si tous les stops sont touchés (€ et % du capital) ; **exposition par facteur** (dollar, or / métaux, actions US, crypto, taux, énergie) — or + argent + EUR/USD à l'achat = un seul pari « contre le dollar » (testé : 300 € de risque, dollar > 150 €) ; **alerte quand deux positions sont corrélées > 0,7 dans le même sens** (corrélation de Couverture `marches-correlations.json` si lisible, sinon table d'estimation, dite « estimation ») ; budget jour / semaine (pertes réalisées Paris + risque engagé).
- **Garde-fous** : le calculateur de taille (outil Position) affiche « limite du jour atteinte : nouvelle position déconseillée » ou « il ne te reste que N € de budget de risque », à partir du dernier calcul du tableau (valable 6 h) ; c'est une alerte, jamais un blocage.
- **Non fait / limites** : le petit résumé sur la carte d'accueil et l'annonce vocale / Telegram du dépassement de limite ne sont **pas** branchés (la phrase parlée `phraseRisque` existe et est testée, mais la commande « mon risque » existante n'appelle pas encore la version globale) ; la correspondance des colonnes du format de corrélation de Couverture est supposée (`matrice`), sinon repli sur l'estimation.

## Phase B5 — La preuve, avec les vrais coûts XTB

- **Coûts** (`terminal/stats-honnetes.js`, 20 tests) : spread typique + swap par nuit par instrument, retirés de chaque résultat en R. **Valeurs indicatives, non lues chez XTB** (pas d'accès à la table officielle depuis ici) : à vérifier dans xStation et à modifier (`lireCouts` accepte des surcharges) ; la note est affichée dans le panneau.
- **Test honnête** : les règles des flèches sont figées (cible 2 R, stop derrière la mèche, aucun paramètre ajusté sur les résultats) ; chaque type est mesuré sur l'**apprentissage = 70 % les plus anciens** puis sur la **période jamais vue = 30 % les plus récents**, affichés côte à côte (panneau Statistiques, section « Preuve avec les coûts XTB »). **Fragile** si la période jamais vue est nettement pire (espérance −0,3 R ou réussite −15 points) ; « non significatif » sous 30 cas appris / 15 vus.
- **Mesure réelle** (`outils-donnees/stats-honnetes.mjs`, historique long, 6 actifs × H4 / Daily × 8 types) : sur 96 séries-types, **7 « fiable », 57 « à surveiller », 11 « fragile », 21 « non significatif »**. Le meilleur « jamais vu » (+0,85 R sur EUR/USD Daily, cassure validée par le volume) n'a que 16 cas et un apprentissage négatif : du bruit, pas une preuve. Conclusion honnête : **aucun type de flèche ne montre un avantage net, stable et significatif après coûts**.
- **Suivi réel** : `resoudreFleche` (cible 2 R ou stop, coûts compris) et `degradation` (30 derniers cas réels contre le testé : espérance −0,5 R ou réussite −20 points → « en dégradation ») sont écrits et testés ; **le registre qui enregistre chaque flèche émise depuis la mise en service n'est pas encore alimenté en production** (il faudrait persister les flèches de `signaux.json` dans une branche et lancer la résolution la nuit) : le badge « en dégradation » et l'alerte voix / Telegram ne sont donc pas actifs.
- Tableau de synthèse : `synthese()` (réussite, espérance nette, cas, statut) ; la section du panneau affiche apprentissage / jamais vu / statut ; la colonne « réel » reste vide tant que le registre n'existe pas.

## Phase B6 — Briefing du jour et revue du dimanche

- **Module pur** `commun/briefing.js` + Worker `worker/src/rapports.js` (13 tests, SQLite réel, Telegram simulé). **Briefing** : ce qui a bougé depuis la veille (actifs, variation, prix), **niveaux proches** (mes lignes et boîtes tracées à moins de 3 % du prix), **annonces du jour** (calendrier unique `calendrier2.json`, impact fort / moyen, heure de Paris), alertes actives et flèches récentes (historique B3), **risque engagé et budget restant** (B4), **état des données**. Texte **parlé** d'environ une minute (≈ 100–170 mots, phrases courtes, « moins 3,4 pour cent », « 14 heures 30 ») et version Telegram.
- **Telegram** : les jours de semaine à **7 h 45 (heure de Paris, été comme hiver)**, un seul envoi par jour ; **réglable / désactivable** via la clé synchronisée `rayle_briefing_reglage_v1` (`{ actif }` ; l'heure est fixée dans `cron.js`, `tachesDuPassage(heureBriefing)`).
- **Revue du dimanche** (18 h Paris) : trades de la semaine en € et R (R = gain / risque par position), meilleur et moins bon setup (journal par setup), respect des limites, rappel d'import XTB si rien depuis 7 jours.
- **Voix** : « Rayle, briefing » → version parlée construite dans l'appli (mouvements, annonces, état des données).
- **Non fait / limites** : la **carte en tête du carrousel d'accueil** n'a pas été ajoutée (la commande vocale et Telegram sont là) ; le briefing vocal de l'appli n'inclut pas les niveaux tracés ni le risque (ils sont dans la version Telegram, qui lit D1) ; le niveau MA200 n'est pas dans les « niveaux proches » (absent de `signaux.json`) ; la revue lit les 300 dernières positions fermées de D1 (une fois par semaine, CPU à surveiller) ; « statistiques des flèches » de la revue : champ prévu, non alimenté.
