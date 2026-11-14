# Indépendance du PC (2026-11-14)

## 1. Inventaire : ce qui dépendait du serveur du PC
| Fonction | Dépendance d'origine | Solution |
|---|---|---|
| COT, Actualités, Banques, Institutions, Santé du marché, GLD, Calendrier (onglets du terminal) | routes `/__cot`, `/__actus`, `/__banques`, `/__institutions`, `/__sante`, `/__gld`, `/__calendrier2`, `/__yahoo` de `serveur.mjs` (404 sur GitHub Pages) | `agent-trading/front/donnees/routes.js` : PC seulement si la page vient de lui, sinon **instantané** de la branche `donnees`, sinon **copie locale** (IndexedDB) datée |
| Bougies Nasdaq, S&P, Bitcoin, Solana, dollar, EUR/USD, USD/CHF | `/__bougies` (Yahoo via le PC) | `lireBougies` : Bitcoin et Solana en **direct** (Kraken, CORS ouvert) fusionnés à l'historique de l'instantané ; autres : instantané `bougies-*.json` |
| Or (graphique) | relais Cloudflare `rayle-or-relais` (indépendant du PC) | inchangé (n'a jamais dépendu du PC) |
| Rayle Marchés (12 panneaux) | `/marches/panneau` du serveur | instantanés `marches-<id>[-<actif>].json` (même code du hub exécuté par le robot) + copie locale |
| Copilote de données, analyse IA automatique | serveur de Rayle | sans le PC : message clair ; **mode manuel gratuit** (export / import) inchangé |
| Journal et Capital | déjà sur l'appareil (localStorage / IndexedDB) | + sauvegarde / restauration JSON dans ⚙ Réglages |
| Terre (téléphone) | module 3D du PC (tuiles de plusieurs serveurs, Workers, texture 8k) : restait sur « Chargement… » | **Terre mobile** autonome (`planetes/terre/mobile/`), textures du dépôt, séismes USGS et météo Open-Meteo en direct |
| Alertes Telegram | processus `alertes-serveur.mjs` sur le PC | workflow GitHub Actions `alertes.yml` (même moteur v8, mêmes règles) |
| Miniature de la Terre (carrousel) | globe 3D avec textures 8k téléchargées sur téléphone | image de 30 Ko sur téléphone et tablette |

## 2. Couche de données (trois niveaux)
Ordre : copie locale affichée tout de suite si fraîche → lecture directe → instantané → copie périmée **avec le badge « hors ligne : dernière donnée du JJ/MM à HH:MM »**. Jamais de « HTTP 404 » brut : sans rien, message « Aucune donnée pour le moment… ». Page « État des sources » : ⚙ Réglages › Autonomie (origine, âge, erreur, dernier passage du robot).

Lectures directes vérifiées par test réel (CORS) : Kraken spot OHLC, Binance (spot et futures), CFTC, mempool.space, DefiLlama, USGS, Open-Meteo, relais de l'or. Bloquées (donc par instantané) : flux RSS, FRED, calendrier Forex Factory, SEC, Trésor, Fed de New York, Yahoo. Frankfurter a changé d'adresse (redirection 301) : non utilisée en direct.

## 3. Robot d'instantanés (`.github/workflows/donnees.yml`)
Toutes les 15 min (au mieux ; GitHub peut retarder) : lot rapide (actualités, calendrier, Yahoo, 12 panneaux Marchés) ; une exécution sur deux : bougies ; chaque heure : COT (8), banques, institutions, santé, GLD, séries journalières de l'univers (15 actifs, prix ajustés). Branche orpheline `donnees`, historique écrasé (le dépôt ne grossit pas), lue par `raw.githubusercontent.com` (CORS `*`). Dépôt public : minutes gratuites. Une source en panne ne détruit pas la copie précédente (`index.json` note l'erreur). `verifier-publication.mjs` refuse de publier un secret ou une donnée personnelle.

## 4. Alertes sans PC (`alertes.yml`)
Toutes les 5 min (au mieux) : `alertes-serveur.mjs --une-fois`, mêmes règles (v8, anti-spam 6/heure/actif, 5 min entre deux messages d'un même niveau, déduplication), état gardé dans `etat/alertes-etat.json` de la branche `donnees`. **Retards de quelques minutes possibles : pas du temps réel à la seconde.** Le jeton Telegram n'est jamais dans le dépôt : secrets `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID`. Appli fermée, les notifications du navigateur ne marchent pas : seules les alertes Telegram du robot arrivent.

## 5. Ce qui ne marche PAS sans le PC
Copilote de données (interroge le serveur), analyse IA **automatique** (la clé reste côté serveur), séries FRED libres, route d'actions saisies hors liste du robot, voix Azure, IA locale (LM Studio), agent PC. Tout le reste fonctionne.

Tests : `tests-navigateur/independance-pc-test.mjs` (54, PC arrêté puis réseau coupé), `terre-mobile-test.mjs` (25), `reglages-autonomie-test.mjs` (46), `marches-carrousel-test.mjs` (40 × 2), `sw-hors-ligne-test.mjs` (9), `agent-trading/tests/couche-donnees-test.mjs` (28).
