import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import { creerServeur } from '../serveur.mjs';
import { demarrerWorker } from './v11-worker-local.mjs';

/* V11 : liaison téléphone → PC de bout en bout avec le VRAI Worker (workerd, vrai Durable Object, vraie D1 locale), SANS caméra réelle (points enregistrés rejoués à 60/s).
   Trois scénarios : (1) tout permis → « Direct » ou « Relais temps réel », jamais l'ancien relais ; (2) WebRTC absent du téléphone → « Relais temps réel » ; (3) ni WebRTC ni WebSocket → ancien relais C + diagnostic clair.
   Mesure aussi : délai d'établissement, paquets/s en médiane, délai de bout en bout, requêtes vers le Worker par chemin (aucun /camera/points sur A et B).
   Lancer : node tests-navigateur/v11-liaison-test.mjs   Ce qui ne peut PAS être testé ici : un vrai téléphone sur un vrai réseau (4G/5G, isolation Wi-Fi) — à valider par Justin avec son Galaxy S23 Ultra. */
const { verifier, fin } = compteur();
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8129, PW = 8799, BASE = 'http://127.0.0.1:' + PORT;
const W = await demarrerWorker({ port: PW, origine: BASE });
if (!W) { console.log('worker/ absent (ignoré par git) : test ignoré'); process.exit(0); }
const serveur = creerServeur({ portReseau: 0, dossierDonnees: fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-v11-')), ip: '127.0.0.1' });
await new Promise(r => serveur.listen(PORT, '127.0.0.1', r));
const suite0 = JSON.parse(fs.readFileSync(path.join(RACINE, 'tests-navigateur/fixtures-gestes/pointer-droite.json'), 'utf8'));
const suite = { ...suite0, ips: 60 };
const mediane = l => { const s = l.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const erreurs = [];
async function scenario(nom, { sansRtc = false, sansWs = false, attente = 9000 }) {
  console.log('\n── ' + nom + ' ──');
  const pc = await nav.newPage(); await pc.setViewport({ width: 1400, height: 900 });
  pc.on('pageerror', e => erreurs.push(nom + ' PC: ' + e.message.slice(0, 200)));
  const reqPc = {}; pc.on('request', r => { if (r.url().startsWith(W.url)) { const p = new URL(r.url()).pathname; reqPc[p] = (reqPc[p] || 0) + 1; } });
  await pc.evaluateOnNewDocument((w, jeton, sansRtc, sansWs) => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_gestes', '{"moteur":"v2"}'); localStorage.setItem('rayle_worker_url', w); localStorage.setItem('rayle_worker_token', jeton); window.RAYLE_CAMERA_PAGE = location.origin + '/camera/index.html'; } catch (e) { /* stockage refusé */ }
    if (sansRtc) delete window.RTCPeerConnection; if (sansWs) window.WebSocket = undefined; }, W.url, W.jeton, sansRtc, sansWs);
  await pc.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(2500);
  await pc.evaluate(() => { GestesUI.telephone(); document.querySelector('#gm-https [data-h="creer"]').click(); }); await attendre(1000);
  const url = await pc.evaluate(() => CameraRelais.etat().url);
  verifier(nom + ' : le QR existe', /#s=[\w-]+&j=[\w-]+&w=/.test(url), url);
  const tel = await nav.newPage(); await tel.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true });
  tel.on('pageerror', e => erreurs.push(nom + ' tel: ' + e.message.slice(0, 200)));
  const reqTel = {}; tel.on('request', r => { if (r.url().startsWith(W.url)) { const p = new URL(r.url()).pathname; reqTel[p] = (reqTel[p] || 0) + 1; } });
  await tel.evaluateOnNewDocument((s, sansRtc, sansWs) => { window.__RAYLE_CAM_TEST__ = s; if (sansRtc) delete window.RTCPeerConnection; if (sansWs) window.WebSocket = undefined; }, suite, sansRtc, sansWs);
  await tel.goto(url, { waitUntil: 'load' }); await attendre(500);
  await tel.evaluate(() => document.getElementById('b-rejoindre').click());
  const t0 = Date.now();
  await attendre(400); await tel.evaluate(() => document.getElementById('b-cam').click());
  await pc.evaluate(async () => { await Gestes.activer({ source: 'telephone-https' }); });
  // temps d'établissement d'un lien rapide
  let etabli = null;
  for (let i = 0; i < 80 && etabli == null; i++) { const c = await pc.evaluate(() => CameraRelais.etat().chemin); if (c === 'direct' || c === 'relais') etabli = Date.now() - t0; else await attendre(100); }
  const debits = [], delais = [];
  const fin0 = Date.now() + attente;
  while (Date.now() < fin0) { await attendre(500); const e = await pc.evaluate(() => { const e = CameraRelais.etat(); return { d: e.debit, c: e.chemin, l: e.delaiMesure, p: e.delaiMesureP95 }; }); if (Date.now() > fin0 - attente + 2500) { debits.push(e.d); if (e.p != null) delais.push(e.p); } }
  const e = await pc.evaluate(() => { const e = CameraRelais.etat(); return { chemin: e.chemin, liaison: e.liaison, recues: e.recues, p50: e.delaiMesure, p95: e.delaiMesureP95, ws: e.ws, alerte: e.versionAlerte, workerInfo: e.workerInfo, ice: e.ice }; });
  await pc.bringToFront();   // une page en arrière-plan ne redessine plus sa fenêtre de suivi
  const diag = await pc.evaluate(() => GestesTel.ouvrir() && GestesTel.texteDiagnostic());
  const fen = await pc.evaluate(() => { GestesTel.ouvrir(); return new Promise(r => setTimeout(() => r(document.querySelector('#gestes-tel [data-k="liaison"]').textContent), 600)); });
  const telTxt = await tel.evaluate(() => { document.getElementById('b-diag').click(); return { stat: document.getElementById('t-lat').textContent, diag: document.getElementById('t-diag').textContent }; });
  const med = mediane(debits);
  console.log('   établi en', etabli, 'ms ; chemin', e.chemin, ' débit médian', med, ' (min ' + Math.min(...debits) + ') ; délai p50/p95', e.p50, e.p95, '; ws', JSON.stringify(e.ws), '\n   fenêtre PC :', fen, '\n   téléphone :', telTxt.stat, '\n   requêtes PC', JSON.stringify(reqPc), '\n   requêtes téléphone', JSON.stringify(reqTel));
  return { pc, tel, e, etabli, med, min: Math.min(...debits), diag, fen, telTxt, reqPc, reqTel };
}
try {
  const a = await scenario('A : tout permis', {});
  verifier('A : un lien rapide est établi en moins de 5 s', a.etabli != null && a.etabli < 5000, a.etabli + ' ms');
  verifier('A : chemin « direct » ou « relais » (jamais l’ancien relais)', a.e.chemin === 'direct' || a.e.chemin === 'relais', a.e.chemin);
  verifier('A : ≥ 45 paquets/s en médiane, jamais sous 30', a.med >= 45 && a.min >= 30, 'médiane ' + a.med + ' min ' + a.min);
  verifier('A : délai de bout en bout < 80 ms au 95e centile', a.e.p95 != null && a.e.p95 < 80, 'p95 ' + a.e.p95);
  verifier('A : la fenêtre affiche « Direct » ou « Relais temps réel » avec débit', /(Direct|Relais temps réel) · \d+ paquets\/s/.test(a.fen), a.fen);
  verifier('A : plus de message « la liaison directe n’a pas abouti »… ni « (lent) »', !/lent|n’a pas abouti/.test(a.fen), a.fen);
  verifier('A : aucun envoi de points par l’ancien relais (/camera/points = 0)', !(a.reqTel['/camera/points'] > 0), JSON.stringify(a.reqTel));
  verifier('A : D1 peu sollicitée côté PC (/camera/lire ≤ 1 appel par 2 s en régime établi)', (a.reqPc['/camera/lire'] || 0) <= 12, JSON.stringify(a.reqPc));
  verifier('A : le diagnostic dit que tout va bien', /Tout va bien|liaison rapide établie/.test(a.diag), a.diag.split('\n').slice(-3).join(' | '));
  verifier('A : le diagnostic du téléphone est lisible', /DIAGNOSTIC DE LIAISON/.test(a.telTxt.diag) && /Chemin utilisé/.test(a.telTxt.diag));
  await a.pc.close(); await a.tel.close();

  const b = await scenario('B : téléphone sans WebRTC', { sansRtc: true });
  verifier('B : relais temps réel établi en moins de 5 s', b.etabli != null && b.etabli < 5000 && b.e.chemin === 'relais', b.etabli + ' ms ' + b.e.chemin);
  verifier('B : ≥ 45 paquets/s en médiane, jamais sous 30', b.med >= 45 && b.min >= 30, 'médiane ' + b.med + ' min ' + b.min);
  verifier('B : délai de bout en bout < 80 ms au 95e centile', b.e.p95 != null && b.e.p95 < 80, 'p95 ' + b.e.p95);
  verifier('B : « Relais temps réel · N paquets/s · N ms »', /Relais temps réel · \d+ paquets\/s · \d+ ms/.test(b.fen), b.fen);
  verifier('B : aucun point par D1 (/camera/points = 0)', !(b.reqTel['/camera/points'] > 0), JSON.stringify(b.reqTel));
  await b.pc.close(); await b.tel.close();

  const c = await scenario('C : ni WebRTC ni WebSocket', { sansRtc: true, sansWs: true, attente: 6000 });
  verifier('C : chemin « worker » (dernier recours), clairement signalé', c.e.chemin === 'worker' && /ancien relais|lent/.test(c.fen), c.e.chemin + ' | ' + c.fen);
  verifier('C : le diagnostic explique pourquoi (ni direct ni relais)', /dernier recours|Ni la liaison directe ni le relais|Pas encore|ancien relais/i.test(c.diag), c.diag);
  await c.pc.close(); await c.tel.close();
  verifier('aucune erreur JavaScript pendant les trois scénarios', erreurs.length === 0, erreurs.join(' | '));
} finally { await nav.close(); serveur.close(); W.arreter(); }
fin();
