# PROMPT CLAUDE CODE — Rayle devient experte ICT (cerveau + terminal multi-unités)

Travaille en **autonomie complète**, sans me poser de questions. Si un point est impossible, fais tout le reste et explique-le dans le rapport final. Tout doit rester **gratuit**.

## 0. Ce que je veux (Justin)

J'ai suivi une formation ICT complète (22 modules, 15 prises de position). Je veux que Rayle :

1. **ait lu, compris et intégré cette formation** : elle connaît ICT par cœur et l'explique comme une mentore ;
2. affiche sur le graphique du terminal **les concepts ICT de façon sobre et lisible**, comme un vrai trader ICT : sommets et creux égaux (EQH / EQL), tendance de l'unité, PDH / PDL, FVG, order blocks, premium / discount, killzones… sans surcharger ;
3. **oriente mes décisions** : elle dit de quel côté la lecture ICT penche, ce qui manque à la checklist et ce qui invaliderait le scénario. Elle reste copilote : jamais « achète » ni « vends », c'est moi qui décide ;
4. **ne mélange jamais les unités de temps** : si je suis sur le graphique H1, elle m'explique l'ICT du H1 ; en M15, l'ICT du M15 ; en H4, du H4 ; en Daily, du Daily. Elle ne parle d'une autre unité que si je le demande (« et en H4 ? », « fais-moi le top-down »).

## 1. Ce qui existe déjà (lis-le avant de toucher à quoi que ce soit)

- Terminal : `agent-trading/front/or.html` (page `or/`), modes dans `agent-trading/front/or/terminal-pro.js`, dont un **mode ICT** (couches `ictLiquidite`, `ictStructure`, `ictFvg`, `ictOb`, `ictPd`, `ictTemps`, `ictAmd`) et l'« Analyse ICT en un clic ».
- Moteur ICT actuel : `agent-trading/front/or/ict-v1.js` (**H1 seulement**, scellé SHA-256, statistiques mesurées dans `ict-stats.json`), colle `ict-or.js`, dessin `ict-dessin.js`.
- Autres repères ICT sur bougies Daily : `trader-pro/volume/ict-calcul.js` et `ict-affichage.js` (onglet HTF du mode Volume).
- Périodes affichées : `agent-trading/front/or/config-or.js` → `PERIODES_AFFICHEES = ['H1', 'H4', 'J']` (le M15 existe dans les correspondances de données).
- Cerveau : `core/intelligence/cerveau.js` (consignes système), `trader-pro/commun/ia.js`, outils `trader-pro/cerveau/outils.js` et `trader-pro/cerveau/analyste.js` (dont `lecture_graphique`, qui renvoie l'actif, **l'unité affichée** et le mode).
- Manuel interne : `trader-pro/cerveau/manuel-rayle.md` (fiches « Bougies HTF / ICT »).
- Base de connaissances : `docs/connaissances/*.md` (5 fichiers), embarquée par `node trader-pro/outils/connaissances.mjs` dans `trader-pro/point/connaissances-data.js`, choisie par `trader-pro/point/connaissances.js` (`choisirConnaissances(question, { ids })`), testée par `trader-pro/tests/connaissances-test.mjs`.
- Conventions : modules purs testés, sceaux SHA-256 (`agent-trading/scripts-sceau.mjs`), `precache.json`, tests `npm test`, tests navigateur `tests-navigateur/`. Respecte-les toutes.

Règles de la maison qui restent vraies : Rayle décrit et mesure, jamais d'ordre ni de promesse ; les chiffres viennent toujours des calculs de l'application ; pas de module de money management dans la base de connaissances ; mobile, tablette et PC doivent marcher ; rien ne doit casser les modes Classique, Volume et ICT existants.

## 2. Tâche A — Le cerveau ICT de Rayle

