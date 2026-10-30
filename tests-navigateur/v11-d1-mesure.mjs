import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import { creerServeur } from '../serveur.mjs';
import { demarrerWorker } from './v11-worker-local.mjs';
const { DatabaseSync } = await import('node:sqlite');

/* V11 : budget D1 AVANT / APRÈS. Pour chacun des trois chemins (C = ancien relais, B = relais temps réel, A = direct), le VRAI Worker local (workerd, vraie D1 locale) tourne 40 s avec un téléphone
   qui envoie 60 trames/s ; on lit ensuite, dans la D1 locale, la ligne du jour de la table « agent_budget » (lignes lues / écrites comptées par le Worker lui-même, budget.js) et on retranche la ligne de base
   (page ouverte sans caméra). Lancer : node tests-navigateur/v11-d1-mesure.mjs   (≈ 4 minutes ; ne lancer aucun autre test en parallèle) */
const { verifier, fin } = compteur();
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8131, PW = 8799, BASE = 'http://127.0.0.1:' + PORT, DUREE = 40;
const suite = { ...JSON.parse(fs.readFileSync(path.join(RACINE, 'tests-navigateur/fixtures-gestes/pointer-droite.json'), 'utf8')), ips: 60 };
const serveur = creerServeur({ portReseau: 0, dossierDonnees: fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-v11d-')), ip: '127.0.0.1' });
await new Promise(r => serveur.listen(PORT, '127.0.0.1', r));
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run'] });
function lireBudget(dossier) {
  const trouver = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { const r = trouver(p); if (r) return r; } else if (e.name.endsWith('.sqlite') && !/metadata/.test(e.name)) { try { const db = new DatabaseSync(p, { readOnly: true }); const t = db.prepare("select name from sqlite_master where name = 'agent_budget'").get(); if (t) { const l = db.prepare('select * from agent_budget').all(); db.close(); return l; } db.close(); } catch (x) { /* base verrouillée ou autre */ } } } return null; };
  return trouver(dossier);
}
async function mesurer(nom, { sansRtc, sansWs, camera = true }) {
  const W = await demarrerWorker({ port: PW, origine: BASE });
  if (!W) { console.log('worker/ absent : ignoré'); process.exit(0); }
  const req = { pc: {}, tel: {} };
  try {
    const pc = await nav.newPage(); await pc.setViewport({ width: 1400, height: 900 });
    pc.on('request', r => { if (r.url().startsWith(W.url)) { const p = new URL(r.url()).pathname; req.pc[p] = (req.pc[p] || 0) + 1; } });
    await pc.evaluateOnNewDocument((w, jeton, sansRtc, sansWs) => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_gestes', '{"moteur":"v5"}'); localStorage.setItem('rayle_worker_url', w); localStorage.setItem('rayle_worker_token', jeton); window.RAYLE_CAMERA_PAGE = location.origin + '/camera/index.html'; } catch (e) { /* stockage refusé */ } if (sansRtc) delete window.RTCPeerConnection; if (sansWs) window.WebSocket = undefined; }, W.url, W.jeton, sansRtc, sansWs);
    await pc.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(2500);
    let tel = null;
    if (camera) {
      await pc.evaluate(() => { GestesUI.telephone(); document.querySelector('#gm-https [data-h="creer"]').click(); }); await attendre(1000);
      const url = await pc.evaluate(() => CameraRelais.etat().url);
      tel = await nav.newPage(); await tel.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true });
      tel.on('request', r => { if (r.url().startsWith(W.url)) { const p = new URL(r.url()).pathname; req.tel[p] = (req.tel[p] || 0) + 1; } });
      await tel.evaluateOnNewDocument((s, sansRtc, sansWs) => { window.__RAYLE_CAM_TEST__ = s; if (sansRtc) delete window.RTCPeerConnection; if (sansWs) window.WebSocket = undefined; }, suite, sansRtc, sansWs);
      await tel.goto(url, { waitUntil: 'load' }); await attendre(400);
      await tel.evaluate(() => document.getElementById('b-rejoindre').click()); await attendre(400); await tel.evaluate(() => document.getElementById('b-cam').click());
      await pc.evaluate(async () => { await Gestes.activer({ source: 'telephone-https' }); }); await pc.bringToFront();
      await attendre(3000); for (const k of ['pc', 'tel']) req[k] = {};   // on ne compte que le RÉGIME ÉTABLI, pas la mise en route
    } else await pc.bringToFront();
    const t0 = Date.now(); await attendre(DUREE * 1000);
    const ch = camera ? await pc.evaluate(() => CameraRelais.etat().chemin) : 'aucun', secondes = (Date.now() - t0) / 1000;
    await pc.evaluate(() => { try { CameraRelais.arreter(); } catch (e) { /* déjà arrêté */ } }); await attendre(32000);   // laisse le Worker écrire son budget (une écriture au plus toutes les 30 s)
    await fetch(W.url + '/camera/version'); await attendre(1500); await fetch(W.url + '/camera/version'); await attendre(3000);
    const lignes = lireBudget(W.donnees), l = lignes && lignes[0];
    await pc.close(); if (tel) await tel.close();
    return { nom, chemin: ch, secondes, req, lectures: l ? l.lectures : null, ecritures: l ? l.ecritures : null, requetes: l ? l.requetes : null };
  } finally { W.arreter(); }
}
try {
  const base = await mesurer('base', { camera: false });
  const C = await mesurer('C', { sansRtc: true, sansWs: true });
  const B = await mesurer('B', { sansRtc: true });
  const A = await mesurer('A', {});
  const parMin = (r, champ) => r[champ] == null ? null : Math.round((r[champ] - (base[champ] || 0)) / (r.secondes / 60));
  for (const r of [base, C, B, A]) console.log(r.nom.padEnd(5), 'chemin', String(r.chemin).padEnd(7), 'D1 lignes lues', r.lectures, '· écrites', r.ecritures, '· POST /camera/points', r.req.tel['/camera/points'] || 0, '· GET /camera/lire', r.req.pc['/camera/lire'] || 0, '· signal-lire', r.req.tel['/camera/signal-lire'] || 0);
  console.log('\nPar minute, ligne de base retranchée (budget compté par le Worker) :');
  for (const r of [C, B, A]) console.log('  ' + r.nom + ' : ' + parMin(r, 'ecritures') + ' lignes écrites/min, ' + parMin(r, 'lectures') + ' lignes lues/min  (chemin mesuré : ' + r.chemin + ')');
  verifier('chemin C mesuré = ancien relais', C.chemin === 'worker', C.chemin);
  verifier('chemin B mesuré = relais temps réel', B.chemin === 'relais', B.chemin);
  verifier('chemin A mesuré = direct', A.chemin === 'direct', A.chemin);
  verifier('relais temps réel : AUCUN envoi de points par D1', !(B.req.tel['/camera/points'] > 0));
  verifier('direct : AUCUN envoi de points par D1', !(A.req.tel['/camera/points'] > 0));
  verifier('l’ancien relais (C) écrit dans D1 en continu', (C.req.tel['/camera/points'] || 0) > 100);
  verifier('relais temps réel : au moins 50 fois moins d’écritures D1 que l’ancien relais', C.ecritures != null && B.ecritures != null && (parMin(C, 'ecritures') >= 50 * Math.max(1, parMin(B, 'ecritures'))), JSON.stringify({ C: parMin(C, 'ecritures'), B: parMin(B, 'ecritures') }));
  verifier('relais temps réel : moins de 20 écritures D1 par minute', parMin(B, 'ecritures') < 20, String(parMin(B, 'ecritures')));
  verifier('direct : moins de 20 écritures D1 par minute', parMin(A, 'ecritures') < 20, String(parMin(A, 'ecritures')));
} finally { await nav.close(); serveur.close(); }
fin();
