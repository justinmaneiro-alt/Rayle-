/* Aide des tests Chrome de l'ICT visuel : bougies de l'or simulées (relais Kraken intercepté, série qui finit au prix réel) ; chemin RÉEL du terminal : or.html avec integration.js, SANS ?pro=1 (hj=1 seulement, car un navigateur piloté désactive integration sinon). */
import { createRequire } from 'node:module'; import path from 'node:path';
export const require = createRequire(path.resolve('tests-navigateur/package.json')); export const puppeteer = require('puppeteer-core');
export const BASE = process.env.BASE || 'http://127.0.0.1:8011'; export const w = ms => new Promise(r => setTimeout(r, ms));
export const VUES = { pc1600: [1600, 900, false], tab1024: [1024, 768, true], tel390: [390, 844, true] };
export let PRIX = 3500, SOURCE = 'bougies simulées (le relais Kraken n’a pas répondu)';
export async function initPrix() { try { const r = await fetch('https://rayle-or-relais.justinmaneiro.workers.dev/kraken/ticker', { signal: AbortSignal.timeout(8000) }); const d = await r.json(); if (d && d.ticker && +d.ticker.last > 0) { PRIX = +d.ticker.last; SOURCE = 'bougies simulées, série calée sur le prix réel de l’or (' + PRIX + ')'; } } catch (e) { /* repli */ } return PRIX; }
export const PAS = { '15m': 15 * 60e3, '1h': 3600e3, '4h': 4 * 3600e3, '1d': 86400e3 };
export function serie(pas, de, a) {
  const n0 = Math.floor(Date.now() / pas) * pas, debut = n0 - 1800 * pas, out = []; let s = 7 + pas / 1000, x = 3500; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, sig = 1.4 * Math.sqrt(pas / 3600e3);
  for (let i = 0, t = debut; t <= n0; i++, t += pas) { const imp = i % 37 === 0 ? (rnd() < 0.5 ? -1 : 1) * 3.2 * sig : 0, o = x; x += (rnd() - 0.5) * 2.2 * sig + imp + Math.sin(i / 23) * 0.5 * sig; out.push({ time: t, open: o, high: Math.max(o, x) + rnd() * 0.5 * sig, low: Math.min(o, x) - rnd() * 0.5 * sig, close: x, volume: 100 + rnd() * 50 }); }
  const dec = PRIX - out[out.length - 1].close; for (const b of out) { b.open += dec; b.high += dec; b.low += dec; b.close += dec; }
  return out.filter(b => b.time >= de && b.time < a);
}
export async function lancer() { return puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] }); }
export async function ouvrir(nav, [l, h, mob], { actif = null, effacer = true, query = '' } = {}) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); const err = []; p.on('pageerror', e => err.push(e.message)); p.__err = err;
  if (process.env.REEL !== '1') {   // REEL=1 : vraies bougies de l'or (relais Kraken et Binance réels), pour les captures du rapport
  await p.setRequestInterception(true);
  p.on('request', r => { const u = r.url();
    if (u.includes('/kraken/bougies')) { const q = new URL(u).searchParams, pas = PAS[q.get('res')]; if (!pas) return r.continue(); const de = (+q.get('from') || 0) * 1000, a = q.get('to') ? +q.get('to') * 1000 : Infinity;
      return r.respond({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ candles: serie(pas, de, a).map(b => ({ ...b, time: String(b.time) })) }) }); }
    if (/api\.binance\.com|fapi\.binance\.com|kraken\/ticker|kraken\/instrument/.test(u)) return r.abort('failed');
    return r.continue(); });
  }
  if (effacer) await p.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem('ict-test-init')) { localStorage.clear(); sessionStorage.setItem('ict-test-init', '1'); } } catch (e) { /* */ } });
  await p.goto(BASE + '/agent-trading/front/or.html?hj=1' + (actif ? '&actif=' + actif : '') + query, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.ict && window.__or.moteur && window.__or.moteur.serie && window.__or.moteur.serie().length > 100 && document.querySelector('.tp-b-ict'), { timeout: 60000 }); await w(2500); return p;
}
