# Rapport : d'où venaient les +9,21 R de l'ancien agent, et est-ce que ça tient ?

Étude faite seule le 4 novembre 2026, en autonomie. **Simulation uniquement, aucun ordre réel.** Interface, portefeuille et risque (0,5 %) non touchés. Le moteur et les scripts de l'étude restent hors dépôt (`agent-trading/moteur/etude-ancien/`).

## En bref

- Les +9,21 R de l'ancien agent sont **réels** (je les retrouve au centime sur les bougies Kraken), mais ils viennent de **3 trades** (+8,77 R). Sans eux : +0,43 R sur 19 trades.
- Juste après l'audit, l'ancien agent a encore fermé **10 trades : 10 pertes, −12,05 R**. Bilan complet des 32 trades : **−2,85 R**.
- Rejoué sans retouche sur **4 ans et demi** d'historique Kraken (5 actifs, ≈ 16 000 trades), le signal « balayage puis reprise » **perd** : −0,29 R par trade avant la coupe, **−0,25 R hors échantillon** (IC 95 % −0,30 … −0,19). À l'achat comme à la vente, sur chaque actif, chaque année, dans tous les marchés.
- Même **sans aucun frais**, il fait −0,10 R par trade, alors qu'une entrée au hasard au même moment fait 0,00 R. Le signal n'a **aucun avantage** : il fait pire que le hasard.
- Traduit en concepts v3 (nœud de volume balayé, clôture M15 qui reprend, retournement du volume net, absorption du carnet), il **n'améliore pas** v2 : il n'est **pas mis en marche**. Aucune version (v0, v1, v2, v3) n'est prouvée rentable : l'agent reste en observation **« PAS ENCORE PROUVÉ »**, la stratégie en marche ne change pas.

## 1. Les règles exactes de l'ancien signal

Code archivé : `idees/agents-trading/strategies/trader/moteur.js`, fonction `balayageReprise`. Le moteur décide à la **clôture de chaque bougie M15**.

| Élément | Règle exacte |
|---|---|
| **Niveau balayé** | Un niveau de « liquidité » qui n'avait **jamais été pris** avant : un plus haut / plus bas **M15** (sommet entouré de 4 bougies plus basses de chaque côté), un plus haut / plus bas **H1** (3 bougies H1 de chaque côté), datant de moins de 30 jours, ou le plus haut / plus bas **de la veille**. Pour un achat on cherche un plus bas, pour une vente un plus haut. |
| **Balayage** | Le niveau a été dépassé pour la première fois dans les **3 dernières bougies M15** (la bougie actuelle et les 2 d'avant), d'au moins **0,05 ATR M15** (ATR 14). |
| **Reprise** | La **clôture** de la bougie actuelle est revenue de l'autre côté du niveau (au-dessus d'un plus bas balayé, en dessous d'un plus haut balayé). |
| **Volume exigé** | **Une** des trois preuves suffit : (a) le **delta cumulé** (achats agressifs − ventes agressives) depuis le balayage va dans le sens du trade ; (b) **absorption** : une bougie du balayage a au moins **1,3 × le volume moyen** (50 bougies) et la clôture est dans la moitié favorable de la bougie ; (c) **bougie de rejet** : clôture dans les 40 % favorables de la bougie et bougie de la bonne couleur. |
| **Entrée** | Ordre **limite** : achat à min(clôture − 0,05 ATR ; niveau + 0,15 ATR), vente symétrique. Valable **4 h** (16 bougies) si le niveau est un M15, **8 h** (32 bougies) s'il est H1 / veille. |
| **Stop** | Au-delà de l'extrême du balayage, **+ 0,25 ATR**. Distance minimale : 0,5 ATR, et assez large pour que les frais restent sous 0,22 R. Refusé si plus de 5 ATR et plus de 2,5 % du prix. |
| **Objectif** | Le **prochain niveau de liquidité non pris** dans le sens du trade, à **au moins 1,5 R** et au plus 6 R (sinon pas de trade). La fiche « À COPIER » ne gardait que cet objectif. |
| **Filtres** | Style « équilibré » : au moins **2 confluences** (biais H1/H4, niveau H1 / veille, plus bas égaux, zone de volume, VWAP, delta, absorption, objectif ≥ 2 R) ; 3 propositions par jour et par actif au plus, 2 positions en même temps, jamais deux sens opposés, 8 bougies entre deux signaux identiques. **Aucun filtre de tendance** : c'est un signal de retournement. |
| **Gestion (audit)** | Stop d'abord ; si stop et objectif sont dans la même bougie, le stop compte ; sortie forcée à la clôture après **24 h**. |

Remarque sur « H1 / M15 » : depuis la V8, **toutes** les entrées étaient en M15. L'étiquette « H1 » de l'ancien agent voulait seulement dire « le niveau balayé est un extrême H1 ou de la veille ».

## 2. D'où venaient les +9,21 R

Source : registre local de l'ancien agent (`%LOCALAPPDATA%\Rayle\agent\registre.json` + corrections de l'audit). **L'export D1 demandé (`idees/agents-trading/donnees/d1/kepler_registre.json`) est vide** (0 ligne) : il n'a pas pu servir. Les 22 trades sont ceux fermés avant l'audit du 03/11 à 08:17. Recalcul sur les vraies bougies Kraken M15 (720 dernières), mêmes règles et mêmes frais que l'audit : **+9,21 R, identique au centième.**

