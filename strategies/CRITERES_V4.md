# Critères de validation — version 4 « équilibrée »

**Décision de Justin, le 2026-10-29** : Kepler doit lui apporter des positions concrètes chaque jour (achat en bas, vente en haut, sur BTC, SOL et DOGE, en M15 et H1), même quand la preuve statistique complète n'est pas encore là, **à condition d'être totalement honnête sur le niveau de preuve**. Il autorise à revoir les filtres.

Écrits le 2026-10-29, **avant toute mesure des agents de positions**. Empreinte : voir `criteres-v4.json` (source : `criteres-v4.js`).
Les fichiers de la version 3 (`criteres-v3.json`, `CRITERES.md`, empreinte `c9b4ddd4`) et de la version 1 (`c9995253`) **ne sont pas modifiés**. La v4 s'ajoute : un réglage « Niveau de preuve : strict (v3) / équilibré (v4) » choisit lequel s'applique ; **équilibré est le défaut** (demande de Justin). Chaque résultat affiche la version utilisée.

Unité : **R** = multiple du risque pris sur un trade, après frais, spread et glissement.

## Deux niveaux

| Niveau | Ce qu'il autorise | Critères |
|---|---|---|
| **Idée non testée** | rien (affichée seulement si tu l'actives) | moins de 20 trades mesurés |
| **Testée : non concluante** | rien : on l'affiche comme une idée | assez de trades mais les critères Candidate ne sont pas atteints |
| **Candidate (en observation)** | **simulation en direct seulement**, aucune alerte d'entrée « validée » (alerte « Observation (non validé) » si tu l'actives) | espérance après frais ≥ **+0,08 R** ; ≥ **100 trades** hors échantillon ; positive sur au moins **2 périodes distinctes** (≥ 20 trades chacune) ; **frais doublés** : espérance toujours ≥ 0 ; contrôles de l'**Auditeur** passés (aucune fuite du futur…) |
| **Validée** | alertes d'entrée **après** la phase de simulation en direct (4 semaines ou 30 trades, déjà existante) | espérance après frais ≥ **+0,12 R** (au lieu de +0,25 R) ; borne basse de l'**intervalle de confiance à 95 % > 0** (bootstrap) ; **Sharpe déflaté ≥ 95 %** avec le **nombre effectif d'essais** ; ≥ **150 trades** hors échantillon (ou ≥ 100 + 4 semaines de simulation positives) ; walk-forward positif ; creux ≤ 6 %, pire journée ≤ 3 % ; **jeu final (6 derniers mois) ouvert une seule fois** ; **rapport écrit de l'Auditeur** |

Le niveau **strict (v3)** reste sélectionnable : un seul niveau (« Validée »), +0,25 R, et le Sharpe déflaté avec **toutes** les variantes comptées comme indépendantes.

## Pourquoi +0,12 R (et pas +0,25 R)

- Avec 150 à 260 trades, le test de confiance (borne basse du bootstrap > 0) exige déjà à lui seul une espérance d'environ **+0,15 R** (l'écart-type d'un trade à 2 de rapport gain/risque est d'environ 1,4 R ; à 150 trades l'erreur sur la moyenne est d'environ 0,11 R). Le seuil de +0,25 R était donc à peu près **deux fois trop sévère** par rapport à ce que le test statistique demande déjà : il rejetait des stratégies que la statistique ne rejetait pas.
- Le vrai blocage n'était pas ce seuil mais la **correction des essais multiples** : des milliers de variantes presque identiques étaient comptées comme des essais indépendants, ce qui relève artificiellement la barre. La v4 compte le **nombre effectif d'essais** (les variantes dont les rendements journaliers sont corrélés à 0,8 ou plus comptent pour un). Les seuils (95 % de Sharpe déflaté) ne changent pas ; seul le N du calcul devient juste. Vérifié sur des rendements purement aléatoires : voir `docs/FAUX_POSITIFS.md` (limite 5 %).
- Ce que ça implique : **plus de stratégies passent, avec plus de variabilité par trade**. À +0,12 R par trade, une série de 10 trades peut très bien finir négative. Le niveau Validée dit « l'avantage est probablement réel », pas « chaque trade gagne ». C'est pour cela que le jeu final, l'Auditeur et la simulation en direct restent obligatoires.

## Honnêteté

- Aucun gain garanti. Tout « % par semaine » est donné avec une **fourchette** et une probabilité, avec la mention « estimation à partir du passé, pas une promesse ».
- Une stratégie n'est jamais choisie parce qu'elle est belle sur le passé sans preuve hors échantillon.
- Le compteur de variantes testées ne baisse jamais.
- Aucun ordre réel : paper trading et alertes uniquement.

*Les résultats passés ne garantissent rien. Aucun ordre n'est exécuté.*
