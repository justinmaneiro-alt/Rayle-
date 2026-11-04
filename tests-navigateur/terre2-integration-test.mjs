/* Terre 2.0 dans la VRAIE application (index.html, PC) : « va à Paris » ouvre la galaxie puis la Terre 2.0 ; « retour à la Terre classique » ; repli.
   Téléphone (412 px) : la Terre 2.0 n'est jamais chargée. Prérequis : node serveur.mjs 8011. Usage : node --import ./tests-navigateur/theme-jarvis-hook.mjs tests-navigateur/terre2-integration-test.mjs */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json'));
const puppeteer = require('puppeteer-core');
const PORT = process.argv[2] || '8011', SORTIE = path.resolve('captures-terre/terre2'); fs.mkdirSync(SORTIE, { recursive: true });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const echecs = [], erreurs = []; let nOk = 0;
const v = (c, m) => { if (c) nOk++; else { echecs.push(m); console.log('ÉCHEC', m); } };
const pause = ms => new Promise(r => setTimeout(r, ms));
// PC
let p = await nav.newPage();
p.on('pageerror', e => erreurs.push('pc : ' + e.message));
await p.setViewport({ width: 1600, height: 900 });
await p.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_theme', 'jarvis'); localStorage.removeItem('rayle_terre_vue'); sessionStorage.clear(); } catch (e) { /* */ } });
await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
await p.waitForFunction(() => window.RayleBus && window.RayleBus.demander, { timeout: 60000 });
await pause(3000);
const rep = await p.evaluate(async () => { const V = await import('/terre-v2/voix.js'); return V.traiter('va à Paris'); });
v(/Paris/.test(rep), 'PC : « va à Paris » → ' + rep);
const e = await p.evaluate(() => window.Terre2 && window.Terre2.etat());
v(e && e.actif && e.globe, 'PC : Terre 2.0 ouverte depuis la galaxie');
await pause(7000); await p.screenshot({ path: path.join(SORTIE, 'integration-paris.png') });
const r2 = await p.evaluate(async () => { const V = await import('/terre-v2/voix.js'); return V.traiter('retour à la Terre classique'); });
await pause(6000);
const cl = await p.evaluate(() => ({ t2: window.Terre2.etat().actif, classique: !!(window.Terre && window.Terre.etat && window.Terre.etat().actif) }));
v(/classique/.test(r2) && !cl.t2 && cl.classique, 'PC : retour à la Terre classique ' + JSON.stringify(cl));
await p.screenshot({ path: path.join(SORTIE, 'integration-classique.png') });
await p.close();
// téléphone : jamais de Terre 2.0
p = await nav.newPage();
const scripts = [];
p.on('request', r => { if (/terre-v2|cesium/i.test(r.url())) scripts.push(r.url()); });
await p.setViewport({ width: 412, height: 900, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
await pause(6000);
const mob = await p.evaluate(async () => ({ mobile: document.documentElement.classList.contains('appareil-mobile'), t2: !!window.Terre2 }));
v(mob.mobile && !mob.t2 && !scripts.length, 'téléphone : Terre 2.0 jamais chargée ' + JSON.stringify(mob) + ' ' + scripts.join(' '));
await nav.close();
v(!erreurs.length, 'erreurs de page : ' + erreurs.slice(0, 4).join(' | '));
console.log(`Terre 2.0 intégration : ${nOk} ok, ${echecs.length} échec(s)`); process.exit(echecs.length ? 1 : 0);
