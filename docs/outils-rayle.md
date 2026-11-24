# Outils et données de Rayle (inventaire, phase 0 « copilote », 2026-11-24)

Rayle est en **lecture seule** : aucun outil n'envoie d'ordre. Ce fichier sert de base au moteur de lecture de marché (`trader-pro/lecture/`), à la base de connaissances (`docs/connaissances/`) et au réseau d'information (`trader-pro/reseau/`).

Actifs suivis par le copilote : **or, Nasdaq 100, S&P 500, Bitcoin, Solana, pétrole, dollar (DXY)**. Les six premiers (sauf le pétrole) ont un instantané `pro-<actif>.json` ; le pétrole (WTI) n'a que `jour-WTI.json` et les bougies `CL=F` sont ajoutées à la phase 1.

## Où vivent les données
| Lieu | Contenu | Rythme |
|---|---|---|
| Branche `donnees` (GitHub, lue par `raw.githubusercontent.com`) | `pro-<actif>.json` (Jour, H4, H1, M15 déjà prêts), `bougies-<sym>-{5m,15m,1h,1d}.json`, `jour-<id>.json`, `cot-<inst>.json`, `calendrier2.json`, `actus-*.json`, `marches-*.json`, `signaux.json` | workflow `donnees.yml` : boucle de ~5 h, republie toutes les 5 min (rapide), bougies toutes les 15 min, horaire toutes les heures |
| Branche `footprint` | archives gzip du footprint par actif / unité / case / mois | tâche nocturne `footprint.yml` (03 h 40 UTC) |
| Worker `rayle-portefeuille` + D1 | historique XTB, alertes de prix, réglages, dessins, journal, budget du jour | cron toutes les 5 min (un seul déclencheur) |
| Navigateur (IndexedDB / localStorage) | copies locales des instantanés, dessins, carnet, réglages | à chaque ouverture |
| Flux directs dans le navigateur | Binance / Kraken (WebSocket : transactions, carnet, bougies) | temps réel, **seulement quand le terminal Volume est ouvert** |

