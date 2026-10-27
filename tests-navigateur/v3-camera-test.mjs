import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import { creerServeur } from '../serveur.mjs';

/* V3 phase 4 : caméra du téléphone par HTTPS + Worker, SANS caméra réelle. Un VRAI relais (worker/src/camera/relais.js, fausse D1) tourne derrière un faux Worker HTTP ; la page « Caméra Rayle »
   rejoue des points ENREGISTRÉS (tests-navigateur/fixtures-gestes) ; la page de Rayle (PC) crée la session, affiche le QR, relit les points et les injecte dans le moteur de gestes.
   Vérifie : QR → jeton à usage unique (rescanner = refus), fragment effacé de l'adresse, permission refusée sans plantage, session fermée, aide, aucune vidéo envoyée.
   Lancer : node tests-navigateur/v3-camera-test.mjs   Ce qui ne peut PAS être testé ici : une vraie caméra de téléphone devant une vraie main, le vrai certificat HTTPS de GitHub Pages (à valider par Justin). */
const { verifier, fin } = compteur();
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const racineWorker = path.join(RACINE, 'worker/src/camera/relais.js');
if (!fs.existsSync(racineWorker)) { console.log('worker/ absent (ignoré par git) : test ignoré'); process.exit(0); }
const R = await import('file:///' + racineWorker.replace(/\\/g, '/'));
const { DatabaseSync } = await import('node:sqlite');
function fausseD1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, vals = []) => ({ bind: (...x) => stmt(sql, x), run: async () => { const r = db.prepare(sql).run(...vals); return { meta: { changes: Number(r.changes) } }; }, all: async () => ({ results: db.prepare(sql).all(...vals).map(r => ({ ...r })) }), first: async () => { const r = db.prepare(sql).get(...vals); return r ? { ...r } : null; }, _run: () => db.prepare(sql).run(...vals) });
  return { prepare: sql => stmt(sql), batch: async list => { for (const s of list) s._run(); return []; } };
}
const env = { DB: fausseD1() }, vus = { points: [], corps: [], sansJeton: 0 };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
const faux = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  const chunks = []; for await (const c of req) chunks.push(c); const corps = Buffer.concat(chunks);
  const url = new URL(req.url, 'http://x');
  if (!R.ROUTES_PUBLIQUES.includes(url.pathname) && url.pathname.startsWith('/camera/') && req.headers['x-rayle-token'] !== 'local') { vus.sansJeton++; res.writeHead(401, { ...CORS, 'Content-Type': 'application/json' }); return res.end('{"error":"jeton refusé"}'); }
  if (url.pathname === '/camera/points') vus.corps.push(corps.toString('utf8'));
  if (!url.pathname.startsWith('/camera/')) { res.writeHead(404, { ...CORS, 'Content-Type': 'application/json' }); return res.end('{"error":"route inconnue"}'); }
  const rr = await R.routeCamera(new Request('http://w' + req.url, { method: req.method, body: ['GET', 'HEAD'].includes(req.method) ? undefined : corps }), url, env, {}, CORS);
  res.writeHead(rr.status, { ...CORS, 'Content-Type': 'application/json' }); res.end(await rr.text());
});
const PW = 8798; await new Promise(r => faux.listen(PW, '127.0.0.1', r)); const WORKER = 'http://127.0.0.1:' + PW;

