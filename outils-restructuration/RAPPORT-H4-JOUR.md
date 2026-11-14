# Correctif graphiques H4 / Jour (2026-11-14)
**Symptôme** : en H4 et surtout en Jour, un bloc de centaines de lignes horizontales (bleu / rouge / vert) recouvrait le graphique ; en H4, des dizaines de lignes « proposé H4 … » pointillées.

**Causes (mesurées par bascule des couches dans un Chrome piloté)**
1. **MA200 colorée par le régime** (`graphique-or.js`, primitive `primLecture`) et **MA200 de la stratégie Rayle** (`rayle-dessin.js`) : la série de la MA est calculée en H1 (jusqu'à 1 500 points) ; en H4 / Jour, des milliers de points H1 étaient projetés sur quelques bougies, d'où des allers-retours qui formaient un bloc. Couche `rayMa` désactivée → le bloc disparaît.
2. **Niveaux « proposés »** : tous étaient dessinés, sans filtre de distance ni de fusion.

**Correction** (module pur `agent-trading/front/or/proposes-filtre.js`, 27 vérifications dans `agent-trading/tests/proposes-filtre-test.mjs`)
- `reduireMA(pts, bougies)` : UN point par bougie affichée (dernière valeur connue) → la MA200 est une seule ligne, quelle que soit l'unité.
- `filtrerProposes` : seulement les niveaux à ± 8 ATR du prix, fusion à moins de 0,5 ATR, 6 au plus (les plus proches) ; `etiquettesLibres` : une étiquette est omise si elle chevaucherait la précédente.
- Aucune règle de flèche, aucun sceau, aucune archive touchés.

**Captures** : `captures-h4/avant-H4.png`, `avant-Jour.png`, `apres-H4.png`, `apres-Jour.png` (Chrome piloté, 1600×1024, vraies données Kraken).
**Non couvert** : les zones « lisibles » R1…S3 et les boîtes de position étaient déjà bornées (3 dernières) ; non modifiées.
