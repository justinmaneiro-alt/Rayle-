# Stratégie Rayle v1 — document de référence

**Version** : `strategie-rayle-v1` · figée le 2026-11-11 · l'empreinte SHA-256 de ce fichier est dans `STRATEGIE-RAYLE.sceau.json` (posée AVANT l'affichage et AVANT les statistiques ; fins de ligne normalisées).

> **Honnêteté d'abord.** Aucune règle automatique n'a prouvé un avantage sur l'or (voir les rapports locaux `RAPPORT-RECHERCHE-OR.md`, `RAPPORT-STRUCTURE-OR.md`, `RAPPORT-SCHEMAS-OR.md`, `RAPPORT-ICT-OR.md`). Cette stratégie est **en observation** : c'est un OUTIL de lecture, pas un agent. Rayle décrit, calcule, dessine et mesure. Il ne dit jamais d'acheter ni de vendre, ne passe aucun ordre, ne promet aucun gain. « Scénarios, pas prévisions. »

## 1. Philosophie

Lire **où** et **quand** le prix peut se retourner, et **ne rien faire au milieu**. Au milieu d'une plage, loin d'une zone, sans événement sur la moyenne mobile, sans pression visible dans le carnet : la bonne lecture est « pas de contexte ». La stratégie ne cherche pas à trouver plus de signaux ; elle cherche à n'en afficher qu'un petit nombre, chacun accompagné de sa fréquence réelle mesurée, de l'effectif `n` et de la valeur du hasard à côté.

Trois idées simples :
1. **Où** : quelques zones fortes (confluence de plusieurs niveaux) au-dessus et en dessous du prix. Jamais plus de deux de chaque côté.
2. **Quand** : un événement à la clôture H1 sur la moyenne mobile, et/ou une réaction du prix dans la zone.
3. **Qui pousse** : la lecture du carnet d'ordres et du flux exécuté quand le prix arrive sur une zone (information, jamais un déclencheur).

## 2. Conventions communes (toutes les définitions)

- Bougies **H1 closes** uniquement (Kraken PF_XAUUSD en direct ; Dukascopy XAU/USD pour les statistiques). Heure de Paris à l'affichage. Une bougie en cours n'est jamais utilisée.
- **ATR** = ATR(14) de Wilder en H1 à la clôture de la bougie considérée (celui de `structure-marche-v1`).
- **Aucun repaint** : tout objet est posé à la clôture de la bougie H1 qui le produit, daté ; il ne change jamais ensuite. Si une situation évolue, l'ancien état reste visible, **grisé**, avec sa date d'invalidation. Testé sur des centaines de préfixes de séries.
- **Statistiques** : Dukascopy XAU/USD, H1, **18 derniers mois ET 2015–2025, séparément**, comptées depuis la **clôture de la bougie de confirmation incluse**, intervalle de confiance de Wilson à 95 %, effectif `n`, comparaison au **taux de base** (même mesure sur toutes les bougies, même sens). `n < 30` = « pas assez de données ». Les mots « fort » ou « probable » ne sont écrits que si la borne basse de l'intervalle dépasse la base de plus de 5 points sur les DEUX fenêtres ; sinon « possible » ou le chiffre seul.
- Toute règle nouvelle est figée (SHA-256) **avant** son affichage et ses statistiques. Les définitions déjà scellées (`structure-marche-v1`, `zones-affichage-v1`, `schemas-retournement-v1`, `ict-v1`) ne sont jamais modifiées.

## 3. Moyenne mobile (`ma-evenements-v1`)

MA = **SMA 200 des clôtures H1** (option « Jour » : SMA 200 des clôtures journalières du jour de marché, utilisée seulement à partir du jour suivant). Le côté du prix = signe de (clôture − MA). Quatre événements, posés à la clôture H1 :