| # | Actif | Jour | Signal | Niveau balayé | Preuve de volume | Sens | R:R visé | R | Sortie |
|---|---|---|---|---|---|---|---|---|---|
| 1 | SOL | 30/10 | balayage | H1 | delta | achat | 3,5 | −1,24 | stop |
| 2 | SOL | 30/10 | repli tendance | — | — | vente | 2,2 | −1,17 | stop |
| 3 | BTC | 30/10 | balayage | H1 | absorption | achat | 3,5 | +1,84 | 24 h |
| 4 | DOGE | 30/10 | balayage | H1 | delta | achat | 4,1 | +1,85 | 24 h |
| 5 | SOL | 31/10 | balayage | M15 | rejet | vente | 5,6 | +1,82 | 24 h |
| 6 | BTC | 31/10 | repli tendance | — | — | vente | 1,6 | −1,19 | stop |
| 7 | DOGE | 31/10 | balayage | H1 | delta | achat | 3,3 | +1,86 | 24 h |
| 8 | SOL | 01/11 | repli tendance | — | — | vente | 3,2 | **+3,17** | objectif |
| 9 | BTC | 01/11 | balayage | veille | rejet | vente | 2,5 | −1,19 | stop |
| 10 | DOGE | 01/11 | balayage | veille | delta | achat | 2,2 | +2,08 | objectif |
| 11 | BTC | 02/11 | balayage | H1 | absorption | vente | 1,5 | −1,19 | stop |
| 12 | BTC | 02/11 | repli tendance | — | — | achat | 5,7 | −1,19 | stop |
| 13 | BTC | 01/11 | balayage | M15 | absorption | achat | 2,1 | −0,40 | 24 h |
| 14 | SOL | 02/11 | acceptation hors valeur | — | — | achat | 3,0 | −1,07 | stop |
| 15 | BTC | 02/11 | acceptation hors valeur | — | — | achat | 3,0 | −1,10 | stop |
| 16 | DOGE | 02/11 | balayage | M15 | delta | achat | 2,5 | −1,29 | stop |
| 17 | BTC | 02/11 | balayage | H1 | delta | achat | 1,7 | −1,19 | stop |
| 18 | SOL | 02/11 | balayage | M15 | delta | achat | 2,1 | −1,24 | stop |
| 19 | SOL | 02/11 | balayage | M15 | absorption | vente | 2,5 | +2,42 | objectif |
| 20 | SOL | 02/11 | cassure + retest | — | — | vente | 2,6 | **+2,53** | objectif |
| 21 | DOGE | 02/11 | balayage | veille | delta | vente | 3,2 | **+3,07** | objectif |
| 22 | DOGE | 02/11 | balayage | M15 | absorption | vente | 2,1 | +2,04 | objectif |

