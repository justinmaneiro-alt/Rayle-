# Rayle

Au lancement, **Rayle ouvre directement l'univers** (un seul thème, « système solaire »), plein écran, sans bouton ni texte d'interface. Rayle (voix, écoute, entité neurone) vit dans `rayle/` : un toucher n'importe où au premier lancement débloque le micro et le son, puis elle écoute en continu (« Rayle, va sur Mars », « retour au système solaire », « zoome », « ouvre le menu »…). Seule interface : une poignée presque invisible sur le bord gauche qui ouvre le petit menu des planètes. Glisser = tourner, pincer ou molette = zoomer.

Page unique : `index.html`. JavaScript natif, aucun outil de build. Adresse GitHub Pages inchangée.

## Organisation

```
index.html            seul point d'entrée
js/demarrage.js       ouvre l'univers (système solaire), expose window.RayleMonde, enregistre le service worker
rayle/noyau/          cerveau de Rayle d'origine (voix, reconnaissance, personnalité, mémoire, commandes) — code repris tel quel
rayle/commun/         bus, entité (sphère de particules), panneaux ; rayle/ui/ : entité Neurones et thème
rayle/univers-voix.js commandes vocales de l'univers (planètes, vue d'ensemble, zoom, menu) ; rayle/menu-planetes.js : le petit menu
rayle/demarrage-rayle.js, entree.js   premier toucher, écoute continue ; rayle/noyau/modules-absents.js : neutralise les modules rangés
js/univers/           la scène 3D : noyau, thème « espace », planètes (un module chacune), données
js/univers/support/   petites bibliothèques utilisées par la scène (astro, SGP4, pays, villes, bus)
js/vendor/            MapLibre (Terre en carte), contours des pays (topojson, world-atlas)
css/base.css          écran noir plein cadre + interface de l'univers masquée
css/univers.css       styles de la scène (HUD conservé dans le code, masqué par base.css)
assets/               textures et modèles (planètes, Terre, ciel, ISS, rover)
manifest.webmanifest  PWA plein écran       sw.js  service worker (réseau d'abord)
modules/              modules rangés, NON chargés au lancement (voir ci-dessous)
```

## Modules rangés (non affichés, non liés)

| Dossier | Contenu | Réactivation |
|---|---|---|
| `modules/terminal-trading/` | terminal de trading (pages Terminal, Marchés, COT, Analyse, Monde), relais PC | `modules/terminal-trading/README.md` |
| `modules/anatomie/` | Anatomie & Orthopédie 3D, Cerveau, modèles GLB, scripts de conversion | `modules/anatomie/README.md` |
| `modules/commun/` | bus d'événements, gestionnaire de vues, styles de base partagés par les deux modules | idem |

Chaque module a une page de test (`terminal.html`, `anatomie.html`) qu'on ouvre à la main (serveur local) ; elles ne sont liées à rien.

## Ancienne version

Tout l'ancien Rayle (voix, entité, Drive, thèmes Jarvis/Globe, tests, docs…) est conservé :
`git checkout backup-avant-reset` (branche et tag du même nom), ou `git checkout -b restauration backup-avant-reset`.
Le Worker Cloudflare (`worker/`) n'est pas versionné ici et n'a pas été touché.

Crédits des données, textures et modèles : `CREDITS.md`.
