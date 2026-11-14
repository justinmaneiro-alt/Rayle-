/* Sonde S23 : node outils-restructuration/sonde-s23.mjs <id> [attente_ms] ; BASE=http://127.0.0.1:8000 */
import { createRequire } from 'node:module'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8000', id = process.argv[2] || 'terre', att = +(process.argv[3] || 8000);
const w = ms => new Promise(r => setTimeout(r, ms));
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await nav.newPage(); await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36');
await p.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const log = []; p.on('console', m => { if (['error', 'warning'].includes(m.type())) log.push(m.type() + ': ' + m.text().slice(0, 200)); }); p.on('pageerror', e => log.push('PAGEERR: ' + e.message.slice(0, 200)));
p.on('requestfailed', r => log.push('FAIL ' + r.url().slice(0, 120))); p.on('response', r => { if (r.status() >= 400) log.push(r.status() + ' ' + r.url().slice(0, 120)); });
await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' }); await w(5000);
if (id !== 'rayle') { await p.evaluate(i => window.Application && window.Application.ouvrir(i), id); await w(att); }
await p.screenshot({ path: `outils-restructuration/captures-mobile-autonome/sonde-${id}.png` });
console.log(await p.evaluate(() => ({ etat: window.Application && window.Application.etat(), terre: window.Terre && window.Terre.etat && Object.keys(window.Terre.etat()).slice(0, 8), txt: document.body.innerText.slice(0, 200).replace(/\s+/g, ' ') })));
console.log(log.slice(0, 20).join('\n') || 'aucune erreur'); await nav.close();
