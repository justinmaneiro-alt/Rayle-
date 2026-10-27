# Terre : plan et sources

## Architecture retenue

**Deux scènes, un seul rendu.** La galaxie garde sa scène (soleil, planètes). Au clic sur la Terre, la caméra de la galaxie vole jusqu'à elle (vol existant), puis le module `planetes/terre/pc/` prend le relais : il fournit sa propre scène « globe détaillé » et la galaxie la dessine à la place de la sienne (même canvas, même `EffectComposer` : MSAA, bloom et tonalité réutilisés). Fondu de 0,6 s entre les deux, la caméra est placée au même endroit (même longitude/latitude vue, même distance) : le raccord est invisible. À la sortie (Échap), fondu inverse et la rotation de la Terre reprend en douceur (rampe de 2 s). La galaxie est en pause pendant l'orbite (aucun coût).

**Globe détaillé.**
- Unité = 1 km. Les positions sont calculées en double précision côté JavaScript et soustraites de la position de la caméra avant l'envoi au GPU (rendu relatif à la caméra) : pas de tremblement du sol même à l'échelle d'une rue. Chaque tuile a sa géométrie relative à son centre.
- Quadtree de tuiles Web Mercator (z0 à z16), sphère de rayon 6371 km. Une tuile s'affiche quand sa taille à l'écran est ≈ 512 px ; elle se découpe plus finement quand on descend. Tuiles hors horizon ou hors champ ignorées. Une tuile ne remplace son parent que quand les quatre enfants sont prêts (jamais de trou). Sous les tuiles, une sphère de base (textures 8k de la galaxie) couvre le monde entier, pôles compris.
- Pas de texture géante : tout arrive par tuiles 256 px, dans des **Workers web** (réseau, décodage, rastérisation) pour ne jamais bloquer l'affichage. Cache mémoire LRU borné (mémoire vidéo maîtrisée) + cache HTTP du navigateur. Au plus 8 requêtes en parallèle, priorité aux tuiles proches du centre.
- Chaque tuile = image satellite + relief (hauteurs décodées en texture flottante : déplacement des sommets et normales par pixel) + calque vectoriel (frontières, routes, eau) dessiné par le Worker + carte des lumières de nuit. Ombrage par la direction du Soleil réelle (heure du PC).
- Bâtiments : extrusion des empreintes OpenStreetMap (hauteurs réelles quand elles existent) à partir de z15, par le Worker.
- Noms (pays, régions, villes, villages) : calque 2D devant la scène, choix par importance, anti-chevauchement, apparition animée.
- Qualité : haute (PC) / moyenne / basse (+ mode jeu). Le mode léger tablette et téléphone (carte plate 2D, mêmes données) vient après le point de contrôle D ; il réutilise les Workers et les sources ci-dessous.

**Pourquoi sans Worker Cloudflare pour les tuiles ?** Les trois serveurs ci-dessous sont des CDN publics prévus pour être appelés directement par les navigateurs (CORS ouvert, sans clé) : les passer par le Worker consommerait le quota gratuit (100 000 requêtes/jour) pour rien. Le Worker reste obligatoire pour tout ce qui exige une clé, un cache partagé ou une limite de débit (actualités, météo, avions, archives, position des appareils).

## Sources du globe (points de contrôle A)

| Couche | Source | Licence | Clé | Limites / remarques | Secours |
|---|---|---|---|---|---|
| Images mondiales z0 à z8 (500 m) | NASA GIBS, `BlueMarble_NextGeneration` | Données NASA : domaine public (mention NASA GIBS) | non | CORS ouvert, cache 3 jours ; gratuit | Textures 8k de la galaxie (déjà dans le dépôt) |
| Images z9 à z14 (10 m) | EOX Sentinel-2 cloudless 2020 (`tiles.maps.eox.at`) | CC BY-NC-SA 4.0 : usage personnel/non commercial libre, mention obligatoire « EOxCloudless by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020) ». **Interdit en usage commercial.** | non | CORS ouvert ; aucun quota publié, service courtois : cache et file d'attente | Interrupteur « imagerie haute résolution » dans les réglages ; sans lui, tuiles GIBS étirées + calque vectoriel |
| Relief | AWS Terrain Tiles `elevation-tiles-prod.s3.amazonaws.com/terrarium` (SRTM, 3DEP, GMTED2010, ETOPO1, EU-DEM Copernicus…) | Données ouvertes de plusieurs organismes, mention de chaque source (voir CREDITS) | non | z0 à z15, CORS ouvert (adresse « virtual-host » obligatoire : l'adresse `s3.amazonaws.com/…` n'a pas CORS) | Mapterhorn (`tiles.mapterhorn.com`, WebP terrarium 512, CORS ouvert) |
| Frontières, routes, eau, villes, villages, bâtiments | OpenFreeMap (planète OpenMapTiles, tuiles vectorielles z0 à z14) | Données ODbL © OpenStreetMap contributors, schéma OpenMapTiles (BSD/CC-BY) ; usage commercial permis | non | « Aucune limite de requêtes » (le téléchargement hors ligne est plafonné à 3 000 tuiles ; nous ne téléchargeons rien en masse) ; mention « OpenFreeMap © OpenMapTiles Data from OpenStreetMap » | Natural Earth (domaine public) en fichiers statiques pour pays/régions/villes principales |
| Lumières de nuit | Texture 8k de la galaxie (déjà dans le dépôt) ; NASA Black Marble `VIIRS_Black_Marble` (GIBS, domaine public) en option | domaine public | non | 500 m | — |
| Nuages qui dérivent | Texture 2k de la galaxie + dérive ; nuages réels via Open-Meteo au point B | CC BY 4.0 / Open-Meteo CC BY 4.0 | non | — | — |

