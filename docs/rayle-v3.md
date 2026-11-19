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

## Phase 2 — Outils de dessin du Terminal (faite)
- **Fichiers** : `trader-pro/terminal/niveaux.js` (modèle + évaluation pure, 53 tests), `dessins-fusion.js` (validation/fusion, partagé avec le Worker), `dessins-stockage.js` (local + synchro), `dessins-ui.js` (barre, tracé, rendu, flèches), `contexte.js` (contexte des flèches). Tests : `niveaux-test.mjs`, `dessins-test.mjs` (vrai SQLite, simule PC + tablette + téléphone), `dessins-chrome.mjs` (souris et doigt).
- **Outils** : ligne horizontale, trendline, boîte, Fibonacci seulement. Barre discrète repliée (bouton ✎) en bas à gauche du graphique. Tracé : PC = glisser ; doigt = glisser **ou** deux touchers (le doigt masque le point). Poignées pour étirer (boîte : 8 poignées, tous les sens), corps pour déplacer, 4 couleurs sobres, verrou, alertes par niveau (🔔), corbeille, Suppr / Échap. Aimantation sur O/H/L/C de la bougie sous le doigt (7 px souris, 12 px doigt).
- **Décision** : l'ancienne barre « Ligne / Zone / Ligne de tendance / Rayon » du Terminal est **masquée** (CSS, `html.tp-terminal`) pour ne pas avoir deux jeux d'outils concurrents ; « Position », aimant, alerte et Affichage restent. Les objets créés avec l'ancienne barre sont toujours affichés et surveillés.
- **Piège trouvé** : Lightweight Charts modifie sur place l'objet `handleScroll` quand on lui applique `false` ; il faut remettre `true` explicitement (sinon le graphique ne défile plus après un dessin).
- **Unités** : chaque dessin porte son unité d'origine (H1/H4/Jour), est affiché sur toutes les unités (étiquette « H4 », 78 % d'opacité hors unité d'origine), mais évalué seulement sur l'unité d'origine. Sur l'unité affichée, l'évaluation utilise les bougies affichées (en direct) ; sur une autre unité, l'instantané du robot (H1 ≈ 700 bougies, H4 ≈ 3 600, Jour ≈ 1 300).
- **Synchronisation** : Worker Portefeuille, nouvelle route `GET/PUT /dessins` (fusion par `maj`, pierres tombales 30 jours, événements en union : une flèche déjà annoncée par un appareil n'est pas ré-annoncée par les autres). Sans Worker configuré : tout reste sur l'appareil, sans erreur. **Le Worker doit être redéployé (`wrangler deploy`, non possible depuis ce poste) pour que la synchro fonctionne.**
- **États** : actif → touché → cassé → retesté, badge sur le niveau. **Flèches** (à la clôture seulement, sur l'unité d'origine) :
  - rebond = touche (ou entrée dans la boîte) + clôture du bon côté + mèche de rejet ≥ 50 % de la bougie + volume > moyenne des 20 bougies précédentes ;
  - cassure = clôture au-delà de 0,25 ATR(14) + volume > moyenne ; retest = retour sur le niveau cassé et clôture du côté de la cassure (mèche ≥ 25 %), une seule fois par cassure, flèche plus petite et plus pâle ;
  - une seule flèche par événement : il faut un éloignement d'au moins 1 ATR puis un retour pour qu'un nouveau rebond (ou une nouvelle cassure) soit possible ;
  - **volume** : si la série n'a aucun volume, la condition est ignorée et le libellé l'indique (« volume indisponible ») ;
  - pas de regard vers l'avenir (testé : l'évaluation d'un préfixe de la série donne exactement les mêmes événements).
- Libellé au survol/toucher : « Rebond H4 confirmé · niveau 3 612 · volume ×1,6 » + contexte (au-dessus/sous la MA200, Daily/H4 alignés ou non, contre-tendance). Voix de Rayle + notification + Telegram (même canal et même interrupteur que les flèches MA200) ; chaque niveau peut être rendu muet. Un événement antérieur à la création du niveau est enregistré mais jamais annoncé ; déplacer un niveau repart de zéro (anciennes flèches effacées, sans annonce). Les alertes ne partent qu'après la première synchronisation (évite le doublon entre appareils) et jamais pour un événement de plus de 36 h.
- **Limite** : la synchro est « au mieux » : deux appareils qui évalueraient le même niveau au même instant avant de se synchroniser pourraient annoncer la même flèche deux fois.

## Phase 3 — Fibonacci pro, épuré (fait)
- Tracé A (départ) → B (fin de l'impulsion), à la souris (glisser) ou au doigt (deux touchers) ; bouton **Auto** (apparaît avec l'outil) : ancre sur la dernière impulsion majeure de l'unité affichée (`ancrageAuto` : pivots à 5 bougies de chaque côté, deux pivots opposés consécutifs séparés d'au moins 3 ATR). *Décision* : l'ancrage auto est posé une fois (pas recalculé à chaque bougie, pour ne pas déplacer un niveau sous les doigts) ; il suffit de glisser les poignées pour ajuster.
- **Seulement** ces éléments sont affichés : zone de rebond **0,5–0,705** grisée, sous-zone **premium 0,618–0,705** plus marquée, **0,382** en ligne fine, **objectifs 1,272 et 1,618** (extensions de l'impulsion) avec leur prix, **100 %** = départ = invalidation. Étiquettes petites : niveau + prix. Vérifié par test (`Object.keys(fibo())` et géométrie écran).
- Fonctionne comme une boîte : le prix entre dans la zone, la bougie clôture **au-dessus du bord haut de la zone** (impulsion haussière ; symétrique pour une baisse) avec mèche de rejet et volume > moyenne → flèche + voix + Telegram, mêmes règles et même registre que la phase 2 (une seule flèche, ré-armement à 1 ATR). Seuls les rebonds **dans le sens de l'impulsion** sont signalés ; une clôture au-delà du 100 % passe le niveau en « cassé » (invalidation) **sans flèche** (le franchissement de la zone n'est pas un signal).
- Tests : `niveaux-test.mjs` (zones, objectifs, impulsion baissière, auto, rebond, invalidation) et `dessins-chrome.mjs` (bouton Auto, géométrie).
