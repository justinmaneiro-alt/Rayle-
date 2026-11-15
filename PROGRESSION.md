# PROGRESSION : mission « Trader Pro » (branche `maj-trader-pro`)

Reprise après coupure : relire ce fichier, `git log --oneline -15`, `git status`, puis continuer à la première phase non cochée.
Règles : aucune clé API touchée ; aucune donnée de trading dans git (`donnees-privees/` ignoré) ; ni numéro de compte ni montant dans un fichier suivi ; vérifier `git status` avant chaque commit.
Outils de contrôle : `node trader-pro/tests/analyse-test.mjs` (calculs purs) ; Chrome : `node serveur.mjs 8000` + `node outils-donnees/serveur-snapshots.mjs <dossier> 8801` puis `node trader-pro/tests/marches-chrome.mjs tel|tablette|pc` ;
instantanés « pro » en local : `node outils-donnees/snapshots.mjs --sortie <dossier> --lot pro` (le dossier contient une copie de la branche `donnees`) ; precache + version : `node trader-pro/outils/precache.mjs <version>`.

## Phases
- [x] Étape préliminaire : historique XTB copié dans `donnees-privees/` (ignoré par git) et étudié
- [x] Phase 0 : audit (liste ci-dessous, complétée au fil des phases)
- [x] Phase 1 : fenêtre Marchés pro (`trader-pro/marches/`) : fait et testé dans Chrome (téléphone, PC) ; reste : Telegram des alertes (Phase 3, Worker dédié)
- [x] Phase 2 : fenêtre Couverture (trader-pro/couverture/) : fait et testé (calculs purs + Chrome)
- [x] Phase 3 : fenêtre Portefeuille XTB (trader-pro/portefeuille/, Worker dédié trader-pro/worker/) : import réel vérifié, coach et synchronisation testés ; le Worker reste à déployer par Justin (trader-pro/worker/LISEZMOI.md)
- [x] Phase 4 : Terminal H4 / Jour (trader-pro/terminal/) : MA200 H4/J réelles, niveaux forts, signaux, backtest walk-forward, alertes voix + Telegram, graphique propre + « Détails », cache des bougies
- [x] Phase 5 : fiches d'ordre XTB (taille en lots) et voix de Rayle (portefeuille, risque, erreurs, couverture, signaux, COT)
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

## Notes de fin de Phase 2 et 3
- Fenêtres Couverture et Portefeuille ajoutées au carrousel et au dock (9 icônes, libellés courts sur téléphone). Le dock à 9 icônes dépassait la largeur d'un téléphone de 412 px (la page s'élargissait) : corrigé.
- Import XTB vérifié sur le vrai fichier : Profit/Loss = brut + commission + swap ; la trésorerie (Close trade + Correction + Swap) retombe exactement sur le résultat net des positions ; la somme des opérations égale la ligne « Total » du fichier ; aucun numéro de compte conservé. Les chiffres du compte ne sont PAS écrits ici : ils sont dans le résumé final.
- Le solde avant le 31/12/2025 n'est pas dans l'export : le « solde reconstitué » part de zéro sauf si le réglage « solde au 31/12/2025 » est saisi ; sans capital saisi, aucun pourcentage de risque n'est affiché.
- Drawdown calculé sur le résultat cumulé en euros et en % du capital apporté (une valeur relative au solde explose quand le solde est proche de zéro).
- R seulement quand le stop final est du côté de la perte (sinon le risque initial est inconnu) : estimation.
- .gitignore : « worker/ » ignorait aussi trader-pro/worker/ ; exception ajoutée (code sans secret).
- Worker Portefeuille : D1, verrou par code (secret PORTEFEUILLE_CODE) ou jeton Rayle validé par le Worker principal (refus si ce dernier accepte un faux jeton), alertes de prix par Telegram (cron 5 min). Testé avec un vrai SQLite et un faux appareil ; NON déployé.
- Non vérifié : vrai téléphone/tablette ; Worker déployé ; Telegram réel ; IA de Rayle réelle pour le rapport (repli calculé testé).

## Notes de fin de Phase 4 et 5
- Moteur de signaux H4/Jour (trader-pro/terminal/signaux-hj.js) : biais Jour (MA200 J et pente), signal à la clôture (rebond sur niveau / MA200, cassure + retest), stop au-delà du swing, objectif au prochain niveau Jour ≥ 2 R. Aucun signal ne se redessine (testé). Règles fixées avant le calcul.
- Backtest honnête (trader-pro/terminal/BACKTEST-HJ.md, backtest-hj.json) : walk-forward ; résultats hors échantillon : voir le rapport et le résumé final. Le délai H4 est passé de 6 à 12 bougies APRÈS un premier essai qui donnait 6,3 signaux par mois sur l'or (trop) : choix fait sur le nombre de signaux, pas sur le résultat ; les chiffres du premier essai sont conservés dans le rapport.
- Terminal : le graphique d'origine (agent-trading/front/or/*) n'a pas été réécrit : intégration par trader-pro/terminal/integration.js (+ CSS) ; trois corrections ciblées dans graphique-or.js (bande de référence et niveaux proposés masqués en mode propre ; recadrage quand la série passe de quelques bougies à tout l'historique) et un cache IndexedDB des bougies dans moteur-or.js (affichage immédiat, le réseau remplace ensuite). « ?pro=0 » désactive la couche pro.
- Robot : alertes H4/Jour par Telegram sans le PC (trader-pro/terminal/alertes-hj.mjs, étape ajoutée à .github/workflows/alertes.yml) ; premier passage = mémorisation sans envoi.
- Fiche d'ordre : nom XTB, sens, entrée, stop, objectif, R/R, taille en lots (capital × risque % ÷ (distance × valeur du point)) ; décalage au comptant pour l'or ; rien n'est envoyé à XTB.
- Voix : window.TraderPro.commande (chargeur léger) branché dans core/intelligence/phrase.js ; intentions testées.
