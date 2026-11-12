/* Test Chrome du RSI 14 : UNE seule sous-fenêtre, jamais deux ; il suit la timeframe affichée ; case « RSI » dans Couches (activée par défaut, état mémorisé) ;
   valeurs comparées à un calcul de référence (Wilder) sur les bougies affichées. PC 1600, tablette 1024, téléphone 390. Vraies données (relais Kraken du serveur local).
   Prérequis : node serveur.mjs 8125.   BASE=http://127.0.0.1:8125 node agent-trading/tests/rsi-chrome.mjs */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8125'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('outils-restructuration/captures', { recursive: true });
const reference = cl => { const n = 14, g = [], p = []; for (let i = 1; i < cl.length; i++) { const d = cl[i] - cl[i - 1]; g.push(Math.max(d, 0)); p.push(Math.max(-d, 0)); } let ag = g.slice(0, n).reduce((a, b) => a + b, 0) / n, ap = p.slice(0, n).reduce((a, b) => a + b, 0) / n; const f = (a, b) => (b === 0 ? 100 : 100 - 100 / (1 + a / b)); let der = f(ag, ap); for (let k = n; k < g.length; k++) { ag = (ag * (n - 1) + g[k]) / n; ap = (ap * (n - 1) + p[k]) / n; der = f(ag, ap); } return der; };
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
for (const [l, h, mob] of [[1600, 900, false], [1024, 768, true], [390, 844, true]]) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); const err = []; p.on('pageerror', e => err.push(e.message));
  await p.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const k of Object.keys(localStorage)) if (/^rayle_(or|invest)_/.test(k)) localStorage.removeItem(k); } } catch (e) {} });
  await p.goto(BASE + '/agent-trading/front/or.html?pro=1#trading', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.rsiUI && window.__or.graph.etat().bougies.length > 40, { timeout: 60000 }).catch(() => {});
  await w(2500);
  const lire = () => p.evaluate(() => { const T = window.__or, e = T.rsiUI.etat(), B = T.graph.etat().bougies; return { e, n: B.length, per: T.moteur.S.periode, closes: B.map(b => b.c), couche: T.graph.couches().rsi }; });
  let S = await lire();
  v(S.couche === true && S.e.actif && S.e.dessine, `${l}px : RSI activé par défaut et dessiné (période ${S.per}, ${S.n} bougies)`);
  v(S.e.graphe && S.e.graphe.lignes === 1 && S.e.graphe.panneaux <= 3, `${l}px : une seule ligne RSI, ${S.e.graphe && S.e.graphe.panneaux} volets au plus (prix, volume, RSI)`);
  const ref = reference(S.closes); v(S.e.dernier != null && Math.abs(S.e.dernier - ref) < 1e-6, `${l}px : dernier RSI ${S.e.dernier && S.e.dernier.toFixed(3)} = référence de Wilder ${ref.toFixed(3)} sur les bougies affichées`);
  // case « RSI » dans Couches
  const caseRsi = await p.evaluate(() => { const i = document.querySelector('[data-couche="rsi"]'); return i ? { present: true, coche: !!i.checked } : { present: false }; });
  v(caseRsi.present && caseRsi.coche, `${l}px : case « RSI » présente dans Couches et cochée`);
  await p.screenshot({ path: `outils-restructuration/captures/rsi-${l}-${S.per}.png` });
  // changement de timeframe : le RSI suit, jamais deux
  const autre = S.per === 'M15' ? 'H4' : 'M15';
  await p.evaluate(a => { document.querySelector(`[data-periode="${a}"]`).click(); }, autre);
  await p.waitForFunction(a => window.__or.moteur.S.periode === a && window.__or.rsiUI.etat().periode === a && window.__or.rsiUI.etat().bougies > 40, { timeout: 60000 }, autre).catch(() => {}); await w(2000);
  S = await lire(); const ref2 = reference(S.closes);
  v(S.per === autre && S.e.periode === autre, `${l}px : le RSI suit la timeframe affichée (${autre})`);
  v(S.e.dernier != null && Math.abs(S.e.dernier - ref2) < 1e-6, `${l}px : ${autre} : RSI ${S.e.dernier && S.e.dernier.toFixed(3)} = référence ${ref2.toFixed(3)}`);
  v(S.e.graphe.lignes === 1 && S.e.graphe.panneaux <= 3, `${l}px : toujours une seule sous-fenêtre RSI après le changement (${S.e.graphe.panneaux} volets)`);
  await p.screenshot({ path: `outils-restructuration/captures/rsi-${l}-${autre}.png` });
  // décocher puis recocher : jamais deux ; état mémorisé après rechargement
  await p.evaluate(() => { const i = document.querySelector('[data-couche="rsi"]'); i.checked = false; i.dispatchEvent(new Event('change', { bubbles: true })); }); await w(1200);
  S = await lire(); v(S.couche === false && !S.e.graphe.actif, `${l}px : case décochée : le RSI disparaît`);
  await p.evaluate(() => { const i = document.querySelector('[data-couche="rsi"]'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }); await w(1500);
  await p.evaluate(() => { const i = document.querySelector('[data-couche="rsi"]'); i.checked = false; i.dispatchEvent(new Event('change', { bubbles: true })); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }); await w(1500);
  S = await lire(); v(S.e.graphe.lignes === 1 && S.e.graphe.panneaux <= 3 && S.e.actif, `${l}px : après plusieurs bascules, toujours une seule sous-fenêtre (${S.e.graphe.panneaux} volets, ${S.e.graphe.lignes} ligne)`);
  await p.evaluate(() => { const i = document.querySelector('[data-couche="rsi"]'); i.checked = false; i.dispatchEvent(new Event('change', { bubbles: true })); }); await w(500);
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__or && window.__or.rsiUI && window.__or.graph.etat().bougies.length > 40, { timeout: 60000 }).catch(() => {}); await w(2000);
  S = await lire(); v(S.couche === false && !S.e.graphe.actif, `${l}px : état « RSI désactivé » mémorisé après rechargement`);
  v(err.length === 0, `${l}px : aucune erreur de script ${err.join(' | ').slice(0, 160)}`);
  await p.close();
}
await nav.close(); console.log(ko ? 'ÉCHECS : ' + ko : 'tout passe'); process.exit(ko ? 1 : 0);
