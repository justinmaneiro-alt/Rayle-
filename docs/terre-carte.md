# La Terre, base de Raylé : globe → carte détaillée

Quand Raylé doit montrer un lieu, **la Terre sert de carte**. Le globe 3D de l'Univers descend, en continu, vers une carte détaillée (MapLibre GL JS), pose un repère, et Raylé commente. Plus de panneau Leaflet ni de tuiles `tile.openstreetmap.org`.

## Ce que ça fait

| Demande | Résultat |
|---|---|
| « montre-moi Castres » · « montre le Mont-Blanc » · « où est la gare de Lyon » | le globe descend vers le lieu, repère posé, fiche (nom complet, coordonnées, source), Raylé dit « Voici Castres, Tarn, environ 42 505 habitants. » (uniquement ce que la source a donné) |
| « itinéraire jusqu'à Toulouse » · « itinéraire de Bordeaux à Toulouse à pied » | départ (vert) et arrivée (magenta) marqués, tracé lumineux, caméra cadrée sur le trajet, distance et durée dites ; boutons 🚲 / 🚶 / 🚗 pour changer de mode |
| « où est mon téléphone ? » · « où sont mes appareils » | marqueurs légers (PC, tablette, téléphone) ; en zoomant, le **disque de précision** de la position apparaît ; la caméra cadre l'appareil demandé |
| « zoome niveau rue » · « zoom 12 » · « zoome sur les départements » | niveau de zoom exact (0 à 19, ou monde, pays, région, département, ville, quartier, rue, bâtiment) |
| « efface les repères » | marqueurs, tracé et disques retirés |

Pays (hors France), mers et océans restent sur le globe (surbrillance, fiche, présentation) : c'est là qu'ils sont les plus beaux. **La France passe par la carte** pour montrer régions et départements.

## Bascule fluide globe ↔ carte

La caméra du globe et la carte regardent **la même région à la même échelle** (`zoomPourDistance` / `distancePourZoom` dans `js/univers/espace/carte-style.js`) :

* distance au centre de la Terre > 1,16 : le globe seul ;
* entre 1,16 et 1,08 : la carte apparaît en **fondu enchaîné** par-dessus le globe (elle attend ses tuiles, 4 s au plus) ;
* sous 1,08 : la carte seule, elle reçoit les gestes (glisser, pincer, molette) et le globe n'est plus dessiné (économie de GPU) ;
* en dézoomant dans la carte (zoom < 6,35) : le fondu repart dans l'autre sens et le globe reprend la main, **sur la même image**.

Les commandes (« montre-moi Castres ») font ce trajet seules : vol du globe jusqu'à ~76 km d'altitude, la carte (cachée) charge déjà les tuiles de la destination pendant le vol, puis glisse jusqu'au zoom du lieu (zoom de ville ≈ 11,5 ; sommet 12 ; adresse 17,5 ; boîte englobante quand la source la donne). Si on est déjà dans la carte à moins de 450 km, simple glissement.

## Niveaux de détail (visibles seulement au zoom)

| Niveau | Zoom | Contenu |
|---|---|---|
| Monde | 0 – 4 | continents, océans, pays (noms en français, frontières) |
| Régions | 4 – 8 | régions de France (contours officiels), grandes villes, autoroutes, États/provinces |
| Départements | 6,2 – 11 | départements (contours officiels + numéros), villes moyennes, routes nationales, grands fleuves |
| Villes | 8 – 14 | villes, villages, noms de communes, routes principales puis secondaires, rivières, forêts et parcs, sommets, limites communales (z12+) |
| Rues | 13 – 19 | rues et chemins, noms de rues, hameaux, lieux-dits, bâtiments, numéros |

Chaque étiquette a son propre intervalle de zoom (pas de surcharge) ; le tableau `NIVEAUX` et les tests `tests/terre-carte-test.mjs` vérifient que le style respecte cet ordre (ville < bourg < village < hameau < lieu-dit ; autoroute < nationale < primaire < secondaire < tertiaire < locale < chemin).

## Sources (toutes gratuites, sans clé)

* **Tuiles** : OpenFreeMap (vectorielles, schéma OpenMapTiles, © OpenStreetMap), style sombre « Univers / HUD » écrit pour Raylé (`carte-style.js`). Attribution toujours visible sur la carte.
* **France** : contours des régions et départements, IGN Admin Express (data.gouv.fr), fichiers locaux `ui/assets/geo/` produits par `node scripts/generer-france-geojson.mjs` (hors ligne, instantanés). Communes, villages, lieux-dits : tuiles.
* **Géocodage** (`js/univers/espace/lieux.js`), dans l'ordre : cache (session + `localStorage`, 30 jours, 160 entrées) → lieux connus de Raylé (grandes villes, capitales, monuments : aucun réseau) → adresse de France (API Adresse / Géoplateforme, repli api-adresse.data.gouv.fr) → commune de France (geo.api.gouv.fr, la plus peuplée l'emporte : « Castres » = Tarn) → **Nominatim** (une requête par seconde au plus, en file ; zone favorisée France sans exclure le monde) → repli API Adresse si Nominatim est injoignable.
* **Itinéraires** : routing.openstreetmap.de (voiture, vélo, à pied), secours OSRM de démonstration (voiture seulement).