(Trades 16 et 22 : l'ancien agent avait le même jour, à la même heure, un achat ET une vente sur DOGE.)

### Répartition

| Groupe | Trades | Total | R moyen | IC 95 % | Réussite |
|---|---|---|---|---|---|
| **Balayage puis reprise** | 15 | +9,23 R | +0,62 | −0,25 … +1,48 | 53 % |
| Repli dans la tendance | 4 | −0,38 R | −0,10 | −2,23 … +2,04 | 25 % |
| Acceptation hors de la zone de valeur | 2 | −2,17 R | −1,08 | — | 0 % |
| Cassure + retest | 1 | +2,53 R | +2,53 | — | 100 % |
| **DOGE** | 6 | **+9,61 R** | +1,60 | +0,41 … +2,79 | 83 % |
| SOL | 8 | +5,23 R | +0,65 | −0,73 … +2,03 | 50 % |
| BTC | 8 | **−5,63 R** | −0,70 | −1,44 … +0,03 | 13 % |
| Achat | 12 | −1,10 R | −0,09 | −0,94 … +0,75 | 33 % |
| **Vente** | 10 | **+10,31 R** | +1,03 | −0,18 … +2,24 | 60 % |
| Niveau H1 / veille (« H1 ») | 11 | +3,71 R | +0,34 | −0,70 … +1,38 | 45 % |
| Niveau M15 | 11 | +5,49 R | +0,50 | −0,60 … +1,60 | 45 % |
| 30/10 | 4 | +1,28 R | | | |
| 31/10 | 3 | +2,49 R | | | |
| 01/11 | 4 | +3,66 R | | | |
| 02/11 | 11 | +1,78 R | | | |
| Sortie au stop | 11 | −13,08 R | | | |
| Sortie à l'objectif | 6 | +15,32 R | | | |
| **Sortie forcée après 24 h** | 5 | **+6,97 R** | | | |

Dans le balayage seul : ventes 6 trades +6,97 R, achats 9 trades +2,27 R. DOGE seul : +9,61 R ; BTC au balayage : −2,15 R.

### Concentration

Les **3 plus gros trades** (SOL +3,17, DOGE +3,07, SOL +2,53) font **+8,77 R sur +9,21 R**. Les 19 autres : **+0,43 R**. Deux des trois ne sont même pas des balayages. Et 5 gains (+6,97 R) sont des sorties « au bout de 24 h », pas des objectifs atteints.

### Témoins (même fenêtre du 30/10 au 02/11, mêmes actifs, mêmes frais, mêmes règles)

| Règle bête | Trades | Total | R moyen | IC 95 % |
|---|---|---|---|---|
| A : à chaque bougie contraire, entrer dans le sens du marché des 24 h | 65 | −41,73 R | −0,64 | −1,00 … −0,28 |
| B : vendre chaque rebond quand le marché baisse sur 24 h | 40 | −18,87 R | −0,47 | −0,95 … +0,01 |
| C : **pile ou face** sur les 15 balayages (même moment, même stop, même R:R visé, sens au hasard, 2 000 tirages) | 15 | médiane **+3,59 R** | | 5 % : −6,70 R · 95 % : +13,47 R |

Le marché était plat sur ces 4 jours (BTC +1,6 %, SOL +0,4 %, DOGE +0,7 %) : les règles bêtes « suivre le marché » perdent. Mais le témoin C dit l'essentiel : **en tirant le sens au hasard**, la même géométrie (stops larges, objectifs lointains, sortie à 24 h) gagne déjà +3,6 R en médiane, et le vrai sens choisi par le signal (+9,23 R) fait mieux que **82 %** des tirages seulement. Ce n'est pas significatif (il faudrait 95 %). **Le mérite propre du signal sur ces 4 jours est faible et non démontré.**

### Ce qui s'est passé juste après

Après l'audit, l'ancien agent a fermé 10 trades de plus (03/11) : **10 stops, −12,05 R** (3 balayages −3,50 R, 5 cassures −6,10 R, 2 replis −2,45 R). Sur ses 32 trades, l'ancien agent finit à **−2,85 R**.

## 3. Le signal tient-il sur tout l'historique ?

**Méthode.** Le code de l'ancien moteur est **importé tel quel** (aucune ligne changée, aucun paramètre réglé, style « équilibré », balayage seul, mêmes plafonds de fréquence). Seules les données changent :

- Bougies **Kraken Futures** M15 (perpétuels, l'historique le plus long disponible chez Kraken) : BTC, ETH, SOL depuis le 23/03/2022, DOGE depuis le 20/06/2022, HYPE depuis le 24/01/2025, jusqu'au 04/11/2026. Contexte H1 et H4 regroupés à partir des M15.
- **Volume net réel** de Kraken (« aggressor-differential ») pour chaque bougie. Attention : Kraken publie (vendeurs − acheteurs) ; je l'ai vérifié (corrélation négative avec le sens des bougies sur les 5 actifs, et signe opposé au volume net enregistré par le moteur sur les mêmes bougies) et **inversé**.
- Exécution : règles de l'audit (entrée remplie seulement si une bougie **suivante** la touche ; annulée si l'objectif passe avant ; stop d'abord ; 24 h au plus). Frais de l'ancien agent (maker 0,024 % à l'entrée et à l'objectif ; taker 0,06 % + demi-spread + glissement au stop et à la sortie forcée). Risque fixe 0,5 % pour la courbe de capital.
- **Coupe fixée avant tout calcul** : calibration = avant le 01/11/2025 ; validation hors échantillon = du 01/11/2025 au 04/11/2026 (12 mois).
- Contrôle : le rejeu retrouve 10 des 15 balayages réels à ±2 h près (le direct lisait les bougies et le delta de Binance, pas de Kraken).

**Résultats.**

| Période | Trades | Total | R moyen | IC 95 % | Réussite |
|---|---|---|---|---|---|
| Calibration (03/2022 → 10/2025) | 11 831 | −3 475 R | −0,29 | −0,32 … −0,26 | 25 % |
| **Validation (11/2025 → 11/2026)** | **4 144** | **−1 017 R** | **−0,25** | **−0,30 … −0,19** | 27 % |
| Validation · achats | 2 131 | −550 R | −0,26 | −0,33 … −0,19 | 27 % |
| Validation · ventes | 2 013 | −467 R | −0,23 | −0,31 … −0,16 | 27 % |
| Validation · ventes en marché baissier (< −5 % sur 30 j) | 788 | −111 R | −0,14 | −0,26 … −0,02 | 29 % |
| Validation · achats en marché haussier (> +5 % sur 30 j) | 678 | −160 R | −0,24 | −0,36 … −0,11 | 28 % |

Par actif en validation : BTC −0,27, ETH −0,19, SOL −0,31, DOGE −0,18, HYPE −0,27 (tous avec un IC entièrement sous 0). Par année : −0,29 (2022), −0,29 (2023), −0,27 (2024), −0,29 (2025), −0,27 (2026). Par niveau balayé (validation) : M15 −0,24, H1 −0,27, veille −0,21. Au risque fixe de 0,5 %, la validation seule mènerait le capital à **−99 %**.

**Est-ce la faute des frais ?** Non. Sans aucun frais, le même rejeu donne **−0,10 R par trade** (IC −0,13 … −0,08). Et le banc lui-même est neutre : des entrées **au hasard** aux mêmes moments, même R:R, sans frais, font **−0,01 R** (IC −0,03 … +0,02). Le signal fait donc **pire que le hasard avant frais**, puis les frais (≈ 0,19 R par trade, stop médian à 0,59 % du prix) l'enfoncent.

**Verdict.** Le signal **ne tient pas**, ni en calibration ni hors échantillon, ni à l'achat ni à la vente, même pas « seulement en marché baissier » (les ventes en marché baissier sont la meilleure case et perdent encore −0,14 R). Les +9,21 R de 4 jours étaient un hasard favorable concentré sur 3 trades. Cela confirme l'ancien backtest archivé (Binance, 12 mois, gestion plus favorable : −0,03 R sur 603 trades, non prouvé), en plus net.

## 4. Intégration dans la stratégie v3

### Ce qu'est v3

La v3 n'existait pas encore : je l'ai écrite comme **v2 + le balayage traduit en concepts v3** (`moteur/strategie-v3.js`, hors dépôt) :

| Ancien agent | v3 |
|---|---|
| Extrême M15 / H1 / veille jamais pris | **Nœud de volume** réellement échangé (support / résistance de v2), ou mur du carnet |
| Pris dans les 3 dernières bougies, ≥ 0,05 ATR | Une **mèche** des 3 dernières bougies M15 traverse le nœud d'au moins 0,05 étendue médiane ; la bougie d'avant clôturait encore du bon côté |
| Clôture revenue de l'autre côté | La **clôture M15 reprend** le nœud |
| Delta cumulé OU absorption (volume) OU bougie de rejet | **Retournement du volume net** (la bougie du balayage poussait contre, la bougie de reprise pousse dans le sens, ≥ 0,5 × le volume net médian) OU **absorption vue dans le carnet** au niveau |
| Entrée min(clôture − 0,05 ATR ; niveau + 0,15 ATR), stop extrême − 0,25 ATR | Identique, en étendue médiane (aucun ATR, aucun indicateur classique) |
| Objectif = prochaine liquidité ≥ 1,5 R | Prochain niveau clé à ≥ 2 R, sinon 2 R (convention v2) ; R:R ≥ 1,5 |

Pas de Volume Profile, pas d'indicateur classique dans la décision. Comme l'original, le balayage est un retournement : il **n'est pas soumis au filtre de tendance** de v2 (choix noté plus bas) ; tous les autres filtres v2 s'appliquent.

### Tableau comparatif honnête

Mêmes bougies Kraken Futures, même volume net, mêmes règles d'exécution (celles de l'audit), **mêmes frais : ceux du nouvel agent** (0,05 % par côté + glissement au stop), même coupe. Chaque version garde ses propres réglages par défaut, rien n'est réglé. Sans carnet passé (il n'existe pas) : aucun mur, aucune absorption, aucun déséquilibre dans le rejeu, pour toutes les versions. v0 = ancien agent (balayage seul) ; v1 = stratégie d'avant la refonte (zone de valeur) ; v2 = stratégie en marche ; v3 = v2 + balayage.

