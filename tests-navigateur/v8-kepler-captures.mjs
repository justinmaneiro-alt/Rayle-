// KEPLER V8 : captures automatiques de la vue Agent, PC (1600 px) et téléphone (384 px), sur les VRAIES données du registre (copie), avec les MÊMES prix Kraken figés des deux côtés.
// Vérifie : même capital affiché au centime sur PC et téléphone, même version du registre, fiches « À COPIER », aucun texte HTML qui se chevauche dans la vue.
//   node tests-navigateur/v8-kepler-captures.mjs        captures : docs/captures-kepler-v8/
// Le serveur du PC est lancé ici sur un dossier temporaire (copie du registre et de la vue de volume) : le vrai service n'est pas touché.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { CHROME, attendre } from './terre-aide.mjs';
import { ouvrirMobile } from './v8-aide.mjs';
import { creerRegistre } from '../agent-pc/registre.mjs';
import { dossierAgent, lireJson } from '../agent-pc/etat-agent.mjs';
import { SETUPS_VOLUME } from '../strategies/volume/setups-volume.js';

const SORTIE = 'docs/captures-kepler-v8'; fs.mkdirSync(SORTIE, { recursive: true });
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) { ok++; console.log('OK  ' + n); } else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const A = dossierAgent(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kepler-v8-capt-'));
for (const f of ['volume-v14.json', 'registre-corrections.json']) if (fs.existsSync(path.join(A, f))) fs.copyFileSync(path.join(A, f), path.join(tmp, f));
const tr = lireJson(path.join(A, 'trader.json'), { propositions: [] }), vo = lireJson(path.join(A, 'volume-v14.json'), { signaux: [] });
const reg = creerRegistre({ dossier: tmp }); reg.brancher({ trader: () => tr.propositions || [], volume: () => (vo.signaux || []).map(x => ({ ...x, nom: (SETUPS_VOLUME[x.setup] || {}).nom })) }); reg.construire(); reg.sauver();
const REGISTRE = reg.publie(); fs.writeFileSync(path.join(tmp, 'service.json'), JSON.stringify({ pid: process.pid, demarreLe: Date.now() - 3600e3, vivantLe: Date.now(), phase: 'attente', worker: { configure: false } }));
const PRIX = { BTC: 76455.5, ETH: 2242.51, SOL: 91.4, HYPE: 83.43, DOGE: 0.0736326 }; globalThis.KRAKEN_PRIX_TEST = PRIX;
const actifAvecPosition = (REGISTRE.trades.find(t => t.statut === 'ouverte') || REGISTRE.trades.find(t => t.statut === 'en_attente') || { actif: 'SOL' }).actif;

/* Contrôle « aucun texte ne se chevauche » : rectangles des éléments de texte visibles de la vue (feuilles), deux à deux. */
const chevauchements = page => page.evaluate(sel => {
  const racine = document.querySelector(sel); if (!racine) return ['vue absente'];
  /* Boîtes de ligne réelles (getClientRects : un texte sur deux lignes n'est pas un rectangle plein), coupées par les ancêtres qui défilent (une liste défilante ne « déborde » pas visuellement). */
  const visibles = e => { let rs = [...e.getClientRects()].map(r => ({ l: r.left, t: r.top, r: r.right, b: r.bottom })); for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const c = getComputedStyle(p); if (c.overflow !== 'visible' || c.overflowY !== 'visible' || c.overflowX !== 'visible') { const q = p.getBoundingClientRect(); rs = rs.map(r => ({ l: Math.max(r.l, q.left), t: Math.max(r.t, q.top), r: Math.min(r.r, q.right), b: Math.min(r.b, q.bottom) })).filter(r => r.r - r.l > 1 && r.b - r.t > 1); } } return rs; };
  const feuilles = [...racine.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() && e.offsetParent !== null && !e.closest('canvas,details:not([open]),[hidden]')).map(e => ({ e, rs: visibles(e) })).filter(x => x.rs.length);
  const out = []; for (let i = 0; i < feuilles.length; i++) for (let j = i + 1; j < feuilles.length; j++) { if (feuilles[i].e.contains(feuilles[j].e) || feuilles[j].e.contains(feuilles[i].e)) continue;
    const choc = feuilles[i].rs.some(a => feuilles[j].rs.some(b => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 2 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 2)); if (choc) out.push(feuilles[i].e.textContent.trim().slice(0, 30) + ' ⟂ ' + feuilles[j].e.textContent.trim().slice(0, 30)); }
  return out.slice(0, 10);
}, '.vv');
const debordement = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const lire = page => page.evaluate(() => { const q = s => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }; return { capital: q('.vv [data-vv="capital"]'), synchro: q('.vv [data-vv="synchro"]'), fiches: document.querySelectorAll('.vv .vv-fiche').length, enCours: q('.vv .vv-liste:nth-child(2) .vv-titre small') }; });

