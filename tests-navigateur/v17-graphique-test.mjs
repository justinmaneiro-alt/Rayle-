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
let nav;
try {
  nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await nav.newPage(); await page.setViewport({ width: 1600, height: 1100 });
  const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 300))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|CORS|net::|binance/i.test(m.text())) erreurs.push(m.text().slice(0, 300)); });
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url();
    if (/data-api\.binance\.vision/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
    if (/\/__agent\/trader/.test(u)) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, existe: true, vue: trader(), service: { enMarche: true } }) });
    r.continue(); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_vv_actif', 'SOL'); localStorage.setItem('rayle_vv_tf', 'M15'); localStorage.setItem('rayle_vv_preset', 'epure'); });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1500);
  const ev = (f, ...a) => page.evaluate(f, ...a);
  await ev(() => document.getElementById('btnAgent').click()); await page.waitForSelector('.vv-histo-table', { timeout: 30000 }); await attendre(1500);
  const S = () => ev(() => { const s = window.PosteAgent.vivant().etat(); return { visibles: s.visibles, decalage: s.decalage, actif: s.actif, tf: s.tf, geo: s.geo, zones: s.zonesDessinees }; });

  // ── 1. navigation : molette, glisser, double clic ──
  const boite = await ev(() => { const r = document.querySelector('[data-vv="graph"]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await page.mouse.move(boite.x + boite.w * 0.5, boite.y + boite.h * 0.5);
  const s0 = await S(); await page.mouse.wheel({ deltaY: -400 }); await attendre(400); const s1 = await S();
  T.verifier('molette vers l’avant : le graphique zoome (moins de bougies visibles)', s1.visibles > 0 && s1.visibles < 64 && s1.geo.n === s1.visibles, s0.visibles + ' → ' + s1.visibles + ' (' + s1.geo.n + ' dessinées)');
  await page.mouse.wheel({ deltaY: 900 }); await attendre(400); const s2 = await S();
  T.verifier('molette vers l’arrière : dézoome (plus de bougies qu’avant)', s2.visibles > s1.visibles, s1.visibles + ' → ' + s2.visibles);
  await page.mouse.move(boite.x + boite.w * 0.4, boite.y + boite.h * 0.5); await page.mouse.down(); await page.mouse.move(boite.x + boite.w * 0.7, boite.y + boite.h * 0.5, { steps: 8 }); await page.mouse.up(); await attendre(400); const s3 = await S();
  T.verifier('glisser vers la droite : on remonte dans le passé (bougies plus récentes masquées)', s3.decalage > 0 && s3.geo.deb < s2.geo.deb, 'décalage ' + s3.decalage);
  await page.mouse.move(boite.x + boite.w * 0.7, boite.y + boite.h * 0.5); await page.mouse.down(); await page.mouse.move(boite.x + boite.w * 0.1, boite.y + boite.h * 0.5, { steps: 8 }); await page.mouse.up(); await attendre(400);
  T.verifier('glisser vers la gauche : retour vers le présent, jamais au-delà (décalage ≥ 0)', (await S()).decalage < s3.decalage && (await S()).decalage >= 0);
  await ev(() => document.querySelector('[data-vv="graph"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await attendre(400); const s4 = await S();
  T.verifier('double clic : retour à la vue d’origine', s4.decalage === 0 && s4.visibles === 0, JSON.stringify({ d: s4.decalage, v: s4.visibles }));
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
  T.verifier('un clic sur une ligne place le graphique sur ce trade (fenêtre centrée sur le passé)', sv.decalage > 0 && sv.actif === 'SOL', JSON.stringify({ d: sv.decalage }));
  await page.screenshot({ path: 'docs/captures-v17/pc-tableau-historique.png' });

  // ── 4. vue « Agent » (V13) : zones alignées, ordre sur la bougie en cours à droite ──
  await ev(() => window.PosteAgent.vue('agent')); await attendre(2500); await ev(() => window.PosteAgent.lisible().choisirActif('SOL')); await attendre(2500);
  const zp = await ev(() => window.PosteAgent.lisible().etat().zonesPx);
  const f2 = zp.find(z => z.id === 'futur'), o2 = zp.find(z => z.id === 'ouv');
  T.verifier('vue Agent : la zone d’un ordre posé après la dernière bougie démarre à droite (plus d’étirement sur tout le graphique)', !!f2 && f2.x0 > 0.6 * f2.L, f2 ? 'x0 ' + Math.round(f2.x0) + ' / L ' + Math.round(f2.L) : 'absente');
  T.verifier('vue Agent : stop au-dessus / objectif en dessous pour une vente, l’inverse pour un achat', !!f2 && !!o2 && f2.yS < f2.yE && f2.yO > f2.yE && o2.yS > o2.yE && o2.yO < o2.yE, JSON.stringify({ f2, o2 }));
  await page.screenshot({ path: 'docs/captures-v17/pc-agent.png' });
  T.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
  await nav.close(); nav = null;
} finally { if (nav) await nav.close(); srv.kill(); }
T.fin();