1. Crée `docs/connaissances/06-ict.md` et `docs/connaissances/07-ict-unites.md` **avec exactement le contenu de l'annexe** (ce sont mes deux fichiers, tirés de ma formation ; ne les réécris pas, corrige seulement une erreur factuelle si tu en trouves une et signale-la dans le rapport).
2. Régénère `trader-pro/point/connaissances-data.js` (`node trader-pro/outils/connaissances.mjs`).
3. Mets à jour `trader-pro/tests/connaissances-test.mjs` : sept fichiers (`sessions, ma200, volume, structure, macro, ict, ict-unites`), et ajoute des tests de routage : « explique-moi le graphique H1 en ICT » charge `ict-unites` ; « c'est quoi un order block » charge `ict` ; les routages existants (MA200, CPI, range asiatique, bougie de volume) ne changent pas.
4. **Quand la question touche l'ICT** (mots de `06-ict.md` ou mode ICT affiché), charge toujours **les deux** fichiers avec `choisirConnaissances('', { ids: ['ict', 'ict-unites'] })`, en plus des autres connaissances utiles. Le routage par mots seul en perd un des deux (le mot-clé « w » du fichier structure attrape « lows »).
5. `manuel-rayle.md` :
   - remplace la fiche « order blocks » par la **checklist en trois points** de l'annexe (reversal candle qui **clôture** au-delà, FVG sur la reversal candle ou juste après, prise de liquidité pour la version la plus puissante ; simple / fort ; pièges : mèche seule, FVG trop tard, stops laissés derrière) ;
   - ajoute les fiches « ICT : lecture par unité de temps » (règles de `07-ict-unites.md`), « ICT : tendance de l'unité (STH, ITH, LTH) » et « ICT : outil lecture_ict ».
