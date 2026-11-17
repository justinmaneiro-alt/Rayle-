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
- [~] Phase 6 : contrôle final fait (tests purs et Chrome PC/tablette/téléphone) ; fusion dans main et publication : EN ATTENTE de l'autorisation de pousser (voir ci-dessous)

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
11. Dock du carrousel : 9 icônes dépassaient 412 px (la page s'élargissait sur téléphone) → icônes qui rétrécissent, libellés courts.
12. Terminal : après un changement d'unité (H4 → Jour) le graphique pouvait rester calé sur l'ancienne plage (une seule bougie tout à gauche) → recadrage sur les dernières bougies.
13. Terminal : « Chargement du graphique… » long (historique paginé relu à chaque ouverture) → copie locale IndexedDB des bougies, affichage immédiat.
14. `.gitignore` : « worker/ » ignorait aussi trader-pro/worker/ → exception ajoutée (code sans secret).
15. Tests Chrome anciens du terminal : 2 échecs DÉJÀ présents sur main (couches par défaut, « aucun autre actif que l'or ») : non causés par ce lot (vérifié sur une copie de main).
16. Alertes Telegram GitHub : les flèches H1 ne partent plus (ALERTES_FLECHES_H1=0) ; seuls les signaux H4/Jour sont annoncés.
17. FUITE CORRIGÉE : le numéro de compte XTB figurait dans 3 fichiers de test du commit Phase 3 déjà poussé sur la branche GitHub. Corrigé et historique local réécrit (sans ce numéro) ; **la branche distante doit être remplacée par un push forcé** (ou supprimée puis repoussée) : voir le résumé final.

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

## Phase 6 : contrôle final
- Tests purs : `npm test` (trader-pro/tests/*-test.mjs) ; Chrome : marches-chrome (tel, pc), couverture-chrome (tel, tablette), terminal-chrome (tel, tablette, pc), portefeuille-chrome (tel, pc) : tous verts.
- Le terminal « pro » ne se charge pas dans les navigateurs pilotés par test sauf avec ?hj=1 (convention de terminal-pro.js) : les anciens tests du terminal ne changent pas.
- Aucune donnée de trading suivie par git (donnees-privees/ ignoré) ; aucun numéro de compte ni montant dans les fichiers suivis (vérifié par recherche dans tout l'historique réécrit).
- Reste à faire par Justin : déployer le Worker Portefeuille (trader-pro/worker/LISEZMOI.md), poser les secrets, autoriser le push forcé de la branche puis le push de main.

# MISE À JOUR V2 (branche `maj-trader-pro-v2`) : autonomie totale, phases 1 à 6
Reprise : relire ce fichier, `git log --oneline -15`, `git status`, puis continuer à la première phase V2 non cochée. Mêmes règles (aucune clé API touchée, aucune donnée inventée, aucune donnée de trading dans git, PC + tablette + téléphone). Marchés (Aujourd'hui, COT, Macro, Actualité, Alertes) et Couverture : seulement les bugs listés.
- [x] V2-Phase 1 : bugs de la vidéo
- [x] V2-Phase 2 : graphique du terminal (H1/H4/Jour seulement, une seule MA200 de l unité affichée, S/R de l unité + Jour)
- [x] V2-Phase 3 : flèches Daily simples (3 méthodes testées, backtest, encart)
- [x] V2-Phase 3 bis (2026-11-17) : NOUVELLES flèches Daily (zigzag ATR) à la place de TOUT l’ancien système — voir « V2-Phase 3 bis : notes »
- [ ] V2-Phase 4 : dashboard enrichi (score de marché, volume net USD, ATR, perfs…)
- [ ] V2-Phase 5 : données XTB sur tous les appareils (Worker prêt à déployer, états de synchro, import)
- [ ] V2-Phase 6 : publication + déploiement Cloudflare guidé

## V2-Phase 1 : notes
- Prix de l'or : UN seul prix = `prixOr()` (XAU/USD au comptant du Worker de Rayle). Lecture partagée 15 s entre les fenêtres (même chiffre partout) ; dernier cours reçu gardé sur l'appareil (localStorage `tp_prix_or_dernier`) : si le direct ne répond pas, on garde CE cours (jamais un chiffre Kraken) ; week-end : dernier cours de clôture + mention « marché fermé ». Terminal : l'en-tête montre ce prix (`window.__tpPrixRef`, lu par `tableau-or.js`), le dernier cours Kraken n'est plus affiché sur l'échelle ; les bougies restent celles du perpétuel Kraken (étiqueté « XAU/USD · bougies Kraken »). Marchés > Actifs n'affiche plus le prix de l'instantané avant l'arrivée du comptant.
- Nombres : `trader-pro/commun/nombre.js` (`lireNombre`) accepte virgule et point (aussi « 1 234,5 », « 1.234,5 », virgule arabe/pleine chasse) ; filtre global des champs `inputmode="decimal"` qui ne retire jamais la virgule tapée ; Couverture, Portefeuille (réglages), alertes l'utilisent.
- Couverture : changer un champ efface les résultats AUSSITÔT (titre compris) puis recalcule après une courte pause ; les valeurs tapées survivent aux redessins.
- Terminal : aperçu immédiat = dernières bougies de la copie locale (IndexedDB) dessinées dans le squelette (`agent-trading/front/terminal/apercu-cache.js`), levé quand le vrai graphique a des bougies ; « Période de réglage » supprimée (dessin + infobulle).
- Tests : `nombre-test`, `prix-or-test` (purs, dans `npm test`) ; `couverture-chrome` étendu.

## V2-Phase 3 : notes
- Anciens signaux H4/J supprimés (signaux-hj, lecture-hj, backtest-hj, alertes-hj, fiche d'ordre). Nouveau : `trader-pro/terminal/fleches-daily.js` (3 méthodes causales et invariantes par translation), `fleches-eval.js`, `backtest-fleches.mjs` (10 ans Daily, apprentissage 60 % / hors échantillon 40 %, hasard 400 tirages), rapport `BACKTEST-FLECHES.md`.
- Méthode retenue (meilleur F1 d'apprentissage) : pivot de swing confirmé L=R=12, amplitude ≥ 5 ATR. Hors échantillon or+Nasdaq : précision ≈ 51 %, rappel ≈ 74 %, décalage ≈ 17 jours ; mouvement des 20 jours suivants ≈ 0 : elle confirme un retournement déjà amorcé, ce n'est pas un signal rentable ; Bitcoin (contrôle) : 24 % de bonnes.
- Registre local (`fleches-registre.js`) : une flèche publiée ne bouge jamais ; mêmes flèches dans le terminal et Marchés > Actifs ; H1/H4 : dernière bougie de la journée Daily. Alertes voix/Telegram/robot (`alertes-fleches.mjs`) seulement sur ces flèches.
- Piège : `.tp-doux` est masqué sur téléphone par rayle.css (ancien terminal) : contourné dans terminal-pro.css.

## V2-Phase 3 bis : notes (2026-11-17)
- Supprimé : tout l’ancien système de flèches (rebonds H1/H4, flèches MA200, versions v1 à v9, registre H1, historique, notifications, alertes-serveur / robot GitHub d’alertes, archives, tests et scripts de recherche associés). Les niveaux H1 affichés restent (extraits dans `agent-trading/front/or/niveaux-h1.js`).
- Ajouté : `trader-pro/terminal/zigzag-daily.js` (ATR 14, sommet / creux confirmé à 2,5 × ATR, 5 bougies minimum, alternance stricte, aucun repaint, pleine / pâle selon la MA200 Daily), `fleches-registre.js` (réglages, registre, annonces une seule fois), `verifier-fleches.mjs` + `VERIFICATION-FLECHES.md` (rapport par actif).
- Affichage : Jour = bougie extrême ; H4 = bougie H4 du plus haut / plus bas exact de la journée ; H1 = rien. Réglages : « Flèches Daily » + multiplicateur ATR par actif (panneau « Flèches Daily » et menu « Affichage »).
- MA200 : une seule par graphique, sur les bougies de SON unité ; quand l’historique affiché est trop court (or en Daily), complété avant la première bougie par la série de la même unité du robot.

## Retournements Daily (2026-11-17, remplace le zigzag ATR)
- Supprimé : `zigzag-daily.js`, `verifier-fleches.mjs`, `VERIFICATION-FLECHES.md`, `telecharger-daily.mjs`, `zigzag-test.mjs`.
- Ajouté : `trader-pro/terminal/retournements-daily.js` (module pur : zones Daily ± 0,3 ATR — 3 derniers sommets / creux, R1 R2 S1 S2, MA200 —, touch avec volume ≥ 1,2 × moyenne 20 j, confirmation par une clôture H4 dans les 5 jours, anti-bruit : 1 flèche par zone, 10 jours entre deux flèches de même sens, objectif à 2 R au moins ; plan entrée / stop / objectif), `fleches-registre.js` réécrit (registre par actif et version), 3 versions (complète, sans filtre volume, sens de la MA200), `tests/retournements-test.mjs` (66 vérifications dont walk-forward), `outils/telecharger-retournements.mjs`, `outils/backtest-retournements.mjs`, `terminal/VERIFICATION-RETOURNEMENTS.md`.
- Affichage : même flèche sur le Jour (bougie du jour de confirmation) et sur H4 (bougie de confirmation), rien en H1 ; info-bulle (zone, volume, entrée, stop, objectif) posée à côté de la flèche (l'ancienne info-bulle en haut à gauche cachait les boutons du graphique sur téléphone).
- Robot (`outils-donnees/pro.mjs`) : publie `vj` = volume Daily des futures COMEX GC pour l'or (le perpétuel Kraken n'a qu'un volume en contrats).
- Backtest (Or 2,4 ans, Nasdaq 2,9 ans de H4) : échantillon minuscule (3 à 10 signaux par version), défaut = « sans filtre volume » (la plus rentable en R total, pas la meilleure par trade).

## MA200 Daily + H4 (2026-11-17, remplace les Retournements Daily)
- Le Daily décide du sens (2 clôtures Daily au-delà de MA200 ± 0,5 ATR ; neutre sinon), le H4 du moment. Grosse flèche Daily au croisement confirmé ; petites flèches H4 (rebond sur support / cassure des 20 dernières bougies H4) uniquement dans le sens Daily, jamais contradictoires. Mêmes flèches sur le Jour et H4, rien en H1 ; fond du graphique teinté selon le sens Daily ; info-bulle type / entrée / stop / gain en R.
- Supprimé : `retournements-daily.js`, ses tests et son backtest. Ajouté : `trader-pro/terminal/ma200-h4.js`, `fleches-registre.js` réécrit, `tests/ma200-test.mjs` (62 vérifications dont walk-forward), `outils/backtest-ma200.mjs`, `outils/telecharger-historique.mjs`, `terminal/VERIFICATION-MA200.md`.
- Robot : `h4` passe de 900 à 3600 bougies (≈ 2 ans d'or) dans les instantanés `pro-<actif>.json` ; Daily : 1300 bougies (≥ 3 ans).

## MA200 Daily + H4 : moins de flèches (2026-11-17)
- Variantes testées en walk-forward (or + Nasdaq 100) : V0 première version, V1 grosses seules, V2 grosses + rebonds sur zone Daily, V3 = V2 + 2 petites par tendance ; filtres anti-piège des grosses : 3 clôtures / marge 1 ATR. Défaut : **V2 + marge 1 ATR** (≈ 4 flèches par an sur l'or, 2 sur le Nasdaq 100 ; critère « total sans le meilleur trade positif » non rempli sur le Nasdaq : −0,14 R). Détail : `trader-pro/terminal/VERIFICATION-MA200.md`.
- Info-bulle : ne recouvre plus l'échelle des prix (rectangle noir à droite du graphique corrigé).

## Téléphone : ancienne version, flèches de l'ancienne variante, rectangle noir (2026-11-17, v2026.11.17.6)
- **Pourquoi autant de petites flèches sur le téléphone** : le registre des flèches (gardé sur l'appareil, « une flèche confirmée ne bouge ni ne disparaît ») contenait les ~70 petites flèches de la première variante, enregistrées avant le changement de variante ; la nouvelle variante n'ajoutait que ses propres flèches par-dessus. La clé du registre contient maintenant l'algorithme (`ALGO_ID`) et les anciens registres sont purgés (`purgerAnciens`).
- **Rectangle noir permanent** : l'info-bulle des flèches. Sur téléphone le curseur reste posé après un toucher et le graphique le signale à chaque nouveau cours : la minuterie de fermeture était remise à zéro en permanence. L'info-bulle n'apparaît plus que sur une action de l'utilisateur (survol, toucher), se ferme seule au bout de 6 s et ne recouvre jamais l'échelle des prix.
- **Version** : `trader-pro/terminal/version.js` (affichée en petit dans la légende du graphique, « v2026.11.17.6 ») ; `or.html` compare sa version à `precache.json` (toutes les 3 min et au retour au premier plan) et au code chargé : version plus récente publiée ou code en cache ancien → mise à jour du service worker, caches vidés, rechargement (2 tentatives au plus par version). Montée de version : `node trader-pro/outils/precache.mjs <version>` (cinq fichiers, test `ma200-test.mjs`).

## MA200 Daily + H4 simplifié : un seul niveau, la MA200 Daily (2026-11-18, v2026.11.17.7)
- Supprimé : toutes les flèches basées sur R1 / R2 / S1 / S2, la MA200 H4 et les cassures des 20 bougies H4, les variantes V0–V3 et les filtres de bande. Il reste 2 types : **cassure** (grosse flèche : une clôture Daily franchit la MA200 Daily + confirmation) et **rebond** (petite flèche : tendance établie, contact de la MA200 Daily, clôture H4 qui repart ; un seul par contact). Stop = 0,5 ATR de l'autre côté de la MA200 ; sortie = stop ou clôture Daily de l'autre côté.
- Backtest (`trader-pro/terminal/VERIFICATION-MA200.md`) : 3 confirmations de cassure × avec / sans filtre de pente ; défaut = **2 clôtures Daily, sans filtre de pente** (seule variante dont le total sans le meilleur trade est positif sur l'or ET le Nasdaq 100). Les rebonds perdent dans le test (échantillon très petit).
- Registre sur l'appareil : `ALGO_ID` = `daily2-sanspente-r3` ; les anciens registres sont purgés. Fond du graphique : vert au-dessus de la MA200 Daily, rouge en dessous.
