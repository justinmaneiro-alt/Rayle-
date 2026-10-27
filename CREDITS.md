# Crédits et licences

Raylé réutilise des **idées** et des **bibliothèques** libres. Ce fichier dit d'où elles viennent et sous quelle licence.
Aucun code de ces projets n'est copié ni exécuté : les dépôts ont été lus comme des **données non fiables** (hors du projet), puis les idées ont été **réécrites en JavaScript** dans Raylé.

## Idées reprises (M6, poste de pilotage de l'agent de trading)

| Projet | Licence | Ce que Raylé en retient | Où dans Raylé |
|---|---|---|---|
| [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills) | MIT | Score de régime crypto de 0 à 100 (100 = risk-on) avec composantes pondérées et redistribution des poids manquants ; détection de stagnation de la recherche et pivot de stratégie ; analyse du résiduel d'une stratégie ; bilan hebdomadaire des trades et coaching de discipline | `agent-m6/regime.js` (pondérations propres à Raylé 25/15/20/30/10), `stagnation.js`, `journal.js` (bilan, revue de discipline) |
| [VictorVVedtion/trading-skills](https://github.com/VictorVVedtion/trading-skills) | MIT | Contrôle avant trade en neuf points ; échelle vert / orange / rouge du détecteur de tilt (revanche, grossissement après perte, rafale de trades) | `gardien.js` (`controleAvantTrade`), `tilt.js` |
| [SKE-Labs/agent-trading-skills](https://github.com/SKE-Labs/agent-trading-skills) | Apache-2.0 | Définitions des fair value gaps, order blocks, zones de liquidité, premium / discount, kill zones ; principe « tout concept ICT est une hypothèse à tester contre le hasard, avec les coûts, en walk-forward » ; figures chartistes (double sommet / creux, drapeau) | `agent-m6/ict.js` (364 variantes figées, mêmes critères de validation que le reste), catalogue d'idées |
| [Jakeschincariol/day-trader-skill](https://github.com/Jakeschincariol/day-trader-skill) | MIT | Simulation de milliers de sessions et rejeu de toutes les occurrences passées (« machine à remonter le temps ») ; gardien de risque PASS / BLOCK où une sortie n'est jamais bloquée par une limite du jour | `agent-m6/simulation-eval.js`, `gardien.js` |

Chaque idée du catalogue (`idees.js`, `CATALOGUE_IDEES`) porte son crédit et sa licence, visibles dans l'onglet « Idées » du poste.
Les pondérations, les seuils et le code sont propres à Raylé ; rien ici ne reprend le texte des dépôts.

### Rappel des licences
- **MIT** : permission d'utiliser, copier, modifier, fusionner, publier et distribuer, à condition de conserver la mention de droit d'auteur et la licence dans les copies substantielles. Raylé ne copie pas de code : les idées sont citées ici.
- **Apache-2.0** : licence permissive avec mention des auteurs et clause de brevets. Raylé ne reprend aucun fichier de ce dépôt ; les concepts sont cités ici.

## Bibliothèques et données

| Élément | Licence / conditions | Usage |
|---|---|---|
| Lightweight Charts (TradingView) | Apache-2.0 | Graphiques du poste (`terminal/vendor`) ; mention « TradingView » conservée |
| Widget TradingView (tv.js) | Conditions de TradingView | Graphique TradingView du terminal de Mars, chargé depuis leur site |
| Three.js r170 | MIT | Galaxie 3D (`galaxie/vendor`) |
| Textures Solar System Scope | CC BY 4.0 | Planètes de la galaxie |
| NASA GIBS Blue Marble | Libre (NASA) | Globe de la Terre |
| EOX Sentinel-2 (2020) | CC BY-NC-SA, **non commercial** | Globe de la Terre (désactivable) |
| AWS Terrain Tiles (Terrarium) | Open data | Relief de la Terre |
| OpenFreeMap / OpenStreetMap | ODbL, © contributeurs OpenStreetMap | Bâtiments et noms de la Terre |
| Binance (API publique de données de marché) | Conditions de Binance | Historique et direct BTC, SOL, DOGE du poste (lecture seule) |
| Kraken (API publique OHLC) | Conditions de Kraken | Recoupement des prix (lecture seule, via le Veilleur ou le Worker) |
| CoinGecko, alternative.me (peur et cupidité), Binance futures (financement) | Conditions de chaque service, API gratuites sans clé | Score de régime |
| Open-Meteo, RainViewer | Conditions de chaque service | Météo de la Terre |
| Open-Meteo (prévisions et géocodage) | Données ouvertes (CC BY 4.0), API gratuite sans clé | Météo du tableau de bord de l'accueil |
| USGS, NASA EONET, GDACS | Données publiques | Événements de la Terre du tableau de bord |
| Vosk (alphacep) + `vosk-browser` | Apache-2.0 | Mot « Raylé » reconnu EN LOCAL pendant la veille (`core/voice/vendor/vosk.js`) |
| Modèle `vosk-model-small-fr-0.22` | Apache-2.0 | Modèle français local de Vosk (41 Mo, installé par `app-pc/installer-voix-locale.ps1`, jamais publié) |

## Avertissement
Raylé ne donne **pas de conseil financier** et ne passe **aucun ordre**. Vérifie toujours le contrat de ton compte (règles de perte du jour, de drawdown, frais) auprès de Kraken Prop : les valeurs du gardien sont des réglages à ajuster, pas des faits garantis.

## Terre : photos aériennes, relief fin (nuit 3, phase T2) — sources vérifiées le 2026-10-24
Toutes : tuiles publiques **sans clé**, **CORS ouvert**, appelées directement par le navigateur (le Worker n'est pas utilisé). Le crédit exact de chaque source s'affiche dans le panneau « Crédits et licences » de la Terre et, quand la source est à l'écran, dans la ligne du bas. Les photos locales se coupent dans ⚙ (« Photos aériennes locales »).

| Source | Licence / conditions | Couverture, résolution |
|---|---|---|
| IGN, BD ORTHO via la Géoplateforme (`data.geopf.fr`, couche ORTHOIMAGERY.ORTHOPHOTOS) | Licence Ouverte Etalab 2.0, mention « © IGN » ; services gratuits (CGU cartes.gouv.fr) | France et outre-mer, jusqu'à 20 cm (niveau 18 utilisé) |
| swisstopo, SWISSIMAGE (`wmts.geo.admin.ch`) | Données ouvertes (OGD), source « © swisstopo » | Suisse, ≈ 10 cm |
| PNOA, Instituto Geográfico Nacional (`ign.es/wmts/pnoa-ma`) | CC BY 4.0, « PNOA © IGN España » | Espagne, ≈ 25 cm |
| PDOK / Beeldmateriaal Nederland (`service.pdok.nl`, Actueel_orthoHR) | CC BY 4.0 | Pays-Bas, 8 cm |
| basemap.at orthophoto (`mapsneu.wien.gv.at`) | CC BY 4.0, « basemap.at / Geoland.at » | Autriche, 30 cm |
| ČÚZK ortofoto (`ags.cuzk.cz`) | CC BY 4.0, « ČÚZK » | Tchéquie |
| GSI Japon, seamlessphoto (`cyberjapandata.gsi.go.jp`) | Conditions d'utilisation du gouvernement japonais v2 (compatibles CC BY 4.0), « 国土地理院 » | Japon |
| USGS The National Map, USGSImageryOnly (`basemap.nationalmap.gov`) | Domaine public (USGS) | États-Unis, niveau 16 |
| **Mapterhorn** (`tiles.mapterhorn.com`), relief Terrarium 512 px, z0–z17 | Tuiles libres ; **151 sources ouvertes** (CC BY 4.0, domaine public US, Licence Ouverte, Datenlizenz Deutschland 2.0…), liste : https://download.mapterhorn.com/attribution.json ; crédit « © Mapterhorn » avec lien https://mapterhorn.com/attribution | Monde 30 m (Copernicus GLO-30), 0,25 à 5 m dans de nombreux pays (France, Suisse, Autriche, Allemagne, Italie, Japon, Espagne, États-Unis…) |

**Refusées** (raison) : Esri World Imagery (conditions ArcGIS : usage via compte/clé, pas de réutilisation libre) ; Google Maps / Earth, Bing (interdit) ; Mapbox Satellite (clé et conditions) ; Dataforsyningen (Danemark), Lantmäteriet (Suède), NLS (Finlande), LINZ (Nouvelle-Zélande) : clé obligatoire ; Wallonie ortho : réponse 404 à l'essai (adresse non vérifiée, non retenue) ; Luxembourg : réponse 400 à l'essai (non retenu) ; nuages animés géostationnaires NASA GIBS (GOES-West, Himawari) : accessibles mais ne couvrent pas l'Europe en projection 3857, donc non intégrés (l'option « image satellite du jour » VIIRS existe déjà).

Pour la Terre en général : OpenFreeMap / OpenMapTiles / © contributeurs OpenStreetMap (ODbL), Solar System Scope (CC BY 4.0), three.js (MIT), NASA GIBS (libre), EOX Sentinel-2 cloudless 2020 (CC BY-NC-SA 4.0, **non commercial**, désactivable).

## Chargeurs et décodeurs copiés de three.js r170 (nuit 3, phase S1) : `galaxie/vendor/addons/`
GLTFLoader, DRACOLoader, KTX2Loader (+ utils/WorkerPool, math/ColorSpaces), RGBELoader, BufferGeometryUtils, RoomEnvironment, GTAOPass (+ shaders), meshopt_decoder, ktx-parse, zstddec : **MIT** (three.js, fichier `LICENSE-three-addons.txt`). Décodeur Draco (`libs/draco/gltf/`) : Apache-2.0 (Google). Transcodeur Basis Universal (`libs/basis/`) : Apache-2.0 (Binomial LLC). Aucun code modifié.

## Saturne : vaisseau, cockpit, salle médicale (nuit 3, phase S1)
Aucun asset externe : géométries, textures (couleur, rugosité, normales, émissive), écrans holographiques, flammes et particules sont **produits par le code** (`planetes/saturne/pc/`), conception originale (aucun vaisseau, cockpit, logo ni personnage existant ; nom « Vésale » en hommage à l'anatomiste André Vésale). Textures de planètes et ciel étoilé : Solar System Scope (CC BY 4.0), déjà listées plus haut. Éclairage d'environnement : `RoomEnvironment` de three.js (MIT).


## Anatomie 3D (Saturne, phase S2)
- **BodyParts3D 4.0** © The Database Center for Life Science (DBCLS), **CC BY 4.0** : géométrie des 2 234 structures anatomiques (homme adulte de référence), utilisée via le dépôt `ashemag/human-atlas` (code **MIT**), qui l'a simplifiée. Les maillages sont reconvertis en glTF compressé (quantification et Meshopt) hors du dépôt, dans `assets-lourds/anatomie/` ; aucune modification de forme au-delà de la compression.
- **Terminologia Anatomica 2** (liste `TA2.csv` du projet **Z-Anatomy**, https://github.com/Z-Anatomy/Models-of-human-anatomy), **CC BY-SA 4.0** : noms latins et français de l'index d'anatomie. **Partage à l'identique** : les noms dérivés de cette liste (champs `nom_la` et `nom_fr` de `assets-lourds/anatomie/index.json`) sont aussi sous CC BY-SA 4.0. Les noms issus de règles écrites dans `anatomie-noms.mjs` (vertèbres, côtes, doigts, dents) sont ceux du projet.
- Crédits affichés dans le panneau d'anatomie de la salle médicale. Les fiches de `anatomie-savoirs.js` sont rédigées pour le projet (pas de copie d'un manuel) et restent à valider par Justin.

## Anatomie 2 (mission du 2026-10-24) : mouvements, fenêtres, nerfs schématiques, pathologies
- **Aucune ressource externe ajoutée** : pas de nouveau modèle, de texture, de police ni de bibliothèque. Les mouvements (cinématique, pondération des muscles par proximité aux os, calibration des pivots) et les fenêtres holographiques sont du code original du projet, calculé à partir de la géométrie BodyParts3D déjà créditée ci-dessus.
- **Nerfs périphériques** : aucune source libre compatible n'a été intégrée (BodyParts3D n'en contient pas) ; les tracés sont des **schémas générés par le code** (tubes passant par des repères osseux), étiquetés « schéma, tracé approximatif » partout (`planetes/saturne/pc/anatomie-nerfs-schema.js`). Pistes de sources encore à vérifier (non utilisées) : Z-Anatomy (CC BY-SA 4.0, partage à l'identique), autres atlas ouverts.
- **Fiches de pathologies, de mouvements et de nerfs** : textes rédigés de mémoire d'après l'anatomie, l'orthopédie et la rééducation classiques ; aucun texte copié. Classifications citées pour information (Cobb, Lenke, King, Schwab-SRS, Risser, Nash-Moe, Meyerding, Ashworth, ASIA/ISNCSCI, GMFCS, AO/OTA, Ficat, Graf, Aitken, Bayne) : noms et principes seulement, à vérifier avec le cours.
