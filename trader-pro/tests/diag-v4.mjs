import { lancer, w } from './aide-chrome.mjs';
const T = await lancer('pc'), { p } = T;
await p.goto('http://rayle.test:8000/agent-trading/front/or.html?hj=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
await T.attendre(() => p.evaluate(() => !!window.__orPro), 60000);
await p.evaluate(() => document.querySelector('[data-periode="J"]').click()); await w(9000);
const mesure = () => p.evaluate(async () => { const ts = window.__or.graph.chart().timeScale(), t0 = performance.now(); let n = 0; for (let i = 0; i < 40; i++) { ts.scrollToPosition(-(i * 10), false); await new Promise(r => requestAnimationFrame(r)); n++; } return Math.round((performance.now() - t0) / n); });
console.log('bougies', await p.evaluate(() => window.__or.moteur.serie().length), 'ms/image', await mesure());
for (let i = 0; i < 14; i++) { const ok = await p.evaluate(() => window.__or.moteur.plusAncien()); if (!ok) break; await w(500); }
console.log('bougies', await p.evaluate(() => window.__or.moteur.serie().length), 'ms/image', await mesure());
await p.evaluate(() => { document.querySelector('.tor-graph').style.visibility = 'visible'; });
// cpu profile : quelles primitives coûtent ?
await p.evaluate(() => { window.__t = {}; });
await T.nav.close(); process.exit(0);
