# Agent de trading V2 — avancement

Reprendre ici : lire ce fichier, puis `RAPPORT-AGENT.md` (local, choix faits seul). Branche de travail : `agent-trading-pN`, fusionnée dans `main` à chaque fin de phase.

## Fait
- **Phase 1 — Données Kraken** : actifs vérifiés (tableau dans le rapport) ; flux WebSocket Kraken Futures (échanges avec côté agresseur + carnet COMPLET, ~1 600 niveaux par côté sur BTC) ; bougies M15/H1 (historique Kraken depuis 2022 pour BTC, delta réel depuis le démarrage du moteur) ; volume net (delta, CVD), profil (VAH/POC/VAL jour / veille / semaine / plage libre, réel ou « approx »), carnet (murs, déséquilibre, absorption, ordres retirés/mangés, grosses transactions) ; enregistrement gzip du carnet + rejeu. Tests : `node moteur/tests/phase1-test.mjs`, `rejouer-test.mjs`.

- **Phase 2 — Portefeuille et registre** : `moteur/registre.js` (registre unique, entrée seulement si touchée, SL avant TP dans une même bougie, frais 0,05 % par côté + parcours du carnet + 1 pas au stop, tout au centime), `moteur/portefeuille.js` (capital = départ + réalisé + flottant, semaine depuis lundi 00:00 Paris, baisse max flottant inclus, limite statique/suiveuse, instantané minute), `moteur/performance.js` (R moyen, IC 95 %, statut), définitions ⓘ `commun/definitions.js`. Tests : `node moteur/tests/phase2-test.mjs`.

- **Phase 3 — Stratégie et autonomie** : `moteur/strategie.js` (REJET / CASSURE / ABSORPTION, volume seulement, anti-bruit unique, règles dures), `agent.js` (décision à la clôture M15 + sur événement : niveau du profil touché, mur retiré/mangé), `narration.js` (carnet raconté simplement, cadres « regard »), `ia.js` (LM Studio Dolphin, débit limité, chiffres vérifiés, ne crée jamais de position), `adaptation.js` (fantômes, 1×/semaine max, ≥ 30 trades, validé hors apprentissage, retour arrière), `backtest.js` (honnête, limites écrites), `etat.js` + `publication.js` (état numéroté rapide/lent/historique/courbe), `alertes.js` (Telegram via le pont), Worker `worker/` (DO relais, DÉPLOYÉ : https://rayle-agent-trading.justinmaneiro.workers.dev). Tests : `node moteur/tests/phase3-test.mjs`.

## En cours
- Phase 4 — fenêtre unique (front).

## Reste
- Phase 3 stratégie + IA, phase 4 fenêtre unique, phase 5 alertes, phase 6 vérification, service Windows, déploiement du Worker `rayle-agent-trading`.

## Repères
- Moteur (HORS dépôt, `.gitignore`) : `agent-trading/moteur/`. Données : `%LOCALAPPDATA%\Rayle\agent-trading\`.
- Partagé moteur + affichage (dans le dépôt) : `agent-trading/commun/`. Affichage : `agent-trading/front/`. Worker séparé : `agent-trading/worker/`.
- Le Worker principal `rayle` n'est PAS redéployé (sa dernière version n'a pas les secrets) : l'agent a son propre Worker.
