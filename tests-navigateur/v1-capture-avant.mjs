// Captures « AVANT V1 » : sert les anciennes feuilles de style (sauvegardées) à la place des nouvelles. À lancer AVANT de modifier le JS de l'accueil.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const AVANT = process.env.AVANT_DIR; fs.mkdirSync('captures-v1/avant', { recursive: true });
const anciens = { 'poste-agent.css': 'poste-agent.css', 'espace.css': 'espace.css', 'rayle.css': 'rayle.css', 'hud.css': 'core/hud.css', 'medias.css': 'core/medias.css', 'galaxie.css': 'galaxie.css', 'terminal.css': 'terminal/terminal.css', 'terminal-pro.css': 'terminal/terminal-pro.css', 'multi.css': 'multi.css', 'actus-pays.css': 'core/actus-pays.css' };
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const page = await b.newPage(); await page.setViewport({ width: 1600, height: 900 });
await page.setRequestInterception(true);
page.on('request', r => {
  const u = r.url(), nom = u.split('/').pop().split('?')[0];
  if (nom === 'v1-theme.css' || nom === 'v1-agent.css' || nom === 'tableau-bord.css') return r.respond({ status: 200, contentType: 'text/css', body: '' });
  if (anciens[nom] && (!u.includes('/mars/') || /poste-agent|espace/.test(nom))) { const f = AVANT + '/' + (anciens[nom].includes('/') ? anciens[nom].split('/').pop() : anciens[nom]); if (fs.existsSync(f)) return r.respond({ status: 200, contentType: 'text/css', body: fs.readFileSync(f) }); }
  r.continue();
});
await page.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); });
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await new Promise(r => setTimeout(r, 4500));
// (accueil « avant » : capturé avant la refonte du JS, conservé tel quel)
await page.evaluate(() => { try { window.Entite.verrou(false); window.Entite.verrou = () => {}; window.Entite.etat('speaking'); } catch (x) {} }); await new Promise(r => setTimeout(r, 2000));

await page.evaluate(() => { window.Entite.etat('idle'); });
await page.evaluate(async () => { await import('/planetes/mars/pc/trading/fenetre-agent.js'); await window.PosteAgent.ouvrir({}); }); await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: 'captures-v1/avant/agent-apercu.png' });
await page.evaluate(() => document.querySelector('.pa-onglets [data-onglet="sante"]').click()); await new Promise(r => setTimeout(r, 2500));
await page.screenshot({ path: 'captures-v1/avant/agent-sante.png' });
await page.evaluate(() => window.Panneaux.fermerTout()); await new Promise(r => setTimeout(r, 600));
await page.click('#btnOuvrirTerminal'); await new Promise(r => setTimeout(r, 3500));
await page.screenshot({ path: 'captures-v1/avant/terminal-2d.png' });
await b.close(); console.log('ok');
