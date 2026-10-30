import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import { creerServeur } from '../serveur.mjs';
import { demarrerWorker } from './v11-worker-local.mjs';

/* V11 : bascule A/B/C avec PANNES SIMULÉES et RÉSEAU DÉGRADÉ, avec le vrai Worker local.
   1. liaison directe coupée en plein vol → le relais temps réel prend le relais SANS trou de plus de 1,5 s, puis le direct revient tout seul ;
   2. relais coupé pendant le direct → rien ne change pour l'utilisateur, le relais se rouvre ;
   3. tout coupé à la fois → reprise en moins de 6 s ;
   4. réseau dégradé (délai de 30 ms par sens + gigue de 15 ms entre le téléphone et le Worker, et entre le Worker et le PC) sur le relais temps réel : débit et délai mesurés ;
   5. Worker trop ancien (sans relais) : le message « mise à jour du Worker requise » s'affiche (au lieu d'un message vague). */
const { verifier, fin } = compteur();
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8130, PW = 8799, PP = 8801, PV = 8802, BASE = 'http://127.0.0.1:' + PORT;
const W = await demarrerWorker({ port: PW, origine: BASE });
if (!W) { console.log('worker/ absent (ignoré par git) : test ignoré'); process.exit(0); }
/* Proxy TCP qui retarde chaque morceau de données : 30 ms + jusqu'à 15 ms de gigue, dans chaque sens. L'ORDRE des octets est conservé par une vraie file d'attente (un setTimeout par morceau pouvait
   inverser deux morceaux à la même milliseconde : le flux WebSocket devenait invalide, code 1002 — défaut du banc d'essai, pas du produit). */
function proxyLent(portEcoute, portCible, ms = 30, gigue = 15) {
  const srv = net.createServer(client => {
    const amont = net.connect(portCible, '127.0.0.1');
    const retarder = (src, dst) => {
      const file = []; let dernier = 0, arme = false;
      const vider = () => { arme = false; const maintenant = Date.now(); while (file.length && file[0].t <= maintenant) { const x = file.shift(); if (!dst.destroyed) dst.write(x.d); } if (file.length) { arme = true; setTimeout(vider, Math.max(1, file[0].t - maintenant)); } };
      src.on('data', d => { const t = Math.max(dernier, Date.now() + ms + Math.random() * gigue); dernier = t; file.push({ t, d }); if (!arme) { arme = true; setTimeout(vider, Math.max(1, t - Date.now())); } });
      src.on('close', () => setTimeout(() => dst.destroy(), ms + gigue + 5)); src.on('error', () => dst.destroy());
    };
    retarder(client, amont); retarder(amont, client);
  });
  return new Promise(r => srv.listen(portEcoute, '127.0.0.1', () => r(srv)));
}
const lent = await proxyLent(PP, PW);
/* Faux « ancien Worker » : transmet tout au vrai Worker local SAUF les routes de la V11, qui répondent 404 comme l'ancienne version. */
const NOUVEAU = ['/camera/ticket', '/camera/ice', '/camera/ice-pc', '/camera/version', '/camera/ws'];
const vieux = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), chunks = []; for await (const c of req) chunks.push(c);
  if (req.method !== 'OPTIONS' && NOUVEAU.includes(u.pathname)) { res.writeHead(404, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }); return res.end('{"error":"route inconnue"}'); }
  const h = { ...req.headers }; delete h.host; delete h.connection; delete h['content-length'];
  const r = await fetch(W.url + req.url, { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }).catch(() => null);
  if (!r) { res.writeHead(502); return res.end(); }
  const sortie = {}; r.headers.forEach((v, k) => { if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(k)) sortie[k] = v; });
  res.writeHead(r.status, sortie); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise(r => vieux.listen(PV, '127.0.0.1', r));
