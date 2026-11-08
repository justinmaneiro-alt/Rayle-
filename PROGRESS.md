# Refonte « Tableau de bord de l'OR » + journal, gardien, musique, mode télé (2026-11-07) — avancement

Reprendre ici. Branche `tableau-or`, fusionnée dans `main` à la fin de chaque partie. Rapport HORS dépôt : `agent-trading/RAPPORT-TABLEAU-OR.md`. Simulation seulement, aucun ordre ; Worker principal `rayle` jamais touché ; relais dédié `rayle-or-relais` (sans secret).

| Partie | État |
|---|---|
| A. Tableau de bord de l'or (périmètre or seul, graphique Kraken heure de Paris, 3 couches, états de zone, lecture, carnet) | fait : `agent-trading/front/or.html` + `front/or/` ; relais `relais-or/` déployé (d6cf0acb) ; tests `tests/or-test.mjs` (105), `or-reseau-test.mjs` (vraie API Kraken) ; étude des taux : `moteur/copilote/tableau-or/etude-reaction.mjs` (hors dépôt) |
| B. Journal de trades + gardien de drawdown | fait : `front/or/journal-{calcul,ui}.js`, `gardien-{calcul,ui}.js`, `stockage-or.js` ; historique XTB lu en local seulement (fichier ignoré) ; tests `tests/journal-test.mjs` (61) |
| C. Lecteur de musique YouTube (IFrame officielle) | fait : `front/or/musique{,-calcul}.js` (Mix accepté seulement si le lecteur est CRÉÉ avec la vidéo de départ + la liste ; repli lien sinon) ; tests `tests/musique-test.mjs` (30) |
| D. Mode télé + appairage (relais dédié) + Presentation API | fait : `front/or/tele*.js`, `terre-tele.js`, `telecommande.js`, adresses courtes `tv/` et `tc/` ; relais redéployé (90a69b7b) ; tests `tele-test.mjs` (35), `tele-reseau-test.mjs` (vrai relais). Presentation API : bouton seulement si un écran est disponible (non vérifié sur une vraie télé) |
| E. Vérifications finales (Terre, tests, captures, rapport) | fait : Terre classique par défaut 13/13, aucun flash au zoom (non touchée) ; `npm test` passe ; Chrome `agent-trading/tests/or-chrome-test.mjs` 31/31 ; captures `captures-or/` ; rapport local `agent-trading/RAPPORT-TABLEAU-OR.md` |
| F. Corrections après revue (branche `or-corrections`) | fait : musique et télé = tuiles indépendantes (`front/or/media-rayle.js`, `core/commun/media-pont.js`, voix partout) ; historique paginé + référence Binance dans une bande (`historique-or.js`) ; échelle sur les bougies visibles, volume à part ; repères propres (`reperes-or.js`, ≤ 8 étiquettes, fusion 0,3 ATR) ; pluriels, barre opaque. Tests : `npm test`, Chrome `or-graphique-test` (46), `or-chrome-test` (31), `media-chrome-test` (20). Rapport local mis à jour |
| G. Niveaux de la période, liquidité, flèches de rebond (branche `niveaux-periode`) | fait : `front/or/niveaux-periode.js` (règles figées `niveaux-periode-v1` et `fleches-v1`) ; flèches sans redessin (rejeu bougie par bougie, test réel `fleches-rejeu-reel-test.mjs`) ; bilan contre le hasard sous le graphique. Tests : `npm test`, Chrome `or-graphique-test` (74), `or-chrome-test` (31). Rapport local mis à jour |
| H. Musique YouTube sans onglet (branche `musique-youtube`) | fait : cadre du lecteur en sandbox sans popups ni navigation, aucun onglet ouvert automatiquement ; morceaux en erreur 2/5/100/101/150/153 sautés et notés dans « Morceaux non lisibles » (arrêt net si tout est refusé, jamais de boucle) ; liste de morceaux lue UN morceau par cadre (un refus plus loin dans `playlist=` faisait échouer le cadre entier, mesuré) ; champ « Lien de ma playlist YouTube » (localStorage `rayle_musique_playlist`), Mix en secours ; publicités jamais masquées ; rien pour Deezer. Tests : `tests/musique-test.mjs` (84), Chrome réel `musique-youtube-chrome-test.mjs` (24), `media-chrome-test.mjs` (20), `or-chrome-test.mjs` (31) |
| I. Flèches H1 version 2 (branche `fleches-h1-v2`) | fait : règles figées `fleches-h1-v2` dans leur propre commit (0eb9903, 2026-11-08 01:07 Paris) avant tout test : A (pas de verte après un rejet sur résistance sans creux plus haut confirmé, miroir), B (seulement sur un niveau ou une liquidité listés à < 0,25 ATR), C (rien en range H1, une flèche par approche, pas d’opposée à < 8 bougies) ; seuils de v1 repris tels quels. `front/or/fleches-h1-v2.js` (calcul + bilan), `registre-fleches.js` (registre v1 + v2 daté, ajout seul, chaîne d’empreintes) ; v2 affichée en H1 seulement, v1 calculée en arrière-plan ; niveaux listés précalculés par morceaux (page fluide). Bilan H1 depuis le commit : indépendantes (8 bougies), +1 ATR avant −1 ATR, R net après frais preneur 0,05 %/côté + spread mesuré (ticker Kraken), 1000 tirages au hasard (même régime, mêmes heures), « pas assez » < 30, aucune décision avant 100. Journal : étiquette « flèche H1 » + version. Rapport local (v1 et v2) : `moteur/copilote/fleches-h1/rapport-fleches-h1.mjs` → `RAPPORT-FLECHES-H1.md` (ignoré). Graphique, autres périodes, niveaux, zones, apparence : inchangés. Tests : `tests/fleches-h1-v2-test.mjs` (59), réel `fleches-rejeu-reel-test.mjs` (H1 v2 sans redessin), Chrome `or-fleches-h1-chrome-test.mjs` (12), `or-graphique-test` (74), `or-chrome-test` (31) |
| J. Diagnostic H1 + flèches H1 version 3 (branche `fleches-h1-v3`) | fait : diagnostic local du mouvement 3 882 → 4 144 → 4 070 (`moteur/copilote/fleches-h1/diagnostic-h1.mjs` → `RAPPORT-DIAGNOSTIC-H1.md`, ignoré) : chaque flèche v1 / v2 / v3 et chaque bougie de test sur 3 882 et 4 028–4 032 avec la règle (filtre, A, B, C) et ses valeurs ; au plus bas (30/10 20 h) le rejet vert est bloqué par A ; ensuite v2 est retardée surtout par C (régime range ~39 h) et B (niveau à > 0,25 ATR), pas par le délai du creux plus haut (confirmé 12 h après le plus bas). v3 : règles figées dans leur propre commit (eadb16f, 2026-11-08 01:45) AVANT le code : A ne bloque plus une verte sur support / liquidité basse listés (miroir pour les rouges), B et C inchangées, seuils de v2 repris tels quels. Moteur commun `moteurH1` (`front/or/fleches-h1-v3.js`), contrôlé : règle A de v2 = `flechesH1v2` exactement (réel et fabriqué). v2 et v1 non modifiées (fichiers identiques), registres v1 et v2 intacts (liste v3 ajoutée à côté). H1 : v3 par défaut, cases v1 / v2 / v3 pour comparer (chaque flèche porte alors sa version ; une seule version : marques comme avant), choix mémorisé. Bilan par version depuis le commit de SA règle (v1 f1311fc, v2 0eb9903, v3 eadb16f), Holm sur 3 versions, aucune décision avant 100. Survol : plus de « undefined touche » sur les flèches H1. Journal : flèche H1 + v1 / v2 / v3. Tests : `fleches-h1-v3-test.mjs` (55), `fleches-h1-v2-test.mjs` (59), réel `fleches-rejeu-reel-test.mjs` (v2 et v3 sans redessin), Chrome `or-fleches-h1-chrome-test` (18), `or-graphique-test` (74), `or-chrome-test` (31) |
| K. Diagnostic du déséquilibre vert / rouge + flèches H1 version 4 (branche `fleches-h1-v4`) | fait : règles v4 figées dans leur propre commit (632b26d, 2026-11-08 02:34) AVANT le code et le diagnostic : niveaux admis = supports / résistances d’au moins 8 touches et liquidités majeures (semaine / mois), verte seulement sur support / liquidité basse admis, rouge seulement sur résistance / liquidité haute admises, confirmation à la clôture (≥ 0,15 ATR du bon côté), une flèche par niveau et par approche, règle C inchangée ; seuils de v2 / v3 repris. `front/or/fleches-h1-v4.js` (`listesDetail` : liste des niveaux avec touches et raisons, identique à `listesAvant` pour v2 / v3, vérifié ; `flechesH1v4`, `bilans4` avec Holm sur 4 versions). Diagnostic local `moteur/copilote/fleches-h1/diagnostic-desequilibre.mjs` → `RAPPORT-DESEQUILIBRE-H1.md` (ignoré) : marché 48 % de bougies haussières et en baisse, mais 56 à 59 % de vertes pour v1 à v3 ; v2 / v3 posent surtout des rebonds CONTRE la tendance (61 / 67 % des vertes en régime baissier, 67 / 70 % des rouges en régime haussier, la règle C ne bloquant que le range), en séries (jusqu’à 16 vertes de suite), souvent sur des supports secondaires ; pas de manque de résistances listées. H1 : v4 par défaut (nouvelle clé `rayle_or_fleches_h1_choix`), cases v1 à v4, bilans depuis le commit de chaque règle. v1, v2, v3 et leurs registres intacts. Journal : flèche H1 + v1 à v4. Tests : `fleches-h1-v4-test.mjs` (55), v3 (55), v2 (59), réel `fleches-rejeu-reel-test.mjs` (v2, v3, v4 sans redessin), Chrome `or-fleches-h1-chrome-test` (18), `or-graphique-test` (74), `or-chrome-test` (31) |
| L. Flèches H1 version 5 + niveaux H1 v5 (branche `fleches-h1-v5`) | fait : règles `fleches-h1-v5` et `niveaux-h1-v5` figées dans leur propre commit (980f1b2, 2026-11-08 02:58) AVANT le code : v5 = v2 telle quelle (A, B, C d’origine) + sens aligné sur le régime H1 (haussier → vertes sur support / liquidité basse, baissier → rouges sur résistance / liquidité haute, range → rien) + flèches posées seulement sur les niveaux DESSINÉS (≤ 0,25 ATR). Niveaux H1 affichés : même calcul que niveaux-periode-v1, sélection v5 (≥ 5 touches ou extrême, ≤ 6 par côté, 2 forts) ; les autres périodes ne changent pas. `front/or/fleches-h1-v5.js` (`selectionV5`, `listesDeux` : liste détaillée v2/v3/v4 identique + liste affichée v5 en un seul calcul, `flechesH1v5`, `bilans5` Holm sur 5 versions). H1 : v5 par défaut (clé `rayle_or_fleches_h1_choix_v5`), cases v5 et v2 seulement ; v1, v3, v4 en arrière-plan (registres). Contrôle local `moteur/copilote/fleches-h1/controle-v5.mjs` → `RAPPORT-CONTROLE-V5.md` : v2 60,9 % de vertes en régime baissier et 67,1 % de rouges en régime haussier, v5 0 % / 0 % ; niveaux affichés 7,0 → 7,8 par bougie en moyenne (plus sur 62,6 % des bougies, moins sur 14,1 %), 8 → 12 maintenant ; flèches v2 195 → v5 72. v1 à v4 et leurs registres intacts. Tests : `fleches-h1-v5-test.mjs` (60), v4 (55), v3 (55), v2 (59), réel `fleches-rejeu-reel-test.mjs` (v2 à v5 sans redessin), Chrome `or-fleches-h1-chrome-test` (21), `or-graphique-test` (74), `or-chrome-test` (31) |
| M. Flèches H1 version 6 + niveaux retournés (branche `fleches-h1-v6`) | fait : règles `fleches-h1-v6` et `niveaux-h1-v6` figées dans leur propre commit (38e4b7b, 2026-11-08 03:18) AVANT le code : v6 = v5 + rebond confirmé (seule exception au sens aligné : touche d’un niveau affiché à ≤ 0,25 ATR, clôture à ≥ 0,5 ATR du bon côté dans les 6 bougies sans nouvel extrême, flèche posée à cette clôture, seulement contre le régime, jamais en range ; la règle A de v2 ne s’y applique pas) + niveaux retournés (bande cassée par une clôture à ≥ 0,5 ATR : ancienne résistance → support, ancien support → résistance, au plus 2 ajoutés par côté, étiquette « … · ancienne résistance »). `front/or/fleches-h1-v6.js` (`listesTrois` : détail v2–v4, affichée v5, affichée v6 en un seul calcul ; `indicesV6` : filtre nécessaire des touches confirmables ; `flechesH1v6`, `bilans6` Holm sur 6 versions). H1 : v6 par défaut (clé `rayle_or_fleches_h1_choix_v6`), cases v6 / v5 / v2, niveaux affichés niveaux-h1-v6 (≤ 8 par côté). Contrôle local `moteur/copilote/fleches-h1/controle-v6.mjs` → `RAPPORT-CONTROLE-V6.md` : v2 195 flèches (60,9 % des vertes en régime baissier, 67,1 % des rouges en régime haussier, séries 16 / 12), v5 72 (0 % / 0 %, 9 / 7), v6 510 dont 444 rebonds confirmés (86,4 % / 87,7 %, séries 20 / 14) ; rebond de 3 882 : verte v6 posée le 30/10 à 22 h (touche 21 h sur 3 873,8), puis 31/10 13 h et 01/11 21 h. Pause de 2,5 s observée en H1 : l’étude des zones existante (`etudeReaction`), pas v6 (profil processeur). v1 à v5 et leurs registres intacts. Tests : `fleches-h1-v6-test.mjs` (59), v2 à v5, réel `fleches-rejeu-reel-test.mjs` (v2 à v6 sans redessin), Chrome `or-fleches-h1-chrome-test` (21), `or-graphique-test` (74), `or-chrome-test` (31) |

