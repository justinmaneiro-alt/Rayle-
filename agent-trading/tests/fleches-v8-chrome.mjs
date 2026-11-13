/* Test Chrome de la v8 « Direct » (gros mouvements) : sélecteur, cases de Couches, boîtes de position, zones R/S, MA200 colorée, libellés non superposés, 1600 / 1024 / 390 px.
   Prérequis : node serveur.mjs 8011, depuis la racine du dépôt.   BASE=http://127.0.0.1:8011 node agent-trading/tests/fleches-v8-chrome.mjs */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('outils-restructuration/captures', { recursive: true });
const serie = JSON.parse(fs.readFileSync('agent-trading/recherche-or/donnees/kraken-xau-h1-13-nov.json', 'utf8')).map(b => ({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
const chev = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const cocher = (p, cle, on) => p.evaluate((k, o) => { const c = document.querySelector(`[data-couche="${k}"]`); c.checked = o; c.dispatchEvent(new Event('change', { bubbles: true })); }, cle, on);
for (const [l, h, mob] of [[1600, 900, false], [1024, 768, true], [390, 844, true]]) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); const err = []; p.on('pageerror', e => err.push(e.message));
  await p.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const k of Object.keys(localStorage)) if (/^rayle_(or|invest)_/.test(k)) localStorage.removeItem(k); } } catch (e) {} });
  await p.goto(BASE + '/agent-trading/front/or.html?pro=1#trading', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.graph && window.__or.flechesT && window.__or.graph.etat().bougies.length > 20, { timeout: 45000 }).catch(() => {});
  await p.evaluate(b => { window.__or.structure.injecterH1(b); window.__or.structure.maj(true); }, serie); await w(800);
  await p.evaluate(() => { window.__or.flechesT.maj(); }); await w(2500);
  const E = await p.evaluate(() => { const T = window.__or, L = T.flechesT.liste(); return { mode: T.flechesT.mode(), n: L.length, versions: [...new Set(L.map(f => f.version))], options: [...document.querySelectorAll('[data-ft-mode] option')].map(o => o.value), c: T.graph.couches() }; });
  v(E.mode === 'direct' && E.versions.join() === 'fleches-simples-v8' && E.n > 0, `${l}px : « Direct » par défaut = v8 (${E.n} flèches)`);
  v(E.options.join() === 'direct,v7,stable,historique', `${l}px : sélecteur ${E.options.join(',')}`);
  v(E.c.pointsGris === false && E.c.flechesMa === false && E.c.boitesPos === true && E.c.zonesLisibles === true && E.c.autresNiveaux === false, `${l}px : défauts des Couches (points gris, flèches MA200 : non ; boîtes : 3 dernières ; zones lisibles : oui)`);
  v(await p.evaluate(() => ['flechesMa', 'boitesPos', 'boitesToutes', 'zonesLisibles', 'autresNiveaux', 'pointsGris'].every(k => !!document.querySelector(`[data-couche="${k}"]`))), `${l}px : les six cases sont dans le menu Couches`);
  const mk = () => p.evaluate(() => window.__or.graph.marquesAffichees().filter(m => /^f[tc]/.test(m.id)).length);
  const L8 = await p.evaluate(() => window.__or.graph.lectureV8Etat());
  v(L8.boites >= 1 && L8.boites <= 3, `${l}px : boîtes de position : ${L8.boites} affichée(s) (3 dernières flèches au plus)`);
  v(L8.zones >= 2 && L8.zones <= 6 && L8.etiq.every(e => /^[RS][1-3]\s/.test(e.texte)), `${l}px : zones lisibles : ${L8.zones} (3 + 3 au plus), étiquettes ${L8.etiq.map(e => e.texte.split(' ')[0]).join(' ')}`);
  v(L8.ma > 10, `${l}px : MA200 colorée par le régime (${L8.ma} points)`);
  let ok2 = true; for (let i = 0; i < L8.etiq.length; i++) for (let j = i + 1; j < L8.etiq.length; j++) if (chev(L8.etiq[i], L8.etiq[j])) ok2 = false; v(ok2, `${l}px : aucune étiquette de zone ne chevauche une autre`);
  const nM = await mk();
  await cocher(p, 'flechesMa', true); await w(700);
  const nM2 = await mk(); v(nM2 > nM, `${l}px : « Flèches MA200 » cochée → des flèches MA200 apparaissent (${nM} → ${nM2})`);
  await cocher(p, 'boitesToutes', true); await w(700);
  const L9 = await p.evaluate(() => window.__or.graph.lectureV8Etat()); v(L9.boites >= L8.boites, `${l}px : « toutes les boîtes » (${L9.boites} dans la fenêtre)`);
  await cocher(p, 'boitesToutes', false); await cocher(p, 'boitesPos', false); await w(500);
  const L10 = await p.evaluate(() => window.__or.graph.lectureV8Etat()); v(L10.boites === 0, `${l}px : boîtes « aucune » = 0`);
  await cocher(p, 'boitesPos', true); await cocher(p, 'flechesMa', false); await w(500);
  await p.screenshot({ path: `outils-restructuration/captures/fleches-v8-${l}.png` });
  await p.evaluate(() => window.__or.flechesT.fixerMode('v7')); await w(2500);
  const S7 = await p.evaluate(() => ({ v: [...new Set(window.__or.flechesT.liste().map(f => f.version))], lect: window.__or.graph.lectureV8Etat() }));
  v(S7.v.join() === 'fleches-simples-v7' && S7.lect.boites === 0 && S7.lect.zones === 0, `${l}px : « Direct (v7 validée) » = v7, sans boîtes ni zones lisibles`);
  await p.evaluate(() => window.__or.flechesT.fixerMode('stable')); await w(2500);
  v((await p.evaluate(() => [...new Set(window.__or.flechesT.liste().map(f => f.version))])).join() === 'fleches-simples-v6', `${l}px : « Direct (stable) » = v6`);
  await p.evaluate(() => window.__or.flechesT.fixerMode('direct')); await w(2500);
  v((await p.evaluate(() => [...new Set(window.__or.flechesT.liste().map(f => f.version))])).join() === 'fleches-simples-v8', `${l}px : retour à Direct = v8`);
  v(err.length === 0, `${l}px : aucune erreur de script ${err.join(' | ').slice(0, 160)}`); await p.close();
}
await nav.close(); console.log(ko ? 'ÉCHECS : ' + ko : 'tout passe'); process.exit(ko ? 1 : 0);
