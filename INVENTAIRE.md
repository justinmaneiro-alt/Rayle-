# Inventaire de Rayle avant restructuration (2026-11-11, tag `avant-restructuration-rayle`)

## Mesure de départ (accueil, Chrome, serveur local, `outils-restructuration/mesure-chargement.mjs`)
| Appareil | Fichiers | Octets transférés | Chargement | Fichiers JS |
|---|---|---|---|---|
| PC 1920x1080 | 175 | 2,08 Mo | 632 ms | 140 |
| Tablette | 289 | 1,63 Mo | 277 ms | 117 |
| Téléphone S23 | 289 | 1,64 Mo | 252 ms | 117 |
(la coque mobile est une AUTRE interface que celle du PC : c'est ce que la restructuration supprime.)

## Dépôt suivi par git : 1 300 fichiers, 34 Mo. Hors git : `worker/` (168 Mo), `idees/` (18 Mo), `assets-lourds/` (994 Mo dont voix 853 Mo), captures, caches.
| Zone | Fichiers | Ko | Verdict |
|---|---|---|---|
| core/commun (HUD, accueil Jarvis + Aurore, panneaux) | 69 | 756 | garder Jarvis ; retirer Aurore (g1-*), bureau, pad |
| core/mobile (coque mobile) | 13 | 144 | RETIRER (une seule app identique partout) |
| core/gestes + camera/ | 21+7 | 372+100 | RETIRER (webcam, relais) ; balayage souris/tactile/clavier/voix à la place |
| core/voice, core/intelligence, core/api-keys | 14+10+3 | 5 800 (modèles) | GARDER (IA centrale + voix) |
| core/lppr, core/vr, core/multi, clavier/ | 11+6+6+4 | 168+88+104+100 | RETIRER (hors liste) |
| core/direct | 6 | 88 | à examiner (sources de marché) |
| galaxie/ (scène + hôte 3D) | 137 | 30 480 | RÉDUIRE à un hôte 3D (renderer, ciel étoilé, navigation) : Terre/Anatomie/Neptune en dépendent |
| planetes/terre | 61 | 1 952 | GARDER |
| planetes/saturne (anatomie + vaisseau) | 79 | 1 077 | GARDER l'anatomie ; RETIRER vaisseau, cockpit, vol |
| planetes/neptune (atelier 3D = « Développement 3D ») | 13 | 220 | GARDER |
| planetes/mars, jupiter, mercure, venus, uranus, rayle | 79+6+4 | 874+… | RETIRER |
| terre-v2 (Cesium) | 17 | 109 | RETIRER (Terre classique gardée) |
| terminal/ (ancien terminal 2D) + agent-trading/front | 14+190 | 408+2 871 | GARDER agent-trading/front ; retirer l'ancien terminal 2D et la musique/télé |
| skins/neurone (sphère de neurones) | 14 | 696 | GARDER |
| tests-navigateur | 258 | 27 716 | GARDER ceux des fonctions gardées, retirer le reste |
| app-pc, relais-or, data (anatomie_fr + lppr 23 Mo) | 27+3+7 | 422+14+3 108 | app-pc gardé ; lppr retiré |
| worker/ (hors git) | — | 168 Mo | RÉÉCRIT en phase 3 (copie de sûreté `idees/worker-avant-restructuration`) |

## « BIM »
Le texte « BIM » n'existe nulle part dans le code suivi. Décision : le menu « BIM » = **Neptune, atelier de maquettes 3D (« Développement 3D »)** (`planetes/neptune`). Noté dans PROGRESS.md.

## Thèmes : Jarvis (`core/commun/jarvis*.css`, `hud.css`, `v1-theme.css`) gardé ; Aurore (`g1-*`) retiré ; « ancien système de fenêtres » (legacy/) retiré.
## Dépendances : aucune au runtime (three.js r170 et Lightweight Charts copiés dans le dépôt) ; outil : wrangler (dev), puppeteer-core (tests).
## index.html : 130 scripts classiques dans un ordre fixe + 28 feuilles de style.
