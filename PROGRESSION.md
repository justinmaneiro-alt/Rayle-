# PROGRESSION : mission « Trader Pro » (branche `maj-trader-pro`)

Reprise après coupure : relire ce fichier, `git log --oneline -15`, `git status`, puis continuer à la première phase non cochée.
Règles : aucune clé API touchée ; aucune donnée de trading dans git (`donnees-privees/` ignoré) ; ni numéro de compte ni montant dans un fichier suivi ; vérifier `git status` avant chaque commit.
Outils de contrôle : `node trader-pro/tests/analyse-test.mjs` (calculs purs) ; Chrome : `node serveur.mjs 8000` + `node outils-donnees/serveur-snapshots.mjs <dossier> 8801` puis `node trader-pro/tests/marches-chrome.mjs tel|tablette|pc` ;
instantanés « pro » en local : `node outils-donnees/snapshots.mjs --sortie <dossier> --lot pro` (le dossier contient une copie de la branche `donnees`) ; precache + version : `node trader-pro/outils/precache.mjs <version>`.

## Phases
- [x] Étape préliminaire : historique XTB copié dans `donnees-privees/` (ignoré par git) et étudié
- [x] Phase 0 : audit (liste ci-dessous, complétée au fil des phases)
- [x] Phase 1 : fenêtre Marchés pro (`trader-pro/marches/`) : fait et testé dans Chrome (téléphone, PC) ; reste : Telegram des alertes (Phase 3, Worker dédié)
- [ ] Phase 2 : fenêtre Couverture
- [ ] Phase 3 : fenêtre Portefeuille XTB (import, stockage Cloudflare, coach)
- [ ] Phase 4 : Terminal H4 / Jour, signaux, backtest, alertes
- [ ] Phase 5 : fiches d'ordre XTB et voix
- [ ] Phase 6 : contrôle final, fusion dans main, publication

## Structure du fichier XTB (étape préliminaire)
Export xStation « EUR_<compte>_<début>_<fin>.xlsx » dans un .zip. Trois feuilles :
- **Closed Positions** (en-têtes ligne 5) : Instrument, Ticker, Category, Type (BUY/SELL), Volume, Open Price, Open Time (UTC), Close Price, Close Time (UTC), Product, Profit/Loss, Gross Profit, Purchase Value, Sale Value, Stop Loss, Take Profit, Commission, Margin, Swap, Rollover, Open/Close Conversion Rate, Close Origin, Position ID, Comment (« [S/L] » = sorti par le stop).
- **Cash Operations** (en-têtes ligne 5) : Type (Deposit, Withdrawal, Free funds interest, Free funds interest tax…), Instrument, Ticker, Category, Time, Amount, ID, Comment, Product, Position ID.
- **Open Positions** : résumé (valeur, profit) puis une ligne par instrument et une par position (Position ID dans « Instrument/Position »).
- Dates : numéros de série Excel (jours depuis 1899-12-30), en UTC. Nombres : vrais nombres (pas de virgule décimale dans le xlsx ; à prévoir pour un CSV). Devise du compte : EUR. Volume en lots (0,001 = micro-lot). Position ID stocké en nombre (2.8E9) : convertir en entier. Cellules vides = chaîne vide.

## Audit : bugs trouvés (Phase 0)
1. **Marchés, doublons et champs coupés** : la section « Panneaux détaillés » montait l'ancienne interface du terminal (`marches-ui.js`) DANS la fenêtre : deuxième barre d'onglets, champ « Commande » et « Copilote Rayle » en petites boîtes (styles du terminal), barre qui déborde. → corrigé : une seule navigation, aucun `<details>` en double.
2. **Chargement infini** : `fiche()` attendait 7 lectures en `Promise.all` puis un calcul en Worker sans délai ni « Réessayer ». → corrigé : copie locale d'abord, 6 s par source, chaque bloc se charge seul, message + Réessayer (`trader-pro/commun/donnees.js`, `ui.js`).
3. **Lenteur** : bougies H1 de 1 Mo téléchargées à chaque fiche. → nouveaux instantanés `pro-<actif>.json` (J, H4, H1, M15 prêts, 100 à 260 Ko) construits par le robot (`outils-donnees/pro.mjs`).
4. **Prix de l'or différents** : PAXG (Marchés, 3 828), perpétuel Kraken (terminal, 3 840), spot Twelve Data par le Worker (accueil, 3 886 = clôture du vendredi, proche des 3 883 de XTB), futures GC=F. → un seul prix : `prixOr()` = spot XAU/USD du Worker (même chiffre que l'accueil) ; repli perpétuel Kraken (indication le week-end, dit à l'écran) ; repli instantané. Terminal : à unifier en Phase 4.
5. **`veille` fausse dans les instantanés de bougies** (champ `veille` = première bougie de la plage, ex. 2 330 pour l'or) : ne plus l'utiliser ; la variation vient de la clôture de la veille dans la série journalière.
6. **BCE HTTP 503** : le portail SDMX répond parfois 503. → secours Frankfurter (mêmes cours de référence BCE) dans `marches/donnees/connecteurs.js` (`lotBce`).
7. **Lightweight Charts** : `fitContent()` avec plusieurs volets et largeur pas encore connue laissait un espacement minimal (données écrasées à droite). → `trader-pro/commun/graph.js` réapplique la plage à chaque changement de taille.
8. **Calendrier** : le flux Forex Factory ne fournit pas le chiffre « publié » : affiché seulement s'il existe, sinon « non fourni par la source » (jamais inventé).
9. **Worker principal absent du dépôt** (`worker/` ignoré par git) : un Worker DÉDIÉ sera ajouté pour le portefeuille (comme `relais-or`).
10. Avant ce lot, `tactile-chrome.mjs` avait déjà un échec connu (« aucune zone visible pour le test d'appui sur un niveau »).
(la suite de l'audit est complétée phase par phase)

## Notes de fin de Phase 1
- Fichiers : `trader-pro/{commun,marches,tests,outils}/`, `outils-donnees/pro.mjs` (+ lot `pro` dans `snapshots.mjs`), `core/commun/application.js` (le carrousel ouvre la nouvelle fenêtre), `sw.js` / `index.html` / `precache.json` (version 2026.11.15.1).
- Les `pro-*.json` n'existent sur la branche `donnees` qu'après le prochain passage du robot sur main (le workflow se déclenche au push sur main) ; d'ici là la fenêtre affiche « aucune donnée » avec Réessayer pour les actifs (le robot actuel publie encore les anciens fichiers). Le repli sur les anciens `bougies-*.json` n'est volontairement pas codé (1 Mo, lent).
- Non vérifié : vrai téléphone / tablette ; prix spot par le Worker (aucun Worker configuré dans les tests Chrome : repli Kraken testé) ; voix réelle.
