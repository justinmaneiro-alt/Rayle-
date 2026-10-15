# Crédits et licences

Ce fichier recense ce que Raylé utilise qui n'a pas été écrit par son auteur. La liste détaillée des images du fond Espace / Jarvis / Terre est dans
[`ui/assets/CREDITS.txt`](ui/assets/CREDITS.txt) ; elle est reprise ici en résumé.

## Bibliothèques
| Élément | Version | Licence | Où |
|---|---|---|---|
| three.js (+ `three/addons` : GLTFLoader, EffectComposer, SSAOPass, UnrealBloomPass, OutputPass, ShaderPass, FXAAShader, BokehPass, RoomEnvironment) | 0.160.0 | MIT | chargé depuis `cdn.jsdelivr.net` (import map de `index.html`) |
| Leaflet | voir `js/vendor/leaflet/` | BSD-2-Clause | `js/vendor/leaflet/` |
| Lightweight Charts | voir `js/vendor/lightweight-charts.LICENSE` | Apache-2.0 | `js/vendor/` |
| world-atlas / topojson-client | voir `js/vendor/world-atlas.LICENSE` | ISC | `js/vendor/` |

## Images et textures (fond Espace, Terre)
| Fichier(s) | Source | Licence |
|---|---|---|
| `ui/assets/terre-jour-*.jpg`, `terre-nuit-*.jpg`, `nuages-2048.jpg` | NASA Earth Observatory / Visible Earth (Blue Marble, Black Marble, Blue Marble Clouds) | domaine public (NASA) |
| `ui/assets/espace/*` (planètes, Lune, anneaux, masque des océans) | Solar System Scope, d'après des données NASA | CC BY 4.0 |
| `ui/assets/espace/ciel-2k.webp`, `ciel-4k.webp` (carte du ciel : étoiles et Voie lactée, coordonnées galactiques) | Solar System Scope (`8k_stars_milky_way`, redimensionnée à 4096 et 2048 px, recompressée en WebP) ; **mention : « Textures : Solar System Scope, CC BY 4.0 »** | CC BY 4.0 |
| `ui/assets/espace/terre-relief-2k.webp` | calculé par Raylé d'après NASA Visible Earth « Topography » (GEBCO 2008) | domaine public |
| `ui/assets/ville-*.mp4` | Pexels, vidéo n° 13246966 | licence Pexels |
| Soleil, petites lunes, astéroïdes, Voie lactée de secours (hors ligne), nébuleuses, matériaux anatomiques (os, muscles, cartilages, organes), environnement d'éclairage | dessinés par le code (shaders et canvas), aucun fichier | — |

