# RAYLE MARCHÉS : rapport (2026-11-14, branche `maj-marches`, étiquette `avant-marches` sur main)

Terminal d'information en lecture seule (aucun ordre), bâti sur des sources gratuites et publiques. Onglet « Marchés » du terminal (`agent-trading/front/or.html`), barre de commande (`/`), 12 panneaux, copilote sans IA. Code de données : `marches/donnees/` ; interface : `agent-trading/front/marches/`.

## Règle d'or appliquée
Tout chiffre affiché porte : source, date de la donnée, âge, retard de publication, badge de fraîcheur (temps réel / différé / quotidien / hebdomadaire / mensuel / valable jusqu'à la prochaine décision). Une source en panne donne « indisponible » (jamais un zéro) ; une dernière valeur connue est servie datée et marquée PÉRIMÉ. Les calendriers viennent des sites officiels ; sans source : « calendrier non vérifié ». Testé (voir plus bas).

## Sources intégrées (20 actives par défaut, testées en direct le 2026-11-14)
| Source | Données | Fréquence / retard constaté | Remarque |
|---|---|---|---|
| FRED (CSV public, sans clé) | taux réel 10 ans (DFII10), Treasury 2/10/30 ans, pente 10-2, taux Fed (borne haute), VIX, dollar large (DTWEXBGS), NASDAQ100, USD/CHF (H.10), CPI, chômage, M2, écart de crédit | quotidien, 1 jour ouvré ; dollar large et CHF : 1 semaine ; mensuel : 2 à 6 semaines | **une série par appel** (le CSV multi-séries renvoie un ZIP) ; limite ≈ 14 appels/h |
| Kraken (spot, OHLC, Futures) | Bitcoin, PAXG (proxy de l'or), bougies de 1 jour, intérêt ouvert et financement PF_XBTUSD | temps réel | PAXG ≠ XAU/USD : dit partout |
| Binance (data-api.binance.vision, fapi) | Bitcoin 24 h, volume, financement, intérêt ouvert, ratio long/short | temps réel ; ratio : 1 h | peut être refusé (HTTP 451) depuis certains pays/datacenters : alors « indisponible », Kraken Futures sert de recoupement |
| Deribit | indice BTC, DVOL, ratio put/call des options (intérêt ouvert) | temps réel | |
| alternative.me | indice peur et avidité crypto | quotidien | |
| mempool.space | hauteur du dernier bloc, frais | temps réel | |
| DefiLlama | TVL, capitalisation des stablecoins | quotidien | |
| BCE (SDMX) | EUR/USD de référence, taux de facilité de dépôt | quotidien (16 h CET) ; taux : à la décision | l'API répond en 1 à 10 s |
| Frankfurter | USD/CHF (base BCE) | quotidien | |
| Eurostat | inflation IPCH zone euro et France | mensuel | **dernière période disponible : décembre 2025** à la date du test : affichée PÉRIMÉE |
| INSEE (BDM, série 001759970) | prix à la consommation France (glissement annuel calculé) | mensuel | même constat : dernière période décembre 2025, PÉRIMÉE |
| CFTC (Socrata) | COT or (disaggregated : money managers), Nasdaq 100 mini, Bitcoin, indice dollar, franc suisse (TFF : leveraged funds) + commerciaux/dealers, 60 semaines | hebdomadaire (mardi, publié le vendredi) | dernier rapport lu : 3 novembre 2026 (11 jours) |
| SEC EDGAR | derniers dépôts de 3 entités (SPDR Gold Trust, iShares Bitcoin Trust, Invesco QQQ) | à l'événement | User-Agent identifié exigé (variable `SEC_UA`) ; limite 10 appels/s |
| CBOE | VIX (historique CSV) | quotidien | |
| Réserve fédérale | calendrier FOMC (page officielle) | à l'événement | décision = dernier jour ; heure d'annonce 14 h New York notée en commentaire |
| BCE (calendrier) | réunions de politique monétaire | à l'événement | |
| BLS | calendrier des publications (ICS officiel, converti de l'heure de New York, heure d'été US gérée) | à l'événement | |
| RSS officiels | Fed, BCE (communiqués), BLS | quart d'heure | titres + résumé ≤ 220 caractères + lien seulement |
| RSS médias | Le Figaro Éco, Le Monde Éco, BBC Business, CNBC, MarketWatch, The Guardian Business | quart d'heure | idem ; le flux de la Fed est parfois illisible (partiel signalé) |
| GDELT | actualités mondiales à la demande (`/marches/gdelt?q=`) | 1 appel / 6 s | **429 fréquent** ; sans conséquence : l'affichage ne dépend pas de lui |

Facultatives, **désactivées par défaut** : Yahoo (point d'accès non documenté ; testé en direct : répond, mais jamais indispensable ; activer avec `MARCHES_YAHOO=1`), Finnhub (`FINNHUB_KEY`), Twelve Data (`TWELVEDATA_KEY`) : ces deux-là ne sont **testées que sur un faux serveur** (pas de clé ici : non testées en direct).

## Testées et abandonnées (8)
Stooq (HTTP 404/403 : plus de CSV anonyme) · CME stocks Comex et règlements différés (fichiers `.xls` binaires, pas de lecteur sans dépendance : non lus plutôt que mal lus) · avoirs du SPDR Gold Shares (archive publique = PDF graphique) · CBOE put/call `totalpc.csv` (s'arrête en octobre 2019) · flux RSS du Trésor américain (404) · Banque de France (403) · flux RSS des Échos (404).

## Limites connues (à lire)
- **Pas de temps réel pour les actions et l'US100** : seule la clôture quotidienne (FRED NASDAQ100, 1 jour de retard). Pas de profondeur de marché pour les actions. Le panneau le dit.
- **Or** : pas de XAU/USD gratuit et officiel ; le PAXG de Kraken est un proxy (écart possible avec le comptant) ; positions via le COT du COMEX. Pas d'avoirs ETF d'or, pas de stocks Comex (voir plus haut), déclaré dans le panneau.
- **Dollar** : l'indice DXY n'est pas gratuit ; l'indice large de la Fed (mis à jour avec ≈ 1 semaine de retard) et EUR/USD de la BCE le remplacent. **Franc suisse** : pas de taux directeur BNS lisible.
- **Eurostat et INSEE** : leurs dernières données disponibles sont anciennes dans ce test (décembre 2025) : affichées « périmé » avec leur date. Aucune estimation de remplacement.
- **COT** : hebdomadaire, jamais un signal d'achat ou de vente. Les 4 contrats financiers viennent du jeu TFF, l'or du jeu « disaggregated ».
- **Corrélations** : Pearson sur les jours ouvrés communs (week-ends exclus, aucune interpolation), rendements logarithmiques (variation pour le taux réel), n affiché ; peu de jours = peu fiable.
- Binance dérivés et GDELT peuvent être refusés/limités selon l'hébergement (Cloudflare Worker : IP de datacenter) ; le cache, le recoupement Kraken et l'étiquette « périmé » couvrent ces cas.
- Les calendriers d'entreprises (résultats) et celui de la Banque de France : pas de source officielle gratuite lisible trouvée.
- Le Worker Cloudflare n'est **pas déployé** (consigne) : les routes `/marches/*` sont branchées dans le serveur local (`serveur.mjs`) et dans `worker/portable/` (non suivi par git). Sur GitHub Pages sans serveur, le panneau affiche les dernières valeurs enregistrées sur l'appareil (« hors ligne », datées) ou « indisponible ».

## Clés gratuites optionnelles (à ajouter plus tard dans `agent-trading/.env`, jamais commitées)
1. `FINNHUB_KEY` : cours différé d'un ETF Nasdaq 100 (QQQ), 60 appels/min gratuits.
2. `TWELVEDATA_KEY` : idem via Twelve Data, 8 appels/min.
3. `SEC_UA` : « NomApplication contact@adresse » exigé par la SEC (un identifiant générique est utilisé sinon).
4. `MARCHES_YAHOO=1` : active Yahoo (non officiel, fragile).
5. Aucune clé n'est nécessaire pour le reste.

## Tests
- `node marches/tests/donnees-test.mjs` : 62 vérifications : chaque connecteur rejoué sur une **réponse réelle enregistrée** (`marches/tests/fixtures/reponses.json`, enregistrée par `enregistrer-fixtures.mjs`) ; sept faux serveurs en panne (réseau coupé, 500, 429, 451, HTML au lieu de JSON, JSON vide, délai) ; panne partielle ; dernière valeur connue périmée ; échec non martelé ; nouvelles tentatives ; liste blanche ; écart minimal entre appels ; normalisation (zéro jamais de remplacement) ; **toute mesure porte source + horodatage + fraîcheur** ; calendrier (heure d'été US) ; corrélations (valeurs connues) ; API ; copilote (« je n'ai pas cette donnée »).
- `node marches/tests/sonde-reelle.mjs` : appelle chaque source pour de vrai.
- `BASE=http://127.0.0.1:8011 node agent-trading/tests/marches-chrome.mjs` (serveur : `node serveur.mjs 8011`) : Chrome 1600 / 1024 / 390 px + émulation tactile (S23, tablette, paysage) : chaque commande ouvre le bon panneau, chaque case a source + date + badge, panne simulée (source coupée, « État des sources » en panne, « calendrier non vérifié », serveur coupé = hors ligne), aucune requête pendant un geste, boutons ≥ 44 px, un seul panneau en fenêtre du bas, pas de défilement parasite. Captures : `outils-restructuration/captures-marches/`.
- Non testé : vrai téléphone ou vraie tablette (émulation seulement), Worker Cloudflare déployé.
