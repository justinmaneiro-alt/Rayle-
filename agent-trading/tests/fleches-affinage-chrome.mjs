/* Test Chrome de l'affinage des flèches Direct (v7) : PC 1600, tablette 1024, téléphone 390. Série Kraken réelle (13 nov.).
   Direct (v7) par défaut ; points gris masqués par défaut (case Couches mémorisée) ; « Direct (stable) » = v6 avec ses points gris ; rebond après base ; aucune erreur.
   Prérequis : node serveur.mjs 8011.   BASE=http://127.0.0.1:8011 node agent-trading/tests/fleches-affinage-chrome.mjs */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('outils-restructuration/captures', { recursive: true });
const serie = JSON.parse(fs.readFileSync('agent-trading/recherche-or/donnees/kraken-xau-h1-13-nov.json', 'utf8')).map(b => ({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
const marques = p => p.evaluate(() => window.__or.graph.marquesAffichees().filter(m => /^f[tc]/.test(m.id)).map(m => ({ id: m.id, c: m.color, t: m.text })));
for (const [l, h, mob] of [[1600, 900, false], [1024, 768, true], [390, 844, true]]) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); const err = []; p.on('pageerror', e => err.push(e.message));
  await p.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const k of Object.keys(localStorage)) if (/^rayle_(or|invest)_/.test(k)) localStorage.removeItem(k); } } catch (e) {} });
  await p.goto(BASE + '/agent-trading/front/or.html?pro=1#trading', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.graph && window.__or.flechesT && window.__or.graph.etat().bougies.length > 20, { timeout: 45000 }).catch(() => {});
  await p.evaluate(b => { window.__or.structure.injecterH1(b); window.__or.structure.maj(true); }, serie); await w(800);
  await p.evaluate(() => { window.__or.flechesT.maj(); }); await w(1500);
  await p.evaluate(() => window.__or.flechesT.fixerMode('v7')); await w(2500);   // « Direct (v7 validée) » : la v7 affinée, figée (le Direct par défaut est maintenant la v8)
  const E = await p.evaluate(() => { const T = window.__or, L = T.flechesT.liste(); return { mode: T.flechesT.mode(), n: L.length, versions: [...new Set(L.map(f => f.version))], rebond: L.filter(f => f.type === 'rebond_base').length, gris: L.filter(f => f.contre).length, couche: T.graph.couches().pointsGris, options: [...document.querySelectorAll('[data-ft-mode] option')].map(o => o.value + ':' + o.textContent), caseGris: !!document.querySelector('[data-couche="pointsGris"]') }; });
  v(E.mode === 'v7' && E.versions.length === 1 && E.versions[0] === 'fleches-simples-v7', `${l}px : « Direct (v7 validée) » = v7 (${E.n} flèches, versions ${E.versions})`);
  v(E.options.join() === 'direct:Direct,v7:Direct (v7 validée),stable:Direct (stable),historique:Historique', `${l}px : sélecteur ${E.options.join(' | ')}`);
  v(E.caseGris && E.couche !== true, `${l}px : case « Points gris (raisons de blocage) » présente, désactivée par défaut`);
  v(E.rebond >= 1, `${l}px : ${E.rebond} flèche(s) « rebond après base »`);
  let M = await marques(p); v(M.length > 0 && M.every(m => m.c !== '#7d8791' && m.c !== '#5d6872' || m.t === '×'), `${l}px : aucun point gris affiché par défaut (${M.length} marques)`);
  v(M.some(m => m.t === 'B'), `${l}px : le rebond après base est dessiné (flèche marquée B)`);
  await p.screenshot({ path: `outils-restructuration/captures/fleches-affinage-${l}.png` });
  await p.evaluate(() => { const c = document.querySelector('[data-couche="pointsGris"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }); await w(500);
  M = await marques(p); v(M.some(m => m.c === '#5d6872' || m.c === '#7d8791'), `${l}px : case cochée → les points gris apparaissent (${M.filter(m => m.c === '#5d6872' || m.c === '#7d8791').length})`);
  v(await p.evaluate(() => JSON.parse(localStorage.getItem('rayle_or_couches_v2') || '{}').pointsGris === true), `${l}px : le choix est mémorisé`);
  await p.evaluate(() => window.__or.flechesT.fixerMode('stable')); await w(2500);
  const S = await p.evaluate(() => { const T = window.__or, L = T.flechesT.liste(); return { mode: T.flechesT.mode(), versions: [...new Set(L.map(f => f.version))], n: L.length, rebond: L.filter(f => f.type === 'rebond_base').length }; });
  v(S.mode === 'stable' && S.versions.join() === 'fleches-simples-v6' && S.rebond === 0 && S.n > 0, `${l}px : « Direct (stable) » = v6 inchangée (${S.n} flèches, ${S.versions})`);
  await p.evaluate(() => { const c = document.querySelector('[data-couche="pointsGris"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await w(400);
  M = await marques(p); v(M.some(m => m.c === '#5d6872' || m.c === '#7d8791'), `${l}px : la stable montre toujours ses points gris, même case décochée`);
  await p.evaluate(() => window.__or.flechesT.fixerMode('v7')); await w(2500);
  const D = await p.evaluate(() => ({ mode: window.__or.flechesT.mode(), v: [...new Set(window.__or.flechesT.liste().map(f => f.version))] })); v(D.mode === 'v7' && D.v.join() === 'fleches-simples-v7', `${l}px : retour à Direct (v7 validée) = v7`);
  v(err.length === 0, `${l}px : aucune erreur de script ${err.join(' | ').slice(0, 160)}`); await p.close();
}
await nav.close(); console.log(ko ? 'ÉCHECS : ' + ko : 'tout passe'); process.exit(ko ? 1 : 0);
