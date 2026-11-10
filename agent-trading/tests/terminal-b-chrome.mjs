/* Partie B + commandes vocales dans Chrome (vraies données Kraken par le serveur du PC). Prérequis : node serveur.mjs 8125.
   Usage : node agent-trading/tests/terminal-b-chrome.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json'));
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8125';
const w = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0; const v = (c, m, d = '') => { if (c) { ok++; console.log('OK ', m); } else { ko++; console.log('ÉCHEC', m, d); } };
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 120000, args: ['--no-sandbox', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await nav.newPage(); await p.setViewport({ width: 1680, height: 950 });
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|404|ERR_|net::|Telegram/i.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
await p.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('i')) { sessionStorage.setItem('i', '1'); localStorage.clear(); } });
await p.goto(BASE + '/agent-trading/front/terminal.html', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__terminal && window.__terminal.graph.etat().n > 100 && window.__terminal.module('rayle') && window.__terminal.module('analyses'), { timeout: 90000 });
const T = 'window.__terminal';
const defauts = await p.evaluate(() => { const c = window.__terminal.couches(); return ['motifs', 'evenements', 'carnetBougie', 'cvd', 'profilVolume', 'vwap', 'vwapAncre', 'extremes', 'seances', 'rondes', 'chaleur'].map(k => [k, c[k]]); });
v(defauts.every(([, x]) => x === false), 'toutes les nouvelles couches sont désactivées par défaut', JSON.stringify(defauts));
// activer toutes les couches : le graphique doit continuer à tourner sans erreur
await p.evaluate(() => { for (const k of ['motifs', 'evenements', 'carnetBougie', 'cvd', 'profilVolume', 'vwap', 'extremes', 'seances', 'rondes']) window.__terminal.couche(k, true); });
await w(3500);
v(await p.evaluate(() => !document.querySelector('.tr-bougie-carnet').hidden), 'panneau « bougie du carnet » visible quand la couche est active');
const bc = await p.evaluate(() => { const b = window.__terminal.module('analyses').bougiesCarnet().bougies(); return b.length ? b[b.length - 1] : null; });
v(bc && bc.o === 0 && typeof bc.c === 'number' && bc.c >= -1 && bc.c <= 1, 'bougie du carnet construite depuis zéro, pression entre −1 et +1', JSON.stringify(bc));
// commandes de bout en bout
const dire = t => p.evaluate(x => window.__terminal.module('rayle').commande(x), t);
const d = await dire('Décris mon terminal'); v(/Tu regardes/.test(d) && /Couches affichées/.test(d) && /position/i.test(d), 'décris mon terminal', d);
const pt = await dire('Fais-moi le point'); v(/Information de lecture, pas un signal/.test(pt) && /moyenne mobile|Moyenne mobile/.test(pt), 'fais-moi le point', String(pt).slice(0, 200));
const cot = await dire('Explique-moi le COT comme à un débutant'); v(/COT/.test(cot) && /Information de lecture/.test(cot), 'explique-moi le COT (débutant)', String(cot).slice(0, 160));
const rel = await dire('et en détail ?'); v(rel && /COT|Commitments|CFTC|rapport/.test(rel), 'relance « en détail » : la conversation est suivie', String(rel).slice(0, 160));
const sante = await dire('explique-moi la santé du marché'); v(/volatilité|Volatilité/.test(sante), 'explique la santé du marché', String(sante).slice(0, 120));
const ordre = await dire('achète de l’or'); v(/ne passe jamais d’ordre/.test(ordre), 'jamais d\'ordre', ordre);
const motifs = await dire('quels sont les motifs de bougies ?'); v(/Régime|Pas de motif|marteau|doji|bar/i.test(motifs) && /Information de lecture/.test(motifs), 'motifs et régime', String(motifs).slice(0, 160));
const bcr = await dire('lis-moi la bougie du carnet'); v(/Pression du carnet|Pas encore de bougie/.test(bcr) && /Mesuré depuis l’ouverture/.test(bcr), 'bougie du carnet lue par Rayle', String(bcr).slice(0, 160));
const rap = await dire('Rayle, fais-moi un rapport sur les marchés aujourd’hui');
v(typeof rap === 'string' && rap.length > 80 && /Information de lecture/.test(rap), 'rapport du jour : version parlée', String(rap).slice(0, 160));
const txt = await p.evaluate(() => document.querySelector('.tr-reponse') ? document.querySelector('.tr-reponse').textContent : '');
v(/RAPPORT DU JOUR/.test(txt) && /Faits mesurés/.test(txt) && /Or|Bitcoin|Nasdaq/.test(txt), 'rapport du jour : version texte dans le panneau Rayle', txt.slice(0, 200));
const etat = await p.evaluate(() => window.__terminal.module('analyses').etat({}));
v(etat && etat.regime !== undefined && etat.bougieCarnet && etat.mention, 'état étendu exposé à Rayle (régime, bougie du carnet, mention)');
v(!!(await p.$('[data-rapport]')), 'bouton « Rapport du jour » présent');
const L = await p.evaluate(() => 0); await w(500);
v(erreurs.length === 0, 'aucune erreur JavaScript', erreurs.join(' | '));
console.log(`${ok} ok, ${ko} KO`); await nav.close(); process.exit(ko ? 1 : 0);