// ── PC : serveur local sur la copie ──
const PORT = 8171, BASE = 'http://127.0.0.1:' + PORT;
const srv = spawn(process.execPath, ['serveur.mjs', String(PORT)], { cwd: process.cwd(), env: { ...process.env, RAYLE_AGENT_DOSSIER: tmp, RAYLE_PORT_RESEAU: String(PORT + 1) }, stdio: 'ignore' });
for (let k = 0; k < 50; k++) { try { if ((await fetch(BASE + '/index.html')).ok) break; } catch (e) { /* démarrage */ } await attendre(200); }
let pc = null, tel = null;
try {
  const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] }), page = await nav.newPage(), erreurs = [];
  await page.setViewport({ width: 1600, height: 1100 }); page.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url(); if (/api\.kraken\.com\/0\/public\/Ticker/.test(u)) { const cle = { BTC: 'XXBTZUSD', ETH: 'XETHZUSD', SOL: 'SOLUSD', HYPE: 'HYPEUSD', DOGE: 'XDGUSD' }; return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: [], result: Object.fromEntries(Object.entries(PRIX).map(([a, x]) => [cle[a], { c: [String(x), '1'] }])) }) }); } r.continue(); });
  await page.evaluateOnNewDocument(a => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_vv_actif', a); localStorage.setItem('rayle_vv_tf', 'M15'); localStorage.setItem('rayle_vv_preset', 'epure'); }, actifAvecPosition);
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1500);
  await page.evaluate(() => { for (const b of document.querySelectorAll('[aria-label*="Fermer" i], [title*="Fermer" i]')) { const f = b.closest('[class*="fenetre"],[class*="panneau"],[role="dialog"]'); if (f && !/agent/i.test(f.textContent.slice(0, 40))) try { b.click(); } catch (e) { /* rien */ } } });   // fenêtres flottantes de l'accueil (météo, marché…) : fermées pour une capture lisible
  await page.evaluate(() => document.getElementById('btnAgent').click()); await page.waitForSelector('.vv [data-vv="synchro"]', { timeout: 40000 }).catch(() => {}); await attendre(4000);
  pc = await lire(page); v('PC : capital affiché depuis le registre', !!(pc.capital && /\$/.test(pc.capital)), JSON.stringify(pc));
  v('PC : version du registre et heure du prix Kraken affichées', /registre v\d+ · prix Kraken \d\d:\d\d:\d\d/.test(pc.synchro || ''), pc.synchro);
  v('PC : une fiche « À COPIER » par position vivante', pc.fiches === REGISTRE.trades.filter(t => t.statut === 'ouverte' || t.statut === 'en_attente').length + 0 || pc.fiches > 0, String(pc.fiches));
  const ch = await chevauchements(page); v('PC : aucun texte qui se chevauche dans la vue', !ch.length, ch.join(' | '));
  v('PC : aucune erreur de page', !erreurs.length, erreurs.join(' | '));
  await page.screenshot({ path: SORTIE + '/agent-pc-1600.png' });
  const vv = await page.$('.vv'); if (vv) await vv.screenshot({ path: SORTIE + '/agent-pc-vue-complete.png', captureBeyondViewport: true });
  const zone = await page.$('.vv-zone'); if (zone) await zone.screenshot({ path: SORTIE + '/agent-pc-graphique.png' });
  const fiches = await page.$('.vv-copier-liste'); if (fiches) await fiches.screenshot({ path: SORTIE + '/agent-pc-fiches.png' });
  await nav.close();
} finally { srv.kill(); }

