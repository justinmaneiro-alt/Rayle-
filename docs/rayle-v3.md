# Rayle v3 — couverture claire, dessin à flèches, journal par setup, investissement pro

Document de travail (2026-11-19, session autonome). Phase 0 = audit ; ensuite une section par phase avec les décisions prises, les limites et ce qui n'a pas pu être fait.

## 0. Audit de l'existant (avant toute modification)

### Terminal
- Page : `agent-trading/front/or.html` (`terminal.html` redirige vers elle). Moteur historique (graphique Lightweight Charts, `T.graph`, `T.moteur`) dans `agent-trading/front/or/` ; la couche « pro » s'y branche par `trader-pro/terminal/integration.js` (`monterPro(T)`), sans réécrire le terminal.
- **Flèches MA200** : `trader-pro/terminal/ma200-h4.js` (pur) — `analyserUnite(bougies, 'H4'|'J')` : cassure (clôture de l'autre côté de la MA200 avec 0,3 ATR) et rebond (retour sur la MA après éloignement de 1 ATR). Registre sur l'appareil (`fleches-registre.js`) : une flèche confirmée ne bouge plus et n'est annoncée qu'une fois (voix `parler`, `T.notifier`, `T.envoyerTelegram`). Rendu : marqueurs `createSeriesMarkers`, info-bulle au survol/toucher, fond vert/rouge par primitive.
- **Données** : `trader-pro/commun/donnees.js` → `lireActifPro(id)` lit l'instantané `pro-<id>.json` de la branche `donnees` (robot GitHub Actions toutes les 15–30 min) : `j` (~1 300 jours), `h4` (~3 600 bougies, ≈ 2,3 ans), `h1` (~700), `m15` (~500). Actifs : or, us100, us500, btc, sol, doge (+ dxy en lecture).
- **Outils de dessin historiques** : `agent-trading/front/or/terminal-outils.js` + `outils-calcul.js` (horizontale, zone, tendance, rayon, position Entrée/Stop/Cible), stockage IndexedDB local (`stockage-outils.js`), surveillance à la clôture H1 Kraken (`fleches-v10.js`). Calibrés pour l'or/Kraken (contrat 1 oz). Ils restent en place (non cassés).
- **Mobile** : classes `tm-tactile`, `tactile-v1.js`, `terminal-mobile.css` ; la couche pro place ses boutons sur une ligne propre en tactile.

### Couverture
- `trader-pro/couverture/calcul.js` (pur) : univers de 10 actifs (séries journalières `jour-<id>.json`), corrélations 30/90/250 j, bêta, stabilité, backtest walk-forward « seule » contre « couverte », verdict (fiable/fragile/à éviter), classement.
- `couverture/fenetre.js` : onglets Corrélations / Couvrir une position, tableau de candidats, carte détaillée, voix `parler(S.resume)`. `couverture/phrase.js` : phrase parlée.
- Défauts constatés : le sens à prendre n'est pas mis en avant, aucun taux de protection mesuré (le verdict se base sur |corrélation|, stabilité, réduction de volatilité), le coût (gain abandonné) n'est pas affiché, pas de niveaux 25/50/100 %, pas de couverture d'événement.

### Portefeuille
- `trader-pro/portefeuille/` : `import-xtb.js` (parse les exports XTB), `stockage.js` (IndexedDB local + synchro D1 par le Worker « Rayle Portefeuille » : `/importer`, `/donnees`, `/reglages`, `/alertes`…), `calcul.js`, `coach.js`, `vues.js`, `fenetre.js`. Dédoublonnage déjà présent à l'import (clé = n° de position XTB) ; pas de notion de « setup ».
- Worker : `trader-pro/worker/src/` (D1, cron 5 min : alertes de prix Telegram, alertes Investissement). **Son déploiement exige `wrangler login` (non disponible sur ce poste)** : le code est écrit et testé, à redéployer par l'utilisateur.

### Investissement (v2)
- `trader-pro/invest/` : modèle multi-facteurs par horizon (`modele.js`, `analyse-v2.js`, `ligne.js`), liste virtualisée (`fenetre.js`, Web Worker `tableau-worker.js`), fiche à onglets (`fiche.js`), voix (`voix-invest.js`), alertes (`alertes.js`). Données calculées chaque nuit par `.github/workflows/invest.yml` → branche `donnees-invest` (`outils-donnees/invest/calcul-v2.mjs`). Détails : `docs/investissement-v2.md`.
- Carte d'accueil du carrousel : texte statique « S&P 500 + CAC 40 au crible » (à remplacer en phase 7).

### Tests et publication
- `npm test` (tests purs, Node) ; tests navigateur Chrome (`trader-pro/tests/*-chrome.mjs`). Version commune : `trader-pro/terminal/version.js`, `sw.js`, `precache.json`, `index.html`, `or.html` (`node trader-pro/outils/precache.mjs <version>`). Publication : `git push origin main` (hébergement statique relié au dépôt).

## Décisions générales
- Nouveau code en modules **purs et testés** (Node) sous `trader-pro/`, UI mince par-dessus ; style Jarvis sobre inchangé.
- Pas de nouvelle dépendance. Tout reste gratuit.
- Synchronisation PC/tablette/téléphone : on réutilise le Worker Portefeuille (route générique de stockage clé/valeur déjà présente pour `reglages`) ; sans Worker configuré, les dessins restent sur l'appareil.
