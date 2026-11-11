/* ═════════════ CONFIGURATION UNIQUE DE L'APPLICATION (côté page) ═════════════
   L'adresse du backend se règle ici (ou dans ⚙ Réglages, qui a priorité sur cet appareil). Aucun secret : le jeton n'est jamais écrit ici.
   · Application ouverte EN LOCAL (localhost, 127.0.0.1, adresse du réseau local) : le backend local est choisi automatiquement (le serveur du PC l'embarque,
     même adresse, aucun CORS) et aucun jeton n'est demandé.
   · Partout ailleurs (GitHub Pages…) : le Worker Cloudflare (workerDistant) avec le jeton saisi dans ⚙ Réglages.
   Pour un serveur Node autonome : `node build.mjs --meme-origine` (voir DEPLOIEMENT.md). */
window.RAYLE_CONFIG = (function () {
  var h = location.hostname;
  var local = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\]|[^.]+\.local)$/.test(h) && /^https?:$/.test(location.protocol);
  var distant = 'https://rayle.justinmaneiro.workers.dev';   // /*URL*/
  return { workerUrl: local ? location.origin : distant, workerDistant: distant, local: local, sansJeton: local };
})();
