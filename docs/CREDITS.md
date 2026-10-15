# Crédits des textures du système solaire

Textures **gratuites et libres de droits**, chargées à la demande. Le même texte est affiché dans ⚙ Réglages → « Crédits des textures ». Le fichier `CREDITS.md` à la racine recense aussi les bibliothèques, les données et les modèles 3D.

## Planètes, Lune, anneaux, ciel — Solar System Scope (CC BY 4.0)
**Mention : « Textures : Solar System Scope (solarsystemscope.com/textures), CC BY 4.0, d'après des données NASA »**.
Les originaux (8k) ont été redimensionnés à 2048 et 1024 px et recompressés en WebP par Raylé (modification signalée, comme l'exige la licence).

| Astre | Fichiers (1k = qualité Basse · 2k = Moyenne et Haute) |
|---|---|
| Lune | `espace/lune-1k.webp` (162 Ko) · `espace/lune-2k.webp` (761 Ko) |
| Mercure | `espace/mercure-1k.webp` (130 Ko) · `espace/mercure-2k.webp` (615 Ko) |
| Vénus (atmosphère) | `espace/venus-1k.webp` (18 Ko) · `espace/venus-2k.webp` (68 Ko) |
| Mars | `espace/mars-1k.webp` (87 Ko) · `espace/mars-2k.webp` (353 Ko) |
| Jupiter | `espace/jupiter-1k.webp` (60 Ko) · `espace/jupiter-2k.webp` (209 Ko) |
| Saturne | `espace/saturne-1k.webp` (15 Ko) · `espace/saturne-2k.webp` (59 Ko) |
| Uranus | `espace/uranus-1k.webp` (3 Ko) · `espace/uranus-2k.webp` (11 Ko) |
| Neptune | `espace/neptune-1k.webp` (7 Ko) · `espace/neptune-2k.webp` (26 Ko) |
| Anneaux de Saturne | `espace/saturne-anneaux.webp` (2 Ko) |
| Ciel étoilé et Voie lactée | `espace/ciel-2k.webp` (31 Ko) · `espace/ciel-4k.webp` (116 Ko) |
| Masque des océans | `espace/terre-ocean-1k.webp` (34 Ko) |

## Terre — NASA (domaine public)
| Fichier | Source |
|---|---|
| `terre-jour-2048/4096/8192.jpg` | NASA Earth Observatory, « Blue Marble: Next Generation » (Reto Stöckli, NASA GSFC) |
| `terre-nuit-2048/4096/8192.jpg` | NASA Earth Observatory, « Earth at Night (Black Marble) 2016 » (Joshua Stevens, Suomi NPP VIIRS) |
| `nuages-2048.jpg` | NASA Visible Earth, « Blue Marble Clouds » |
| `espace/terre-relief-2k.webp` | calculé par Raylé d'après NASA Visible Earth « Topography » (GEBCO 2008) |

## Dessinés par le code (aucun fichier)
**Soleil** (shader d'émission : granulation, taches, assombrissement du bord ; couronne ; halos), atmosphères (Terre, Vénus, Mars, Neptune), ombres de Saturne, lunes secondaires, astéroïdes, nébuleuses.

## Poids et qualité adaptative
Le palier de qualité choisit les fichiers : **Basse = 1k pour les planètes** (appareil modeste, choisi automatiquement), **Moyenne et Haute = 2k**. Au-delà de 2k, seule la Terre a des textures 4096 (Haute) et 8192 (Ultra, jamais automatique) : les autres planètes n'ont pas de version 4k dans le dépôt.

| Ensemble | Poids |
|---|---|
| Planètes + Lune en 1k | 0,47 Mo |
| Planètes + Lune en 2k | 2,05 Mo |
| Terre 2048 (jour + nuit + nuages) | 0,90 Mo |
| Terre 4096 (jour + nuit) + nuages 2048 | 1,73 Mo |
| Anneaux, masque des océans, relief |
| Ciel 2k / 4k |
| **Total appareil modeste** (planètes 1k + Terre 2048 + anneaux, relief, ciel 2k) | **1,68 Mo** |
| **Total Haute** (planètes 2k + Terre 4096 + anneaux, relief, ciel 4k) | **4,18 Mo** |
| Ultra : Terre 8192 en plus (jour + nuit) | +3,59 Mo |

Les textures sont mises en cache par le service worker (cache à part qui survit aux mises à jour) : elles ne sont téléchargées qu'une fois.
