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
