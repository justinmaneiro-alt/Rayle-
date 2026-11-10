/* Test Chrome : la fenêtre Agent de l'application PC (contexte « fenetre ») contient les boutons « Positions de Rayle » et « Mouvements H1 ». BASE=http://127.0.0.1:8000 */
import { createRequire } from 'node:module'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
const p = await nav.newPage(); await p.setViewport({ width: 1600, height: 900 });
await p.goto(BASE + '/agent-trading/front/demo.html', { waitUntil: 'domcontentloaded' });
const r = await p.evaluate(async () => { const m = await import('/agent-trading/front/or/tableau-or.js'); const d = document.createElement('div'); document.body.append(d); m.monterTableauOr(d, { contexte: 'fenetre' });
  return ['positions-rayle', 'mouv-h1'].map(a => { const b = d.querySelector(`[data-a="${a}"]`); if (!b) return false; const q = b.getBoundingClientRect(); return q.width > 80 && q.bottom <= innerHeight; }); });
console.log(r.every(Boolean) ? 'OK  boutons présents dans la fenêtre Agent' : 'ÉCHEC ' + JSON.stringify(r)); await nav.close(); process.exit(r.every(Boolean) ? 0 : 1);