## Les outils
| Outil | Ce qu'il mesure | Code / données | Fréquence | Limites |
|---|---|---|---|---|
| **Terminal Classique** | bougies H1/H4/Jour, MA200, flèches de cassure/rebond MA200, niveaux tracés, Fibonacci, outil position | `trader-pro/terminal/*`, `pro-<actif>.json` | à l'ouverture + direct | flèches calées sur la MA200 Daily (ALGO_ID `suivi-ma200-v1`) ; pas de M5 |
| **Terminal Volume** | profil de volume (POC/VAH/VAL/HVN/LVN), POC nus, VWAP ancrés, delta/CVD, MFI, carnet, footprint | `trader-pro/volume/*` | direct (WebSocket) + archives | delta réel seulement sur Binance (or XAUUSDT, BTC, SOL) ; estimé pour les indices ; carnet = direct seulement |
| **MA200 et flèches** | clôture vs moyenne 200, cassure (marge 0,3 ATR), rebond | `terminal/ma200-h4.js` (`analyserUnite`) | à chaque clôture | un test robuste n'existe que pour la MA200 Daily ; en range les cassures sont du bruit |
| **Bougies volume** | volume relatif = volume ÷ médiane des 50 bougies précédentes (même source) ; contexte fin / sortie de range / milieu ; stats « et après ? » à +1/+3/+5/+10 | `volume/bougies-volume-calcul.js` | à chaque clôture H1/H4/Jour | volume absent = bougie non colorée ; moins de 20 cas = « échantillon trop petit » ; source de l'or changée le 2026-08-05 |
| **Footprint** | volume acheteur/vendeur par prix et par bougie, déséquilibres empilés | `volume/footprint-*.js`, branche `footprint` | nocturne + direct | seulement les actifs avec transactions gratuites (or via XAUUSDT, BTC, SOL) |
| **VWAP ancré** | prix moyen pondéré par le volume depuis une ancre | `volume/volume-calcul.js` | direct | l'ancre change tout |
| **Panneau ICT / HTF** | PDH/PDL, PWH/PWL, ouvertures, premium/discount, FVG, order blocks, égaux hauts/bas, balayages, sessions (Asie 0-8 h, Londres 8-13 h, New York 13-21 h UTC) | `volume/ict-calcul.js`, `htf-calcul.js` | à chaque clôture | sessions définies en UTC fixe (le décalage été/hiver est traité à la phase 1 pour la lecture) |
| **Supports / résistances** | niveaux de pivots, niveaux de réaction (×n réactions), niveaux historiques (annuels, zones 10 ans) | `commun/analyse.js` (`niveauxCles`), `volume/reaction-calcul.js`, `terminal/niveaux-historiques.js` | à chaque clôture | dépendent du choix de fenêtre ; aucun niveau n'a de pouvoir seul |
| **Score de marché** | note 0-100 (tendance, momentum, COT, macro, volatilité, flux) | `commun/score.js` | à l'ouverture de Marchés | composants manquants = score sur le reste, dit à l'écran |
| **Volume net USD** | achats − ventes agressifs en valeur (réel Binance, estimé sinon) | `commun/volume-net.js` | à la demande | estimation pour les indices |
| **Carnet d'ordres** | déséquilibre acheteurs/vendeurs, murs, grosses transactions | `volume/carnet-calcul.js` (direct) | direct | pas de carnet sans terminal ouvert ; le copilote serveur prend un instantané REST (Kraken) ou dit « indisponible » |
| **COT** | positionnement des spéculateurs (CFTC), indice sur 3 ans, zones > 80 / < 20 | `marches/cot.js`, `cot-<inst>.json` | hebdomadaire (vendredi) | publié avec 3 jours de retard |
| **Macro / taux** | taux US 2 ans / 10 ans, dollar, VIX, corrélations | `marches-macro.json`, `jour-US10Y.json`… | 5 min | séries journalières |
| **Calendrier économique** | annonces avec impact fort/moyen/faible, consensus, précédent | `marches/calendrier.js`, `calendrier2.json` | 5 min | la valeur « publiée » n'est pas fournie par la source gratuite |
| **Actualités** | titres par actif + règles « si… alors… » d'impact | `marches/onglet-actualite.js`, `marches/impact.js`, `actus-*.json` | 5 min | sources RSS grand public ; le réseau d'information (phase 3) les remplace par un fil noté |
| **Couverture** | corrélations, couverture de positions | `trader-pro/couverture/*` | à l'ouverture | calcul sur séries journalières |
| **Portefeuille / historique XTB** | positions fermées/ouvertes importées du fichier xStation, P&L, coach, risque global, journal par setup | `trader-pro/portefeuille/*`, Worker + D1 | à l'import | données privées : jamais dans git |
| **Investissement** | long terme : facteurs, horizons, fonds cotés, plan | `trader-pro/invest/*` | quotidien | hors périmètre du copilote Daily/H4 |
| **Analyste (cerveau)** | Rayle répond aux questions avec des outils et le manuel | `trader-pro/cerveau/*`, `manuel-rayle.md` | à la demande | l'IA ne calcule rien : les chiffres viennent des outils |
| **Rapports guidés** | visite animée narrée d'un actif | `trader-pro/rapports/*` | à la demande | texte généré par règles |

## Ce qui manque et que le copilote ajoute
- Une **fiche de lecture** par actif calculée côté serveur et stockée dans D1 (phase 1).
- Le **pétrole** en bougies H1/H4/Jour et M5/M15 (phase 1).
- Le **mouvement par session** avec heures de Paris et décalage été/hiver (phase 1).
- Des **connaissances** rédigées (phase 2), un **réseau d'information** noté (phase 3), des **points** parlés (phase 4), un **copilote en direct** (4 bis), des **alertes** (5) et un **carnet de prévisions** (6).

## Contraintes du plan gratuit (à respecter partout)
- Worker : 10 ms de CPU par exécution, 50 appels externes par exécution, 5 déclencheurs cron pour tout le compte (un seul utilisé : toutes les 5 min), 100 000 requêtes/jour.
- D1 : 5 millions de lignes lues/jour, 100 000 écrites/jour.
- GitHub Actions : minutes illimitées sur dépôt public ; déclencheur `schedule` au mieux toutes les 5 min, souvent retardé.
- **Conséquence de conception** : tout calcul lourd (bougies, MA200, statistiques) est fait par GitHub Actions et **envoyé au Worker** qui le stocke dans D1 ; le Worker ne fait que des lectures/écritures légères et des relances de requêtes réseau.
