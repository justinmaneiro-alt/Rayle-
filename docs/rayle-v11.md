# Rayle v11 — des rapports complets en visite guidée animée

Verrou respecté : voix Vivienne (Azure) avec Piper en secours, gestionnaire de parole unique (`speak`), aucune voix du système, activation par le prénom, fenêtres pilotées, réponses animées, panneau d'images, manuel interne, méthode d'analyse et annotations « Rayle » de la v10, tous les modules, quotas gratuits. Les fichiers du verrou v8 (`outils.js`, `actions.js`, `cerveau.js`, `phrase.js`) ne sont PAS modifiés : `verrou-v8-test` passe sans mise à jour de l'empreinte. Le Worker principal `rayle` n'est pas touché ; `rayle-voix` n'a pas changé (rien à redéployer). Version 2026.11.22.4.

## Ce qui a été construit

Dossier `trader-pro/rapports/` :

| Fichier | Rôle |
|---|---|
| `bougies.js` | lecture des bougies (phase 2) : forme, figures, contexte, volume, position du prix en ATR |
| `construire.js` | les quatre rapports, étape par étape, à partir des vraies données (phase 3) |
| `moteur.js` | le moteur de visite guidée : ordre, voix, synchronisation, commandes, historique (phase 1) |
| `ecran.js` | barre de rapport, carte résumé, surbrillances, bulles, historique (phase 1 et 4) |
| `lecteur.js` | branche le moteur sur la vraie voix, les vraies données et l'écran |
| `historique.js` | historique, comparaison avec le précédent, budget en caractères, exports (phase 4) |

