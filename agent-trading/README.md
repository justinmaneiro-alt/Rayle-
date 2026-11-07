# Agent de trading de Rayle (SIMULATION)

Module isolé : aucun ordre réel, aucune clé de trading, données publiques Kraken Futures seulement.

- `commun/` : formats, actifs, longueur des traits, textes d'alerte (partagés par le moteur et l'affichage).
- `front/` : la page unique qui défile (PC, tablette, téléphone ; plus aucun onglet), graphique en plein écran (⤢ ou touche F). Graphique : TradingView Lightweight Charts™ (Apache-2.0, `front/vendor/`).
- `worker/` : relais Cloudflare (Durable Object) qui transmet l'état publié par le moteur, tel quel, à tous les écrans. Aucun secret.
- `moteur/` : le moteur (calculs, stratégie) tourne sur le PC ; il n'est PAS publié.

Points d'entrée dans Rayle : bouton « ◈ Agent de trading » du terminal de Mars, tuile « Agent de trading » de l'écran Marchés. Supprimer ce dossier suffit à retirer l'agent (les deux boutons disparaissent seuls).

Positions « normales » et « GRANDES » (même risque fixe de 0,5 % du capital réalisé), backtest « 7 derniers jours » publié par le moteur (étiqueté « REJOUÉ, pas réel »).

Tests : `npm test` dans ce dossier. Détail de la page unique, des grandes positions et du backtest : `RAPPORT-PAGE-UNIQUE.md`.

## Tableau de bord de l'or (2026-11-07)
`front/or.html` : graphique Kraken PF_XAUUSD (heure de Paris), 3 couches (zones de volume, supports-résistances, zones de retournement mesurées contre le hasard), lecture du graphique, carnet complet, journal de trades, gardien de drawdown, musique (lecteur officiel YouTube), mode télé (`?tele=1`, adresses courtes `/tv` et `/tc`). Relais dédié sans secret : `relais-or/`. Rien n'est un signal ; aucun ordre.
