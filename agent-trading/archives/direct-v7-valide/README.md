# Direct (v7 validée) : sauvegarde figée (2026-11-13)
Commit 2263ba8 (fusion de fleches-affinage). Étiquette Git `direct-v7-valide`, branche `sauvegarde-direct-v7`.
Contenu : copies de `fleches-simples-v7.js`, `fleches-simples-v6.js`, `zones-direct.js`, `signal-niveaux.js`, `fleches-terminal-ui.js` (sélecteur), + `liste-reference.json` (flèches produites sur la série Kraken) et `SHA256SUMS.txt`.
NE JAMAIS MODIFIER ces fichiers. Test : `node agent-trading/tests/direct-v7-valide-test.mjs` (échoue si la v7 change).
Restaurer : `git checkout direct-v7-valide`, ou choisir « Direct (v7 validée) » dans le sélecteur « Flèches » du terminal.