const dossierDonnees = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-cam3-')), PORT = 8128;
const serveur = creerServeur({ portReseau: 0, dossierDonnees, ip: '127.0.0.1' });
await new Promise(r => serveur.listen(PORT, '127.0.0.1', r)); const BASE = 'http://127.0.0.1:' + PORT;
const suite = JSON.parse(fs.readFileSync(path.join(RACINE, 'tests-navigateur/fixtures-gestes/pointer-droite.json'), 'utf8'));
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run'] });
try {
  // ── page de Rayle (PC) ──
  const pc = await nav.newPage(); await pc.setViewport({ width: 1400, height: 900 }); const errPc = [];
  pc.on('pageerror', e => errPc.push(e.message.slice(0, 200)));
  await pc.evaluateOnNewDocument((w) => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.removeItem('rayle_gestes'); localStorage.setItem('rayle_worker_url', w); localStorage.setItem('rayle_worker_token', 'local'); window.RAYLE_CAMERA_PAGE = location.origin + '/camera/index.html'; } catch (e) { /* stockage refusé */ } }, WORKER);
  await pc.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(2500);
  const evpc = (f, ...a) => pc.evaluate(f, ...a);
  verifier('CameraRelais et QrMatrice sont chargés', await evpc(() => !!window.CameraRelais && !!window.QrMatrice));
  verifier('le Worker est configuré dans la page', await evpc(() => typeof workerReady !== 'undefined' && workerReady()));
  verifier('l’interface propose le QR sécurisé HTTPS', await evpc(() => { GestesUI.telephone(); return !!document.getElementById('gm-https') && /QR code sécurisé/.test(document.getElementById('gm-https').textContent); }));

  // création de la session depuis le bouton
  await evpc(() => document.querySelector('#gm-https [data-h="creer"]').click()); await attendre(800);
  const e1 = await evpc(() => { const e = CameraRelais.etat(); return { etat: e.etat, url: e.url, qr: !!e.qr, n: e.qr && e.qr.length, svg: !!document.querySelector('#gm-https svg'), texte: document.getElementById('gm-https').textContent.slice(0, 400) }; });
  verifier('la session est créée : état « attente » avec un QR', e1.etat === 'attente' && e1.qr && e1.svg, JSON.stringify(e1).slice(0, 200));
  verifier('le QR est dessiné dans la fenêtre', e1.n >= 25);
  verifier('l’adresse du QR contient session, jeton et Worker dans le FRAGMENT', /\/camera\/index\.html#s=[\w-]+&j=[\w-]{20,}&w=(?:http:\/\/)?127\.0\.0\.1:8798$/.test(e1.url), e1.url);
  verifier('le délai d’expiration est affiché', /expire dans <b>|expire dans/.test(e1.texte) || /minutes?|min/.test(e1.texte));
  const url = e1.url;

  // ── téléphone 1 : scanne le QR ──
  const tel = await nav.newPage(); await tel.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true }); const errTel = [];
  tel.on('pageerror', e => errTel.push(e.message.slice(0, 200)));
  await tel.evaluateOnNewDocument((s) => { window.__RAYLE_CAM_TEST__ = s; }, suite);
  await tel.goto(url, { waitUntil: 'load' }); await attendre(600);
  verifier('le téléphone affiche l’écran de connexion (pas de saisie de code)', await tel.evaluate(() => !document.getElementById('s-worker').hidden && document.getElementById('s-appairage').hidden));
  verifier('le jeton est EFFACÉ de la barre d’adresse (fragment vide)', await tel.evaluate(() => location.hash === '' && !location.href.includes('j=')), await tel.evaluate(() => location.href));
  verifier('la page explique que la vidéo ne quitte pas le téléphone', await tel.evaluate(() => /vidéo ne quitte jamais ce téléphone/.test(document.getElementById('s-worker').textContent)));
  await tel.evaluate(() => document.getElementById('b-rejoindre').click()); await attendre(900);
  verifier('connecté : l’écran caméra apparaît', await tel.evaluate(() => !document.getElementById('s-camera').hidden && document.getElementById('s-worker').hidden), await tel.evaluate(() => document.getElementById('m-worker').textContent));
  verifier('le voyant dit « Connecté à Rayle »', await tel.evaluate(() => /Connecté à Rayle/.test(document.getElementById('t-pc').textContent)));
  await attendre(1500);
  const e2 = await evpc(() => { const e = CameraRelais.etat(); return { etat: e.etat, jeton: e.jeton }; });
  verifier('le PC voit le téléphone « connecte » et ne garde plus le jeton', e2.etat === 'connecte' && e2.jeton === null, JSON.stringify(e2));

  // ── usage unique : un second téléphone avec le MÊME QR est refusé ──
  const tel2 = await nav.newPage(); await tel2.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true });
  await tel2.goto(url, { waitUntil: 'load' }); await attendre(400);
  await tel2.evaluate(() => document.getElementById('b-rejoindre').click()); await attendre(900);
  const refus = await tel2.evaluate(() => ({ camera: !document.getElementById('s-camera').hidden, msg: document.getElementById('m-worker').textContent }));
  verifier('le MÊME QR rescanné est REFUSÉ (usage unique)', !refus.camera && /déjà utilisé|expiré|inconnu/.test(refus.msg), refus.msg);
  verifier('le message dit de redemander un QR au PC', /edemande un QR code/.test(refus.msg));
  await tel2.close();

  // ── lien tronqué / sans jeton ──
  const tel3 = await nav.newPage(); await tel3.goto(BASE + '/camera/index.html#s=abc123&w=127.0.0.1:8798', { waitUntil: 'load' }); await attendre(300);
  verifier('lien sans jeton : message clair, aucun bouton de connexion', await tel3.evaluate(() => /incomplet ou périmé/.test(document.getElementById('m-worker').textContent) && document.getElementById('b-rejoindre').hidden));
  await tel3.close();
  const tel4 = await nav.newPage(); await tel4.goto(BASE + '/camera/index.html', { waitUntil: 'load' }); await attendre(600);
  verifier('page ouverte sans QR (ni fragment) : pas d’écran de connexion Worker', await tel4.evaluate(() => document.getElementById('s-worker').hidden));
  await tel4.close();

  // ── la caméra (points enregistrés) envoie des points ; le PC les reçoit et les injecte ──
  await tel.evaluate(() => document.getElementById('b-cam').click()); await attendre(2500);
  verifier('le téléphone dit « caméra active »', await tel.evaluate(() => /caméra active/.test(document.getElementById('t-cam').textContent)));
  const msgs = await evpc(async () => { window.__m = {}; const o = Telecommande.appliquer; Telecommande.appliquer = m => { window.__m[m.a] = (window.__m[m.a] || 0) + 1; return o(m); }; await Gestes.activer({ source: 'telephone-https' }); return Gestes.etat().actif; });
  verifier('les gestes s’activent avec la source « téléphone (HTTPS) »', msgs === true);
  await attendre(3500);
  const g = await evpc(() => ({ e: Gestes.etat(), r: CameraRelais.etat(), m: window.__m }));
  verifier('le PC a reçu des trames de points', g.r.recues > 20, 'recues ' + g.r.recues);
  verifier('le moteur de gestes voit une main', g.e.mains >= 1 || (g.m.pointeur || 0) > 0, JSON.stringify(g.m));
  verifier('des messages de curseur sont partis vers la télécommande interne', (g.m.pointeur || 0) > 0, JSON.stringify(g.m));
  verifier('le téléphone envoie bien par paquets (moins de requêtes que de trames)', vus.corps.length > 5 && vus.corps.length < g.r.recues, vus.corps.length + ' envois / ' + g.r.recues + ' trames');

  // ── jamais de vidéo ni d'image envoyée ──
  const tout = vus.corps.join('');
  verifier('aucun envoi ne contient d’image ni de vidéo (data:, blob:, base64 d’image)', !/data:|blob:|image\/|video\/|base64/i.test(tout));
  verifier('chaque envoi ne contient que s, cle et des trames de points', vus.corps.every(c => { const j = JSON.parse(c); return Object.keys(j).sort().join() === 'cle,s,trames' && j.trames.every(t => Object.keys(t).sort().join() === 'a,mains,ratio,t' && t.mains.every(m => m.pts.length === 21)); }));
  verifier('les routes du PC exigent le jeton de l’appareil (aucun appel sans lui)', vus.sansJeton === 0);

  // ── sans jeton, le Worker refuse les routes du PC ──
  const sans = await fetch(WORKER + '/camera/lire?s=x'); verifier('lire une session sans jeton d’appareil : 401', sans.status === 401);
  const sans2 = await fetch(WORKER + '/camera/session', { method: 'POST', body: '{}' }); verifier('créer une session sans jeton d’appareil : 401', sans2.status === 401);

  // ── fermeture depuis le PC ──
  await evpc(() => document.querySelector('#gm-https [data-h="fermer"]').click()); await attendre(1500);
  verifier('le PC ferme la session : gestes arrêtés', await evpc(() => Gestes.etat().actif === false && CameraRelais.etat().etat === 'inactive'));
  await attendre(800);
  verifier('le téléphone apprend la fin de session', await tel.evaluate(() => /terminée|fermée/.test(document.getElementById('m-worker').textContent) && document.getElementById('s-camera').hidden), await tel.evaluate(() => document.getElementById('m-worker').textContent));
  verifier('plus aucune caméra active sur le téléphone', await tel.evaluate(() => /caméra arrêtée/.test(document.getElementById('t-cam').textContent) || document.getElementById('s-camera').hidden));

  // ── expiration du QR (jamais scanné) ──
  await evpc(() => document.querySelector('#gm-https [data-h="creer"]').click()); await attendre(800);
  const url2 = await evpc(() => CameraRelais.etat().url);
  const r = await R.rejoindre(env.DB, new URL(url2).hash.match(/j=([\w-]+)/)[1], Date.now() + R.TTL_JETON_MS + 5000);
  verifier('un QR jamais scanné expire (jeton refusé après 5 minutes)', r.code === 403);
  await evpc(() => document.querySelector('#gm-https [data-h="fermer"]').click()); await attendre(500);

  // ── permission caméra refusée : message clair, pas de plantage ──
  const tel5 = await nav.newPage(); await tel5.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true });
  await evpc(() => document.querySelector('#gm-https [data-h="creer"]').click()); await attendre(800);
  const url3 = await evpc(() => CameraRelais.etat().url);
  await tel5.evaluateOnNewDocument(() => { navigator.mediaDevices.getUserMedia = async () => { throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }); }; });
  await tel5.goto(url3, { waitUntil: 'load' }); await attendre(400);
  await tel5.evaluate(() => document.getElementById('b-rejoindre').click()); await attendre(900);
  await tel5.evaluate(() => document.getElementById('b-cam').click()).catch(() => {}); await attendre(5000);
  const den = await tel5.evaluate(() => document.getElementById('m-cam').textContent);
  verifier('caméra refusée : message d’aide (où l’autoriser), bouton de nouveau disponible', /Caméra refusée/.test(den) && /Autorisations|Réglages/.test(den), den.slice(0, 120));
  verifier('caméra refusée : le téléphone reste connecté et sûr (aucun point envoyé)', await tel5.evaluate(() => !document.getElementById('b-cam').disabled));
  await tel5.close();
  await evpc(() => document.querySelector('#gm-https [data-h="fermer"]').click());

  verifier('aucune erreur JavaScript dans la page du PC', errPc.length === 0, errPc.join(' | '));
  verifier('aucune erreur JavaScript sur le téléphone', errTel.length === 0, errTel.join(' | '));
} finally { await nav.close(); serveur.close(); faux.close(); }
fin();