**Actifs du nouvel agent (BTC, ETH, HYPE)** — c'est ce tableau qui décide :

| Version | Trades calibration | R moyen calibration | Trades validation | Total validation | **R moyen validation** | **IC 95 %** | Réussite | Capital à 0,5 % | Statut |
|---|---|---|---|---|---|---|---|---|---|
| v0 | 6 365 | −0,281 | 2 451 | −591 R | **−0,241** | −0,30 … −0,18 | 27 % | −95 % | non rentable |
| v1 | 6 884 | −0,731 | 2 612 | −1 643 R | **−0,629** | −0,70 … −0,56 | 26 % | −100 % | non rentable |
| v2 | 9 155 | −0,510 | 3 494 | −1 340 R | **−0,384** | −0,44 … −0,32 | 29 % | −100 % | non rentable |
| v3 | 8 828 | −0,542 | 3 390 | −1 415 R | **−0,417** | −0,48 … −0,35 | 27 % | −100 % | non rentable |

Les 5 actifs (avec SOL et DOGE) donnent le même classement : v0 −0,229 · v1 −0,562 · v2 −0,346 · v3 −0,397, tous avec un IC entièrement sous 0.

Le balayage dans v3 (validation, BTC/ETH/HYPE) : achats 492 trades −0,54 R, ventes 427 trades −0,67 R. **v3 − v2 = −0,034 R par trade** (IC −0,122 … +0,054) : pas d'amélioration, plutôt l'inverse.