6. **Consignes système** (`core/intelligence/cerveau.js`, et `trader-pro/commun/ia.js` si c'est lui qui sert le terminal) — ajoute un bloc ICT :
   - Pour toute question ICT sur le graphique : appelle `lecture_graphique` pour connaître l'unité affichée, puis `lecture_ict` **sur cette unité** ; si je nomme une unité, utilise celle-là.
   - La réponse commence par « En M15 : », « En H1 : », « En H4 : » ou « En Daily : ». Elle ne cite **aucun élément d'une autre unité** sans que je le demande ; quand il y a un doute, chaque élément porte son unité (« FVG H4 »).
   - « Top-down », « toutes les unités », « et en H4 ? » : appelle `lecture_ict` pour chaque unité demandée et réponds par rubriques, de la plus haute à la plus basse, puis une phrase qui relie les unités (et signale les contradictions).
   - Orientation : « la lecture ICT en H1 penche à l'achat / à la vente / reste neutre », les conditions de la checklist réunies et manquantes, l'invalidation (prix exact de l'outil). Jamais « achète » ni « vends ».
   - À l'oral : 4 à 6 phrases, le détail à l'écran.
7. Vérifie avec les tests du cerveau (`analyste-test`, `gemini-cerveau-test`, etc.) que les outils et les consignes sont bien déclarés.

## 3. Tâche B — Moteur ICT multi-unités `ict-v2`

Crée `agent-trading/front/or/ict-v2.js` (module **pur**, testé, scellé comme `ict-v1`). Garde `ict-v1` intact : ses statistiques mesurées restent valables pour le H1 et sont citées comme telles.

- **Unités** : `M15`, `H1`, `H4`, `J`. Chaque calcul se fait **sur les bougies de l'unité demandée** et avec l'ATR(14) de cette unité. Aucune donnée d'une autre unité n'entre dans le calcul d'une unité, sauf les repères de période explicitement nommés (PDH / PDL, PWH / PWL, ouverture de minuit), qui gardent leur nom.
- **Swings et tendance (anti-bruit)** :
  - STH / STL : bougie plus haute (plus basse) que ses deux voisines, confirmée à la clôture de la bougie suivante.
  - ITH : STH encadré par deux STH plus bas ; ITL : STL encadré par deux STL plus hauts ; LTH / LTL : même logique sur les ITH / ITL.
  - **Tendance de l'unité** : haussière si la dernière cassure **en clôture** d'un ITH / ITL est celle d'un ITH et qu'aucun ITL plus récent n'a été cassé en clôture depuis ; baissière dans le cas symétrique ; **indécise** si aucune cassure d'ITH / ITL dans la fenêtre, ou si les deux côtés ont été cassés à tour de rôle sur les dernières bougies (range). Renvoie aussi l'ITH et l'ITL de référence et la dernière cassure (type BOS / MSS, prix, heure, avec ou sans déplacement).
  - La cassure d'un simple STH / STL est marquée comme « bruit » : jamais affichée comme un changement de tendance.
- **Liquidité** :
  - EQH / EQL : au moins deux STH (STL) à moins de 0,1 ATR de l'unité, non balayés ;
  - PDH / PDL (jour de marché qui commence à 18 h New York, comme `ict-v1`), PWH / PWL, extrêmes de l'Asie et de Londres du jour (M15 et H1 seulement) ;
  - sweep = mèche au-delà puis clôture de retour (même bougie ou la suivante).
- **FVG** : seuils de `ict-v1` adaptés à l'ATR de l'unité ; statuts non rempli → CE touché → rempli ; inversé (IFVG) sur clôture au-delà.
- **Order blocks : la définition de ma formation** (pas celle de `ict-v1`) :
  - candidate = dernière bougie contraire avant le retournement ;
  - **reversal candle** = une des deux bougies suivantes **clôture** au-delà du plus haut (haussier) ou du plus bas (baissier) de la candidate ; une mèche seule ne compte pas ;
  - **FVG** dont la bougie du milieu est la reversal candle ou la suivante ; sinon, pas d'order block ;
  - drapeaux : `liquidite` (la candidate ou la précédente a balayé un STL / EQL / PDL / extrême de session, ou l'équivalent au sommet), `fort` (le déplacement casse aussi un STH / ITH, ou un STL / ITL), `stopsDerriere` (consolidation d'au moins 4 bougies aux creux intacts juste sous la zone, ou au-dessus pour un baissier) ;
  - zone = plus haut / plus bas de la candidate, `meanThreshold` = milieu ; statuts frais → testé → cassé (clôture au-delà de l'extrémité opposée) → **breaker**.
- **Premium / discount** : dealing range de l'unité = dernier ITL ↔ dernier ITH de cette unité, équilibre à 50 %, zone OTE 62–79 % ; en Daily, ajoute les plages de 20, 40 et 60 jours.
- **Temps** : killzones, Silver Bullet et ouverture de minuit seulement pour M15 et H1, heures par les fuseaux (reprends les fonctions de `ict-v1`).
- **Biais du jour** (méthode PDH / PDL sur la bougie daily d'hier) : clôture au-dessus du PDH → haussier ; mèche au-dessus et clôture en dessous → baissier ; clôture sous le PDL → baissier ; mèche dessous et clôture au-dessus → haussier ; inside day → aucun biais.
- **Checklist** : renvoie l'état de chacune des dix conditions de `06-ict.md` (`true`, `false` ou `null` quand l'outil ne peut pas le savoir, par exemple les annonces si le calendrier est indisponible) et un champ `penche` (`achat`, `vente`, `neutre`) avec ses raisons et l'invalidation.
- **Tests** (`agent-trading/tests` ou `trader-pro/tests/ict-v2-test.mjs`) avec des bougies synthétiques : une mèche seule au-delà de la candidate ne crée pas d'order block ; un FVG trois bougies plus tard non plus ; reversal candle + FVG immédiat → order block valide ; avec sweep → `liquidite: true` ; consolidation sous la zone → `stopsDerriere: true` ; cassure de STH sans cassure d'ITH → tendance inchangée ; cassure d'ITH en clôture avec déplacement → tendance haussière ; EQH à moins de 0,1 ATR détecté et retiré après balayage ; les quatre cas du biais PDH / PDL plus l'inside day ; même série regroupée en H4 → résultats calculés sur les bougies H4, pas H1.

**Données M15** : remets `M15` dans `PERIODES_AFFICHEES` (M15, H1, H4, Jour ; pas M5) si les sources gratuites le fournissent pour l'or, le Nasdaq 100, le S&P 500, BTC et SOL. Ne fabrique jamais de M15 à partir d'unités plus grandes ; s'il manque pour un actif, le bouton M15 est désactivé pour cet actif, avec une infobulle qui le dit.

## 4. Tâche C — Affichage ICT sobre, par unité

Refais le mode ICT sur `ict-v2`. L'affichage dépend **de l'unité affichée** :

| Unité | Ce qui s'affiche (rien d'autre) |
|---|---|
| M15 | badge tendance M15, EQH / EQL M15 (les 2 plus proches de chaque côté), extrêmes de l'Asie et de Londres du jour, PDH / PDL, FVG et order blocks M15 ouverts (2 au-dessus, 2 en dessous), ouverture de minuit, killzone en cours en fond très discret |
| H1 | badge tendance H1, EQH / EQL H1, PDH / PDL, extrêmes de l'Asie et de Londres, FVG et order blocks H1 ouverts (2 + 2), équilibre du dealing range H1, killzones en fond très discret |
| H4 | badge tendance H4, ITH / ITL H4 marqués, EQH / EQL H4, PWH / PWL et PDH / PDL, FVG et order blocks H4 ouverts (2 + 2), équilibre du dealing range H4 |
| Jour | badge tendance Daily et biais du jour, LTH / LTL et ITH / ITL daily, PWH / PWL, FVG daily ouverts (2 + 2), NWOG, équilibre de la plage de 20 jours |

Règles visuelles :
- au plus une douzaine d'objets à l'écran ; un niveau balayé ou une zone remplie disparaît ;
- lignes fines, zones translucides, étiquettes courtes à droite avec l'unité si besoin (« EQH », « PDL », « FVG H1 », « OB fort ») ;
- même code couleur partout : liquidité en rouge brique, FVG / order blocks / breakers en bleu (plein pour un order block fort, contour pour un simple), équilibre en gris pointillé ; reprends les jetons de couleur du terminal plutôt que d'en inventer ;
- badge en haut à gauche : « Tendance H1 : haussière · ITL 2 641 tient » (prix réels de l'outil) ;
- petite légende repliable ; aucune flèche d'achat ou de vente dans ce mode ;
- les cases de couches existantes restent, réorganisées en : Liquidité, Structure, FVG / OB, Premium-discount, Temps ;
- lisible sur téléphone (S23 Ultra), tablette et PC ; vérifie-le dans les tests navigateur (pc1600, tab1024, tel390) avec des captures.

## 5. Tâche D — L'outil `lecture_ict` pour Rayle

Ajoute à `trader-pro/cerveau/analyste.js` (et à `DECLARATIONS_ANALYSTE` / `outils.js`) :

- `lecture_ict({ actif?, unite? })` : par défaut l'actif et l'unité du graphique ouvert (`lecture_graphique`). Renvoie **pour cette unité seulement** :
  `{ actif, unite, prix, tendance{sens, ith, itl, derniereCassure}, liquidites[{type, prix, distance, balayee}], pdArrays[{type: 'FVG'|'OB'|'breaker', sens, bas, haut, statut, fort, liquidite, stopsDerriere, distance}], premiumDiscount{equilibre, position, pct, ote}, temps{killzone, prochaine} (M15 et H1), biaisDuJour (en Daily, ou si demandé), checklist[{condition, ok}], penche{sens, raisons, invalidation}, source: 'ict-v2' }`.
- Les mêmes calculs que l'affichage (aucune divergence possible entre ce que je vois et ce que dit Rayle) ; une valeur absente est `null` et Rayle dit « indisponible ».
- Un **résumé déterministe** (`resumeIct(lecture)`, module pur testé) qui produit 3 à 5 phrases commençant par « En H1 : » : il sert quand l'IA n'est pas disponible (IA locale ou réseau coupé) et pour les alertes vocales.
- Tests : `lecture_ict` sur une unité ne renvoie que des éléments de cette unité ; le résumé commence par la bonne unité ; il ne contient jamais « achète » ni « vends ».

## 6. Vérifications finales

1. `npm test`, les tests du dossier `agent-trading`, les tests navigateur du terminal ; régénère `precache.json` et les sceaux comme d'habitude.
2. Scénarios à vérifier à la main dans le navigateur et à noter dans le rapport (avec la réponse obtenue) :
   - graphique **H1** affiché, « qu'est-ce que tu vois en ICT ? » → réponse qui commence par « En H1 : », aucun élément H4 ni M15 ;
   - puis « et en H4 ? » → réponse H4 seulement ;
   - graphique **M15**, « où est la liquidité ? » → EQH / EQL et extrêmes de session M15, killzone en cours ;
   - « fais-moi le top-down ICT » → rubriques Daily, H4, H1, M15 puis une phrase de liaison ;
   - « c'est un vrai order block ? » sur un order block affiché → les trois points de la checklist, un par un, avec oui / non.
3. Écris `RAPPORT-ICT.md` à la racine : ce qui a été fait, captures, résultats des tests, limites (données M15 manquantes, éléments non mesurés), et mets à jour `PROGRESS.md`.
4. Travaille sur une branche `ict-v2`, puis, si tous les tests passent, fusionne dans `main` et pousse (comme pour les mises à jour précédentes).

---

## ANNEXE 1 — `docs/connaissances/06-ict.md` (contenu exact)

````markdown
---
id: ict
mots: ict, inner circle, fvg, fair value gap, order block, breaker, unicorn, mss, bos, choch, déplacement, eqh, eql, equal high, equal low, sommets égaux, creux égaux, bsl, ssl, sweep, turtle soup, premium, discount, ote, killzone, silver bullet, power of 3, amd, judas, smt, ith, itl, sth, stl, mean threshold, consequent encroachment, ifvg, dealing range, pd array, draw on liquidity
---
# La méthode ICT (lecture de Rayle)

> Tendance générale, **pas une règle**. ICT est une grille de lecture discrétionnaire : aucune étude indépendante ne prouve qu'elle bat le marché. Rayle l'explique, la mesure quand elle le peut, et ne la présente jamais comme une certitude.

Source : la formation ICT de Justin (22 modules, 15 prises de position). Rayle la connaît par cœur et l'explique avec ses mots à elle, simplement, comme une mentore.

## L'idée centrale
Le prix va **d'une liquidité à une autre**, en passant par des **inefficiences** qu'il revient combler. Trois questions avant toute lecture : où est la liquidité visée (le *draw on liquidity*) ; d'où le prix peut repartir (un *PD array* : FVG, order block, breaker) ; à quel moment (les fenêtres de temps). Une quatrième pour une position : qu'est-ce qui invalide le scénario.

## La liquidité
- **BSL** (buy-side liquidity) au-dessus des sommets, **SSL** (sell-side) sous les creux : stops et ordres en attente.
- Les plus visibles : **sommets égaux (EQH)** et **creux égaux (EQL)**, PDH / PDL, PWH / PWL, extrêmes de la session asiatique, sommets et creux de session.
- **Sweep** : une mèche dépasse le niveau puis la bougie **clôture de retour** de l'autre côté. **Turtle Soup** : cassure ratée d'un niveau évident. Une vraie cassure clôture franchement au-delà et continue.
- Une prise de liquidité d'un côté annonce souvent une attaque de la liquidité opposée.

## La structure
- Haussière : sommets et creux plus hauts. Baissière : sommets et creux plus bas.
- **STH / STL** : swing simple (une bougie plus haute ou plus basse que ses deux voisines). **ITH / ITL** : un STH encadré par deux STH plus bas (un STL encadré par deux STL plus hauts). **LTH / LTL** : un ITH encadré par deux ITH plus bas.
- La cassure d'un simple STH est **du bruit**. Le vrai changement de structure est la cassure d'un **ITH ou ITL avec déplacement**.
- **BOS** : cassure dans le sens de la tendance (continuation). **MSS** : cassure du dernier swing opposé, **en clôture**, avec **déplacement**, idéalement juste après une prise de liquidité.
- **Déplacement** : une ou plusieurs grandes bougies franches, petites mèches, qui laissent souvent un FVG.

## Le FVG (fair value gap)
- Trois bougies : le vide entre le plus haut de la bougie 1 et le plus bas de la bougie 3 (**BISI**, haussier), ou l'inverse (**SIBI**, baissier).
- Son milieu est le **CE** (consequent encroachment). Le prix qui respecte le CE montre de la force.
- Un FVG ne compte que s'il naît d'un déplacement qui casse la structure ou part d'une prise de liquidité.
- Traversé par une **clôture**, il s'inverse : **IFVG**, zone du côté opposé.
- **BPR** : un FVG haussier et un FVG baissier qui se chevauchent.

## L'order block (checklist en trois points)
Order block haussier : la **dernière bougie baissière** avant le retournement ; baissier : la **dernière bougie haussière** avant la chute. Il est **valide** quand les points 2 et 3 sont réunis ; avec le point 1 en plus, c'est la version la plus puissante :
1. **Prise de liquidité** : la candidate, ou la bougie juste avant, balaie un creux (ou un sommet).
2. **Reversal candle** : une bougie **clôture** au-delà du plus haut de la candidate (en dessous du plus bas pour un baissier). Une mèche seule ne compte pas.
3. **FVG** sur la reversal candle **ou juste après**. Un FVG plusieurs bougies plus tard ne valide rien. **Sans FVG, pas d'order block.**
- **Simple** : la reversal candle casse seulement la candidate. **Fort** : le déplacement casse aussi un vrai sommet ou creux de structure (par exemple le second sommet d'un double top balayé).
- **Mean threshold** : le milieu de l'order block ; une clôture au-delà l'affaiblit.
- Pièges : la mèche seule ; le FVG trop tard ; **les stops laissés derrière** (une consolidation aux creux intacts juste sous l'order block attire le prix, qui vient souvent la chasser avant de partir).
- Schéma fréquent : après sa formation, le prix revient d'abord dans le **FVG**, puis parfois **recharge dans l'order block**, avant le vrai mouvement. Double top, FVG, retour dans l'order block, puis chute : c'est la lecture que Justin observe souvent.
- Suivre la dynamique : en tendance haussière, privilégier les order blocks haussiers ; en tendance baissière, les baissiers.

## Breaker et Unicorn
- **Breaker** : un order block qui a échoué après une prise de liquidité (creux plus bas, puis cassure du sommet) change de camp et devient support (ou résistance). Sans prise de liquidité, c'est un **mitigation block**, moins fort.
- **Unicorn** : un FVG qui chevauche un breaker ; la zone commune est la plus précise.

## Premium, discount, OTE
- **Dealing range** : du dernier creux significatif (ITL) au dernier sommet significatif (ITH). **Équilibre** = 50 %.
- Au-dessus : **premium** (cher). En dessous : **discount** (bon marché). En lecture haussière, seules les zones en discount sont des zones d'achat ; les zones en premium sont des obstacles ou des cibles. Inversement en baissier.
- **OTE** : retracement de 62 % à 79 %, avec 70,5 % comme point idéal.

## Le temps (heure de Paris en temps normal, New York + 6 h ; 5 h pendant les semaines de décalage de mars et d'octobre)
- Asie : 2 h – 6 h. Ouverture de minuit New York : 6 h (prix de référence du jour).
- Killzone de Londres : 8 h – 11 h. New York AM : 13 h – 16 h pour l'or et le forex, 14 h 30 – 17 h pour les indices. Clôture de Londres : 16 h – 18 h. Déjeuner de New York (à éviter) : 18 h – 19 h. New York PM : 19 h 30 – 22 h.
- **Silver Bullet** : 9 h – 10 h, 16 h – 17 h, 20 h – 21 h. Une heure, un sweep, un déplacement, un FVG.
- Les heures exactes du jour sont celles que calcule l'application (`lecture/sessions.js`, `ict-v1`/`ict-v2`), jamais un décalage fixe.

## Power of 3 et biais
- **AMD** : accumulation (souvent l'Asie), manipulation (le **Judas swing**, faux départ contre la vraie direction, souvent à Londres), distribution (le vrai mouvement). Une journée haussière forme souvent son plus bas **sous l'ouverture de minuit**, pendant la manipulation.
- **Biais du jour, méthode PDH / PDL** sur la bougie daily d'hier : clôture au-dessus du PDH → haussier ; mèche au-dessus mais clôture en dessous → cassure ratée, baissier vers le PDL ; clôture sous le PDL → baissier ; mèche dessous mais clôture au-dessus → haussier. Resté entre les deux (**inside day**) → pas de biais clair.
- Profil de semaine : en semaine haussière, le plus bas se forme souvent lundi ou mardi.

## SMT
Deux actifs corrélés qui se contredisent : l'un fait un plus bas plus bas, l'autre refuse (plus bas plus haut) → SMT haussière ; l'inverse au sommet. US100 avec US500 ; l'or avec l'argent, ou à l'inverse du dollar. C'est une **confirmation** au moment d'un sweep, jamais une entrée seule.

## Les modèles
- **Modèle complet** : biais, killzone, prise de liquidité contre le biais, MSS avec déplacement, entrée dans le FVG ou l'order block en discount (ou premium), invalidation au-delà de l'extrême de la manipulation, cible la liquidité opposée.
- **Silver Bullet** : dans la fenêtre d'une heure, sweep puis déplacement puis FVG ; cible la prochaine liquidité.
- **Unité haute → unité basse** : la zone vient du H4 (ou du H1), le signal vient d'une unité plus basse pendant une killzone ; la cible reste la liquidité de l'unité haute.

## La checklist d'un setup ICT
Biais noté · pas d'annonce majeure imminente · dans une killzone (pour M15 et H1) · liquidité prise contre le biais · MSS avec déplacement · PD array créé par ce déplacement · discount pour un achat, premium pour une vente · invalidation logique au-delà de la manipulation · cible de liquidité nettement plus loin que l'invalidation · SMT en bonus. S'il manque une condition obligatoire, Rayle le dit : « la lecture ICT n'est pas complète ».

## Comment Rayle oriente une décision
- Elle **décrit** ce que la méthode ICT montre sur l'unité affichée, puis dit **de quel côté la lecture penche** et **ce qui manque** : « En H1, la lecture ICT penche à l'achat : liquidité prise sous le PDL, MSS haussier, FVG en discount ; il manque la killzone. Invalidation sous 2 641. »
- Toujours au conditionnel, jamais « achète » ni « vends », jamais une promesse. Justin décide.
- Elle cite les chiffres des outils de l'application et des mesures quand elles existent ; si un élément n'est pas mesuré, elle le dit.
- Les erreurs qu'elle signale : trader hors killzone, voir des FVG partout, acheter en premium, entrer sur la cassure au lieu du retour, pas de biais noté, ignorer les annonces, contre la dynamique de l'unité supérieure.
````

## ANNEXE 2 — `docs/connaissances/07-ict-unites.md` (contenu exact)

````markdown
---
id: ict-unites
mots: ict, m15, h1, h4, daily, journalier, unité de temps, unite, top-down, top down, multi-unités, graphique m15, graphique h1, graphique h4, graphique daily, en m15, en h1, en h4, en daily
---
# Lire l'ICT unité par unité (sans jamais mélanger)

> Tendance générale, **pas une règle**. Les concepts ICT sont les mêmes sur toutes les unités ; ce qui change, c'est leur poids, le temps qu'ils mettent à jouer et les éléments qui ont un sens.

## La règle d'or de Rayle
- **L'unité de référence est celle du graphique ouvert** (donnée par `lecture_graphique`), sauf si Justin en nomme une autre (« en H4… », « sur le daily… »).
- **Une question = une unité.** La réponse commence par l'unité : « En H1 : … ». Rayle ne parle d'aucune autre unité, sauf si Justin le demande (« et en H4 ? », « fais-moi le top-down », « sur toutes les unités »).
- **Chaque élément porte son unité** dès qu'il y a le moindre doute : « l'EQH H1 », « le FVG H4 », « l'ITL daily ». Un FVG H4 n'est jamais appelé « le FVG » dans une réponse sur le H1.
- **Les chiffres viennent de l'unité demandée** : structure, sommets égaux, FVG, order blocks et premium / discount sont calculés sur les bougies de cette unité, jamais empruntés à une autre.
- **Top-down, seulement sur demande** : une rubrique par unité, de la plus haute à la plus basse (Daily, H4, H1, M15), puis une phrase qui relie les unités. Si elles se contredisent, Rayle le dit simplement : « Le H4 est baissier, le H1 haussier : un achat en H1 irait contre la dynamique H4. »
- Si Justin demande « qu'est-ce que je dois regarder ? » sans préciser, Rayle répond sur l'unité affichée et propose en une phrase de regarder l'unité au-dessus.

## M15 : l'unité d'exécution
- **Rôle** : affiner une entrée dans une zone déjà repérée en H1 ou en H4. Ce n'est pas l'unité qui donne la direction.
- **Ce que Rayle lit** : la structure M15 (ITH / ITL M15, dernier MSS), les sommets et creux égaux M15, les sweeps des extrêmes de session (Asie, ouverture de Londres, ouverture de New York), les FVG et order blocks M15 les plus récents encore ouverts, l'ouverture de minuit.
- **Le temps compte beaucoup** : killzones et Silver Bullet sont essentiels en M15 ; un signal M15 hors killzone vaut peu.
- **Durée typique d'un mouvement** : de quelques dizaines de minutes à quelques heures.
- **Ce que le M15 ne dit pas** : la tendance de fond. Un MSS M15 contre le H4 est d'abord un retracement possible.
- Phrase type : « En M15 : les creux égaux de l'ouverture de Londres viennent d'être balayés, MSS haussier, FVG M15 juste en dessous ; on est dans la killzone de New York. »

## H1 : l'unité du setup
- **Rôle** : l'unité préférée de Justin sur l'or. Le setup complet s'y lit : sweep, bougie H1 de déplacement, MSS H1, FVG ou order block H1, retour.
- **Ce que Rayle lit** : la structure H1 (ITH / ITL, dernière cassure), les sommets et creux égaux H1, le PDH et le PDL, les extrêmes de l'Asie et de Londres, les FVG et order blocks H1 non mitigés, la position premium / discount dans le dealing range H1, l'ouverture de minuit (Power of 3 visible sur la journée).
- **Le temps** : les bougies de 8 h à 11 h et de 14 h à 17 h (13 h à 16 h pour l'or) pèsent le plus ; une bougie H1 de déplacement à 3 h du matin ou à 19 h vaut beaucoup moins.
- **Durée typique** : de quelques heures à deux jours.
- Phrase type : « En H1 : le PDL a été balayé à Londres, une bougie de déplacement a cassé l'ITH, et le FVG H1 se trouve en discount sous l'ouverture de minuit. »

## H4 : la carte
- **Rôle** : la structure intermédiaire et les zones. C'est là que Justin repère où le prix doit réagir avant de descendre en H1 ou en M15.
- **Ce que Rayle lit** : la structure H4 (ITH / ITL H4, cassures avec déplacement), le dealing range H4 et son équilibre, les PD arrays H4 en discount et en premium, les liquidités H4 (ITH, ITL, PWH, PWL, PDH, PDL, sommets égaux H4).
- **Le temps** : six bougies par jour ; Rayle ne parle ni de Silver Bullet ni de minutes, au plus de « la bougie H4 de Londres » ou « de New York ».
- **Durée typique** : d'un à cinq jours.
- Phrase type : « En H4 : structure haussière tant que l'ITL tient ; le prix revient dans un FVG H4 sous l'équilibre, en discount ; cible la liquidité au-dessus de l'ITH. »

## Daily : la direction et la cible
- **Rôle** : le biais et le *draw on liquidity*.
- **Ce que Rayle lit** : le biais du jour avec la méthode PDH / PDL, les LTH / LTL et ITH / ITL daily, les FVG daily non comblés, le PWH et le PWL, l'écart d'ouverture de la semaine (NWOG), la position premium / discount dans les plages de 20, 40 et 60 jours, le profil de la semaine (début de semaine, jour du plus bas ou du plus haut).
- **Le temps** : pas de killzones ni de Silver Bullet en daily ; on parle du Power of 3 de la bougie du jour et de la semaine.
- **Durée typique** : de plusieurs jours à quelques semaines.
- Phrase type : « En Daily : hier, cassure ratée du PDH (mèche au-dessus, clôture en dessous) : biais baissier aujourd'hui, avec le PDL pour cible. »

## Ce que Rayle ne fait jamais
- Mélanger des éléments de deux unités dans une même phrase sans les nommer.
- Changer d'unité en cours de réponse parce qu'un autre élément lui paraît plus intéressant.
- Dire « achète » ou « vends » : elle dit de quel côté la lecture ICT de l'unité penche, ce qui manque à la checklist et ce qui invaliderait le scénario.
````
