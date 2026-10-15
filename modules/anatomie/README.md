# Module Anatomie & Orthopédie 3D

Rangé ici, **non chargé** par `index.html`. Le code est intact ; seuls les chemins ont été mis à jour.

## Contenu
```
anatomie.html          page de test autonome (via un serveur local : /modules/anatomie/anatomie.html)
vue-anatomie.fragment.html   les deux conteneurs (#vueAnatomie, #vueCerveau)
js/                    moteur, fenêtres Anatomie et Cerveau, fiches, données, cours, présentations (index.js = point d'entrée dynamique)
js/rayle/commandes-anatomie.js   colle avec Rayle (commandes vocales)
css/anatomie.css
assets/                modèles GLB (BodyParts3D CC BY 4.0, squelette CC0) + manifest.json
scripts/               conversion des modèles (Node, hors site)
docs/                  notes de conception
```
Dépend de `../commun/` (bus.js, vues.js, css/rayle.css, css/hud.css) et de three.js (CDN, import map). Licences des modèles : `../../CREDITS.md`.

## Réactiver dans index.html
1. Coller le contenu de `vue-anatomie.fragment.html` dans `<body>`.
2. `<head>` : `modules/commun/css/rayle.css`, `modules/commun/css/hud.css`, `modules/anatomie/css/anatomie.css` (l'import map de three.js est déjà dans index.html).
3. Scripts classiques : un seul `bus.js` (celui de `js/univers/support/` suffit), puis `modules/commun/vues.js`.
4. Un bouton qui appelle `RayleBus.emit('vue:demande', { vue: 'anatomie' })` (ou `'cerveau'`), ou l'adresse `index.html#anatomie`. Retour : `RayleBus.emit('vue:demande', {})`.
5. Commandes vocales : `js/rayle/commandes-anatomie.js`, à charger après le cœur de Rayle (ancienne version : tag `backup-avant-reset`).
