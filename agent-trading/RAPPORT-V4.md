# Rapport v4 : un agent libre, simple, qui suit le marché, évalué honnêtement

Travail fait seul le 4 novembre 2026, en autonomie. **Simulation uniquement, aucun ordre réel.** Portefeuille, prix unique, page unique : non modifiés, seulement les ajouts demandés. Le moteur et le banc de test restent **hors dépôt** (`agent-trading/moteur/`).

## En bref

- **L'agent est en mode OBSERVATION.** Il n'envoie plus aucune alerte Telegram, n'affiche plus de carte « À COPIER » et n'ouvre plus aucune position dans le portefeuille. Le bandeau dit : « OBSERVATION : aucune stratégie prouvée, aucune position proposée ». Il continue d'enregistrer le carnet, le volume net et les prix.
- **Pourquoi :** j'ai testé **51 variantes** du nouveau cerveau v4 sur 4 ans et demi d'historique Kraken Futures (5 actifs). **Aucune ne gagne hors échantillon.** Toutes ont un intervalle de confiance à 95 % entièrement sous zéro (de −0,21 à −0,59 R par trade), après frais et glissement.
- **Le témoin dit l'essentiel :** des entrées **au hasard** aux mêmes moments, avec les mêmes stops et objectifs, font en moyenne **−0,36 R** par trade. Les variantes font **−0,37 R** en moyenne. Le cerveau v4 ne choisit pas mieux que le hasard. Ce sont les coûts et la forme des trades (stop, objectif à 2-5 R) qui perdent.
- **Open interest et financement : écartés.** Ils ne battent pas le témoin (détail plus bas).
- **Rien n'est branché.** Le **registre fantôme** accumule les positions que l'agent *aurait* prises (versions v4, v4 + carnet, v2) avec leur résultat réel. Trois pistes sont proposées pour la suite.

## 1. Ce qui a été construit

