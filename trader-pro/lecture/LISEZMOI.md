# Moteur de lecture de marché (copilote, phase 1)

Des FAITS calculés par le code, jamais par l'IA. Un actif = une « fiche de lecture » (JSON horodaté).

- `sessions.js` : sessions Asie / Londres / New York / creux à l'heure locale de chaque place (le décalage heure d'été / hiver, y compris les semaines où l'Europe et les États-Unis ne changent pas ensemble, est géré par `Intl`).
- `calculs.js` : tendance par unité (M5 et M15 seulement en interne), croisements de la MA200 (confirmé / en attente / échoué, avec ou sans volume ×2 = « vraie cassure »), bougies de fort volume et leurs stats, mouvement récent, mouvement par session et comportement typique ou non, niveaux (PDH/PDL, PWH/PWL, range asiatique, supports/résistances, balayages), régime (tendance/range, compression, ATR), gros mouvements avec seuil CALIBRÉ sur l'historique H4 (au plus ~3 situations par semaine et par actif).
- `fiche.js` : assemble tout + score de marché, COT, flux, carnet (instantané Kraken), agenda du jour, actualités des 12 dernières heures, journal des faits notables des 72 dernières heures.

Calcul : `outils-donnees/lecture.mjs` (GitHub Actions, toutes les 5 minutes, PC éteint) → fichiers `lecture-<actif>.json` sur la branche `donnees` + Worker/D1 (`PUT /lecture/fiches`).
Pourquoi pas dans le Worker : 10 ms de CPU par exécution sur le plan gratuit.
Tests : `node trader-pro/tests/lecture-test.mjs` et `lecture-worker-test.mjs`.
Limites connues : pas de COT pour le pétrole ; M5 de l'or vient des futures COMEX (niveau différent du perpétuel Kraken) et ne sert qu'à la détection ; carnet seulement pour l'or, le Bitcoin et Solana.
