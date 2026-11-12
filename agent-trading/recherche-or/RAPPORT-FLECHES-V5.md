# Flèches simples v5 : moins de rebonds contre-tendance, invalidation sans repaint (mode Direct)

**Les règles (MA200 sur 48 bougies, plus bas plus bas sur 24, base de 8 bougies ≤ 1,5 ATR, invalidation sur 2 bougies) ont été choisies en regardant ces exemples (chute de l'or du 12 nov.) : aucune preuve de performance. Repères de lecture, pas des ordres.**

## Règles ajoutées (v5 = v4 + 2 filtres ; v4 scellée intacte)
1. **Contre-tendance** : achat = clôture sous la MA200 ET MA200 plus basse qu'il y a 48 bougies ET plus bas des 24 dernières bougies < plus bas des 24 précédentes ; vente = miroir. Une telle flèche devient un **point gris discret**, sans notification ni alerte vocale, SAUF stabilisation : (a) base de 8 bougies sans nouvel extrême (vs les 16 précédentes), range ≤ 1,5 ATR ; (b) divergence RSI confirmée (pivots de 5 bougies) dont le second pivot est sur la zone (± 0,5 ATR).
2. **Invalidation** : si l'une des 2 bougies suivant la confirmation clôture de l'autre côté du niveau (achat : sous le bas de la zone ; vente : au-dessus du haut), la flèche passe à « invalidée » (grise, ×, infobulle « Invalidée à … »), décidée à la clôture de cette bougie, jamais rétroactive ; notification « Signal invalidé ». La flèche n'est jamais supprimée ni déplacée. Un point gris n'est pas invalidé.

## Compte avant / après (série Kraken, 1080 bougies)
- **v4** : 7 cassures MA200, 14 achats, 14 ventes (total 35).
- **v5** : 7 cassures MA200, **12 achats verts, 11 ventes rouges**, **5 points gris** (contre-tendance), dont 1 flèche(s) contre-tendance gardée(s) par stabilisation ; **5 flèches invalidées** (grisées, conservées). Total 35 (la v5 garde les mêmes positions que la v4 : seul leur état change). Maximum de flèches normales sur 600 bougies : v4 25 → v5 21. Plafond de sécurité 30 : non atteint.

## Contrôles
- Chute du 12 nov. (6 h–19 h UTC) : **0** flèche d'achat verte hors stabilisation.
- **Limite honnête** : un achat vert existe à 11-12 01:00 UTC, clôture 3992 sur 3963–3972 (avant 6 h, début de la chute). Il n'est PAS contre-tendance au sens de la règle : à ce moment la MA200 monte encore (4034 → 4065) parce que le prix venait de passer longtemps au-dessus. Aucune règle supplémentaire n'a été ajoutée pour le retirer.
- Cassure MA200 du 10 nov. : **conservée** (cyan, jamais filtrée).
- Flèches rouges sur le VAH mensuel : **5 nov. conservée (rouge)**. **Conflit de consignes** : celle du **9 nov. 21:00** tombe sous la règle miroir (vente au-dessus d'une MA200 haussière, plus haut plus haut) : elle devient un **point gris**. Je n'ai pas fait d'exception pour la sauver.
- Retournements dans le sens de la tendance conservés : 23 flèches normales.
- Non-repaint : rejeu bougie par bougie identique au chargement complet (test Node, 5 coupes) ; invalidation sans repaint : même flèche avant / après la bougie d'invalidation.

## Flèches v5
| clôture UTC | niveau | sens | état | prix |
|---|---|---|---|---|
| 10-11 23:00 | swing 4183–4186 | achat | normale | 4187 |
| 10-12 05:00 | swing 4200–4206 | vente | POINT GRIS (contre-tendance) | 4197 |
| 10-13 02:00 | swing 4162–4169 | vente | normale puis INVALIDÉE 10-13 03:00 | 4153 |
| 10-13 15:00 | swing 4162–4169 | achat | normale puis INVALIDÉE 10-13 16:00 | 4174 |
| 10-13 18:00 | MA200 | baissier | cyan | 4150 |
| 10-14 14:00 | swing 4104–4112 | vente | normale | 4092 |
| 10-15 06:00 | swing 4143–4157 | vente | normale | 4138 |
| 10-16 04:00 | MA200 | haussier | cyan | 4184 |
| 10-16 10:00 | swing 4193–4200 | vente | POINT GRIS (contre-tendance) | 4179 |
| 10-17 23:00 | swing 4136–4142 | achat | normale | 4152 |
| 10-18 04:00 | MA200 | baissier | cyan | 4161 |
| 10-19 13:00 | swing 4165–4170 | vente | normale | 4161 |
| 10-20 00:00 | swing 4136–4144 | vente | normale | 4133 |
| 10-20 10:00 | swing 4127–4132 | vente | normale | 4114 |
| 10-21 02:00 | swing 4100–4107 | achat | POINT GRIS (contre-tendance) | 4121 |
| 10-21 11:00 | swing 4104–4113 | achat | normale (contre-tendance stabilisée : rsi) | 4128 |
| 10-22 06:00 | Bas de la semaine 4075 | achat | POINT GRIS (contre-tendance) | 4092 |
| 10-25 23:00 | POC hebdo 4001 | achat | normale puis INVALIDÉE 10-26 00:00 | 4007 |
| 10-28 01:00 | MA200 | haussier | cyan | 4065 |
| 10-28 19:00 | swing 4026–4034 | achat | normale | 4038 |
| 10-29 17:00 | swing 4021–4035 | vente | normale | 4017 |
| 10-30 02:00 | MA200 | baissier | cyan | 4003 |
| 11-04 06:00 | MA200 | haussier | cyan | 4001 |
| 11-04 17:00 | VAH hebdo 4067 | vente | normale | 4066 |
| 11-05 04:00 | VAH mensuel 4145 | vente | normale | 4144 |
| 11-08 02:00 | swing 4071–4075 | vente | normale | 4071 |
| 11-08 22:00 | swing 4031–4035 | achat | normale | 4045 |
| 11-09 04:00 | swing 4107–4116 | achat | normale | 4117 |
| 11-09 13:00 | swing 4107–4119 | achat | normale | 4126 |
| 11-09 21:00 | VAH mensuel 4144 | vente | POINT GRIS (contre-tendance) | 4142 |
| 11-10 10:00 | swing 4075–4085 | achat | normale puis INVALIDÉE 11-10 12:00 | 4088 |
| 11-10 17:00 | MA200 | baissier | cyan | 4022 |
| 11-11 14:00 | swing 4022–4033 | achat | normale puis INVALIDÉE 11-11 15:00 | 4038 |
| 11-12 01:00 | swing 3963–3972 | achat | normale | 3992 |
| 11-12 09:00 | swing 3963–3976 | vente | normale | 3932 |

Capture annotée : `fleches-v5.png` (vert / rouge = normales, cyan = MA200, point gris = contre-tendance, gris creux × = invalidée).
