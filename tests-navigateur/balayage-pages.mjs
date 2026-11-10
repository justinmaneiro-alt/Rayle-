// Balayage des erreurs de console : accueil, terminal de trading, Terre (orbite), Mars (orbite). Ne change rien : relève seulement.
// Prérequis : node serveur.mjs 8125  puis  BASE=http://127.0.0.1:8125 node tests-navigateur/balayage-pages.mjs
import puppeteer from 'puppeteer-core';
import { entrerEnOrbite, attendre, CHROME, BASE } from './terre-aide.mjs';
import { ouvrirGalaxieTheme as ouvrirGalaxie } from './r2-aide.mjs';
import { entrerSurMars } from './mars-aide.mjs';

const rapport = {};
const noter = (page, liste) => {
  page.on('pageerror', e => liste.push('[exception] ' + e.message.slice(0, 220)));
  page.on('response', r => { if (r.status() >= 400) liste.push('[http ' + r.status() + '] ' + r.url().slice(0, 140)); });
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) liste.push('[' + m.type() + '] ' + m.text().slice(0, 220)); });
  page.on('requestfailed', r => liste.push('[réseau] ' + r.url().slice(0, 140) + ' · ' + (r.failure() || {}).errorText));
};
const resume = L => { const m = new Map(); for (const x of L) m.set(x, (m.get(x) || 0) + 1); return [...m].map(([k, n]) => (n > 1 ? n + '× ' : '') + k); };

// 1. accueil
{
  const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await nav.newPage(); const L = []; noter(p, L);
  await p.evaluateOnNewDocument(() => { localStorage.setItem('rayle_boot', '0'); });
  await p.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(7000);
  rapport.accueil = resume(L);
  // 2. terminal (page de l'agent de trading)
  const L2 = []; const p2 = await nav.newPage(); noter(p2, L2);
  await p2.goto(BASE + '/agent-trading/front/terminal.html', { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => window.__terminal && window.__terminal.graph.etat().n > 100, { timeout: 90000 }).catch(() => L2.push('[balayage] le terminal ne charge pas ses bougies'));
  await attendre(6000); rapport.terminal = resume(L2);
  await nav.close();
}
// 3. Terre
try {
  const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: 1280, hauteur: 720 }); const L = []; noter(page, L);
  await entrerEnOrbite(page, { attenteMax: 90000 }).catch(e => L.push('[balayage] orbite de la Terre : ' + e.message));
  await attendre(6000); rapport.terre = resume(erreurs.concat(L)); await navigateur.close();
} catch (e) { rapport.terre = ['[balayage] ' + e.message]; }
// 4. Mars
try {
  const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: 1280, hauteur: 720 }); const L = []; noter(page, L);
  await entrerSurMars(page, { attenteMax: 90000 }).catch(e => L.push('[balayage] orbite de Mars : ' + e.message));
  await attendre(6000); rapport.mars = resume(erreurs.concat(L)); await navigateur.close();
} catch (e) { rapport.mars = ['[balayage] ' + e.message]; }

for (const [page, L] of Object.entries(rapport)) { console.log('== ' + page + ' : ' + L.length + ' message(s) distinct(s)'); for (const l of L) console.log('   ' + l); }
process.exit(0);