Et `core/commun/lecteur-rapports.js` (point d'entrée minuscule, chargé dans `index.html`, le lecteur n'est téléchargé qu'à la première demande), `core/commun/lecteur-rapports.css`, un crochet de 6 lignes dans `Application.commande` (`core/commun/application.js`) pour que le lecteur voie chaque phrase en premier, et deux petites fonctions ajoutées à `core/voice/voix.js` (voir plus bas).

### Phase 1 — le lecteur de rapports

- Un rapport = une suite d'**étapes**. Chaque étape sait : la page à ouvrir et ses réglages (fenêtre, actif, unité, mode, onglet, section), le cadrage du graphique (zoom sur les N dernières bougies, animé 750 ms), ce qu'il faut montrer, le texte dit (découpé en segments d'une phrase ou deux), la carte résumé, un détail plus poussé, l'heure des données.
- **Mises en avant** : lignes de niveau qui pulsent (étiquette « MA200 Daily · 4 286,23 »), zones, **contour qui pulse autour d'une bougie** avec son étiquette (« pin bar sur support »), bougies hebdomadaires repérées par leurs jours, cases de la page surlignées avec une **bulle qui pointe** vers elles, chiffre clé en grand, lignes de la carte qui s'éclairent une à une. Tout vit dans une couche à part (`.lr-couche`), signée Rayle, retirée à chaque phrase ; les dessins de Justin ne sont jamais touchés. Les annotations de scénario passent par `annoter_graphique` (couche « Rayle » de la v10).
- **Barre de rapport** (au-dessus des fenêtres plein écran, z-index 180) : chapitre, étape n/N, progression segmentée, précédent / pause / suivant / stop, détail, graphique, vitesse (×0,9 ; ×1 ; ×1,15 ; ×1,3), carte réduite ou ouverte, historique. Sur téléphone la barre tient sur une ligne (« ⋯ » ouvre le reste) et la carte se réduit à sa ligne active.
- **Commandes vocales** (interceptées avant tout le reste, sans IA, sans quota) : « suivant », « reviens », « pause », « reprends », « stop », « détaille ça », « montre-moi sur le graphique », « plus vite », « plus lentement ». Elles répondent par ✔ (le symbole n'est pas prononcé). Toute AUTRE phrase pendant un rapport met le rapport en attente (la voix est unique) : la réponse passe, puis « reprends » relit l'étape depuis son début. Une nouvelle demande de rapport remplace le rapport en cours.
- **Voix et écran synchronisés** : chaque étape est lue d'**une seule requête Azure** (une seule voix, jamais deux). L'animation suit la lecture **phrase par phrase** grâce à l'horloge du lecteur audio (durée réelle du son connue dès `rayle:parole`) ; avec Piper (plusieurs morceaux) elle suit une horloge estimée. Pas de repères de mots Azure (SSML) : cela demanderait de modifier le Worker `rayle-voix` ; la synchronisation à la phrase est la limite. **Pause = vraie pause du son** (la position est gardée, « reprends » continue au même endroit ; elle ne recommence pas).
- **Pas de blanc** : toutes les étapes sont préparées en arrière-plan, une à la fois dans l'ordre (un seul calcul lourd à la fois) dès la demande ; la **voix de l'étape suivante est mise en cache** pendant que l'étape en cours est lue (`preparerParole` : mêmes parts que `speak`, donc même clé de cache, aucun caractère compté deux fois) ; la **page de l'étape suivante s'ouvre pendant la fin de l'étape en cours** (le son continue de jouer pendant que la page charge ; avance adaptée au temps mesuré de la dernière ouverture, plafonnée à 60 % de l'étape).
- **Garde-fous** : chiffres réels uniquement, avec l'heure des données ; une donnée absente → une phrase courte (« COT : le rapport COT est indisponible… Je passe à la suite. »), puis l'étape suivante ; les scénarios sont des conditions (« si… alors »), jamais des ordres ; la mention « c'est toi qui décides » est dite dans les scénarios et écrite dans le rapport.

### Phase 2 — la lecture des bougies (`bougies.js`)

Sur les 3 à 5 dernières bougies d'une unité (Weekly construit depuis le Daily, Daily, H4) :

- **Forme** : corps, mèches, taille en ATR (petite < 0,6 ; normale < 1,3 ; grande < 2 ; très grande au-delà).
- **Figures** : pin bar / marteau (mèche basse ≥ 60 %, corps ≤ 34 %, mèche ≥ 2 corps), étoile filante, avalement haussier et baissier, doji (corps ≤ 10 %), inside bar, outside bar, marubozu (corps ≥ 90 %), longue mèche de rejet. Marteau / étoile filante seulement après une baisse / une hausse.
- **Contexte** : la bougie touche-t-elle un support, une résistance, la MA200, un niveau de volume (POC, VAH, VAL), un repère ICT (PDH, PDL, PWH, PWL), un FVG, un de **mes niveaux tracés** ? A-t-elle **balayé** le plus haut / plus bas des 20 dernières bougies puis réintégré ? **Volume** relatif à la moyenne des 20 précédentes (fort ≥ 1,5 ; faible ≤ 0,7), **delta réel** seulement quand il est mesuré (jamais inventé).
- **Position du prix** : « sur » = à 0,25 ATR ou moins ; « pas loin » = jusqu'à 1 ATR ; « loin » au-delà. Phrases : « On est **sur** le support PWL 3 511 (à 0,2 %) », « **Pas loin** de la résistance MA200 Daily 3 620 (à 1,1 %) », « **Entre** deux zones : support à 3 480, résistance à 3 620 ». Seuils écrits dans le manuel (fiche « Lecture des bougies et position du prix »).
- Pendant le rapport, chaque bougie commentée est mise en évidence sur le graphique (contour qui pulse + étiquette).

### Phase 3 — les rapports

- **A. Rapport complet d'un actif** (9 étapes, ordre demandé) : contexte global (Marchés : climat risk-on/off lu sur Nasdaq, S&P 500, dollar avec les mêmes règles que `marche_global`, taux 10 ans / pente / taux réel, actualité de l'actif, annonces à venir avec consensus et précédent) → Weekly (terminal Bougies HTF : tendance, structure, MA50 semaines, bougies, zones de rebond) → Daily → H4 (MA200, structure, 2 bougies, position, **flèches récentes et leurs statistiques historiques**) → Volume (POC, zone de valeur, **POC nus**, volume relatif et CVD ; puis **footprint et carnet en direct** lus dans le terminal Volume ouvert, dits à la suite) → COT (résumé) → Valorisation (Mes actifs, verdict par horizon et raisons) → Scénarios (retour au Terminal H4, **principal et alternatif** avec déclencheur, entrée possible, invalidation, objectifs, confiance faible / moyen / fort justifiée, annotés sur le graphique) → Vigilance et risque (Portefeuille : annonces, volatilité, corrélations 60 séances avec le dollar et le Nasdaq, risque engagé).
- **B. Rapport COT** (6 étapes, un indicateur à la fois avec mise en évidence de la case) : positions nettes par catégorie et variation de la semaine ; indice COT sur 3 ans, **percentile 52 semaines et 3 ans**, extrême ou pas ; intérêt ouvert (semaine, 4 et 13 semaines) ; **divergence prix / positionnement** sur 8 semaines ; **historique des extrêmes** et ce que le prix a fait 8 semaines après ; conclusion avec les limites (indicateur lent, donnée du mardi).
- **C. Rapport marché global** (13 étapes) : climat, les 8 actifs (or, Nasdaq, S&P 500, BTC, SOL, pétrole, EUR/USD, DXY) avec graphique ouvert, tendance, position par rapport aux niveaux et couleur ; puis le top 2 du moment avec lecture Daily et scénarios.
- **D. Rapport macro et calendrier** (5 étapes) : la semaine, puis chaque annonce forte à venir : consensus contre précédent, actifs concernés, mécanisme classique (règles de lecture de l'application), **réaction passée MESURÉE** (variation H1 de l'or et du Nasdaq 2 h après la même annonce déjà publiée dans la semaine) quand elle existe.
- **Demandes reconnues sans IA** : « Rayle, rapport complet sur l'or / le Nasdaq / le Bitcoin… », « rapport COT sur l'or / le Nasdaq / l'EUR/USD », « rapport sur le marché », « quelles annonces cette semaine et quel impact ? ».

### Phase 4 — historique et budget

- Chaque rapport (terminé, ou arrêté après au moins 2 étapes, marqué « arrêté ») est gardé dans l'historique (`localStorage`, 40 rapports au plus, les plus récents) : date, actif, résumé, scénarios, contexte chiffré (prix, ATR, niveaux), chaque étape avec sa carte et son texte, données manquantes. Panneau **Historique** (dans la barre) : voir, comparer au précédent, **PDF** (impression du navigateur : « Enregistrer au format PDF » ; repli : téléchargement HTML si les fenêtres sont bloquées), copier en Markdown, supprimer.
- **Comparaison avec le rapport précédent**, dite à la fin et écrite : « Depuis hier, le prix est passé de 3 600 à 3 501 (−2,7 pour cent). Le prix a atteint le support PWL 3 500. Le scénario principal du rapport précédent (scénario haussier) est invalidé… ». Pour le COT : même rapport hebdomadaire tant que la CFTC n'a pas publié ; pour le marché : changements de couleur et de climat.
- **Budget** : le coût estimé en caractères (étapes × coût moyen mesuré) est affiché avant la lecture avec le **compteur Azure du mois** (« 120 000 / 500 000, reste 380 000 », alerte si le quota ne suffit pas) ; le coût réel est affiché à la fin. Mesuré : rapport complet ≈ 5 000 à 5 300 caractères (≈ 1 % du quota gratuit : une centaine de rapports par mois), COT ≈ 2 000, marché global ≈ 4 400, macro ≈ 3 100. À l'oral des phrases denses ; le détail complet est à l'écran (carte) et dans le rapport exportable.

## Corrections faites en route (bugs existants)

- **`core/voice/voix.js` : la garde de démarrage audio (15 s) n'était jamais annulée** quand le son démarrait. Toute lecture de plus de 15 secondes était donc déclarée en erreur (« la lecture audio ne démarre pas ») par le minuteur, la voix « finissait » alors que le son continuait. Les étapes d'un rapport durent 30 s et plus : corrigé (`el.onplaying` annule le minuteur). Effet de bord : `trader-pro/tests/annotations-chrome.mjs` lisait l'unité du graphique avant que l'action de la page ne l'ait réglée (course contre la charge du PC) ; il attend maintenant l'unité demandée.
- **`trader-pro/marches/cot.js` : `dateFr`** n'avait jamais converti la date (expression régulière `d{4}-d{2}-d{2}` sans antislash) : la page COT affichait « 2026-11-17 » au lieu de « 17/11/2026 ». Corrigé.
- Ajouts sans effet sur l'existant : `preparerParole(texte)` dans `voix.js` ; accesseur `graphe()` du terminal Volume (`volume-ui.js` / `integration.js`) pour poser les marques sur le graphique du mode Volume.

## Phase 5 — contrôles

Tests purs (dans `npm test`, qui passe en entier) : `bougies-test` 36, `rapports-test` 43, `moteur-test` 84 (rapports complet / COT or, Nasdaq, EUR/USD / marché / macro, données manquantes, commandes vocales, une seule voix, historique et comparaison, budget, exports sans injection).

Bancs Chrome (vraies pages, **vraies données de production**, tablette 1024×768 et téléphone 412×915) : `trader-pro/tests/rapports-chrome.mjs [tablette|tel|pc] [complet|cot|marche|macro|commandes] [actif] [x2|x4]` et `rapports-voix-chrome.mjs` (vraie voix de l'appli, Azure simulé).

| Banc | Résultat |
|---|---|
| Rapport complet or, tablette | 21/21 (9 étapes dans l'ordre, repères, bougies, bulles, une seule voix) |
| Rapport complet Nasdaq, tablette | 21/21 |
| Rapport COT or / Nasdaq / EUR/USD, tablette | 17/17, 19/19, 19/19 |
| Rapport marché global, tablette | 20/20 (13 étapes) |
| Rapport macro, tablette | 18/18 |
| Commandes vocales (suivant, reviens, pause, reprends, détaille ça, montre-moi sur le graphique, stop), tablette | 13/13 |
| Rapport COT or, téléphone, processeur ralenti ×4 | 19/19 |
| Vraie voix, tablette | 21/21 : pause réelle du son (position gardée, 0 animation pendant la pause), reprise au même endroit, question en cours de rapport puis « reprends », jamais deux sons, aucun `speechSynthesis`, une requête Azure par étape |
| `voix-v9-chrome` (régression voix) | 34/34 |
| `annotations-chrome` (régression terminal) | 12/12 |

**Blancs entre deux étapes** (de la fin d'une voix au début de la suivante) : tablette, sans ralentissement, 0,3 à 0,9 s dans les derniers essais (0,4 à 1,5 s avant le dernier réglage). Téléphone avec processeur ralenti ×2 : 0,4 à 1,4 s sauf **une** transition à 2,5 s (la première ouverture du terminal, la plus lourde). Ce PC n'a pas de GPU et peu de mémoire : les ouvertures du terminal bloquent le thread principal pendant 4 à 7 s, et le blanc suit ces blocages.

**Limites honnêtes**
- **Tablette réelle et S23 Ultra : non essayés** (appareils inaccessibles depuis cette session). La fluidité est mesurée sur des vues simulées (viewport et agent utilisateur) avec processeur ralenti ×2 et ×4. À vérifier sur les appareils : la première ouverture du terminal (≈ 2,5 s de blanc en simulation ×2).
- Synchronisation à la phrase, pas au mot (voir plus haut).
- Le COT de la source ne contient pas les petits spéculateurs : Rayle le dit. L'EUR/USD n'a pas de page COT dans la fenêtre Marchés : ses chiffres sont dans la carte.
- L'historique des annonces n'est pas conservé au-delà de la semaine du calendrier : les « réactions passées » ne sont mesurées que pour une annonce identique déjà publiée dans la semaine ; sinon Rayle donne le mécanisme classique et dit qu'il n'y a pas de mesure.
- Les corrélations avec « mes positions » : l'application ne fournit que des phrases de risque, pas la liste structurée des positions ; Rayle lit donc la corrélation de l'actif avec le dollar et le Nasdaq et rapporte ton risque engagé tel que Portefeuille le dit.
- Le Volume compte deux requêtes de voix (texte principal, puis footprint et carnet en direct, qui ne sont lisibles qu'une fois la page ouverte).
- Un rapport peut manquer une étape si le serveur de données ne répond pas dans les 50 s : l'étape est annoncée « donnée manquante » et listée dans l'historique.
- Une erreur JavaScript transitoire est apparue dans UN essai sur une quinzaine (non reproduite, texte non relevé) ; à surveiller.

## Les 3 phrases à dire en premier

1. « **Rayle, rapport complet sur l'or.** »
2. « **Rayle, rapport COT sur le Nasdaq.** » (puis « détaille ça », « pause », « reprends », « stop »)
3. « **Rayle, quelles annonces cette semaine et quel impact ?** » (ou « Rayle, rapport sur le marché »)