| Événement | Définition exacte | Mention |
|---|---|---|
| **Cassure** | la clôture passe de l'autre côté de la MA avec un écart ≥ **0,25 ATR** | « Cassure (à confirmer) » |
| **Vraie cassure** | dans les **6** bougies suivantes : un retest (la mèche touche la MA par l'autre côté) qui **tient en clôture**, OU **3 clôtures consécutives** au-delà (comptées après la bougie de cassure) | « Cassure confirmée » |
| **Fausse cassure / réintégration** | dans les 6 bougies suivantes, une clôture de **retour du côté d'origine** (testée avant la confirmation à chaque bougie) | « Fausse cassure, réintégration » |
| **Rebond** | un extrême à **≤ 0,25 ATR** de la MA, puis une clôture à **≥ 0,5 ATR** de la MA dans les **3** bougies suivantes, **sans clôture de l'autre côté** entre-temps | « Rebond sur la MA » |

Après 6 bougies sans issue, la cassure est « non tranchée » (expirée). Un rebond n'est compté qu'une fois par épisode.

**Classification** de chaque cassure à sa clôture (six caractéristiques, classes fixes) : corps en ATR (< 0,6 ; 0,6–1,2 ; > 1,2), volume de ticks relatif à la médiane des 50 bougies précédentes (< 0,8 ; 0,8–1,3 ; > 1,3), extension avant la cassure = plus grand écart à la MA sur les 24 bougies précédentes en ATR (< 1,5 ; 1,5–3 ; > 3), pente de la MA sur 10 bougies en ATR dans le sens de la cassure (contre < −0,05 ; plate ; avec > +0,05), alignement H4 (tendance H4 de `structure-marche-v1` dans le sens de la cassure, contre, neutre), session UTC (Asie 00–07, Londres 07–13, New York 13–21, soir 21–24). Pour chaque classe seule et chaque paire de classes : **fréquence mesurée de continuation** = +2 ATR avant −1 ATR dans les 12 bougies suivantes, depuis la clôture de la cassure, contre la base (même mesure sur toutes les bougies, même sens), affichée à côté de l'étiquette : « Cassure confirmée · continuation 44 %, n = 52 ».

**Test de gestion** : « rebond sur MA » et « fausse cassure / réintégration » avec une gestion identique (stop 1,5 ATR, passage à l'équilibre après +1 R, stop suiveur 3 ATR, frais Kraken et frais CFD) contre 1 000 entrées au hasard, achats et ventes séparés. Verdict franc : avantage ou non.

## 4. Boîtes de retournement (`boites-v1`)

- **Niveaux candidats** : swings H4 (fractales de 5 sur H4 agrégé), haut/bas de la veille et de la semaine précédente (jour de marché), niveaux de volume (POC, VAH, VAL, nœuds du profil de volume H1 sur 5 jours de marché).
- **Confluence** = nombre de niveaux de natures différentes dans une fenêtre de ±0,3 ATR. Une boîte exige **confluence ≥ 2**.
- **Probabilité mesurée de retournement** = fréquence à laquelle, une fois le prix à ≤ 0,25 ATR de la zone, il atteint **+1 ATR dans le sens du retournement avant −1 ATR de cassure** (12 bougies), mesurée sur l'historique Dukascopy pour la même classe de confluence ; boîte affichée si **probabilité ≥ 50 %** et **n ≥ 15**.
- **Affichage** : au plus **2 boîtes au-dessus** et **2 en dessous** du prix, à **≤ 4 ATR** ; sinon « Pas de zone forte à proximité ». Petite boîte semi-transparente à fine bordure rouge (vente) ou verte (achat), du début de la zone à **40 bougies** à droite au plus, ou jusqu'à l'**invalidation** (clôture H1 au-delà de **0,25 ATR**), hauteur ≤ 0,3 ATR, **une seule étiquette** « Zone de vente · 60 % · n = 20 », prix exact en trait fin. Jamais de rectangle pleine largeur ; aucune étiquette ne chevauche une autre.
- **Ligne de retournement** : une seule ligne au dernier creux (ou sommet) protégé de la structure H1 : « Retournement baissier si clôture H1 sous 4 040 ». Seules les **3 dernières** cassures MSS/BOS sont étiquetées (étiquettes courtes).
- **Bandeau d'état** : tendance H1/H4, ligne de retournement, prochaine zone et distance, mouvement en cours.
- **Mode Épuré (par défaut)** : au plus 12 objets visibles (hors bougies et MA). Bouton « Épuré / Complet » collé au graphique.

## 5. Lecture du carnet à l'arrivée sur une boîte (`carnet-lecture-v1`)

Déclenchée quand le prix est à **≤ 0,25 ATR** d'une boîte ou dedans (Kraken PF_XAUUSD, direct). Mesures : déséquilibre du carnet dans **±0,3 ATR** du prix ; plus gros mur et sa taille relative à la médiane des niveaux ; **flux exécuté** (delta des transactions agressives sur 1 et 5 minutes) ; persistance des murs sur **30 secondes** (mur retiré = signalé) ; absorption (gros volume exécuté sans déplacement). Verdict d'une phrase, toujours accompagné de « lecture en observation, non validée » tant qu'il y a moins de **30 cas** par classe. Enregistreur **forward** daté, en ajout seul : à chaque arrivée, déséquilibre, delta, mur, verdict, puis le résultat à **6, 12 et 24** bougies H1. Rapport local : la lecture sépare-t-elle les retournements des cassures (IC, n) ?

## 6. Feuille de décision (`feuille-decision-v1`)

Cinq conditions, vertes ou grises : (1) événement sur la MA, (2) prix dans une boîte forte, (3) pression du carnet dans le sens de la boîte, (4) tendance H1/H4 alignée **ou** changement de caractère confirmé, (5) place jusqu'à la zone suivante ≥ **2 R** pour un stop d'au moins **1 ATR**. Affichage « k / 5 conditions réunies ». Au milieu : « Pas de contexte ». **Information seulement.** Le journal enregistre l'état des 5 conditions à la pose d'une position ; un rapport local dira, avec assez de trades, lesquelles comptent.

## 7. Scénarios dessinés (`scenarios-v1`)

Recalculés **uniquement à la clôture de chaque H1**, figés jusqu'à la suivante.
- **Cône de volatilité** : amplitude réelle sur 24, 72 et 120 bougies H1 (percentiles 50 % et 80 %, par régime de volatilité = tercile de l'ATR relatif des 250 dernières bougies).
- **Probabilités de premier passage** : pour un niveau haut à distance `a` et un niveau bas à distance `b` (en ATR H1), fréquence empirique « le haut est touché avant le bas », par classes de distance, état de tendance H1/H4 et position vs SMA200 ; **toujours comparée au hasard `b/(a+b)`**, les deux affichées ; « écart non net » dit quand l'intervalle contient le hasard.
- **Génération** : horizon 1 jour (24 bougies), 3 jours (72) ou 1 semaine (120). 1 à 2 scénarios : **A** (continuation de la structure) et **B** (retournement ou opposé), avec points de passage, condition de déclenchement en clôture H1, cible, invalidation, durée typique mesurée, probabilité de premier passage et valeur du hasard. Le contexte non validé (carnet, delta, annonces) est affiché **à part**, jamais intégré à la probabilité.
- **Dessin** : lignes pointillées fines depuis la dernière bougie vers la droite, flèche d'arrivée, une couleur par scénario, étiquette « Scénario A · 52 % (hasard 47 %, n = 38) », condition et invalidation en petit ; 2 scénarios au plus en Épuré ; l'ancien tracé est archivé, pâle, daté.
- **Suivi forward** en ajout seul : « réalisé », « invalidé » ou « expiré » à l'échéance ; panneau « Fiabilité des scénarios » (courbe de calibration, score de Brier, par horizon) ; `n < 30` = message honnête.

## 8. Gestion et risque (compte prop : 10 000 $)

- **Gestion** : stop d'au moins 1 ATR derrière la zone ; **passage à l'équilibre après +1 R** ; **jamais de moyenne à la baisse** (pas d'ajout à une position perdante) ; pas d'entrée au milieu (feuille de décision « Pas de contexte »).
- **Compte prop** : capital 10 000 $, **perte journalière maximale 3 %** (300 $), **perte totale maximale 6 %** (600 $). Le garde-fou existant (`gardien-*`, `risque-prop-*`) reste la référence ; la taille d'une position se déduit du stop pour qu'une perte à l'invalidation reste très inférieure à ces plafonds.

## 9. Ce qui est mesuré, ce qui ne l'est pas encore

**Mesuré** (Dukascopy, `n`, IC, base) : événements de la MA et classification des cassures ; probabilité de retournement des boîtes par classe de confluence ; probabilités de premier passage ; amplitude réelle des cônes.
**Mesuré seulement en direct, à partir de maintenant** (registres forward, sans historique) : lecture du carnet et du flux, feuille de décision, fiabilité des scénarios.
**Pas mesuré** : tout ce qui touche le carnet sur l'historique (aucun historique de carnet gratuit), les annonces économiques dans les probabilités, le rôle de chacune des 5 conditions (attend assez de trades au journal).

## 10. Mention finale

Aucune règle automatique n'a prouvé un avantage ; cette stratégie est **en observation**. Les chiffres affichés décrivent le passé, avec leur incertitude. Rayle est un outil de lecture : la décision et le risque restent à Justin.

## Annexe — précisions d'implémentation et résultats mesurés (ajoutée le 2026-11-11, après la construction)

Les définitions des §3 à §7 ci-dessus n'ont pas changé. Cette annexe précise des points que le texte laissait ouverts et reporte les mesures ; la version initiale du document (avant l'annexe) avait pour SHA-256 `e87a7a27c3c84a2e6b6658183f7d782415bd3ecf36e69ce68e551a6ee3cb33de` ; chaque module de calcul est scellé séparément (`*.sceau.json`) AVANT son affichage et ses statistiques.

**Précisions.**
- Données historiques : les bougies plates de week-end de Dukascopy (29 % des bougies, volume nul) sont retirées avant toute mesure de cette stratégie ; elles diluaient l'ATR et créaient un faux avantage.
- Moyenne mobile « Jour » : codée (SMA 200 des clôtures journalières, appliquée au jour suivant seulement) mais, en direct, il n'y a que 1 500 bougies H1 (≈ 62 jours) : elle n'est disponible que si 200 jours d'historique sont chargés.
- Boîtes : le retournement est mesuré depuis la CLÔTURE de la bougie d'arrivée pour les deux barrières (+1 ATR loin de la zone, 1 ATR dans l'autre sens) ; prendre le centre de la zone comme référence gonflait le taux (la cible de retournement était plus proche que celle de cassure). Le taux est la part des issues tranchées.
- Carnet : toutes les zones valides à ≤ 0,25 ATR du prix déclenchent la lecture et l'enregistreur forward (pas seulement les boîtes affichées en Épuré), pour réunir assez de cas.
- Feuille de décision (4) : « tendance alignée » = H1 ET H4 dans le sens du retournement attendu (baissières pour une résistance) ; un changement de caractère ou un retournement confirmé dans le même sens, dans les 24 bougies, suffit aussi.
- Scénarios : la probabilité est la fréquence historique de premier passage (touche de la cible avant celle de l'invalidation, les deux dans la même bougie = non tranché dans la mesure, invalidé dans le suivi) selon la distance en ATR de chaque niveau, l'état de tendance H1/H4 et la position vs SMA 200 ; hors de la grille de distances (0,35 à 4,5 ATR) ou sous 30 cas : « pas assez de données », jamais un pourcentage inventé.

**Résultats mesurés (Dukascopy XAU/USD H1, 18 derniers mois ET 2015–2025).**
- Événements de la moyenne mobile : aucun ne se distingue de la base (continuation +2 ATR avant −1 ATR en 12 bougies) ; test de gestion « rebond sur MA » et « fausse cassure » contre 1 000 entrées au hasard : aucun avantage démontré (les frais Kraken ≈ 0,3 R par trade dépassent tout écart brut).
- Boîtes : aucune classe de confluence ne se distingue de la base ; en Épuré, « Pas de zone forte à proximité » est le résultat normal.
- Carnet : aucune mesure historique ; enregistreur forward en direct seulement.
- Scénarios : le premier passage suit la valeur du hasard b / (a + b) ; un scénario décrit les niveaux, il ne donne pas d'avantage mesurable.

Aucune règle automatique n'a prouvé un avantage ; cette stratégie est en observation.

## Rayle Capital et espaces (ajouté le 2026-11-12)

La plateforme a trois espaces dans `or.html` : **Investissement** (long terme : étude de marché sourcée, plan DCA, intérêts composés, portefeuille ; « ceci n'est pas un conseil financier »), **Trading actif** (l'or : MA200, golden zone `golden-v1`, niveaux de la veille, concepts ICT, carnet, alertes vocales, setup A+ `aplus-v1`) et **Capital** (tableau de bord des deux poches : valeur et plafonds de l'investissement, risque ouvert du journal, risque par poche). Toute règle de trading y est marquée **non prouvée** tant que son p corrigé (Holm) dépasse 0,05 ; aucune ne l'a franchi. Aucun ordre n'est envoyé : Rayle lit, alerte et propose. Mesures du rejeu 2026 de l'A+ : 10 alertes sur 409 événements EMA200, aucune des 32 grosses cassures de 2026 ni la cassure à la baisse du 11 novembre (le détecteur est très sélectif). Le backtest « DCA + supports » contre « DCA simple de même total » montre un écart de quelques pour cent, non prouvé.
