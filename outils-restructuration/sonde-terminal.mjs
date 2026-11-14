/* Sonde terminal (cadre or.html) : node outils-restructuration/sonde-terminal.mjs <unite M5|M15|H1|H4|J> [mobile|pc] [prefixe] ; BASE=... ; CPU=4 ralentit le CPU */
import { createRequire } from 'node:module'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8000', unite = process.argv[2] || 'H4', mode = process.argv[3] || 'mobile', pre = process.argv[4] || 'sonde';
const w = ms => new Promise(r => setTimeout(r, ms));
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await nav.newPage();
if (mode === 'mobile') { await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'); await p.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); } else await p.setViewport({ width: 1600, height: 1024 });
if (process.env.CPU) await (await p.createCDPSession()).send('Emulation.setCPUThrottlingRate', { rate: +process.env.CPU });
const log = []; p.on('console', m => { if (m.type() === 'error') log.push(m.text().slice(0, 160)); }); p.on('pageerror', e => log.push('PAGEERR: ' + e.message.slice(0, 160)));
if (process.env.COUCHES) await p.evaluateOnNewDocument(c => { try { localStorage.setItem('rayle_or_couches_v2', c); } catch (e) {} }, process.env.COUCHES);
await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' }); await w(3000);
const t0 = Date.now(); await p.evaluate(() => window.Application.ouvrir('terminal'));
const cadre = () => p.frames().find(f => /or\.html/.test(f.url()));
let tCanvas = null, F = null;
for (let i = 0; i < 240; i++) { F = cadre(); if (F) { const ok = await F.evaluate(() => [...document.querySelectorAll('canvas')].some(c => c.width > 300 && c.height > 150)).catch(() => false); if (ok) { tCanvas = Date.now() - t0; break; } } await w(100); }
console.log('grand canevas du graphique après (ms):', tCanvas);
await w(3000);
const bt = await F.evaluateHandle(u => [...document.querySelectorAll('[data-periode="' + u + '"]')].find(x => x.offsetParent) || null, unite);
if (bt.asElement()) await bt.asElement().click(); else console.log('bouton introuvable');
await w(+(process.env.WAIT || 7000));
await p.screenshot({ path: `outils-restructuration/captures-mobile-autonome/${pre}-terminal-${unite}-${mode}.png` });
if (process.env.STACK) {   // qui dessine ? compte les appels de dessin par appelant
  await F.evaluate(() => { window.__cnt = {}; const o = CanvasRenderingContext2D.prototype; for (const nom of ['fillRect', 'stroke', 'strokeRect', 'fill']) { const orig = o[nom]; o[nom] = function (...a) { const st = (new Error().stack || '').split('\n').slice(2, 4).map(l => l.replace(/.*[\/]/, '').trim()).join(' < '); window.__cnt[nom + ' ' + st] = (window.__cnt[nom + ' ' + st] || 0) + 1; return orig.apply(this, a); }; } });
  await F.evaluate(() => window.dispatchEvent(new Event('resize'))); await w(2500);
  console.log((await F.evaluate(() => Object.entries(window.__cnt).filter(e => !/carnet.js/.test(e[0])).sort((a, b) => b[1] - a[1]).slice(0, 12))).map(x => x[1] + '  ' + x[0]).join('\n'));
}
console.log(JSON.stringify(await F.evaluate(() => ({ canvas: document.querySelectorAll('canvas').length, txt: document.body.innerText.slice(0, 100).replace(/\s+/g, ' ') }))));
console.log(log.slice(0, 10).join('\n') || 'aucune erreur'); await nav.close();