---

# Étude « balayage de liquidité sous un range, contexte MA200 / zone de volume » sur l'or (2026-11-07) — avancement

Reprendre ici. Branche `balayage-range`, fusionnée dans `main`. Le rapport est HORS dépôt : `agent-trading/RAPPORT-BALAYAGE-RANGE.md`. Ses règles figées `balayage-v1` ont été écrites le 2026-11-07 à 13:15 UTC, avant tout test. La planche de contrôle est aussi HORS dépôt : `agent-trading/PLANCHE-BALAYAGE.html`.

| Étape | État |
|---|---|
| 1. Règles figées. Range de 20 bougies, largeur ≤ 2,5 ATR, 2 touches par bord. Balayage ≥ 0,1 ATR, puis clôture de retour en 1 à 3 bougies. Stop au point extrême ± 0,1 ATR, au plus 2 ATR. Sortie à 4 ou 8 bougies. Contextes a, b (MA200 H1) et c (niveau clé). 6 variantes, plus 2 variantes à objectif (milieu, 3R) pour le meilleur contexte choisi sur la calibration. | fait |
| 2. Calibration PAXG avant le 01/11/2025, hors échantillon sur XAUUSDT, 1000 tirages au hasard, correction de Holm. Une confirmation sur XAUUSDT avant la coupe est impossible : la série commence le 2025-12-11. | fait |
| 3. Frais : 4 jeux, comme pour `cassure-v1` (`frais.json` local). Coût en R, réussite nécessaire à l'équilibre, achats et ventes séparés. | fait |
| 4. Planche de 40 balayages tirés au hasard, sans résultat. | faite ; **retours de Justin en attente** (à noter dans le rapport comme limites, sans changer les règles) |
| 5. Résultats et verdict | « pas assez de données » pour les 8 variantes et les 4 jeux de frais : 0 à 12 trades hors échantillon. Frais taker ≈ 0,6 à 0,85 R par trade en médiane (stops serrés), toutes les variantes négatives après frais. |
| 6. Non validé : pas de famille de propositions. Seul l'événement d'information « balayage de range détecté » (`BALAYAGE_RANGE`) est ajouté. | fait côté moteur ; **actif au prochain redémarrage du moteur** |
| 7. Tests (`moteur/tests/balayage-test.mjs` dans `npm test`), commit, push | fait |

