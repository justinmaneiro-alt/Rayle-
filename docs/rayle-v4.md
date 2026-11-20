# Rayle v4 — Volume, historique long, actualité défilante, corrections

Document de travail (2026-11-20, session autonome). Une section par phase : décisions, limites, ce qui n'a pas pu être fait.

## 0. Audit (avant toute modification)

### Architecture
- **Pile** : JavaScript natif (modules ES), pas de bundler pour le code ; `build.mjs` copie vers `dist/`. Hébergement statique relié au dépôt ; `git push origin main` publie. Tests : `npm test` (Node pur) + tests Chrome (`trader-pro/tests/*-chrome.mjs`).
- **Terminal** : page `agent-trading/front/or.html` + moteur historique `agent-trading/front/or/` (Lightweight Charts) ; la couche pro se branche via `trader-pro/terminal/integration.js` (`monterPro(T)`). Flèches MA200 : `ma200-h4.js` + registre ; flèches de niveaux : `niveaux.js` ; aides (régime, voyant, annonces, taille) : `aides.js` / `aides-ui.js` ; stats : `stats-fleches.js`.
- **Marchés** : `agent-trading/front/marches/*` (fenêtre, couverture-ui, données) + `trader-pro/marches/*` ; panneaux construits par `marches/donnees/api.js`.
- **Couverture** : `trader-pro/couverture/` (calcul, protection, fenêtre). **Portefeuille** : `trader-pro/portefeuille/` (IndexedDB + synchro D1 via Worker). **Investissement** : `trader-pro/invest/` (calcul nocturne → branche `donnees-invest`). **Accueil** : carrousel (`index.html`, `core/`, `galaxie/`), carte « À la une » alimentée par `actus-*.json`.

### Sources de données
- **Branche orpheline `donnees`** (GitHub Actions, `.github/workflows/donnees.yml`, cron 15 min) : `outils-donnees/snapshots.mjs` écrit actus, calendrier, Yahoo, bougies compactes, COT, panneaux Marchés, `pro-<id>.json` (j ≈ 1300, h4 ≈ 3600, h1 ≈ 700, m15 ≈ 500). Lecture navigateur par `agent-trading/front/donnees/couche.js` (ordre : PC → direct → snapshot → cache IndexedDB).
- **Temps réel** : Kraken (WebSocket/REST) dans le Terminal. Worker Cloudflare Portefeuille : D1, alertes Telegram, synchro.
- **Branche `donnees-invest`** : calcul nocturne de l'Investissement.

### Points faibles repérés à l'audit
- La couche de données essaie le **serveur du PC en premier** quand la page est servie par le PC ; sinon snapshot, sinon cache. Les cases « lu par le PC · copie locale » viennent de là.
- Les snapshots ne couvrent pas l'historique long (Daily ≈ 5 ans, H4 ≈ 2,3 ans, H1 ≈ 700 bougies).
- Aucun volume centralisé exploité hors volume Yahoo/Kraken de l'instantané.
