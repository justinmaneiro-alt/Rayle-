# Flèches simples v6 : 2ᵉ touche d'un niveau majeur + raison des points gris (mode Direct)

**Les règles de cette version (96 → 120 bougies, rebond ≥ 1 ATR, zone cassée à 0,3 ATR) ont été choisies en regardant les exemples du vendredi 13 novembre (or H1) : aucune preuve de performance. Repères de lecture, jamais des ordres.** v5 reste scellée et intacte ; v6 est un nouveau module (`fleches-simples-v6.js`). Série Kraken PF_XAUUSD H1 du 14 sept. au 13 nov. 05:00 UTC (1440 bougies).

## Règles ajoutées
1. **Exception « 2ᵉ touche »** : un retournement sur un niveau majeur (trait plein) est considéré comme stabilisé, donc flèche colorée avec notification, même contre-tendance et même si le garde-fou « chute > 5 ATR » s'applique, si le même niveau a déjà eu une confirmation dans les 120 dernières bougies H1, que le prix en est reparti d'au moins 1 ATR (mesuré depuis la clôture de la confirmation précédente), et qu'aucune clôture n'est passée à plus de 0,3 ATR de l'autre côté entre les deux touches. Étiquette : « 2ᵉ touche : double sommet/double creux ». « Même niveau » = même sens et zone qui se recouvre à 0,5 ATR près (la valeur d'un niveau de structure bouge de 1 $ d'une période à l'autre : 4 145 puis 4 144).
2. **« Zone cassée »** : inchangée (clôture à 0,3 ATR de l'autre côté ; une mèche sans clôture ne casse pas).
3. **Raison affichée** : chaque contact du prix avec un niveau majeur qui ne donne pas de flèche colorée = petit point gris foncé (un par bougie, jamais sur une flèche), infobulle avec la raison exacte : bloqué (contre-tendance avec la MA200, garde-fou chute > 5 ATR, zone cassée, cooldown de 24 bougies, trop proche d'une autre flèche, plafond, retest par l'autre côté, traversée, zone de swing pas encore assez touchée) ou « en attente : bougie de confirmation pas encore close ». Aucune notification pour ces points.

## Écart avec la consigne (à valider)
- **Fenêtre de 120 bougies et non 96** : entre la 1ʳᵉ touche (5 nov. 03:00 UTC) et la 2ᵉ (9 nov. 21:00 UTC) il y a **113 bougies H1** (week-end compris : Kraken cote l'or le week-end). Avec 96 la 2ᵉ touche du cas 1 n'est pas débloquée. J'ai donc mis 120 (5 jours) ; c'est le seul paramètre qui change le résultat du cas 1. Pour revenir à 96 : `deuxFenetre` dans `fleches-simples-v6.js`.

## Diagnostic des deux cas
**Cas 1 : double sommet 4 131–4 144 (5 nov. puis 9 nov.)** : la 2ᵉ touche (9 nov. 21:00 UTC, VAH mensuel 4 144) avait un point gris car le **filtre contre-tendance** s'appliquait (clôture au-dessus d'une MA200 haussière, plus haut plus haut). Aucun autre garde-fou n'était en cause. **L'exception la débloque** : le niveau (VAH mensuel 4 145 le 5 nov. à 04:00 UTC) avait fait repartir le prix de 6.6 ATR, sans clôture au-delà de 0,3 ATR de l'autre côté. Elle devient une **vente rouge** (v5 : point gris). Entrée / stop / TP de cette flèche : voir l'infobulle.

**Cas 2 : support du bas (3 880–3 893 ; « Bas du mois » 3 874 ; rebond du 13 nov.)** : **l'exception ne le débloque pas**, pour deux raisons mesurées. (a) La zone de swing 3 880–3 893 (14 touches au total) a été recréée le 13 nov. 01:00 UTC (rôle inversé après la chute) : **1 seule touche vue depuis sa création, la règle des niveaux majeurs en demande 3** ; elle n'était donc pas un niveau majeur au moment du rebond, et n'a jamais produit de flèche. (b) L'exception exige une confirmation précédente sur ce niveau avec un rebond ≥ 1 ATR : la première touche (12 nov. 14:00–18:00) a rebondi de ~16 $ (≈ 0,8 ATR) et, au moment de la chute, le niveau n'était pas encore majeur. Les niveaux de structure « Bas du mois » 3 874 et « Bas de la semaine » 3 884 n'apparaissent dans la liste des niveaux qu'au changement de jour (13 nov. 00:00) et le prix ne les a pas retouchés depuis. **Ce qui change visiblement** : le rebond porte maintenant un point gris avec la raison « bloqué : zone de swing pas encore assez touchée (1 touche vue, 3 requises) » au lieu du silence. Je n'ai pas assoupli la règle des 3 touches pour sauver ce cas (ce serait choisir le réglage d'après l'exemple).

## Compte des flèches (série Kraken, 1440 bougies)
| | cassures MA200 | achats verts | ventes rouges | points gris | invalidées | « 2ᵉ touche » |
|---|---|---|---|---|---|---|
| v5 | 10 | 17 | 17 | 5 | 6 | – |
| v6 sans l'exception (= v5) | 10 | 17 | 17 | 5 | 6 | – |
| **v6** | 10 | 17 | 19 | 3 | 6 | 7 |

Total v5 49 → v6 49 (aucune flèche ajoutée ni retirée : l'exception ne fait que passer des points gris en couleur). **2 point(s) gris passent en flèche colorée** : 10-16 10:00 UTC Résistance 4 193–4 200 · 24 touches 4200 ; 11-09 21:00 UTC VAH mensuel 4144. Contacts expliqués (points gris foncé) : 145. Maximum de flèches colorées sur 600 bougies : v5 27, v6 28.

Raisons des contacts : bloqué : le prix arrive par l'autre côté du niveau (17), bloqué : zone cassée (28), bloqué : cooldown (62), bloqué : trop proche d'une autre flèche (26), bloqué : plafond de sécurité atteint (6), bloqué : zone de swing pas encore assez touchée (5), bloqué : garde-fou chute > 5 ATR en 24 bougies (1).

## Contrôles
- Chute du 12 nov. (6 h–19 h UTC) : **0** achat vert (la 2ᵉ touche ne ramène pas d'achat dans la chute : chaque support n'y est touché qu'une fois).
- Cassure MA200 du 10 nov. 17:00 UTC : conservée (cyan, jamais filtrée). Ventes rouges du 5 nov. conservées ; celle du 9 nov. 21:00 (VAH mensuel) **devient rouge avec l'exception** (point gris en v5).
- Non-repaint : le rendu après n bougies = le début du rendu complet (5 coupes, flux simulé) ; flèches déjà posées jamais déplacées ; cooldown de 24 bougies par niveau et distance de 6 bougies conservés ; une seule marque (flèche ou point) par bougie.
- Tests : `node agent-trading/tests/fleches-simples-v6-test.mjs` (33), `telegram-signal-test.mjs` (21), `suppression-test.mjs` (18), `npm test` complet, Chrome `fleches-v6-chrome.mjs` (1600 / 1024 / 390 px) et `suppression-chrome.mjs` (souris et doigt).

## Flèches v6 (5 → 13 nov.)
| clôture UTC | niveau | sens | état |
|---|---|---|---|
| 11-05 04:00 UTC | VAH mensuel 4145–4145 | vente | normale |
| 11-08 02:00 UTC | Résistance 4 071–4 075 · 10 touches 4071–4075 | vente | normale |
| 11-08 22:00 UTC | Support 4 031–4 035 · 11 touches 4031–4035 | achat | normale |
| 11-09 04:00 UTC | Support 4 107–4 116 · 11 touches · ancienne résistance 4107–4116 | achat | normale |
| 11-09 13:00 UTC | Support 4 107–4 119 · 7 touches · ancienne résistance 4107–4119 | achat | normale |
| 11-09 21:00 UTC | VAH mensuel 4144–4144 | vente | 2ᵉ touche |
| 11-10 10:00 UTC | Support 4 075–4 085 · 18 touches 4075–4085 | achat | invalidée |
| 11-10 17:00 UTC | MA200 | baissier | normale |
| 11-11 14:00 UTC | Support 4 022–4 033 · 27 touches 4022–4033 | achat | invalidée |
| 11-12 01:00 UTC | Support 3 963–3 972 · 11 touches 3963–3972 | achat | normale |
| 11-12 09:00 UTC | Résistance 3 963–3 976 · 7 touches · ancien support 3963–3976 | vente | normale |

Capture annotée : `outils-restructuration/captures/fleches-v6-annotee.png`. Captures Chrome : `fleches-v6-1600.png`, `-1024.png`, `-390.png`.