- Moteur (hors dépôt) : `agent-trading/moteur/copilote/balayage/` (`regles-balayage.js`, `etude-balayage.mjs`, `rapport-balayage.mjs`, `planche-balayage.mjs`) ; branchement dans `moteur/copilote/info/{index,regles-info}.js`. Résultats : `etude-or.json` et `rapport-fin.md` dans le dossier `copilote/balayage` des données locales du moteur.

---

# Étude « cassure de range M15, tenue 3-4 bougies » (2026-11-06) — avancement

Reprendre ici. Branche `cassure-range`, fusionnée dans `main`. Rapport HORS dépôt : `agent-trading/RAPPORT-CASSURE-RANGE.md` (règles figées `cassure-v1` écrites avant tout test, 4 jeux de frais, verdict).

| Étape | État |
|---|---|
| 1. Règles figées (range N=12/20 ≤ 2,5 ATR, 2 touches par bord, cassure 0,1 ATR, volume 1,5 × médiane 20 ou non, stop bord opposé 0,75–2 ATR, sortie 3e/4e bougie ; 8 variantes) | fait |
| 2. Calibration < 01/11/2025, hors échantillon 12 derniers mois, 1000 tirages au hasard, Holm | fait |
| 3. Frais (fichier local hors dépôt) : zéro, maker 0,02 %, taker 0,05 % + spread/glissement mesurés sur Kraken PF_XAUUSD, stress 0,215 % ; grille officielle Kraken Futures dans le rapport | fait |
| 4-5. Résultats et verdict : or, Nasdaq (QQQ), S&P (SPY), BTC, ETH | fait : « pas assez de données » partout (< 100 trades hors échantillon) ; or négatif AVANT frais en calibration, frais taker ≈ 0,55 R/trade |
| 6. Or non validé → seulement l'événement d'information « cassure de range détectée (avec ou sans volume) » (`CASSURE_RANGE`), aucune position | fait côté moteur ; **actif au prochain redémarrage du moteur** (redémarrage refusé à Claude) |
| 7. Tests (`npm test` dans `agent-trading/`, `moteur/tests/cassure-test.mjs`), commit, push | fait |

