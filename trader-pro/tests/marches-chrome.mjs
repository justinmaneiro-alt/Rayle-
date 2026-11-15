/* Test Chrome de la fenêtre Marchés pro. Prérequis : node serveur.mjs 8000 ; node outils-donnees/serveur-snapshots.mjs <dossier avec pro-*.json> 8801.
   Usage : node trader-pro/tests/marches-chrome.mjs [tel|tablette|pc] [dossier-captures] */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const mode = process.argv[2] || 'tel', sortie = path.resolve(process.argv[3] || 'donnees-privees/captures-test'); fs.mkdirSync(sortie, { recursive: true });
const HOTE = 'http://rayle.test:8000', w = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0; const verif = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const VUES = { tel: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, tablette: { width: 1024, height: 768, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, pc: { width: 1600, height: 900, deviceScaleFactor: 1 } };
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--host-resolver-rules=MAP rayle.test 127.0.0.1'] });
const p = await nav.newPage(); await p.setViewport(VUES[mode]); if (mode !== 'pc') await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36');
const erreurs = [], reseau = []; p.on('pageerror', e => erreurs.push(String(e.stack || e.message).replace(/s+/g, ' ').slice(0, 420))); p.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text().slice(0, 200)); });
p.on('requestfailed', r => reseau.push(r.url().slice(0, 100)));
await p.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_donnees_base', 'http://127.0.0.1:8801/'); localStorage.setItem('rayle_m_sw', '0'); localStorage.removeItem('tp_onglet'); } catch (e) { /* */ } });
/* le Worker de Rayle et le relais de l'or n'autorisent que l'origine publiée : on les relaie avec cette origine, et on simule la santé du Worker principal */
await p.setRequestInterception(true);
p.on('request', async r => {
  const u = r.url(); if (!u.includes('.workers.dev')) return r.continue();
  if (u.includes('//rayle.justinmaneiro.workers.dev/health')) return r.respond({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, service: 'rayle', cible: 'cloudflare' }) });
  try { const x = await fetch(u, { headers: { origin: 'https://justinmaneiro-alt.github.io' }, signal: AbortSignal.timeout(12000) }); r.respond({ status: x.status, headers: { 'access-control-allow-origin': '*', 'content-type': x.headers.get('content-type') || 'application/json' }, body: Buffer.from(await x.arrayBuffer()) }); } catch (e) { r.abort('failed'); }
});
const attendre = async (f, ms = 20000, pas = 250) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await w(pas); } return false; };
const texte = s => p.evaluate(s2 => (document.querySelector(s2) || {}).innerText || '', s);
await p.goto(HOTE + '/index.html', { waitUntil: 'domcontentloaded' }); await w(4000);
await p.evaluate(() => window.Application.ouvrir('marches'));
verif(await attendre(() => p.evaluate(() => !!document.querySelector('#marches-fenetre .tp-nav'))), 'la fenêtre Marchés s’ouvre');
console.log('— navigation unique —');
verif(await p.evaluate(() => document.querySelectorAll('#marches-fenetre nav').length === 1 && document.querySelectorAll('#marches-fenetre details').length === 0), 'une seule navigation, aucune liste dépliante en double');
verif(await p.evaluate(() => { const n = document.querySelector('#marches-fenetre .tp-nav'); return n.scrollWidth <= n.clientWidth + 1; }), 'la barre d’onglets ne déborde pas');
verif(await p.evaluate(() => [...document.querySelectorAll('#marches-fenetre .tp-nav button')].every(b => { const r = b.getBoundingClientRect(); return r.right <= visualViewport.width + 1 && r.left >= -1; })), 'aucun onglet coupé');
for (const k of ['aujourdhui', 'actifs', 'cot', 'macro', 'actualite', 'alertes']) {
  console.log('— onglet ' + k + ' —');
  await p.evaluate(k2 => document.querySelector(`#marches-fenetre [data-onglet="${k2}"]`).click(), k);
  const fini = await attendre(() => p.evaluate(() => { const z = document.querySelector('#marches-fenetre .tp-onglet'); return !!z && z.innerText.length > 80 && !/Lecture des données…/.test(z.innerText); }), 25000);
  verif(fini, k + ' : plus aucun « Lecture des données… » après 25 s'); await w(1500);
  verif(await p.evaluate(() => document.documentElement.scrollWidth <= visualViewport.width + 1 && document.querySelector('#marches-fenetre .tp-corps').scrollWidth <= document.querySelector('#marches-fenetre .tp-corps').clientWidth + 1), k + ' : pas de défilement horizontal');
  const t = await texte('#marches-fenetre .tp-onglet'); if (/indisponible|impossible|pas pu/i.test(t)) console.log('  ℹ ' + k + ' : message d’erreur affiché : ' + (t.match(/[^\n]*(indisponible|impossible|pas pu)[^\n]*/i) || [''])[0].slice(0, 160));
  await p.screenshot({ path: path.join(sortie, `marches-${k}-${mode}.png`) });
  await p.evaluate(() => { const c = document.querySelector('#marches-fenetre .tp-corps'); c.scrollTop = c.scrollHeight * 0.45; }); await w(500); await p.screenshot({ path: path.join(sortie, `marches-${k}-${mode}-bas.png`) });
}
console.log('— onglet actifs : changer d’actif et d’unité —');
await p.evaluate(() => document.querySelector('#marches-fenetre [data-onglet="actifs"]').click()); await w(2500);
for (const a of ['btc', 'us100']) { await p.evaluate(a2 => document.querySelector(`#marches-fenetre [data-actif="${a2}"]`).click(), a); verif(await attendre(() => p.evaluate(() => !!document.querySelector('#marches-fenetre .tp-graph canvas')), 15000), a + ' : graphique dessiné'); }
for (const tf of ['H1', 'H4', 'J']) { await p.evaluate(t2 => document.querySelector(`#marches-fenetre [data-tf="${t2}"]`).click(), tf); await w(1200); verif(await p.evaluate(() => !!document.querySelector('#marches-fenetre .tp-graph canvas')), tf + ' : graphique dessiné'); }
console.log('— prix de l’or unique —');
verif(/Or\s*[\d\s  ,.]+/.test(await texte('#marches-fenetre [data-or]')), 'prix de l’or dans l’en-tête : ' + (await texte('#marches-fenetre [data-or]')).replace(/\s+/g, ' '));
console.log('— fermeture —'); await p.evaluate(() => window.Application.fermer()); await w(1500);
verif(await p.evaluate(() => !document.querySelector('#marches-fenetre')), 'la fenêtre se ferme proprement');
const graves = erreurs.filter(e => !/favicon|ERR_NAME_NOT_RESOLVED|ERR_BLOCKED|Failed to load resource|net::|Unrecognized feature|manifest|service worker|ServiceWorker/i.test(e)); if (graves.length) { console.log('  erreurs de console :'); [...new Set(graves)].slice(0, 12).forEach(e => console.log('   · ' + e)); }
verif(graves.length === 0, 'aucune erreur JavaScript');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tout passe (${ok})`); await nav.close(); process.exit(ko ? 1 : 0);
