# Module terminal de trading

Rangé ici, **non chargé** par `index.html`. Le code est intact ; seuls les chemins ont été mis à jour.

## Contenu
```
terminal.html          page de test autonome (via un serveur local à la racine du dépôt, puis /modules/terminal-trading/terminal.html)
vue-terminal.fragment.html   le bloc HTML du terminal (l'ancien <div id="vueTerminal"> d'index.html)
js/                    terminal.js (écran + pages), hud.js, graphique-rayle.js, page-marches / cot / analyse / monde
js/rayle/              colle avec Rayle : pont-terminal.js, commandes-terminal.js, commandes-monde.js, pays-donnees.js
css/                   terminal.css, terminal-pro.css, monde.css
vendor/                Lightweight Charts, topojson, world-110m
relais-pc/             relais Windows (installer.cmd / desinstaller.cmd) : contrôle du PC par le Worker
```
Dépend de `../commun/` (bus.js, vues.js, css/rayle.css, css/hud.css) et du Worker Cloudflare (adresse + code d'accès saisis dans l'écran du terminal).

## Réactiver dans index.html
1. Coller le contenu de `vue-terminal.fragment.html` dans `<body>` (avant les scripts).
2. Dans `<head>` : `modules/commun/css/rayle.css`, `modules/commun/css/hud.css`, puis `modules/terminal-trading/css/terminal.css`, `terminal-pro.css`, `monde.css`.
3. Scripts classiques : `bus.js` et `pays-donnees.js` sont déjà fournis par `js/univers/support/` (n'en charger qu'un exemplaire), puis `modules/commun/vues.js`.
4. Un bouton qui appelle `RayleBus.emit('vue:demande', { vue: 'terminal' })`, ou l'adresse `index.html#terminal`. Retour : `RayleBus.emit('vue:demande', {})`.
5. Commandes vocales (si Rayle revient) : `js/rayle/pont-terminal.js`, `commandes-terminal.js`, `commandes-monde.js`, à charger après le cœur de Rayle (ancienne version : tag `backup-avant-reset`, dossier `js/rayle/`).

## Relais PC
Le dossier a changé de place : si le relais était installé, relancer `relais-pc/installer.cmd` pour que le démarrage automatique de Windows pointe vers `modules/terminal-trading/relais-pc/`. Son `config.json` (jeton) est resté dans le dossier, non versionné.
