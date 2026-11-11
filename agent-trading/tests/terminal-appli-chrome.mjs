/* Test Chrome du chemin réel de l'appli : accueil (thème Aurore) → Espaces → « Terminal or » (et la tuile « Terminal or » en Jarvis) → or.html dans la vue Terminal :
   les deux boutons sont visibles, cliquables, le panneau s'ouvre ; ancien terminal joignable. Prérequis : serveur sur BASE (défaut http://127.0.0.1:8000). */
import { createRequire } from 'node:module'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8000'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
for (const theme of ['aurore', 'jarvis']) {
  const p = await nav.newPage(); await p.setViewport({ width: 1600, height: 900 });
  await p.evaluateOnNewDocument(t => { try { localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); localStorage.setItem('rayle_entite_version', '2'); if (t === 'jarvis') localStorage.setItem('rayle_theme', 'jarvis'); } catch (e) {} }, theme);
  await p.goto(BASE + '/index.html', { waitUntil: 'load' }); await w(3000);
  if (theme === 'aurore') { await p.evaluate(() => document.querySelector('.g1-ic[data-i="espaces"]').click()); await w(300);
    v(await p.evaluate(() => [...document.querySelectorAll('#g1Menu button')].some(b => b.textContent === 'Terminal')), 'Aurore : entrée « Terminal or » dans Espaces');
    await p.evaluate(() => [...document.querySelectorAll('#g1Menu button')].find(b => b.textContent === 'Terminal').click()); }
  else await p.evaluate(() => document.getElementById('btnOuvrirTerminal').click());
  await p.waitForSelector('#vueTerminal iframe.tr-or', { timeout: 30000 });
  const f = await (await p.$('#vueTerminal iframe.tr-or')).contentFrame(); await f.waitForSelector('[data-a="positions-rayle"]', { timeout: 30000 });
  v(/or\.html/.test(f.url()), `${theme} : la vue Terminal charge or.html`);
  const r = await f.evaluate(() => ['positions-rayle', 'mouv-h1'].map(a => { const b = document.querySelector(`[data-a="${a}"]`), q = b.getBoundingClientRect(), c = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return q.width > 90 && q.bottom <= innerHeight && c === b; }));
  v(r.every(Boolean), `${theme} : « Positions de Rayle » et « Mouvements H1 » visibles et cliquables`);
  await f.click('[data-a="positions-rayle"]'); await f.waitForFunction(() => window.TradesSimules && window.TradesSimules.ouvert(), { timeout: 15000 });
  v(true, `${theme} : le panneau Trades simulés s'ouvre`);
  await p.close();
}
const r = await (await fetch(BASE + '/terminal.html')).text(); v(/agent-trading\/front\/or\.html/.test(r), 'terminal.html redirige vers or.html');
const a = await nav.newPage(); await a.goto(BASE + '/agent-trading/front/terminal-ancien.html', { waitUntil: 'domcontentloaded' }); await w(3000); v(await a.evaluate(() => !!document.querySelector('#vue *')), 'ancien terminal toujours disponible');
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
