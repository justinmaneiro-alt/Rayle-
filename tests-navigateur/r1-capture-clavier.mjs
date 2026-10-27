import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
/* R1 : capture du clavier en éventail ou du pavé de la télécommande (page ouverte hors liaison, essai local). Arguments : mode (clavier|pave), largeur, hauteur. */
const [mode = 'clavier', L = '1024', H = '600'] = process.argv.slice(2);
mkdirSync('docs/captures-r1', { recursive: true });
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage(); await p.setViewport({ width: +L, height: +H, hasTouch: true });
const err = []; p.on('pageerror', e => err.push(e.message));
await p.goto('http://127.0.0.1:8000/clavier/index.html', { waitUntil: 'load' }); await new Promise(r => setTimeout(r, 800));
await p.evaluate(m => window.ClavierEventail.mode(m), mode); await new Promise(r => setTimeout(r, 1900));
if (mode === 'clavier') { const c = await p.evaluate(() => { const r = document.querySelector('[data-id="c-e"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); const cdp = await p.createCDPSession(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y, id: 1 }] }); await new Promise(r => setTimeout(r, 120)); await p.screenshot({ path: `docs/captures-r1/clavier-${mode}.png` }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
else { const cdp = await p.createCDPSession(); const pv = await p.evaluate(() => { const r = document.getElementById('pave').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pv.x - 120, y: pv.y, id: 1 }] }); for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pv.x - 120 + i * 18, y: pv.y - i * 6, id: 1 }] }); await new Promise(r => setTimeout(r, 25)); } await p.screenshot({ path: `docs/captures-r1/clavier-${mode}.png` }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
console.log('ok', mode, err);
await b.close();
