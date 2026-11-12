/* ═════════════ SERVICE WORKER DE RAYLÉ (application installable, PC, tablette et téléphone) ═════════════
   But : une application qui s'ouvre vite, marche hors ligne (coque + dernières pages vues) et SE MET À JOUR TOUTE SEULE.
   • Fichiers du site (même origine) : RÉSEAU D'ABORD, copie en secours : un déploiement est vu tout de suite quand on a du réseau, la dernière version marche sans réseau.
     Seuls les petits fichiers de l'application sont gardés (code, styles, données, petites images) : jamais les modèles 3D, textures, voix ni vidéos (trop lourds).
   • Hors ligne et page demandée absente : « offline.html » (explique ce qui manque, jamais une page blanche).
   • Images des médias : copie d'abord, 80 entrées au plus.
   • Jamais interceptés : le backend et toutes les API (la page gère son propre cache), les routes locales du PC (/__…), les requêtes non GET ou partielles (range).
   • 2026-11-12 : skipWaiting à l'installation + clients.claim + suppression de tous les anciens caches à l'activation ; la page se recharge toute seule au changement de version.
   • Mise à jour : changer VERSION (= window.RAYLE_VERSION de index.html, vérifié par build.mjs) installe une nouvelle version qui ATTEND ; la page affiche « Nouvelle version disponible » ;
     au toucher, la page envoie SKIP_WAITING puis se recharge. Chaque version a ses caches : les anciens sont supprimés à l'activation.
   COEUR est remplacé à la construction (build.mjs) par la liste exacte des fichiers chargés au démarrage. */
const VERSION = '2026.11.12.1';
const SHELL = 'rayle-shell-' + VERSION, IMAGES = 'rayle-images-1';
const COEUR = ['./', 'index.html', 'offline.html', 'manifest.webmanifest', 'favicon.svg', 'icones/rayle-192.png', 'config.js'];   // /*COEUR*/
const TAILLE_MAX = 600 * 1024;
const GARDER = /\.(?:js|mjs|css|html|json|webmanifest|svg|png|woff2?)$/i;
const JAMAIS = /\/(?:assets-lourds|captures[^/]*|docs|idees)\//i;

/* Notifications des flèches (mode Direct) : un clic ramène sur le terminal. */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => { const L = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); if (L.length) { try { await L[0].focus(); } catch (err) { /* */ } } else { await self.clients.openWindow((e.notification.data && e.notification.data.url) || './'); } })());
});
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // par lots de 8 (un serveur ne doit pas recevoir 90 demandes d'un coup), un nouvel essai par fichier ; un fichier absent n'empêche pas l'installation
    const un = async u => { for (let k = 0; k < 2; k++) { try { await c.add(new Request(u, { cache: 'reload' })); return; } catch (err) { /* nouvel essai */ } } };
    for (let i = 0; i < COEUR.length; i += 8) await Promise.all(COEUR.slice(i, i + 8).map(un));
    self.skipWaiting();   // 2026-11-12 : la nouvelle version prend la main tout de suite (l'ancienne interface mobile ne doit plus jamais rester affichée)
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== IMAGES) await caches.delete(k);   // TOUS les anciens caches (coque mobile comprise)
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
  else if (e.data && e.data.type === 'VERSION' && e.source) e.source.postMessage({ type: 'VERSION', version: VERSION });
});

async function reseauDAbord(req) {
  const c = await caches.open(SHELL), u = new URL(req.url);
  try {
    const r = await fetch(req, { cache: 'no-cache' });
    const taille = +(r && r.headers.get('content-length') || 0);
    if (r && r.ok && r.type === 'basic' && GARDER.test(u.pathname) && !JAMAIS.test(u.pathname) && taille < TAILLE_MAX) c.put(req, r.clone()).catch(() => {});
    return r;
  } catch (err) {
    const copie = await c.match(req, { ignoreSearch: true });
    if (copie) return copie;
    if (req.mode === 'navigate') return (await c.match('index.html')) || (await c.match('./')) || (await c.match('offline.html')) || Response.error();
    if (/\.html?$/i.test(u.pathname)) { const o = await c.match('offline.html'); if (o) return o; }
    throw err;
  }
}
async function copieDAbord(req) {
  const c = await caches.open(IMAGES), copie = await c.match(req);
  if (copie) return copie;
  try {
    const r = await fetch(req);
    if (r && (r.ok || r.type === 'opaque')) { await c.put(req, r.clone()).catch(() => {}); const cles = await c.keys(); if (cles.length > 80) for (const k of cles.slice(0, cles.length - 80)) await c.delete(k); }
    return r;
  } catch (err) { return Response.error(); }
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) {
    if (u.pathname.includes('/__') || req.headers.has('range') || /^\/(?:health|sources|actualites|meteo|evenements|calendar|cot|macro|sec|wgc|ce-jour-la|chat|tts)(?:\/|$)/.test(u.pathname)) return;   // routes du PC ou du backend servi sur la même origine : le réseau, sans interception
    e.respondWith(reseauDAbord(req));
  } else if (req.destination === 'image') e.respondWith(copieDAbord(req));
  // tout le reste (backend, API de marché, météo…) : le réseau, sans interception
});
