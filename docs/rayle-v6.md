# Rayle v6 — terminal Volume professionnel + fiabilité sans serveur

Document de travail (2026-11-20, session autonome). Une section par phase : décisions, mesures, limites. Tout ce qui n'a pas pu être fait ou vérifié est dit.

---
# PARTIE A — Terminal Volume professionnel

## Phase A0 — Diagnostic de la chaîne de données

### Constat (mesuré le 20/11/2026, 17 h–18 h UTC)
- **Les quatre workflows existent et sont actifs** : `donnees` (boucle de 5 h, republie toutes les 5 min), `historique` (hebdomadaire dimanche 03:17 UTC + à la demande), `footprint` (chaque nuit 03:40 UTC), `invest`.
- **`permissions: contents: write` déjà présent** dans les trois workflows de données : l'écriture n'est pas en cause.
- **Branches et chemins** : `donnees` (instantanés + bougies Yahoo), `historique` (années gzip), `footprint` (mois gzip) et `donnees-invest` existent toutes ; les adresses de l'appli (`raw.githubusercontent.com/justinmaneiro-alt/Rayle-/<branche>/…`) correspondent.
- **Cause des 404 de la vidéo** : le robot `donnees` est une boucle de 5 h avec `cancel-in-progress: false`. L'exécution démarrée à 12:11 (ancien code) tenait le groupe de concurrence : les poussées de la v4 (qui ajoutent les futures NQ / ES / 6E) restaient « en attente » puis étaient annulées (`cancelled` dans `gh run list`). Les fichiers `bougies-NQ_F-*`, `bougies-ES_F-*`, `bougies-6E_F-*` n'existaient donc pas. **Corrigé en lançant le workflow à la main** (`gh workflow run donnees`, run 44779520705, 17:03 UTC) : tous les fichiers répondent maintenant 200 (vérifié par `curl`, voir ci-dessous).
- **Footprint « archive en cours de chargement »** : la branche `footprint` a été publiée par la première exécution complète (1 h 12) vers 14:48 UTC ; avant, `index.json` répondait 404, ce que le client traitait comme « archive vide » sans le dire. Vérifié maintenant : `index.json` 200, 3 476 octets, 3 actifs.
- **Pas de piège de concurrence à régler en changeant `cancel-in-progress`** : passer à `true` ferait se battre la boucle et sa relance automatique (chaque run annulé relance un nouveau run). On garde `false` et on documente : après un push qui change le robot, lancer `gh workflow run donnees` (ou annuler l'ancienne boucle).

### Vérification des fichiers (réponses HTTP 200)
`footprint/index.json`, `donnees/bougies-{NQ_F,ES_F,6E_F,GC_F}-{1h,1d}.json`, `historique/index.json`, `historique/btc/J/2026.json.gz` : tous 200.

### Repli propre (A0.3)
`chargerBarres` (volume-donnees.js) : si le fichier des futures manque → bougies de l'indice ou de la paire au comptant (`^NDX`, `^GSPC`, `EURUSD=X`), sans volume, badge **« Volume indisponible · bougies de secours »** ; si Binance est injoignable (crypto, or) → instantané du robot (Yahoo BTC-USD, SOL-USD, GC=F) ; si Binance est injoignable pour les futures et le repli aussi, l'erreur est dite. Jamais d'écran vide quand une source répond.

### Fichiers produits, taille, fréquence (mesuré)
| Branche | Contenu | Taille totale | Fréquence |
|---|---|---|---|
| `donnees` | 106 fichiers : bougies 5 m / 15 m / H1 / Daily (Yahoo : futures NQ, ES, 6E, GC ; indices ; paires), `pro-*.json` (analyse), `jour-*`, `marches-*`, actualités, COT, calendrier | 23,7 Mo (dont bougies H1 0,4 à 1,6 Mo par fichier) | boucle de 5 h : lot rapide toutes les 5 min, bougies toutes les 15 min, horaire toutes les heures |
| `historique` | 244 fichiers gzip (une année par fichier, par actif et unité) + `index.json` (écart de raccord mesuré) | 4,3 Mo | hebdomadaire + à la demande |
| `footprint` | 776 fichiers gzip (mois, par actif / unité / taille de case) + `index.json` + `etat.json` | 90 Mo | chaque nuit (jour J-1) |
| `donnees-invest` | scores Investissement, fonds | 85 Mo (5 055 fichiers) | nightly (workflow `invest`) |

---
