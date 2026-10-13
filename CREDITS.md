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

## Modèles 3D du module Anatomie (GLB, optionnels)
**Aucun modèle GLB n'est livré avec Raylé** : le module fonctionne avec ses formes procédurales. Un téléchargement automatique n'a pas été fait : les modèles
anatomiques réellement libres sont rares, leur repère et leur échelle varient, et la licence de chacun doit être lue sur la page du fichier avant de l'embarquer.

Quand vous ajoutez un modèle (voir `ui/assets/anatomie/LISEZMOI.md`), **ajoutez une ligne ici** et renseignez les champs `licence`, `source` et `auteur`
de son entrée dans `ui/assets/anatomie/manifest.json`.

| Structure (clé du manifeste) | Fichier | Auteur | Licence | Source |
|---|---|---|---|---|
| — (aucun pour l'instant) | | | | |

Licences à surveiller : **CC0** et **domaine public** : usage libre ; **CC BY** : citer l'auteur ici ; **CC BY-SA** : le modèle (et ses dérivés) doit rester sous la même licence ; **CC BY-NC** : usage commercial interdit.

## Modèles 3D du fond Espace (ISS, rovers, GLB optionnels)
Les formes procédurales sont utilisées par défaut. Si vous ajoutez des GLB dans `ui/assets/espace/modeles/` (voir `docs/espace.md`), notez-les ici. Les modèles 3D
publiés par la NASA (ISS, Curiosity, Perseverance) sont en général du domaine public, mais vérifiez la mention sur la page de téléchargement.
