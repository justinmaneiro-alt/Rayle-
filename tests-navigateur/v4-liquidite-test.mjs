import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import { creerStockage } from '../agent-pc/flux/stockage-flux.mjs';
import { encoderEnregistrement } from '../strategies/liquidite/format-profondeur.js';

/* V4 phase 4 — la fenêtre « Carte de liquidité » dans Chrome, avec un VRAI serveur local (routes /__flux/…) et un carnet SYNTHÉTIQUE écrit sur le disque (un mur vendeur vers +0,4 %, un mur acheteur qui apparaît puis
   disparaît), puis le mode DIRECT avec un faux WebSocket (Kraken + Binance) et de fausses réponses REST. Vérifie : la fenêtre s'ouvre, la carte est PEINTE (pixels de chaleur), les murs et « Où va le marché ? »
   s'affichent, la relecture rejoue le passé, le mode direct marche sans service, la tablette ne déborde pas, aucune erreur console. Captures : docs/captures-v4/. */
const T = compteur(), PORT = 8147, BASE = 'http://127.0.0.1:' + PORT, BASE2 = 'http://127.0.0.1:' + (PORT + 2);
fs.mkdirSync('docs/captures-v4', { recursive: true });
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'liq-pc-')), vide = fs.mkdtempSync(path.join(os.tmpdir(), 'liq-vide-'));

/* ── carnet synthétique : 15 minutes, jusqu'à maintenant ── */
const maintenant = Date.now(), fin = Math.floor(maintenant / 1000) - 1, SECONDES = 900, N = 150, entete = { nTranches: N, pasPct: 0.02, unite: 1000 }, MID = 81000;
const flux = path.join(dossier, 'flux'); fs.mkdirSync(flux, { recursive: true });
const st = creerStockage({ dossier: flux, tamponMs: 0 }); let g = 5; const alea = () => (g = (g * 16807) % 2147483647) / 2147483647;
for (let k = 0; k < SECONDES; k++) {
  const tSec = fin - SECONDES + 1 + k, tMs = tSec * 1000, mid = MID + Math.sin(k / 40) * 25, bid = new Float64Array(N), ask = new Float64Array(N);
  for (let j = 0; j < N; j++) { bid[j] = 20000 * (0.5 + alea()); ask[j] = 20000 * (0.5 + alea()); }
  const decal = Math.round((Math.sin(k / 40) * 25) / (mid * 0.0002));   // le mur est en prix ABSOLU : sa tranche bouge avec le milieu
  const jAsk = Math.max(1, Math.min(N - 3, 20 - decal)); for (let d = -1; d <= 1; d++) ask[jAsk + d] = 3e6;                                           // mur vendeur ≈ +0,4 %
  if (k > 400 && k < 700) { const jb = Math.max(1, Math.min(N - 3, 15 + decal)); for (let d = -1; d <= 1; d++) bid[jb + d] = 2.5e6; }               // mur acheteur ≈ −0,3 %, retiré ensuite
  st.ecrireProfondeur('binance-spot-BTC', tMs, encoderEnregistrement(tSec, { meilleurBid: mid - 0.5, meilleurAsk: mid + 0.5, couvBasPct: 3, couvHautPct: 3, bid, ask }, entete), entete);
  st.ecrireProfondeur('kraken-BTC', tMs, encoderEnregistrement(tSec, { meilleurBid: mid - 1, meilleurAsk: mid + 1, couvBasPct: 3, couvHautPct: 3, bid, ask }, entete), entete);
  const achat = alea() < 0.3 ? 20000 + alea() * 300000 : 0, vente = alea() < 0.3 ? 20000 + alea() * 300000 : 0;
  if (achat || vente) st.ecrireLigne('trades', 'binance-spot-BTC', tMs, { t: tMs, n: 3, achatUsd: achat, venteUsd: vente, cloture: mid, deltaUsd: achat - vente });
}
st.vider();
fs.writeFileSync(path.join(flux, 'etat-flux.json'), JSON.stringify({ pid: process.pid, vivantLe: Date.now(), demarreLe: Date.now() - SECONDES * 1000, premierEnregistrement: { 'binance-spot-BTC': Date.now() - SECONDES * 1000 }, flux: { 'binance-spot-BTC': { pret: true } }, erreurs: [] }));

const lancer = (port, dos) => spawn(process.execPath, ['serveur.mjs', String(port)], { env: { ...process.env, RAYLE_AGENT_DOSSIER: dos, RAYLE_PORT_RESEAU: String(port + 1) }, stdio: 'ignore' });
const srv = lancer(PORT, dossier), srv2 = lancer(PORT + 2, vide);
for (const b of [BASE, BASE2]) for (let k = 0; k < 50; k++) { try { if ((await fetch(b + '/index.html')).ok) break; } catch (e) { /* démarrage */ } await attendre(200); }