### Décision (règle appliquée telle qu'écrite avant les résultats)

- « La plus rentable hors échantillon est mise en marche » : la moins mauvaise est v0, mais **aucune n'est rentable**, et toutes ont un IC entièrement négatif. **Aucune version n'est prouvée → l'agent reste en observation « PAS ENCORE PROUVÉ ».** La stratégie en marche (v2) **n'est pas changée** et le moteur n'est pas redémarré (passer à v0 ou v3 n'apporterait aucun gain prouvé, seulement du risque).
- **Balayage dans v3 : non gardé.** Il n'améliore pas v2 hors échantillon. Le code reste disponible comme candidat (`strategie-v3.js`, testé), non branché.
- Worker de l'agent **non redéployé** (rien n'a changé côté Worker ni côté affichage).

À noter honnêtement : ce rejeu long dit aussi que **v2, la stratégie en marche, perd** (−0,38 R par trade hors échantillon dans ces conditions d'exécution). Ce n'était pas la question posée, je n'y ai rien changé, mais c'est le résultat le plus important de l'étude pour la suite.

## 5. Choix faits seul (aucune question possible)

1. **Registre** : l'export D1 étant vide, j'ai pris le registre local de l'ancien agent + les corrections de l'audit (mêmes 22 trades, même total).
2. **Historique long** : Kraken Futures (perpétuels) plutôt que Kraken spot, car c'est le seul historique Kraken M15 long **avec volume net réel** (le spot ne garde que 720 bougies). Le nouvel agent trade justement ces perpétuels. L'étape 1 reste sur le spot, comme l'audit.
3. **Signe du volume net** Kraken inversé après vérification (voir § 3).
4. **Coupe** au 01/11/2025 (12 derniers mois en validation), fixée avant le premier calcul.
5. **Exécution commune** = règles de l'audit (les plus prudentes et recopiables), 24 h au plus pour toutes les versions ; les plafonds de fréquence sont ceux de chaque version, appliqués **par actif** (les plafonds « au total » de v2 ne sont pas rejoués).
6. **Coûts** : ceux de l'ancien agent pour l'étape 2 (fidélité) ; ceux du nouvel agent pour le comparatif (mêmes frais pour tous).
7. **Témoins** écrits avant d'être lancés : « suivre le marché 24 h », « vendre chaque rebond en marché baissier », « pile ou face ».
8. **v3** : balayage exempté du filtre de tendance (c'est un retournement ; le filtrer reviendrait à l'interdire). Nœuds de volume « approx » dans le rejeu (pas d'empreintes dans l'historique), comme le fait déjà v2 quand elles manquent.
9. **Décision** : rien n'étant prouvé, la règle la plus sûre est de ne rien mettre en marche ; risque, interface, portefeuille inchangés.

## 6. Limites

- Pas de carnet d'ordres historique : la confirmation « absorption dans le carnet » de v3 (et toutes les confirmations par carnet de v1 / v2) n'est **jamais** rejouée. En direct elle peut ajouter des signaux ; rien ne permet aujourd'hui de dire si elle aide.
- Le direct de l'ancien agent lisait Binance (bougies, delta) : le rejeu sur Kraken ne retrouve que 10 des 15 balayages réels. Sur 16 000 trades et tous les actifs, ces écarts ne peuvent pas inverser un résultat aussi net.
- Frais du financement des perpétuels non comptés (ils ne feraient qu'aggraver).
- HYPE : historique court (depuis janvier 2025).

## 7. Fichiers et commandes (moteur hors dépôt)

- `node agent-trading/moteur/etude-ancien/telecharger.mjs` — historique Kraken Futures dans `%LOCALAPPDATA%\Rayle\agent-trading\historique-long\`
- `node agent-trading/moteur/etude-ancien/autopsie.mjs` — étape 1 (`etude-ancien/autopsie.md` / `.json`)
- `node agent-trading/moteur/etude-ancien/rejeu.mjs <v0|v1|v2|v3> <ACTIF>` puis `analyse.mjs` — étapes 2 et 3 (`etude-ancien/analyse.md` / `.json`)
- `agent-trading/moteur/strategie-v3.js` (candidat, non branché), `strategie-v1.js` (copie de `strategie.avant-refonte.js.bak` pour pouvoir l'importer)
- Tests : `npm test` dans `agent-trading/` (tout passe, dont `moteur/tests/strategie-v3-test.mjs`, 7) ; capture Chrome `moteur/tests/ecran-page-unique.mjs` : 157 vérifications réussies, page inchangée.
