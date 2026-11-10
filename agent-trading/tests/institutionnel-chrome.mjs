/* Test Chrome : les outils institutionnels s'activent séparément dans « Couches » sur la vraie page de l'or (données Kraken réelles), sans erreur, et dessinent. */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8000'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('captures-or', { recursive: true });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
const p = await nav.newPage(); await p.setViewport({ width: 1600, height: 900 }); const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_|status of 40|net::|Failed to load resource|CORS/i.test(m.text())) erreurs.push(m.text()); });
await p.evaluateOnNewDocument(() => { try { localStorage.removeItem('rayle_or_couches_v2'); } catch (e) {} });
await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__or && window.__or.graph && window.__or.graph.serie && window.__or.institutionnel, { timeout: 30000 }); await w(9000);
const cles = ['vwap', 'vwapAncre', 'profil', 'cvd', 'veilleSemaine', 'ouvertures', 'seances', 'ronds', 'liquiditeZones'];
v(await p.evaluate(c => c.every(k => document.querySelector(`[data-couche="${k}"]`) && !document.querySelector(`[data-couche="${k}"]`).checked), cles), 'neuf couches institutionnelles présentes et décochées par défaut (aucune imposée)'); v(!!(await p.$('[data-couche="carteCarnet"]')), 'case « Carte thermique du carnet »');
await p.evaluate(() => document.querySelector('.tor-couches').open = true);
for (const k of cles) { await p.evaluate(k2 => { const c = document.querySelector(`[data-couche="${k2}"]`); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }, k); await w(400);
  const m = await p.evaluate(() => { const M = window.__or.institutionnel.modele(); return M && { lignes: M.lignes.length, series: M.series.length, zones: M.zones.length, profils: M.profils.length, marques: M.marques.length, delta: !!M.delta, notes: M.notes }; });
  v(!!m, `couche ${k} : modèle construit ${JSON.stringify(m && { l: m.lignes, s: m.series, z: m.zones, p: m.profils, m: m.marques, d: m.delta })}`); }
await p.screenshot({ path: 'captures-or/institutionnel-m15.png' });
v(erreurs.length === 0, 'aucune erreur de page : ' + erreurs.slice(0, 3).join(' | '));
const M = await p.evaluate(() => { const M = window.__or.institutionnel.modele(); return { series: M.series.length, profils: M.profils.length, lignes: M.lignes.length }; }); v(M.series >= 3 && M.profils >= 1 && M.lignes >= 6, 'VWAP + bandes, profils et niveaux présents avec les données réelles ' + JSON.stringify(M));
// pause d'interface : calcul du modèle < 800 ms
const dt = await p.evaluate(() => { const t = performance.now(); window.__or.institutionnel.maj(true); return performance.now() - t; }); v(dt < 800, `mise à jour des outils en ${dt.toFixed(0)} ms (< 800)`);
// mobile
const m = await nav.newPage(); await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await m.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' }); await w(7000); await m.evaluate(() => { for (const k of ['vwap', 'profil', 'seances']) { const c = document.querySelector(`[data-couche="${k}"]`); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } }); await w(800); await m.screenshot({ path: 'captures-or/institutionnel-mobile.png' });
v(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile : pas de défilement horizontal');
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
