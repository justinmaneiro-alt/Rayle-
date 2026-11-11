/* Captures du graphique de l'or sur des dates connues (6-7 oct., 23 et 27 oct., 4 nov.) en 1600 px et 390 px, vraies données.
   Sert à vérifier à l'œil l'affichage des zones (zones-affichage-v1). Sortie : captures-or/zones-<nom>-<largeur>.png (dossier ignoré par git).
   Usage : BASE=http://127.0.0.1:8011 node agent-trading/tests/zones-captures.mjs [nom-préfixe] */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011', PRE = process.argv[2] || 'apres'; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('captures-or', { recursive: true });
const DATES = [['6-oct', '2026-10-06T10:00:00Z'], ['7-oct', '2026-10-07T12:00:00Z'], ['23-oct', '2026-10-23T12:00:00Z'], ['27-oct', '2026-10-27T12:00:00Z'], ['4-nov', '2026-11-04T12:00:00Z']];
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
const sortie = [];
for (const [l, h, mob] of [[1600, 900, false], [390, 844, true]]) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); const err = []; p.on('pageerror', e => err.push(e.message));
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_or_periode', JSON.stringify('H1')); } catch (e) {} });
  await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.graph && window.__or.moteur && window.__or.moteur.S && window.__or.moteur.S.refH1 && window.__or.moteur.S.refH1.length > 100, { timeout: 60000 }).catch(() => {});
  await w(6000);
  await p.evaluate(() => { const d = document.querySelector('.tor-couches'); if (d) d.open = true; for (const k of ['sr', 'liquidite', 'retournements', 'volume']) { const c = document.querySelector(`[data-couche="${k}"]`); if (c && !c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } } if (d) d.open = false; });
  for (const [nom, iso] of DATES) {
    const t = Date.parse(iso);
    await p.evaluate(tt => window.__or.graph.allerA(tt), t); await w(2500);
    const info = await p.evaluate(() => { const e = window.__or.graph.etat(); return { zones: e.aff ? { sr: e.aff.sr.actives.length, traces: e.aff.sr.traces.length, liq: e.aff.liq.actives.length, bal: e.aff.liq.balayees.length } : null, cadresZ: (e.cadresZ || []).length }; });
    const f = `captures-or/zones-${PRE}-${nom}-${l}.png`; await p.screenshot({ path: f }); sortie.push(`${l}px ${nom}: ${JSON.stringify(info)} -> ${f}`);
  }
  if (err.length) sortie.push('ERREURS PAGE: ' + err.slice(0, 3).join(' | '));
  await p.close();
}
await nav.close(); console.log(sortie.join('\n'));
