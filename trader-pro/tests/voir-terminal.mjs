/* Capture du terminal (or.html) pour contrôle visuel. Usage : node trader-pro/tests/voir-terminal.mjs [tel|tablette|pc] [attente-ms] */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'tel', T = await lancer(mode), { p } = T;
await p.goto('http://rayle.test:8000/agent-trading/front/or.html', { waitUntil: 'domcontentloaded', timeout: 90000 }); await w(+process.argv[3] || 20000);
await T.capture('terminal-etat'); console.log(JSON.stringify(await p.evaluate(() => ({ boutons: [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => (b.innerText || b.title || b.ariaLabel || '').trim().slice(0, 24)).filter(Boolean).slice(0, 60), texte: document.body.innerText.replace(/\s+/g, ' ').slice(0, 900) }))));
await T.nav.close(); process.exit(0);