/* faux WebSocket pour le mode direct : Kraken (instantané puis mises à jour) et Binance (différences chaînées + transactions) */
const FAUX_WS = () => {
  window.__ws = [];
  window.WebSocket = class {
    constructor(url) { this.url = url; this.readyState = 0; window.__ws.push(this); setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); this.demarrer(); }, 30); }
    send(m) { this.dernierEnvoi = m; } close() { this.readyState = 3; clearInterval(this.iv); setTimeout(() => this.onclose && this.onclose(), 1); }
    emit(o) { this.onmessage && this.onmessage({ data: JSON.stringify(o) }); }
    demarrer() {
      const kr = /kraken/.test(this.url), fut = /fstream/.test(this.url); let u = fut ? 2000 : 1000, k = 0; const mid = 100, sym = 'btcusdt';
      if (kr) { this.emit({ channel: 'book', type: 'snapshot', data: [{ symbol: 'BTC/USD', bids: Array.from({ length: 200 }, (_, i) => ({ price: +(mid - 0.01 * (i + 1)).toFixed(2), qty: 5 })), asks: Array.from({ length: 200 }, (_, i) => ({ price: +(mid + 0.01 * (i + 1)).toFixed(2), qty: 5 })) }] }); }
      this.iv = setInterval(() => {
        k++; if (kr) { this.emit({ channel: 'book', type: 'update', data: [{ symbol: 'BTC/USD', bids: [{ price: 99.6, qty: 3000 + (k % 5) * 10 }], asks: [{ price: 100.4, qty: 2500 }] }] }); this.emit({ channel: 'trade', type: 'update', data: [{ symbol: 'BTC/USD', side: k % 2 ? 'buy' : 'sell', qty: 40 + k % 7, price: 100 + (k % 3) * 0.01 }] }); return; }
        const U = u + 1; u = U; const ev = { e: 'depthUpdate', E: Date.now(), s: 'BTCUSDT', U, u: U, b: [[(99.6).toFixed(2), String(3000 + (k % 5) * 10)]], a: [[(100.4).toFixed(2), '2500']] }; if (fut) ev.pu = U - 1;
        this.emit({ stream: sym + '@depth@100ms', data: ev }); this.emit({ stream: sym + '@aggTrade', data: { e: 'aggTrade', E: Date.now(), s: 'BTCUSDT', p: '100.01', q: '50', T: Date.now(), m: k % 2 === 0 } });
      }, 100);
    }
  };
};
const jsonCors = o => ({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) });
const klines = () => { const out = [], t0 = Math.floor(Date.now() / 900000) * 900000 - 999 * 900000; for (let i = 0; i < 1000; i++) { const c = 100 + Math.sin(i / 30) * 1.5; out.push([t0 + i * 900000, String(c), String(c + 0.4), String(c - 0.4), String(c + 0.05), '1000', 0, '100000', 100, '480', '48000', '0']); } return out; };

async function ouvrir({ base, largeur, hauteur, tactile = false, fauxDirect = false }) {
  const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await nav.newPage(); await page.setViewport({ width: largeur, height: hauteur, hasTouch: tactile, isMobile: tactile, deviceScaleFactor: 1 });
  const erreurs = []; page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 300))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|CORS|net::/.test(m.text())) erreurs.push(m.text().slice(0, 300)); });
  if (fauxDirect) {
    await page.setRequestInterception(true);
    page.on('request', r => { const u = r.url();
      if (/api\/v3\/depth/.test(u)) return r.respond(jsonCors({ lastUpdateId: 1000, bids: Array.from({ length: 300 }, (_, i) => [(100 - 0.01 * (i + 1)).toFixed(2), '5']), asks: Array.from({ length: 300 }, (_, i) => [(100 + 0.01 * (i + 1)).toFixed(2), '5']) }));
      if (/fapi\/v1\/depth/.test(u)) return r.respond(jsonCors({ lastUpdateId: 2000, bids: Array.from({ length: 300 }, (_, i) => [(100 - 0.01 * (i + 1)).toFixed(2), '5']), asks: Array.from({ length: 300 }, (_, i) => [(100 + 0.01 * (i + 1)).toFixed(2), '5']) }));
      if (/klines/.test(u)) return r.respond(jsonCors(klines()));
      if (/premiumIndex/.test(u)) return r.respond(jsonCors({ lastFundingRate: '0.0001', markPrice: '100', indexPrice: '100', nextFundingTime: 1 }));
      if (/openInterest/.test(u)) return r.respond(jsonCors({ openInterest: '1000' })); if (/LongShort/.test(u)) return r.respond(jsonCors([{ longShortRatio: '1.2', longAccount: '0.55' }]));
      r.continue();
    });
    await page.evaluateOnNewDocument(FAUX_WS);
  }
  await page.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); });
  await page.goto(base + '/index.html', { waitUntil: 'load' }); await attendre(1200);
  return { nav, page, erreurs };
}
const pixels = page => page.evaluate(() => { const c = document.querySelector('.lq canvas'); if (!c) return null; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let chaud = 0, blanc = 0, vert = 0, rouge = 0, total = 0; for (let i = 0; i < d.length; i += 16) { total++; const r = d[i], gg = d[i + 1], b = d[i + 2]; if (b > 90 && b > r + 40) chaud++; if (r > 230 && gg > 230 && b > 230) blanc++; if (gg > 150 && r < 90 && b < 140) vert++; if (r > 200 && gg < 120 && b < 130) rouge++; } return { chaud, blanc, vert, rouge, total }; });

