# Rayle v4.1 — Footprint dans les bougies, niveaux de réaction, zoom vertical

Document de travail (2026-11-20, session autonome). Une section par phase : décisions, limites, ce qui n'a pas pu être fait. Le mode Classique et le mode Volume v4 ne sont pas cassés (règle de départ).

## Phase 1 — Historique des transactions pour toutes les bougies

### Vérifications (faites avant d'écrire une ligne)
- **data.binance.vision** (futures « um », `aggTrades`) est joignable sans clé. Format d'une ligne : `agg_trade_id, price, quantity, first_trade_id, last_trade_id, transact_time, is_buyer_maker` ; `is_buyer_maker = true` ⇒ l'agresseur est le **vendeur**.
- **XAUUSDT y figure, mais seulement depuis le 2025-12-11** (premier fichier quotidien, listé par l'API S3 du dépôt public). L'or n'a donc **pas** de footprint avant le 11/12/2025 : mention « pas d'empreinte disponible pour cette période » (phase 2).
- BTCUSDT : depuis 2020-01 ; SOLUSDT : depuis 2020-09. Poids mesuré d'un jour : or ≈ 600 k lignes / 7,7 Mo zip ; Bitcoin ≈ 1,5 M lignes / 18 Mo zip ; Solana ≈ 0,27 M lignes.

### Décisions
- **Profondeur** : or = tout ce qui existe (depuis le 11/12/2025) ; **Bitcoin et Solana = 3 ans** (1 095 jours), conformément à la limite proposée. Le Bitcoin pèse environ 2,5 s de calcul par jour : ≈ 45 min pour 3 ans, bien dans le budget gratuit d'Actions.
- **Cases de prix** (toutes multiples entières de la case la plus fine, donc regroupements exacts) :
  | Actif | H1 | H4 | Daily |
  |---|---|---|---|
  | Or | 0,5 · 1 · 2 $ | 1 · 2 · 5 $ | 2 · 5 · 10 $ |
  | Bitcoin | 5 · 10 · 25 $ | 10 · 25 · 50 $ | 50 · 100 · 250 $ |
  | Solana | 0,05 · 0,1 · 0,25 $ | 0,1 · 0,25 · 0,5 $ | 0,25 · 0,5 · 1 $ |
  Le navigateur peut regrouper lui-même une taille en un multiple entier (zoom vertical, phase 4) : toute taille lisible est atteignable.
- **Calcul** (`outils-donnees/footprint-historique.mjs`, module pur et testé) : une transaction met à jour **une seule** case (la plus fine, par heure UTC) ; H4, Daily et les tailles plus larges se déduisent par regroupement exact (la somme est conservée, testé). Les grilles H1 / H4 / Daily sont celles de Binance (UTC), donc **les mêmes bougies** que celles du mode Volume.
- **Format** : `<actif>/<unité>/<taille>/<AAAA-MM>.json.gz` = `{ pas, u, b: [[t secondes, [[indice, vendeur, acheteur, n], …]], …] }` ; prix de la case = indice × pas. `index.json` (lu par le navigateur : plage, tailles, mois disponibles) ; `etat.json` (jours déjà faits, lu par la tâche seulement).
- **Hébergement** : branche orpheline `footprint`, servie par `raw.githubusercontent.com` (CDN). **Aucun passage par le Worker Cloudflare ni par KV**, aucun redéploiement du site pour une mise à jour de données.
- **Reprise** : jours traités du plus récent au plus ancien, avec un budget de temps (120 min) ; une exécution interrompue reprend à la suivante. Les archives du jour J-1 sont prises la nuit suivante (03 h 40 UTC).
- **Zip** : lecture en flux avec `zlib.createInflateRaw` (pas d'outil externe, marche sous Windows comme sous Linux).
- **Jour en cours** : l'archive du jour n'existe que le lendemain. Complété en direct par le flux de transactions déjà reçu (phase 2) ; ce qui s'est passé avant l'ouverture de l'appli est marqué « partielle ».
- **Pas de footprint** pour l'or avant le 11/12/2025, le Nasdaq 100, le S&P 500 et l'EUR/USD (pas de transactions gratuites avec côté). Ces bougies gardent leur volume (et Δ estimé) avec la mention « pas d'empreinte disponible pour cette période ou cet actif ».

### Mesure locale (2 jours de chacun)
- 2 jours : or 1,5 M transactions, Bitcoin 3,7 M, Solana 0,48 M en ≈ 15 s ; ≈ 35 ko/jour (or) et ≈ 70 ko/jour (Bitcoin) de fichiers compressés (toutes tailles et unités). Projection 3 ans : Bitcoin ≈ 75 Mo, Solana ≈ 30 Mo, or (11 mois) ≈ 12 Mo. **Taille réelle de la première exécution complète : voir plus bas (phase 5).**
- Contrôle : volume du jour de l'or du 19/11/2026 comparé aux bougies Binance (voir tests de phase 5).