## Données scientifiques et orbitales
| Élément | Source | Licence / conditions | Où |
|---|---|---|---|
| Chiffres des fiches Espace (planètes, Soleil, Lune, lunes, ISS, Hubble, Webb, Curiosity, Perseverance, missions, comètes) | NASA (Planetary Fact Sheets, pages de mission), NASA/JPL Solar System Dynamics, ESA (Rosetta) : liste complète fiche par fiche dans [`docs/espace-sources.md`](docs/espace-sources.md) | faits et chiffres, reformulés ; sources citées | `ui/espace-savoir.js` |
| Éléments orbitaux de l'ISS (TLE) | CelesTrak (https://celestrak.org/NORAD/elements/), rafraîchis toutes les 6 h ; un TLE du 13/10/2026 est embarqué en secours | données publiques (CelesTrak demande de ne pas interroger plus d'une fois toutes les 2 heures : respecté) | `ui/espace.js` |
| Position de secours de l'ISS | api.wheretheiss.at (Open Notify / Where the ISS at ?) | API publique sans clé | `ui/espace.js` (sans SGP4) ; valeurs de contrôle dans `tests/sgp4-test.mjs` |
| Propagateur SGP4 | port JavaScript écrit pour Raylé d'après l'algorithme publié (F. R. Hoots et R. L. Roehrich, Spacetrack Report n° 3, 1980 ; D. A. Vallado et coll., « Revisiting Spacetrack Report #3 », 2006) | algorithme publié ; aucun code tiers recopié | `ui/sgp4.js` |
| Modèle 3D articulé de l'ISS | dessiné par le code d'après les dimensions de la NASA (109 m de bout en bout, treillis de 94 m, 8 ailes solaires, 420 t) | — | `ui/espace-iss.js` |

Le modèle NASA de l'ISS (`iss.glb`, ci-dessus) reste dans le dépôt mais n'est plus affiché par défaut : ses panneaux ne peuvent pas suivre le Soleil.

## Modèles 3D du module Anatomie (GLB)
| Structures | Fichier | Auteur | Licence | Source |
|---|---|---|---|---|
| Squelette humain complet : crâne, mandibule, dents, 24 vertèbres, disques, 12 paires de côtes, sternum, clavicules, omoplates, bras, avant-bras, mains, bassin, jambes, rotules, pieds (116 nœuds) | `ui/assets/anatomie/squelette-cc0.glb` | **Armen Barsegyan** (CGI Coffee) | **CC0 1.0** (« No Rights Reserved », domaine public) | https://cgicoffee.com/blog/2017/10/free-human-skeleton-3d-model |

**Modifications faites par Raylé** (permises par la licence CC0, signalées par courtoisie) : le modèle original (`human_skeleton.obj`, 2017, 71 objets, textures PBR) a été converti par `scripts/convertir-squelette.mjs` en un seul GLB de 1,4 Mo : mise à l'échelle (×0,1 → 1,75 m), normales recalculées, textures et UV retirés (Raylé applique ses propres matériaux), séparation des côtes et des clavicules en côté droit / gauche, découpe des mains et des pieds en composantes (carpe, métacarpiens, phalanges ; talus, calcanéus, tarse, métatarsiens, phalanges) et des disques intervertébraux, suppression d'un doublon de L1 (`l02`) et d'une face parasite (`jaw0`). Les os du GLB sont ensuite recalés à l'exécution sur les formes schématiques de l'application (`js/anatomie/ajustement.js`).
Limite du modèle source : les mains et les pieds sont rudimentaires (doigts d'un seul tenant, tarse en trois pièces) ; c'est pourquoi ils sont remplacés, quand le fichier suivant se charge, par les os de BodyParts3D. Le fichier CC0 sert de repli (hors ligne, fichier manquant) et de source pour tout le reste du squelette.
`squelette-cc0.glb` a ensuite été retraité par `scripts/cuire-squelette.mjs` : épiphyse et occlusion ambiante cuites par sommet (attribut `_FIBRE`), quantification 16 bits (KHR_mesh_quantization), 1,1 Mo.

### Os détaillés : BodyParts3D
| Structures | Fichier | Auteur | Licence | Source |
|---|---|---|---|---|
| Mains (8 os du carpe, 5 métacarpiens, 14 phalanges par côté), pieds (talus, calcanéus, naviculaire, cuboïde, 3 cunéiformes, 5 métatarsiens, 14 phalanges par côté), crâne en os séparés (frontal, occipital, sphénoïde, ethmoïde, vomer, pariétaux, temporaux, zygomatiques, maxillaires, palatins, lacrymaux, nasaux, cornets), mandibule, os hyoïde (non affiché), 28 dents (157 nœuds) | `ui/assets/anatomie/os-detail-bp3d.glb` | **The Database Center for Life Science** (BodyParts3D, modèle adulte masculin) | **CC BY 4.0** | https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html |

Mention exigée : « BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International ».
**Point de vigilance sur la licence** : le README officiel de BodyParts3D (mis à jour le 2025-02-27) et la page de licence indiquent **CC BY 4.0**, mais les en-têtes des fichiers OBJ de l'archive (version 4.0 de 2013) mentionnent encore l'ancienne licence **CC BY-SA 2.1 Japon**. Raylé suit la licence officielle actuelle (CC BY 4.0, plus permissive). Si vous voulez lever tout doute, écrivez au contact indiqué dans le README (https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html) ; dans le pire cas, ce seul fichier (et lui seul) serait à partager dans les mêmes conditions : supprimer `os-detail-bp3d.glb` et son entrée du manifeste suffit pour revenir au squelette CC0 seul.
**Modifications faites par Raylé** (`scripts/convertir-bodyparts3d.mjs`) : sélection des os (archive « isa_BP3D_4.0_obj_99 », maillages à 99 % de détail, parties « isa_element_parts »), changement de repère (mm, z vers le haut → mètres, y vers le haut, face vers +z), soudure des sommets, une passe de subdivision de Loop pour les petits os (maillages de 170 à 800 sommets), normales lissées, épiphyse et occlusion ambiante cuites par sommet (`_FIBRE`), quantification 16 bits. Les os sont ensuite recalés à l'exécution sur l'avant-bras et la jambe réellement affichés (`js/anatomie/moteur.js`, `recalerPoignet`).

### Corps haute fidélité : BodyParts3D (os, muscles, tendons, vaisseaux, organes) et nerfs
Tous ces fichiers viennent **du même corps** (BodyParts3D, modèle adulte masculin, version 4.0, maillages à 99 % de détail, arbres « est un » et « fait partie de ») : c'est ce qui permet de poser les insertions des muscles sur les os.
| Couche | Fichier | Contenu | Auteur | Licence |
|---|---|---|---|---|
| Os axiaux | `ui/assets/anatomie/os-axial-bp3d.glb` | os longs, scapula, clavicule, os coxal, patella, 24 vertèbres, 24 côtes, sacrum, disques | The Database Center for Life Science (BodyParts3D) | CC BY 4.0 |
| Muscles | `muscles-bp3d.glb` | muscles individuels (têtes et chefs séparés), côtés droit et gauche | idem | CC BY 4.0 |
| Tendons et fascias | `tendons-bp3d.glb` | tendon calcanéen, tractus ilio-tibial, rétinaculum des fléchisseurs, ligne blanche, membranes interosseuses | idem | CC BY 4.0 |
| Artères, veines | `arteres-bp3d.glb`, `veines-bp3d.glb` (réseau principal) ; `arteres-fin-bp3d.glb`, `veines-fin-bp3d.glb` (branches fines, qualités Haute et Ultra) | voir `js/anatomie/donnees-vaisseaux.js` | idem | CC BY 4.0 |
| Organes | `organes-bp3d.glb` | encéphale, cœur, poumons, foie, tube digestif, reins, vessie, œsophage, larynx… | idem | CC BY 4.0 |
| Nerfs | `nerfs-bp3d.glb` | nerfs de l'orbite (modèle BodyParts3D) **et** nerfs périphériques et plexus : tracés reconstitués par Raylé (voir ci-dessous) | BodyParts3D (orbite) ; tracés : Raylé | CC BY 4.0 (orbite) |

Mention exigée : « BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International » (copiée dans l'en-tête de chaque fichier GLB).
**Même point de vigilance que pour les os détaillés** : le README officiel de BodyParts3D annonce CC BY 4.0, mais les en-têtes des fichiers OBJ (2013) citent encore CC BY-SA 2.1 Japon. Si cette dernière devait s'appliquer, **tous** les fichiers `*-bp3d.glb` (et seulement eux) devraient être partagés dans les mêmes conditions ; il suffit alors de les supprimer et de retirer leurs entrées du manifeste (`ui/assets/anatomie/manifest.json`) : l'application retrouve ses formes procédurales et le squelette CC0.
**Modifications faites par Raylé** (`scripts/convertir-corps-bp3d.mjs`, `scripts/lib-bp3d.mjs`, `scripts/compresser-glb.mjs`) : repère BodyParts3D (mm, z vers le haut) → mètres, y vers le haut, face vers +z ; soudure des sommets ; une passe de subdivision de Loop pour les petits maillages ; épiphyse et occlusion ambiante cuites (os) ; fibres (muscles : position le long du grand axe, angle autour) ; **ancres de peau** : chaque sommet d'un tissu mou porte les 4 os les plus proches avec leurs poids (recalage des insertions sur les os affichés) ; regroupement de sommets pour les maillages très denses (cortex, vaisseaux fins) ; compression meshopt (EXT_meshopt_compression, décodeur `three/addons/libs/meshopt_decoder.module.js`, licence MIT) avec les paquets @gltf-transform et meshoptimizer (MIT, outils hors du dépôt).
**Ce que BodyParts3D n'a pas** (et ce que Raylé fait à la place) : pas de muscle grand dorsal, grand droit de l'abdomen, obliques interne, transverse de l'abdomen, masséter, temporal, muscles de la face ni muscles ptérygoïdiens (les muscles schématiques de l'application restent affichés pour les premiers) ; pas de coccyx, de manubrium ni de xiphoïde (os du squelette CC0 conservés) ; pas de moelle spinale ni de thyroïde (formes schématiques conservées) ; **aucun nerf périphérique** : les plexus et les nerfs des membres sont des tracés schématiques (tubes) calculés par `scripts/traces-nerfs.mjs` d'après les descriptions de Gray's Anatomy et posés sur les os, muscles et artères du modèle ; ils sont signalés comme schématiques dans leur fiche.

### Textes : base de connaissances (fiches)
| Contenu | Source | Licence |
|---|---|---|
| Origine, terminaison, innervation, action, trajet des muscles ; trajet des artères, veines et nerfs (reformulés en français, jamais recopiés) | **Gray's Anatomy of the Human Body**, 20e éd. américaine (W. H. Lewis, Lea & Febiger, Philadelphie, 1918), texte consulté sur https://archive.org/details/anatomyofhumanbo00grayrich | domaine public |
| Noms latins des structures | Terminologia Anatomica (Federative Committee on Anatomical Terminology, 1998) | nomenclature |
| Identifiants des structures du modèle | Foundational Model of Anatomy (FMA), via BodyParts3D | CC BY 4.0 |
Chaque fiche porte sa source (`js/anatomie/fiches-*.js`). **Rien n'est inventé** : un champ que les sources retenues ne donnent pas reste vide et Raylé répond « non renseigné dans les sources retenues ».

### Z-Anatomy (non retenu) et ce qu'il apporterait
Z-Anatomy (https://github.com/Z-Anatomy, Models-of-human-anatomy, d'après BodyParts3D et d'autres sources) est publié sous **CC BY-SA 4.0** : tout fichier dérivé devrait rester sous cette licence (partage dans les mêmes conditions) ; il est distribué en Blender (.blend) et FBX, sans glTF, et le téléchargement ne passe pas par un lien direct stable. Il n'a donc **pas** été intégré. Il apporterait ce que BodyParts3D n'a pas : nerfs périphériques et plexus mesurés, muscles de la face et de la mastication, grand dorsal, muscles de l'abdomen. Voir `docs/anatomie-haute-fidelite.md` pour la marche à suivre si vous acceptez cette obligation.

Autres modèles : aucun. Pour en ajouter, voir `ui/assets/anatomie/LISEZMOI.md` et inscrire une ligne dans le tableau ci-dessus. Licences à surveiller : **CC0** et **domaine public** : usage libre ; **CC BY** : citer l'auteur ; **CC BY-SA** : le modèle (et ses dérivés) doit rester sous la même licence (non retenu ici) ; **CC BY-NC** : usage commercial interdit.

Pistes examinées et écartées : « Human Skeleton » de NIH 3D (CC BY 4.0, mais le téléchargement direct est refusé sans passer par le site), le dépôt `lucgrn3/anatomy-models` et Z-Anatomy (CC BY-SA : licence à partage dans les mêmes conditions, incompatible avec la règle « CC0 ou CC BY » retenue), un dépôt GitHub sans licence déclarée. BodyParts3D, écarté lors d'une première passe à cause de sa licence BY-SA 2.1, est retenu depuis que son éditeur le publie sous CC BY 4.0 (voir ci-dessus).

## Modèles 3D du fond Espace (NASA)
| Modèle | Fichier | Source | Licence |
|---|---|---|---|
| Station spatiale internationale (ISS) (B) | `ui/assets/espace/modeles/iss.glb` | NASA 3D Resources, dépôt https://github.com/nasa/NASA-3D-Resources (« International Space Station (ISS) (B) », NASA / Ames Research Center) | domaine public (« free and without copyright », README du dépôt NASA) |
| Rover Perseverance (Mars 2020) | `ui/assets/espace/modeles/perseverance.glb` | NASA 3D Resources, même dépôt (« Mars 2020 Perseverance Rover », NASA / JPL-Caltech) | idem |

**Modifications faites par Raylé** (`scripts/optimiser-glb.mjs`, paquets @gltf-transform et meshoptimizer installés hors du dépôt) : décompression Draco, retrait des animations et des extensions de matériau coûteuses (transmission, vernis, brillance), soudure et simplification des maillages (ISS : 172 200 → 31 600 triangles ; Perseverance : 199 500 → 37 900), textures réduites à 512 px en WebP (Perseverance), compression meshopt (ISS 0,27 Mo, Perseverance 0,87 Mo, contre 0,48 et 4,99 Mo). ISS : 7 pièces égarées (« bendedtru*, pCylinder* », dont la place était donnée par une animation) retirées, modèle réorienté (poutre le long de x, modules le long de z). Ces modèles remplacent les formes procédurales du code quand ils se chargent ; sans eux (hors ligne, fichier absent), les formes procédurales prennent le relais.
**Curiosity** : la NASA ne publie ce modèle qu'au format Blender (`.blend`, 5,8 Mo) ; aucun GLB n'est installé, le rover Curiosity reste la forme procédurale. Hubble (GLB de 150 Ko après optimisation) a été préparé mais n'est pas affiché.

## Autres éléments du fond Espace
Soleil, petites lunes, astéroïdes, nébuleuses, atmosphères de Rayleigh / Mie, trou noir : dessinés par le code (aucun fichier). Positions des astres : formules de Paul Schlyter (domaine public).

## Documents Drive (lecture et édition)
Chargés à la demande depuis cdnjs (jamais copiés dans le dépôt) : **JSZip 3.10.1** (MIT ou GPLv3, Stuart Knightley et contributeurs) pour lire et réécrire les fichiers Word (.docx), et **PDF.js 3.11.174** (Apache 2.0, Mozilla) pour lire le texte des PDF. Connexion et sélecteur : Google Identity Services et Google Picker (scripts fournis par Google, soumis à ses conditions). Aucun secret n'est stocké dans le dépôt : seul l'identifiant client OAuth public se place dans `js/config-drive.js` (voir `docs/drive.md`).

## Cerveau 3D et présentations animées (mission 2)
| Élément | Fichier | Auteur / source | Licence |
|---|---|---|---|
| 44 formes du cerveau (lobes, gyri, noyaux, ventricules, tronc, cervelet, substance blanche…) | `ui/assets/anatomie/cerveau-bp3d.glb` | **The Database Center for Life Science** (BodyParts3D, version 4.0) | **CC BY 4.0** (même point de vigilance sur le partage à l'identique que pour le corps, voir plus haut) |
Textes des fiches du cerveau : rédigés par Raylé, d'après des références classiques citées dans chaque fiche (Terminologia Anatomica, Gray 1918 — domaine public —, Purves et al. *Neuroscience*, Kandel et al. *Principles of Neural Science*, Brodmann 1909, Penfield et Boldrey 1937, Scoville et Milner 1957, Hickok et Poeppel 2007, Papez 1937, Alexander et al. 1986, Schmahmann et Sherman 1998, Sperry 1968) : aucun texte ni figure n'est recopié, ces ouvrages ne sont pas dans le dépôt. Faisceaux, neurones animés et aires de Brodmann : dessinés par le code d'après des coordonnées moyennes de la littérature (schématique). Détail : `docs/anatomie-presentations-cerveau.md`.

## Terre vivante et palier Ultra (mission 3)
| Élément | Fichier | Source | Licence |
|---|---|---|---|
| Terre de jour 8192 × 4096 (palier Ultra) | `ui/assets/terre-jour-8192.jpg` | NASA Earth Observatory, **Blue Marble: Next Generation** (décembre 2004), Reto Stöckli, NASA Goddard Space Flight Center — https://visibleearth.nasa.gov/images/74218 (fichier d'origine 21600 × 10800, réduit à 8192 × 4096 par Raylé, JPEG 2,4 Mo) | domaine public (NASA) |
| Terre de nuit 8192 × 4096 (lumières des villes) | `ui/assets/terre-nuit-8192.jpg` | NASA Earth Observatory, **Black Marble 2016**, Joshua Stevens, données Suomi NPP VIIRS — https://earthobservatory.nasa.gov/images/144898 (fichier d'origine 13500 × 6750, réduit à 8192 × 4096, JPEG 1,2 Mo) | domaine public (NASA) |
| Contours des pays (frontières, centres des pays) | `js/vendor/world-110m.json`, `js/vendor/topojson-client.min.js`, `ui/espace-pays-centres.js` (centres calculés par `scripts/generer-centres-pays.mjs`) | **world-atlas** 110 m (Natural Earth, domaine public ; paquet ISC, voir `js/vendor/world-atlas.LICENSE`), topojson-client (ISC) | domaine public / ISC |
| Noms français des pays | `js/rayle/pays-donnees.js` | i18n-iso-countries 7.11.0 | MIT |
Données du trafic simulé (`ui/espace-terre-donnees.js`) : 70 plates-formes aéroportuaires (positions approchées), liaisons principales **plausibles** et grandes routes maritimes (Suez, Malacca, Panama, cap de Bonne-Espérance, Atlantique, Pacifique) en points de passage placés en mer, 150 villes : listes établies à la main d'après des coordonnées géographiques publiques (faits, pas des œuvres) ; **ce n'est pas le trafic réel d'un jour donné**, et l'écran affiche « simulé ». Le temps réel des vols (OpenSky Network, API ouverte et gratuite en accès anonyme, https://opensky-network.org) n'est utilisé que si le Worker propose la route `/vols` ; l'API refuse les appels directs depuis un site statique (CORS limité à son propre domaine), d'où le passage par le Worker. Aucun service de suivi des bateaux n'est utilisé (les API gratuites exigent une clé). Lumières des villes : l'image NASA ci-dessus (l'intensité suit la densité lumineuse mesurée par le satellite). Actualité d'un pays : les flux ouverts déjà utilisés par le Worker (voir `docs/espace-trafic.md`), cités un par un.

## Univers 3D (globe interactif, système solaire, Mars)
Le rover Perseverance réutilise le modèle NASA déjà listé plus haut ; Curiosity est un modèle procédural dessiné par le code.
| Élément | Source | Conditions | Où |
|---|---|---|---|
| Frontières précises des pays (50 m) | `world-atlas` 2.0.2 (Natural Earth), chargé à la demande depuis cdn.jsdelivr.net ; `js/vendor/world-110m.json` en secours | Natural Earth : domaine public ; world-atlas : ISC | `js/univers/espace/geo-calques.js` |
| Informations sur les pays (capitale, population, superficie, langues) | Wikidata (https://query.wikidata.org), requêtes SPARQL | CC0 | `js/univers/donnees/pays.js` |
| Textes de présentation des pays, mers et océans | Wikipédia en français (API MediaWiki, extraits) | CC BY-SA 4.0 — les extraits sont reformulés et attribués à Wikipédia | `js/univers/donnees/pays.js`, `presentation.js` |
| Actualités sur le globe | flux RSS de franceinfo (titres et liens uniquement), repli GDELT (https://www.gdeltproject.org) | usage des titres et liens | `js/univers/espace/actualites.js` |
| Satellites réels (stations, visibles à l'œil nu) | CelesTrak (GP « stations » et « visual »), propagateur SGP4 de Raylé | données publiques | `js/univers/espace/satellites.js` |
| Éléments orbitaux des planètes, des lunes, de Cérès et de Vesta | NASA/JPL « Approximate Positions of the Planets » et fiches planétaires NASA | domaine public | `js/univers/donnees/planetes.js` |
| Éclipses 2026-2027 (tableau intégré, vérifié par les tests) | NASA Eclipse Web Site (Fred Espenak / Gregory Contreras Hernandez) | usage libre avec mention de la source | `js/univers/espace/eclipses.js` |
| Textures de la Terre, de la Lune, de Saturne, du ciel | déjà listées dans « Images et textures » ci-dessus (NASA Visible Earth, Solar System Scope, NASA/JPL) | voir ci-dessus | `ui/assets/espace/*` |