/* ══════════ 1. SERVICE PC ══════════ */
{
  let { nav, page, erreurs } = await ouvrir({ base: BASE, largeur: 1500, hauteur: 950 });
  await page.evaluate(async () => { const M = await import('/planetes/mars/pc/liquidite/fenetre-liquidite.js'); await M.ouvrirCarte({ actif: 'BTC', flux: 'binance-spot' }); });
  await page.waitForSelector('.lq canvas', { timeout: 15000 }); await attendre(3500);
  const ev = (f, ...a) => page.evaluate(f, ...a), txt = s => ev(sel => (document.querySelector(sel) || {}).textContent || '', s);
  T.verifier('la fenêtre « Carte de liquidité » s’ouvre (moteur de fenêtres commun)', await ev(() => !!document.querySelector('.pn.lq-fenetre .lq') && /CARTE DE LIQUIDITÉ/.test(document.querySelector('.pn.lq-fenetre .pn-tete').textContent)));
  T.verifier('source : le service PC (carnet enregistré)', await ev(() => document.querySelector('[data-puce="source"]').dataset.etat === 'pc'), await txt('[data-puce="source"]'));
  const e1 = await ev(() => window.CarteLiquidite.api().etat());
  T.verifier('les secondes enregistrées sont lues (≈ 600 dans la fenêtre de 10 min)', e1.secondes >= 580, JSON.stringify({ s: e1.secondes, err: e1.erreur }));
  const px = await pixels(page);
  T.verifier('la carte de chaleur est PEINTE (pixels de chaleur, ligne de prix)', px && px.chaud > px.total * 0.01 && px.blanc > 20, JSON.stringify(px));
  T.verifier('une analyse est affichée : murs repérés, au moins un mur vendeur actif', await ev(() => { const a = window.CarteLiquidite.api().analyse(); return !!a && a.murs.some(m => m.cote === 'ask' && m.actif); }));
  T.verifier('« Où va le marché ? » : trois lignes dont « Hypothèse, pas une promesse »', await ev(() => { const l = [...document.querySelectorAll('.lq-ou-l li')]; return l.length === 3 && /Hypothèse, pas une promesse/.test(l[2].textContent) && /Prochain aimant/.test(l[0].textContent); }), await txt('.lq-ou-l'));
  T.verifier('les murs actifs sont listés avec leur fiabilité', await ev(() => document.querySelectorAll('.lq-murs-l li').length >= 1 && /acheteur|vendeur/.test(document.querySelector('.lq-murs-l').textContent)), await txt('.lq-murs-l'));
  T.verifier('les limites honnêtes sont visibles (carnet de moins de 14 jours, pas d’historique gratuit, aucun ordre)', /preuve insuffisante avant 14 jours/.test(await txt('.lq-etat-l')) && /leurres/.test(await txt('.lq-pied')) && /Aucun ordre/.test(await txt('.lq-pied')));
  T.verifier('le profil de volume non disponible est DIT (pas de bougies dans ce dossier de test)', /Profil de volume : indisponible/.test(await txt('.lq-etat-l')));
  await page.screenshot({ path: 'docs/captures-v4/carte-direct-pc.png' });
  // options, zoom
  await page.select('[data-k="zoom"]', '1'); await attendre(500); T.verifier('le zoom prix change (±1 %)', await ev(() => window.CarteLiquidite.api().etat().pct === 1));
  await ev(() => { const c = document.querySelector('[data-o="bulles"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await attendre(400);
  T.verifier('on peut cacher les bulles', await ev(() => window.CarteLiquidite.api().etat().options.bulles === false));
  await ev(() => { const c = document.querySelector('[data-o="bulles"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }); await page.select('[data-k="zoom"]', '0.5');
  // flux Kraken
  await page.select('[data-k="flux"]', 'kraken'); await attendre(3000); T.verifier('on change de flux (Kraken) : les données du nouveau flux sont lues', await ev(() => { const e = window.CarteLiquidite.api().etat(); return e.flux === 'kraken' && e.secondes > 500; }), JSON.stringify(await ev(() => window.CarteLiquidite.api().etat().secondes)));
  await page.select('[data-k="flux"]', 'binance-spot'); await attendre(2500);
  // marquer un exemple
  await ev(() => document.querySelector('[data-a="achat"]').click()); await attendre(300);
  T.verifier('« J’aurais acheté ici » note un exemple (gardé pour Kepler, jamais pour valider)', await ev(() => JSON.parse(localStorage.getItem('rayle_lq_exemples') || '[]').length === 1) && /exemple\(s\) noté/.test(await txt('.lq-marques-n')));
  // relecture
  await ev(() => document.querySelector('.lq-modes [data-mode="relecture"]').click()); await attendre(3500);
  T.verifier('relecture : la barre de lecture apparaît, un moment passé est chargé', await ev(() => { const e = window.CarteLiquidite.api().etat(); return e.mode === 'relecture' && !document.querySelector('.lq-rel').hidden && e.tCurseur < Date.now() - 60000 && e.secondes > 100; }), JSON.stringify(await ev(() => { const e = window.CarteLiquidite.api().etat(); return { m: e.mode, s: e.secondes }; })));
  const t0 = await ev(() => window.CarteLiquidite.api().etat().tCurseur); await ev(() => document.querySelector('[data-a="lecture"]').click()); await page.select('[data-k="vitesse"]', '30'); await attendre(1800);
  const t1 = await ev(() => window.CarteLiquidite.api().etat().tCurseur); T.verifier('relecture : « lecture » fait avancer le temps (vitesse 30×)', t1 - t0 > 20000, (t1 - t0) + ' ms');
  await ev(() => document.querySelector('[data-a="lecture"]').click());
  await ev(() => { const s = document.querySelector('[data-k="curseur"]'); s.value = '300'; s.dispatchEvent(new Event('input', { bubbles: true })); }); await attendre(1500);
  T.verifier('relecture : le curseur déplace dans le passé et la carte est repeinte', await ev(() => window.CarteLiquidite.api().etat().tCurseur < Date.now() - 300000) && (await pixels(page)).chaud > 50);
  await page.screenshot({ path: 'docs/captures-v4/carte-relecture.png' });
  await ev(() => document.querySelector('.lq-modes [data-mode="direct"]').click()); await attendre(1500);
  T.verifier('retour en direct', await ev(() => window.CarteLiquidite.api().etat().mode === 'direct' && document.querySelector('.lq-rel').hidden));
  // la route locale refuse l'écriture et les paramètres invalides
  const r405 = await ev(async () => (await fetch('/__flux/statut', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rayle-Multi': '1' }, body: '{}' })).status), r400 = await ev(async () => (await fetch('/__flux/profondeur?cle=../../etc')).status), r404 = await ev(async () => (await fetch('/__flux/inconnue')).status);
  T.verifier('routes /__flux : lecture seule (405), clé invalide refusée (400), route inconnue (404)', r405 === 405 && r400 === 400 && r404 === 404, JSON.stringify([r405, r400, r404]));
  const ex = await ev(async () => (await (await fetch('/__flux/plage?cle=binance-spot-BTC')).json()).plage);
  T.verifier('la plage rejouable est celle de l’enregistrement', ex && ex.fin - ex.debut > 800000, JSON.stringify(ex));
  await ev(() => window.CarteLiquidite.fermer()); await attendre(500); T.verifier('fermeture propre (plus de fenêtre, plus de boucles)', await ev(() => !document.querySelector('.lq') && !window.CarteLiquidite.ouverte()));
  T.verifier('aucune erreur console (service PC)', erreurs.length === 0, erreurs.join(' | ').slice(0, 300));
  await nav.close();
}
/* ══════════ 2. TABLETTE (service PC) : mise en page, pas de débordement ══════════ */
{
  const { nav, page, erreurs } = await ouvrir({ base: BASE, largeur: 820, hauteur: 1180, tactile: true });
  await page.evaluate(async () => { const M = await import('/planetes/mars/pc/liquidite/fenetre-liquidite.js'); await M.ouvrirCarte({ actif: 'BTC' }); });
  await page.waitForSelector('.lq canvas', { timeout: 15000 }); await attendre(3000);
  const m = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth, carte: document.querySelector('.lq-carte').getBoundingClientRect().height, cw: document.querySelector('.lq canvas').clientWidth }));
  T.verifier('tablette : pas de défilement horizontal, la carte a une vraie hauteur', m.sw <= m.iw + 1 && m.carte > 200 && m.cw > 300, JSON.stringify(m));
  T.verifier('tablette : la carte est peinte', (await pixels(page)).chaud > 20);
  await page.screenshot({ path: 'docs/captures-v4/carte-tablette.png' });
  T.verifier('tablette : aucune erreur console', erreurs.length === 0, erreurs.join(' | ').slice(0, 200)); await nav.close();
}
/* ══════════ 3. TÉLÉPHONE ══════════ */
{
  const { nav, page, erreurs } = await ouvrir({ base: BASE, largeur: 390, hauteur: 800, tactile: true });
  await page.evaluate(async () => { const M = await import('/planetes/mars/pc/liquidite/fenetre-liquidite.js'); await M.ouvrirCarte({ actif: 'BTC' }); });
  await page.waitForSelector('.lq canvas', { timeout: 15000 }); await attendre(3000);
  const m = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth, cw: document.querySelector('.lq canvas').clientWidth }));
  T.verifier('téléphone : pas de défilement horizontal, carte lisible', m.sw <= m.iw + 1 && m.cw > 250, JSON.stringify(m)); T.verifier('téléphone : la carte est peinte', (await pixels(page)).chaud > 10);
  await page.screenshot({ path: 'docs/captures-v4/carte-telephone.png' }); T.verifier('téléphone : aucune erreur console', erreurs.length === 0, erreurs.join(' | ').slice(0, 200)); await nav.close();
}
/* ══════════ 4. DIRECT (aucun service) : faux WebSocket + fausses réponses REST ══════════ */
{
  const { nav, page, erreurs } = await ouvrir({ base: BASE2, largeur: 1400, hauteur: 900, fauxDirect: true });
  await page.evaluate(async () => { const M = await import('/planetes/mars/pc/liquidite/fenetre-liquidite.js'); await M.ouvrirCarte({ actif: 'BTC', flux: 'binance-spot' }); });
  await page.waitForSelector('.lq canvas', { timeout: 15000 }); await attendre(9000);
  const ev = (f, ...a) => page.evaluate(f, ...a), txt = s => ev(sel => (document.querySelector(sel) || {}).textContent || '', s);
  T.verifier('direct : source = navigateur (pas de service PC)', await ev(() => document.querySelector('[data-puce="source"]').dataset.etat === 'directe'), await txt('[data-puce="source"]'));
  T.verifier('direct : le message explique « direct seulement, pas d’historique »', /DIRECTE/.test(await txt('.lq-note')) && /pas d’historique/.test(await txt('.lq-note')), await txt('.lq-note'));
  const e = await ev(() => window.CarteLiquidite.api().etat());
  T.verifier('direct : les trois connexions (Binance comptant, futures, Kraken) sont ouvertes et le carnet arrive', await ev(() => window.__ws.length >= 3 && window.__ws.some(w => /kraken/.test(w.url)) && window.__ws.some(w => /fstream/.test(w.url))) && e.secondes >= 3, JSON.stringify({ s: e.secondes, err: e.erreur }));
  const px = await pixels(page); T.verifier('direct : la carte est peinte', px && px.chaud > 5, JSON.stringify(px));
  T.verifier('direct : une analyse locale est produite (mur détecté à ± 0,4 % dès que le temps le permet, sinon « en attente »)', await ev(() => { const a = window.CarteLiquidite.api().analyse(); return !!a && a.sources.carnet.ok; }));
  T.verifier('direct : la relecture est refusée proprement (pas d’historique)', await (async () => { await ev(() => document.querySelector('.lq-modes [data-mode="relecture"]').click()); await attendre(800); return await ev(() => window.CarteLiquidite.api().etat().mode === 'direct') && /historique/.test(await txt('.lq-msg')); })());
  await page.screenshot({ path: 'docs/captures-v4/carte-direct-navigateur.png' });
  T.verifier('direct : aucune erreur console', erreurs.length === 0, erreurs.join(' | ').slice(0, 300)); await nav.close();
}
srv.kill(); srv2.kill(); fs.rmSync(dossier, { recursive: true, force: true }); fs.rmSync(vide, { recursive: true, force: true });
T.fin();
