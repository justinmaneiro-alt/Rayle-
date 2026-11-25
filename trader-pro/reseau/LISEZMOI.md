# Réseau d'information (copilote, phase 3)

Transforme l'actualité en un fil de trader : seulement ce qui peut faire bouger mes 7 actifs (or, Nasdaq 100, S&P 500, Bitcoin, Solana, pétrole, dollar), noté de 0 à 100, avec ce que le marché a réellement fait.

- `config.js` : sources (toutes gratuites, sans clé ; X/Twitter exclu car payant), personnalités (poids 1 à 5, modifiables depuis Marchés › Actualité › Sources et réglages), sujets, détection du sens du propos.
- `parse.js` : lecture RSS / Atom / EDGAR légère. `etat.js` : dédoublonnage (5 sources = 1 carte), fils d'histoire sur 72 h avec revirement, score expliqué, alertes (1 par fil / 30 min sauf revirement). `reaction.js` : réaction réelle à 5, 15 et 60 minutes (en % et en ATR) et précédents (≥ 3 cas).
- `client.js`, `rendu.js`, `textes.js`, `alertes-voix.js` : lecture sur l'appareil (Worker puis repli sur le fichier publié), pages, voix, mode nuit.
- Voie rapide : Worker toutes les 2 minutes. Voie complète : `outils-donnees/reseau.mjs` (GitHub Actions) ; mémoire des annonces : `outils-donnees/annonces.mjs`.
- Sources testées le 2026-11-24 : toutes en ligne sauf le flux direct du BLS (403 aux robots, marqué « hors ligne » dans le tableau d'état).
- Annonces notées : `trader-pro/marches/annonce.js` (note, scénarios, réaction historique mesurée) ; page détail dans Marchés › Aujourd'hui.
