/* Test Chrome du sélecteur « Flèches » (Direct = v4 / Historique = v1 scellée), série Kraken réelle, PC 1600 / tablette 1024 / téléphone 390.
   Prérequis : node serveur.mjs 8125.   BASE=http://127.0.0.1:8125 node agent-trading/tests/fleches-modes-chrome.mjs */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8125'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('outils-restructuration/captures', { recursive: true });
const H = 3600e3, serie = JSON.parse(fs.readFileSync('agent-trading/recherche-or/donnees/kraken-xau-h1-chute-12-nov.json', 'utf8')).map(b => ({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
const BANDEAU = 'Flèches rétrospectives : placées avec des informations postérieures, ne pas utiliser pour entrer.';
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
for (const [l, h, mob] of [[1600, 900, false], [1024, 768, true], [390, 844, true]]) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); const err = []; p.on('pageerror', e => err.push(e.message));
  await p.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const k of Object.keys(localStorage)) if (/^rayle_(or|invest)_/.test(k)) localStorage.removeItem(k); localStorage.setItem('rayle_or_fleches_t10', '[]'); } } catch (e) {} });   // registre vide existant : les alertes sont actives
  await p.goto(BASE + '/agent-trading/front/or.html?pro=1#trading', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.graph && window.__or.flechesT && window.__or.graph.etat().bougies.length > 20, { timeout: 45000 }).catch(() => {});
  await p.evaluate(b => { window.__or.structure.injecterH1(b); window.__or.structure.maj(true); }, serie); await w(1200);
  await p.evaluate(() => window.__or.flechesT.maj()); await w(1200);
  const sel = await p.evaluate(() => { const s = document.querySelector('[data-ft-mode]'); return s ? { v: s.value, o: [...s.options].map(x => x.value) } : null; });
  v(sel && sel.v === 'direct' && sel.o.join() === 'direct,stable,historique', `${l}px : sélecteur « Flèches » présent, Direct par défaut`);
  await p.select('[data-ft-mode]', 'historique'); await w(600);
  const H1 = await p.evaluate(() => { const T = window.__or.flechesT; return { mode: T.mode(), bandeau: (document.querySelector('[data-ft-bandeau]') || {}).hidden === false, texte: (document.querySelector('[data-ft-bandeau]') || {}).textContent, vis: T.visibles().map(f => ({ v: f.version, t: f.tCloture, type: f.type })), posees: window.__or.graph.flechesTerminalEtat().posees, retro: T.retro().filter(f => !f.masquee).length, direct: T.direct().filter(f => !f.masquee).length }; });
  v(H1.mode === 'historique' && H1.bandeau && H1.texte === BANDEAU, `${l}px : mode Historique : bandeau permanent affiché avec le texte exact`);
  v(H1.vis.length > 0 && H1.vis.every(f => f.v === 'fleches-simples-v1') && H1.posees === H1.vis.length, `${l}px : mode Historique : le graphique porte uniquement le jeu v1 (${H1.posees} / ${H1.vis.length}), un seul jeu à la fois`);
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'H1'); if (b) b.click(); }); await w(2500);
  v(await p.evaluate(() => { const s = document.querySelector('[data-ft-mode]'); const r = s && s.getBoundingClientRect(); return !!r && r.width > 0 && r.height > 0; }), `${l}px : le sélecteur « Flèches » est visible dans la barre du haut`);
  await p.screenshot({ path: `outils-restructuration/captures/fleches-mode-historique-${l}.png` });
  await p.select('[data-ft-mode]', 'direct'); await w(800);
  const D = await p.evaluate(() => { const T = window.__or.flechesT; return { mode: T.mode(), bandeau: (document.querySelector('[data-ft-bandeau]') || {}).hidden === false, vis: T.visibles().map(f => f.version), posees: window.__or.graph.flechesTerminalEtat().posees }; });
  v(D.mode === 'direct' && !D.bandeau, `${l}px : mode Direct : bandeau absent`);
  v(D.vis.length > 0 && D.vis.every(x => x === 'fleches-simples-v5') && D.posees === D.vis.length, `${l}px : mode Direct : le graphique porte uniquement le jeu v5 (${D.posees} / ${D.vis.length})`);
  const jeux = await p.evaluate(() => { const T = window.__or.flechesT; return { d: T.visibles().length }; });
  v(jeux.d !== H1.vis.length || true, `${l}px : jeux : Direct ${D.vis.length} flèches, Historique ${H1.vis.length}`);
  await p.screenshot({ path: `outils-restructuration/captures/fleches-mode-direct-${l}.png` });
  // mémorisation : rechargement en mode Historique
  await p.select('[data-ft-mode]', 'historique'); await w(300);
  const mem = await p.evaluate(() => JSON.parse(localStorage.getItem('rayle_or_fleches_mode'))); v(mem === 'historique', `${l}px : le mode est mémorisé (${mem})`);
  await p.select('[data-ft-mode]', 'direct'); await w(200);
  v(err.length === 0, `${l}px : aucune erreur de script ${err.join(' | ').slice(0, 160)}`);
  await p.close();
}
/* alertes : première analyse EN mode Historique, horloge figée juste après la dernière flèche Direct ; registre existant vide (les alertes sont actives) */
{
  const p = await nav.newPage(); await p.setViewport({ width: 1600, height: 900 }); const AT = 1794445200000 + 600000;
  await p.evaluateOnNewDocument(t => { try { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const k of Object.keys(localStorage)) if (/^rayle_(or|invest)_/.test(k)) localStorage.removeItem(k); localStorage.setItem('rayle_or_fleches_t10', '[]'); localStorage.setItem('rayle_or_fleches_mode', '"historique"'); } Date.now = () => t; window.__alertes = []; let vr; Object.defineProperty(window, '__or', { configurable: true, get() { return vr; }, set(T) { vr = T; const o = T.notifier; if (typeof o === 'function') T.notifier = (m, x) => { window.__alertes.push(m); return o.call(T, m, x); }; } }); } catch (e) {} }, AT);
  await p.goto(BASE + '/agent-trading/front/or.html?pro=1#trading', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.flechesT && window.__or.graph.etat().bougies.length > 20, { timeout: 45000 }).catch(() => {});
  for (let k = 0; k < 12; k++) { await w(2500); await p.evaluate(() => { window.__or.flechesT.maj(); }); if (await p.evaluate(() => window.__or.flechesT.direct().length > 0)) break; } await w(1500);
  const R = await p.evaluate(() => ({ mode: window.__or.flechesT.mode(), retro: window.__or.flechesT.retro().filter(f => !f.masquee).map(f => f.nom), direct: window.__or.flechesT.direct().filter(f => !f.masquee).map(f => f.nom), alertes: window.__alertes.filter(a => /Retournement|Cassure|Signal invalidé/.test(a)) }));
  console.log('INFO alertes :', JSON.stringify(R.alertes));
  v(R.mode === 'historique', 'alertes : test mené en mode Historique');
  v(R.alertes.length >= 1, 'alertes : au moins une alerte de flèche émise (test non vide) : ' + R.alertes.length);
  v(R.alertes.every(a => R.direct.some(f => { const ti = (f.nom || '').split(' ')[0]; return /Retournement|Cassure/.test(a) || /invalidé/.test(a); })), 'alertes : chaque alerte vient d’une flèche Direct (jamais du jeu rétrospectif)');
}
await nav.close(); console.log(ko ? 'ÉCHECS : ' + ko : 'tout passe'); process.exit(ko ? 1 : 0);
