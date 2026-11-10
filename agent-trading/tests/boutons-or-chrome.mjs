/* Test Chrome : boutons « Positions de Rayle » et « Mouvements H1 » collés au graphique de l'or (1600 px et 390 px).
   Prérequis : node serveur.mjs 8011 (racine du dépôt).  Usage : node agent-trading/tests/boutons-or-chrome.mjs */
import { createRequire } from 'node:module'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011';
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; };
for (const [l, h, mob] of [[1600, 900, false], [390, 844, true]]) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob });
  await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-a="positions-rayle"]', { timeout: 20000 }); await new Promise(r => setTimeout(r, 3000));
  const r = await p.evaluate(() => { const g = document.querySelector('.tor-graph').getBoundingClientRect(), lw = document.querySelector('.tor-graph-lw').getBoundingClientRect();
    return ['positions-rayle', 'mouv-h1'].map(a => { const b = document.querySelector(`[data-a="${a}"]`), q = b.getBoundingClientRect(), c = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      return { a, txt: b.textContent, dansCadre: q.left >= g.left && q.right <= g.right && q.top >= g.top && q.bottom <= lw.top + 1, visible: q.bottom <= innerHeight && q.top >= 0 && q.right <= innerWidth, cliquable: c === b, h: q.height, w: q.width }; }); });
  for (const b of r) v(b.dansCadre && b.visible && b.cliquable && b.h >= 34 && b.w >= 90, `${l}px : « ${b.txt} » dans le cadre du graphique, visible, cliquable (${Math.round(b.w)}×${Math.round(b.h)})`);
  v(!(await p.$('.ts-bouton')), `${l}px : plus de bouton flottant`);
  v(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${l}px : pas de défilement horizontal`);
  await p.click('[data-a="positions-rayle"]'); await p.waitForFunction(() => window.TradesSimules && window.TradesSimules.ouvert(), { timeout: 15000 });
  v(await p.evaluate(() => document.querySelector('[data-a="positions-rayle"]').classList.contains('actif')), `${l}px : panneau ouvert, bouton coloré`);
  if (!mob) { await p.click('[data-a="positions-rayle"]'); await new Promise(r => setTimeout(r, 300)); v(await p.evaluate(() => !window.TradesSimules.ouvert() && !document.querySelector('[data-a="positions-rayle"]').classList.contains('actif')), `${l}px : second clic ferme`); }
  else { await p.click('[data-ts="fermer"]'); v(await p.evaluate(() => !window.TradesSimules.ouvert()), `${l}px : Fermer ferme`); }
  const avant = await p.evaluate(() => window.__or.graph.couches().mouvements !== false);
  await p.click('[data-a="mouv-h1"]'); const apres = await p.evaluate(() => window.__or.graph.couches().mouvements !== false);
  v(avant !== apres, `${l}px : « Mouvements H1 » bascule la couche`);
  await p.close();
}
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
