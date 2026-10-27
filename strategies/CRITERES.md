# Critères de validation de l'agent — version 3

Écrits le **2026-10-27, avant toute recherche V3**. Empreinte : `97dff6d2` (fichier lisible par le code : `criteres-v3.json`, source : `criteres-v3.js`).
La version 1 (empreinte `c9995253`) et la version 2 restent intactes : la version 3 les **ajoute**, elle ne les remplace pas.

**Règle d'or : ces seuils ne sont jamais assouplis pour « avoir un résultat ».** Les changer = une nouvelle version (v4), un nouveau jeu final, et la recherche repart de zéro (le compteur de variantes testées, lui, ne baisse jamais).

Unité : **R** = multiple du risque pris sur un trade, **après frais, spread et glissement**.

## Ce qu'une stratégie doit prouver (tout, sinon elle n'est pas validée)

| # | Critère | Seuil |
|---|---|---|
| 0 | **Causalité** : les signaux calculés sur un début de série sont identiques à ceux de la série entière (« poison du futur »). Une stratégie qui triche avec le futur est **rejetée**, même rentable. | 0 écart |
| 1 | **Walk-forward** : blocs de test successifs, paramètres choisis sur l'entraînement **seulement** | ≥ 4 blocs |
| 2 | **Trades hors échantillon** | ≥ 150 (sinon « pas assez de preuves ») |
| 3 | **Espérance nette** hors échantillon | ≥ +0,25 R par trade (v1, conservé) |
| 4 | **Intervalle de confiance** de l'espérance (bootstrap, 5 000 tirages, 95 %) | borne basse > 0 |
| 5 | **Correction du nombre de tests** : Sharpe déflaté avec le nombre **total** de variantes testées depuis le début | ≥ 95 % |
| 6 | **Stabilité** : les réglages voisins (un paramètre décalé d'un cran) sont aussi rentables | ≥ 70 % positifs, médiane ≥ 50 % du meilleur |
| 7 | **Compte prop** simulé (10 000 $, 1 % de risque par trade) : creux maximal, mesuré depuis le plus haut de l'équité | ≤ 6 % |
| 8 | **Compte prop** : pire journée | ≤ 3 % |
| 9 | **Régimes** : espérance positive dans au moins 2 des 3 régimes (hausse, baisse, range) ayant ≥ 20 trades | ≥ 2 |
| 10 | **Actifs** : positif sur au moins 2 des 3 (BTC, SOL, DOGE ; ≥ 40 trades chacun) **ou** limité à un seul avec une preuve plus solide (déflaté ≥ 99 % et borne basse ≥ +0,1 R) | voir ci-contre |
| 11 | Autres critères v1 : facteur de profit ≥ 1,3, creux ≤ 12 R, Monte Carlo (creux 95e centile ≤ 20 R), part du meilleur trade ≤ 35 %, trimestres positifs ≥ 60 %, 0,2 à 5 positions par semaine | voir `planetes/mars/pc/agent-btc/criteres.js` |
| 12 | Objectif v2 : +20 R net sur ≥ 150 trades hors échantillon | v2, conservé |

Le **jeu final** (derniers 25 % de l'historique) n'est ouvert qu'**une seule fois** par stratégie, avec les paramètres figés (v1 et v2, inchangés). Il n'est jamais ouvert par la recherche courante.

## Après la validation en backtest : la simulation en direct

Une stratégie « **validée en backtest** » n'est pas « rentable demain ». Avant d'envoyer la moindre alerte d'**entrée** réelle, elle passe une **simulation en direct** sur un compte simulé de 10 000 $ :
**au minimum 4 semaines ou 30 trades** (le plus long des deux), sans dérive. Pendant cette phase, les alertes sont marquées **« SIMULATION »**.

Ensuite, le suivi permanent compare le réel au backtest (dérive de type CUSUM) : si la stratégie s'écarte significativement, l'agent la **met en pause** et le dit.

## Rythme

Réaliste : **1 à 5 positions par semaine**. Si le moteur en propose plus de 8 par semaine, il est jugé trop permissif et doit se resserrer. Une semaine sans setup vaut 0.

## Si rien ne passe

« **Aucune stratégie validée pour l'instant. Preuves insuffisantes.** » L'agent affiche le nombre de variantes testées et continue de chercher. C'est un résultat honnête, pas une panne.

*Les résultats passés ne garantissent rien. Aucun ordre n'est exécuté.*
