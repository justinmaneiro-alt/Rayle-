/* Service worker : précache complet (precache.json), puis RÉSEAU COUPÉ (y compris le serveur de l'appli) : la page se recharge, la Terre mobile s'affiche depuis le cache, Réglages et Marchés
   s'ouvrent sans erreur brute. Prérequis : node serveur.mjs 8000 (127.0.0.1 est un contexte sécurisé : le service worker s'y installe).  Usage : node tests-navigateur/sw-hors-ligne-test.mjs */
import { createRequire } from 'node:module'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core'); const w = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0; const verif = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await nav.newPage(); await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'); await p.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message.slice(0, 140)));
const attendre = async (f, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await w(300); } return false; };
await p.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'domcontentloaded' });
verif(await attendre(() => p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active); }), 30000), 'le service worker est actif');
const n = async () => p.evaluate(async () => { let t = 0; for (const k of await caches.keys()) if (/^rayle-shell-/.test(k)) t += (await (await caches.open(k)).keys()).length; return t; });
verif(await attendre(async () => (await n()) >= 300, 90000), 'précache : ' + await n() + ' fichiers en cache (≥ 300)');
verif(await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); const rep = await fetch('sw.js', { cache: 'no-store' }); return /2026\.11\.14\.1/.test(await rep.text()) && window.RAYLE_VERSION === '2026.11.14.1'; }), 'version de la page = version du service worker');
await p.setOfflineMode(true); await p.reload({ waitUntil: 'domcontentloaded' }); await w(4000);
verif(await p.evaluate(() => !!window.Application && !!document.getElementById('g1Icones')), 'hors ligne : la page se recharge depuis le cache');
await p.evaluate(() => window.Application.ouvrir('terre')); verif(await attendre(() => p.evaluate(() => { const c = document.querySelector('#terre-mobile .tm-charge'); return !!c && c.hidden; }), 60000), 'hors ligne : la Terre mobile s\u2019affiche depuis le cache');
verif(await p.evaluate(() => { const e = document.querySelector('#terre-mobile .tm-erreur'); return !e || e.hidden; }), 'hors ligne : pas d\u2019erreur sur la Terre'); await p.evaluate(() => window.Application.fermer()); await w(1200);
await p.evaluate(() => window.Application.ouvrir('marches')); await w(9000); const t = await p.evaluate(() => (document.querySelector('#marches-fenetre') || {}).innerText || '');
verif(t.length > 150 && !/HTTP \d{3}|undefined|\[object/.test(t), 'hors ligne : Marchés s\u2019ouvre sans erreur brute (' + t.length + ' caractères)'); await p.evaluate(() => window.Application.fermer()); await w(800);
await p.evaluate(() => document.getElementById('gear').click()); await w(1000); verif(await p.evaluate(() => document.getElementById('cfg').classList.contains('open') && !!document.getElementById('raQualite')), 'hors ligne : Réglages s\u2019affichent');
verif(erreurs.length === 0, 'aucune erreur de page ' + erreurs.slice(0, 3).join(' | '));
console.log(`résultat : ${ok} vérifications, ${ko} échec(s)`); await nav.close(); process.exit(ko ? 1 : 0);
