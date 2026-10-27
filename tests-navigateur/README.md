# Tests de bout en bout (Chrome)

Ils pilotent la vraie page dans Chrome (clics, molette, reconnaissance vocale simulée, captures) et vérifient la voix, la navigation, les manifestes, les réglages, le mode jeu, le décor et les performances.

```
cd tests-navigateur
npm install            # une seule fois (puppeteer-core et pngjs ; Chrome doit être installé)
node ..serveur.mjs    # dans un autre terminal : le serveur local (port 8000)
npm run voix           # la voix (la panne de cache, les commandes, la reconnaissance simulée)
npm test               # tout (une dizaine de minutes)
```

Variables facultatives : `CHROME` (chemin de chrome.exe), `BASE` (adresse du serveur).

Les tests purs (sans navigateur) sont dans `galaxie/tests/` : `node galaxie/tests/<manifestes|grammaire|reglages|reseau>-test.mjs`.

## La Terre

```
node terre-orbite-test.mjs        # orbite, détail progressif, mémoire, pannes (faux serveurs de tuiles)
node terre-actus-meteo-test.mjs   # actualités, météo, radar, image du jour, nuages et pluie (faux Worker)
node terre-nuit-test.mjs           # la face nuit est un globe plein : aucun pixel ne reprend le fond d'étoiles ; noms de l'autre hémisphère cachés
node terre-zoom-entree-test.mjs   # entrer et sortir de la Terre en zoomant (molette), sans clignotement
node terre-fil-test.mjs           # actualités par sujets (balises, cartes, bandeau, panneaux), actions de l'IA, présentation parlée, Terre vue de loin (faux Worker)
node terre-fil-perf.mjs           # images/s avec les actualités affichées (vraies sources, mini-Worker local)
node worker-local-reel.mjs        # mini-Worker local sur 8796 : vraies routes /actualites, /actualites/fil, /meteo ; /chat = agent de simulation (sans IA)
node terre-fil-reel.mjs           # captures avec de VRAIES données (captures-terre/actus-reel/)
node terre-perf.mjs               # images/s réelles (L=2560 H=1440 par défaut ; L=3840 H=2160 pour la 4K)
node terre-b-reel.mjs             # captures avec de VRAIES données (vrais flux, vraie météo, vrai radar)
node worker-local-reel.mjs        # un Worker local (port 8796) qui exécute les vraies routes /actualites et /meteo
```
Tests purs : `node planetes/terre/tests/{globe,vecteur,reglages-geocodage,actus-meteo}-test.mjs` et `node galaxie/tests/terre-worker-test.mjs`.

## Mars

```
node mars-test.mjs                # Mars de bout en bout : arrivée, base en deux parties, entrée/sortie par le zoom (hystérésis), salon, fenêtres EXEMPLE, ordres et voix, autres planètes, mode jeu (53 vérifications)
node mars-tactile-test.mjs        # téléphone : qualité basse, interface dans l'écran, pincer, toucher, boutons (17 vérifications)
node mars-captures.mjs            # captures (extérieur, approche, nuit, salon sous plusieurs angles et heures, Phobos, fenêtre ouverte) → captures-mars/
node mars-captures-tactile.mjs    # captures sur téléphone (390 × 844) → captures-mars/
node mars-fps-essai.mjs           # images/s : galaxie, orbite, salon (QUALITE=haute L=2560 H=1440 par défaut) ; à lancer quand aucun jeu n'occupe le GPU
```
Une capture d'écran Puppeteer réinitialise l'émulation tactile : dans les tests tactiles, prendre les captures à la fin.

## Mars : terminal de trading (M2a)

```
node mars-trading-test.mjs        # espace de travail, indicateurs, unités, volume (indice / proxy / aucun), source et heure, voix et ordres, pannes, IndexedDB, limites de requêtes (50 vérifications ; faux Worker mock-worker-marche.mjs)
node mars-trading-reel.mjs        # VRAIS appels : mini-Worker local (vraie route /marche, Yahoo Finance) + client + indicateurs, tableau des 20 séries, watchlist, corrélations
node mars-trading-captures.mjs    # captures du salon et de l'espace (SOURCE=reel pour de vraies données : lancer d'abord node worker-local-reel.mjs)
node mars-trading-fps.mjs         # images/s avec l'espace ouvert (aucun jeu ne doit occuper le GPU)
```
Un ancien `worker-local-reel.mjs` oublié sur le port 8796 sert l'ancienne version (« route inconnue ») : l'arrêter avant de relancer.

## Mars : terminal et Agent BTC
```
node mars-test.mjs                # salon, table de 7 fenêtres réelles, entrée / sortie
node mars-tactile-test.mjs        # téléphone
node mars-trading-test.mjs        # espace de travail, indicateurs, voix (faux Worker de marché)
node mars-tradingview-test.mjs    # bouton TradingView / Raylé, dashboard, contexte (widget simulé)
node tradingview-reel.mjs         # le VRAI widget TradingView (réseau) ; CHROME="…/msedge.exe" ETIQUETTE=edge pour Edge
node mars-agent-test.mjs          # Agent BTC : faux échange Binance, vrai Worker de navigateur, IndexedDB, voix, alerte
node sonde-sources-btc.mjs        # sonde réelle des sources de bougies Bitcoin (écrit docs/sources-btc.json)
node mars-poste-test.mjs          # M5 : poste de pilotage de l'Agent BTC (≈ 7 min ; marché synthétique à avantage planté, vrai Worker de navigateur, 8 onglets, graphique, laboratoire, voix)
MINUTES=4 node mars-poste-reel.mjs # M5 : le même poste avec de VRAIES bougies (cache local), recherche réelle, captures m5-reel-*.png
```
Tests purs de l'agent : `node planetes/mars/tests/{agent-donnees,agent-lecture,agent-backtest,agent-live,trading-dashboard}-test.mjs`. Vraie recherche : voir `docs/agent-btc.md`.

## M6 (poste de pilotage final)
```
node mars-m6-test.mjs    # M6 : gardien, tilt, journal, import CSV, simulation, régime, santé, capture, idées, graphique (clic bougie, zone, couches), changement de paire (≈ 3 min ; fabrique sa propre image factice)
```
Tests purs : `node planetes/mars/tests/m6-{poison,fiabilite,paires,graphique,gardien,eval,journal,ict,stagnation,regime,etat,capture,vues,fenetres}-test.mjs`, `node galaxie/tests/{capture-worker,chercheur-paires,kraken-route}-test.mjs`. Lancer les tests Chrome UN À LA FOIS : ils réservent des ports (8796, 8797) ; en cas de port occupé, arrêter le processus par son identifiant (jamais `taskkill` par nom).
