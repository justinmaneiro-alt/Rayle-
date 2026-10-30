/* Aide commune aux tests Chrome des gestes V10 : un faux Worker (vraie route /camera/* du Worker de Raylé, fausse D1), le vrai serveur local de Rayle, un Chrome « PC » et un Chrome « téléphone »
   qui joue des points enregistrés (window.__RAYLE_CAM_TEST__) ou, si `camera: true`, une fausse caméra de Chrome (--use-fake-device-for-media-stream) pour la vidéo du mode « calcul sur le PC ».
   Ce ne sont PAS une vraie main ni un vrai Wi-Fi : « à valider par Justin avec son Galaxy S23 Ultra ». */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME, attendre } from './terre-aide.mjs';
import { creerServeur } from '../serveur.mjs';
import { BIBLIOTHEQUE } from './v5-aide.mjs';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export { attendre, BIBLIOTHEQUE };

export async function monter({ port = 8160, portWorker = 8799, fausseCamera = false, tailleFenetre = [1400, 900] } = {}) {
  const racineWorker = path.join(RACINE, 'worker/src/camera/relais.js');
  if (!fs.existsSync(racineWorker)) { console.log('worker/ absent (ignoré par git) : test ignoré'); process.exit(0); }
  const R = await import('file:///' + racineWorker.replace(/\\/g, '/')), { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, vals = []) => ({ bind: (...x) => stmt(sql, x), run: async () => { const r = db.prepare(sql).run(...vals); return { meta: { changes: Number(r.changes) } }; }, all: async () => ({ results: db.prepare(sql).all(...vals).map(r => ({ ...r })) }), first: async () => { const r = db.prepare(sql).get(...vals); return r ? { ...r } : null; }, _run: () => db.prepare(sql).run(...vals) });
  const env = { DB: { prepare: sql => stmt(sql), batch: async list => { for (const s of list) s._run(); return []; } } }, CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  const faux = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    const chunks = []; for await (const c of req) chunks.push(c); const corps = Buffer.concat(chunks), url = new URL(req.url, 'http://x');
    if (!R.ROUTES_PUBLIQUES.includes(url.pathname) && url.pathname.startsWith('/camera/') && req.headers['x-rayle-token'] !== 'local') { res.writeHead(401, { ...CORS, 'Content-Type': 'application/json' }); return res.end('{"error":"jeton refusé"}'); }
    if (!url.pathname.startsWith('/camera/')) { res.writeHead(404, { ...CORS, 'Content-Type': 'application/json' }); return res.end('{"error":"route inconnue"}'); }
    const rr = await R.routeCamera(new Request('http://w' + req.url, { method: req.method, body: ['GET', 'HEAD'].includes(req.method) ? undefined : corps }), url, env, {}, CORS);
    res.writeHead(rr.status, { ...CORS, 'Content-Type': 'application/json' }); res.end(await rr.text());
  });
  await new Promise(r => faux.listen(portWorker, '127.0.0.1', r)); const WORKER = 'http://127.0.0.1:' + portWorker;
  const dossierDonnees = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-v10-')), serveur = creerServeur({ portReseau: 0, dossierDonnees, ip: '127.0.0.1' });
  await new Promise(r => serveur.listen(port, '127.0.0.1', r)); const BASE = 'http://127.0.0.1:' + port;
  const argsCommuns = ['--no-first-run', '--disable-features=WebRtcHideLocalIpsWithMdns'];
  const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', ...argsCommuns, '--window-size=' + tailleFenetre.join(',')] });
  const navTel = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: [...argsCommuns, '--window-size=500,900', ...(fausseCamera ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] : [])] });
  const pc = await nav.newPage(); await pc.setViewport({ width: tailleFenetre[0], height: tailleFenetre[1] }); const errPc = [];
  pc.on('pageerror', e => errPc.push(e.message.slice(0, 200)));
  await pc.evaluateOnNewDocument(w => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.removeItem('rayle_gestes'); localStorage.setItem('rayle_worker_url', w); localStorage.setItem('rayle_worker_token', 'local'); window.RAYLE_CAMERA_PAGE = location.origin + '/camera/index.html'; } catch (e) { /* stockage refusé */ } }, WORKER);
  await pc.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(2500);
  await pc.addScriptTag({ path: path.join(RACINE, 'core/gestes/main-synthetique.js') }); await pc.evaluate(code => { window.__T = eval(code); }, BIBLIOTHEQUE);
  const ev = (f, ...a) => pc.evaluate(f, ...a);
  const T = (code, ...a) => pc.evaluate(new Function('...args', 'return (async () => { const T = window.__T; ' + code + ' })()'), ...a);
  /* Connecte un téléphone : `fond` = { ips, frames, camIps, detMs } rejoué en boucle (ou rien si fausseCamera). Renvoie { tel, err }. */
  async function telephone({ fond = null, vendor = false } = {}) {
    await ev(() => { GestesUI.telephone(); }); await attendre(300);
    await ev(() => document.querySelector('#gm-https [data-h="creer"]').click()); await attendre(900);
    const url = await ev(() => CameraRelais.etat().url), tel = await navTel.newPage(); await tel.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true }); const err = [];
    tel.on('pageerror', e => err.push(e.message.slice(0, 200)));
    await tel.evaluateOnNewDocument((s, v, b) => { if (s) window.__RAYLE_CAM_TEST__ = s; if (v) window.__RAYLE_CAM_VENDOR__ = b + '/assets-lourds/gestes/'; }, fond, vendor, BASE);
    await tel.goto(url, { waitUntil: 'load' }); await attendre(500);
    await tel.evaluate(() => document.getElementById('b-rejoindre').click()); await attendre(900);
    await tel.evaluate(() => document.getElementById('b-cam').click()); await attendre(fausseCamera ? 5000 : 1200);
    await ev(() => document.querySelector('#gm-https [data-h="utiliser"]').click()); await attendre(1500);
    await ev(() => GestesUI.fermer());
    return { tel, err };
  }
  async function direct(max = 10000) { let ok = false; for (let t = 0; t < max && !ok; t += 250) { await attendre(250); ok = await ev(() => CameraRelais.etat().liaison === 'direct'); } return ok; }
  const fermer = async () => { try { await nav.close(); } catch (e) { /* déjà fermé */ } try { await navTel.close(); } catch (e) { /* déjà fermé */ } serveur.close(); faux.close(); };
  return { pc, ev, T, telephone, direct, nav, navTel, BASE, WORKER, errPc, fermer };
}
