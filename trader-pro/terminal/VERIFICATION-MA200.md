# MA200 Daily + H4 : backtest walk-forward (variantes à moins de flèches)

Généré par `node trader-pro/outils/backtest-ma200.mjs <dossier>` (données : `telecharger-historique.mjs`, Yahoo Finance ; Or = futures COMEX GC=F). Le H4 est parcouru bougie par bougie sans jamais voir le futur (`trader-pro/tests/ma200-test.mjs`, section « walk-forward », vérifiée pour chaque variante). Chaque flèche est suivie jusqu'à sa sortie (stop, changement de sens Daily, ou clôture H4 sous le dernier creux H4 important pour les petites flèches), en multiples de R, **sans frais ni glissement** ; les flèches encore ouvertes sont exclues.

Objectif : au plus 8 flèches par an et par actif au total, en gardant la rentabilité. Variantes : **V0** première version (rebonds + cassures, toutes zones) · **V1** grosses seules · **V2** grosses + rebonds uniquement, sur une zone Daily (MA200 Daily ou S1 / S2 / R1 / R2 Daily, ± 0,5 ATR), plus de cassures, plus de MA200 H4 · **V3** V2 avec au plus 2 petites flèches par tendance Daily. Filtres anti-piège des grosses flèches : 2 clôtures / 0,5 ATR (base), 3 clôtures, ou marge 1 ATR.

