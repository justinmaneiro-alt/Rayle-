# Agent de trading : page unique, backtest 7 jours, grandes positions (2026-11-04)

Mission autonome, SIMULATION uniquement. Rien de ce qui marchait n'a été supprimé : calcul du portefeuille, prix unique, Rayle (voix, intelligence) non touchés. Worker principal « rayle » et ses secrets non touchés ; le Worker de l'agent n'a pas eu besoin d'être redéployé (voir plus bas).

## A. Une seule page qui défile (PC, tablette, téléphone)

- `front/vue.js` réécrit : plus aucun onglet ni sous-menu. En-tête fixe (6 actifs avec prix live, **capital live au centime**, badge de statut, voyant « ● en direct »), puis UNE zone qui défile (`.at-defil`, la page de Rayle ne bouge pas).
- **PC** (≥ 1000 px ET paysage) : écran 1 = graphique 68 % (M15/H1, volume net, profil) + narration du carnet dessous | carnet complet 32 % de même hauteur (défilement interne, « ⌖ Centrer ») + « Grosses transactions ». En défilant : Positions en cours · Historique · Performance du portefeuille · Backtest 7 jours · Journal du bot.
- **Téléphone / tablette en portrait** : une colonne, graphique ≈ 60 % de l'écran → narration → carnet compact → grosses transactions → positions → historique → portefeuille → backtest → journal. Les 6 actifs de l'en-tête sont sur une grille (pas de bande qui défile). Positions en **cartes** ; tableaux (historique, catégories) qui s'**empilent** sous 900 px (requête de conteneur) : jamais de défilement horizontal.
- **Plein écran** (bouton ⤢, touche F sur PC) : API plein écran sur la zone du graphique, repli en superposition CSS ; on garde M15/H1, le choix de l'actif (liste), le prix live, les positions en petits traits et un bouton « Quitter » bien visible ; sur téléphone : verrouillage paysage tenté + « Tournez le téléphone en paysage… ». Échap, le même bouton ou « retour » (entrée d'historique ajoutée) ramènent à la page **à la même position de défilement**. Dans la fenêtre de Rayle, Échap quitte d'abord le plein écran sans fermer la fenêtre.
- **Corrections de la capture 1904 px** : la fenêtre PC (`fenetre-agent.js`) ne dépasse jamais l'écran (largeur ≤ 96 % de la zone visible, `max-width:100vw`, redimensionnement borné) et passe en mode `auto` (page unique PC) ; vue par défaut **120 dernières bougies + 12 de marge à droite** (boutons « 120 bougies » et « Tout voir »), glisser et zoomer restent libres ; étiquettes du profil **courtes** (VAH, POC, VAL, « mixte », « approx. », suffixe « ·IA ») et **espacées de 14 px au moins**, y compris avec les niveaux/zones de l'IA (`espacer`, colonnes communes < 130 px).
- **Positions sur le graphique** : 3 petits traits (entrée, SL, TP) + étiquettes en **texte seul** avec un léger contour sombre — plus aucun rectangle de couleur. ACHAT bleu, VENTE orange (jetons existants). Badge « GRANDE » dans l'étiquette.

## B. Backtest « 7 derniers jours »

