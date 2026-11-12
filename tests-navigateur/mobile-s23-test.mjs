/* Téléphone = même Raylé que le PC : émulation Galaxy S23 Ultra (412×915, facteur 3,5, tactile), accueil + chaque fenêtre du carrousel, comparées au PC (1600×900).
   Prérequis : node serveur.mjs 8126.   BASE=http://127.0.0.1:8126 node tests-navigateur/mobile-s23-test.mjs
   Captures : outils-restructuration/captures-mobile/ (mobile-*.png et pc-*.png) */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')), puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8126'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
const SORTIE = 'outils-restructuration/captures-mobile'; fs.mkdirSync(SORTIE, { recursive: true });
const UA_S23 = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const FEN = ['terminal', 'anatomie', 'terre', 'dev3d'];
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--enable-unsafe-swiftshader'] });
async function ouvrir(mobile) {
  const p = await nav.newPage(), err = [], reqs = []; p.on('pageerror', e => err.push(e.message)); p.on('request', r => reqs.push(r.url()));
  if (mobile) { await p.setUserAgent(UA_S23); await p.setViewport({ width: 412, height: 915, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true }); } else await p.setViewport({ width: 1600, height: 900 });
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_m_sw', '0'); localStorage.setItem('rayle_boot', '0'); } catch (e) { /* */ } });
  await p.goto(BASE + '/?boot=0&sw=0', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Application && document.querySelector('#app-car .ac-p'), { timeout: 40000 }).catch(() => {}); await w(2500);
  return { p, err, reqs };
}
const M = await ouvrir(true), P = await ouvrir(false);
const info = await M.p.evaluate(() => ({ mode: window.RayleAppareil && RayleAppareil.mode(), classe: document.documentElement.className, panneaux: [...document.querySelectorAll('#app-car .ac-p')].map(x => x.dataset.id), largeur: innerWidth, debord: document.documentElement.scrollWidth - innerWidth, dpr: devicePixelRatio, meteo: !!document.querySelector('.ar-meteo'), actus: !!document.querySelector('.ar-actus'), theme: document.body.className }));
v(info.mode === 'telephone', 'le Galaxy S23 Ultra est détecté comme téléphone : ' + info.mode);
const infoPC = await P.p.evaluate(() => ({ panneaux: [...document.querySelectorAll('#app-car .ac-p')].map(x => x.dataset.id), meteo: !!document.querySelector('.ar-meteo'), actus: !!document.querySelector('.ar-actus') }));
v(JSON.stringify(info.panneaux) === JSON.stringify(infoPC.panneaux) && info.panneaux.length === 5, 'même carrousel que le PC : ' + info.panneaux.join(', '));
v(info.dpr === 3.5, 'facteur d’échelle réel de l’appareil émulé : ' + info.dpr);
v(info.debord <= 1, 'aucun débordement horizontal à 412 px : ' + info.debord);
v(info.meteo && info.actus, 'accueil téléphone : météo et « À la une » présentes');
const geo = await M.p.evaluate(() => { const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, vis: getComputedStyle(e).display !== 'none' && b.width > 0 }; }; return { meteo: r('.ar-meteo'), actus: r('.ar-actus'), car: r('#app-car .ac-p[data-id=terminal]'), coeur: r('#reactor') }; });
v(geo.meteo && geo.meteo.vis && geo.actus && geo.actus.vis, 'météo et actualités visibles sur l’écran ' + JSON.stringify({ m: geo.meteo && [Math.round(geo.meteo.y), Math.round(geo.meteo.h)], a: geo.actus && [Math.round(geo.actus.y), Math.round(geo.actus.h)] }));
await M.p.screenshot({ path: `${SORTIE}/mobile-accueil.png` }); await P.p.screenshot({ path: `${SORTIE}/pc-accueil.png` });
const anciens = M.reqs.filter(u => /core\/mobile\/|mobile-coque|mobile\.css/.test(u));
v(anciens.length === 0, 'aucune ressource de l’ancienne coque mobile n’est demandée : ' + anciens.length);
for (const id of FEN) {
  for (const [Q, nom] of [[M, 'mobile'], [P, 'pc']]) {
    await Q.p.evaluate(i => window.Application.ouvrir(i), id); await w(id === 'terminal' ? 5000 : 6000);
    const e = await Q.p.evaluate(() => ({ ouvert: window.Application.etat().ouvert, debord: document.documentElement.scrollWidth - innerWidth, corps: document.body.className }));
    if (nom === 'mobile') { v(e.ouvert === id, `${id} : fenêtre ouverte sur le téléphone`); v(e.debord <= 1, `${id} : pas de débordement horizontal (${e.debord})`); }
    await Q.p.screenshot({ path: `${SORTIE}/${nom}-${id}.png` });
    await Q.p.evaluate(() => window.Application.fermer()); await w(900);
  }
}
v(M.err.length === 0, 'aucune erreur de script sur le téléphone ' + M.err.join(' | ').slice(0, 200));
await nav.close(); console.log(ko ? 'ÉCHECS : ' + ko : 'tout passe'); process.exit(ko ? 1 : 0);
