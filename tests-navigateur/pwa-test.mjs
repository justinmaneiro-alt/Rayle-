// Application installable servie par le serveur Node de dist/ : manifeste, service worker, VRAI hors ligne (le serveur est arrêté), page inconnue.
// Prérequis : node build.mjs --meme-origine.  Lancer : node tests-navigateur/pwa-test.mjs
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { CHROME } from './terre-aide.mjs';
const att = ms => new Promise(r => setTimeout(r, ms)); const PORT = 8765, BASE = 'http://127.0.0.1:' + PORT;
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + String(d).slice(0, 220) : '')); };
const serveur = spawn(process.execPath, ['demarrer.mjs'], { cwd: 'dist', env: { ...process.env, PORT: String(PORT), RAYLE_TOKEN: 'essai' }, stdio: 'ignore' });
await att(1500);
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await nav.newPage(); await page.setViewport({ width: 1280, height: 800 });
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); } catch (e) {} });
const erreurs = []; page.on('pageerror', e => erreurs.push(e.message));
await page.goto(BASE + '/', { waitUntil: 'load' }); await att(3000);
const man = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); if (!l) return null; const j = await (await fetch(l.href)).json(); const icones = await Promise.all(j.icons.filter(i => i.src.endsWith('.png')).map(async i => (await fetch(i.src)).status)); return { nom: j.name, display: j.display, icones }; });
v('manifeste lié et valide (icônes présentes)', man && man.display === 'standalone' && man.icones.every(s => s === 200), JSON.stringify(man));
const sw = await page.evaluate(async () => { await navigator.serviceWorker.ready; const r = await navigator.serviceWorker.getRegistration(); return { actif: !!(r && r.active), version: Pwa.etat().version_page }; });
v('service worker enregistré et actif', sw.actif, JSON.stringify(sw));
await att(2500);
const c = await page.evaluate(async () => { const k = (await caches.keys()).find(x => x.startsWith('rayle-shell-')); const ca = await caches.open(k); const urls = (await ca.keys()).map(r => new URL(r.url).pathname); return { k, n: urls.length, manque: ['/index.html', '/offline.html', '/config.js', '/core/commun/application.js', '/core/commun/accueil-rayle.js'].filter(x => !urls.includes(x) && !(x === '/index.html' && urls.includes('/'))) }; });
v('coque en cache : fichiers de démarrage présents', c.n >= 80 && c.manque.length === 0, JSON.stringify(c));
await page.reload({ waitUntil: 'load' }); await att(2000);
v('page contrôlée par le service worker', await page.evaluate(() => !!navigator.serviceWorker.controller));
// VRAI hors ligne : on arrête le serveur
serveur.kill(); await att(1200);
const mort = await fetch(BASE + '/health').then(() => false).catch(() => true); v('serveur arrêté (hors ligne réel)', mort);
await page.reload({ waitUntil: 'load' }).catch(e => erreurs.push('reload hors ligne : ' + e.message)); await att(3000);
const hors = await page.evaluate(() => ({ carrousel: !!document.getElementById('app-car'), api: typeof Application, scripts: document.scripts.length }));
v('hors ligne : l’application démarre depuis le cache', hors.carrousel && hors.api === 'object', JSON.stringify(hors));
const inconnue = await page.evaluate(async () => { const r = await fetch('/page-jamais-vue.html'); return { s: r.status, t: (await r.text()).slice(0, 400) }; }).catch(e => ({ err: e.message }));
v('hors ligne : page jamais vue → page « hors ligne » claire', /hors ligne/i.test(inconnue.t || ''), JSON.stringify(inconnue).slice(0, 160));
const surcharge = await page.evaluate(() => document.querySelectorAll('.ar-fen').length); v('hors ligne : l’accueil s’affiche (fenêtres présentes)', surcharge >= 2, surcharge + ' fenêtres');
v('aucune erreur de script', erreurs.filter(e => !/hors ligne|Failed to fetch|NetworkError|net::/.test(e)).length === 0, erreurs.join(' | '));
await nav.close(); console.log(ok + ' OK, ' + ko + ' KO'); process.exit(ko ? 1 : 0);
