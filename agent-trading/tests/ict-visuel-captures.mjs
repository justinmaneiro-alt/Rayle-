/* Captures du rapport ICT visuel avec les VRAIES bougies de l'or (REEL=1 : relais Kraken et Binance réels) ; mode Volume avec ses noms et sa légende. Écrit captures-or/reel-*.png. Usage : REEL=1 node agent-trading/tests/ict-visuel-captures.mjs */
process.env.REEL = '1';
import fs from 'node:fs';
import { lancer, ouvrir, VUES, w } from './ict-visuel-aide.mjs';
fs.mkdirSync('captures-or', { recursive: true }); const nav = await lancer(); let ko = 0;
for (const [vue, unites] of [['pc1600', ['M15', 'H1', 'H4', 'J']], ['tab1024', ['H1']], ['tel390', ['H1']]]) {
  const p = await ouvrir(nav, VUES[vue]); await p.evaluate(() => document.querySelector('.tp-b-ict').click()); await w(1500);
  for (const u of unites) { await p.evaluate(x => document.querySelector(`[data-periode="${x}"]`).click(), u); await w(5000);
    for (const m of ['essentiel', 'complet']) { await p.evaluate(x => window.__or.ict.mode(x), m); await w(1500); const n = await p.evaluate(() => window.__or.graph.ictEtat().cadres); console.log(vue, u, m, n + ' zones cliquables'); if (!(n > 0)) ko++; await p.screenshot({ path: `captures-or/reel-${vue}-${u}-${m}.png` }); } }
  if (p.__err.length) { console.log('erreurs :', p.__err.slice(0, 2)); ko++; } await p.close();
}
{ const p = await nav.newPage(); await p.setViewport({ width: 1600, height: 900 }); const err = []; p.on('pageerror', e => err.push(e.message)); await p.goto('http://127.0.0.1:8011/agent-trading/front/or.html?hj=1', { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => document.querySelector('.tp-b-ict'), { timeout: 60000 }); await w(3000);
  await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Volume').click(); }); await w(9000);
  const n = await p.evaluate(() => ({ legende: !!document.querySelector('[data-tpv-leg]'), noms: window.__tpvNoms ? { demandees: window.__tpvNoms.demandees, placees: window.__tpvNoms.placees } : null })); console.log('volume', JSON.stringify(n)); if (!n.legende || !n.noms || n.noms.demandees < 1) ko++;
  await p.screenshot({ path: 'captures-or/reel-volume-pc1600.png' }); if (err.length) ko++; await p.close(); }
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'captures faites'); process.exit(ko ? 1 : 0);
