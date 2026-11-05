# Phase F « Copilote de l'or » (2026-11-05) — avancement

Reprendre ici. Branche `copilote-or`, fusionnée dans `main`. Rapport complet HORS dépôt : `agent-trading/RAPPORT-OR.md`. Phases B et C : pas commencées (l'or passait avant).

| Étape | État |
|---|---|
| 1. Flux comparés sur 30 j (7 sources gratuites) → référence Binance perpétuel XAUUSDT, exécution Kraken PF_XAUUSD (écart + fourchette en direct), « données insuffisantes » sinon | fait |
| 2. Sessions figées (Asie 00:00–08:00 Paris, Londres 08:00 Londres, New York 08:30 NY) ; balayage, cassure avec volume, rejet | fait |
| 3. Niveaux (8 au plus : veille, semaine, sessions, ronds 50/100, 2 zones de volume) | fait |
| 4. Annonces : Forex Factory + secours manuel (NFP, Fed) ; blocage −30/+15 min ; compte à rebours | fait |
| 5. Stops/cibles à l'ATR M15/H1, TROP TARD (R < 1,5), contrôle de fourchette Kraken | fait |
| 6. Plans A/B + checklist de l'or 6 critères sur le graphique ; Telegram (pont existant) seulement si validé, mention « SIMULATION, setup NON VALIDÉ » | fait (« PHASE D » absente du dépôt : pont Telegram existant utilisé) |
| 7. Bilan direct 8/24 bougies vs hasard ; rétro-test PAXG 2020→ + XAUUSDT, calibration/validation, Holm | fait : AUCUN setup validé, Telegram désactivé |
| 8. RAPPORT-OR.md | fait |

- Moteur (hors dépôt) : `agent-trading/moteur/copilote/or/` (`sources.js`, `comparer-sources.mjs`, `regles-or.js` figé `or-v1`, `calendrier-or.js`, `index.js`, `retro-or.mjs`). Tests : `moteur/tests/or-test.mjs` (dans `npm test`), Chrome `moteur/tests/ecran-or.mjs` (serveur 8011 + `REEL=1 relais-page.mjs 8799`).
- Dépôt : `agent-trading/front/copilote-or.js` + branchements `graphique.js`, `vue.js`, `copilote-visuel.js`, `agent.css`.
- Moteur redémarré le 2026-11-05 19:27 UTC : « copilote or : démarré or-v1 ».

---

# Mission « Copilote visuel » (2026-11-05) — avancement

Reprendre ici. Branche `copilote-visuel`, fusionnée dans `main` à la fin. Rapport complet HORS dépôt : `agent-trading/RAPPORT-COPILOTE.md`.

| Phase | État |
|---|---|
| 1. Bandeau « situation » (tendance H1/H4 par structure, position, phrase) | fait |
| 2. Niveaux (veille, semaine, Asie, Londres, VWAP ; VAH/POC/VAL affichage) | fait |
| 3. Plans A/B (zone, invalidation, cibles 2R–5R, TROP TARD 1,5 réglable, recalcul M15, raison du retrait) | fait |
| 4. Checklist de confluence n/6 (détail au toucher, alerte dans l'app avec capture, plafonds 4/j et 2/actif/j) | fait |
| 5. Setups nommés v1 (figés, versionnés) | fait |
| 6. Journal et bilan (8 et 24 bougies, R net, hasard, « Je l'ai pris », rétro-test calibration/validation) | fait : AUCUN setup validé, alertes des setups désactivées |
| 7. Commentaire + « Demander au copilote » (données structurées, « je ne sais pas ») | fait |
| Fin : tests, 4 tests Kepler obsolètes corrigés, rapport, Worker rayle-agent-trading redéployé | fait |

- Moteur (hors dépôt) : `agent-trading/moteur/copilote/visuel/` (`regles.js`, `index.js`, `retro.mjs`, `qualite.mjs`). Tests : `moteur/tests/visuel-test.mjs` (dans `npm test`), Chrome `moteur/tests/ecran-visuel.mjs`.
- Dépôt : `agent-trading/front/copilote-visuel.js`, `agent-trading/commun/questions.js`, ajouts `graphique.js`, `vue.js`, `connexion.js`, `agent.css`, Worker `agent-trading/worker/src/index.js` (relais « Je l'ai pris »).
- Après un déploiement du Worker de l'agent : redémarrer le moteur (sinon il reste sur l'ancienne instance).

---

# Nuit autonome (2026-11-05) — avancement

Reprendre ici : lire ce fichier, puis `RAPPORT-NUIT.md`. Reprendre à la première tâche non terminée. Branches de travail : `nuit/pN`, fusionnées dans `main` à chaque fin de phase.

| Phase | État | Date |
|---|---|---|
| 1. Enregistrement renforcé | fait | 2026-11-05 |
| 2. Gros mouvements, fiches, analyse | fait | 2026-11-05 |
| 3. Copilote : zones et ranges | fait | 2026-11-05 |
| 4. Copilote : flèches et bilan | fait | 2026-11-05 |
| 5. Terre 2.0 : étude et architecture | fait | 2026-11-05 |
| 6. Terre 2.0 : globe et villes 3D | fait (sans jeton testé) | 2026-11-05 |
| 7. Terre 2.0 : couches gratuites | fait | 2026-11-05 |
| 8. Terre 2.0 : modes de vision | fait | 2026-11-05 |
| 9. Rayle pilote la Terre | fait | 2026-11-05 |
| 10. Vérification finale | fait | 2026-11-05 |

## Fait
- **Phase 1** : `agent-trading/moteur/collecte.js` (hors dépôt) branché dans le moteur : carnet 50 niveaux/côté toutes les 5 s, toutes les transactions (ms, côté agresseur), événements de murs, OI + funding chaque minute, bougies M15/H1 closes (volume acheteur/vendeur, delta, empreinte), trous marqués (`collecte/trous.jsonl`), vidage gzip chaque minute, rotation horaire, ménage 200 jours / 30 Go, contrôle d'intégrité + sauvegarde quotidienne (`C:\Users\justi\Sauvegardes-Rayle\donnees-marche\<jour>`, manifeste sha256) avec ligne dans le Journal. Flux complet du carnet ramené à 14 jours / 12 Go. Moteur redémarré, enregistrement vérifié. Test : `moteur/tests/collecte-test.mjs`.
- **Phase 2** : `agent-trading/moteur/etude-mouvements/` (hors dépôt) : `detection.js`, `signes.js`, `donnees.js`, `fiches.js`, `hebdo.mjs` (lancé par le moteur chaque lundi ≥ 06:00 UTC, priorité basse). Premier rapport `RAPPORT-MOUVEMENTS-2026-11-04.md`, 1 339 fiches + planches (`%LOCALAPPDATA%\Rayle\agent-trading\mouvements\`). Test : `moteur/tests/mouvements-test.mjs`.

- **Phase 3** : zones de volume + ranges (moteur `copilote/zones.js`, `copilote/index.js`, dessin `front/graphique.js`).
- **Phase 4** : flèches (`copilote/fleches.js`, `copilote/suivi.js`), bulle, bilan, rejeu dans Backtest, notification, réglage Telegram verrouillé. Tests : `moteur/tests/copilote-test.mjs`, Chrome `moteur/tests/ecran-copilote.mjs`.

- **Phases 5-8** : `terre-v2/` (index, config, vision, couches/*, relais/ déployé), `TERRE-V2-PLAN.md`, `THIRD_PARTY_NOTICES.md`. Tests : `galaxie/tests/terre2-test.mjs` (dans `npm test` à la racine), Chrome `tests-navigateur/terre2-test.mjs`.

- **Phase 9** : `terre-v2/voix.js` + branchement `core/intelligence/phrase.js`. Tests : `galaxie/tests/terre2-test.mjs`, Chrome `tests-navigateur/terre2-test.mjs`, `terre2-integration-test.mjs`.

- **Phase 10** : tests et captures (voir RAPPORT-NUIT.md).

## En cours
- Rien : les 10 phases sont faites. Reste : voir « Ce qui reste » dans RAPPORT-NUIT.md (jeton Cesium, clés, conditions Caltrans).

## Bloqué
- (rien)
