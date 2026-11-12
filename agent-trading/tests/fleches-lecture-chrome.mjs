/* Test Chrome des flèches de lecture : PC 1600, tablette 1024, téléphone 390. Série H1 fabriquée (1 440 bougies, tendance + oscillations).
   (i) jamais plus d'1 flèche par fenêtre de 12 bougies ; (ii) au plus 12 flèches visibles sur 600 bougies ; (iii) aucune flèche sans MA200 ni gros niveau ;
   la case « Toutes les flèches (debug) » existe, désactivée par défaut ; le graphique porte exactement les flèches visibles.
   Prérequis : node serveur.mjs 8125.   BASE=http://127.0.0.1:8125 node agent-trading/tests/fleches-lecture-chrome.mjs */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8125'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('outils-restructuration/captures', { recursive: true });
const H = 3600e3, fin = Math.floor(Date.now() / H) * H - H, N = 1440; let s = 29; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
let c = 4000; const cl = []; for (let i = 0; i < N; i++) { c += (rnd() - 0.5) * 11 + Math.sin(i / 55) * 4.5 + (i > 700 ? -0.6 : 0.5); cl.push(c); }
const serie = cl.map((x, i) => { const o = i ? cl[i - 1] : x; return { t: fin - (N - 1 - i) * H, o, h: Math.max(o, x) + rnd() * 4, l: Math.min(o, x) - rnd() * 4, c: x, v: 80 + rnd() * 90 }; });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
for (const [l, h, mob] of [[1600, 900, false], [1024, 768, true], [390, 844, true]]) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); const err = []; p.on('pageerror', e => err.push(e.message));
  await p.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const k of Object.keys(localStorage)) if (/^rayle_(or|invest)_/.test(k)) localStorage.removeItem(k); } } catch (e) {} });
  await p.goto(BASE + '/agent-trading/front/or.html?pro=1#trading', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.graph && window.__or.flechesT && window.__or.graph.etat().bougies.length > 20, { timeout: 45000 }).catch(() => {});
  await p.evaluate(b => { window.__or.structure.injecterH1(b); window.__or.structure.maj(true); }, serie); await w(800);
  await p.evaluate(() => { window.__or.flechesT.maj(); }); await w(1500);
  const E = await p.evaluate(() => { const T = window.__or, L = T.flechesT.liste().filter(f => !f.masquee), V = T.flechesT.visibles(); return { n: L.length, vis: V.map(f => ({ t: f.tCloture, type: f.type, source: f.source, zone: f.zone || null })), etat: T.flechesT.etat(), posees: T.graph.flechesTerminalEtat(), debug: (() => { const i = [...document.querySelectorAll('.tor-couches input, [data-couche]')].find(x => /debug|flechesTout/i.test((x.parentElement && x.parentElement.textContent) + (x.dataset.couche || '') + (x.dataset.c || ''))); return i ? { present: true, coche: !!i.checked } : { present: false }; })(), couches: window.__or.graph.couches() }; });
  const t = E.vis.map(x => x.t).sort((a, b) => a - b); let grappes = 0; for (let k = 1; k < t.length; k++) if (t[k] - t[k - 1] < 12 * H) grappes++;
  let max = 0; for (let k = 0; k < t.length; k++) max = Math.max(max, t.filter(x => x >= t[k] && x < t[k] + 600 * H).length);
  v(E.n >= 0 && E.etat.raison == null, `${l}px : flèches de lecture calculées (${E.n} au registre, ${E.vis.length} visibles sur 30 jours)`);
  v(grappes === 0, `${l}px : (i) aucune grappe (écart minimal 12 bougies) : ${grappes}`);
  v(max <= 12, `${l}px : (ii) au plus 12 flèches visibles sur 600 bougies : ${max}`);
  v(E.vis.every(x => (x.source === 'MA200' && /^ma_/.test(x.type)) || (/^niv_/.test(x.type) && x.zone)), `${l}px : (iii) chaque flèche vient de la MA200 ou d'un gros niveau`);
  v(E.posees.posees === E.vis.length, `${l}px : le graphique porte exactement les flèches visibles (${E.posees.posees} / ${E.vis.length})`);
  v(E.couches.fleches !== false && E.couches.flechesTout === false, `${l}px : couche « flèches de lecture » active, « toutes les flèches (debug) » désactivée par défaut (${JSON.stringify({ f: E.couches.fleches, d: E.couches.flechesTout })})`);
  v(err.length === 0, `${l}px : aucune erreur de script ${err.join(' | ').slice(0, 160)}`);
  await p.screenshot({ path: `outils-restructuration/captures/fleches-lecture-${l}.png` }); await p.close();
}
await nav.close(); console.log(ko ? 'ÉCHECS : ' + ko : 'tout passe'); process.exit(ko ? 1 : 0);
