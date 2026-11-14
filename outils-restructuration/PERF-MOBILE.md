# Performance mobile (2026-11-14)
Conditions : Galaxy S23 émulé (412×915, ×2), CPU ralenti ×4, réseau 1,6 Mbit/s / 150 ms, GPU logiciel SwiftShader (pessimiste). Script : `tests-navigateur/perf-mobile-test.mjs` (chiffres bruts : `perf-mesures.json`). Plafonds vérifiés automatiquement (échec si dépassés).

| Mesure | Avant (visite sans précache) | Après (appli installée, 2e visite) | Plafond |
|---|---|---|---|
| Écran noir avant le terminal | 8 s et plus (relevé de la vidéo) ; squelette absent | **squelette 0,8 s** | 1,5 s |
| Premier graphique du terminal | ≈ 13 à 15 s | **1,5 s** | 9 s |
| Plus longue tâche (> 50 ms) | 1,2 à 2,0 s (calcul des flèches sur le fil principal) | **0,12 s** | 1,5 s |
| Marchés prêt (fiche d'actif) | 18 s (flèches v8 bloquantes) | **0,5 s** copie locale · 11,7 s données froides | 12 s |
| Mémoire JS | — | 26 Mo, 24 Mo après fermeture de la Terre | 220 Mo |
| Terre mobile affichée | ne s'affichait pas | 0,2 à 3,4 s | — |

Causes traitées : (1) tout le code venait du réseau à chaque ouverture → `precache.json` (326 fichiers, 5,4 Mo) installé avec le service worker, code et ressources **cache d'abord**, pages et `sw.js` réseau d'abord ; (2) squelette immédiat (`application.js`, `vue-terminal.js`) ; (3) calcul des statistiques et des flèches v8 dans un **Web Worker** (`marches/calcul-worker.js`), l'affichage ne l'attend pas ; (4) la miniature de la Terre téléchargeait des textures 8k (5 Mo) sur téléphone → image de 30 Ko ; (5) Terre mobile : textures 1k immédiates (58 + 95 + 111 Ko) puis 4k (638 Ko) selon le GPU et la mémoire, libération complète à la fermeture, pause quand l'onglet est caché ; (6) `devicePixelRatio` plafonné à 2, ombres et filtres absents du graphique mobile (existant).

Limites honnêtes : la **toute première visite** reste lente (5,4 Mo à télécharger) ; les mesures de GPU sont faussées par SwiftShader ; le recalcul incrémental « dernière bougie seulement » des flèches v8 n'est pas fait (le moteur v8 est scellé : ses règles ne changent pas), le calcul complet est déporté dans le Worker ; pas de mesure sur un vrai téléphone.
