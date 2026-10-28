# Jupiter : le vaisseau de code (structure vide)

**État : rien n'est construit.** Ce dossier est la structure prête à recevoir, plus tard, le thème, le vaisseau et les agents (V3, phase 5 ; voir `VISION.md` : « Jupiter : vaisseau d'Albator, base des agents de code, au service de toutes les planètes »).

| Fichier | Rôle |
|---|---|
| `manifeste.json` | Identité de la planète, orbite, satellite « Arcadia » (vaisseau du capitaine), modules (`pc`, `tablette`, `telephone`), agent `jupiter-interprete`, ordres `coder` et `montrer_resultat`. Validé par `galaxie/validateur.js`. |
| `pc/index.js` | Point d'entrée PC (`entrer(G)` / `sortir()`). Aujourd'hui : une fenêtre honnête « Jupiter n'est pas encore construit ». |
| `pc/ordres-jupiter.js` | Branche les ordres du manifeste sur le bus ; ils répondent « pas encore construit » (jamais de faux code). |
| `terminal-2d/index.js` | Même entrée pour tablette et téléphone (le futur terminal 2D). |
| `tests/jupiter-test.mjs` | Vérifie que le manifeste pointe vers des fichiers qui existent, que les ordres sont honnêtes et que l'entrée / la sortie ne laissent rien derrière elles. |

## Pour construire Jupiter (plus tard, une planète à la fois, avec l'accord de Justin)
1. Remplacer `entrer` par la vraie scène (modèle : `planetes/neptune/pc/index.js` : fondu, `G.surcharger`, `G.nav.deleguer`, Échap = `galaxie:sortie`).
2. Écrire le vaisseau en 3D (procédural et original : pas de copie d'un vaisseau ou d'un logo existant ; voir les règles de `docs/saturne-vaisseau.md`).
3. Créer les agents de code côté Worker (`/planete/jupiter/interprete`, déclaré dans le manifeste ; économie d'agents : Raylé seul pour le code tant que c'est possible).
4. Remplacer les deux ordres de `ordres-jupiter.js` par de vrais ordres, avec de vrais tests.
5. Mettre à jour `CLAUDE.md` et ce fichier.
