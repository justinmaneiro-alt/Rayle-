// Capture de l'accueil dans un état donné.  node accueil-capture.mjs <fichier.png> [etat] [largeur] [hauteur]
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [fichier = 'captures-accueil/essai.png', etat = 'idle', L = 1600, H = 900] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${L},${H}`] });
const page = await b.newPage(); await page.setViewport({ width: +L, height: +H });
page.on('pageerror', e => console.log('ERREUR', e.message.slice(0, 200)));
await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 4000));
await page.evaluate(e => { try { window.Entite.verrou(false); window.Entite.verrou = () => {}; window.Entite.etat(e); window.Entite.fixer && window.Entite.fixer(); } catch (x) {} }, etat);
await new Promise(r => setTimeout(r, 2500));
console.log(JSON.stringify(await page.evaluate(() => window.Entite.info())));
await page.screenshot({ path: fichier });
await b.close();
