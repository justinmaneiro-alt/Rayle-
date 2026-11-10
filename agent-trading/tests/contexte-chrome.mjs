/* Test Chrome : panneau « Ce qui fait bouger l'or », « Pourquoi l'or bouge ? », fiches « Comment lire ça » lues à voix haute, depuis l'accueil de l'appli (cadre or.html) ET la page seule.
   Le Worker de Rayle est simulé par interception (dollar, taux, ETF, mineurs, fil du monde) ; FRED, CFTC et le calendrier sont les vraies sources (ou « indisponible : raison »). */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8000'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('captures-or', { recursive: true });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
const bougies = (base, bruit) => Array.from({ length: 48 }, (_, i) => { const t = Math.floor(Date.now() / 3600e3) * 3600e3 - (47 - i) * 3600e3, c = base * (1 + (i - 24) * bruit); return { t, o: c, h: c, l: c, c, v: 0 }; });
async function ouvrir(page, url) {
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url(); if (u.startsWith('http://worker.test')) { const hdr = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }; if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: hdr });
    if (u.includes('/marche')) { const a = decodeURIComponent(u.split('actif=')[1].split('&')[0]); const b = a.includes('DX') ? bougies(105, 0.0006) : a.includes('TNX') ? bougies(4.2, 0.002) : a.includes('GLD') ? bougies(380, 0.0004) : bougies(55, 0.0004); return r.respond({ status: 200, headers: hdr, contentType: 'application/json', body: JSON.stringify({ source: 'Yahoo Finance (simulé)', bougies: b }) }); }
    if (u.includes('/actualites/fil')) return r.respond({ status: 200, headers: hdr, contentType: 'application/json', body: JSON.stringify({ sujets: [{ titre: 'Nouvelle frappe de missiles', sources: [] }, { titre: 'Sanctions renforcées contre l\'Iran', sources: [] }, { titre: 'Résultats sportifs', sources: [] }] }) });
    return r.respond({ status: 404, headers: hdr, body: 'x' }); } r.continue(); });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_worker_url', 'http://worker.test'); localStorage.setItem('rayle_worker_appareil', 'jeton-test'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); window.__dit = []; } catch (e) {} });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}
async function verifier(cadre, etiquette) {
  await cadre.waitForFunction(() => window.__or && window.__or.contexte, { timeout: 40000 }); await w(9000);
  const E = await cadre.evaluate(() => { window.speak = t => { (window.__dit ||= []).push(t); }; return { lignes: document.querySelectorAll('[data-facteur]').length, txt: document.querySelector('[data-contexte-corps]').innerText }; });
  v(E.lignes === 9, `${etiquette} : 9 facteurs affichés`); v(/Dollar/.test(E.txt) && /Taux américain/.test(E.txt) && /Taux réels/.test(E.txt) && /Fed/.test(E.txt) && /CFTC/.test(E.txt) && /ETF or/i.test(E.txt) && /Mineurs/.test(E.txt) && /géopolitique/i.test(E.txt) && /Calendrier/.test(E.txt), `${etiquette} : tous les facteurs nommés`);
  v(/effet habituel/i.test(E.txt) && /(favorable|neutre|indisponible)/i.test(E.txt), `${etiquette} : sens habituel de l'effet affiché`);
  v(await cadre.evaluate(() => { const r = window.__or.contexte.etat().facteurs; const d = r.find(f => f.id === 'dxy'); return d && d.etat === 'ok' && d.variation > 0 && d.sens.code === 'defavorable'; }), `${etiquette} : dollar mesuré (Worker simulé) et sens défavorable à l'or`);
  const t = await cadre.evaluate(async () => await window.TableauOr.commande('pourquoi l\'or bouge ?')); v(typeof t === 'string' && t.length > 80, `${etiquette} : « Pourquoi l'or bouge ? » répond (${(t || '').slice(0, 70)}…)`);
  const n = (t.match(/[.!?](\s|$)/g) || []).length; v(n >= 3 && n <= 8, `${etiquette} : quelques phrases (${n})`); v(/Interprétation/.test(t) && !/(achète|vends|ordre d)/i.test(t), `${etiquette} : faits puis interprétation, aucun ordre`);
  v((await cadre.evaluate(() => window.__dit.length)) >= 1, `${etiquette} : la réponse est dite à voix haute`);
  const f = await cadre.evaluate(async () => { window.__dit = []; const a = await window.TableauOr.commande('explique-moi le VWAP'); const b = await window.TableauOr.commande('c\'est quoi le profil de volume'); return [a, b, window.__dit.length]; }); v(/prix moyen/.test(f[0]) && /POC/.test(f[1]) && f[2] === 2, `${etiquette} : fiches lues à voix haute (VWAP, profil)`);
  await cadre.evaluate(() => { document.querySelector('.tor-couches').open = true; window.__dit = []; document.querySelector('[data-fiche-couche="cvd"]').click(); }); await w(300); v((await cadre.evaluate(() => window.__dit.length)) === 1 && !(await cadre.evaluate(() => document.querySelector('[data-couche="cvd"]').checked)), `${etiquette} : bouton « ? » d'une couche = fiche lue, sans cocher la couche`);
  v(await cadre.evaluate(() => !!document.querySelector('[data-a="pourquoi"]') && !!document.querySelector('[data-a="pourquoi-bloc"]')), `${etiquette} : boutons « Pourquoi l'or bouge ? » présents`);
}
const p1 = await nav.newPage(); await p1.setViewport({ width: 1600, height: 900 }); const err = []; p1.on('pageerror', e => err.push(e.message));
await ouvrir(p1, BASE + '/agent-trading/front/or.html'); await verifier(p1, 'page seule'); await p1.evaluate(() => document.querySelector('[data-contexte]').scrollIntoView()); await w(300); await p1.screenshot({ path: 'captures-or/contexte-or.png' });
// dans l'appli : écran Terminal, la voix de Rayle passe par window.TableauOr du parent
const p2 = await nav.newPage(); await p2.setViewport({ width: 1600, height: 900 });
await ouvrir(p2, BASE + '/index.html'); await w(3500); await p2.evaluate(() => document.getElementById('btnOuvrirTerminal').click()); await p2.waitForSelector('#vueTerminal iframe.tr-or', { timeout: 30000 });
const cadre = await (await p2.$('#vueTerminal iframe.tr-or')).contentFrame(); await verifier(cadre, 'appli (cadre)');
const viaParent = await p2.evaluate(async () => { const t = await window.TableauOr.commande('pourquoi l\'or monte ?'); return typeof t === 'string' && t.length > 80; }); v(viaParent, 'appli : la commande vocale passe par window.TableauOr du parent');
v(err.length === 0, 'aucune erreur de page : ' + err.slice(0, 2).join(' | '));
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