- Moteur (hors dépôt) : `agent-trading/moteur/copilote/cassure/` (`regles-cassure.js`, `series.js`, `etude-cassure.mjs`, `rapport-cassure.mjs`, `mesure-kraken.mjs`) ; branchement `moteur/copilote/info/{index,regles-info}.js`. Données et frais : `%LOCALAPPDATA%\Rayle\agent-trading\copilote\cassure\`.

---

# Graphique, carnets Kraken, Terre classique (2026-11-05/06) — avancement

Reprendre ici. Branche `copilote-graphique`, fusionnée dans `main`. Rapport HORS dépôt : `agent-trading/RAPPORT-V2.md`.

| Partie | État |
|---|---|
| 1. Graphique M15/H1 type TradingView, zones de volume en rectangles, tous les niveaux, cases à cocher mémorisées, prix Kraken, alertes actives par défaut, mesure « rejet net » (`info-v2`) | fait |
| 2. Carnet Kraken par actif (WebSocket Futures depuis le navigateur, carnet complet, séquences, regroupement, spread, déséquilibre, âge, grosses transactions, contrôle 0,1 %) | fait (pas de checksum : l'API Futures n'en a pas) |
| 3. Onglet « Graphique Kraken » (widget TradingView, symboles KRAKEN:*.PM, or compris) | fait |
| 4a. Terre classique par défaut, Terre 2.0 = bouton expérimental (PC) | fait |
| 4b. Flashs au zoom : cause = photos IGN hors couverture (blanc pur / aplat) + halo ; corrigé, test `tests-navigateur/terre-flash-test.mjs` | fait ; reste un « trou » sombre d'une image, parfois (non corrigé) |
| 4c. PC, tablette, téléphone, captures | fait (émulation Chrome) |

- Moteur (hors dépôt) : `moteur/copilote/info/regles-info-v2.js`, `retro-info-v2.mjs` (pertinence-v2.json), `index.js` ; tests `moteur/tests/info-v2-test.mjs`, Chrome `moteur/tests/ecran-v2.mjs`. Moteur redémarré (info-v2).
- Dépôt : `agent-trading/front/{niveaux-graphique,etiquettes-calcul,carnet-kraken,graphique-kraken}.js`, `carnet.js`, `graphique.js`, `vue.js` ; Terre : `galaxie/galaxie.js`, `planetes/terre/pc/{index,interface-terre,tuiles,shaders-terre,worker-tuiles,globe,style-vecteur}.js`, `terre-v2/voix.js` ; tests `tests-navigateur/terre-flash-test.mjs`, `terre-classique-defaut-test.mjs`.

---

# Copilote d'INFORMATION (2026-11-05, soir) — avancement

Reprendre ici. Branche `copilote-info`, fusionnée dans `main`. Rapport HORS dépôt : `agent-trading/RAPPORT-INFO.md`. Changement de cap : plus aucune alerte « plan de position » ni ACHAT/VENTE ; constats de marché seulement (mode observation, Worker principal `rayle` intact).

| Étape | État |
|---|---|
| A. Détecteur figé `info-v1` (approche, toucher, balayage dont Asie, volume anormal, delta retourné, cassure avec volume / fragile, ouverture 10 min, annonce 20 min), or puis BTC/ETH/HYPE/Nasdaq/S&P, prix Kraken = réf. Binance + écart affiché | fait |
| B. Marques + survol, fil « Ce qui se passe », Telegram « INFO MARCHÉ, pas un signal » (pont existant, seulement si configuré) | fait (type technique ENTREE : seul type relayé par le Worker principal) |
| C. Anti-bruit (1 par niveau et type, 60 min, plafond or 8 / autres 4, heures calmes 23–07 réglables, couper, regroupement) | fait côté moteur ; **réglages depuis l'app : déployer le Worker de l'agent** (`npx.cmd wrangler deploy --config agent-trading/worker/wrangler.toml`, refusé à Claude) puis redémarrer le moteur |
| D. Pertinence vs 1000 niveaux au hasard ; types inutiles désactivés par défaut | fait : or = aucun type utile ; volume anormal / cassure avec volume utiles sur BTC, ETH, indices |
| E. Phases B et C : graphique façon TradingView, profil masqué par défaut, 8 niveaux au plus, alertes en petit message en coin | fait |
| F. Tests, rapport, commit, push | fait |

- Moteur (hors dépôt) : `agent-trading/moteur/copilote/info/` (`regles-info.js`, `sources-info.js`, `index.js`, `retro-info.mjs`). Tests : `moteur/tests/info-test.mjs` (npm test), Chrome `moteur/tests/ecran-info.mjs`.
- Dépôt : `agent-trading/front/copilote-info.js` + `copilote-visuel.js`, `graphique.js`, `vue.js`, `connexion.js`, `agent.css` ; relais `info-reglage` dans `agent-trading/worker/src/index.js` (NON déployé).
- Le copilote de l'or « or-v1 » (plans A/B) n'est plus démarré ; `front/copilote-or.js` supprimé.

---

# Phase F « Copilote de l'or » (2026-11-05) — avancement

Reprendre ici. Branche `copilote-or`, fusionnée dans `main`. Rapport complet HORS dépôt : `agent-trading/RAPPORT-OR.md`. Phases B et C : pas commencées (l'or passait avant).

| Étape | État |
|---|---|
| 1. Flux comparés sur 30 j (7 sources gratuites) → référence Binance perpétuel XAUUSDT, exécution Kraken PF_XAUUSD (écart + fourchette en direct), « données insuffisantes » sinon | fait |
| 2. Sessions figées (Asie 00:00–08:00 Paris, Londres 08:00 Londres, New York 08:30 NY) ; balayage, cassure avec volume, rejet | fait |
| 3. Niveaux (8 au plus : veille, semaine, sessions, ronds 50/100, 2 zones de volume) | fait |
| 4. Annonces : Forex Factory + secours manuel (NFP, Fed) ; blocage −30/+15 min ; compte à rebours | fait |
| 5. Stops/cibles à l'ATR M15/H1, TROP TARD (R < 1,5), contrôle de fourchette Kraken | fait |
| 6. Plans A/B + checklist de l'or 6 critères sur le graphique ; Telegram (pont existant) seulement si validé, mention « SIMULATION, setup NON VALIDÉ » | fait (« PHASE D » absente du dépôt : pont Telegram existant utilisé) |
| 7. Bilan direct 8/24 bougies vs hasard ; rétro-test PAXG 2020→ + XAUUSDT, calibration/validation, Holm | fait : AUCUN setup validé, Telegram désactivé |
| 8. RAPPORT-OR.md | fait |

- Moteur (hors dépôt) : `agent-trading/moteur/copilote/or/` (`sources.js`, `comparer-sources.mjs`, `regles-or.js` figé `or-v1`, `calendrier-or.js`, `index.js`, `retro-or.mjs`). Tests : `moteur/tests/or-test.mjs` (dans `npm test`), Chrome `moteur/tests/ecran-or.mjs` (serveur 8011 + `REEL=1 relais-page.mjs 8799`).
- Dépôt : `agent-trading/front/copilote-or.js` + branchements `graphique.js`, `vue.js`, `copilote-visuel.js`, `agent.css`.
- Moteur redémarré le 2026-11-05 19:27 UTC : « copilote or : démarré or-v1 ».

---

# Mission « Copilote visuel » (2026-11-05) — avancement

Reprendre ici. Branche `copilote-visuel`, fusionnée dans `main` à la fin. Rapport complet HORS dépôt : `agent-trading/RAPPORT-COPILOTE.md`.

| Phase | État |
|---|---|
| 1. Bandeau « situation » (tendance H1/H4 par structure, position, phrase) | fait |
| 2. Niveaux (veille, semaine, Asie, Londres, VWAP ; VAH/POC/VAL affichage) | fait |
| 3. Plans A/B (zone, invalidation, cibles 2R–5R, TROP TARD 1,5 réglable, recalcul M15, raison du retrait) | fait |
| 4. Checklist de confluence n/6 (détail au toucher, alerte dans l'app avec capture, plafonds 4/j et 2/actif/j) | fait |
| 5. Setups nommés v1 (figés, versionnés) | fait |
| 6. Journal et bilan (8 et 24 bougies, R net, hasard, « Je l'ai pris », rétro-test calibration/validation) | fait : AUCUN setup validé, alertes des setups désactivées |
| 7. Commentaire + « Demander au copilote » (données structurées, « je ne sais pas ») | fait |
| Fin : tests, 4 tests Kepler obsolètes corrigés, rapport, Worker rayle-agent-trading redéployé | fait |

- Moteur (hors dépôt) : `agent-trading/moteur/copilote/visuel/` (`regles.js`, `index.js`, `retro.mjs`, `qualite.mjs`). Tests : `moteur/tests/visuel-test.mjs` (dans `npm test`), Chrome `moteur/tests/ecran-visuel.mjs`.
- Dépôt : `agent-trading/front/copilote-visuel.js`, `agent-trading/commun/questions.js`, ajouts `graphique.js`, `vue.js`, `connexion.js`, `agent.css`, Worker `agent-trading/worker/src/index.js` (relais « Je l'ai pris »).
- Après un déploiement du Worker de l'agent : redémarrer le moteur (sinon il reste sur l'ancienne instance).

---

# Nuit autonome (2026-11-05) — avancement

Reprendre ici : lire ce fichier, puis `RAPPORT-NUIT.md`. Reprendre à la première tâche non terminée. Branches de travail : `nuit/pN`, fusionnées dans `main` à chaque fin de phase.

| Phase | État | Date |
|---|---|---|
| 1. Enregistrement renforcé | fait | 2026-11-05 |
| 2. Gros mouvements, fiches, analyse | fait | 2026-11-05 |
| 3. Copilote : zones et ranges | fait | 2026-11-05 |
| 4. Copilote : flèches et bilan | fait | 2026-11-05 |
| 5. Terre 2.0 : étude et architecture | fait | 2026-11-05 |
| 6. Terre 2.0 : globe et villes 3D | fait (sans jeton testé) | 2026-11-05 |
| 7. Terre 2.0 : couches gratuites | fait | 2026-11-05 |
| 8. Terre 2.0 : modes de vision | fait | 2026-11-05 |
| 9. Rayle pilote la Terre | fait | 2026-11-05 |
| 10. Vérification finale | fait | 2026-11-05 |

## Fait
- **Phase 1** : `agent-trading/moteur/collecte.js` (hors dépôt) branché dans le moteur : carnet 50 niveaux/côté toutes les 5 s, toutes les transactions (ms, côté agresseur), événements de murs, OI + funding chaque minute, bougies M15/H1 closes (volume acheteur/vendeur, delta, empreinte), trous marqués (`collecte/trous.jsonl`), vidage gzip chaque minute, rotation horaire, ménage 200 jours / 30 Go, contrôle d'intégrité + sauvegarde quotidienne (`C:\Users\justi\Sauvegardes-Rayle\donnees-marche\<jour>`, manifeste sha256) avec ligne dans le Journal. Flux complet du carnet ramené à 14 jours / 12 Go. Moteur redémarré, enregistrement vérifié. Test : `moteur/tests/collecte-test.mjs`.
- **Phase 2** : `agent-trading/moteur/etude-mouvements/` (hors dépôt) : `detection.js`, `signes.js`, `donnees.js`, `fiches.js`, `hebdo.mjs` (lancé par le moteur chaque lundi ≥ 06:00 UTC, priorité basse). Premier rapport `RAPPORT-MOUVEMENTS-2026-11-04.md`, 1 339 fiches + planches (`%LOCALAPPDATA%\Rayle\agent-trading\mouvements\`). Test : `moteur/tests/mouvements-test.mjs`.

- **Phase 3** : zones de volume + ranges (moteur `copilote/zones.js`, `copilote/index.js`, dessin `front/graphique.js`).
- **Phase 4** : flèches (`copilote/fleches.js`, `copilote/suivi.js`), bulle, bilan, rejeu dans Backtest, notification, réglage Telegram verrouillé. Tests : `moteur/tests/copilote-test.mjs`, Chrome `moteur/tests/ecran-copilote.mjs`.

- **Phases 5-8** : `terre-v2/` (index, config, vision, couches/*, relais/ déployé), `TERRE-V2-PLAN.md`, `THIRD_PARTY_NOTICES.md`. Tests : `galaxie/tests/terre2-test.mjs` (dans `npm test` à la racine), Chrome `tests-navigateur/terre2-test.mjs`.

- **Phase 9** : `terre-v2/voix.js` + branchement `core/intelligence/phrase.js`. Tests : `galaxie/tests/terre2-test.mjs`, Chrome `tests-navigateur/terre2-test.mjs`, `terre2-integration-test.mjs`.

- **Phase 10** : tests et captures (voir RAPPORT-NUIT.md).

## En cours
- Rien : les 10 phases sont faites. Reste : voir « Ce qui reste » dans RAPPORT-NUIT.md (jeton Cesium, clés, conditions Caltrans).

## Bloqué
- (rien)
