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
| `ui/assets/espace/terre-relief-2k.webp` | calculé par Raylé d'après NASA Visible Earth « Topography » (GEBCO 2008) | domaine public |
| `ui/assets/ville-*.mp4` | Pexels, vidéo n° 13246966 | licence Pexels |
| Soleil, petites lunes, astéroïdes, Voie lactée, nébuleuses, matériaux anatomiques (os, muscles, cartilages, organes), environnement d'éclairage | dessinés par le code (shaders et canvas), aucun fichier | — |

## Modèles 3D du module Anatomie (GLB)
| Structures | Fichier | Auteur | Licence | Source |
|---|---|---|---|---|
| Squelette humain complet : crâne, mandibule, dents, 24 vertèbres, disques, 12 paires de côtes, sternum, clavicules, omoplates, bras, avant-bras, mains, bassin, jambes, rotules, pieds (116 nœuds) | `ui/assets/anatomie/squelette-cc0.glb` | **Armen Barsegyan** (CGI Coffee) | **CC0 1.0** (« No Rights Reserved », domaine public) | https://cgicoffee.com/blog/2017/10/free-human-skeleton-3d-model |

**Modifications faites par Raylé** (permises par la licence CC0, signalées par courtoisie) : le modèle original (`human_skeleton.obj`, 2017, 71 objets, textures PBR) a été converti par `scripts/convertir-squelette.mjs` en un seul GLB de 1,4 Mo : mise à l'échelle (×0,1 → 1,75 m), normales recalculées, textures et UV retirés (Raylé applique ses propres matériaux), séparation des côtes et des clavicules en côté droit / gauche, découpe des mains et des pieds en composantes (carpe, métacarpiens, phalanges ; talus, calcanéus, tarse, métatarsiens, phalanges) et des disques intervertébraux, suppression d'un doublon de L1 (`l02`) et d'une face parasite (`jaw0`). Les os du GLB sont ensuite recalés à l'exécution sur les formes schématiques de l'application (`js/anatomie/ajustement.js`).
Limite du modèle source : les mains et les pieds sont rudimentaires (doigts d'un seul tenant, tarse en trois pièces).

Autres modèles : aucun. Pour en ajouter, voir `ui/assets/anatomie/LISEZMOI.md` et inscrire une ligne dans le tableau ci-dessus. Licences à surveiller : **CC0** et **domaine public** : usage libre ; **CC BY** : citer l'auteur ; **CC BY-SA** : le modèle (et ses dérivés) doit rester sous la même licence (non retenu ici) ; **CC BY-NC** : usage commercial interdit.

Pistes examinées et écartées : « Human Skeleton » de NIH 3D (CC BY 4.0, mais le téléchargement direct est refusé sans passer par le site), le dépôt `lucgrn3/anatomy-models` et BodyParts3D / Z-Anatomy (CC BY-SA : licence à partage dans les mêmes conditions, incompatible avec la règle « CC0 ou CC BY » retenue), un dépôt GitHub sans licence déclarée.

## Modèles 3D du fond Espace (ISS, rovers, GLB optionnels)
Les formes procédurales sont utilisées par défaut. Si vous ajoutez des GLB dans `ui/assets/espace/modeles/` (voir `docs/espace.md`), notez-les ici. Les modèles 3D
publiés par la NASA (ISS, Curiosity, Perseverance) sont en général du domaine public, mais vérifiez la mention sur la page de téléchargement.
