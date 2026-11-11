# DCA + supports contre DCA simple — backtest

Règle `dca-v1` scellée (SHA-256 `da181d3fde929772b95cfd0ca58108ae3a769759e15a98d93d24710024a825af`). Montant mensuel 100 €/$. Historique Yahoo Finance, clôtures sans dividendes (tous les chiffres sont des rendements de PRIX, sous-estimés). Départ le 1er janvier 2000 (ou plus tard si la série est plus courte). **Aucune retouche de la règle après le résultat.**

| actif | période | DCA simple : investi → valeur (rend. annualisé) | DCA + supports : investi → valeur (rend.) | tranches | DCA simple de même total : valeur (rend.) | supports − même total | fenêtres de 10 ans où « supports » bat « même total » |
|---|---|---|---|---|---|---|---|
| S&P 500 (indice) | 2000-01-03 → 2026-11-11 | 32300 → 144214 (9,7 %) | 35600 → 161378 (9,7 %) | 33 | 158948 (9,7 %) | 2430 | 28 / 33 |
| CAC 40 (indice) | 2000-01-03 → 2026-11-11 | 32300 → 57090 (4,0 %) | 36500 → 65146 (4,0 %) | 42 | 64514 (4,0 %) | 633 | 33 / 33 |
| Euro Stoxx 50 (indice) | 2007-03-30 → 2026-11-11 | 23700 → 44809 (6,1 %) | 26600 → 50898 (6,1 %) | 29 | 50292 (6,1 %) | 606 | 33 / 33 |
| TotalEnergies | 2000-01-03 → 2026-11-11 | 32300 → 57803 (4,1 %) | 36200 → 65290 (4,1 %) | 39 | 64783 (4,1 %) | 507 | 33 / 33 |
| Dassault Systèmes | 2000-01-03 → 2026-11-11 | 32300 → 115182 (8,4 %) | 36800 → 130749 (8,4 %) | 45 | 131229 (8,4 %) | -480 | 17 / 33 |

## Lecture

Le test équitable est la dernière colonne et l'avant-dernière : investir la même somme totale, mais en achats réguliers plutôt qu'en tranches aux supports. Les séries (indices et deux actions) sont peu nombreuses et très corrélées : aucun test statistique ne peut conclure ; **la règle reste non prouvée**. Les tranches supplémentaires font surtout investir plus quand le marché baisse (donc plus d'argent engagé dans les creux), ce qui améliore ou dégrade le résultat selon que le creux a rebondi.
