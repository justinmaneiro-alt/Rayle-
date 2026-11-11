/* Fluidité du trading actif : temps entre deux images (requestAnimationFrame) au repos puis pendant un défilement du graphique, vraies données, 1600 et 390 px. Seuil : 95e centile sous 50 ms au repos. */
import { createRequire } from 'node:module'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
for (const [l, h, mob] of [[1600, 900, false], [390, 844, true]]) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob });
  await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/^rayle_(or|invest)_/.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__or && window.__or.strategie && window.__or.strategie.etat().B && window.__or.graph.etat().bougies.length > 20, { timeout: 60000 }).catch(() => {}); await w(4000);
  const mesure = async (action) => p.evaluate(async act => { const D = []; let t = performance.now(), fin = t + 3500; await new Promise(res => { const f = n => { D.push(n - t); t = n; if (n < fin) { if (act && Math.random() < 0.2) { const c = window.__or.graph.chart(); try { const r = c.timeScale().getVisibleLogicalRange(); c.timeScale().setVisibleLogicalRange({ from: r.from + 3, to: r.to + 3 }); } catch (e) { /* */ } } requestAnimationFrame(f); } else res(); }; requestAnimationFrame(f); }); D.shift(); D.sort((a, b) => a - b); return { n: D.length, moy: D.reduce((s, x) => s + x, 0) / D.length, p95: D[Math.floor(0.95 * D.length)], max: D[D.length - 1] }; }, action);
  const r = await mesure(false), s = await mesure(true), f = x => x.toFixed(1) + ' ms';
  v(r.p95 < 50, `${l}px : au repos, ${r.n} images, moyenne ${f(r.moy)}, 95e centile ${f(r.p95)}, pire ${f(r.max)}`);
  v(s.p95 < 100, `${l}px : défilement du graphique, ${s.n} images, moyenne ${f(s.moy)}, 95e centile ${f(s.p95)}, pire ${f(s.max)}`);
  await p.close();
}
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