| Étape | Fait | Où |
|---|---|---|
| 0. Sauvegarde | Copie complète de `moteur/` | `Projets/moteur-sauvegardes/avant-v4-2026-11-04/` (hors dépôt) |
| 1. Observation | Aucune alerte (garde unique dans `index.js`), aucune position nouvelle, bandeau. Les propositions de la stratégie v2 vont au registre fantôme (version « v2 »). Positions déjà ouvertes : aucune au moment du passage. Moteur redémarré et vérifié (mode `observation`, Worker « connecté », 0 erreur). | `moteur/v4/agent-v4.js`, `moteur/agent.js`, `moteur/index.js` |
| Registre fantôme | Séparé du portefeuille (fichier `v4/registre-fantome.json`). Version, entrée / SL / TP, thèse, résultat réel au prix de chaque échange, stop d'abord, mêmes coûts que le banc. Règles dures par version. | `moteur/v4/fantome.js` |
| 2. Cerveau v4 | Niveaux = volume réellement échangé sur 5 jours + plus-haut / plus-bas de la veille et de la semaine, avec un score (volume, rejets, fraîcheur). Flux = volume net cumulé M15 (2 h) et H1 (4 h). 4 modèles : rebond avec absorption, cassure + retest, balayage + reprise, continuation après repli. **Score 0-100** au lieu de filtres. Stop derrière le niveau ou la mèche, jamais sous 1 ATR M15 ; objectif = prochain niveau, de 2 à 5 R. Thèse écrite (« J'achète parce que… / J'abandonne si… ») et sortie quand elle tombe. Aucun MA, RSI, EMA (testé). | `moteur/v4/cerveau.js` |
| Carnet | Seulement un bonus / malus de score (mur qui tient +6, mur qui se recharge +4, mur consommé −6, faux mur retiré −6, mur en face avant 1 R −4 ; borné à ±10). Il n'existe pas dans l'historique : il est évalué **uniquement** en suivi fantôme, en comparant la version « v4 » et la version « v4+carnet ». | `agent-v4.js` (`bonusCarnet`) |
| Plan du jour | À 08:00 (Paris) dans le Journal : niveaux clés par actif et scénarios « si le prix arrive à X avec tel signal, je… ». Phrases écrites par règles (pas d'IA : aucun chiffre ne peut être inventé). | `moteur/v4/plan.js` |
| 3. Exploration | 51 variantes, calibration / validation, témoin, FDR, par actif, année, sens, modèle, sortie. | `moteur/v4/banc.mjs`, résultats `%LOCALAPPDATA%\Rayle\agent-trading\v4\resultats.json` et `.md` |
| 4. Bouton « Backtest » | Dans la barre du graphique : 5 j · 7 j (défaut) · 14 j, traits très pâles numérotés « REJOUÉ », panneau (trades, gagnants, R total, R moyen, baisse max, par modèle, par actif, « échantillon trop petit » sous 20), « Effacer le backtest ». Précalculé par le moteur chaque heure et publié dans l'état : identique sur PC, tablette et téléphone. | `moteur/v4/rejeu.js`, `front/graphique.js`, `front/panneaux.js`, `front/vue.js` |
| 5. Leçons | Une note à chaque position fantôme ou réelle clôturée, cause classée par le moteur. Toutes les 30 clôtures : au plus un ajustement, testé hors échantillon sur le banc (processus à part), retour arrière si les 30 suivantes sont pires. Le Journal montre les 5 dernières leçons et le total par cause. | `moteur/v4/lecons.js`, `moteur/v4/ajustement.mjs` |
| 6. Volume net en bougies | 3e panneau du graphique (même axe du temps : zoom et déplacement synchronisés) : bougie du CVD de chaque bougie, vert = acheteurs agressifs, rouge = vendeurs, mèches = extrêmes **enregistrés** pendant la bougie. Bougie en cours en direct. Achats et ventes agressifs en $ + barre de déséquilibre. Avant le démarrage du moteur : zone grisée « incomplet », rien de dessiné. Visible en plein écran. | `front/graphique.js`, `moteur/bougies.js`, `moteur/etat.js` |
| 7. Finitions | « Objectif semaine » retiré (affichage, état, réglages, définition). Limite simulée de baisse gardée. | `front/panneaux.js`, `moteur/portefeuille.js`, `commun/definitions.js` |

## 2. Méthode du banc long (écrite avant les résultats)

- **Données :** Kraken Futures, bougies 15 min et volume net réel (−« aggressor-differential », signe vérifié dans l'étude précédente). BTC, ETH, SOL depuis mars 2022, DOGE depuis juin 2022, HYPE depuis janvier 2025, jusqu'au 4 novembre 2026. L'or (PF_XAUUSD) n'a que 3 mois d'historique : **pas dans le banc** (il est suivi en direct par le registre fantôme).
- **Coupe :** calibration avant le 01/11/2025, validation hors échantillon sur les 12 mois suivants (même coupe que l'étude précédente).
- **Exécution :** décision à la clôture M15, entrée au marché à l'ouverture suivante, stop d'abord (un trou de prix est pris au pire), objectif, sortie de thèse (clôture qui repasse le niveau, ou flux M15 ≤ −1,5 avec H1 contraire), 24 h au plus. Coûts : 0,05 % par côté + 0,01 % de glissement (sauf à l'objectif).
- **Règles dures :** une position à la fois par actif, pause de 4 bougies après la sortie. Dans le banc, chaque actif est rejoué séparément (le plafond de 3 positions au total n'y joue presque jamais à ces fréquences ; il est appliqué dans le rejeu du bouton et dans le registre fantôme).
- **Seuil de score :** réglé sur la calibration **seulement pour la fréquence** (0,5 ou 0,25 position par jour et par actif, soit 1 à 2 par jour pour les 4 actifs de l'agent). Jamais réglé pour le gain, jamais sur les 7 derniers jours.
- **Témoin :** pour chaque trade, même moment, même distance de stop et d'objectif, **sens tiré au hasard**, 1 000 tirages. Et « ne rien faire » = 0 R.
- **Tests multiples :** 51 variantes sur un budget de 200 ; correction de Benjamini-Hochberg (FDR 5 %) sur les p-valeurs hors échantillon.
- **Critère de sortie d'observation :** borne basse de l'IC 95 % > 0 hors échantillon, ≥ 300 trades, q (FDR) < 0,05, mieux que le témoin (p < 0,05), R moyen > 0 sur au moins 2 des 3 actifs de l'agent et 3 des 5 actifs, achats ET ventes positifs.

## 3. Toutes les variantes testées (validation = hors échantillon, 5 actifs, frais et glissement inclus)

« Seuil 0 » = la variante produit moins d'occasions que la fréquence visée : toutes sont prises. « Sans thèse » = mêmes trades sans la sortie de thèse. « p témoin » = part des tirages au hasard qui font au moins aussi bien (petit = mieux que le hasard).

| # | Variante | Seuil | Trades calib. | R moy. calib. | Trades valid. | R moy. valid. | IC 95 % valid. | q (FDR) | Témoin valid. (médiane, 5-95 %) | p témoin | Sans thèse | Passe |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | rebond a0.8 retour stop0.5 | 50.59 | 2717 | −0,326 | 1004 | −0,376 | −0,481 … −0,272 | 1 | −0,292 (−0,373 … −0,208) | 0.955 | −0,361 | non |
| 2 | rebond a0.8 sans-retour stop0.5 | 62.5 | 2723 | −0,320 | 1054 | −0,415 | −0,518 … −0,312 | 1 | −0,331 (−0,406 … −0,249) | 0.961 | −0,374 | non |
| 3 | rebond a1.5 retour stop0.5 | 25.2 | 2723 | −0,317 | 967 | −0,321 | −0,421 … −0,222 | 1 | −0,300 (−0,382 … −0,222) | 0.652 | −0,345 | non |
| 4 | rebond a1.5 sans-retour stop0.5 | 54.1 | 2714 | −0,302 | 1048 | −0,404 | −0,505 … −0,304 | 1 | −0,355 (−0,437 … −0,278) | 0.852 | −0,333 | non |
| 5 | cassure b1 recul6 stop0.5 | 54.69 | 2715 | −0,457 | 1004 | −0,430 | −0,552 … −0,308 | 1 | −0,519 (−0,603 … −0,436) | 0.039 | −0,440 | non |
| 6 | cassure b1 recul12 stop0.5 | 59.18 | 2725 | −0,449 | 1021 | −0,371 | −0,495 … −0,247 | 1 | −0,509 (−0,593 … −0,422) | 0.003 | −0,400 | non |
| 7 | cassure b2 recul6 stop0.5 | 0 | 2355 | −0,394 | 827 | −0,369 | −0,503 … −0,235 | 1 | −0,448 (−0,533 … −0,357) | 0.085 | −0,357 | non |
| 8 | cassure b2 recul12 stop0.5 | 24.22 | 2727 | −0,417 | 973 | −0,363 | −0,486 … −0,239 | 1 | −0,457 (−0,544 … −0,365) | 0.042 | −0,331 | non |
| 9 | balayage s0.1 strict stop0.5 | 0 | 1241 | −0,437 | 483 | −0,431 | −0,589 … −0,273 | 1 | −0,428 (−0,552 … −0,305) | 0.518 | −0,441 | non |
| 10 | balayage s0.1 souple stop0.5 | 0 | 1904 | −0,441 | 750 | −0,483 | −0,607 … −0,359 | 1 | −0,466 (−0,555 … −0,372) | 0.618 | −0,496 | non |
| 11 | balayage s0.3 strict stop0.5 | 0 | 522 | −0,439 | 231 | −0,513 | −0,721 … −0,304 | 1 | −0,388 (−0,551 … −0,222) | 0.891 | −0,552 | non |
| 12 | balayage s0.3 souple stop0.5 | 0 | 838 | −0,396 | 361 | −0,588 | −0,749 … −0,428 | 1 | −0,444 (−0,578 … −0,314) | 0.961 | −0,617 | non |
| 13 | continuation c1 repli0.5 stop0.5 | 73.83 | 2723 | −0,481 | 994 | −0,437 | −0,562 … −0,312 | 1 | −0,443 (−0,524 … −0,348) | 0.456 | −0,386 | non |
| 14 | continuation c1 repli1 stop0.5 | 70.12 | 2716 | −0,486 | 967 | −0,500 | −0,624 … −0,377 | 1 | −0,492 (−0,571 … −0,405) | 0.571 | −0,457 | non |
| 15 | continuation c2 repli0.5 stop0.5 | 70.51 | 2718 | −0,409 | 1028 | −0,421 | −0,541 … −0,302 | 1 | −0,433 (−0,514 … −0,356) | 0.401 | −0,408 | non |
| 16 | continuation c2 repli1 stop0.5 | 62.5 | 2714 | −0,390 | 961 | −0,505 | −0,621 … −0,389 | 1 | −0,485 (−0,568 … −0,404) | 0.668 | −0,488 | non |
| 17 | rebond a0.8 retour stop1 | 47.85 | 2718 | −0,280 | 993 | −0,327 | −0,420 … −0,233 | 1 | −0,219 (−0,303 … −0,142) | 0.988 | −0,269 | non |
| 18 | rebond a0.8 sans-retour stop1 | 60.74 | 2696 | −0,304 | 1029 | −0,296 | −0,392 … −0,201 | 1 | −0,218 (−0,293 … −0,139) | 0.956 | −0,208 | non |
| 19 | rebond a1.5 retour stop1 | 20.9 | 2724 | −0,270 | 976 | −0,256 | −0,345 … −0,167 | 1 | −0,205 (−0,284 … −0,117) | 0.853 | −0,253 | non |
| 20 | rebond a1.5 sans-retour stop1 | 51.17 | 2724 | −0,287 | 1025 | −0,293 | −0,385 … −0,201 | 1 | −0,233 (−0,315 … −0,161) | 0.882 | −0,195 | non |
| 21 | cassure b1 recul6 stop1 | 44.14 | 2728 | −0,340 | 979 | −0,278 | −0,382 … −0,173 | 1 | −0,346 (−0,421 … −0,266) | 0.075 | −0,246 | non |
| 22 | cassure b1 recul12 stop1 | 52.54 | 2719 | −0,336 | 1012 | −0,274 | −0,377 … −0,172 | 1 | −0,326 (−0,406 … −0,246) | 0.143 | −0,232 | non |
| 23 | cassure b2 recul6 stop1 | 0 | 1962 | −0,287 | 699 | −0,230 | −0,353 … −0,108 | 1 | −0,304 (−0,399 … −0,209) | 0.099 | −0,241 | non |
| 24 | cassure b2 recul12 stop1 | 0 | 2361 | −0,286 | 844 | −0,212 | −0,323 … −0,102 | 1 | −0,311 (−0,397 … −0,229) | 0.035 | −0,220 | non |
| 25 | balayage s0.1 strict stop1 | 0 | 1076 | −0,328 | 415 | −0,346 | −0,495 … −0,196 | 1 | −0,327 (−0,448 … −0,193) | 0.597 | −0,335 | non |
| 26 | balayage s0.1 souple stop1 | 0 | 1653 | −0,358 | 643 | −0,374 | −0,492 … −0,255 | 1 | −0,375 (−0,469 … −0,279) | 0.483 | −0,392 | non |
| 27 | balayage s0.3 strict stop1 | 0 | 476 | −0,349 | 205 | −0,366 | −0,573 … −0,159 | 1 | −0,312 (−0,486 … −0,133) | 0.691 | −0,371 | non |
| 28 | balayage s0.3 souple stop1 | 0 | 770 | −0,359 | 326 | −0,449 | −0,607 … −0,292 | 1 | −0,340 (−0,487 … −0,201) | 0.898 | −0,441 | non |
| 29 | continuation c1 repli0.5 stop1 | 71.29 | 2695 | −0,332 | 982 | −0,318 | −0,425 … −0,209 | 1 | −0,309 (−0,391 … −0,224) | 0.551 | −0,259 | non |
| 30 | continuation c1 repli1 stop1 | 66.6 | 2708 | −0,321 | 959 | −0,344 | −0,452 … −0,237 | 1 | −0,342 (−0,422 … −0,259) | 0.512 | −0,310 | non |
| 31 | continuation c2 repli0.5 stop1 | 66.21 | 2720 | −0,274 | 1023 | −0,324 | −0,424 … −0,224 | 1 | −0,299 (−0,380 … −0,218) | 0.705 | −0,307 | non |
| 32 | continuation c2 repli1 stop1 | 0 | 2521 | −0,253 | 893 | −0,294 | −0,398 … −0,190 | 1 | −0,295 (−0,375 … −0,215) | 0.494 | −0,274 | non |
| 33 | score équilibré, 4 modèles, stop0.5, 0,5/j | 73.83 | 2718 | −0,481 | 998 | −0,420 | −0,545 … −0,294 | 1 | −0,441 (−0,527 … −0,352) | 0.356 | −0,391 | non |
| 34 | score équilibré, 4 modèles, stop0.5, 0,25/j | 79.88 | 1331 | −0,505 | 465 | −0,421 | −0,610 … −0,232 | 1 | −0,422 (−0,560 … −0,282) | 0.495 | −0,406 | non |
| 35 | score équilibré, 4 modèles, stop1, 0,5/j | 71.09 | 2730 | −0,354 | 998 | −0,304 | −0,411 … −0,197 | 1 | −0,303 (−0,389 … −0,220) | 0.506 | −0,264 | non |
| 36 | score équilibré, 4 modèles, stop1, 0,25/j | 77.93 | 1343 | −0,365 | 445 | −0,384 | −0,547 … −0,222 | 1 | −0,319 (−0,445 … −0,185) | 0.82 | −0,351 | non |
| 37 | score niveau, 4 modèles, stop0.5, 0,5/j | 70.12 | 2683 | −0,523 | 1012 | −0,435 | −0,559 … −0,310 | 1 | −0,458 (−0,546 … −0,370) | 0.353 | −0,413 | non |
| 38 | score niveau, 4 modèles, stop0.5, 0,25/j | 76.56 | 1349 | −0,566 | 500 | −0,486 | −0,668 … −0,304 | 1 | −0,459 (−0,590 … −0,338) | 0.629 | −0,506 | non |
| 39 | score niveau, 4 modèles, stop1, 0,5/j | 67.58 | 2683 | −0,370 | 967 | −0,292 | −0,403 … −0,182 | 1 | −0,312 (−0,399 … −0,222) | 0.374 | −0,250 | non |
| 40 | score niveau, 4 modèles, stop1, 0,25/j | 74.41 | 1347 | −0,406 | 480 | −0,266 | −0,431 … −0,101 | 1 | −0,288 (−0,418 … −0,157) | 0.386 | −0,270 | non |
| 41 | score flux, 4 modèles, stop0.5, 0,5/j | 78.91 | 2698 | −0,470 | 955 | −0,477 | −0,603 … −0,352 | 1 | −0,475 (−0,567 … −0,384) | 0.509 | −0,466 | non |
| 42 | score flux, 4 modèles, stop0.5, 0,25/j | 84.57 | 1354 | −0,481 | 466 | −0,409 | −0,603 … −0,216 | 1 | −0,461 (−0,588 … −0,324) | 0.258 | −0,412 | non |
| 43 | score flux, 4 modèles, stop1, 0,5/j | 76.17 | 2687 | −0,327 | 965 | −0,340 | −0,447 … −0,233 | 1 | −0,325 (−0,413 … −0,240) | 0.609 | −0,302 | non |
| 44 | score flux, 4 modèles, stop1, 0,25/j | 82.62 | 1348 | −0,350 | 463 | −0,359 | −0,519 … −0,199 | 1 | −0,299 (−0,434 … −0,167) | 0.775 | −0,321 | non |
| 45 | score réaction, 4 modèles, stop0.5, 0,5/j | 73.63 | 2714 | −0,421 | 988 | −0,375 | −0,498 … −0,253 | 1 | −0,411 (−0,489 … −0,328) | 0.257 | −0,370 | non |
| 46 | score réaction, 4 modèles, stop0.5, 0,25/j | 79.69 | 1363 | −0,433 | 450 | −0,348 | −0,532 … −0,165 | 1 | −0,422 (−0,546 … −0,295) | 0.172 | −0,347 | non |
| 47 | score réaction, 4 modèles, stop1, 0,5/j | 71.48 | 2709 | −0,322 | 970 | −0,268 | −0,377 … −0,159 | 1 | −0,264 (−0,346 … −0,178) | 0.54 | −0,225 | non |
| 48 | **score réaction, 4 modèles, stop1, 0,25/j** (candidate) | 78.13 | 1346 | −0,319 | 438 | −0,359 | −0,519 … −0,199 | 1 | −0,347 (−0,475 … −0,213) | 0.564 | −0,277 | non |
| 49 | n° 48 + open interest *(expérience)* | 80.08 | 1330 | −0,333 | 518 | −0,275 | −0,424 … −0,125 | 1 | −0,273 (−0,386 … −0,155) | 0.509 | −0,288 | non |
| 50 | n° 48 + financement *(expérience)* | 78.13 | 1343 | −0,318 | 429 | −0,354 | −0,516 … −0,192 | 1 | −0,346 (−0,476 … −0,218) | 0.554 | −0,267 | non |
| 51 | n° 48 + OI + financement *(expérience)* | 79.88 | 1362 | −0,340 | 514 | −0,293 | −0,442 … −0,145 | 1 | −0,300 (−0,409 … −0,175) | 0.467 | −0,325 | non |

**Nombre de variantes testées : 51** (budget 200). Chaque futur ajustement du carnet de leçons en ajoutera 2 (comptées dans l'état publié).

**Ne rien faire = 0 R.** Toutes les variantes font pire que ne rien faire.

### Ce que disent ces chiffres

- **Aucune variante ne passe**, et la meilleure q (FDR) vaut 1 : aucune n'est même positive.
- **Le choix du sens ne vaut pas mieux que le hasard.** Moyenne des 51 variantes : −0,368 R ; moyenne des témoins au hasard : −0,362 R. Seule la famille **cassure** fait parfois mieux que son témoin (4 variantes sur 51 avec p < 0,05, toutes des cassures), mais reste nettement perdante (au mieux −0,21 R) ; avec 51 essais, 2 ou 3 « p < 0,05 » sont attendus par hasard.
- **Les coûts mangent tout.** Un trade au hasard avec ces stops et ces objectifs perd environ 0,3 R : frais, glissement, stops pris au pire dans les trous de prix. Les stops de 0,5 ATR coûtent plus cher que ceux de 1 ATR dans toutes les familles.
- **La candidate** (n° 48, choisie comme la meilleure combinaison **en calibration**, sans regarder la validation) : 438 trades hors échantillon, −0,36 R, environ 1,2 trade par jour pour 5 actifs. Par actif : BTC −0,66, ETH −0,61, HYPE −0,32, SOL −0,11, DOGE −0,13. Achats −0,35, ventes −0,36. Chaque année est négative (2022 −0,23 · 2023 −0,45 · 2024 −0,33 · 2025 −0,23 · 2026 −0,38).

### Expérience séparée : open interest et financement

- **Données :** open interest Kraken Futures (15 min) depuis mars 2023 (BTC, ETH, SOL, DOGE) et janvier 2025 (HYPE). Financement : Kraken Futures ne publie qu'**un an** d'historique (depuis le 30/10/2025, donc seulement la période de validation) ; HYPE : Hyperliquid depuis décembre 2024.
- **Règles fixées à l'avance (aucun réglage) :** prix qui monte + OI qui monte (> 0,2 % en 1 h) = nouvelles positions → +10 points dans le sens du prix ; prix qui monte + OI qui baisse = rachats → −10 points. Financement extrême payé par le sens du trade (> 0,003 % par heure) → −10 points.
- **Résultat :** l'OI fait passer la candidate de −0,359 à −0,275 R, mais **son témoin passe aussi de −0,347 à −0,273 R** (p témoin 0,51). L'OI change les **moments** où l'agent trade, pas la qualité du sens choisi. Le financement ne change presque rien (−0,354 R). **Les deux sont écartés** et ne sont pas utilisés par l'agent.

## 4. Ce qui est prouvé, ce qui ne l'est pas

| Question | Réponse | Sur quelles données |
|---|---|---|
| Le cerveau v4 (4 modèles, score) gagne-t-il après frais ? | **Non, prouvé** (51 variantes, IC tous sous 0) | Historique Kraken Futures, 12 mois hors échantillon |
| Fait-il mieux que le hasard ? | **Non** (sauf peut-être la cassure, toujours perdante) | Idem, témoin à 1 000 tirages |
| L'open interest / le financement aident-ils ? | **Non** (pas au-delà du témoin) | OI depuis 2023, financement 1 an |
| Le carnet (murs) améliore-t-il le score ? | **Inconnu.** Le carnet n'existe pas dans l'historique. | Seul le registre fantôme (« v4 » contre « v4+carnet ») pourra le dire, après plusieurs centaines de trades |
| L'empreinte réelle par prix change-t-elle les niveaux ? | **Inconnu.** Le banc répartit le volume de chaque bougie sur son étendue ; le direct utilise l'empreinte réelle quand elle a été enregistrée. | Registre fantôme |
| L'or ? | **Non testé** sur le banc (3 mois d'historique). | Registre fantôme |

## 5. Mode de l'agent : OBSERVATION

- **Pourquoi :** aucune variante ne remplit le critère (IC 95 % hors échantillon > 0, ≥ 300 trades, plusieurs actifs, les deux sens, FDR, témoin). Le mode est lu dans `v4/resultats.json` (`branchee: null`) ; sans ce fichier, c'est aussi l'observation (choix le plus sûr).
- **En direct :** à chaque clôture M15, le cerveau v4 tourne sur BTC, ETH, HYPE et l'or. Si le score dépasse le seuil de la candidate (78,13), la position va au **registre fantôme** (version « v4 », et « v4+carnet » si le score avec le bonus du carnet le dépasse). Les signaux de l'ancienne stratégie v2 y vont aussi (version « v2 »). Rien ne touche le portefeuille, rien ne part sur Telegram.
- **Bouton « Backtest » :** affiche la **CANDIDATE, non validée**. Au moment du rapport (rejeu réel, Kraken) : 5 jours = 6 trades, +2,85 R ; 7 jours = 9 trades, +4,78 R ; 14 jours = 15 trades, −1,35 R. Échantillons trop petits pour conclure : le banc long dit −0,36 R par trade.
- **Sortie de l'observation :** seulement quand une version passe le critère hors échantillon. Le code de branchement existe (`proposerReel`, version inscrite sur chaque trade) mais n'est pas actif.

## 6. Trois pistes à tester ensuite

1. **Réduire le coût par trade, en partant de la cassure.** C'est la seule famille qui choisit son sens un peu mieux que le hasard. À tester : entrée **limite** sur le retest (frais preneur → frais de teneur de marché) et décision en **H1** avec des stops plus larges, pour que les frais pèsent beaucoup moins en R. Même banc, même coupe, budget compté.
2. **Laisser le registre fantôme mesurer le carnet.** Comparer « v4 » et « v4+carnet » sur les mêmes jours, en direct, jusqu'à au moins 300 trades par version. C'est la seule façon honnête de savoir si les murs aident (ils n'existent pas dans l'historique).
3. **Choisir les moments plutôt que le sens.** L'open interest améliore les moments (le témoin au hasard s'améliore autant que la stratégie). Piste : un filtre « quand trader » (OI, heures de forte liquidité) combiné à un sens donné par la cassure, évalué contre le même témoin.

## 7. Choix faits seul (aucune question possible)

1. Sauvegarde dans `Projets/moteur-sauvegardes/avant-v4-2026-11-04/` (à côté du dépôt, hors dépôt).
2. Observation : **toutes** les alertes Telegram sont coupées, y compris les sorties des positions déjà ouvertes (« aucune alerte »). Il n'y avait aucune position ouverte au moment du passage ; le portefeuille n'a pas été remis à zéro.
3. Les propositions de la stratégie v2 continuent d'être calculées mais vont au registre fantôme (version « v2 »), sans appel à l'IA locale.
4. Banc : 5 actifs (BTC, ETH, HYPE de l'agent + SOL, DOGE pour la robustesse) ; l'or exclu faute d'historique. Critère « plusieurs actifs » : ≥ 2 des 3 actifs de l'agent et ≥ 3 des 5.
5. Niveaux du banc : volume de chaque bougie réparti uniformément sur son étendue (l'historique n'a pas d'empreinte par prix). En direct : empreinte réelle quand elle existe, même répartition sinon. Cases de 0,15 % du prix, fenêtre de 5 jours. Veille et semaine en UTC.
6. L'ATR M15 sert seulement à mesurer des distances (tolérance, stop minimal), jamais à choisir un sens.
7. Entrée au marché à l'ouverture de la bougie suivante (plus simple et plus prudent qu'un ordre limite qui ne serait pas toujours rempli).
8. Candidate = meilleure combinaison **en calibration** (pas en validation, pour ne pas tricher).
9. Seuil réglé uniquement sur la fréquence (≈ 0,25 par jour et par actif pour la candidate, soit ≈ 1 par jour pour les 4 actifs de l'agent).
10. Plan du jour rédigé par règles, sans IA locale (aucun chiffre ne peut être inventé).
11. Leçons : les trades gagnants reçoivent la cause « autre » (la thèse a tenu) ; un ajustement « carnet trompeur » ne peut pas être validé hors échantillon, il n'est donc jamais appliqué.
12. Bougies de volume net : couleurs vert / rouge (gain / perte) ; mèches seulement quand les extrêmes ont été enregistrés pendant la bougie, sinon égales au corps.
13. Worker de l'agent **non redéployé** : rien n'a changé côté Worker, l'état « lent » (≈ 65 Ko) reste sous la limite de stockage. Worker principal « rayle » jamais touché.

## 8. Limites

- Pas de carnet historique : tout ce qui touche aux murs n'est mesurable qu'en direct.
- Frais de financement des perpétuels non comptés dans le banc (ils ne feraient qu'aggraver).
- HYPE : historique court (depuis janvier 2025). Or : 3 mois.
- Le premier contrôle Chrome de la page unique (relais de démonstration) a échoué une fois sur 157 (graphique pas encore chargé juste après le démarrage du relais) puis a réussi 157 sur 157 au second passage.

## 9. Fichiers, commandes, tests

- Moteur (hors dépôt) : `moteur/v4/` (`cerveau.js`, `banc.mjs`, `donnees-oi.mjs`, `recentes.js`, `fantome.js`, `lecons.js`, `plan.js`, `rejeu.js`, `ajustement.mjs`, `agent-v4.js`).
- Banc : `node agent-trading/moteur/etude-ancien/telecharger.mjs` puis `node agent-trading/moteur/v4/donnees-oi.mjs` puis `node agent-trading/moteur/v4/banc.mjs` (≈ 30 s).
- Données : `%LOCALAPPDATA%\Rayle\agent-trading\v4\` (`resultats.json`, `resultats.md`, `trades-candidate.json`, `registre-fantome.json`, `plan.json`, `ajustements.json`).
- Tests : `npm test` dans `agent-trading/` : tout passe (dont `moteur/tests/v4-test.mjs`, 17 : aucune alerte en observation, registre fantôme séparé, témoin, score, règles dures, bouton Backtest sans données inventées, bougies de volume net, leçons, plan, thèse).
- Chrome : `moteur/tests/ecran-v4.mjs` (état réel du moteur, relais `REEL=1`) : **106 sur 106** — PC 1600, tablette 1280, téléphone 384, plein écran, aucun élément coupé, aucune erreur console, mêmes chiffres du backtest partout. `moteur/tests/ecran-page-unique.mjs` : 157 sur 157. Captures : `moteur/tests/captures/v4-*.png`.
