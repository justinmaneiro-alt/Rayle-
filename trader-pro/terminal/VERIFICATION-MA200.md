# Vérification des flèches « MA200 H4 + zones majeures H4 »

Calculé par `node trader-pro/outils/backtest-ma200.mjs <dossier des instantanés pro-*.json>` sur tout l'historique H4 chargé (instantanés du robot, branche « donnees », 2026-11-18).
Une flèche est **gagnante** si le prix fait +2 ATR dans son sens avant −1 ATR contre (les deux dans la même bougie : perdante). R moyen : +2 R par gagnante, −1 R par perdante. Seuil d'équilibre : 33 % de réussite.

| Actif | Bougies H4 | Flèches | Total (réussite · R moyen) | a) Rebond MA200 H4 | b) Cassure + retest | c) Rebond sur zone |
|---|---|---|---|---|---|---|
| or | 3600 | 117 (4.3/mois) | 40 % · +0.21 R | 14 · 29 % · −0.14 R | 12 · 25 % · −0.25 R | 91 · 44 % · +0.32 R |
| us100 | 1951 | 42 (1.2/mois) | 38 % · +0.14 R | 6 · 17 % · −0.50 R | 6 · 50 % · +0.50 R | 30 · 40 % · +0.20 R |
| us500 | 1951 | 47 (1.3/mois) | 30 % · −0.09 R | 7 · 29 % · −0.14 R | 7 · 14 % · −0.57 R | 33 · 34 % · +0.03 R |
| btc | 3600 | 127 (6.4/mois) | 40 % · +0.21 R | 10 · 60 % · +0.80 R | 13 · 31 % · −0.08 R | 104 · 40 % · +0.19 R |
| sol | 3600 | 127 (6.4/mois) | 44 % · +0.32 R | 10 · 40 % · +0.20 R | 11 · 64 % · +0.91 R | 106 · 42 % · +0.27 R |

## Réglages issus du backtest

Premier jet (seuils de la consigne) : a) rebond MA200 H4 ≈ 28 % (R −0,16) et b) cassure + retest ≈ 31 % (R −0,08) étaient perdants sur l'ensemble des 5 actifs, c) rebond sur zone ≈ 42 % (R +0,26) gagnant.
Seuils ajustés sur ces deux types seulement, sans ajouter d'indicateur : b) cassure franche à 1 ATR (au lieu de 0,5), retest à 0,4 ATR, rejet ≥ 50 % ; a) pente de la MA200 sur 20 bougies d'au moins 0,5 ATR.
Les échantillons par actif et par type restent petits (6 à 20 flèches pour a et b) : à surveiller, ce ne sont pas des preuves statistiques solides.

Ensemble des 5 actifs après réglage : a) 47 flèches, 36 % de réussite, R +0,09 ; b) 49 flèches, 37 %, R +0,10 ; c) 362 flèches, 41 %, R +0,23.
Sur l'or seul, a) (14 flèches) et b) (12 flèches) restent légèrement perdants ; le total or est de 117 flèches, 40 %, R +0,21, porté par c).
La grosse flèche (MA200 et zone au même endroit) ne réussit pas mieux que la petite sur l'or (31 % contre 43 %).
