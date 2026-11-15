import { lancer, w } from './aide-chrome.mjs';
const T = await lancer(process.argv[2] || 'tel'), { p } = T;
await p.goto('http://rayle.test:8000/agent-trading/front/or.html', { waitUntil: 'domcontentloaded', timeout: 90000 }); await w(14000);
console.log(JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.tp-b-details, .tp-b-hj, .tp-ligne-boutons, .tp-ma-legende')].map(b => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b); return b.className + ' ' + [r.left, r.top, r.width, r.height].map(Math.round).join(',') + ' disp=' + cs.display + ' vis=' + cs.visibility + ' parent=' + b.parentElement.className.slice(0, 40) + ' vw=' + innerWidth; }))));
await T.nav.close(); process.exit(0);
