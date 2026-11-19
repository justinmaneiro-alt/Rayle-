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

## Phase 1 — Couverture : claire, honnête, mesurée (faite)
- **Module pur `trader-pro/couverture/protection.js`** (40 tests dans `tests/protection-test.mjs`, + `couverture-test.mjs`, `voix-trader-test.mjs` mis à jour) :
  - *Taux de protection* : fenêtres glissantes (qui se chevauchent) de 1 jour et de 5 jours ; « contre moi » = la position perd plus de 1 % sur la fenêtre ; la couverture a « gagné » si son gain > 0 ; part compensée = somme des gains de la couverture / somme des pertes de la position ; coût = somme des pertes de la couverture / somme des gains de la position quand j'ai raison (+ fréquence du coût).
  - **Verdict « fiable »** seulement si le taux hebdomadaire est ≥ 70 % sur 30, 90 **et** 250 jours, chacun avec assez de cas (≥ 3 / 8 / 15 semaines défavorables). « Partielle » si ≥ 55 % sur 250 jours. Sinon « à éviter ». L'ancien verdict statistique reste disponible (`verdictStat`). *Décision* : un taux sur 30 jours avec moins de 3 cas n'est pas déclaré mesurable (pas de 100 % trompeur).
  - *Trois niveaux* : légère 25 %, moitié 50 %, complète 100 % du bêta ; pour chacun, volatilité et drawdown réduits (backtest walk-forward paramétré par `fraction`), gain abandonné (points de % du notionnel sur 250 j).
  - *Phrase claire* (`phraseClaire`) : « Tu ACHÈTES l'or → VENDS l'argent… à 34 % de ta taille (≈ X €). Pourquoi : … (corrélation 0,82). Si l'or baisse, ta vente d'argent gagne. » ; sens en grand, vert (achat) ou rouge (vente) ; gère les actifs anti-corrélés. Phrase pédagogique « une couverture qui protège ~70 % du temps coûte aussi ~70 % du temps ».
  - *Couverture d'événement* : types Fed (FOMC), CPI, NFP, BCE. Le calendrier de la semaine (Forex Factory) ne donne que les prochaines annonces ; pour l'historique, des **dates internes** : FOMC 2021-2025 et BCE 2023-2025 (calendriers officiels), CPI 2023-2025 (liste BLS, à ±1 jour), NFP par la règle du BLS (vendredi, 3 semaines après la semaine du 12 ; jours fériés non corrigés). Comportement de la paire le jour de l'annonce : amplitude par rapport à un jour normal, fréquence « contre moi », taux de protection ces jours-là. Données **journalières** : la couverture se pose à la clôture de la veille et se retire à la clôture du jour de l'annonce (précision intraday impossible avec les données gratuites).
- **Symboles XTB** : lus dans la table des marges (`data/xtb-univers`) : GOLD, SILVER, US100, US500, BITCOIN, SOLANA, EURUSD, OIL.WTI. **DXY n'existe pas** dans cette table → `xtb: null`, il n'est plus proposé comme couverture (l'ancien « USDX (à vérifier) » était une supposition). Bouton « Copier ».
- Fenêtre (`couverture/fenetre.js`) : taux de protection et coût côte à côte avec la même taille, verdict, trois niveaux, symbole XTB + copier, nouvel onglet « Couverture d'événement », « Rayle l'explique » lit la phrase claire + protection + coût (`phrase.js`, aussi utilisé par la voix). Test Chrome `couverture-chrome.mjs` (PC et téléphone) passe.
