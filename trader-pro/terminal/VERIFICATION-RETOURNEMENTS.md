# Retournements Daily : backtest walk-forward

Généré par `node trader-pro/outils/backtest-retournements.mjs <dossier>` (données : `telecharger-retournements.mjs`, Yahoo Finance). L'algorithme avance bougie H4 par bougie H4 et ne voit jamais le futur (test : `trader-pro/tests/retournements-test.mjs`, section « walk-forward »). Chaque signal est joué sur les bougies H4 suivantes : entrée à la clôture de la bougie de confirmation, stop 0,2 ATR au-delà de la mèche du touch, objectif = bord proche de la zone opposée (3 R s'il n'y en a aucune), sortie au premier touché (stop avant objectif si les deux sont dans la même bougie ; ouverture au-delà du stop = sortie à l'ouverture) ou au bout de 240 bougies H4. Résultats en multiples de R, **sans frais ni glissement**.

Volume : **or = futures COMEX GC=F** (volume Daily réel ; l'or au comptant n'en a pas), Nasdaq 100 = volume de l'indice ^NDX. Dans le terminal, le robot publie le volume Daily des futures GC (`vj`) ; le perpétuel Kraken n'a qu'un volume en contrats, sans rapport.

## Or (futures COMEX GC) : 3613 bougies H4, du 2024-06-27 au 2026-11-17 (2,4 an)

| Version | Signaux | Par an | % gagnants | R moyen des gagnants | R moyen des perdants | Espérance par trade (R) | Pire série de pertes | Résultat total (R) |
|---|---|---|---|---|---|---|---|---|
| Complète | 4 | 1,7 | 100,0 % | 3,00 | 0,00 | 3,00 | 0 | 12,00 |
| Sans filtre volume | 9 | 3,8 | 44,4 % | 3,00 | -1,00 | 0,78 | 2 | 7,00 |
| Sens de la MA200 seulement | 4 | 1,7 | 100,0 % | 3,00 | 0,00 | 3,00 | 0 | 12,00 |

## Nasdaq 100 : 1952 bougies H4, du 2023-12-20 au 2026-11-17 (2,9 an)

| Version | Signaux | Par an | % gagnants | R moyen des gagnants | R moyen des perdants | Espérance par trade (R) | Pire série de pertes | Résultat total (R) |
|---|---|---|---|---|---|---|---|---|
| Complète | 3 | 1,0 | 0,0 % | 0,00 | -1,10 | -1,10 | 3 | -3,30 |
| Sans filtre volume | 10 | 3,4 | 40,0 % | 2,93 | -1,01 | 0,57 | 2 | 5,68 |
| Sens de la MA200 seulement | 2 | 0,7 | 0,0 % | 0,00 | -1,00 | -1,00 | 2 | -2,00 |

## Total Or + Nasdaq 100

| Version | Signaux | Résultat total (R) | Espérance par trade (R) |
|---|---|---|---|
| Complète | 7 | 8,70 | 1,24 |
| Sans filtre volume | 19 | 12,68 | 0,67 |
| Sens de la MA200 seulement | 6 | 10,00 | 1,67 |

## Réglage par défaut

Règle : la version la plus rentable (résultat total en R, Or + Nasdaq 100). Gagnante : **Sans filtre volume** (12,68 R sur 19 signaux). Elle est le réglage par défaut du terminal (`VERSION_DEFAUT` dans `retournements-daily.js`) ; les deux autres restent choisissables dans les réglages.

## À lire avant de s'y fier

- **Échantillon minuscule** : Or (futures COMEX GC) : 4 à 9 signaux, Nasdaq 100 : 3 à 10 signaux sur 2,4 à 2,9 an(s) d'historique H4 (Yahoo ne fournit pas plus). Quelques trades de plus ou de moins changent le classement : la différence entre les versions n'est PAS statistiquement significative. La version « sans filtre volume » gagne parce qu'elle prend plus de trades, pas parce que ses trades sont meilleurs (son espérance par trade est plus faible que celle de la version complète).
- **L'or est surtout porté par 4 signaux haussiers 3 R** pris pendant la forte hausse de 2024-2026, sans zone de résistance au-dessus (objectif fixé à 3 R par convention) : à ne pas extrapoler.
- Le Nasdaq 100 n'est rentable qu'en « sans filtre volume », et la version « complète » y perd sur ses 3 signaux.
- Le filtre volume élimine environ 80 % des touchers ; la règle des 2 R élimine à elle seule la plupart des setups confirmés. Résultat voulu (peu de flèches) mais qui rend toute statistique fragile.
- Pas de frais, de spread ni de glissement ; les signaux « en cours » à la fin des données sont exclus des statistiques.

Sources de données et choix faits seul : R1 / R2 / S1 / S2 = les niveaux clés du terminal (`niveauxCles`, 2 de chaque côté) ; pivots Daily = 5 bougies de chaque côté ; dernier sommet (creux) H4 = pivot à 2 bougies de chaque côté, au-dessus (au-dessous) du dernier cours, parmi les 40 dernières bougies H4 ; zones mobiles (R/S, MA200) : une flèche par nom et par semaine ; aucune zone opposée : objectif 3 R.