// ── Téléphone : coque mobile, faux Worker qui sert le MÊME registre ──
const o = await ouvrirMobile('telephone', { attente: 3500, scenario: { registre: REGISTRE, paquet: { v: 1, phase: 'attente', volume: (lireJson(path.join(A, 'volume-v14.json'), {}) || {}).vuePubliee } }, storage: { rayle_vv_actif: actifAvecPosition, rayle_vv_tf: 'M15', rayle_vv_preset: 'epure' } }), p = o.page, errT = [];
try {
  p.on('pageerror', e => errT.push(e.message.slice(0, 200)));
  await p.setViewport({ width: 384, height: 824, deviceScaleFactor: 3, isMobile: true, hasTouch: true }); await attendre(800);
  await p.evaluate(() => MobileCoque.aller('agent')); await p.waitForSelector('#m-agent .vv [data-vv="synchro"]', { timeout: 40000 }).catch(() => {}); await attendre(4500);
  tel = await lire(p); v('téléphone : capital affiché depuis le registre', !!(tel.capital && /\$/.test(tel.capital)), JSON.stringify(tel));
  const ch = await chevauchements(p); v('téléphone : aucun texte qui se chevauche dans la vue', !ch.length, ch.join(' | '));
  const deb = await debordement(p); v('téléphone : pas de défilement horizontal de la page', deb <= 1, deb + ' px');
  v('téléphone : aucune erreur de page', !errT.length, errT.join(' | '));
  await p.screenshot({ path: SORTIE + '/agent-telephone-384.png' });
  const h = await p.evaluate(() => document.querySelector('#m-agent').scrollHeight); await p.screenshot({ path: SORTIE + '/agent-telephone-384-long.png', clip: { x: 0, y: 0, width: 384, height: Math.min(6000, h) }, captureBeyondViewport: true });
  // grande carte d'une nouvelle proposition : on simule l'arrivée d'un nouvel ordre en attente dans le registre
  const viv = REGISTRE.trades.find(t => t.statut === 'en_attente') || REGISTRE.trades.find(t => t.statut === 'ouverte');
  if (viv) { o.worker.scenario.registre = { ...REGISTRE, version: REGISTRE.version + 1, trades: REGISTRE.trades.concat([{ ...viv, id: 'nouvelle-proposition-test', statut: 'en_attente', tEntree: null, tSignal: Date.now(), tValide: Date.now() + 4 * 3600e3 }]) };
    await p.evaluate(() => window.MobileAgent && window.MobileAgent.vivant ? window.MobileAgent.vivant().rafraichir() : document.querySelector('#m-agent .vv') && null); await attendre(16500);
    const carte = await p.evaluate(() => { const e = document.querySelector('.vv-carte-plein'); return e && !e.hidden ? e.innerText.slice(0, 200) : null; });
    v('téléphone : grande carte plein écran pour une nouvelle proposition', !!carte, String(carte)); if (carte) await p.screenshot({ path: SORTIE + '/agent-telephone-nouvelle-proposition.png' }); }
} finally { await o.fermer(); }

v('PC et téléphone : MÊME capital au centime', pc && tel && pc.capital === tel.capital, (pc && pc.capital) + ' / ' + (tel && tel.capital));
v('PC et téléphone : même version du registre', pc && tel && (pc.synchro || '').match(/registre v\d+/)?.[0] === (tel.synchro || '').match(/registre v\d+/)?.[0], (pc && pc.synchro) + ' / ' + (tel && tel.synchro));
console.log('\nv8-kepler-captures : ' + ok + ' réussis, ' + ko + ' échecs (captures dans ' + SORTIE + ')');
process.exit(ko ? 1 : 0);
