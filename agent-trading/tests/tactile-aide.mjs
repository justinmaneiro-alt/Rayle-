/* Aide des tests tactiles : Chrome en émulation (Galaxy S23 Ultra ≈ 412×915, tablette ≈ 800×1280 et 1280×800), événements tactiles réels (CDP Input.dispatchTouchEvent), CPU ralenti.
   Tout est testé en ÉMULATION, pas sur un vrai appareil. */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json'));
export const puppeteer = require('puppeteer-core');
export const BASE = process.env.BASE || 'http://127.0.0.1:8011';
export const APPAREILS = { s23: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, tablette: { width: 800, height: 1280, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, paysage: { width: 1280, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };
export const w = ms => new Promise(r => setTimeout(r, ms));
export const serie13 = () => JSON.parse(fs.readFileSync('agent-trading/recherche-or/donnees/kraken-xau-h1-13-nov.json', 'utf8')).map(b => ({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
export const lancer = () => puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
export async function ouvrir(nav, app, { url = '/agent-trading/front/or.html?pro=1#trading', cpu = 1, avant = null } = {}) {
  const p = await nav.newPage(); await p.setViewport(APPAREILS[app]); p.__err = []; p.on('pageerror', e => p.__err.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.__err.push('console: ' + m.text().slice(0, 120)); });
  await p.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const k of Object.keys(localStorage)) if (/^rayle_(or|invest)_/.test(k)) localStorage.removeItem(k); } } catch (e) { /* */ } });
  if (avant) await p.evaluateOnNewDocument(avant);
  await p.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.graph && window.__or.flechesT && window.__or.graph.etat().bougies.length > 20, { timeout: 45000 }).catch(() => {});
  const S = serie13(); await p.evaluate(b => { window.__or.structure.injecterH1(b); window.__or.structure.maj(true); }, S); await w(800); await p.evaluate(() => window.__or.flechesT.maj()); await w(2000);
  p.cdp = await p.createCDPSession(); if (cpu > 1) await p.cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  return p;
}
const touch = (p, type, pts) => p.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, id) => ({ x: q[0], y: q[1], id, radiusX: 8, radiusY: 8, force: 1 })) });
export async function glisser(p, de, vers, { pas = 12, dt = 16 } = {}) { await touch(p, 'touchStart', [de]); for (let k = 1; k <= pas; k++) { await touch(p, 'touchMove', [[de[0] + (vers[0] - de[0]) * k / pas, de[1] + (vers[1] - de[1]) * k / pas]]); await w(dt); } await touch(p, 'touchEnd', []); }
export async function pincer(p, centre, d0, d1, { pas = 12, dt = 16 } = {}) { const pts = d => [[centre[0] - d / 2, centre[1]], [centre[0] + d / 2, centre[1]]]; await touch(p, 'touchStart', pts(d0)); for (let k = 1; k <= pas; k++) { await touch(p, 'touchMove', pts(d0 + (d1 - d0) * k / pas)); await w(dt); } await touch(p, 'touchEnd', []); }
export async function appui(p, pt, { dureeMs = 40 } = {}) { await touch(p, 'touchStart', [pt]); await w(dureeMs); await touch(p, 'touchEnd', []); }
export async function doubleAppui(p, pt) { await appui(p, pt); await w(90); await appui(p, pt); }
export async function appuiLong(p, pt, { ms = 700, bouge = null } = {}) { await touch(p, 'touchStart', [pt]); await w(ms); if (bouge) { for (let k = 1; k <= 6; k++) { await touch(p, 'touchMove', [[pt[0] + bouge[0] * k / 6, pt[1] + bouge[1] * k / 6]]); await w(30); } } return () => touch(p, 'touchEnd', []); }
/* images par seconde et tâches longues pendant une action */
export async function mesurer(p, action) {
  await p.evaluate(() => { window.__m = { f: [], longues: 0, d: 0 }; let t0 = performance.now(); const boucle = t => { window.__m.f.push(t - t0); t0 = t; if (!window.__m.fin) requestAnimationFrame(boucle); }; window.__m.fin = false; requestAnimationFrame(boucle); try { new PerformanceObserver(l => { window.__m.longues += l.getEntries().length; }).observe({ entryTypes: ['longtask'] }); } catch (e) { /* */ } });
  const t = Date.now(); await action(); const dur = Date.now() - t;
  return p.evaluate(dur0 => { window.__m.fin = true; const f = window.__m.f.slice(2), tot = f.reduce((s, x) => s + x, 0); const tri = f.slice().sort((a, b) => a - b); return { images: f.length, fps: f.length / (tot / 1000 || 1), pire: tri[tri.length - 1] || 0, p95: tri[Math.floor(tri.length * 0.95)] || 0, longues: window.__m.longues, dur: dur0 }; }, dur);
}
export const rect = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
export const plage = p => p.evaluate(() => { const c = window.__or.graph.chart(); const r = c.timeScale().getVisibleLogicalRange(); return r ? { de: r.from, a: r.to } : null; });
export function verif() { let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; return { v, fin: () => ko }; }
