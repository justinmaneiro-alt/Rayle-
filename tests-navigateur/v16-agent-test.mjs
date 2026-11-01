// V16 : Agent IA depuis l'accueil (bouton), plus d'astre en haut, portefeuille PILOTÉ par les trades, flux d'exécution, trades historiques dessinés, alertes de nouvelle position.
// Vrai serveur local ; la vue du mode Trader est une FIXTURE de test (trades synthétiques, jamais présentés comme réels).
//   node tests-navigateur/v16-agent-test.mjs        captures : docs/captures-v16/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { CHROME, attendre, compteur } from './terre-aide.mjs';

const T = compteur(), PORT = 8166, BASE = 'http://127.0.0.1:' + PORT, maintenant = Date.now();
fs.mkdirSync('docs/captures-v16', { recursive: true });
const vue = JSON.parse(fs.readFileSync('tests-navigateur/fixtures/volume-vue.json', 'utf8')), dernier = vue.actifs.SOL.h1.bougies.at(-1), px = dernier[4], tH = dernier[0], H = 3600e3;
vue.actifs.SOL.positions = [];   // le tableau de volume n'a aucun trade : tout vient du mode Trader
const t = (id, statut, extra) => ({ id, actif: 'SOL', tf: 'M15', nom: 'Test', sens: 1, entree: px * 0.99, stop: px * 0.98, cible1: px * 1.01, tSignal: tH - 6 * H, t: tH - 6 * H, statut, ...extra });
const trader = (avecNouveau = false) => ({ ok: true, version: 12, t: maintenant, reglages: { risquePct: 1 }, bougies: { SOL: [[tH, px, px, px, px, 1]] }, bilan: { tous: { stats: { n: 2, total: 1 } } },
  actives: [t('ouv', 'ouverte', { tEntree: tH - 1 * H, tSignal: tH - 2 * H, t: tH - 2 * H }), t('att', 'en_attente', { entree: px * 0.95, stop: px * 0.94, cible1: px * 0.97, tSignal: tH - 1 * H, t: tH - 1 * H })].concat(avecNouveau ? [t('neuf', 'en_attente', { tSignal: maintenant - 60e3, t: maintenant - 60e3 })] : []),
  recentes: [t('gain', 'cloturee', { tEntree: tH - 5 * H, tSortie: tH - 3 * H, resultat: { statut: 'cloturee', R: 2, motif: 'objectif' } }), t('perte', 'cloturee', { tEntree: tH - 4 * H, tSortie: tH - 2.5 * H, resultat: { statut: 'cloturee', R: -1, motif: 'stop' } })] });
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-v16-'));
fs.writeFileSync(path.join(dossier, 'volume-v14.json'), JSON.stringify({ schema: 1, vuePubliee: vue }));
fs.writeFileSync(path.join(dossier, 'service.json'), JSON.stringify({ pid: process.pid, demarreLe: maintenant - 3600e3, vivantLe: maintenant, phase: 'attente', worker: { configure: false } }));
const srv = spawn(process.execPath, ['serveur.mjs', String(PORT)], { cwd: process.cwd(), env: { ...process.env, RAYLE_AGENT_DOSSIER: dossier, RAYLE_PORT_RESEAU: String(PORT + 1) }, stdio: 'ignore' });
for (let k = 0; k < 50; k++) { try { if ((await fetch(BASE + '/index.html')).ok) break; } catch (e) { /* démarrage */ } await attendre(200); }
let nav, live = false;
try {
  nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await nav.newPage(); await page.setViewport({ width: 1600, height: 1000 });
  const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 300))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|CORS|net::|binance/i.test(m.text())) erreurs.push(m.text().slice(0, 300)); });
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url();
    if (/ticker\/price/.test(u)) return live ? r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ symbol: 'SOLUSDT', price: String(px * 1.02) }]) }) : r.respond({ status: 503, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' });
    if (/data-api\.binance\.vision/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
    if (/\/__agent\/trader/.test(u)) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, existe: true, vue: trader(), service: { enMarche: true } }) });
    r.continue(); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_vv_actif', 'SOL'); localStorage.setItem('rayle_agent_vue', 'details'); });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1500);
  const ev = (f, ...a) => page.evaluate(f, ...a);
  T.verifier('le bouton « Agent IA » existe dans la barre de l’accueil', await ev(() => !!document.getElementById('btnAgent')));
  T.verifier('menu Aurore : entrée « Agent IA »', await ev(() => !!document.querySelector('#g1Menu [data-p="agent"]')));
  await ev(() => document.getElementById('btnAgent').click()); await page.waitForSelector('.vv-pf-grand', { timeout: 30000 }); await attendre(1800);
  T.verifier('« Agent IA » depuis l’accueil ouvre le tableau vivant (même avec une ancienne vue « Détails » mémorisée)', await ev(() => document.querySelector('.av3-wrap').dataset.vue === 'vivant'));
  T.verifier('plus d’astre / noyau tournant en haut du tableau', await ev(() => !document.querySelector('.vv-noyau') && !document.querySelector('.vv canvas[data-vv="noyauc"]')));
  const pf = await ev(() => document.querySelector('[data-vv="pf"]').innerText);
  // +2 R puis −1 R à 1 % composé : 10 098 $ ; position ouverte exactement à +1 R flottant (+1 % du capital réalisé) = 10 198,98 $
  T.verifier('portefeuille piloté par les trades : capital au centime = réalisé composé + flottant (10 198,98 $, plus 10 000 fixe)', /10.198,98 \$/.test(pf), pf.replace(/\s+/g, ' ').slice(0, 220));
  T.verifier('cumul réalisé en R et flottant affichés (+1,0 R réalisé, flottant +1,0 R sur 1 position)', /Cumul réalisé\s*\+1,0 R/.test(pf) && /flottant \+1,0 R/.test(pf) && /1 ordre\(s\) limite en attente/.test(pf));
  // prix en direct : +3 R flottants au nouveau prix = 10098 x (1 + 1 % x 3) = 10 400,94 $, sans attendre le cycle de l'agent
  live = true; await page.waitForFunction(() => /10.400,94 \$/.test(document.querySelector('[data-vv="pf"]').innerText), { timeout: 15000 }).catch(() => {});
  const pfLive = await ev(() => document.querySelector('[data-vv="pf"]').innerText);
  T.verifier('portefeuille en direct : le prix bouge, le capital suit au centime (10 400,94 $, flottant +3,0 R)', /10.400,94 \$/.test(pfLive) && /flottant \+3,0 R \(\+302,94 \$\)/.test(pfLive), pfLive.replace(/\s+/g, ' ').slice(0, 260));
  const flux = await ev(() => [...document.querySelectorAll('.vv-flux li')].map(l => l.innerText.replace(/\s+/g, ' ')));
  T.verifier('flux d’exécution : signaux, entrées et sorties avec R', flux.length >= 8 && flux.some(l => /Sortie.*✔ \+2,00 R/.test(l)) && flux.some(l => /Sortie.*✖ −1,00 R/.test(l)) && flux.some(l => /Entrée touchée/.test(l)) && flux.some(l => /Signal/.test(l)), flux.length + ' lignes');
  await page.screenshot({ path: 'docs/captures-v16/pc-tableau.png' });
  // trades historiques dessinés : pixels verts et rouges des zones de sortie dans la fenêtre du graphique
  const couleurs = await ev(() => { const c = document.querySelector('[data-vv="graph"]'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let v = 0, r = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0 && d[i + 1] > 180 && d[i] < 120 && d[i + 2] < 180) v++; if (d[i + 3] > 0 && d[i] > 200 && d[i + 1] < 120) r++; } return { v, r }; });
  T.verifier('le graphique dessine les trades (zones TP / SL, traits, flèches de clôture)', couleurs.v > 200 && couleurs.r > 200, JSON.stringify(couleurs));
  await (await page.$('.vv-zone')).screenshot({ path: 'docs/captures-v16/pc-graphique.png' });
  // alertes : une position vue pour la première fois (récente) sonne, un ordre devenu position sonne, rien de plus au deuxième passage
  await ev(() => { localStorage.removeItem('rayle_agent_vus'); document.getElementById('agent-alertes')?.remove(); });
  const n1 = await ev(v => window.AgentAlertes.surVue(v).length, trader(true)); const bandeaux1 = await ev(() => document.querySelectorAll('.agent-alerte').length);
  T.verifier('première lecture : seule la position toute récente alerte (bandeau affiché)', n1 === 1 && bandeaux1 === 1, n1 + ' / ' + bandeaux1);
  T.verifier('même vue relue : aucune alerte en double', (await ev(v => window.AgentAlertes.surVue(v).length, trader(true))) === 0);
  const v2 = trader(true); v2.actives.find(p => p.id === 'neuf').statut = 'ouverte';
  const n3 = await ev(v => window.AgentAlertes.surVue(v).length, v2); T.verifier('ordre limite devenu position ouverte : nouvelle alerte', n3 === 1 && (await ev(() => /Position ouverte/.test(document.querySelector('#agent-alertes').innerText))));
  // Vue Agent (V13) : historique dessiné aussi
  await ev(() => window.PosteAgent.vue('agent')); await attendre(2500);
  T.verifier('vue « Agent » : le graphique reçoit les trades terminés', await ev(() => { const w = window.PosteAgent.lisible(); return !!w && w.etat().charge; }));
  await page.screenshot({ path: 'docs/captures-v16/pc-agent.png' });
  T.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
  await nav.close(); nav = null;
} finally { if (nav) await nav.close(); srv.kill(); }
T.fin();
