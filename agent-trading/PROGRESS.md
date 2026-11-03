# Agent de trading V2 — avancement

Reprendre ici : lire ce fichier, puis `RAPPORT-AGENT.md` (local, choix faits seul). Branche de travail : `agent-trading-pN`, fusionnée dans `main` à chaque fin de phase.

## Fait
- **Phase 1 — Données Kraken** : actifs vérifiés (tableau dans le rapport) ; flux WebSocket Kraken Futures (échanges avec côté agresseur + carnet COMPLET, ~1 600 niveaux par côté sur BTC) ; bougies M15/H1 (historique Kraken depuis 2022 pour BTC, delta réel depuis le démarrage du moteur) ; volume net (delta, CVD), profil (VAH/POC/VAL jour / veille / semaine / plage libre, réel ou « approx »), carnet (murs, déséquilibre, absorption, ordres retirés/mangés, grosses transactions) ; enregistrement gzip du carnet + rejeu. Tests : `node moteur/tests/phase1-test.mjs`, `rejouer-test.mjs`.

- **Phase 2 — Portefeuille et registre** : `moteur/registre.js` (registre unique, entrée seulement si touchée, SL avant TP dans une même bougie, frais 0,05 % par côté + parcours du carnet + 1 pas au stop, tout au centime), `moteur/portefeuille.js` (capital = départ + réalisé + flottant, semaine depuis lundi 00:00 Paris, baisse max flottant inclus, limite statique/suiveuse, instantané minute), `moteur/performance.js` (R moyen, IC 95 %, statut), définitions ⓘ `commun/definitions.js`. Tests : `node moteur/tests/phase2-test.mjs`.

- **Phase 3 — Stratégie et autonomie** : `moteur/strategie.js` (REJET / CASSURE / ABSORPTION, volume seulement, anti-bruit unique, règles dures), `agent.js` (décision à la clôture M15 + sur événement : niveau du profil touché, mur retiré/mangé), `narration.js` (carnet raconté simplement, cadres « regard »), `ia.js` (LM Studio Dolphin, débit limité, chiffres vérifiés, ne crée jamais de position), `adaptation.js` (fantômes, 1×/semaine max, ≥ 30 trades, validé hors apprentissage, retour arrière), `backtest.js` (honnête, limites écrites), `etat.js` + `publication.js` (état numéroté rapide/lent/historique/courbe), `alertes.js` (Telegram via le pont), Worker `worker/` (DO relais, DÉPLOYÉ : https://rayle-agent-trading.justinmaneiro.workers.dev). Tests : `node moteur/tests/phase3-test.mjs`.

- **Phase 4 — Fenêtre unique** : `front/vue.js` (même composant PC / tablette / téléphone ; grille ≥ 1100 px, sinon onglets Graphique | Carnet | Positions | Portefeuille), `graphique.js` (Lightweight Charts v5.2.1 + primitives : 3 petits traits + badge, profils VAH/POC/VAL, niveaux, zones, prix + compte à rebours, volume total + volume net + CVD publiés par le moteur), `carnet.js` (échelle complète, cumuls, murs, flashs, cadres blancs « regard »), `panneaux.js` (positions, historique CSV, portefeuille animé, journal, ⓘ), `carte-alerte.js`, `jetons.css` (toutes les durées / courbes / couleurs), `connexion.js` (WebSocket du relais, hors ligne). Entrées : bouton « ◈ Agent de trading » du terminal de Mars (`planetes/mars/pc/trading/espace.js`) et tuile de l'écran Marchés (`core/mobile/mobile-marches.js`), par `import()` (disparaissent si le dossier est supprimé). Tests : `node tests/front-test.mjs` ; captures `node moteur/tests/ecran-reel.mjs 8011` (vraies données), `relais-demo.mjs` + `ecran-positions.mjs` (3 positions).

- **Phase 5 — Alertes** : Telegram par le pont existant (`moteur/alertes.js`, ENTREE / EXECUTION, file + débit ; pont testé), carte plein écran avec « Copier » par champ et « Tout copier » (format brut). Tests : `moteur/tests/phase5-test.mjs`, capture `ecran-alerte.mjs`.
- **Phase 6 — Vérification et publication** : `npm test` (tout passe), prix unique de bout en bout (`prix-unique-test.mjs`), parité PC/téléphone au centime + hors ligne (Chrome), entrées dans Rayle (Chrome), captures 1600 / 384 px avec 3 positions. Démarrage auto installé (clé Run + superviseur, sans admin ; commande admin dans le rapport). Worker de l'agent déployé (7228503b). Fusion dans main + push.

## En cours
- Rien. Le moteur tourne et enregistre.

## Reste (prochaines sessions)
- Laisser tourner pour accumuler du volume net et du carnet, puis relire le backtest (« Pas assez de trades » pour l'instant).
- Ajuster les animations avec les vidéos de Justin (`front/jetons.css`).
- Vérifier sur la vraie tablette et le vrai téléphone.

## Repères
- Moteur (HORS dépôt, `.gitignore`) : `agent-trading/moteur/`. Données : `%LOCALAPPDATA%\Rayle\agent-trading\`.
- Partagé moteur + affichage (dans le dépôt) : `agent-trading/commun/`. Affichage : `agent-trading/front/`. Worker séparé : `agent-trading/worker/`.
- Le Worker principal `rayle` n'est PAS redéployé (sa dernière version n'a pas les secrets) : l'agent a son propre Worker.
