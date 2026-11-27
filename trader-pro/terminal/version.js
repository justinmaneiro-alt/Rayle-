/* Version du CODE du terminal pro. Elle doit être identique à celle de sw.js, precache.json, index.html et agent-trading/front/or.html
   (montée de version : node trader-pro/outils/precache.mjs <version> ; test : trader-pro/tests/ma200-test.mjs). Affichée en petit sur le graphique ; or.html la compare à la version publiée
   et force la mise à jour (service worker + caches) quand le code chargé n'est pas le bon. */
export const VERSION = '2026.11.27.2';
