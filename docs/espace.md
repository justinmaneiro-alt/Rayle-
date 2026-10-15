# Espace : ce qui reste après l'ancien fond

L'ancien fond « Espace » (ceinture d'astéroïdes, comètes, planètes et Terre dessinées par `ui/fond-espace.js`, avec la « Terre vivante » : avions et bateaux simulés, points, trajets) est **supprimé**. Le fond animé « Univers » est désormais **la scène 3D du bouton Univers**, affichée derrière l'accueil et pilotée par Raylé : voir `docs/univers.md` (section « Fond de l'accueil »).

## Ce qui reste dans `ui/`
- `ui/astro.js` : positions du Soleil, de la Lune et des planètes (éléments orbitaux), phase de la Lune, éclipses.
- `ui/espace.js` : `RayleUI.espace` — astres, faits du jour (chiffres calculés), reconnaissance d'un astre / d'un rover / d'un lieu (`cibleDe`), position de l'ISS (TLE CelesTrak + SGP4 de `ui/sgp4.js`, repli wheretheiss.at, orbite simulée), `etat()` (la scène de l'Univers vue par l'IA), `executer()` (outil « ambiance » : « emmène-moi voir Saturne »).
- `ui/espace-savoir.js` : 35 fiches sourcées (NASA/ESA), réponses aux questions sans IA ; `ui/espace-iss.js` : modèle articulé de l'ISS ; `ui/espace-temps.js`, `ui/espace-terre*.js`, `ui/espace-lieux.js`, `ui/espace-pays-centres.js` : données de lieux et de villes (utilisées par l'Univers et la localisation).
- `ui/fond-globe.js` : la Terre de la page Monde du terminal (mode interactif) ; `ui/background.js` : chef d'orchestre des fonds (Univers = scène du noyau, Jarvis = son canvas, Éco = images fixes).

## Retiré avec l'ancien fond
Interrupteurs « planètes / astéroïdes / satellites / aurores… » et sélecteur d'échelle de Réglages → Espace · « garde cette vue par défaut » · la Terre vivante (points, trajets, frontières, trafic aérien et maritime simulé, rotation « à la main ») · le zoom par « zoome dessus » propre à l'ancien fond (le zoom de l'Univers reste : « zoome », « dézoome »). L'échelle réelle / didactique du système solaire existe toujours dans l'Univers (« montre l'échelle réelle »).
