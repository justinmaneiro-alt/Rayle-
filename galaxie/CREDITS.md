# Crédits de la galaxie

- **Textures des planètes, du soleil et de la Voie lactée** : Solar System Scope (https://www.solarsystemscope.com/textures/), licence Creative Commons Attribution 4.0 (CC BY 4.0). Textures dérivées de données NASA.
  Fichiers utilisés : `galaxie/textures/` (Mercure, Vénus, Terre jour, nuit et nuages, Lune, Mars, Jupiter, Saturne et ses anneaux, Uranus, Neptune, ciel étoilé).
- **three.js r170** (MIT) : `galaxie/vendor/` (licence : `LICENSE-three.txt`).

## La Terre (globe détaillé : `planetes/terre/`)

Toutes ces données sont gratuites, sans clé ; elles sont chargées par tuiles, à la demande, depuis les serveurs ci-dessous (jamais copiées dans le dépôt). Détail des licences et des limites : `planetes/terre/PLAN.md`.

- **Imagerie mondiale (Blue Marble Next Generation)** : NASA GIBS (https://earthdata.nasa.gov/gibs), données NASA du domaine public. « We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Observing System Data and Information System (EOSDIS). »
- **Imagerie Sentinel-2 sans nuages** : « EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020) », licence **CC BY-NC-SA 4.0 : usage non commercial seulement** (la licence commerciale est payante). Désactivable dans ⚙ de la Terre (« Imagerie satellite haute résolution »).
- **Relief** : AWS Terrain Tiles (format Terrarium) construit à partir de SRTM (NASA/NGA/USGS), 3DEP (USGS), GMTED2010 (USGS), ETOPO1 (NOAA), EU-DEM / Copernicus (Union européenne) et de modèles nationaux ouverts (Royaume-Uni Environment Agency OGL v3, Norvège Kartverket CC BY 4.0, Autriche CC BY 3.0 AT, Nouvelle-Zélande LINZ CC BY 3.0 NZ, Australie Geoscience Australia CC BY 4.0, Canada OGL-Canada, Mexique INEGI…). Source : https://registry.opendata.aws/terrain-tiles/ et https://github.com/tilezen/joerd/blob/master/docs/attribution.md.
- **Cartes (frontières, routes, eau, noms, bâtiments)** : © les contributeurs d'OpenStreetMap, licence ODbL (https://www.openstreetmap.org/copyright), servis par OpenFreeMap (https://openfreemap.org, tuiles vectorielles au schéma OpenMapTiles, https://openmaptiles.org). Mention demandée : « OpenFreeMap © OpenMapTiles Data from OpenStreetMap ».
- **Recherche de lieux** : Open-Meteo Geocoding API (https://open-meteo.com), données GeoNames, CC BY 4.0.
- **Bibliothèques copiées dans `planetes/terre/vendor/`** : `pbf` et `@mapbox/vector-tile` (BSD-3-Clause, Mapbox), `@mapbox/point-geometry` (ISC), `earcut` (ISC, Mapbox). Les licences sont dans le même dossier.

### Point B : actualités et météo

- **Actualités** : titres, nom du média, date et lien seulement, lus dans les flux RSS/Atom publics des médias suivants (liste complète et adresses dans `worker/src/terre/pays-flux.js`, local) : Le Monde, franceinfo, Le Figaro, Libération, 20 Minutes, France 24, BBC, The Guardian, Sky News, Tagesschau, Der Spiegel, El País, ANSA, la Repubblica, RTS, RTBF, NOS, TASS, Al Jazeera, The New York Times, NPR, CBC, NHK, The Japan Times, Times of India, The Hindu, G1, Folha, ABC (Australie), RNZ et beaucoup d'autres. Chaque titre renvoie vers l'article chez son éditeur. Complément : GDELT Project (https://www.gdeltproject.org, libre).
- **Météo** : Open-Meteo.com (https://open-meteo.com), données CC BY 4.0 ; en France, modèles Météo-France (AROME, ARPEGE) via Open-Meteo. Usage non commercial.
- **Radar de pluie** : RainViewer (https://www.rainviewer.com/api.html), usage personnel et éducatif ; mention demandée.
- **Image satellite du jour** : NASA GIBS, VIIRS SNPP Corrected Reflectance True Color (domaine public).

### Points 3 à 5 : actualités par sujets sur la Terre, la Terre comme outil de Raylé

- **Fil d'actualités** (France, monde, un pays) : titres, nom du média, date et lien **seulement** à l'affichage, lus dans les flux RSS/Atom publics des médias (liste et adresses vérifiées le 2026-10-17 dans `worker/src/terre/fil.js`, local). Chaque titre renvoie à l'article chez le média ; rien n'est recopié ni reformulé à l'écran. Un très court extrait de la description du flux (240 signes) ne sert qu'à la compréhension de l'IA et au classement : il n'est jamais affiché.
  - **France, nationale** : Le Monde, franceinfo, Le Figaro, Libération, 20 Minutes, France 24, BFM TV, RFI, L'Express, La Croix, Ouest-France, France Inter.
  - **France, régionale** : La Dépêche, Sud Ouest, Midi Libre, L'Indépendant, Le Progrès, Le Dauphiné libéré, DNA, L'Est républicain, Nice-Matin, et les 13 antennes régionales de France 3 (France Télévisions).
  - **Monde** : BBC News, The Guardian, The New York Times, Al Jazeera, DW, France 24 (anglais), Euronews, ONU Info, Le Monde, franceinfo, Le Figaro, South China Morning Post, The Japan Times, The Times of India, The Straits Times, ABC (Australie), Africanews, MercoPress, Kyiv Independent, The Times of Israel, NPR, Sky News ; **GDELT** (https://www.gdeltproject.org, gratuit, une requête toutes les 5 secondes au plus) en complément pour le monde.
  - Conditions d'usage : ces flux sont publiés par les médias pour être lus par des agrégateurs ; Raylé n'affiche que le titre, le média, la date et le lien, pour un usage personnel et non commercial, et n'en fait aucune republication. Les conditions détaillées de chaque média n'ont pas été relues une à une : en cas de demande d'un média, retirer son flux de `fil.js`.
- **Catégorie, importance et lieu** : calculés par Raylé (mots-clés, nombre de médias différents qui parlent du même sujet, dictionnaire de lieux intégré `worker/src/terre/gazetteer.js`). Toujours présentés comme des estimations (« localisation estimée »).
- **Recherche de lieux côté Worker** (outils `aller_a` et `meteo`) : Open-Meteo Geocoding API (GeoNames, CC BY 4.0).

## Mars (base martienne, `planetes/mars/`)

- **Carte de Mars** (vue de l'espace) : texture Solar System Scope (CC BY 4.0, dérivée de données NASA), la même que dans la galaxie (voir plus haut). Relief apparent : la même carte sert de relief léger.
- **Tout le reste est généré par le code, sans fichier externe** : la base (dômes, modules, panneaux, antennes), le salon et son mobilier, le terrain martien, les rochers, le ciel, Phobos et Deimos (formes et textures calculées par bruit reproductible, `planetes/mars/pc/procedural.js`), les fenêtres holographiques. Aucune licence supplémentaire à respecter, aucun téléchargement.
- **Données astronomiques utilisées dans les calculs** (faits publics) : rayon de Mars 3 389,5 km, orbites de Phobos (9 376 km, 7,654 h) et de Deimos (23 463 km, 30,35 h), rotation sidérale 24,623 h ; site : cratère Jezero (18,4° N, 77,5° E, NASA/JPL).
- **Fenêtres de la table : données entièrement factices**, marquées EXEMPLE.

### Mars : terminal de trading (étape M2a, `planetes/mars/pc/trading/`)

- **Graphique** : TradingView Lightweight Charts™ v5.2.1 (Apache License 2.0, © TradingView, Inc.), copié dans `terminal/vendor/` (licence : `terminal/vendor/lightweight-charts.LICENSE`). Comme la licence le demande, le logo et le lien vers https://www.tradingview.com/ restent affichés dans le graphique et dans le pied de l'espace de travail.
- **Données de marché** (gratuites, sans clé côté page ; lues par le Worker de Raylé, mises en cache) : **Yahoo Finance** (indices Nasdaq 100 `^NDX`, dollar DXY, taux US 10 ans `^TNX`, VIX `^VIX`, contrats à terme NQ=F et GC=F ; API non officielle, données différées d'environ 15 minutes, usage personnel) ; **Twelve Data** (or XAU/USD, offre gratuite, clé dans les secrets du Worker, quota du jour respecté) ; Stooq (secours journalier). Chaque série affiche sa source, son symbole et l'heure de sa dernière bougie.
- **Indicateurs** (moyennes mobiles, RSI, MACD, Bollinger, ATR, VWAP, profil de volume, supports et résistances, corrélations) : écrits pour Raylé (`indicateurs.js`, `analyse.js`), calculés dans le navigateur, aucune bibliothèque externe.