const serveur = creerServeur({ portReseau: 0, dossierDonnees: fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-v11b-')), ip: '127.0.0.1' });
await new Promise(r => serveur.listen(PORT, '127.0.0.1', r));
const suite = { ...JSON.parse(fs.readFileSync(path.join(RACINE, 'tests-navigateur/fixtures-gestes/pointer-droite.json'), 'utf8')), ips: 60 };
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const erreurs = [];
const mediane = l => { const s = l.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
async function ouvrir({ worker = W.url, sansRtc = false } = {}) {
  const pc = await nav.newPage(); await pc.setViewport({ width: 1400, height: 900 }); pc.on('pageerror', e => erreurs.push('PC: ' + e.message.slice(0, 200)));
  await pc.evaluateOnNewDocument((w, jeton) => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_gestes', '{"moteur":"v2"}'); localStorage.setItem('rayle_worker_url', w); localStorage.setItem('rayle_worker_token', jeton); window.RAYLE_CAMERA_PAGE = location.origin + '/camera/index.html'; } catch (e) { /* stockage refusé */ } }, worker, W.jeton);
  await pc.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(2200);
  await pc.evaluate(() => { GestesUI.telephone(); document.querySelector('#gm-https [data-h="creer"]').click(); }); await attendre(900);
  const url = await pc.evaluate(() => CameraRelais.etat().url);
  const tel = await nav.newPage(); await tel.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true }); tel.on('pageerror', e => erreurs.push('tel: ' + e.message.slice(0, 200)));
  await tel.evaluateOnNewDocument((s, sansRtc) => { window.__RAYLE_CAM_TEST__ = s; if (sansRtc) delete window.RTCPeerConnection; }, suite, sansRtc);
  await tel.goto(url, { waitUntil: 'load' }); await attendre(400);
  await tel.evaluate(() => document.getElementById('b-rejoindre').click()); await attendre(500); await tel.evaluate(() => document.getElementById('b-cam').click());
  await pc.evaluate(async () => { await Gestes.activer({ source: 'telephone-https' }); });
  await pc.bringToFront();
  await pc.evaluate(() => { window.__trou = { max: 0, dernier: performance.now(), n: CameraRelais.etat().recues }; setInterval(() => { const n = CameraRelais.etat().recues, t = performance.now(); if (n !== window.__trou.n) { window.__trou.max = Math.max(window.__trou.max, t - window.__trou.dernier); window.__trou.dernier = t; window.__trou.n = n; } }, 20); });
  return { pc, tel };
}
const chemin = pc => pc.evaluate(() => CameraRelais.etat().chemin);
const attendreChemin = async (pc, voulu, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await chemin(pc)) === voulu) return Date.now() - t0; await attendre(100); } return null; };
try {
  if (!process.env.SEUL4) {
  // ── 1 à 3 : pannes ──
  const { pc, tel } = await ouvrir();
  verifier('départ : liaison directe', (await attendreChemin(pc, 'direct', 6000)) != null, await chemin(pc));
  await attendre(2500); await pc.evaluate(() => { window.__trou.max = 0; });
  await tel.evaluate(() => { const { D } = window.__RAYLE_CAM_ETAT__(); D.pc.close(); });   // panne 1 : le direct tombe
  const versRelais = await attendreChemin(pc, 'relais', 6000);
  verifier('panne du direct : bascule vers le relais temps réel en moins de 3 s', versRelais != null && versRelais < 3000, versRelais + ' ms');
  await attendre(1500);
  const trou1 = await pc.evaluate(() => window.__trou.max);
  verifier('panne du direct : aucun trou de plus de 1,5 s dans les points reçus', trou1 < 1500, Math.round(trou1) + ' ms');
  const retour = await attendreChemin(pc, 'direct', 15000);
  verifier('le direct est ré-essayé tout seul en arrière-plan et reprend la main', retour != null, retour + ' ms');
  await attendre(1500); await pc.evaluate(() => { window.__trou.max = 0; });
  await tel.evaluate(() => { const { R } = window.__RAYLE_CAM_ETAT__(); R.ws.close(); });   // panne 2 : le relais tombe pendant le direct
  await attendre(2500);
  const trou2 = await pc.evaluate(() => window.__trou.max), ch2 = await chemin(pc);
  verifier('panne du relais pendant le direct : rien ne change (aucun trou, toujours direct)', trou2 < 400 && ch2 === 'direct', Math.round(trou2) + ' ms ' + ch2);
  const wsRevenu = await tel.evaluate(async () => { for (let i = 0; i < 60; i++) { if (window.__RAYLE_CAM_ETAT__().R.ouvert) return true; await new Promise(r => setTimeout(r, 100)); } return false; });
  verifier('le relais se rouvre tout seul', wsRevenu);
  await pc.evaluate(() => { window.__trou.max = 0; });
  await tel.evaluate(() => { const { D, R } = window.__RAYLE_CAM_ETAT__(); D.pc.close(); R.ws.close(); });   // panne 3 : tout tombe
  await attendre(7000);
  const trou3 = await pc.evaluate(() => window.__trou.max), ch3 = await chemin(pc), d3 = await pc.evaluate(() => CameraRelais.debit());
  verifier('tout coupé à la fois : le plus long trou dans les points reçus < 6 s', trou3 < 6000, Math.round(trou3) + ' ms');
  verifier('tout coupé à la fois : le flux est revenu (≥ 30 paquets/s, direct ou relais)', (ch3 === 'direct' || ch3 === 'relais') && d3 >= 30, ch3 + ' ' + d3 + ' paquets/s');
  await pc.close(); await tel.close();

  }
  // ── 4 : réseau dégradé sur le relais temps réel ──
  const d = await ouvrir({ worker: 'http://127.0.0.1:' + PP, sansRtc: true });
  await attendreChemin(d.pc, 'relais', 8000); await attendre(3000);
  const debits = [], p95 = [], p50 = [];
  for (let i = 0; i < 12; i++) { await attendre(500); const e = await d.pc.evaluate(() => ({ d: CameraRelais.debit(), a: CameraRelais.etat().delaiMesure, b: CameraRelais.etat().delaiMesureP95 })); debits.push(e.d); if (e.a != null) p50.push(e.a); if (e.b != null) p95.push(e.b); }
  console.log('   débits par demi-seconde :', debits.join(' '));
  console.log('   réseau dégradé (30 ms + gigue 15 ms par sens) : débit médian', mediane(debits), 'min', Math.min(...debits), '· délai p50', mediane(p50), 'p95', mediane(p95));
  verifier('réseau dégradé : relais temps réel, ≥ 45 paquets/s en médiane, jamais sous 30', mediane(debits) >= 45 && Math.min(...debits) >= 30, 'médiane ' + mediane(debits) + ' min ' + Math.min(...debits));
  verifier('réseau dégradé : délai de bout en bout < 150 ms (60 ms de délai ajouté + gigue : la cible de 80 ms vaut pour un réseau normal)', mediane(p95) < 150, 'p95 ' + mediane(p95));
  await d.pc.close(); await d.tel.close();

  if (!process.env.SEUL4) {
  // ── 5 : Worker trop ancien (sans relais temps réel, sans TURN) → message clair, pas un message vague ──
  const e5 = await ouvrir({ worker: 'http://127.0.0.1:' + PV, sansRtc: true });
  await attendre(5000); await e5.pc.bringToFront();
  const r5 = await e5.pc.evaluate(() => { GestesTel.ouvrir(); return new Promise(res => setTimeout(() => res({ fen: document.querySelector('#gestes-tel [data-k="liaison"]').textContent, note: document.querySelector('#gestes-tel [data-k="note"]').textContent, diag: GestesTel.texteDiagnostic(), chemin: CameraRelais.etat().chemin }), 700)); });
  const t5 = await e5.tel.evaluate(() => { document.getElementById('b-diag').click(); return { lat: document.getElementById('t-lat').textContent, diag: document.getElementById('t-diag').textContent }; });
  verifier('Worker ancien : le chemin retenu est l’ancien relais (dernier recours)', r5.chemin === 'worker', r5.chemin);
  verifier('Worker ancien : la fenêtre du PC dit « mise à jour du Worker requise »', /mise à jour du Worker requise/i.test(r5.fen + ' ' + r5.note), r5.fen + ' | ' + r5.note);
  verifier('Worker ancien : le diagnostic du PC donne la cause et la commande de déploiement', /Mise à jour du Worker requise/.test(r5.diag) && /wrangler deploy/.test(r5.diag), r5.diag.split(String.fromCharCode(10)).slice(-4).join(' | '));
  verifier('Worker ancien : la page du téléphone le dit aussi en clair', /mise à jour du Worker requise/i.test(t5.lat + ' ' + t5.diag), t5.lat);
  await e5.pc.close(); await e5.tel.close();
  }
  verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
} finally { await nav.close(); serveur.close(); lent.close(); vieux.close(); W.arreter(); }
fin();
