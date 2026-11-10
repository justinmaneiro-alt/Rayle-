/* MESURE DE FLUIDITÉ du terminal de Rayle (vraies données, Chrome) : tâches longues, images par seconde au déplacement du graphique, mémoire, profil CPU.
   Aucune modification de l'affichage : c'est une mesure.  Usage : node serveur.mjs 8125  puis  node agent-trading/tests/terminal-perf.mjs [--profil] [--json fichier]
   Objectif : aucune pause > 100 ms en usage normal, ≥ 50 images/s au défilement du graphique. */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json'));
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8125';
const AVEC_PROFIL = process.argv.includes('--profil');
const iCpu = process.argv.indexOf('--cpu'); const CPU = iCpu > 0 ? Number(process.argv[iCpu + 1]) : 1;   // ralentissement du processeur (6 ≈ tablette milieu de gamme)
const iJson = process.argv.indexOf('--json'); const SORTIE = iJson > 0 ? process.argv[iJson + 1] : null;
const w = ms => new Promise(r => setTimeout(r, ms));

const nav = await puppeteer.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await nav.createBrowserContext();
const p = await ctx.newPage(); await p.setViewport({ width: 1680, height: 950, deviceScaleFactor: 1 });
const cdp0 = await p.createCDPSession(); if (CPU > 1) await cdp0.send('Emulation.setCPUThrottlingRate', { rate: CPU });
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.evaluateOnNewDocument(() => {
  window.__longues = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__longues.push({ d: Math.round(e.duration), t: Math.round(e.startTime) }); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  if (!sessionStorage.getItem('perf')) { sessionStorage.setItem('perf', '1'); localStorage.clear(); }
});
const t0 = Date.now();
await p.goto(BASE + '/agent-trading/front/terminal.html', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__terminal && window.__terminal.graph.etat().n > 100, { timeout: 120000 });
const tCharge = Date.now() - t0;
if (process.argv.includes('--couches')) await p.evaluate(() => { for (const k of ['motifs', 'evenements', 'carnetBougie', 'cvd', 'profilVolume', 'vwap', 'extremes', 'seances', 'rondes', 'chaleur']) window.__terminal.couche(k, true); });
await w(4000);   // laisse finir les chargements de démarrage (carnet, sections)

const cdp = await p.createCDPSession();
if (AVEC_PROFIL) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }

const longuesDepuis = async (avant) => p.evaluate(a => window.__longues.slice(a), avant);
const nLong = () => p.evaluate(() => window.__longues.length);
const res = { cpuRalenti: CPU, chargementMs: tCharge };

async function scenario(nom, fn) {
  const a = await nLong(); await p.evaluate(() => { const id = (window.__fpsId = (window.__fpsId || 0) + 1); window.__fps = { n: 0, t0: performance.now(), pire: 0, dern: performance.now() }; const f = t => { if (window.__fpsId !== id) return; const F = window.__fps; F.n++; F.pire = Math.max(F.pire, t - F.dern); F.dern = t; if (!F.stop) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const t = Date.now(); await fn(); const ms = Date.now() - t;
  const fps = await p.evaluate(() => { const F = window.__fps; F.stop = true; window.__fpsId++; return { images: F.n, duree: performance.now() - F.t0, pireImage: Math.round(F.pire) }; });
  const L = await longuesDepuis(a);
  res[nom] = { ms, fps: Math.round(fps.images / (fps.duree / 1000)), pireImageMs: fps.pireImage, tachesLongues: L.length, pireTacheMs: L.length ? Math.max(...L.map(x => x.d)) : 0, tachesPlus100: L.filter(x => x.d > 100).length };
}

const gr = await p.$('[data-graph]'); const bb = await gr.boundingBox();
const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;

await scenario('repos', async () => { await w(3000); });
await scenario('deplacementGraphique', async () => {   // glisser le graphique de gauche à droite puis retour, comme à la souris
  await p.mouse.move(cx, cy); await p.mouse.down();
  for (let k = 0; k < 120; k++) { await p.mouse.move(cx + Math.sin(k / 6) * 260, cy + (k % 7), { steps: 1 }); await w(16); }
  await p.mouse.up();
});
await scenario('zoomMolette', async () => { await p.mouse.move(cx, cy); for (let k = 0; k < 40; k++) { await p.mouse.wheel({ deltaY: k % 2 ? 120 : -120 }); await w(24); } });
await scenario('changementUnite', async () => { for (const u of ['M15', 'H1', 'H4', 'M5']) { await p.evaluate(x => window.__terminal.choisirUnite(x), u); await w(900); } });
await scenario('changementActif', async () => { for (const a of ['BTC', 'OR', 'SOL', 'OR']) { await p.evaluate(x => window.__terminal.choisirActif(x), a); await w(1400); } });
await scenario('defilementSections', async () => { for (let k = 0; k < 24; k++) { await p.mouse.wheel({ deltaY: 260 }); await w(60); } for (let k = 0; k < 24; k++) { await p.mouse.wheel({ deltaY: -260 }); await w(60); } });
await scenario('carnetEnDirect', async () => { await p.evaluate(() => window.scrollTo(0, 0)); await w(5000); });

res.memoireMo = await p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
res.noeudsDOM = await p.evaluate(() => document.getElementsByTagName('*').length);
res.carnetImagesParSeconde = await p.evaluate(async () => { const c = document.querySelector('.tr-carnet canvas'); if (!c) return null; let n = 0; const o = new MutationObserver(() => {}); const ctx2 = c.getContext('2d'); if (!ctx2) return null; const fill = ctx2.fillRect, clr = ctx2.clearRect; let appels = 0; ctx2.clearRect = function (...a) { appels++; return clr.apply(this, a); }; await new Promise(r => setTimeout(r, 3000)); ctx2.clearRect = clr; return Math.round(appels / 3); });
res.erreurs = erreurs.slice(0, 5);

if (AVEC_PROFIL) {
  const { profile } = await cdp.send('Profiler.stop');
  const noeuds = new Map(profile.nodes.map(n => [n.id, n])); const dt = profile.timeDeltas, ech = profile.samples; const propre = new Map();
  for (let i = 0; i < ech.length; i++) { const n = noeuds.get(ech[i]); const c = n.callFrame; const cle = (c.functionName || '(anonyme)') + ' ' + c.url.split('/').slice(-2).join('/') + ':' + c.lineNumber; propre.set(cle, (propre.get(cle) || 0) + (dt[i] || 0)); }
  res.profilTop = [...propre.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${(v / 1000).toFixed(0)} ms  ${k}`);
}
console.log(JSON.stringify(res, null, 1));
if (SORTIE) fs.writeFileSync(SORTIE, JSON.stringify(res, null, 1));
await nav.close();
process.exit(0);