## Outils exposés au cerveau de Raylé

Définis dans `js/rayle/terre-outils.js` (`RayleTerre.OUTILS`, avec description et schéma JSON). Deux noms équivalents : `earth.show_place` (nom logique) et `earth_show_place` (nom donné aux API d'IA, qui n'acceptent pas le point).

| Outil | Paramètres | Effet |
|---|---|---|
| `earth.show_place` | `query` (requis), `zoom?` | montre un lieu |
| `earth.show_route` | `to` (requis), `from?` (sinon la position de Justin), `mode?` (`voiture` · `velo` · `pied`) | trace un itinéraire |
| `earth.show_devices` | `device?` (« téléphone », « tablette », « PC ») | montre les appareils qui partagent leur position |
| `earth.set_zoom` | `level` (0–19 ou nom de niveau) | règle le zoom |

La page rend compte du **résultat réel** : un échec (lieu introuvable, WebGL absent, aucun appareil localisé) remplace la réponse de l'IA, qui ne dit jamais « c'est fait » à tort. Sans WebGL, Raylé le dit et donne le lien OpenStreetMap.

### Brancher le Worker

Le Worker n'est pas versionné et ne se déploie pas depuis ici. Le bloc « `// src/terre.js (la Terre sert de carte)` » a été ajouté à `worker/worker.js` (copie de l'ancien : `worker/worker-avant-terre.js`) : **recoller `worker/worker.js` dans Cloudflare** pour que l'IA appelle les quatre outils (action `{type:'terre', outil, args}` exécutée par `terreAgent()` dans `js/rayle/agent.js`). Sans cela, rien ne casse : les outils existants `afficher_carte` et `itineraire` envoient déjà « montre-moi … » / « itinéraire … » vers la page, qui les affiche désormais **sur la Terre**.

## Fichiers

| Fichier | Rôle |
|---|---|
| `js/univers/espace/carte-style.js` | style MapLibre (couches et zooms), calculs globe ↔ carte, niveaux de zoom nommés |
| `js/univers/espace/lieux.js` | géocodage (cache, limite de débit, repli), itinéraires |
| `js/univers/espace/carte-terre.js` | carte MapLibre : bascule fluide, marqueurs, tracé, appareils, vols |
| `js/univers/theme-espace.js` | commandes `lieu`, `itineraire`, `appareils`, `zoom-carte`, `effacer-carte` |
| `js/rayle/terre-outils.js` | les 4 outils `earth.*` et `terreAgent()` |
| `js/rayle/carte.js` | comprend la phrase (« montre-moi Castres », « itinéraire… ») et appelle les outils |
| `js/rayle/commandes-univers.js` | phrases de zoom par niveau et d'effacement |
| `js/rayle/localisation.js` | positions des appareils (existant, repris : ajout de la précision et du filtre par appareil) |
| `js/vendor/maplibre/` | MapLibre GL JS 5.24.0 (UMD, worker intégré) |
| `ui/assets/geo/` | contours officiels de la France |

## Limites connues

* Le rendu de la carte demande WebGL (comme l'Univers). Sans WebGL ou sans réseau : le globe affiche le repère, et Raylé dit que la carte détaillée n'est pas disponible.
* Noms hors de France : fournis par OpenStreetMap, parfois en langue locale ; pays en français grâce à la table de Raylé.
* Une position d'appareil n'existe que si l'appareil la partage lui-même (Réglages) ; sa précision est affichée telle que le navigateur la donne.
* Le service d'itinéraires FOSSGIS est public : en cas d'indisponibilité, seule la voiture a un secours (OSRM de démonstration).
* Nominatim limite à une requête par seconde : plusieurs lieux demandés d'un coup sont servis en file.

## Tests

* `node tests/terre-carte-test.mjs` : zoom ↔ distance, fondu, style (détail progressif), géocodage (cache, limites, replis), itinéraires, outils `earth.*`, phrases.
* `node tests/terre-worker-test.mjs` : outils côté Worker (sauté si `worker/` est absent).
* `node tests/capacites-test.mjs` : les exemples de la famille « La Terre = carte » déclenchent vraiment les analyseurs.
* Rendu réel (tuiles, fondu, vol de caméra, molette) : banc navigateur hors dépôt avec Chrome et `puppeteer-core` (voir la fin de cette page pour ce qui a été mesuré).
