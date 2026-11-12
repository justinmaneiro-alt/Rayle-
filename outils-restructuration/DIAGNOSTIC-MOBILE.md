# Diagnostic : le téléphone montre l'ancienne interface mobile (2026-11-12)

**Cause racine : le téléphone ouvre le site publié (GitHub Pages = branche `main`), et `main` n'a pas la restructuration.**
`main` contient encore `core/mobile/` (13 fichiers de l'ancienne coque V8 : en-tête RAYLÉ + EN LIGNE, « À la une », menu Accueil/Marchés/Parler/Actus/Plus) et un service worker `2026.11.03.3`. La branche `restructuration-rayle` a supprimé cette coque (515 fichiers modifiés par rapport à `main`) mais n'est pas fusionnée ni publiée. Aucune correction du code ne change donc l'affichage du téléphone tant que la branche n'est pas dans `main`.

## (a) Service worker et cache
- Ancien SW : réseau d'abord pour les fichiers du site, mais l'ancienne page a ses propres copies de données (« Copie ancienne (il y a 4 j) : Pas de réseau pour le moment » vient de `core/mobile/mobile-donnees.js`, absent de la branche).
- Corrigé : version `2026.11.12.1` (sw.js = index.html, vérifié par `build.mjs`), `skipWaiting()` à l'installation, `clients.claim()` + suppression de TOUS les caches autres que le courant à l'activation (l'ancien code ne supprimait que les `rayle-shell-*`), rechargement automatique au changement de version (message « Nouvelle version installée, rechargement… »), pas de rechargement à la toute première installation.
## (b) Manifest et icônes
- Anciennes icônes : neurone cyan/rose. Remplacées par le même neurone en or (`outils-restructuration/icones-or.mjs`), `favicon.svg` en or, `theme_color` et `background_color` = `#080503`.
## (c) Mise en page mobile séparée
- Sur la branche : plus de `core/mobile/`, plus de `rayle_m_*`, aucune media query qui remplace Jarvis. Une seule interface (carrousel de 5 fenêtres) pour toutes les tailles ; `appareil.js` ne choisit plus que le responsive (`galaxieAutorisee = true`). Reste légitime : `appareil.css` (cibles tactiles de 44 px) et `panneaux-mobiles.js` (fenêtres déplaçables au doigt).
- Ajouté : à ≤ 820 px, le terminal replie ses barres d'outils derrière un bouton « Outils » (`agent-trading/front/or/mobile-outils.js`) : le graphique avec flèches, zones et RSI occupe l'écran.
## (d) Source des données
- `config.js` : page servie par le PC (adresse 192.168.x.x, 10.x, 172.16-31.x, `.local`) → backend à la MÊME adresse (aucun CORS, aucun jeton) ; page publique → Worker Cloudflare avec jeton. `localhost` n'existe pas depuis un téléphone : jamais utilisé.
- Le serveur du PC n'écoutait que 127.0.0.1 : le téléphone ne pouvait pas l'atteindre. Ajouté : `node serveur.mjs --reseau` (ou `Rayle-reseau.cmd`) écoute le réseau local, refuse tout client hors réseau privé, ne sert plus `backups/` ni `captures*`, répond sur `/__reseau`, CORS pour les origines privées seulement. Page `connecter-telephone.html` : adresse du PC + QR code.
- Si rien ne répond : bandeau « Serveur injoignable » (adresse essayée, raison, Réessayer) au lieu d'une copie ancienne (`core/commun/liaison-serveur.js`, téléphone et tablette seulement).
- Limite connue : une page HTTPS (GitHub Pages) ne peut pas appeler un PC en HTTP (contenu mixte) ; pour le téléphone il faut ouvrir l'adresse du PC en HTTP, ou publier le Worker.
