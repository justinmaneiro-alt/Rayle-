# Ambiance de Raylé : mode d'emploi et branchement des futurs fonds

## Ce que fait le « cerveau d'ambiance »
- **Auto** : Raylé calcule le soleil, la lune et le moment (aube, jour, crépuscule, nuit) toute seule, et lit la vraie météo (Open-Meteo, gratuit, sans clé) à ta position. Cache de 15 minutes ; si le réseau tombe, elle garde la dernière météo connue (sinon : ciel clair).
- **Manuel** : tu forces une ambiance (pluie, orage, neige, brouillard, nuit, détente…), avec une durée facultative, puis elle revient en auto.
- **Off** : plus aucun effet.
- Le **thème de couleurs** peut suivre l'ambiance (Réglages → Ambiance, modifiable). Ton choix manuel de thème reste prioritaire pendant 1 à 24 h (3 h par défaut).
- Lieu de la météo : la plus récente entre la dernière position autorisée (carte, bouton « Ma position ») et le lieu saisi dans les Réglages ; sinon Castres.

## Commandes vocales (sans IA)
`ambiance pluie` · `ambiance orage` · `ambiance neige` · `ambiance brouillard` · `ambiance nuit` · `ambiance détente` · `ambiance concentration` · `il neige` · `il pleut` · `fais pleuvoir` · `passe en mode nuit` · `plus de vent` · `moins de vent` · `pas de vent` · `plus de pluie` · `ambiance auto` · `adapte l'ambiance à la météo` · `coupe l'ambiance`
Ajoute `pendant 10 minutes`, `pendant une heure`… pour un retour automatique après.
L'IA dispose aussi d'un outil « regler_ambiance » (ambiance, vent, thème, fond, entité) pour les phrases tournées autrement.

## Brancher un nouveau fond, une entité ou un skin
```js
RayleBus.on('ambiance', e => { /* e.moment, e.meteo, e.intensite, e.vent, e.soleil, e.lune, e.source */ });
const L = RayleUI.ambiance.lisse();      // à lire à chaque image : jour, chaud, pluie, neige, brouillard, orage, nuages, vent, ventDir (0..1)
RayleUI.ambiance.vent();                 // vent lissé 0..1
RayleUI.ambiance.forcer({meteo:'pluie', intensite:.7}, {dureeMs:600000});
```
Les valeurs « lisses » changent en plusieurs secondes : jamais de saut. Respecter les paliers (`RayleUI.reglages().palier` : 0 complet, 1 allégé, 2 éco = image fixe).

## Cadrer l'objet principal d'un fond 3D (toujours entier)
```js
taille(){
  const c = RayleUI.cadrage.cadrer({cam:{fov:35, dist:3.4}, rayonBase:1.09, echelleMax:.8, canvasW:W, canvasH:H});
  cible = {x:c.x, y:c.y, scale:c.scale};          // puis glisser vers la cible à chaque image (voir fond-globe.js)
}
```
`ui/background.js` rappelle `scene.taille()` à chaque resize, rotation, zoom, ouverture de panneau (`RayleUI.cadrage.ecouter`).
Pour le mode Éco : une image fixe = fond d'étoiles + objet pré-rendu sur fond transparent, posé par le même cadrage (voir `placerPlanete` dans `ui/background.js`).

## Fichiers
`ui/astro.js` (soleil, lune, moment) · `ui/cadrage.js` · `ui/ambiance.js` (moteur, commandes, météo) · `ui/ambiance-fx.js` (voile, pluie, neige, brouillard, éclairs) · `ui/ambiance-reglages.js` (section des Réglages)
Tests : `tests/cadrage-test.mjs`, `tests/ambiance-test.mjs`, `tests/ambiance-worker-test.mjs`.
