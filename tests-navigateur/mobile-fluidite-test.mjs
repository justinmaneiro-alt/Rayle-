/* Fluidité sur profil mobile (S23 Ultra émulé, processeur ralenti ×4) : images/s du carrousel et de l'accueil, indicatif (rendu logiciel de Chrome sans GPU : valeur plancher). BASE=http://127.0.0.1:8126 */
import { createRequire } from 'node:module'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json')), puppeteer = require('puppeteer-core'), BASE = process.env.BASE || 'http://127.0.0.1:8126'; const w = ms => new Promise(r => setTimeout(r, ms));
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] }), p = await nav.newPage();
await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36'); await p.setViewport({ width: 412, height: 915, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true });
await p.goto(BASE + '/?boot=0&sw=0'); await p.waitForFunction(() => window.Application, { timeout: 40000 }); await w(2500);
const c = await p.createCDPSession(); await c.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const fps = async () => p.evaluate(() => new Promise(ok => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else ok(Math.round(n / 3)); })(); }));
const accueil = await fps(); await p.evaluate(() => Application.aller(2)); await w(1500); const balaye = await fps(); await p.evaluate(() => Application.ouvrir('anatomie')); await w(6000); const anat = await fps();
const dpr = await p.evaluate(() => ({ dpr: devicePixelRatio, cv: [...document.querySelectorAll('canvas')].map(x => x.width + 'x' + x.height).slice(0, 6) }));
console.log(JSON.stringify({ accueil_ips: accueil, carrousel_ips: balaye, anatomie_ips: anat, ...dpr })); await nav.close();
