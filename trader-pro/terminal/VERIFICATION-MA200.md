# MA200 Daily + H4 : backtest walk-forward

Généré par `node trader-pro/outils/backtest-ma200.mjs <dossier>` (données : `telecharger-historique.mjs`, Yahoo Finance ; Or = futures COMEX GC=F). Le H4 est parcouru bougie par bougie sans jamais voir le futur (test `trader-pro/tests/ma200-test.mjs`, section « walk-forward » : couper les données ou changer tout le futur ne modifie aucune flèche passée).
Chaque flèche est suivie jusqu'à sa sortie : stop, changement de sens Daily, ou (petites flèches) clôture H4 sous le dernier creux H4 important. Gains en multiples de R (R = |entrée − stop|), **sans frais ni glissement** ; les flèches encore ouvertes à la fin des données sont exclues.
Grosses flèches : 10 ans de Daily (simulées sur les bougies Daily). Petites flèches : tout le H4 disponible chez Yahoo (≈ 2,4 ans pour l'or, ≈ 2,9 ans pour le Nasdaq 100).

## Or (futures COMEX GC)

Daily : 2514 bougies (depuis 2016-11-17, 10,0 ans) · H4 : 3613 bougies (du 2024-06-27 au 2026-11-17, 2,4 ans)

| Flèches | Signaux | Par an | % gagnants | Gain moyen (R) | Perte moyenne (R) | Espérance par trade (R) | Pire série de pertes | Total (R) |
|---|---|---|---|---|---|---|---|---|
| **Grosses (Daily)** | 20 | 2,0 | 25,0 % | 11,66 | -0,87 | 2,26 | 11 | 45,27 |
| **Petites (H4)** | 75 | 31,4 | 57,3 % | 0,72 | -0,32 | 0,28 | 5 | 20,90 |
| · dont rebonds | 15 | 6,3 | 46,7 % | 0,92 | -0,20 | 0,33 | 3 | 4,89 |
| · dont cassures | 60 | 25,1 | 60,0 % | 0,68 | -0,36 | 0,27 | 4 | 16,01 |

Flèches encore ouvertes (exclues) : grosses 1, petites 1. Motifs de sortie : {grosse:{stop:11,changement de sens Daily:9},petite:{cassure du dernier creux H4:74,stop:1}}.

## Nasdaq 100

Daily : 2512 bougies (depuis 2016-11-17, 10,0 ans) · H4 : 1952 bougies (du 2023-12-20 au 2026-11-17, 2,9 ans)

| Flèches | Signaux | Par an | % gagnants | Gain moyen (R) | Perte moyenne (R) | Espérance par trade (R) | Pire série de pertes | Total (R) |
|---|---|---|---|---|---|---|---|---|
| **Grosses (Daily)** | 14 | 1,4 | 28,6 % | 3,63 | -1,02 | 0,31 | 7 | 4,33 |
| **Petites (H4)** | 51 | 17,5 | 37,3 % | 0,88 | -0,45 | 0,04 | 5 | 2,24 |
| · dont rebonds | 5 | 1,7 | 40,0 % | 3,03 | -0,40 | 0,97 | 2 | 4,86 |
| · dont cassures | 46 | 15,8 | 37,0 % | 0,63 | -0,46 | -0,06 | 5 | -2,62 |

Flèches encore ouvertes (exclues) : grosses 1, petites 0. Motifs de sortie : {grosse:{changement de sens Daily:6,stop:8},petite:{cassure du dernier creux H4:48,stop:3}}.

## À lire avant de s'y fier

- **Grosses flèches, Or : +45 R sur 20 croisements, dont +35,7 R pour le seul achat du 19/10/2023** (le prix passe de ~1 970 à plus de 4 000). Sans ce trade : +9,6 R. 25 % de trades gagnants seulement : c'est une méthode de tendance (beaucoup de petites pertes, quelques énormes gains), pénible à suivre (pire série : 11 pertes d'affilée).
- **Grosses flèches, Nasdaq 100 : +4,3 R sur 14 croisements, dont +8,2 R pour le seul achat d'avril 2020.** Sans ce trade : −3,9 R. Le Nasdaq ne confirme pas l'avantage.
- **Petites flèches** : surtout des achats (or : 65 achats pour 10 ventes) pendant la hausse 2024-2026 ; les cassures du Nasdaq perdent (−2,6 R). Échantillon de 2 à 3 ans, un seul grand marché haussier : à ne pas extrapoler.
- Les sorties « cassure du dernier creux H4 » représentent presque toutes les sorties des petites flèches : gains moyens faibles (≈ 0,7 R) pour des pertes faibles (≈ 0,3 R).
- Pas de frais, de spread ni de glissement : avec 31 petites flèches par an sur l'or, les frais comptent.

## Choix faits seul

- **Neutre / confirmé** : le côté confirmé (haussier / baissier) ne change que sur 2 clôtures Daily de l'autre côté de la bande ; le sens utilisé pour les petites flèches est neutre dès que la dernière clôture Daily est dans la bande MA200 ± 0,5 ATR (ou d'un seul côté non confirmé). Le premier côté confirmé en début d'historique n'est pas un croisement : pas de grosse flèche.
- **Repli** = recul d'au moins 1 ATR Daily depuis le plus haut (plus bas) atteint depuis la dernière petite flèche. Une petite flèche (rebond ou cassure) n'est possible qu'après un repli ; au moins 3 jours entre deux petites flèches.
- **Rebond** : zone = niveau ± 0,3 ATR Daily ; S1 / S2 (R1 / R2) = niveaux clés du terminal ; déclencheur = dernier sommet (creux) H4 à 2 bougies de chaque côté, parmi les 40 dernières bougies, valable 30 bougies H4.
- **Stop de la petite flèche** = 1 ATR Daily au-delà du plus bas (haut) H4 atteint depuis le plus haut (bas) des 40 dernières bougies. **Sortie** : clôture H4 sous le plus élevé des deux : le creux du repli, ou les creux H4 (3 bougies de chaque côté) formés depuis l'entrée, ou changement de sens Daily. Grosse flèche : sortie = stop (1 ATR derrière la MA200) ou changement de sens Daily, sans sortie sur le H4.
- Les mêmes flèches s'affichent sur le Jour et sur H4 (la grosse flèche sur la dernière bougie H4 du jour du croisement) ; fond du graphique teinté selon le sens Daily (Jour et H4 seulement).
