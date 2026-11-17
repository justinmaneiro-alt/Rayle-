# MA200 Daily + H4 : cassures et rebonds sur la MA200 Daily, backtest walk-forward

Généré par `node trader-pro/outils/backtest-ma200.mjs <dossier>` (données : `telecharger-historique.mjs`, Yahoo Finance ; Or = futures COMEX GC=F). Le H4 est parcouru bougie par bougie sans jamais voir le futur (`trader-pro/tests/ma200-test.mjs`, section « walk-forward », vérifiée pour chaque variante). Gains en multiples de R (R = |entrée − stop|, stop à 0,5 ATR de l'autre côté de la MA200 Daily), sortie au stop ou à la première clôture Daily de l'autre côté de la MA200, **sans frais ni glissement** ; les flèches encore ouvertes sont exclues.

Règles : **cassure** (grosse flèche) = une clôture Daily franchit la MA200 Daily + confirmation (trois variantes testées : 1 clôture Daily puis 1 clôture H4 du bon côté ; 2 clôtures Daily d'affilée ; 1 clôture Daily à 0,5 ATR au-delà), avec ou sans filtre de pente (MA200 plate ou dans le sens de la cassure sur 20 jours). **Rebond** (petite flèche) = tendance établie (10 clôtures du même côté + pente dans le même sens), contact de la MA200 (mèche à moins de 0,3 ATR), puis clôture H4 qui repart ; un seul rebond par contact.

Trois bases : **10 ans** (cassures sur tout le Daily ; la confirmation « clôture H4 » n'a pas de H4 avant 2023-2024 : elle est remplacée par un PROXY, « l'ouverture du lendemain reste du bon côté », suivi sur le Daily), **fenêtre H4** (2,4 ans pour l'or, 2,9 ans pour le Nasdaq 100 : vraie clôture H4, échantillon très petit) et **combiné** (cassures 10 ans + rebonds fenêtre H4 : base de la sélection).

## Or (futures COMEX GC)

Daily 2514 bougies (depuis 2016-11-17) · H4 3614 bougies (du 2024-06-27 au 2026-11-17)

### Cassures sur 10 ans (proxy pour la clôture H4)

| Variante | Flèches | Par an | % gagnants | Espérance (R) | Total (R) | Total sans le meilleur trade (R) | Pire série de pertes |
|---|---|---|---|---|---|---|---|
| 1 clôture Daily + 1 clôture H4 · avec filtre de pente | 27 | 2,7 | 14,8 % | 5,43 | 146,72 | -13,33 | 14 |
| 1 clôture Daily + 1 clôture H4 · sans filtre de pente | 57 | 5,7 | 14,0 % | 2,73 | 155,48 | -4,57 | 26 |
| 2 clôtures Daily · avec filtre de pente | 19 | 1,9 | 26,3 % | 3,54 | 67,28 | -8,84 | 10 |
| 2 clôtures Daily · sans filtre de pente | 45 | 4,5 | 20,0 % | 2,41 | 108,56 | 32,44 | 20 |
| 1 clôture Daily à 0,5 ATR · avec filtre de pente | 7 | 0,7 | 14,3 % | -0,28 | -1,98 | -4,33 | 5 |
| 1 clôture Daily à 0,5 ATR · sans filtre de pente | 15 | 1,5 | 20,0 % | 0,63 | 9,49 | -6,40 | 11 |

### Cassures sur la fenêtre H4 (vraie clôture H4)

| Variante | Flèches | Par an | % gagnants | Espérance (R) | Total (R) | Total sans le meilleur trade (R) | Pire série de pertes |
|---|---|---|---|---|---|---|---|
| 1 clôture Daily + 1 clôture H4 · avec filtre de pente | 1 | 0,4 | 0,0 % | -0,62 | -0,62 | 0,00 | 1 |
| 1 clôture Daily + 1 clôture H4 · sans filtre de pente | 3 | 1,3 | 0,0 % | -0,64 | -1,91 | -1,62 | 3 |
| 2 clôtures Daily · avec filtre de pente | 1 | 0,4 | 0,0 % | -0,38 | -0,38 | 0,00 | 1 |
| 2 clôtures Daily · sans filtre de pente | 3 | 1,3 | 0,0 % | -0,64 | -1,93 | -1,55 | 3 |
| 1 clôture Daily à 0,5 ATR · avec filtre de pente | 0 | 0,0 | 0,0 % | 0,00 | 0,00 | 0,00 | 0 |
| 1 clôture Daily à 0,5 ATR · sans filtre de pente | 0 | 0,0 | 0,0 % | 0,00 | 0,00 | 0,00 | 0 |

### Rebonds sur la MA200 Daily (fenêtre H4)

| Variante | Flèches | Par an | % gagnants | Espérance (R) | Total (R) | Total sans le meilleur trade (R) | Pire série de pertes |
|---|---|---|---|---|---|---|---|
| Rebonds | 2 | 0,8 | 0,0 % | -0,62 | -1,23 | -1,00 | 2 |

### Combiné (cassures 10 ans + rebonds fenêtre H4)

| Variante | Flèches | Par an | % gagnants | Espérance (R) | Total (R) | Total sans le meilleur trade (R) | Pire série de pertes |
|---|---|---|---|---|---|---|---|
| 1 clôture Daily + 1 clôture H4 · avec filtre de pente | 29 | 3,5 | 13,8 % | 5,02 | 145,48 | -14,56 | 14 |
| 1 clôture Daily + 1 clôture H4 · sans filtre de pente | 59 | 6,5 | 13,6 % | 2,61 | 154,25 | -5,80 | 26 |
| 2 clôtures Daily · avec filtre de pente | 21 | 2,7 | 23,8 % | 3,14 | 66,04 | -10,07 | 10 |
| 2 clôtures Daily · sans filtre de pente | 47 | 5,3 | 19,1 % | 2,28 | 107,32 | 31,21 | 20 |
| 1 clôture Daily à 0,5 ATR · avec filtre de pente | 9 | 1,5 | 11,1 % | -0,36 | -3,22 | -5,56 | 7 |
| 1 clôture Daily à 0,5 ATR · sans filtre de pente | 17 | 2,3 | 17,6 % | 0,49 | 8,26 | -7,63 | 13 |

## Nasdaq 100

Daily 2512 bougies (depuis 2016-11-17) · H4 1953 bougies (du 2023-12-20 au 2026-11-17)

### Cassures sur 10 ans (proxy pour la clôture H4)

| Variante | Flèches | Par an | % gagnants | Espérance (R) | Total (R) | Total sans le meilleur trade (R) | Pire série de pertes |
|---|---|---|---|---|---|---|---|
| 1 clôture Daily + 1 clôture H4 · avec filtre de pente | 11 | 1,1 | 27,3 % | 2,30 | 25,35 | 1,54 | 5 |
| 1 clôture Daily + 1 clôture H4 · sans filtre de pente | 28 | 2,8 | 21,4 % | 1,59 | 44,41 | 17,64 | 10 |
| 2 clôtures Daily · avec filtre de pente | 10 | 1,0 | 30,0 % | 3,13 | 31,29 | 1,13 | 6 |
| 2 clôtures Daily · sans filtre de pente | 27 | 2,7 | 22,2 % | 1,50 | 40,44 | 10,28 | 10 |
| 1 clôture Daily à 0,5 ATR · avec filtre de pente | 6 | 0,6 | 16,7 % | -0,23 | -1,36 | -4,01 | 4 |
| 1 clôture Daily à 0,5 ATR · sans filtre de pente | 19 | 1,9 | 15,8 % | -0,21 | -4,04 | -9,58 | 12 |

### Cassures sur la fenêtre H4 (vraie clôture H4)

| Variante | Flèches | Par an | % gagnants | Espérance (R) | Total (R) | Total sans le meilleur trade (R) | Pire série de pertes |
|---|---|---|---|---|---|---|---|
| 1 clôture Daily + 1 clôture H4 · avec filtre de pente | 2 | 0,7 | 50,0 % | 0,85 | 1,71 | -1,00 | 1 |
| 1 clôture Daily + 1 clôture H4 · sans filtre de pente | 5 | 1,7 | 40,0 % | 0,17 | 0,84 | -1,87 | 2 |
| 2 clôtures Daily · avec filtre de pente | 2 | 0,7 | 50,0 % | 0,46 | 0,91 | -1,00 | 1 |
| 2 clôtures Daily · sans filtre de pente | 6 | 2,1 | 33,3 % | -0,40 | -2,38 | -4,54 | 2 |
| 1 clôture Daily à 0,5 ATR · avec filtre de pente | 2 | 0,7 | 50,0 % | 0,82 | 1,64 | -1,00 | 1 |
| 1 clôture Daily à 0,5 ATR · sans filtre de pente | 5 | 1,7 | 40,0 % | 0,43 | 2,17 | -1,06 | 2 |

### Rebonds sur la MA200 Daily (fenêtre H4)

| Variante | Flèches | Par an | % gagnants | Espérance (R) | Total (R) | Total sans le meilleur trade (R) | Pire série de pertes |
|---|---|---|---|---|---|---|---|
| Rebonds | 6 | 2,1 | 0,0 % | -1,35 | -8,08 | -7,08 | 6 |

### Combiné (cassures 10 ans + rebonds fenêtre H4)

| Variante | Flèches | Par an | % gagnants | Espérance (R) | Total (R) | Total sans le meilleur trade (R) | Pire série de pertes |
|---|---|---|---|---|---|---|---|
| 1 clôture Daily + 1 clôture H4 · avec filtre de pente | 17 | 3,2 | 17,6 % | 1,02 | 17,27 | -6,54 | 6 |
| 1 clôture Daily + 1 clôture H4 · sans filtre de pente | 34 | 4,9 | 17,6 % | 1,07 | 36,33 | 9,56 | 10 |
| 2 clôtures Daily · avec filtre de pente | 16 | 3,1 | 18,8 % | 1,45 | 23,21 | -6,95 | 7 |
| 2 clôtures Daily · sans filtre de pente | 33 | 4,8 | 18,2 % | 0,98 | 32,35 | 2,20 | 10 |
| 1 clôture Daily à 0,5 ATR · avec filtre de pente | 12 | 2,7 | 8,3 % | -0,79 | -9,44 | -12,09 | 7 |
| 1 clôture Daily à 0,5 ATR · sans filtre de pente | 25 | 4,0 | 12,0 % | -0,48 | -12,12 | -17,66 | 12 |

## Variante choisie (réglage par défaut) : **2 clôtures Daily · sans filtre de pente**

- **Règle de sélection** : parmi les 6 variantes, celles dont le total sans le meilleur trade est positif sur l'or ET sur le Nasdaq 100 (base combinée) ; la plus rentable des deux (total or + Nasdaq) est retenue. 1 variante(s) satisfont le critère : 2 clôtures Daily · sans filtre de pente.
- **Résultat** : or 5,3 flèches par an, 107,32 R au total (31,21 R sans le meilleur trade, espérance 2,28 R, pire série 20) ; Nasdaq 100 4,8 flèches par an, 32,35 R au total (2,20 R sans le meilleur trade, espérance 0,98 R, pire série 10).
- **Le filtre de pente ne gagne pas** dans ce test : toutes les variantes avec filtre de pente ont un total sans le meilleur trade négatif sur au moins un actif. Le filtre est donc désactivé par défaut (il reste disponible dans le code : `PENTE_DEFAUT`).
- **La clôture H4 de confirmation ne gagne pas non plus** sur 10 ans (proxy) : avec la confirmation « 1 clôture Daily + 1 clôture H4 », l'or a un total sans le meilleur trade négatif sans filtre de pente (-5,80 R), alors que 2 clôtures Daily donne +31,21 R. La confirmation par défaut est donc « 2 clôtures Daily ».

## À lire avant de s'y fier

- **Peu de trades gagnants, de très gros gains** : 19,1 % de gagnants sur l'or, 18,2 % sur le Nasdaq 100 ; l'espérance vient de quelques tendances longues. Pour l'or, le meilleur trade vaut 76,12 R sur 107,32 R au total.
- **Les rebonds perdent** dans ce test (or : 2 rebonds, -1,23 R ; Nasdaq 100 : 6 rebonds, -8,08 R), sur 2,4 à 2,9 ans de H4 seulement : échantillon trop petit pour conclure, mais aucun signe de rentabilité. Ils sont conservés parce que la consigne les demande.
- La confirmation « clôture H4 » ne peut être testée avec le vrai H4 que sur 2,4 à 2,9 ans (1 à 5 cassures) : la comparaison sur 10 ans utilise un proxy (ouverture du lendemain).
- Sans frais, sans spread, sans glissement.
