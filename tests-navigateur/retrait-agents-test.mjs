// Vérifie après le retrait des agents : PC, tablette et téléphone s'ouvrent sans erreur console, aucun lien cassé,
// (le 404 de calendar.json existait déjà avant le retrait : repli du calendrier, sans effet)
// aucun mot d'agent de trading dans l'interface, le terminal s'ouvre. Lancer le serveur (node serveur.mjs 8000) puis :  node tests-navigateur/retrait-agents-test.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';
const { verifier, fin } = compteur();
const D = process.env.DOSSIER || 'captures-retrait'; fs.mkdirSync(D, { recursive: true });
const BRUIT = /Failed to load resource: the server responded with a status of 404|faireconomy|ERR_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET|net::ERR|Failed to fetch|worker|Worker|TradingView|tradingview|fonts\.g|favicon|WebSocket|401|403|Unauthorized|CORS|Access-Control/i;
const MOTS = /kepler|backtest|veilleur|agent de trading|agent ia|agents prêts|gardien prop|positions? simulée|portefeuille virtuel|poste de pilotage/i;
const profils = [
  { nom: 'pc', largeur: 1600, hauteur: 900, mobile: false },
  { nom: 'tablette', largeur: 1024, hauteur: 768, mobile: true },
  { nom: 'telephone', largeur: 384, hauteur: 800, mobile: true }
];
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const p of profils) {
  const page = await nav.newPage();
  await page.setViewport({ width: p.largeur, height: p.hauteur, isMobile: p.mobile, hasTouch: p.mobile, deviceScaleFactor: 1 });
  if (p.mobile) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  const erreurs = [], manquants = [];
  page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('response', r => { if (r.status() === 404 && r.url().startsWith(BASE) && !/calendar.json/.test(r.url())) manquants.push(r.url().replace(BASE, '')); });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_entite_version', '2'); } catch (e) { /* */ } });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await attendre(5000);
  await page.screenshot({ path: `${D}/${p.nom}-accueil.png` });
  const util = erreurs.filter(e => !BRUIT.test(e));
  verifier(`${p.nom} : accueil sans erreur console`, util.length === 0, util.slice(0, 3).join(' | '));
  verifier(`${p.nom} : aucun fichier 404`, manquants.length === 0, manquants.slice(0, 5).join(', '));
  const texte = await page.evaluate(() => document.body.innerText);
  const m = texte.match(MOTS);
  verifier(`${p.nom} : aucun mot d'agent dans l'interface`, !m, m ? m[0] : '');
  const btn = await page.evaluate(() => !!document.getElementById('btnOuvrirTerminal') && !document.getElementById('btnAgent'));
  verifier(`${p.nom} : bouton Terminal présent, bouton Agent IA absent`, btn);
  if (p.mobile) {
    const ok = await page.evaluate(() => { const b = document.querySelector('#m-barre button[data-ecran="marches"], nav button[data-ecran="marches"]'); if (!b) return false; b.click(); return true; });
    await attendre(1500);
    verifier(`${p.nom} : onglet Marchés présent`, ok);
    await page.screenshot({ path: `${D}/${p.nom}-marches.png` });
    const t = await page.evaluate(() => { const b = document.querySelector('[data-terminal]'); if (!b) return false; b.click(); return true; });
    await attendre(4000);
    verifier(`${p.nom} : le bouton « Ouvrir le terminal » ouvre le terminal`, t && await page.evaluate(() => document.body.classList.contains('vue-terminal') || !!document.querySelector('.vue-terminal, #vueTerminal')));
  } else {
    await page.evaluate(() => document.getElementById('btnOuvrirTerminal').click());
    await attendre(5000);
    await page.screenshot({ path: `${D}/${p.nom}-terminal.png` });
    verifier(`${p.nom} : le terminal s'ouvre`, await page.evaluate(() => document.body.classList.contains('vue-terminal') || !!document.querySelector('.vue-terminal, #vueTerminal')));
  }
  const util2 = erreurs.filter(e => !BRUIT.test(e));
  verifier(`${p.nom} : aucune erreur console après ouverture du terminal`, util2.length === 0, util2.slice(0, 3).join(' | '));
  await page.close();
}
await nav.close();
process.exit(fin() ? 1 : 0);
