/* ═════════════ SERVICE WORKER DE RAYLÉ (V8 : téléphone et tablette seulement ; jamais enregistré sur PC) ═════════════
   But : une application qui s'ouvre vite, marche en lecture hors ligne (dernières données gardées par la page) et SE MET À JOUR TOUTE SEULE sans vider le cache à la main.
   • Fichiers du site (même origine) : RÉSEAU D'ABORD, copie en secours : un déploiement est vu tout de suite quand on a du réseau, la dernière version marche sans réseau.
   • Images des médias, tuiles : copie d'abord, 80 entrées au plus.
   • Jamais interceptés : le Worker de Raylé et toutes les API (la page gère son propre cache), la page caméra du téléphone (/camera/), les routes locales du PC (/__…), les requêtes non GET.
   • Mise à jour : changer VERSION (= window.RAYLE_VERSION de index.html) installe une nouvelle version qui ATTEND ; la page affiche « Nouvelle version disponible — Actualiser » ; au toucher, la page lui dit de prendre la main (SKIP_WAITING) puis se recharge.
   • Chaque version a ses caches : les anciens sont supprimés à l'activation. */
const VERSION = '2026.10.30.9';
const SHELL = 'rayle-shell-' + VERSION, IMAGES = 'rayle-images-1';
const COEUR = ['./', 'index.html', 'manifest.webmanifest', 'favicon.svg', 'icones/rayle-192.png', 'core/commun/appareil.js', 'core/mobile/mobile.css', 'core/mobile/mobile-contenus.css', 'core/mobile/mobile-agent.css',
  'core/mobile/mobile-calcul.js', 'core/mobile/mobile-donnees.js', 'core/mobile/mobile-coque.js', 'core/mobile/mobile-accueil.js'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.all(COEUR.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => { /* un fichier absent n'empêche pas l'installation */ })));
    // pas de skipWaiting automatique : la page propose l'actualisation (jamais de rechargement surprise pendant que Justin lit)
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('rayle-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); else if (e.data && e.data.type === 'VERSION' && e.source) e.source.postMessage({ type: 'VERSION', version: VERSION }); });

async function reseauDAbord(req) {
  const c = await caches.open(SHELL);
  try {
    const r = await fetch(req, { cache: 'no-cache' });
    if (r && r.ok && r.type === 'basic') c.put(req, r.clone()).catch(() => {});
    return r;
  } catch (err) {
    const copie = await c.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await c.match('index.html') || await c.match('./') : null);
    if (copie) return copie;
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
    if (u.pathname.includes('/camera/') || u.pathname.includes('/__') || req.headers.has('range')) return;       // caméra du téléphone, routes du PC, médias en flux : on ne touche à rien
    e.respondWith(reseauDAbord(req));
  } else if (req.destination === 'image') e.respondWith(copieDAbord(req));
  // tout le reste (Worker, API de marché, météo…) : le réseau, sans interception
});
