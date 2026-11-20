import { lancer, w } from './aide-chrome.mjs';
const T = await lancer('pc'), { p, erreurs } = T;
p.on('response', r => { if (r.status() >= 400) console.log('  HTTP', r.status(), r.url().slice(0, 140)); });
p.on('console', m => { if (/\[tp\]|pro|Error|import/i.test(m.text())) console.log('  console:', m.text().slice(0, 200)); });
await p.goto('http://rayle.test:8000/agent-trading/front/or.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
await w(15000);
console.log(await p.evaluate(() => JSON.stringify({ k: Object.keys(window).filter(k => k.startsWith('__')), mode: !!document.querySelector('.tp-mode'), orPro: !!window.__orPro })));
console.log(erreurs.slice(0, 8).join('\n'));
await T.nav.close(); process.exit(0);
