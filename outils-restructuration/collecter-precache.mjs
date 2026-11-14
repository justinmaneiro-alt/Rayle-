/* Collecte les fichiers du site réellement utilisés par un parcours complet (accueil, terminal, marchés avec couverture, Terre mobile, atlas d'anatomie, réglages) et écrit precache.json :
   { version, coeur: [...] (petits fichiers, installés avec la coque), lourd: [...] (textures et gros fichiers, installés ensuite en arrière-plan) }.
   Prérequis : node serveur.mjs 8000 ; node outils-donnees/serveur-snapshots.mjs <snapshots> 8801.  Usage : node outils-restructuration/collecter-precache.mjs */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core'); const w = ms => new Promise(r => setTimeout(r, ms));
const HOTE = 'http://rayle.test:8000', nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--host-resolver-rules=MAP rayle.test 127.0.0.1'] });
const p = await nav.newPage(); await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'); await p.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const vus = new Map(); await p.setRequestInterception(true);
p.on('request', async r => { const u = r.url(); if (/^http:\/\/rayle\.test/.test(u)) { try { const x = new URL(u); if (r.method() === 'GET') vus.set(x.pathname.replace(/^\//, ''), 0); } catch (e) { /* */ } return r.continue(); } if (/^(data:|blob:|http:\/\/127\.0\.0\.1)/.test(u) || r.method() !== 'GET') return r.continue();
  try { const x = await fetch(u, { signal: AbortSignal.timeout(15000) }); r.respond({ status: x.status, headers: { 'access-control-allow-origin': '*', 'content-type': x.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await x.arrayBuffer()) }); } catch (e) { r.abort('failed'); } });
await p.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_donnees_base', 'http://127.0.0.1:8801/'); localStorage.setItem('rayle_m_sw', '0'); } catch (e) { /* */ } });
await p.goto(HOTE + '/index.html', { waitUntil: 'domcontentloaded' }); await w(6000);
const ouvrir = async (id, att) => { await p.evaluate(i => window.Application.ouvrir(i), id); await w(att); await p.evaluate(() => window.Application.fermer()); await w(1500); };
await ouvrir('terminal', 14000);
await p.evaluate(() => window.Application.ouvrir('marches')); await w(6000);
await p.evaluate(() => { for (const d of document.querySelectorAll('#marches-fenetre details[data-s]')) d.open = true; }); await w(9000);
for (const v of ['couv', 'port', 'jour', 'perf', 'src']) { await p.evaluate(v => { const b = document.querySelector(`#marches-fenetre [data-v="${v}"]`); b && b.click(); }, v); await w(1200); }
await p.evaluate(() => window.Application.fermer()); await w(1500);
await ouvrir('terre', 9000); await ouvrir('anatomie', 7000);
await p.evaluate(() => document.getElementById('gear').click()); await w(1500);
const tout = [...vus.keys()].filter(k => k && !/^__|^assets-lourds|^tts|^evenements|^actualites|^captures|^docs\//.test(k) && !/\.(map|log)$/.test(k));
const taille = k => { try { return fs.statSync(k).size; } catch (e) { return -1; } };
const L = tout.map(k => [k, taille(k)]).filter(([, t]) => t >= 0), coeur = L.filter(([, t]) => t <= 700 * 1024).map(([k]) => k).sort(), lourd = L.filter(([, t]) => t > 700 * 1024).map(([k]) => k).sort();
const gros = k => /\/terre\/mobile\/textures\//.test(k);
const out = { version: '2026.11.14.2', coeur, lourd, genere: new Date().toISOString().slice(0, 10) };
fs.writeFileSync('precache.json', JSON.stringify(out)); console.log('coeur', coeur.length, 'fichiers', Math.round(coeur.reduce((s, k) => s + taille(k), 0) / 1024), 'Ko ; lourd', lourd.length, lourd.map(k => k + ' ' + Math.round(taille(k) / 1024) + 'Ko').join(', '));
await nav.close();
