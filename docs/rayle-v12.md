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

## Phase 2 — Bookmap (terminal Volume)

**Utilisation.** Mode Volume → bouton **Bookmap** (barre du haut, à côté de Footprint). Grisé, avec l'infobulle qui explique pourquoi, pour le Nasdaq, le S&P 500, EUR/USD, USD/CHF et le dollar (pas de carnet public gratuit). Disponible pour **Bitcoin, Solana et l'or** (perpétuels Binance).

**Ce qui est affiché** (un canvas 2D qui remplace le graphique en bougies tant que Bookmap est allumé ; le panneau de droite du Volume reste) :
- **Carte de chaleur** : une ligne par niveau de prix (case ≈ 0,003 % du prix, 1/2/5 × 10^k, jamais sous le pas de cotation : BTC 1 $, SOL 0,01, or 0,1), une colonne par seconde (échelle **Secondes**, ≈ 5 minutes visibles) ou par 10 secondes (échelle **Minutes**, ≈ 50 minutes). Chaque case garde la quantité **maximale** vue pendant la seconde (un mur éphémère reste visible). Palette noir → bleu nuit → turquoise → jaune → blanc.
- **Bulles** : chaque transaction au-dessus du seuil ; vert = achat agressif, rouge = vente agressive ; rayon ∝ √(volume / seuil). Seuil réglable : multiple (×0,25 … ×4) du seuil automatique (97,5e centile des tailles récentes, mesuré en continu ; rien tant qu'il y a moins de 20 transactions).
- **Ligne de prix** blanche (milieu du carnet), **profil du carnet actuel** à droite (barres vertes / rouges, normalisé au 95e centile), axe des prix avec étiquette du prix, axe du temps.
- Réglages : contraste, seuil des bulles, échelle de temps (mémorisés par actif). Gestes : glisser (prix et temps), molette ou pincement (zoom vertical), double appui ou **Auto** (recentrer).

**Données.** `bookmap-flux.js` : carnet complet **par différences toutes les 100 ms** (`@depth@100ms`, adresse « public » de Binance) reconstruit selon la méthode officielle (instantané REST de 1 000 niveaux, contrôle `pu`/`u`, resynchronisation automatique à chaque trou, remise à zéro à chaque reconnexion) + transactions agrégées (`@aggTrade`, côté de l'agresseur). Mesuré sur BTC : ≈ 10 mises à jour par seconde, 0 resynchronisation en 30 s, 2 800 à 3 500 niveaux dans le carnet local. Les flux ne tournent que **Bookmap allumé** ; ils sont coupés au retour au Classique, à la fermeture du Volume ou au changement d'actif. Tant que Bookmap est affiché, le graphique caché du Volume n'est plus redessiné à chaque message (la charge de l'appli mesurée sur ce PC passe de 3,6 s à 1,2 s de tâches longues par 4 s).

**Stockage local (IndexedDB `rayle-bookmap`).** Blocs d'environ 30 s (colonnes + bulles), jamais envoyés nulle part ; purge des blocs plus vieux que la durée gardée ; relecture au démarrage (seulement les blocs du même palier). **Durée gardée selon la mémoire de l'appareil** (`navigator.deviceMemory`) : ≥ 8 Go → 6 h ; ≥ 4 Go → 3 h ; 2 Go → 1 h 30 ; moins → 1 h ; mémoire inconnue (Safari, Firefox) → 2 h ; toujours limitée à 5 % de l'espace libre (≈ 12 Mo par heure de carte). **Honnêteté** : Binance ne fournit aucun historique du carnet et je n'ai pas trouvé de source gratuite : la carte **commence à l'ouverture de la page** (ou reprend celle de la visite précédente, avec un trou visible pour le temps où la page était fermée). C'est écrit dans la note sous la carte, et une ligne pointillée marque « la carte commence ici ».

**Fluidité.** On ne dessine que la zone visible : une image de ≈ 300 × 220 pixels agrandie, table d'intensité précalculée (aucune puissance par case), rafraîchie une fois par seconde (nouvelle colonne) ou à 20 images/s pendant un geste, rien quand la page est cachée. Mesures (Chrome, ce PC sans GPU) : 8 à 25 ms par image, BTC et or, processeur ralenti ×4 compris. La tablette réelle n'est pas disponible depuis cette session.

**Rayle l'explique** : fiche « Volume : le Bookmap (carte de chaleur de la liquidité) » dans `manuel-rayle.md` (« Rayle, explique-moi le Bookmap », « c'est quoi les bulles vertes et rouges »).

**Tests.** Purs (`npm test`) : `bookmap-test` (33 : carnet local officiel, grille, bulles, palette, durée). Chrome (flux réels) : `bookmap-chrome.mjs [vue] [BTC|OR|SOL] [secondes] [ralentissement]`, `bookmap-reprise-chrome.mjs` (actifs grisés, carte relue après rechargement : 18 colonnes).
