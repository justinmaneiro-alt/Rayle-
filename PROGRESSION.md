# PROGRESSION : mission « Trader Pro » (branche `maj-trader-pro`)

Reprise après coupure : relire ce fichier, `git log --oneline -15`, `git status`, puis continuer à la première phase non cochée.
Règles : aucune clé API touchée ; aucune donnée de trading dans git (`donnees-privees/` ignoré) ; ni numéro de compte ni montant dans un fichier suivi ; vérifier `git status` avant chaque commit.

## Phases
- [x] Étape préliminaire : historique XTB copié dans `donnees-privees/` (ignoré par git) et étudié
- [ ] Phase 0 : audit (bugs ci-dessous)
- [ ] Phase 1 : fenêtre Marchés pro
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
1. Fenêtre Marchés : la section « Panneaux détaillés » monte l'ancienne interface du terminal (`marches-ui.js`) DANS la fenêtre : deuxième barre d'onglets, champ « Commande » et « Copilote Rayle » en petites boîtes (styles du terminal, non adaptés), d'où les doublons et le débordement.
2. `fiche()` attend 7 lectures en `Promise.all` (bougies H1 et J, cours, calendrier, actus, COT) puis un calcul en Worker : la plus lente (ou un Worker qui ne répond pas) bloque « Lecture des données… » sans délai ni bouton Réessayer.
3. Bougies de 1 Mo (H1 de l'or ≈ 1 Mo) téléchargées à chaque fiche : lent sur téléphone.
4. Or : trois sources différentes (PAXG dans Marchés/corrélations, futures GC=F dans la fenêtre, Kraken PF_XAUUSD dans le terminal, autre sur l'accueil) → prix différents.
5. Worker principal `worker/` non suivi par git (règle du projet) : le code du Worker existant n'est pas dans ce dépôt ; un Worker DÉDIÉ est ajouté pour le portefeuille (comme `relais-or` et `agent-trading/worker`).
(la suite de l'audit est complétée phase par phase)
