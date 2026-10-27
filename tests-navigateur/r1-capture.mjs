import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
/* R1 : capture de l'accueil (arguments : nom du fichier, largeur, hauteur, theme, clic éventuel sur un sélecteur). */
const [nom = 'r1-accueil', L = '1600', H = '900', theme = 'aurore', ouvrir = ''] = process.argv.slice(2);
mkdirSync('docs/captures-r1', { recursive: true });
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: +L, height: +H });
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message.slice(0, 160)));
await p.evaluateOnNewDocument(t => { window.__RAYLE_TB_TEST__ = { sansReseau: true }; localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); localStorage.setItem('rayle_theme', t); }, theme);
await p.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'load' }); await new Promise(r => setTimeout(r, 4500));
if (ouvrir) { await p.evaluate(s => document.querySelector(s)?.click(), ouvrir); await new Promise(r => setTimeout(r, 1500)); }
await p.screenshot({ path: `docs/captures-r1/${nom}.png` });
console.log('ok', nom, erreurs.length ? erreurs : '');
await b.close();