Rejeté : tuiles `tile.openstreetmap.org` (politique d'usage interdit l'usage intensif), Google/Bing/Esri/Mapbox (licences ou clés), Cesium Ion (compte).

## Sources du point B (actualités et météo) : vérifiées le 2026-10-17

Tout passe par le Worker (routes `/actualites` et `/meteo`, dossier `worker/src/terre/`, local et ignoré par git : **à déployer par Justin avec `npx wrangler deploy` dans `worker/`**). Cache 10 à 15 min (D1 + cache Cloudflare, copie de secours si la source tombe), limites de débit, aucune clé.

| Besoin | Source | Licence / conditions | Clé | Limites | Si elle tombe |
|---|---|---|---|---|---|
| Actualités par pays | **73 pays, 172 flux RSS/Atom** de grands médias nationaux (Le Monde, franceinfo, BBC, NYT, NHK, Times of India, G1…), liste dans `worker/src/terre/pays-flux.js`, testée en réel (`worker/scripts/verifier-flux.mjs`) : 164 flux sur 236 candidats ont répondu et ont été gardés, les morts ou périmés ont été retirés | Titres + média + date + lien seulement ; les résumés et articles ne sont jamais recopiés (ils appartiennent aux journaux) | non | 6 flux interrogés par pays, 6,5 s chacun, cache 10 min | le média est signalé « indisponible », les autres continuent |
| Actualités, complément | GDELT DOC 2.0 (`api.gdeltproject.org`) | libre, gratuit | non | **1 requête toutes les 5 s** (le Worker les sérialise), intervient seulement si les flux donnent moins de 6 titres | « indisponible » ; testé : l'IP de développement a été limitée (429) après une rafale |
| Météo | Open-Meteo `api.open-meteo.com` : modèles **Météo-France (AROME 1,3 km puis ARPEGE)** en France métropolitaine, meilleur modèle mondial ailleurs | CC BY 4.0, gratuit pour un usage non commercial, environ 10 000 appels/jour | non | cache 15 min, coordonnées arrondies à 0,02° | « indisponible » ; champs absents = null, jamais inventés |
| Recherche de lieux | Open-Meteo Geocoding | CC BY 4.0 | non | appelée par le navigateur | « Recherche indisponible » |
| Radar de pluie | RainViewer (`api.rainviewer.com`, tuiles `tilecache.rainviewer.com`) | « usage personnel et éducatif », mention demandée, disponibilité non garantie | non | 13 images (2 h, une toutes les 10 min), **niveau de zoom 7 maximum** (plus fin = image vide, donc étiré) ; **pas de prévision** (nowcast et satellite infrarouge vides en 2026) ; CORS ouvert, appelé directement | « radar indisponible » ; pas d'écho sur les océans ni hors couverture radar |
| Vrais nuages | NASA GIBS VIIRS SNPP Corrected Reflectance (image d'hier, ≈ 250 m) | domaine public | non | niveau 9 maximum ; en-têtes sans cache | retour à Blue Marble (option « Image satellite du jour ») |

Rejeté pour le radar : Météo-France radar (clé obligatoire), NOAA MRMS (États-Unis seulement), DWD (Allemagne seulement). Rejeté pour les vrais nuages en direct : aucun flux mondial libre et fiable (le satellite infrarouge de RainViewer est vide).

## Autres sources (points C et D, à confirmer au moment du chantier)

| Besoin | Source | Licence | Clé | Remarques |
|---|---|---|---|---|
| Avions | OpenSky Network | gratuit non commercial, anonyme limité (≈ 400 crédits/jour) ; compte gratuit = plus | optionnelle | via Worker ; sinon « SIMULATION » |
| Bateaux | AIS gratuit fiable : presque inexistant (AISStream.io demande une clé gratuite, couverture inégale) | — | oui, gratuite | sinon « SIMULATION » |
| Archives | Gallica (BnF, IIIF), Europeana, Internet Archive, Wikimedia Commons/Wikisource, Library of Congress, Smithsonian Open Access, Rijksmuseum, Royal Museums Greenwich, NYPL, DPLA, HathiTrust | voir point D : licence et clé vérifiées une par une | selon la source | liste réaliste fournie au point D |
| Plans de navires | Rijksmuseum (CC0), Royal Museums Greenwich, Gallica (Marine), Library of Congress, Smithsonian, NYPL, Commons | idem | selon la source | liste réaliste au point D |

## Points de contrôle

A orbite, globe, relief, zoom · B actualités et météo · C localisation et trafic · D histoire, archives, plans, voix.
