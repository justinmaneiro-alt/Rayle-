// V8 : application installable, hors ligne et mises à jour fiables (service worker). Un petit relais sert le site avec un sw.js dont la version peut changer en cours de test.
//   node tests-navigateur/v8-pwa-test.mjs
import http from 'node:http';
process.env.BASE = 'http://127.0.0.1:8131';
const { ouvrirMobile, attendre } = await import('./v8-aide.mjs');
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) { ok++; console.log('OK  ' + n); } else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const ev = (p, f, ...a) => p.evaluate(f, ...a);

const etat = { version: null };   // null = sw.js tel quel ; sinon version imposée (simule un déploiement)
const relais = http.createServer((req, res) => {
  const entetes = { ...req.headers }; delete entetes['if-none-match']; delete entetes['if-modified-since'];   // pas de 304 : le relais doit toujours voir le corps
  const o = http.request({ host: '127.0.0.1', port: 8000, path: req.url, method: req.method, headers: entetes }, r => {
    if (req.url.split('?')[0] === '/sw.js' && etat.version) {
      const morceaux = []; r.on('data', c => morceaux.push(c)); r.on('end', () => { const t = Buffer.concat(morceaux).toString('utf8').replace(/const VERSION = '[^']+'/, "const VERSION = '" + etat.version + "'"); res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(t); });
    } else { res.writeHead(r.statusCode, r.headers); r.pipe(res); }
  });
  o.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(o);
});
await new Promise(ok2 => relais.listen(8131, '127.0.0.1', ok2));

// 1) manifeste et icônes
const m = await fetch('http://127.0.0.1:8131/manifest.webmanifest').then(r => r.json());
v('manifeste : nom, affichage autonome, couleurs, démarrage', m.name === 'Raylé' && m.display === 'standalone' && m.start_url && m.background_color === '#05080c' && m.lang === 'fr');
const tailles = {}; for (const i of m.icons) { const r = await fetch('http://127.0.0.1:8131/' + i.src); tailles[i.src] = r.status; }
v('manifeste : icônes 192 et 512 (dont une « maskable ») présentes', Object.values(tailles).every(s => s === 200) && m.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable') && m.icons.some(i => i.sizes === '192x192'), JSON.stringify(tailles));

// 2) le service worker s'installe, met en cache la coquille, et le site marche hors ligne
const o = await ouvrirMobile('telephone', { storage: { rayle_m_sw: '1' }, attente: 4000 }), p = o.page;
if (process.env.DEBUG_PWA) { o.cdp.on('ServiceWorker.workerErrorReported', e => console.log('SWERR', JSON.stringify(e.errorMessage).slice(0, 300))); o.cdp.on('ServiceWorker.workerVersionUpdated', e => console.log('SWV', e.versions.map(x => x.versionId + ':' + x.runningStatus + ':' + x.status).join(' '))); await o.cdp.send('ServiceWorker.enable'); }
v('la page déclare le manifeste (téléphone seulement)', await ev(p, () => !!document.querySelector('link[rel="manifest"]')));
await attendre(1500);
const sw = await ev(p, async () => { const r = await navigator.serviceWorker.getRegistration(); return { enregistre: !!r, actif: !!(r && r.active), attend: !!(r && r.waiting), version: window.RAYLE_VERSION }; });
v('service worker enregistré et actif', sw.enregistre && sw.actif, JSON.stringify(sw));
const caches1 = await ev(p, () => caches.keys());
v('cache de la coquille versionné (rayle-shell-<version>)', caches1.includes('rayle-shell-' + sw.version), caches1.join());
await p.reload({ waitUntil: 'load' }); await attendre(3500);
await ev(p, () => MobileCoque.aller('actus')); await attendre(2500);
const nbCartes = await ev(p, () => document.querySelectorAll('#m-actus .m-actu').length);
v('(préparation) le fil d’actualités est affiché et gardé', nbCartes >= 10, String(nbCartes));
await p.setOfflineMode(true);
await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await attendre(3500);
v('HORS LIGNE : l’application s’ouvre quand même (coquille en cache)', await ev(p, () => !!document.getElementById('m-app')));
await ev(p, () => MobileCoque.aller('actus')); await attendre(1200);
v('HORS LIGNE : les dernières actualités sont lisibles, avec leur âge', (await ev(p, () => document.querySelectorAll('#m-actus .m-actu').length)) >= 10);
// (le voyant « hors ligne » suit navigator.onLine ; l’émulation d’un rechargement hors ligne le laisse à « vrai » : il est vérifié dans v8-agent-test.mjs sur une page vivante)
await p.setOfflineMode(false); await attendre(500);

// 3) mise à jour : un « déploiement » change la version de sw.js → bannière → un toucher recharge sur la nouvelle version
await p.reload({ waitUntil: 'load' }); await attendre(3000);
v('avant la mise à jour : pas de bannière', await ev(p, () => document.querySelector('.m-maj').hidden));
etat.version = '2026.10.29.9-essai';
await ev(p, () => MobileMaj.verifier()); await attendre(4000);
v('nouvelle version détectée : la bannière « Nouvelle version disponible » apparaît', await ev(p, () => { const b = document.querySelector('.m-maj'); return !b.hidden && /Nouvelle version disponible/.test(b.innerText) && !!b.querySelector('button'); }), await ev(p, () => document.querySelector('.m-maj').innerText));
v('pas de rechargement surprise : la page est toujours là, l’ancienne version attend', await ev(p, async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r.waiting; }));
await p.screenshot({ path: 'docs/captures-v8/pwa-banniere-telephone.png' });
if (process.env.DEBUG_PWA) console.log('AVANT', JSON.stringify(await ev(p, async () => { const r = await navigator.serviceWorker.getRegistration(); const t = r.waiting ? await (await fetch('sw.js', { cache: 'no-store' })).text() : ''; const vw = await new Promise(ok => { navigator.serviceWorker.addEventListener('message', e => ok(e.data && e.data.version)); r.waiting.postMessage({ type: 'VERSION' }); setTimeout(() => ok('pas de réponse'), 1500); }); return { waiting: r.waiting && r.waiting.state, activeUrl: r.active && r.active.scriptURL, versionServie: (/VERSION = '([^']+)'/.exec(t) || [])[1], versionAttente: vw, caches: await caches.keys() }; })));
if (process.env.DEBUG_PWA) { await o.cdp.send('ServiceWorker.skipWaiting', { scopeURL: 'http://127.0.0.1:8131/' }).catch(e => console.log('CDPERR', e.message)); await attendre(1500); console.log('APRES-CDP', JSON.stringify(await ev(p, async () => { const r = await navigator.serviceWorker.getRegistration(); return { waiting: !!r.waiting, caches: await caches.keys() }; }))); }
if (process.env.DEBUG_PWA) console.log('MANUEL', JSON.stringify(await ev(p, async () => { const r = await navigator.serviceWorker.getRegistration(); const w = r.waiting; const log = []; if (w) { w.addEventListener('statechange', () => log.push('w:' + w.state)); } navigator.serviceWorker.addEventListener('controllerchange', () => log.push('controllerchange')); w && w.postMessage({ type: 'SKIP_WAITING' }); await new Promise(ok => setTimeout(ok, 2500)); return { log, waitingApres: !!r.waiting, active: r.active && r.active.state, wstate: w && w.state }; })));
await ev(p, () => document.querySelector('.m-maj button').click()); await attendre(5000);
if (process.env.DEBUG_PWA) console.log('DEBUG', JSON.stringify(await ev(p, async () => { const r = await navigator.serviceWorker.getRegistration(); return { actif: r.active && r.active.state, attend: !!r.waiting, url: location.href, ctl: !!navigator.serviceWorker.controller, caches: await caches.keys() }; })));
const caches2 = await ev(p, () => caches.keys());
v('après « Actualiser » : la page a rechargé sur la nouvelle version (cache neuf, ancien supprimé)', caches2.includes('rayle-shell-2026.10.29.9-essai') && !caches2.includes('rayle-shell-' + sw.version), caches2.join());
v('…et la bannière a disparu', await ev(p, () => document.querySelector('.m-maj').hidden));
// 4) la caméra du téléphone n'est jamais interceptée
const cam = await ev(p, async () => { const r = await fetch('camera/index.html', { cache: 'no-store' }); return r.status; });
v('la page caméra du téléphone reste servie directement (jamais interceptée)', cam === 200);
await o.fermer();

// 5) sur PC : aucun service worker, aucun manifeste
const oPC = await ouvrirMobile('pc', { storage: { rayle_m_sw: '1' }, attente: 3500 });
const pc = await oPC.page.evaluate(async () => ({ regs: (await navigator.serviceWorker.getRegistrations()).length, manifeste: !!document.querySelector('link[rel="manifest"]'), mobile: !!window.MobileCoque }));
v('PC : aucun service worker, aucun manifeste, aucune coque mobile', pc.regs === 0 && !pc.manifeste && !pc.mobile, JSON.stringify(pc));
await oPC.fermer();
relais.close();
console.log(`\nApplication installable : ${ok} réussis, ${ko} échec(s).`); process.exit(ko ? 1 : 0);
