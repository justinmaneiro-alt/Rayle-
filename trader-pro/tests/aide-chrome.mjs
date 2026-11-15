/* Aide commune des tests Chrome « pro ». Prérequis : node serveur.mjs 8000 ; node outils-donnees/serveur-snapshots.mjs <dossier> 8801.
   const T = await lancer('tel'|'tablette'|'pc'); … T.fin() */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
export const w = ms => new Promise(r => setTimeout(r, ms));
const VUES = { tel: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, tablette: { width: 1024, height: 768, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, pc: { width: 1600, height: 900, deviceScaleFactor: 1 } };
export async function lancer(mode = 'tel', { stockage = {}, dossierCaptures = 'donnees-privees/captures-test', interception = null } = {}) {
  const sortie = path.resolve(dossierCaptures); fs.mkdirSync(sortie, { recursive: true });
  let ok = 0, ko = 0; const verif = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
  const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--host-resolver-rules=MAP rayle.test 127.0.0.1'] });
  const p = await nav.newPage(); await p.setViewport(VUES[mode]); if (mode !== 'pc') await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36');
  const erreurs = []; p.on('pageerror', e => erreurs.push(String(e.stack || e.message).replace(/\s+/g, ' ').slice(0, 420))); p.on('console', async m => { if (m.type() === 'error') { let t = m.text(); try { const L = await Promise.all(m.args().map(h => h.evaluate(e => (e && (e.stack || e.message)) || String(e)).catch(() => ''))); if (L.some(Boolean)) t += ' ' + L.join(' | '); } catch (e) { /* */ } erreurs.push('console: ' + t.replace(/\s+/g, ' ').slice(0, 400)); } });
  await p.evaluateOnNewDocument(s => { try { localStorage.setItem('rayle_donnees_base', 'http://127.0.0.1:8801/'); localStorage.setItem('rayle_m_sw', '0'); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) { /* */ } }, stockage);
  await p.setRequestInterception(true);
  p.on('request', async r => {
    const u = r.url(); if (interception && await interception(r, u)) return;
    if (!u.includes('.workers.dev')) return r.continue();
    if (u.includes('//rayle.justinmaneiro.workers.dev/chat')) return r.respond({ status: r.method() === 'OPTIONS' ? 204 : 503, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'content-type': 'application/json' }, body: r.method() === 'OPTIONS' ? '' : '{"error":"Worker de test"}' });
    if (u.includes('//rayle.justinmaneiro.workers.dev/health')) return r.respond({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, service: 'rayle', cible: 'cloudflare' }) });
    try { const x = await fetch(u, { headers: { origin: 'https://justinmaneiro-alt.github.io' }, signal: AbortSignal.timeout(12000) }); r.respond({ status: x.status, headers: { 'access-control-allow-origin': '*', 'content-type': x.headers.get('content-type') || 'application/json' }, body: Buffer.from(await x.arrayBuffer()) }); } catch (e) { r.abort('failed'); }
  });
  const attendre = async (f, ms = 20000, pas = 250) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await w(pas); } return false; };
  const texte = s => p.evaluate(s2 => (document.querySelector(s2) || {}).innerText || '', s);
  await p.goto('http://rayle.test:8000/index.html', { waitUntil: 'domcontentloaded' }); await w(4000);
  const capture = async nom => p.screenshot({ path: path.join(sortie, `${nom}-${mode}.png`) });
  const fin = async () => {
    const graves = erreurs.filter(e => !/allorigins|favicon|ERR_NAME_NOT_RESOLVED|ERR_BLOCKED|Failed to load resource|net::|Unrecognized feature|manifest|service worker|ServiceWorker/i.test(e));
    if (graves.length) { console.log('  erreurs de console :'); [...new Set(graves)].slice(0, 12).forEach(e => console.log('   · ' + e)); } verif(graves.length === 0, 'aucune erreur JavaScript');
    console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tout passe (${ok})`); await nav.close(); process.exit(ko ? 1 : 0);
  };
  return { p, nav, verif, attendre, texte, capture, fin, w, erreurs };
}
