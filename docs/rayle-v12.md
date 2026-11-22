# Rayle v12 — mêmes graphiques partout, Bookmap, voix Vivienne garantie, rapports qui expliquent

Journal de la session autonome du 22/11/2026 (instructions : `prompt-rayle-v12-corrections.md`, non copié dans le dépôt). Version publiée : voir `sw.js` (2026.11.22.5 et suivantes).

## Phase 1 — Une seule série de prix, échelle du Classique, chevauchement

### Causes trouvées (et corrigées à la source)

1. **BTC : historique du Volume figé au 30/07 (117 800), puis une bougie à 60 709.** Sur la page d'un actif autre que l'or, `agent-trading/front/or/adaptateur-instrument.js` remplace `window.fetch` pour répondre aux requêtes du moteur du Classique (Kraken / Binance XAUUSDT) avec les bougies Yahoo. Il interceptait **toute** URL `https://fapi.binance.com/fapi/v1/klines…`, donc aussi les requêtes du mode Volume pour `BTCUSDT`, et y répondait avec `bougies.filter(…).slice(0, limit)` : les 1 500 bougies **les plus anciennes** (fin 07/2025) au lieu des 1 500 les plus récentes. Le Volume raccordait donc son historique long, puis la bougie en direct, avec un trou de 15 mois. Preuve par sonde Chrome : `chargerBarres('btc','H4')` rendait 2024-11-23 → 2025-07-30 dans la page BTC et 2026-03 → 2026-11 hors de la page.
   Corrections : (a) l'adaptateur ne détourne plus que les requêtes du moteur (`symbol` absent ou `XAUUSDT`) ; (b) sans `startTime`, il rend les `limit` bougies les plus **récentes** avant `endTime` (sémantique de Binance) ; (c) il expose `window.__fetchReel`.
2. **Échelle cassée du Classique (bougies écrasées, moitié droite vide, échelle 2 400 – 6 000).** La référence de volume Binance (XAUUSDT) a des bougies à des heures où le prix n'en a pas (week-ends, pauses : 1 886 dates en trop sur l'or H1). `graphique-or.js` les envoyait à la série de volume : ces dates en trop **s'ajoutent à l'axe du temps** de Lightweight Charts, décalent tous les indices logiques (dernière bougie à l'indice 13 921 au lieu de 12 035), et la vue par défaut (calculée sur le *nombre* de bougies) tombait des mois en arrière, avec l'échelle des prix de cette période. Correction : le volume n'est dessiné que sous les bougies qui existent, avec la même date graphique que la bougie du même instant. Filets de sécurité : `recaler()` (échelle automatique + 150 dernières bougies, marge à droite), appelé au retour du Volume, au bouton **Auto**, et par une garde toutes les 1,2 s tant que l'utilisateur n'a pas touché le graphique.
3. **Chevauchement** du sélecteur Classique | Volume (flottant à `right: 74px`) avec **Log** et **Auto** : le sélecteur passe à `right: 6px`, la barre Log / Auto descend à `top: 40px`.

### Architecture : une seule série

- `trader-pro/terminal/serie-unique.js` : `serieUnique(unite)` rend les bougies de l'actif de la page **exactement comme le Classique** (sa série `moteur.serie()` pour l'unité affichée ; pour une autre unité, la même fonction de chargement que le moteur, `chargerHistorique` + `serieAffichee`). Prix remis à l'échelle d'origine (EUR/USD, USD/CHF ×10 000, DXY ×100). Exposée aussi comme `window.__serieUnique(unite)` (rapports, cerveau).
- `trader-pro/commun/bougies-uniques.js` (pur, testé) : `canoniser(unique, volume, pas)` rattache le volume (`v`) et le volume acheteur (`bv`) du mode Volume aux bougies de la série unique par la date (milieu de la bougie en cas de grilles décalées, futures à :00 et indice à :30). **Aucun prix ne vient plus du Volume.** `comparer(A, B)` sert au test.
- `volume-ui.js` : `unifier()` après `chargerBarres` (aussi pour les séries annexes ICT / HTF) ; si la série du Classique n'est pas prête (20 s), le Volume affiche provisoirement sa source et **réessaie** toutes les 6 s. Exception voulue : l'or avec la source « futures COMEX » choisie à la main.
- `serie-continue.js` : `raccorder(…, { avantSeulement: true })` — l'historique long ne sert qu'**avant** la première bougie de la série unique (grilles :00 / :30 des indices).
- Mode Volume : `etat().canon` indique l'origine de la série.

### Tests

- Pur, dans `npm test` : `bougies-uniques-test` (14).
- **Bloquant, Chrome** : `npm run test:bougies` (= `trader-pro/tests/bougies-uniques-chrome.mjs tablette`) : pour chaque actif (OR, NASDAQ, SP500, BTC, SOL, EURUSD, USDCHF, DXY) et chaque unité (H1, H4, Jour), les 300 dernières bougies du Classique et du Volume ont la même date et les mêmes O, H, L, C (la bougie en cours : moins de 1 % d'écart) ; code de sortie 1 sinon. Résultat : 8 actifs × 3 unités = 24/24 identiques.
  **Pétrole** : il n'existe ni dans le Classique ni dans le Volume (pas d'instrument) ; il ne peut donc pas être comparé (il n'apparaît que dans Marchés).
- `echelle-classique-chrome.mjs [vue] [actif] [unité] [allers-retours]` : échelle correcte au chargement, à chaque retour du Volume, après changement d'unité (OR H4 ×3, OR Jour ×10 : tout passe).
- Limite : les séries annexes du Volume pour une unité autre que celle du Classique (onglets ICT, HTF) utilisent la même fonction de chargement que le moteur, mais pas le même objet mémoire.