Deux bases : les petites flèches n'existent que là où le H4 existe (2,4 ans d'or, 2,9 ans de Nasdaq 100), alors que les grosses flèches se testent sur 10 ans de Daily. **« Combiné »** = grosses sur 10 ans + petites sur la fenêtre H4 (c'est la base de la sélection) ; **« fenêtre H4 »** = tout, sur la seule période H4 (échantillon très petit).

## Or (futures COMEX GC)

Daily 2514 bougies (depuis 2016-11-17, 10,0 ans) · H4 3613 bougies (du 2024-06-27 au 2026-11-17, 2,4 ans)

### Grosses flèches seules, 10 ans, par filtre

| Filtre anti-piège | Grosses | Par an | % gagnants | Espérance (R) | Total (R) | Total sans le meilleur trade (R) | Pire série de pertes |
|---|---|---|---|---|---|---|---|
| 2 clôtures, marge 0,5 ATR | 20 | 2,0 | 25,0 % | 2,26 | 45,27 | 9,58 | 11 |
| 3 clôtures, marge 0,5 ATR | 14 | 1,4 | 35,7 % | 2,53 | 35,47 | 8,09 | 5 |
| 2 clôtures, marge 1 ATR | 14 | 1,4 | 35,7 % | 3,49 | 48,87 | 15,54 | 5 |

### Combiné (grosses 10 ans + petites fenêtre H4)

| Variante | Filtre grosses | Flèches | Par an | % gagnants | Espérance (R) | Total (R) | Total sans le meilleur trade (R) | Pire série de pertes |
|---|---|---|---|---|---|---|---|---|
| V0 · première version (rebonds + cassures) | 2 clôtures, marge 0,5 ATR | 95 | 33,4 | 50,5 % | 0,70 | 66,17 | 30,48 | 11 |
| V1 · grosses seules | 2 clôtures, marge 0,5 ATR | 20 | 2,0 | 25,0 % | 2,26 | 45,27 | 9,58 | 11 |
| V2 · grosses + rebonds sur zone Daily | 2 clôtures, marge 0,5 ATR | 29 | 5,8 | 37,9 % | 1,76 | 50,96 | 15,27 | 11 |
| V3 · V2, 2 petites par tendance Daily | 2 clôtures, marge 0,5 ATR | 25 | 4,1 | 36,0 % | 1,85 | 46,26 | 10,56 | 11 |
| V0 · première version (rebonds + cassures) | 3 clôtures, marge 0,5 ATR | 87 | 31,9 | 55,2 % | 0,66 | 57,59 | 30,21 | 5 |
| V1 · grosses seules | 3 clôtures, marge 0,5 ATR | 14 | 1,4 | 35,7 % | 2,53 | 35,47 | 8,09 | 5 |
| V2 · grosses + rebonds sur zone Daily | 3 clôtures, marge 0,5 ATR | 23 | 5,2 | 47,8 % | 1,79 | 41,15 | 13,77 | 5 |
| V3 · V2, 2 petites par tendance Daily | 3 clôtures, marge 0,5 ATR | 19 | 3,5 | 47,4 % | 1,92 | 36,45 | 9,07 | 5 |
| V0 · première version (rebonds + cassures) | 2 clôtures, marge 1 ATR | 86 | 31,5 | 55,8 % | 0,83 | 71,02 | 37,69 | 5 |
| V1 · grosses seules | 2 clôtures, marge 1 ATR | 14 | 1,4 | 35,7 % | 3,49 | 48,87 | 15,54 | 5 |
| V2 · grosses + rebonds sur zone Daily | 2 clôtures, marge 1 ATR | 20 | 3,9 | 50,0 % | 2,73 | 54,59 | 21,26 | 5 |
| V3 · V2, 2 petites par tendance Daily | 2 clôtures, marge 1 ATR | 18 | 3,1 | 44,4 % | 2,73 | 49,17 | 15,84 | 5 |

### Fenêtre H4 seule (grosses + petites sur la même période)

| Variante | Filtre grosses | Flèches | Par an | % gagnants | Espérance (R) | Total (R) | Total sans le meilleur trade (R) | Pire série de pertes |
|---|---|---|---|---|---|---|---|---|
| V0 · première version (rebonds + cassures) | 2 clôtures, marge 0,5 ATR | 77 | 32,2 | 55,8 % | 0,25 | 18,90 | 14,90 | 6 |
| V1 · grosses seules | 2 clôtures, marge 0,5 ATR | 2 | 0,8 | 0,0 % | -1,00 | -2,00 | -1,00 | 2 |
| V2 · grosses + rebonds sur zone Daily | 2 clôtures, marge 0,5 ATR | 11 | 4,6 | 54,5 % | 0,34 | 3,69 | -1,73 | 2 |
| V3 · V2, 2 petites par tendance Daily | 2 clôtures, marge 0,5 ATR | 7 | 2,9 | 57,1 % | -0,15 | -1,02 | -1,50 | 2 |
| V0 · première version (rebonds + cassures) | 3 clôtures, marge 0,5 ATR | 75 | 31,4 | 57,3 % | 0,27 | 20,13 | 16,13 | 5 |
| V1 · grosses seules | 3 clôtures, marge 0,5 ATR | 2 | 0,8 | 0,0 % | -1,00 | -2,00 | -1,00 | 2 |
| V2 · grosses + rebonds sur zone Daily | 3 clôtures, marge 0,5 ATR | 11 | 4,6 | 54,5 % | 0,34 | 3,69 | -1,73 | 2 |
| V3 · V2, 2 petites par tendance Daily | 3 clôtures, marge 0,5 ATR | 7 | 2,9 | 57,1 % | -0,15 | -1,02 | -1,50 | 2 |
| V0 · première version (rebonds + cassures) | 2 clôtures, marge 1 ATR | 74 | 30,9 | 58,1 % | 0,27 | 20,15 | 16,15 | 4 |
| V1 · grosses seules | 2 clôtures, marge 1 ATR | 2 | 0,8 | 0,0 % | -1,00 | -2,00 | -1,00 | 2 |
| V2 · grosses + rebonds sur zone Daily | 2 clôtures, marge 1 ATR | 8 | 3,3 | 62,5 % | 0,47 | 3,72 | -1,69 | 2 |
| V3 · V2, 2 petites par tendance Daily | 2 clôtures, marge 1 ATR | 6 | 2,5 | 50,0 % | -0,28 | -1,70 | -2,18 | 2 |

## Nasdaq 100

Daily 2512 bougies (depuis 2016-11-17, 10,0 ans) · H4 1952 bougies (du 2023-12-20 au 2026-11-17, 2,9 ans)

### Grosses flèches seules, 10 ans, par filtre

| Filtre anti-piège | Grosses | Par an | % gagnants | Espérance (R) | Total (R) | Total sans le meilleur trade (R) | Pire série de pertes |
|---|---|---|---|---|---|---|---|
| 2 clôtures, marge 0,5 ATR | 14 | 1,4 | 28,6 % | 0,31 | 4,33 | -3,91 | 7 |
| 3 clôtures, marge 0,5 ATR | 9 | 0,9 | 33,3 % | 0,28 | 2,54 | -3,67 | 3 |
| 2 clôtures, marge 1 ATR | 10 | 1,0 | 40,0 % | 0,72 | 7,21 | -1,03 | 3 |

### Combiné (grosses 10 ans + petites fenêtre H4)

| Variante | Filtre grosses | Flèches | Par an | % gagnants | Espérance (R) | Total (R) | Total sans le meilleur trade (R) | Pire série de pertes |
|---|---|---|---|---|---|---|---|---|
| V0 · première version (rebonds + cassures) | 2 clôtures, marge 0,5 ATR | 65 | 18,9 | 35,4 % | 0,10 | 6,57 | -1,67 | 7 |
| V1 · grosses seules | 2 clôtures, marge 0,5 ATR | 14 | 1,4 | 28,6 % | 0,31 | 4,33 | -3,91 | 7 |
| V2 · grosses + rebonds sur zone Daily | 2 clôtures, marge 0,5 ATR | 17 | 2,4 | 35,3 % | 0,31 | 5,23 | -3,02 | 7 |
| V3 · V2, 2 petites par tendance Daily | 2 clôtures, marge 0,5 ATR | 17 | 2,4 | 35,3 % | 0,31 | 5,23 | -3,02 | 7 |
| V0 · première version (rebonds + cassures) | 3 clôtures, marge 0,5 ATR | 60 | 18,4 | 36,7 % | 0,08 | 4,57 | -1,63 | 5 |
| V1 · grosses seules | 3 clôtures, marge 0,5 ATR | 9 | 0,9 | 33,3 % | 0,28 | 2,54 | -3,67 | 3 |
| V2 · grosses + rebonds sur zone Daily | 3 clôtures, marge 0,5 ATR | 12 | 1,9 | 41,7 % | 0,29 | 3,43 | -2,77 | 3 |
| V3 · V2, 2 petites par tendance Daily | 3 clôtures, marge 0,5 ATR | 12 | 1,9 | 41,7 % | 0,29 | 3,43 | -2,77 | 3 |
| V0 · première version (rebonds + cassures) | 2 clôtures, marge 1 ATR | 61 | 18,5 | 37,7 % | 0,15 | 9,39 | 1,15 | 5 |
| V1 · grosses seules | 2 clôtures, marge 1 ATR | 10 | 1,0 | 40,0 % | 0,72 | 7,21 | -1,03 | 3 |
| V2 · grosses + rebonds sur zone Daily | 2 clôtures, marge 1 ATR | 13 | 2,0 | 46,2 % | 0,62 | 8,11 | -0,14 | 3 |
| V3 · V2, 2 petites par tendance Daily | 2 clôtures, marge 1 ATR | 13 | 2,0 | 46,2 % | 0,62 | 8,11 | -0,14 | 3 |

### Fenêtre H4 seule (grosses + petites sur la même période)

| Variante | Filtre grosses | Flèches | Par an | % gagnants | Espérance (R) | Total (R) | Total sans le meilleur trade (R) | Pire série de pertes |
|---|---|---|---|---|---|---|---|---|
| V0 · première version (rebonds + cassures) | 2 clôtures, marge 0,5 ATR | 55 | 18,9 | 38,2 % | 0,07 | 3,61 | -1,60 | 6 |
| V1 · grosses seules | 2 clôtures, marge 0,5 ATR | 4 | 1,4 | 50,0 % | 0,34 | 1,37 | -0,60 | 1 |
| V2 · grosses + rebonds sur zone Daily | 2 clôtures, marge 0,5 ATR | 7 | 2,4 | 57,1 % | 0,32 | 2,27 | 0,30 | 2 |
| V3 · V2, 2 petites par tendance Daily | 2 clôtures, marge 0,5 ATR | 7 | 2,4 | 57,1 % | 0,32 | 2,27 | 0,30 | 2 |
| V0 · première version (rebonds + cassures) | 3 clôtures, marge 0,5 ATR | 54 | 18,6 | 37,0 % | 0,02 | 1,22 | -4,00 | 6 |
| V1 · grosses seules | 3 clôtures, marge 0,5 ATR | 3 | 1,0 | 33,3 % | -0,27 | -0,82 | -2,25 | 1 |
| V2 · grosses + rebonds sur zone Daily | 3 clôtures, marge 0,5 ATR | 6 | 2,1 | 50,0 % | 0,01 | 0,08 | -1,35 | 2 |
| V3 · V2, 2 petites par tendance Daily | 3 clôtures, marge 0,5 ATR | 6 | 2,1 | 50,0 % | 0,01 | 0,08 | -1,35 | 2 |
| V0 · première version (rebonds + cassures) | 2 clôtures, marge 1 ATR | 55 | 18,9 | 38,2 % | 0,06 | 3,09 | -2,13 | 6 |
| V1 · grosses seules | 2 clôtures, marge 1 ATR | 4 | 1,4 | 50,0 % | 0,23 | 0,90 | -0,89 | 1 |
| V2 · grosses + rebonds sur zone Daily | 2 clôtures, marge 1 ATR | 7 | 2,4 | 57,1 % | 0,26 | 1,80 | 0,00 | 2 |
| V3 · V2, 2 petites par tendance Daily | 2 clôtures, marge 1 ATR | 7 | 2,4 | 57,1 % | 0,26 | 1,80 | 0,00 | 2 |

## Variante choisie (réglage par défaut) : **V2 + marge 1 ATR**

- **Fréquence** : 3,9 flèches par an sur l'or et 2,0 sur le Nasdaq 100 (au lieu de 33,4 et 18,9 : première version), soit largement sous 8.
- **Rentabilité** (combiné) : or 54,59 R (2,73 R par trade), Nasdaq 100 8,11 R (0,62 R par trade). C'est la meilleure variante à moins de 8 flèches par an sur les DEUX actifs, et la pire série de pertes tombe à 5 (or) et 3 (Nasdaq) contre 11 et 7 avec 2 clôtures / 0,5 ATR.
- **Filtre anti-piège** : la marge de 1 ATR est le meilleur filtre sur 10 ans sur les deux actifs (or 48,87 R contre 45,27 R, Nasdaq 7,21 R contre 4,33 R ; moins de croisements, davantage de gagnants) ; 3 clôtures fait moins bien.
- **V3 n'apporte rien** (même nombre de petites flèches sur le Nasdaq, moins de rentabilité sur l'or) : V2 est gardée.
- **Critère de robustesse non rempli sur le Nasdaq 100** : total sans le meilleur trade -0,14 R (légèrement négatif ; 21,26 R sur l'or, positif). Aucune des 9 combinaisons à moins de 8 flèches par an ne passe le critère « sans le meilleur trade positif sur les deux actifs » : la meilleure en est V2 + marge 1 ATR. Les variantes qui le passent sur le Nasdaq (V0 + marge 1 ATR : +1,15 R) dépassent 18 flèches par an.

## À lire avant de s'y fier

- Échantillons petits : 20 flèches sur l'or et 13 sur le Nasdaq 100 pour la variante choisie, dont 14 et 10 grosses flèches sur 10 ans. Les grosses flèches de l'or reposent surtout sur un seul trade (achat d'octobre 2023).
- Les petites flèches (rebonds) ne couvrent que 2,4 à 2,9 ans, dans un marché globalement haussier.
- Sans frais, sans spread, sans glissement.
