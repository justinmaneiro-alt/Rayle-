import puppeteer from 'puppeteer-core';
import { CHROME, attendre, compteur } from './terre-aide.mjs';

/* V4 phase 4 — le terminal de Mars montre le bouton « Carte de liquidité » et la case « Murs et cibles sur le graphique » ; la surimpression pose de vraies lignes de prix sur le graphique Raylé
   (service PC simulé par interception de /__flux/analyse). Un serveur local doit tourner : node serveur.mjs 8000 (ou BASE=…). */
const T = compteur(), BASE = process.env.BASE || 'http://127.0.0.1:8000';
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await nav.newPage(); await page.setViewport({ width: 1500, height: 950 });
const erreurs = []; page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 300))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|CORS|net::|support-portal|tradingview/i.test(m.text())) erreurs.push(m.text().slice(0, 300)); });
await page.setRequestInterception(true);
const klines = []; const t0 = Math.floor(Date.now() / 3600e3) * 3600e3 - 300 * 3600e3; for (let i = 0; i < 300; i++) { const c = 81000 + Math.sin(i / 10) * 400; klines.push({ t: t0 + i * 3600e3, o: c, h: c + 120, l: c - 120, c: c + 20, v: 1000 }); }
page.on('request', r => {
  const u = r.url();
  if (/__flux\/analyse/.test(u)) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, analyse: { prix: 81000, murs: [{ prix: 81300, cote: 'ask', usdMax: 6e6, actif: true, distancePct: 0.37, fiabilite: { niveau: 'fiable' } }, { prix: 80800, cote: 'bid', usdMax: 3e6, actif: true, distancePct: 0.25, fiabilite: { niveau: 'incertain' } }], aimants: { objectif: { prix: 81300 }, defense: { prix: 80800 }, invalidation: { prix: 80700 } } } }) });
  if (/\/marche\?/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, actif: 'BTC', source: 'Binance', symbole: 'BTCUSDT', bougies: klines }) });
  r.continue();
});
await page.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_tg_prefs', JSON.stringify({ instrument: 'BTC', unite: 'H1', source: 'rayle' })); window.__RAYLE_POSTE_TEST__ = true; });
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1500);
await page.evaluate(async () => { const E = await import('/planetes/mars/pc/trading/fenetre.js'); await E.ouvrirEspace({}); });
await page.waitForSelector('.tg-actions', { timeout: 20000 }); await attendre(1500);
const ev = (f, ...a) => page.evaluate(f, ...a);
T.verifier('le terminal montre « 💧 Carte de liquidité » et la case « Murs et cibles sur le graphique »', await ev(() => !!document.querySelector('.tg-liq') && !!document.querySelector('.tg-sur input[data-sur]')));
T.verifier('la case dit où elle marche (graphique Raylé, BTC/SOL/DOGE, service PC)', await ev(() => /Raylé/.test(document.querySelector('.tg-sur').title) && /service PC/.test(document.querySelector('.tg-sur').title)));
await ev(() => document.querySelector('.tg-src-btn[data-source="rayle"]').click()); await attendre(500); await ev(() => document.querySelector('.tg-chip[data-id="BTC"]').click()); await attendre(2500);
await ev(() => document.querySelector('.tg-sur input').click()); await attendre(2500);
const s = await ev(() => ({ note: document.querySelector('.tg-sur-note').textContent }));
T.verifier('activée sur BTC, graphique Raylé : 5 niveaux posés (2 murs + cible, défense, invalidation)', /5 niveaux/.test(s.note), s.note);
await ev(() => document.querySelector('.tg-liq').click()); await attendre(2500);
T.verifier('le bouton ouvre la fenêtre « Carte de liquidité »', await ev(() => !!document.querySelector('.pn.lq-fenetre')));
T.verifier('aucune erreur console', erreurs.length === 0, erreurs.join(' | ').slice(0, 300));
await nav.close(); T.fin();
