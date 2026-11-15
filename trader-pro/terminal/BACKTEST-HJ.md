# Backtest des signaux H4 / Jour (généré le 2026-11-15)

Méthode : walk-forward, 3 jeux de paramètres, entrée à l'ouverture suivante, stop prioritaire, coûts inclus. Règles de `trader-pro/terminal/signaux-hj.js`, fixées avant le calcul. Résultats en R (1 R = le risque pris sur le trade), coûts inclus. **Un backtest n’est pas une garantie.**

## Or (futures COMEX GC=F, Yahoo)
Futures continus non ajustés : les changements de contrat créent de petits sauts. H4 : seulement ~2 ans (limite de Yahoo). Coût supposé : 0.5 $ par trade. Jour : 2016-11-15 → 2026-11-13 (2515 bougies) ; H4 : 2024-06-25 → 2026-11-13 (3590 bougies).

| Unité | Signaux / mois | Hors échantillon : trades | Réussite | R moyen | Facteur de profit | Drawdown (R) | Période hors échantillon | Verdict |
|---|---|---|---|---|---|---|---|---|
| J | 1,2 | 119 | 38 % | 0,162 | 1,27 | -25,9 | 7 an(s) | **positif** : Résultat hors échantillon positif (R moyen 0.162, facteur de profit 1.27) : encourageant, à confirmer en direct. |
| H4 | 4,2 | 64 | 44 % | 0,256 | 1,45 | -10,6 | 1,4 an(s) | **fragile** : Résultat hors échantillon positif (R moyen 0.256, facteur de profit 1.45) MAIS sur une période courte (1.4 an) : cela peut refléter un simple marché porteur, pas un avantage durable. À confirmer. |

## Nasdaq 100 (^NDX, Yahoo)
Indice au comptant : séance américaine seulement (le CFD de XTB cote presque 24 h). H4 : ~2 ans. Coût supposé : 2 points par trade. Jour : 2016-11-14 → 2026-11-13 (2514 bougies) ; H4 : 2023-12-18 → 2026-11-13 (1944 bougies).

| Unité | Signaux / mois | Hors échantillon : trades | Réussite | R moyen | Facteur de profit | Drawdown (R) | Période hors échantillon | Verdict |
|---|---|---|---|---|---|---|---|---|
| J | 1 | 100 | 43 % | 0,296 | 1,55 | -15,2 | 7 an(s) | **positif** : Résultat hors échantillon positif (R moyen 0.296, facteur de profit 1.55) : encourageant, à confirmer en direct. |
| H4 | 1,9 | 47 | 21 % | -0,488 | 0,37 | -23 | 1,9 an(s) | **negatif** : NON RENTABLE hors échantillon (R moyen -0.488, facteur de profit 0.37) : ces règles n'ont pas d'avantage démontré sur cet actif et cette unité de temps. |

## Bitcoin (BTC/USDT, Binance)
Données Binance depuis août 2017 ; Bitcoin cote 24 h sur 24. Coût supposé : 20 $ par trade. Jour : 2017-08-20 → 2026-11-15 (3375 bougies) ; H4 : 2017-08-20 → 2026-11-15 (20234 bougies).

| Unité | Signaux / mois | Hors échantillon : trades | Réussite | R moyen | Facteur de profit | Drawdown (R) | Période hors échantillon | Verdict |
|---|---|---|---|---|---|---|---|---|
| J | 1,7 | 155 | 27 % | -0,17 | 0,76 | -43,5 | 6 an(s) | **negatif** : NON RENTABLE hors échantillon (R moyen -0.17, facteur de profit 0.76) : ces règles n'ont pas d'avantage démontré sur cet actif et cette unité de temps. |
| H4 | 6,2 | 641 | 29 % | -0,18 | 0,75 | -118,7 | 8 an(s) | **negatif** : NON RENTABLE hors échantillon (R moyen -0.18, facteur de profit 0.75) : ces règles n'ont pas d'avantage démontré sur cet actif et cette unité de temps. |

## Lecture honnête
- « Hors échantillon » = trades pris sur des périodes jamais vues au moment de choisir le jeu de paramètres (walk-forward).
- Un résultat positif sur peu d’années dans un marché haussier (l’or depuis 2024) ne prouve pas un avantage durable.
- Les futures (or, Nasdaq) ne sont pas les CFD de XTB : spread, swap et gaps de week-end diffèrent.
- Premier essai (délai H4 de 6 bougies, 6,3 signaux par mois sur l’or) : or H4 hors échantillon R moyen +0,125 sur 95 trades ; Nasdaq H4 −0,278 ; Bitcoin H4 −0,161 ; les résultats Jour étaient identiques. Le délai a été porté à 12 bougies pour respecter « quelques signaux par mois » (choix sur le nombre de signaux, pas sur le résultat).