- `moteur/backtest7j.js` (calcul) + `moteur/backtest7j-fil.js` (lancé dans un fil séparé : ≈ 5 s de calcul, le moteur ne se fige pas). Lancé 90 s après le démarrage, toutes les 6 h et après chaque mise à jour de l'historique des échanges ; **publié dans l'état lent** → mêmes exemples et mêmes chiffres sur PC, tablette et téléphone.
- Mêmes règles que le direct : facteurs, candidats (normaux + GRANDE), filtre anti-bruit, règles dures (1 par actif, 3 au total, jamais deux sens opposés, pause de 4 bougies après clôture, maximum de propositions par jour), taille au risque fixe 0,5 % (même fonction `taille` que le registre, plafond de levier compris), remplissage par bougie avec SL avant TP, frais 0,05 % par côté + glissement. Capital séparé (10 000 $) : ne touche jamais au registre ni au portefeuille live (testé).
- Affiche les **3 DERNIERS signaux terminés dans l'ordre du temps** (jamais les meilleurs) : actif, sens, badge, heure, entrée/SL/TP, résultat réel en R et en $, risque, phrase « pourquoi ». Puis « Sur 7 jours : N signaux, X gagnants, Y R au total (frais inclus) » + « Échantillon trop petit pour conclure » si N < 20, et le détail normales / grandes.
- Un clic sur un exemple : la page remonte, le graphique passe sur l'actif et le moment, la position est dessinée en petits traits « REJOUÉ » (bandeau « REJOUÉ, pas réel » avec « Masquer »).
- **Données utilisées** (écrites sur la page) : bougies M15 / H1 Kraken Futures (OHLC + volume total) ; volume net réel enregistré par le moteur (bougies « complet ») ; volume net et profil reconstruits depuis **l'historique PUBLIC des échanges Kraken Futures** (`/api/history/v3/market/<symbole>/executions`, côté de l'ordre preneur = agresseur), seulement pour les bougies M15 **entièrement couvertes** par des pages enchaînées sans trou (`moteur/echanges.js`, 8 jours, mise à jour toutes les 3 h, stockés dans `%LOCALAPPDATA%\Rayle\agent-trading\echanges\`).
- **Ce qui manque** (écrit sur la page) : carnet d'ordres passé (n'existe pas → ni mur ni confirmation par le carnet), événements d'absorption, avis de l'IA, financement des perpétuels ; bougies sans volume net (ni moteur, ni historique complet) laissées SANS volume net — jamais inventé (testé).
- Résultat réel au 2026-11-04 08:20 (Paris) : **32 signaux, 9 gagnants, −5,58 R au total (frais inclus), −218,93 $** ; normales 28 (9 gagnants, −3,12 R), grandes 4 (0 gagnant, −2,45 R) ; 14 entrées jamais touchées. Couverture : 2 684 bougies M15 (4 actifs), 168 avec volume net du moteur, 2 450 reconstruites depuis l'historique des échanges, 66 sans volume net (surtout l'or : marché fermé, aucune exécution).

## C. Risque fixe et grandes positions

- **Risque fixé à 0,5 %** du capital réalisé pour toutes les positions : `RISQUE_FIXE_PCT` dans `moteur/config.js`, un `reglages.json` ne peut plus le changer (testé). Le plafond de levier existant (×5) peut seulement le RÉDUIRE (ex. or avec un stop très serré : 39,54 $ au lieu de ~50 $) — jamais l'augmenter. Affiché sur chaque carte de position, dans l'historique, dans le portefeuille (« Risque par trade fixé à 0,5 % (50,32 $) »), dans la carte plein écran et sur Telegram.
- **Catégorie « GRANDE »** (`candidatGrande` dans `moteur/strategie.js`), en plus des stratégies existantes, qui passent **toujours en premier** (la grande n'est prise que si aucune normale ne passe : une chance de plus, pas un filtre de plus). Conditions : gros mouvement en cours (≥ 0,6 × la distance calibrée sur les 4 dernières bougies, dernière bougie dans le sens) ; volume net fort et soutenu (cumul des 4 dernières ≥ 2 × la médiane, 3 sur 4 dans le sens, la dernière aussi) ; cassure confirmée de VAH / VAL / POC (franchi dans les 4 dernières bougies, 2 dernières clôtures au-delà) ; aucun mur du carnet en face (filtre existant) ; H1 dans le même sens (structure, sinon 2 clôtures H1 dans le sens). Entrée M15 sur un petit repli (0,25 étendue), stop de l'autre côté du niveau cassé ou d'un mur du carnet qui protège (+ 0,4 étendue, jamais à moins de 0,8 étendue de l'entrée), objectif = max(2,5 R, distance calibrée) ; R:R ≥ 2,5. Les règles existantes s'appliquent telles quelles (jamais deux sens opposés, 1 par actif, 3 au total, pause, décision à la clôture M15).
- **Seuil retenu** (distance typique parcourue en 4 à 6 bougies M15 = médiane de (plus haut − plus bas) sur 4, 5 et 6 bougies, moyenne des trois, sur les 30 derniers jours, 2 880 bougies, recalculé toutes les 6 h) : **BTC 0,45 % (≈ 347 $), ETH 0,62 % (≈ 14,2 $), HYPE 0,95 % (≈ 0,81 $), OR 0,23 % (≈ 9,2 $)**. Remarque : pour l'or, les week-ends (marché fermé, bougies plates) tirent la médiane vers le bas.
- Badge « GRANDE » / « normale » sur le graphique, les cartes, l'historique (et le CSV : colonne `categorie`), le journal, la carte plein écran et Telegram (« NOUVELLE GRANDE POSITION · risque 52 $ », « ENTRÉE TOUCHÉE · GRANDE », « SORTIE GRANDE »).
- **Suivi séparé** (`performance.parCategorie`) : nombre, R moyen, % gagnants, R total, statut RENTABLE / PAS ENCORE PROUVÉ / NON RENTABLE par catégorie (tableau dans « Performance du portefeuille », info-bulle sur le badge de statut). Adaptation des grandes (`adaptation.adapterGrande`) seulement si NON RENTABLES, ≥ 30 trades réels, 1 fois par semaine au plus, réglage choisi sur 70 % des signaux suivis et validé sur les 30 % hors apprentissage ; seul le seuil de volume net soutenu peut bouger ; rentables ou pas encore prouvées : rien ne change. L'adaptation des normales reste la même (jugée sur les normales seules).

## Vérification

- `npm test` (agent-trading) : tout passe — front 15, phase 1 10, rejouer 1, phase 2 10, phase 3 13, phase 5 1, prix unique 1, **grandes positions et backtest 7 jours 14** (risque 0,5 % grandes = normales, `reglages.json` sans effet, aucune position en sens opposé, limites 1/3/pause, étiquette GRANDE Telegram, backtest sans données inventées, 3 DERNIERS dans l'ordre du temps, registre live intact, suivi séparé, adaptation prudente).
- Chrome (`moteur/tests/ecran-page-unique.mjs`, relais `relais-page.mjs` nourri par le vrai moteur, backtest réel) : **157 vérifications, 0 échec** — PC 1600 et 1904 (démo + VRAIE fenêtre de Rayle), tablette 1280, téléphone 384 : aucun défilement horizontal, aucun élément coupé (en-tête, outils, cartes, axe des prix), étiquettes ≥ 14 px, aucun onglet, vue 120 bougies + marge, plein écran (bouton, F, Échap, « retour », position de défilement gardée, Échap ne ferme pas la fenêtre), ordre des sections sur téléphone, graphique ≈ 60 % de l'écran, exemple du backtest → graphique + traits REJOUÉ, **même capital au centime sur PC / tablette / téléphone pour le même état numéroté**, aucune erreur console. Captures : `moteur/tests/captures/page-*.png` (hors dépôt).
- Tests Chrome de Rayle mis à jour (plus d'onglets) : `tests-navigateur/agent-trading-entrees-test.mjs` 3/3, `agent-trading-pc-test.mjs` 18/18.

## Déploiement

- Moteur redémarré (arrêt par son numéro de processus, relancé par le superviseur) : il publie le backtest (état lent ≈ 49 Ko, sous la limite de 128 Ko d'une valeur du Durable Object) et est connecté au Worker de l'agent.
- **Aucun déploiement de Worker** : le relais `rayle-agent-trading` transmet tout message du moteur tel quel ; rien à changer. Worker principal « rayle » non touché.
- Le moteur reste hors dépôt (`.gitignore`), comme avant.

## Choix faits seul

1. Volume net du backtest reconstruit depuis l'historique public des échanges Kraken (il porte le côté de l'agresseur : ce sont des données réelles, pas une estimation), seulement pour les bougies entièrement couvertes ; sinon rien.
2. « 3 derniers signaux » = les 3 derniers **terminés** (stop, objectif ou entrée jamais touchée), pour pouvoir montrer un résultat réel ; ceux encore en cours sont comptés à part.
3. N du total = tous les signaux (entrées jamais touchées comprises, à 0 R), écrit en clair (« dont 14 entrées jamais touchées »).
4. Grande position seulement si AUCUNE normale ne passe sur la même bougie (« une chance de plus »).
5. Plafond de levier conservé : il peut réduire le risque sous 0,5 %, jamais l'augmenter.
6. Disposition PC dès 1000 px en paysage (tablette 1280 en paysage = PC ; en portrait = colonne).
7. Positions en cours en cartes (jamais de tableau large sur téléphone) ; historique en tableau qui s'empile.
8. Calcul du backtest dans un fil séparé (worker_threads) pour ne pas figer le moteur 5 s.
9. Tableaux et calculs : le front n'en recalcule aucun, comme avant.

## Pas vérifié

- Vrai téléphone et vraie tablette (API plein écran et verrouillage paysage réels, geste « retour » d'Android).
- Une GRANDE position en direct (aucune n'est encore apparue ; 4 dans le rejeu de 7 jours).
- Le résultat du backtest change toutes les 6 h : les chiffres ci-dessus sont ceux du 2026-11-04 ≈ 08:20.
