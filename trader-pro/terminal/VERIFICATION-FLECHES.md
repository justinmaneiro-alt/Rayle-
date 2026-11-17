# Vérification des flèches Daily (zigzag ATR)

Généré le 2026-11-17 sur tout l'historique Daily disponible (Yahoo Finance, bougies clôturées). Règles : ATR(14), sommet/creux confirmé à 2.5 × ATR par défaut, 5 bougies minimum entre deux flèches, alternance stricte, aucun repaint.

| Actif | Historique | Bougies | ×ATR de départ → retenu | Flèches | Par mois (tout) | Par mois (12 derniers mois) | Même sens d’affilée | Extrême dépassé ensuite | Écart < 5 bougies | Repaint | En formation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Or (futures GC=F, séances) | 2016-11-17 → 2026-11-16 | 2514 | 2,5 (1,19/mois) → **2,5** | 143 | 1,19 | 1,08 | 0 | 2 | 0 | 0 | 0 |
| Nasdaq 100 | 2016-11-17 → 2026-11-13 | 2511 | 2,5 (1,18/mois) → **2,5** | 141 | 1,18 | 1,17 | 0 | 7 | 0 | 0 | 0 |
| Bitcoin | 2016-11-17 → 2026-11-15 | 3651 | 2,5 (1,63/mois) → **2,5** | 196 | 1,63 | 1,33 | 0 | 4 | 0 | 0 | 0 |
| Solana | 2020-04-10 → 2026-11-15 | 2411 | 2,5 (1,53/mois) → **2,5** | 121 | 1,53 | 1,00 | 0 | 1 | 0 | 0 | 0 |
| Dogecoin | 2017-11-09 → 2026-11-15 | 3294 | 2,5 (1,59/mois) → **2,5** | 172 | 1,59 | 1,17 | 0 | 5 | 0 | 0 | 0 |
| S&P 500 | 2016-11-17 → 2026-11-13 | 2511 | 2,5 (1,09/mois) → **2,5** | 131 | 1,09 | 1,17 | 0 | 5 | 0 | 0 | 0 |

Lecture : « Par mois » = flèches confirmées ÷ nombre de mois de l’historique ; cible 1 à 3. « Même sens d’affilée », « Écart < 5 bougies », « Repaint » et « En formation » doivent valoir 0. « Extrême dépassé ensuite » : une flèche confirmée ne bouge jamais ; dans de rares cas (1 à 5 % des flèches) le prix dépasse son extrême avant la flèche suivante (exemple : sommet confirmé, puis nouveau plus haut quelques jours plus tard) ; le sommet suivant est alors posé sur ce nouveau plus haut. Toutes les autres flèches sont exactement sur le plus haut / plus bas du mouvement.

## Contrôles dans le navigateur (Chrome piloté, `trader-pro/tests/terminal-chrome.mjs`)

Passés sur PC (1600 px), tablette (1024 px) et téléphone (412 px) : 99 vérifications chacun, **aucune erreur JavaScript dans la console**.

- MA200 : une seule ligne par graphique, calculée sur les bougies de SON unité (H1 : 8 182 bougies / 7 983 points ; H4 : 2 046 bougies / 1 847 points ; Jour : 342 bougies Kraken, complétées avant la première bougie par le Daily du robot pour tracer la MA200 dès le bord gauche de l’écran). La stratégie de Rayle (MA200 H1 colorée, boîtes, BOS) est coupée : plus aucune autre moyenne n’apparaît.
- Flèches : Jour = bougie extrême ; H4 = bougie H4 du plus haut / plus bas exact de la journée (vérifié flèche par flèche) ; H1 = aucune. Rouge vers le bas au-dessus de la mèche (sommet), verte vers le haut sous la mèche (creux), aucun texte, pleines (100 %) et pâles (40 %).
- Réglages : interrupteur « Flèches Daily » (coupé = plus aucune flèche, remis = les mêmes), multiplicateur ATR par actif (4 au lieu de 2,5 pour l’or = moins de flèches, retour à 2,5 = flèches d’origine), présents dans le panneau « Flèches Daily » et dans le menu « Affichage ».
- Aucun reste de l’ancien système (rebonds H1/H4, flèches MA200, versions v1 à v9, flèches A+, alertes associées).
