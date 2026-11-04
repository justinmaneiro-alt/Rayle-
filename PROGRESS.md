# Nuit autonome (2026-11-05) — avancement

Reprendre ici : lire ce fichier, puis `RAPPORT-NUIT.md`. Reprendre à la première tâche non terminée. Branches de travail : `nuit/pN`, fusionnées dans `main` à chaque fin de phase.

| Phase | État | Date |
|---|---|---|
| 1. Enregistrement renforcé | fait | 2026-11-05 |
| 2. Gros mouvements, fiches, analyse | fait | 2026-11-05 |
| 3. Copilote : zones et ranges | à faire | |
| 4. Copilote : flèches et bilan | à faire | |
| 5. Terre 2.0 : étude et architecture | à faire | |
| 6. Terre 2.0 : globe et villes 3D | à faire | |
| 7. Terre 2.0 : couches gratuites | à faire | |
| 8. Terre 2.0 : modes de vision | à faire | |
| 9. Rayle pilote la Terre | à faire | |
| 10. Vérification finale | à faire | |

## Fait
- **Phase 1** : `agent-trading/moteur/collecte.js` (hors dépôt) branché dans le moteur : carnet 50 niveaux/côté toutes les 5 s, toutes les transactions (ms, côté agresseur), événements de murs, OI + funding chaque minute, bougies M15/H1 closes (volume acheteur/vendeur, delta, empreinte), trous marqués (`collecte/trous.jsonl`), vidage gzip chaque minute, rotation horaire, ménage 200 jours / 30 Go, contrôle d'intégrité + sauvegarde quotidienne (`C:\Users\justi\Sauvegardes-Rayle\donnees-marche\<jour>`, manifeste sha256) avec ligne dans le Journal. Flux complet du carnet ramené à 14 jours / 12 Go. Moteur redémarré, enregistrement vérifié. Test : `moteur/tests/collecte-test.mjs`.
- **Phase 2** : `agent-trading/moteur/etude-mouvements/` (hors dépôt) : `detection.js`, `signes.js`, `donnees.js`, `fiches.js`, `hebdo.mjs` (lancé par le moteur chaque lundi ≥ 06:00 UTC, priorité basse). Premier rapport `RAPPORT-MOUVEMENTS-2026-11-04.md`, 1 339 fiches + planches (`%LOCALAPPDATA%\Rayle\agent-trading\mouvements\`). Test : `moteur/tests/mouvements-test.mjs`.

## En cours
- Phase 3.

## Bloqué
- (rien)
