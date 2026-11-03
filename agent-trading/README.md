# Agent de trading de Rayle (SIMULATION)

Module isolé : aucun ordre réel, aucune clé de trading, données publiques Kraken Futures seulement.

- `commun/` : formats, actifs, longueur des traits, textes d'alerte (partagés par le moteur et l'affichage).
- `front/` : la fenêtre unique (PC, tablette, téléphone). Graphique : TradingView Lightweight Charts™ (Apache-2.0, `front/vendor/`).
- `worker/` : relais Cloudflare (Durable Object) qui transmet l'état publié par le moteur, tel quel, à tous les écrans. Aucun secret.
- `moteur/` : le moteur (calculs, stratégie) tourne sur le PC ; il n'est PAS publié.

Points d'entrée dans Rayle : bouton « ◈ Agent de trading » du terminal de Mars, tuile « Agent de trading » de l'écran Marchés. Supprimer ce dossier suffit à retirer l'agent (les deux boutons disparaissent seuls).

Tests : `npm test` dans ce dossier.
