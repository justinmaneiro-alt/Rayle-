/* Sonde Galaxy S23 Ultra émulé (412x915) : node outils-restructuration/_s23.mjs <prefixe> [id...]  ; BASE=http://127.0.0.1:8125 */
import { createRequire } from 'node:module'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8125', pre = process.argv[2] || 'avant', ids = process.argv.slice(3).length ? process.argv.slice(3) : ['rayle', 'terminal', 'anatomie', 'terre'];
const w = ms => new Promise(r => setTimeout(r, ms));
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await nav.newPage(); await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36');
await p.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const log = []; p.on('console', m => { if (['error', 'warning'].includes(m.type())) log.push(m.type() + ': ' + m.text().slice(0, 160)); }); p.on('pageerror', e => log.push('PAGEERR: ' + e.message.slice(0, 160)));
await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' }); await w(6000);
for (const id of ids) {
  if (id !== 'rayle') { await p.evaluate(i => { window.Application && window.Application.ouvrir(i); }, id); await w(id === 'terre' || id === 'anatomie' ? 1500 : 4000); await p.screenshot({ path: `outils-restructuration/captures-mobile/${pre}-${id}-t1.png` }); await w(6000); }
  await p.screenshot({ path: `outils-restructuration/captures-mobile/${pre}-${id}.png` });
  if (id !== 'rayle') { await p.evaluate(() => window.Application && window.Application.fermer()); await w(1500); }
}
console.log(log.slice(0, 15).join('\n') || 'aucune erreur console'); await nav.close();
