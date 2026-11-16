# Backtest des flèches Daily (retournements des gros mouvements)

Généré par `node trader-pro/terminal/backtest-fleches.mjs` le 2026-11-15. Données : bougies Daily Yahoo Finance du robot (futures GC=F pour l'or). Rien n'est inventé.

## Protocole (fixé avant la mesure)
- **Vérité** : zigzag vu après coup ; un sommet / creux est « majeur » si le prix repart d'au moins 6 × ATR 14 médian en % (comparable entre actifs).
- **Bonne flèche** : tombe de 0 à 15 bougies après un sommet (flèche rouge) ou un creux (flèche verte) majeur ; un pivot ne sert qu'une fois, les doublons sont comptés faux.
- **Causalité** : la flèche du jour i n'utilise que les bougies jusqu'à i ; elle apparaît à la clôture de la bougie qui confirme et ne bouge plus (testé : tronquer l'historique ne change aucune flèche passée). Seules des différences de prix et des multiples d'ATR sont utilisés : un recalage constant de l'historique ne change rien.
- **Réglage** : 6 réglages fixés d'avance par méthode, choisis sur 60 % les plus anciens de l'or et du Nasdaq 100 (meilleur F1 avec 1 à 6 flèches par trimestre et par actif), puis figés ; la période suivante (hors échantillon) n'est regardée qu'après. Bitcoin = contrôle.
- **Hasard** : 400 tirages de flèches aléatoires, mêmes nombres et mêmes sens.

## Données
- Or (futures GC=F) : 2016-11-15 → 2026-11-13 (2515 bougies), coupure apprentissage / hors échantillon le 2022-11-15, seuil majeur 8,1 %, 39 retournements majeurs (3,9 par an).
- Nasdaq 100 : 2016-11-14 → 2026-11-13 (2514 bougies), coupure apprentissage / hors échantillon le 2022-11-10, seuil majeur 8,9 %, 58 retournements majeurs (5,8 par an).
- Bitcoin : 2016-11-15 → 2026-11-14 (3652 bougies), coupure apprentissage / hors échantillon le 2022-11-15, seuil majeur 23,4 %, 82 retournements majeurs (5,7 par an).

## Résultats par méthode (hors échantillon = après la coupure)

| Méthode | Réglage retenu | Flèches / trim. | Bonnes | Rappel (gros mouvements captés) | Décalage moyen | Mouvement moyen capté | Pire fausse flèche | p contre le hasard |
|---|---|---|---|---|---|---|---|---|
| Plus haut / plus bas de N jours + clôture de confirmation | {"N":60,"conf":1} | 1,5 | 45 % (21/47) | 55 % (21/38) | 4,4 j | 12,5 % | 28,6 % | 0,007 |
| **Pivot de swing confirmé (plus haut / plus bas autour de la bougie)** (retenue) | {"L":12,"R":12,"amp":5} | 1,7 | 51 % (28/55) | 74 % (28/38) | 17,1 j | 12,4 % | 19,1 % | 0,002 |
| Excès + bougie de retournement | {"type":"ma","exces":3} | 2,5 | 23 % (18/79) | 47 % (18/38) | 6,1 j | 15,4 % | 28,6 % | 0,145 |

## Détail par actif pour chaque méthode (hors échantillon)

### Plus haut / plus bas de N jours + clôture de confirmation

Apprentissage (or + Nasdaq 100) : F1 0,49, précision 44 %, rappel 54 %.

| Actif | Période | Flèches | Par trimestre | Bonnes | Gros mouvements captés | Décalage | Mouvement capté | Mouvement à 20 j | Pire fausse | Précision du hasard | p |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Or (futures GC=F) | 2022-11-15 → 2026-11-13 | 20 | 1,3 | 40 % (8/20) | 38 % (8/21) | 3,9 j | 10,7 % | -3,8 % | 28,6 % | 16 % | 0,007 |
| Nasdaq 100 | 2022-11-10 → 2026-11-13 | 27 | 1,7 | 48 % (13/27) | 76 % (13/17) | 4,9 j | 14,3 % | 0,7 % | 18,0 % | 13 % | 0,002 |
| Bitcoin (contrôle) | 2022-11-15 → 2026-11-14 | 24 | 1,5 | 33 % (8/24) | 67 % (8/12) | 6,1 j | 74,2 % | 0,9 % | 29,5 % | 6 % | 0,002 |

### Pivot de swing confirmé (plus haut / plus bas autour de la bougie) : RETENUE

Apprentissage (or + Nasdaq 100) : F1 0,53, précision 46 %, rappel 63 %.

| Actif | Période | Flèches | Par trimestre | Bonnes | Gros mouvements captés | Décalage | Mouvement capté | Mouvement à 20 j | Pire fausse | Précision du hasard | p |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Or (futures GC=F) | 2022-11-15 → 2026-11-13 | 28 | 1,8 | 50 % (14/28) | 67 % (14/21) | 17,2 j | 11,7 % | -0,9 % | 19,1 % | 17 % | 0,002 |
| Nasdaq 100 | 2022-11-10 → 2026-11-13 | 27 | 1,7 | 52 % (14/27) | 82 % (14/17) | 17,1 j | 13,0 % | -0,1 % | 12,8 % | 14 % | 0,002 |
| Bitcoin (contrôle) | 2022-11-15 → 2026-11-14 | 42 | 2,6 | 24 % (10/42) | 83 % (10/12) | 12,0 j | 65,4 % | -1,7 % | 41,2 % | 6 % | 0,002 |

### Excès + bougie de retournement

Apprentissage (or + Nasdaq 100) : F1 0,29, précision 23 %, rappel 37 %.

| Actif | Période | Flèches | Par trimestre | Bonnes | Gros mouvements captés | Décalage | Mouvement capté | Mouvement à 20 j | Pire fausse | Précision du hasard | p |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Or (futures GC=F) | 2022-11-15 → 2026-11-13 | 38 | 2,4 | 24 % (9/38) | 43 % (9/21) | 4,8 j | 14,0 % | -2,6 % | 28,6 % | 18 % | 0,145 |
| Nasdaq 100 | 2022-11-10 → 2026-11-13 | 41 | 2,6 | 22 % (9/41) | 53 % (9/17) | 7,4 j | 16,8 % | -0,9 % | 15,2 % | 15 % | 0,065 |
| Bitcoin (contrôle) | 2022-11-15 → 2026-11-14 | 53 | 3,3 | 13 % (7/53) | 58 % (7/12) | 4,1 j | 81,2 % | -0,2 % | 45,4 % | 6 % | 0,022 |

## Verdict

**La méthode retenue (Pivot de swing confirmé (plus haut / plus bas autour de la bougie)) repère les gros retournements nettement mieux que le hasard hors échantillon (précision 51 %, rappel 74 %), avec un décalage moyen de 17,1 jours : la flèche confirme un retournement DÉJÀ amorcé. Ce n'est pas un signal de trading rentable à lui seul : dans les 20 jours qui suivent, le prix évolue en moyenne de -0,9 % (or) et -0,1 % (Nasdaq 100) dans le sens de la flèche. Sur le Bitcoin (contrôle), seules 24 % des flèches sont bonnes.**

Définitions : *rappel* = part des gros retournements qui ont une flèche dans les 15 jours qui suivent ; *mouvement capté* = de la clôture de la flèche jusqu'au retournement majeur suivant (idéal, sans coûts) ; *pire fausse flèche* = plus grande poussée contre la flèche dans les 30 jours (hors flèches bonnes). Un backtest ne garantit pas l'avenir.
