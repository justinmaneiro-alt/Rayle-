// V17 : graphique navigable (molette, glisser), zones SL / TP alignées sur les prix, tableau d'historique sous le graphique.
// Vrai serveur local ; la vue du mode Trader est une FIXTURE de test (trades synthétiques, jamais présentés comme réels).
//   node tests-navigateur/v17-graphique-test.mjs        captures : docs/captures-v17/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { CHROME, attendre, compteur } from './terre-aide.mjs';

const T = compteur(), PORT = 8167, BASE = 'http://127.0.0.1:' + PORT, maintenant = Date.now();
fs.mkdirSync('docs/captures-v17', { recursive: true });
const vue = JSON.parse(fs.readFileSync('tests-navigateur/fixtures/volume-vue.json', 'utf8')), m15 = vue.actifs.SOL.m15.bougies, tM = m15.at(-1)[0], pm = m15.at(-1)[4], PAS = 900e3;
vue.actifs.SOL.positions = [];
const t = (id, statut, extra) => ({ id, actif: 'SOL', tf: 'M15', nom: 'Test', sens: 1, entree: pm * 0.99, stop: pm * 0.98, cible1: pm * 1.01, tSignal: tM - 40 * PAS, t: tM - 40 * PAS, statut, ...extra });
const barres = m15.slice(-90).map(b => [b[0], b[1], b[2], b[3], b[4], 1]);   // bougies du mode Trader : les 90 dernières M15 réelles de la fixture
const trader = () => ({ ok: true, version: 12, t: maintenant, reglages: { risquePct: 1 }, bougies: { SOL: barres }, bilan: { tous: { stats: { n: 3, total: 2.5 } } },
  actives: [t('ouv', 'ouverte', { tEntree: tM - 10 * PAS, tSignal: tM - 12 * PAS, t: tM - 12 * PAS }), t('futur', 'en_attente', { entree: pm * 1.01, stop: pm * 1.02, cible1: pm * 0.99, sens: -1, tSignal: tM + 2 * PAS, t: tM + 2 * PAS })],
  recentes: [t('g1', 'cloturee', { tEntree: tM - 70 * PAS, tSortie: tM - 60 * PAS, resultat: { statut: 'cloturee', R: 2, motif: 'objectif' } }), t('p1', 'cloturee', { tEntree: tM - 55 * PAS, tSortie: tM - 50 * PAS, resultat: { statut: 'cloturee', R: -1, motif: 'stop' } }), t('g2', 'cloturee', { tEntree: tM - 30 * PAS, tSortie: tM - 25 * PAS, resultat: { statut: 'cloturee', R: 1.5, motif: 'objectif' } })] });
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-v17-'));
fs.writeFileSync(path.join(dossier, 'volume-v14.json'), JSON.stringify({ schema: 1, vuePubliee: vue }));
fs.writeFileSync(path.join(dossier, 'service.json'), JSON.stringify({ pid: process.pid, demarreLe: maintenant - 3600e3, vivantLe: maintenant, phase: 'attente', worker: { configure: false } }));
const srv = spawn(process.execPath, ['serveur.mjs', String(PORT)], { cwd: process.cwd(), env: { ...process.env, RAYLE_AGENT_DOSSIER: dossier, RAYLE_PORT_RESEAU: String(PORT + 1) }, stdio: 'ignore' });
for (let k = 0; k < 50; k++) { try { if ((await fetch(BASE + '/index.html')).ok) break; } catch (e) { /* démarrage */ } await attendre(200); }
let nav, klines = 0; const journalK = [];
try {
  nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await nav.newPage(); await page.setViewport({ width: 1600, height: 1100 });
  const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 300))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|CORS|net::|binance/i.test(m.text())) erreurs.push(m.text().slice(0, 300)); });
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url();
    if (/api\/v3\/klines/.test(u) && !/interval=(15m|1h)&endTime=/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });   // autres demandes de bougies (vue Agent, cartes) : rien ; seule la requête « plus ancien » du tableau vivant est servie
    if (/api\/v3\/klines/.test(u)) { klines++; journalK.push(u.replace(/^.*klines/, '')); const fin = +new URL(u).searchParams.get('endTime'); if (klines > 1) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      const lot = []; for (let k = 299; k >= 0; k--) { const t = Math.floor(fin / PAS) * PAS - k * PAS, c = pm * (1 + 0.002 * Math.sin(t / 3e6)); lot.push([t, String(c * 0.999), String(c * 1.003), String(c * 0.997), String(c), '10']); }
      return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(lot) }); }
    if (/data-api\.binance\.vision/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
    if (/\/__agent\/trader/.test(u)) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, existe: true, vue: trader(), service: { enMarche: true } }) });
    r.continue(); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_vv_actif', 'SOL'); localStorage.setItem('rayle_vv_tf', 'M15'); localStorage.setItem('rayle_vv_preset', 'epure'); });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1500);
  const ev = (f, ...a) => page.evaluate(f, ...a);
  await ev(() => document.getElementById('btnAgent').click()); await page.waitForSelector('.vv-histo-table', { timeout: 30000 }); await attendre(1500);
  const S = () => ev(() => { const s = window.PosteAgent.vivant().etat(); return { visibles: s.visibles, gauche: s.gauche, actif: s.actif, tf: s.tf, geo: s.geo, zones: s.zonesDessinees }; });
  const boite = await ev(() => { const r = document.querySelector('[data-vv="graph"]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const cy = boite.y + boite.h * 0.5, glisser = async (f0, f1, pas = 6, lent = false) => { await page.mouse.move(boite.x + boite.w * f0, cy); await page.mouse.down(); await page.mouse.move(boite.x + boite.w * f1, cy, { steps: pas }); if (lent) await attendre(160); await page.mouse.up(); };   // fractions de la largeur du graphique

  // ── 1. navigation façon TradingView ──
  const s0 = await S(); T.verifier('au départ : mode direct, 64 bougies, 4 bougies de vide à droite', s0.gauche === null && Math.abs(s0.geo.vis - 64) < 1e-6, JSON.stringify({ g: s0.gauche, vis: s0.geo.vis }));
  // zoom ancré : la bougie sous le curseur reste sous le curseur (à ± 0,05 bougie), à plusieurs endroits
  for (const frac of [0.2, 0.5, 0.85]) {
    await page.mouse.move(boite.x + s0.geo.g + s0.geo.W * frac, cy); const a = await S(), idxAvant = a.geo.gauche + frac * a.geo.vis;
    await page.mouse.wheel({ deltaY: -250 }); await attendre(700); const b = await S(), idxApres = b.geo.gauche + frac * b.geo.vis;
    T.verifier('zoom centré sur le curseur à ' + Math.round(frac * 100) + ' % : la bougie visée ne bouge pas (' + idxAvant.toFixed(2) + ' → ' + idxApres.toFixed(2) + ') et la vue se resserre', Math.abs(idxAvant - idxApres) < 0.05 && b.geo.vis < a.geo.vis, a.geo.vis.toFixed(1) + ' → ' + b.geo.vis.toFixed(1));
    await page.mouse.wheel({ deltaY: 250 }); await attendre(700);
  }
  await page.mouse.wheel({ deltaY: -250 }); await page.mouse.wheel({ deltaY: -250 }); await attendre(900); const z2 = await S();
  T.verifier('molette répétée : zoom progressif et fluide (la largeur varie en continu, pas par paliers entiers)', z2.geo.vis < 40 && Math.abs(z2.geo.vis - Math.round(z2.geo.vis)) > 1e-6, 'vis ' + z2.geo.vis);
  await ev(() => document.querySelector('[data-vv="graph"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await attendre(300);
  // déplacement au pixel près
  const p0 = await S(); await glisser(0.2, 0.2 + 3 / boite.w, 3, true); await attendre(150); const p1 = await S();
  T.verifier('glisser de 3 pixels : le graphique suit au pixel près (fraction de bougie, pas un saut)', Math.abs(p1.geo.gauche - p0.geo.gauche) > 0.001 && Math.abs(p1.geo.gauche - p0.geo.gauche) < 0.6 && Math.abs(p1.geo.gauche % 1) > 1e-6, (p1.geo.gauche - p0.geo.gauche).toFixed(3));
  // inertie : on lâche en mouvement, ça continue de défiler puis s'arrête
  await ev(() => document.querySelector('[data-vv="graph"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await attendre(300);
  await page.mouse.move(boite.x + 150, cy); await page.mouse.down(); await page.mouse.move(boite.x + 250, cy, { steps: 6 }); await page.mouse.up(); const i0 = await S(); await attendre(120); const i1 = await S(); await attendre(900); const i2 = await S();
  const tG = x => x.geo.t0 + x.geo.gauche * x.geo.pasT, hh = ms => (ms / 3600e3).toFixed(1);   // l'heure du bord gauche ne dépend pas des bougies plus anciennes ajoutées en route
  T.verifier('inertie : après le relâchement le graphique continue de défiler dans le passé (bord gauche il y a ' + hh(maintenant - tG(i0)) + ' h → ' + hh(maintenant - tG(i1)) + ' h → ' + hh(maintenant - tG(i2)) + ' h)', tG(i1) < tG(i0) - 60e3 && tG(i2) <= tG(i1), '');
  await attendre(1500); const i3 = await S(); await attendre(500); T.verifier('…et il finit bien par s’immobiliser', Math.abs(tG(await S()) - tG(i3)) < 1);
  // aucune butée : on remonte au-delà du début des données, des bougies plus anciennes sont chargées, puis on peut aller encore plus loin
  const total0 = s0.geo.total; let gg = (await S()).geo.gauche;
  for (let k = 0; k < 14 && gg > -10; k++) { await glisser(0.05, 0.95, 10); await attendre(250); gg = (await S()).geo.gauche; if (klines > 0 && k > 3) break; }
  await attendre(1500); const h1 = await S();
  T.verifier('remonter loin dans le passé : des bougies plus anciennes sont chargées automatiquement (' + total0 + ' → ' + h1.geo.total + ' bougies)', klines >= 1 && h1.geo.total > total0 + 200, 'requêtes ' + klines + ' ' + journalK.join(' | ') + JSON.stringify(await ev(() => Object.fromEntries(Object.entries(window.PosteAgent.vivant().etat().ext).map(([k, e]) => [k, { n: e.bougies.length, fin: e.fin, charge: e.charge, echec: e.echecLe }])))));
  for (let k = 0; k < 10; k++) { await glisser(0.05, 0.95, 10); await attendre(250); }
  await attendre(1200); const h2 = await S();
  T.verifier('plus aucune butée arbitraire : on sort des données par la gauche (bord gauche < 0) sans blocage', h2.geo.gauche < 0 && h2.geo.n >= 1, 'gauche ' + h2.geo.gauche.toFixed(1));
  T.verifier('fin de l’historique disponible : annoncée clairement quand Binance n’a plus rien', klines >= 2 && /Début de l’historique disponible/.test(await ev(() => document.querySelector('[data-vv="info"]').innerText)), 'requêtes ' + klines);
  await page.screenshot({ path: 'docs/captures-v17/pc-passe-lointain.png' });
  // aucune butée à droite non plus : on peut aller dans le vide du futur
  for (let k = 0; k < 14; k++) { await glisser(0.95, 0.05, 10); await attendre(200); }
  await attendre(900); const f1 = await S(); T.verifier('vers le futur : on dépasse la dernière bougie (vide à droite), toujours sans butée arbitraire', f1.geo.gauche > f1.geo.total - f1.geo.vis + 4 + 5, 'gauche ' + f1.geo.gauche.toFixed(1) + ' / total ' + f1.geo.total);
  await ev(() => document.querySelector('[data-vv="graph"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await attendre(400); const s4 = await S();
  T.verifier('double clic : retour au direct', s4.gauche === null && s4.geo.vis === 64, JSON.stringify({ g: s4.gauche }));
  await ev(() => document.querySelector('[data-zoom="-1"]').click()); await attendre(300);
  T.verifier('les boutons ＋ / － continuent de marcher', (await S()).visibles > 0 && (await S()).visibles < 64);
  await ev(() => document.querySelector('[data-zoom="0"]').click()); await attendre(300);

  // ── 2. zones SL / TP alignées sur les prix ──
  await ev(() => { const c = document.querySelector('.vv-couches'); }); const g = (await S()).geo, zs = (await S()).zones, yDe = p => g.haut + (1 - (p - g.min) / (g.max - g.min)) * (g.bas - g.haut);
  const ouv = zs.find(z => z.id === 'ouv'), fut = zs.find(z => z.id === 'futur');
  T.verifier('zone d’une position ouverte : entrée, stop et objectif exactement aux bons prix (± 0,5 px)', !!ouv && Math.abs(ouv.yE - yDe(ouv.entree)) < .5 && Math.abs(ouv.yS - yDe(ouv.stop)) < .5 && Math.abs(ouv.yC - yDe(ouv.cible)) < .5, JSON.stringify(ouv));
  T.verifier('vente : le stop est AU-DESSUS de l’entrée et l’objectif EN DESSOUS (pixels)', !!fut && fut.yS < fut.yE && fut.yC > fut.yE, JSON.stringify(fut));
  T.verifier('ordre posé sur la bougie en cours : la zone démarre à droite du graphique, pas sur toute la largeur', !!fut && fut.x0 > g.g + g.W * 0.85, 'x0 ' + (fut && Math.round(fut.x0)) + ' / largeur ' + Math.round(g.W));
  const px = await ev(o => { const c = document.querySelector('[data-vv="graph"]'), d = window.devicePixelRatio || 1, ctx = c.getContext('2d'), lire = (x, y) => Array.from(ctx.getImageData(Math.round(x * d), Math.round(y * d), 1, 1).data), mx = o.x0 + 12, midSL = (o.yE + o.yS) / 2, midTP = (o.yE + o.yC) / 2, dehors = o.yS > o.yE ? o.yS + 8 : o.yS - 8;
    return { sl: lire(mx, midSL), tp: lire(mx, midTP), dehors: lire(mx, dehors) }; }, ouv);
  T.verifier('pixels : l’intérieur de la zone SL est rouge, celui de la zone TP est vert, et rien de teinté juste au-delà du stop', px.sl[0] > px.sl[1] && px.sl[3] > 0 && px.tp[1] > px.tp[0] && px.tp[3] > 0 && px.dehors[3] < px.sl[3], JSON.stringify(px));
  await (await page.$('.vv-zone')).screenshot({ path: 'docs/captures-v17/graphique.png' });

  // ── 3. tableau d'historique ──
  const lignes = () => ev(() => [...document.querySelectorAll('.vv-histo-table tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')));
  const L = await lignes();
  T.verifier('tableau sous le graphique : une ligne par position (2 vivantes + 3 terminées)', L.length === 5, L.length + ' lignes');
  T.verifier('le tableau est bien placé sous le graphique (même colonne, en dessous)', await ev(() => { const a = document.querySelector('.vv-zone').getBoundingClientRect(), b = document.querySelector('.vv-histo').getBoundingClientRect(); return b.top >= a.bottom - 2 && Math.abs(b.left - a.left) < 4; }));
  T.verifier('colonnes : entrée, stop, TP, sortie, résultat TP / SL, R, gain simulé, durée', await ev(() => ['Entrée (date)', 'Actif', 'Sens', 'Entrée', 'Stop', 'TP', 'Sortie', 'Résultat', 'R', 'Gain simulé', 'Durée'].every(h => [...document.querySelectorAll('.vv-histo-table thead th')].some(th => th.textContent === h))));
  T.verifier('résultats lisibles : TP ✔ +2,00 / SL ✖ −1,00 / TP ✔ +1,50 et gain simulé en $', L.some(l => /TP ✔.*\+2,00/.test(l) && /\$/.test(l)) && L.some(l => /SL ✖.*−1,00/.test(l)) && L.some(l => /TP ✔.*\+1,50/.test(l)));
  T.verifier('positions vivantes en tête (en cours / en attente)', /en attente|en cours/.test(L[0]) && /en attente|en cours/.test(L[1]));
  const resume = await ev(() => document.querySelector('.vv-chips').innerText.replace(/\s+/g, ' '));
  // +2 R, −1 R, +1,5 R : cumul +2,5 R, 2 gagnants sur 3 (67 %), facteur de profit 3,5, meilleur +2,0 / pire −1,0
  T.verifier('résumé : 3 trades, réussite 67 %, cumul +2,5 R, facteur de profit 3,50, meilleur / pire', /trades terminés 3/.test(resume) && /67 %/.test(resume) && /\+2,5 R/.test(resume) && /3,50/.test(resume) && /\+2,0 \/ −1,0 R/.test(resume), resume);
  await ev(() => document.querySelector('[data-hf="res:perdants"]').click()); await attendre(200);
  T.verifier('filtre « Perdants » : une seule ligne (le SL)', (await lignes()).length === 1 && /SL ✖/.test((await lignes())[0]));
  await ev(() => document.querySelector('[data-hf="res:gagnants"]').click()); await attendre(200);
  T.verifier('filtre « Gagnants » : deux lignes', (await lignes()).length === 2);
  await ev(() => document.querySelector('[data-hf="res:tous"]').click()); await attendre(200);
  await ev(() => document.querySelector('[data-hf="actif:BTC"]').click()); await attendre(200);
  T.verifier('filtre par actif : BTC n’a aucun trade, le dit clairement', /Aucune position ne correspond/.test(await ev(() => document.querySelector('.vv-histo').innerText)));
  await ev(() => document.querySelector('[data-hf="actif:tous"]').click()); await attendre(200);
  await ev(() => { const r = [...document.querySelectorAll('.vv-histo-table tbody tr')].find(x => x.dataset.histo === 'g1'); r.click(); }); await attendre(800); const sv = await S();
  T.verifier('un clic sur une ligne place le graphique sur ce trade (fenêtre centrée sur le passé)', sv.gauche !== null && sv.actif === 'SOL', JSON.stringify({ g: sv.gauche }));
  await page.screenshot({ path: 'docs/captures-v17/pc-tableau-historique.png' });
  // ── 3 bis. le tableau reste propre à TOUTES les largeurs : aucun débordement, aucun texte coupé, aucune barre de défilement horizontale ──
  const propre = () => ev(() => { const h = document.querySelector('.vv-histo'), w = h.querySelector('.vv-histo-wrap'), t = h.querySelector('table'), cartes = getComputedStyle(h.querySelector('tbody tr')).display === 'grid', lignes = [...h.querySelectorAll('tbody tr')], rh = h.getBoundingClientRect();
    const dehors = [...h.querySelectorAll('td, th, .vv-chip, .vv-seg, .vv-note')].filter(e => e.offsetParent && (e.getBoundingClientRect().right > rh.right + 1 || e.getBoundingClientRect().left < rh.left - 1)).length, coupes = [...h.querySelectorAll('td')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1).length;
    return { cartes, hDebord: h.scrollWidth > h.clientWidth + 1, wDebord: w.scrollWidth > w.clientWidth + 1, pageDebord: document.documentElement.scrollWidth > innerWidth + 1, dehors, coupes, lignes: lignes.length, largeur: Math.round(rh.width), tableLarge: t.scrollWidth <= w.clientWidth + 1 }; });
  for (const [larg, haut, attendu] of [[1600, 1100, 'table'], [1250, 900, 'table ou cartes'], [1000, 800, 'cartes'], [768, 900, 'cartes'], [390, 844, 'cartes']]) {
    await page.setViewport({ width: larg, height: haut }); await attendre(900); const q = await propre();
    T.verifier('tableau à ' + larg + ' px (bloc de ' + q.largeur + ' px, ' + (q.cartes ? 'cartes' : 'table') + ') : aucun débordement, rien de coupé, pas de défilement horizontal', !q.hDebord && !q.wDebord && !q.pageDebord && q.dehors === 0 && q.coupes === 0 && q.lignes === 5, JSON.stringify(q));
    T.verifier('à ' + larg + ' px : table si le bloc fait 820 px ou plus, sinon cartes lisibles (étiquette : valeur)', q.largeur >= 820 ? !q.cartes : q.cartes);
    if (larg === 1600) T.verifier('à 1600 px : vraie table avec toutes les colonnes', !q.cartes && q.tableLarge);
    if (larg === 390 || larg === 1600) { const el = await page.$('.vv-histo'); await el.scrollIntoView(); await el.screenshot({ path: 'docs/captures-v17/historique-' + larg + '.png' }); }
  }
  await page.setViewport({ width: 1600, height: 1100 }); await attendre(700);

  // ── 4. vue « Agent » (V13) : zones alignées, ordre sur la bougie en cours à droite ──
  await ev(() => window.PosteAgent.vue('agent')); await attendre(2500); await ev(() => window.PosteAgent.lisible().choisirActif('SOL')); await attendre(2500);
  const zp = await ev(() => window.PosteAgent.lisible().etat().zonesPx);
  const f2 = zp.find(z => z.id === 'futur'), o2 = zp.find(z => z.id === 'ouv');
  T.verifier('vue Agent : la zone d’un ordre posé après la dernière bougie démarre à droite (plus d’étirement sur tout le graphique)', !!f2 && f2.x0 > 0.6 * f2.L, f2 ? 'x0 ' + Math.round(f2.x0) + ' / L ' + Math.round(f2.L) : 'absente');
  T.verifier('vue Agent : stop au-dessus / objectif en dessous pour une vente, l’inverse pour un achat', !!f2 && !!o2 && f2.yS < f2.yE && f2.yO > f2.yE && o2.yS > o2.yE && o2.yO < o2.yE, JSON.stringify({ f2, o2 }));
  await page.screenshot({ path: 'docs/captures-v17/pc-agent.png' });
  // ── 5. boîtes SL / TP bornées aux bougies actives : jamais étirées dans le vide du futur (PC puis téléphone) ──
  const bornees = zs => zs.every(z => (z.x1 <= z.xBord + 0.5 || z.x1 - z.x0 <= z.pasPx * 1.6 + 0.5) && z.x1 < z.L - 2 * z.pasPx);   // jusqu'à la dernière bougie ; un ordre posé APRÈS elle garde une largeur d'une bougie et demie
  T.verifier('vue Agent (PC) : chaque boîte s’arrête à la dernière bougie (un ordre posé après elle : une bougie et demie), loin du bord droit du graphique', bornees(zp), JSON.stringify(zp.map(z => ({ id: z.id, x0: Math.round(z.x0), x1: Math.round(z.x1), bord: Math.round(z.xBord), L: Math.round(z.L) }))));
  const o3 = zp.find(z => z.id === 'ouv'); T.verifier('la boîte d’une position ouverte va de son entrée à la dernière bougie (pas jusqu’au bord)', o3.x1 - o3.x0 > 0 && Math.abs(o3.x1 - o3.xBord) < 1 && o3.L - o3.x1 > 3 * o3.pasPx, 'vide à droite : ' + Math.round(o3.L - o3.x1) + ' px');
  await page.setViewport({ width: 390, height: 844 }); await attendre(1800);   // largeur de téléphone (la coque mobile elle-même utilise le même composant : voir v13-agent-mobile-test)
  const zm = await ev(() => window.PosteAgent.lisible().etat().zonesPx), L2 = zm.length ? zm[0].L : 0;
  T.verifier('vue Agent (téléphone 390 px) : boîtes bornées aux bougies actives, vide à droite préservé', zm.length >= 2 && bornees(zm), JSON.stringify(zm.map(z => ({ id: z.id, x1: Math.round(z.x1), L: Math.round(z.L), pas: +z.pasPx.toFixed(1) }))));
  await ev(() => window.PosteAgent.vue('vivant')); await attendre(1200); await ev(() => document.querySelector('[data-vv="graph"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await attendre(600); const sm = await S(), zm2 = sm.zones || [], vivantes = zm2.filter(z => z.statut !== 'terminee');
  T.verifier('tableau vivant (téléphone) : les boîtes SL / TP s’arrêtent à la dernière bougie (+ une bougie et demie au plus)', vivantes.length >= 2 && vivantes.every(z => z.x1 <= sm.geo.g + sm.geo.W + 0.5 && z.x1 - z.x0 <= 1.6 * sm.geo.pas + 0.5 + (z.id === 'ouv' ? (sm.geo.W) : 0)), JSON.stringify(vivantes.map(z => ({ id: z.id, x0: Math.round(z.x0), x1: Math.round(z.x1) })) ) + ' plot ' + Math.round(sm.geo.g + sm.geo.W) + ' geo ' + JSON.stringify({ vis: sm.geo.vis, gauche: sm.geo.gauche, total: sm.geo.total, pas: sm.geo.pas, tf: sm.tf, off: sm.geo.off, n: sm.geo.n }));
  await ev(() => document.querySelector('.vv-zone').scrollIntoView({ block: 'center' })); await attendre(300); await (await page.$('.vv-zone')).screenshot({ path: 'docs/captures-v17/telephone-graphique.png' });
  await page.setViewport({ width: 1600, height: 1100 }); await attendre(900);
  T.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
  await nav.close(); nav = null;
} finally { if (nav) await nav.close(); srv.kill(); }
T.fin();
