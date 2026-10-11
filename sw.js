/* Service worker de Raylé : PRUDENT.
   - Réseau d'abord pour tout (page, CSS, JS versionnés) : une version fraîche gagne toujours.
   - Le cache ne sert qu'EN SECOURS, quand le réseau échoue ou met plus de 8 s à répondre.
   - Ne touche jamais aux autres origines (Worker, TradingView, Bitstamp…) ni aux requêtes non GET.
   - Un cache par version ; les anciens sont supprimés à l'activation.
   - Raccourcis d'appli (appui long sur l'icône : Parler, Terminal, Briefing, Monde) et mini-vue : ce sont des ouvertures de
     index.html avec un #repère (#parler, #terminal, #briefing, #monde, #mini). Le repère reste dans la page (js/rayle/raccourcis.js) ;
     ici, ce sont des navigations comme les autres : réseau d'abord, copie de secours si le réseau manque (le raccourci marche hors ligne).
     Leurs icônes sont mises de côté à l'installation.
   - Textures réelles du fond Espace (ui/assets/espace/, ~2,5 Mo en tout, chargées à la demande) : cache d'abord, dans un cache À PART qui survit aux
     changements de version (elles ne sont ni retéléchargées à chaque mise à jour, ni perdues hors ligne). Si une image change, changer CACHE_TEX. */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'rayle-' + VERSION;
const DELAI_MS = 8000;
const CACHE_TEX = 'rayle-tex-1';
const DE_COTE = ['./index.html', './manifest.webmanifest', './icones/icone-192.png',
  './ui/assets/fond-globe-planete.webp', './ui/assets/fond-espace-paysage.webp', './ui/assets/fond-espace-portrait.webp',   // images fixes de l'Espace (mode Éco) : disponibles hors ligne
  './icones/raccourci-parler.png', './icones/raccourci-terminal.png', './icones/raccourci-briefing.png', './icones/raccourci-monde.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  // un fichier manquant ne doit pas empêcher de garder les autres
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(DE_COTE.map(u => c.add(u).catch(() => {})))).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('rayle-tex-')) { if (k !== CACHE_TEX) await caches.delete(k); }
      else if (k.startsWith('rayle-') && k !== CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

async function texturesCacheDabord(req) {
  const c = await caches.open(CACHE_TEX);
  const vu = await c.match(req);
  if (vu) return vu;
  const rep = await fetch(req);
  if (rep && rep.ok) c.put(req, rep.clone()).catch(() => {});
  return rep;
}
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
  if (u.pathname.includes('/ui/assets/espace/')) { e.respondWith(texturesCacheDabord(req)); return; }
  e.respondWith(reseauPuisSecours(req));
});
