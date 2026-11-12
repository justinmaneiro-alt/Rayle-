/* Rayle sur téléphone (Galaxy S23 Ultra émulé 412×915) : actus (images qui restent), Atlas d'anatomie (hors ligne), Terre (aperçu puis 3D), Terminal propre, icône / manifeste / service worker.
   Prérequis : node serveur.mjs 8125.   BASE=http://127.0.0.1:8125 node tests-navigateur/mobile-nuit-test.mjs   (captures : outils-restructuration/captures-mobile/test-*.png) */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8125'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
const CAP = 'outils-restructuration/captures-mobile'; fs.mkdirSync(CAP, { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAYAAAD+Bq+uAAAAFklEQVR42mP8z8Dwn4EIwDiqEF8oBAAeIQT/oO3a3AAAAABJRU5ErkJggg==', 'base64');
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = nav.defaultBrowserContext(); const erreurs = [];
const p = await nav.newPage(); await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36');
await p.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
p.on('pageerror', e => erreurs.push('PAGEERR ' + e.message.slice(0, 140)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text().slice(0, 140)); });
let imagesCoupees = false, imagesPrises = 0;
await p.setRequestInterception(true);
p.on('request', r => { const u = r.url(); if (r.resourceType() === 'image' && !u.startsWith(BASE) && !u.startsWith('data:')) { imagesPrises++; if (imagesCoupees) r.respond({ status: 404, body: 'x' }); else r.respond({ status: 200, contentType: 'image/png', body: PNG }); } else r.continue(); });
await p.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_m_sw', '0'); } catch (e) {} });
await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' }); await w(6000);

// ── 1. ACTUS : les images restent après 3 rafraîchissements, jamais un cadre vide
const etatActus = () => p.evaluate(() => [...document.querySelectorAll('.ar-img')].map(c => ({ vide: !c.querySelector('img,.ar-ph,.ia-fig'), img: !!c.querySelector('img'), ph: !!c.querySelector('.ar-ph'), src: (c.querySelector('img') || {}).src || null })));
await w(5000); let E0 = await etatActus();
v(E0.length >= 1, `actus : ${E0.length} carte(s) affichée(s) sur l’accueil`);
v(E0.every(x => !x.vide), 'actus : aucune vignette vide au départ (image ou visuel de remplacement)');
await p.screenshot({ path: `${CAP}/test-accueil-actus-1.png` });
let vides = 0; const samples = [];
for (let k = 0; k < 3; k++) { await p.evaluate(() => window.AccueilRayle.recharger()); for (let t = 0; t < 12; t++) { await w(250); const E = await etatActus(); samples.push(E); if (E.some(x => x.vide)) vides++; } }
v(vides === 0, `actus : après 3 rafraîchissements, jamais de vignette vide (${samples.length} relevés)`);
const E1 = await etatActus();
v(E0.length === E1.length && E1.every(x => x.img || x.ph), 'actus : mêmes cartes, chacune avec une image ou son visuel de remplacement');
// échec de chargement des images : le contenu déjà affiché reste
imagesCoupees = true; await p.evaluate(() => window.AccueilRayle.recharger()); await w(6000); const E2 = await etatActus();
v(E2.every(x => !x.vide), 'actus : images en panne (404) → aucune carte vide');
v(E2.filter(x => x.img).length >= E1.filter(x => x.img).length, 'actus : la dernière image valide reste affichée malgré la panne');
imagesCoupees = false; await p.screenshot({ path: `${CAP}/test-accueil-actus-2.png` });

// ── 2. ANATOMIE : Atlas 2D, hors ligne
await p.evaluate(() => { window.Application.ouvrir('anatomie'); }); await w(4000);
const A = await p.evaluate(() => ({ atlas: !!document.getElementById('atlas-anatomie'), regions: document.querySelectorAll('#atlas-anatomie .at-regions button').length, zones: document.querySelectorAll('#atlas-anatomie .at-z').length, charge: !!document.querySelector('#atlas-anatomie .at-charge'), etat: window.AtlasAnatomie && window.AtlasAnatomie.etat() }));
v(A.atlas && A.regions === 6 && A.zones === 6 && !A.charge, `anatomie : Atlas affiché (6 régions, 6 zones touchables sur le schéma, fiches : ${A.etat && A.etat.fiches})`);
await p.screenshot({ path: `${CAP}/test-atlas-regions.png` });
await p.setOfflineMode(true);
await p.evaluate(() => document.querySelector('#atlas-anatomie .at-z[data-r="minf"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await w(300);
let B = await p.evaluate(() => ({ titre: (document.querySelector('#atlas-anatomie .at-ret b') || {}).textContent, n: document.querySelectorAll('#atlas-anatomie .at-liste li').length }));
v(/inférieur/i.test(B.titre || '') && B.n > 5, `anatomie : toucher le membre inférieur ouvre sa liste (${B.n} os, hors ligne)`);
await p.evaluate(() => document.querySelector('#atlas-anatomie [data-g="muscle"]').click()); await w(200);
await p.evaluate(() => document.querySelector('#atlas-anatomie .at-liste button').click()); await w(300);
const F = await p.evaluate(() => ({ h: (document.querySelector('#atlas-anatomie .at-fiche h3') || {}).textContent, dt: [...document.querySelectorAll('#atlas-anatomie .at-fiche dt')].map(x => x.textContent), avert: /à vérifier/i.test((document.querySelector('#atlas-anatomie .at-fiche footer') || {}).textContent || '') }));
v(F.h && F.dt.includes('Innervation') && F.dt.includes('Action') && F.avert, `anatomie : fiche de muscle (${F.h}) avec innervation, action et mention « à vérifier »`);
await p.screenshot({ path: `${CAP}/test-atlas-fiche.png` });
await p.evaluate(() => document.querySelector('#atlas-anatomie [data-o="recherche"]').click()); await w(200);
await p.type('#atlas-anatomie [data-q]', 'fémur'); await w(400);
const S = await p.evaluate(() => [...document.querySelectorAll('#atlas-anatomie .at-liste b')].map(x => x.textContent));
v(S.some(x => /Fémur/.test(x)), `anatomie : recherche « fémur » (${S.length} résultat(s), hors ligne)`);
await p.evaluate(() => document.querySelector('#atlas-anatomie [data-o="quiz"]').click()); await w(300);
let Qs = await p.evaluate(() => ({ q: (document.querySelector('#atlas-anatomie .at-q') || {}).textContent, c: document.querySelectorAll('#atlas-anatomie .at-choix button').length }));
v(Qs.q && Qs.c === 4, 'anatomie : quiz QCM (question à 4 choix)');
await p.evaluate(() => document.querySelector('#atlas-anatomie .at-choix button').click()); await w(200);
const Rp = await p.evaluate(() => ({ expl: !!document.querySelector('#atlas-anatomie .at-expl'), score: (document.querySelector('#atlas-anatomie .at-score') || {}).textContent, ok: document.querySelectorAll('#atlas-anatomie .at-ok').length }));
v(Rp.expl && Rp.ok === 1 && /\/ 1/.test(Rp.score), `anatomie : réponse corrigée avec explication (${Rp.score})`);
await p.screenshot({ path: `${CAP}/test-atlas-quiz.png` });
await p.evaluate(() => document.querySelector('#atlas-anatomie [data-qm="cartes"]').click()); await w(200);
await p.evaluate(() => document.querySelector('#atlas-anatomie .at-carte').click()); await w(200);
v(await p.evaluate(() => document.querySelector('#atlas-anatomie .at-carte').classList.contains('at-verso')), 'anatomie : carte mémoire retournée');
await p.setOfflineMode(false);
await p.evaluate(() => window.Application.fermer()); await w(1500);
v(await p.evaluate(() => !document.getElementById('atlas-anatomie')), 'anatomie : fermeture propre de l’Atlas');

// ── 3. TERRE : aperçu immédiat, puis 3D sans fenêtre vide
await p.evaluate(() => { window.Application.ouvrir('terre'); }); await w(1200);
const T1 = await p.evaluate(() => { const a = document.getElementById('terre-apercu'); return { a: !!a, globe: !!(a && a.querySelector('.ta-globe')), ok: a ? getComputedStyle(a.querySelector('.ta-globe')).backgroundImage.includes('terre-apercu.jpg') : false }; });
v(T1.a && T1.globe && T1.ok, 'terre : image de la Terre affichée 1,2 s après l’ouverture (aperçu léger)');
await p.screenshot({ path: `${CAP}/test-terre-apercu.png` });
let retiree = false; for (let k = 0; k < 60 && !retiree; k++) { await w(500); retiree = await p.evaluate(() => !document.getElementById('terre-apercu')); }
v(retiree, 'terre : l’aperçu est retiré (fondu) quand la 3D est prête');
v(await p.evaluate(() => window.Terre && window.Terre.etat && window.Terre.etat().entree === true), 'terre : la 3D est entrée');
await p.screenshot({ path: `${CAP}/test-terre-3d.png` });
await p.evaluate(() => window.Application.fermer()); await w(1500);

// ── 4. TERMINAL : graphique seul
await p.evaluate(() => { window.Application.ouvrir('terminal'); }); await w(10000);
const fh = await (await p.$('iframe.tr-or')).contentFrame();
const Tm = await fh.evaluate(() => { const vis = e => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; const blocs = [...document.querySelectorAll('.tor > .tor-bloc')], per = [...document.querySelectorAll('.tor-periodes button')]; return { blocs: blocs.length, blocsVisibles: blocs.filter(vis).length, graphe: vis(document.querySelector('.tor-graph')), h: Math.round(document.querySelector('.tor-graph').getBoundingClientRect().height), periodes: per.map(b => b.textContent.trim() + ':' + Math.round(b.getBoundingClientRect().height)), sel: vis(document.querySelector('[data-ft-mode]')), notif: vis(document.querySelector('[data-ft-notif] summary')), debord: document.documentElement.scrollWidth > innerWidth + 1, tabs: [...document.querySelectorAll('.esp-barre button')].filter(vis).length, carnet: vis(document.querySelector('.tor-carnet')) }; });
v(Tm.blocs > 3 && Tm.blocsVisibles === 0 && !Tm.carnet, `terminal : panneaux de données masqués sur téléphone (${Tm.blocs} blocs, ${Tm.blocsVisibles} visibles)`);
v(Tm.graphe && Tm.h > 500, `terminal : le graphique occupe l’écran (${Tm.h} px de haut)`);
v(Tm.periodes.length === 5 && Tm.periodes.every(x => +x.split(':')[1] >= 44), `terminal : boutons M5 M15 H1 H4 Jour assez grands (${Tm.periodes.join(' ')})`);
v(Tm.sel && Tm.notif, 'terminal : sélecteur « Flèches : Direct / Historique » et menu Notifications visibles');
v(!Tm.debord && Tm.tabs === 0, 'terminal : aucun débordement horizontal, aucun onglet de panneau');
await w(500); await p.screenshot({ path: `${CAP}/test-terminal.png` });
await fh.evaluate(() => { const s = document.querySelector('[data-ft-mode]'); s.value = 'historique'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await w(600);
v(await fh.evaluate(() => !!document.querySelector('[data-ft-bandeau]') && document.querySelector('[data-ft-bandeau]').hidden === false), 'terminal : le mode Historique affiche son bandeau sur téléphone');
await fh.evaluate(() => { const s = document.querySelector('[data-ft-mode]'); s.value = 'direct'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await fh.evaluate(() => { localStorage.setItem('rayle_tm_avance', '1'); document.body.classList.add('tm-avance'); }); await w(400);
v(await fh.evaluate(() => [...document.querySelectorAll('.tor > .tor-bloc')].some(e => getComputedStyle(e).display !== 'none')), 'terminal : « Panneaux avancés » coché → les panneaux reviennent');
await fh.evaluate(() => { localStorage.removeItem('rayle_tm_avance'); document.body.classList.remove('tm-avance'); });
await p.evaluate(() => window.Application.fermer()); await w(1200);

// ── 5. terminal PC inchangé (même page à 1600 px)
const pc = await nav.newPage(); await pc.setViewport({ width: 1600, height: 900 });
await pc.setRequestInterception(true); pc.on('request', r => r.continue());
await pc.goto(BASE + '/agent-trading/front/or.html?pro=1#trading', { waitUntil: 'domcontentloaded' }); await w(9000);
const Pc = await pc.evaluate(() => { const vis = e => !!e && getComputedStyle(e).display !== 'none'; return { blocs: [...document.querySelectorAll('.tor > .tor-bloc')].filter(vis).length, tabs: [...document.querySelectorAll('.esp-barre button')].filter(vis).length, haut: vis(document.querySelector('.tp-haut')) }; });
v(Pc.blocs > 3 && Pc.tabs >= 3 && Pc.haut, `terminal PC inchangé : panneaux (${Pc.blocs}), onglets (${Pc.tabs}) et barre du mode Pro affichés`);
await pc.close();

// ── 6. icône, manifeste, service worker
const man = await (await fetch(BASE + '/manifest.webmanifest')).json(), sw = await (await fetch(BASE + '/sw.js')).text(), idx = await (await fetch(BASE + '/index.html')).text();
const vSw = (sw.match(/const VERSION = '([^']+)'/) || [])[1], vIdx = (idx.match(/RAYLE_VERSION='([^']+)'/) || [])[1];
v(vSw && vSw === vIdx, `service worker à jour : sw.js = index.html = ${vSw}`);
v(man.theme_color === '#ffae3d' && /^#0[0-9a-f]{5}$/i.test(man.background_color), `manifeste : theme_color or (${man.theme_color}), background_color sombre (${man.background_color})`);
const icones = man.icons.filter(i => i.src.startsWith('icones/')), vues = await Promise.all(icones.map(async i => (await fetch(BASE + '/' + i.src)).status));
v(icones.some(i => i.sizes === '192x192') && icones.some(i => i.sizes === '512x512' && i.purpose === 'maskable') && vues.every(s => s === 200), 'manifeste : icônes 192 / 512 / maskable présentes (thème or)');
v(!/rose|pink|#ff[0-9a-f]{2}9/i.test(JSON.stringify(man)) && !/<link[^>]+apple-touch-icon[^>]+(sphere|rose)/i.test(idx), 'aucune ancienne icône rose référencée');
v(erreurs.length === 0, 'aucune erreur console / de script : ' + erreurs.slice(0, 3).join(' | '));
await nav.close(); console.log(ko ? 'ÉCHECS : ' + ko : 'tout passe'); process.exit(ko ? 1 : 0);
