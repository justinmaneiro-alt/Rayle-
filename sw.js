/* Service worker de Raylé : PRUDENT.
   - Réseau d'abord pour tout (page, CSS, JS versionnés) : une version fraîche gagne toujours.
   - Le cache ne sert qu'EN SECOURS, quand le réseau échoue ou met plus de 8 s à répondre.
   - Ne touche jamais aux autres origines (Worker, TradingView, Bitstamp…) ni aux requêtes non GET.
   - Un cache par version ; les anciens sont supprimés à l'activation. */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'rayle-' + VERSION;
const DELAI_MS = 8000;

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./index.html', './manifest.webmanifest', './icones/icone-192.png'])).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('rayle-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function reseauPuisSecours(req) {
  const nav = req.mode === 'navigate';
  // la page est toujours revalidée ; les fichiers versionnés (?v=…) sont immuables, le cache HTTP du navigateur suffit
  const demande = nav ? new Request(req, { cache: 'no-cache' }) : req;
  try {
    const rep = await Promise.race([
      fetch(demande),
      new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), DELAI_MS))
    ]);
    if (rep && rep.ok) { const c = await caches.open(CACHE); c.put(nav ? './index.html' : req, rep.clone()).catch(() => {}); }
    return rep;
  } catch (err) {
    const c = await caches.open(CACHE);
    const vieux = (await c.match(nav ? './index.html' : req)) || (await c.match(req, { ignoreSearch: true }));
    if (vieux) return vieux;
    throw err;
  }
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return;
  if (u.pathname.endsWith('/sw.js')) return;
  e.respondWith(reseauPuisSecours(req));
});
