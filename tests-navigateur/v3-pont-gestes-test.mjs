import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import { creerServeur } from '../serveur.mjs';

/* Pont téléphone → PC pour les gestes (correctif du 2026-10-28), SANS caméra réelle : un VRAI relais (worker/src/camera/relais.js, fausse D1, signalisation WebRTC comprise) tourne derrière un faux Worker HTTP ;
   la page « Caméra Rayle » rejoue des points ENREGISTRÉS (tests-navigateur/fixtures-gestes) ; la page de Rayle (PC) crée la session, reçoit les points et pilote vraiment la page.
   Vérifie : la case « Activer les gestes » et le bouton « Utiliser la caméra du téléphone » marchent SANS webcam PC (message d'état clair) ; liaison directe WebRTC (≥ 25 paquets/s, délai faible, plus de lots vers
   le Worker) ; fenêtre de suivi sur le PC (squelette, geste, liaison, débit, délai ; aperçu vidéo éteint par défaut, JAMAIS sans demande) ; repli par le Worker quand la signalisation manque ; et que les points reçus
   du téléphone pilotent vraiment Rayle : curseur, clic, saisie d'une fenêtre, balayage, rotation 3D, zoom.
   Lancer : node tests-navigateur/v3-pont-gestes-test.mjs   Ce qui ne peut PAS être testé ici : une vraie caméra de téléphone devant une vraie main, un vrai Wi-Fi (à valider par Justin). */
const { verifier, fin } = compteur();
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(RACINE, 'tests-navigateur/fixtures-gestes');
const racineWorker = path.join(RACINE, 'worker/src/camera/relais.js');
if (!fs.existsSync(racineWorker)) { console.log('worker/ absent (ignoré par git) : test ignoré'); process.exit(0); }
const R = await import('file:///' + racineWorker.replace(/\\/g, '/'));
const suite = nom => JSON.parse(fs.readFileSync(path.join(FIX, nom), 'utf8'));
const { DatabaseSync } = await import('node:sqlite');
function fausseD1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, vals = []) => ({ bind: (...x) => stmt(sql, x), run: async () => { const r = db.prepare(sql).run(...vals); return { meta: { changes: Number(r.changes) } }; }, all: async () => ({ results: db.prepare(sql).all(...vals).map(r => ({ ...r })) }), first: async () => { const r = db.prepare(sql).get(...vals); return r ? { ...r } : null; }, _run: () => db.prepare(sql).run(...vals) });
  return { prepare: sql => stmt(sql), batch: async list => { for (const s of list) s._run(); return []; } };
}
const env = { DB: fausseD1() }, vus = { points: 0, signaux: 0, sansSignal: false };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
const faux = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  const chunks = []; for await (const c of req) chunks.push(c); const corps = Buffer.concat(chunks);
  const url = new URL(req.url, 'http://x');
  if (!R.ROUTES_PUBLIQUES.includes(url.pathname) && url.pathname.startsWith('/camera/') && req.headers['x-rayle-token'] !== 'local') { res.writeHead(401, { ...CORS, 'Content-Type': 'application/json' }); return res.end('{"error":"jeton refusé"}'); }
  if (!url.pathname.startsWith('/camera/')) { res.writeHead(404, { ...CORS, 'Content-Type': 'application/json' }); return res.end('{"error":"route inconnue"}'); }
  if (vus.sansSignal && url.pathname.startsWith('/camera/signal')) { res.writeHead(404, { ...CORS, 'Content-Type': 'application/json' }); return res.end('{"error":"route inconnue"}'); }   // Worker pas à jour
  if (url.pathname === '/camera/points') vus.points++; if (url.pathname.startsWith('/camera/signal')) vus.signaux++;
  const rr = await R.routeCamera(new Request('http://w' + req.url, { method: req.method, body: ['GET', 'HEAD'].includes(req.method) ? undefined : corps }), url, env, {}, CORS);
  res.writeHead(rr.status, { ...CORS, 'Content-Type': 'application/json' }); res.end(await rr.text());
});
const PW = 8799; await new Promise(r => faux.listen(PW, '127.0.0.1', r)); const WORKER = 'http://127.0.0.1:' + PW;
const dossierDonnees = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-pont-')), PORT = 8129;
const serveur = creerServeur({ portReseau: 0, dossierDonnees, ip: '127.0.0.1' });
await new Promise(r => serveur.listen(PORT, '127.0.0.1', r)); const BASE = 'http://127.0.0.1:' + PORT;
const mains0 = { frames: [{ t: 0, ratio: 4 / 3, mains: [] }] };   // suite de fond : aucune main (les essais jouent leur suite par __RAYLE_CAM_JOUER__)
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run', '--disable-features=WebRtcHideLocalIpsWithMdns', '--window-size=1400,900'] });
const navTel = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run', '--disable-features=WebRtcHideLocalIpsWithMdns', '--window-size=500,900'] });   // le « téléphone » est un second Chrome : chaque page reste visible (sinon le navigateur fige les animations de l'autre)   // PAS de caméra factice : le PC n'a aucune webcam
try {
  const pc = await nav.newPage(); await pc.setViewport({ width: 1400, height: 900 }); const errPc = [];
  pc.on('pageerror', e => errPc.push(e.message.slice(0, 200)));
  await pc.evaluateOnNewDocument((w) => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_gestes', '{"moteur":"v2"}'); localStorage.setItem('rayle_worker_url', w); localStorage.setItem('rayle_worker_token', 'local'); window.RAYLE_CAMERA_PAGE = location.origin + '/camera/index.html'; } catch (e) { /* stockage refusé */ } }, WORKER);
  await pc.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(2500);
  const ev = (f, ...a) => pc.evaluate(f, ...a);
  const placer = async (x, y) => ev(async (x2, y2) => { for (let i = 0; i < 6; i++) Telecommande.appliquer({ a: 'pointeur', dx: -300, dy: -300 }); let rx = x2, ry = y2; while (rx > 0) { const d = Math.min(300, rx); Telecommande.appliquer({ a: 'pointeur', dx: d, dy: 0 }); rx -= d; } while (ry > 0) { const d = Math.min(300, ry); Telecommande.appliquer({ a: 'pointeur', dx: 0, dy: d }); ry -= d; } return Telecommande.position(); }, x, y);
  verifier('le PC n’a aucune webcam (condition du bug)', await ev(async () => { const d = await navigator.mediaDevices.enumerateDevices(); return !d.some(x => x.kind === 'videoinput'); }));

  // ── 1. le bug d'origine : sans téléphone, la case lance la webcam et le dit clairement ──
  await ev(() => { GestesUI.fermer(); document.getElementById('gs-actif').click(); }); await attendre(1500);
  verifier('sans téléphone ni webcam : la case reste décochée et le message dit quoi faire', await ev(() => !document.getElementById('gs-actif').checked && /Aucune caméra détectée/.test(document.getElementById('gs-etat').textContent) && /téléphone/.test(document.getElementById('gs-etat').textContent)));

  // ── 2. un téléphone se connecte (QR → jeton → caméra) ──
  async function telephoneConnecte(fond = mains0) {
    await ev(() => { GestesUI.telephone(); }); await attendre(300);
    await ev(() => document.querySelector('#gm-https [data-h="creer"]').click()); await attendre(900);
    const url = await ev(() => CameraRelais.etat().url);
    const tel = await navTel.newPage(); await tel.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true }); const err = [];
    tel.on('pageerror', e => err.push(e.message.slice(0, 200)));
    await tel.evaluateOnNewDocument((s) => { window.__RAYLE_CAM_TEST__ = s; }, fond);
    await tel.goto(url, { waitUntil: 'load' }); await attendre(500);
    await tel.evaluate(() => document.getElementById('b-rejoindre').click()); await attendre(900);
    await tel.evaluate(() => document.getElementById('b-cam').click()); await attendre(1200);
    return { tel, err };
  }
  const { tel, err: errTel } = await telephoneConnecte();
  verifier('le PC voit le téléphone « connecté »', await ev(() => CameraRelais.etat().etat === 'connecte'));
  const sessionAvant = await ev(() => CameraRelais.etat().session);

  // ── 3. la case « Activer les gestes » ne dépend plus d'une webcam ──
  await ev(() => GestesUI.fermer()); await attendre(100);
  await ev(() => document.getElementById('gs-actif').click()); await attendre(1500);
  const c1 = await ev(() => ({ coche: document.getElementById('gs-actif').checked, g: Gestes.etat(), t: document.getElementById('gs-etat').textContent, src: document.getElementById('gs-source').value }));
  verifier('la case se coche et les gestes démarrent avec la caméra du téléphone (aucune webcam)', c1.coche && c1.g.actif && c1.g.source === 'telephone-https' && !c1.g.erreur, JSON.stringify({ ...c1, g: { ...c1.g, derniere: '' } }).slice(0, 300));
  verifier('le texte d’état dit « caméra du téléphone », plus « Aucune caméra »', /caméra du téléphone/.test(c1.t) && !/Aucune caméra/.test(c1.t), c1.t);
  verifier('la liste « Caméra » affiche la source réelle (téléphone HTTPS)', c1.src === 'telephone-https');
  verifier('la session du téléphone est la même (la case ne l’a pas coupée)', await ev(() => CameraRelais.etat().session) === sessionAvant);
  await ev(() => document.getElementById('gs-actif').click()); await attendre(800);
  verifier('décocher coupe les gestes (le curseur est libéré)', await ev(() => !Gestes.etat().actif && !document.getElementById('gs-actif').checked));
  const vo = await ev(async () => Gestes.traiterVoix('Raylé, active les gestes')); await attendre(300);
  verifier('voix « active les gestes » : prend le téléphone connecté, sans webcam', await ev(() => Gestes.etat().actif && Gestes.etat().source === 'telephone-https') && /activés/i.test(vo || ''), String(vo));
  await ev(() => Gestes.desactiver()); await attendre(300);
  verifier('desactiver ferme la session du téléphone (comportement voulu) : on la refait', await ev(() => CameraRelais.etat().etat === 'inactive' || CameraRelais.etat().session === null));
  await tel.close();

  // ── 4. le bouton « Utiliser la caméra du téléphone pour les gestes » ──
  const t2 = await telephoneConnecte(); const tel2 = t2.tel;
  const avantBouton = await ev(() => { const g = Gestes.etat(); return { actif: g.actif, session: CameraRelais.etat().session }; });
  verifier('avant le bouton : gestes éteints, case décochée', !avantBouton.actif && await ev(() => !document.getElementById('gs-actif').checked));
  await ev(() => document.querySelector('#gm-https [data-h="utiliser"]').click()); await attendre(1500);
  const b1 = await ev(() => ({ coche: document.getElementById('gs-actif').checked, g: Gestes.etat(), msg: (document.getElementById('gm-etat-gestes') || {}).textContent, ok: (document.getElementById('gm-etat-gestes') || { className: '' }).className, src: document.getElementById('gs-source').value, pastille: document.getElementById('gestes-pastille').textContent }));
  verifier('le bouton coche la case, active les gestes et fixe la source « caméra du téléphone »', b1.coche && b1.g.actif && b1.g.source === 'telephone-https' && b1.src === 'telephone-https', JSON.stringify(b1).slice(0, 300));
  verifier('un message d’état clair est affiché à côté du bouton', /Gestes activés avec la caméra du téléphone/.test(b1.msg || '') && /ok/.test(b1.ok), b1.msg);
  verifier('la pastille dit « caméra du téléphone »', /caméra du téléphone/.test(b1.pastille), b1.pastille);
  const sess = await ev(() => CameraRelais.etat().session);
  await ev(() => document.querySelector('#gm-https [data-h="utiliser"]').click()); await attendre(800);
  verifier('un second appui sur le bouton ne coupe pas la session du téléphone', await ev(() => Gestes.etat().actif && CameraRelais.etat().session) === sess);
  verifier('la source est mémorisée (rayle_gestes.source)', await ev(() => JSON.parse(localStorage.getItem('rayle_gestes')).source) === 'telephone-https');

  // ── 5. liaison directe : débit et délai ──
  let direct = false; for (let i = 0; i < 40 && !direct; i++) { await attendre(250); direct = await ev(() => CameraRelais.etat().liaison === 'direct'); }
  verifier('la liaison directe WebRTC s’établit', direct, await ev(() => JSON.stringify({ l: CameraRelais.etat().liaison, e: CameraRelais.etat().directEchec })));
  await attendre(2500);
  const d1 = await ev(() => { const e = CameraRelais.etat(); return { debit: e.debit, delai: e.delai, rtt: e.rtt, recues: e.recues }; });
  verifier('au moins 25 paquets par seconde reçus sur le PC', d1.debit >= 25, 'débit ' + d1.debit + '/s');
  verifier('délai mesuré et faible (aller simple < 100 ms)', d1.delai != null && d1.delai < 100, JSON.stringify(d1));
  const lat = await tel2.evaluate(() => document.getElementById('t-lat').textContent);
  verifier('le téléphone affiche aussi « direct », le débit et le délai', /direct/.test(lat) && /paquets\/s/.test(lat) && /ms/.test(lat), lat);
  const p0 = vus.points; await attendre(2000);
  verifier('en direct, plus aucun lot ne part vers le Worker (économie de D1)', vus.points - p0 <= 1, (vus.points - p0) + ' envois en 2 s');
  const r0 = await ev(() => CameraRelais.etat().recues); await attendre(2000); const r1 = await ev(() => CameraRelais.etat().recues);
  verifier('≥ 25 trames/s en continu sur 2 s (compteur de réception)', (r1 - r0) >= 50, (r1 - r0) + ' trames en 2 s');

  // ── 6. fenêtre de suivi ──
  verifier('la fenêtre de suivi s’est ouverte toute seule à l’activation', await ev(() => !!document.getElementById('gestes-tel') && GestesTel.ouverte()));
  await tel2.evaluate((f) => window.__RAYLE_CAM_JOUER__(f), suite('pointer-droite.json').frames.concat(suite('pointer-droite.json').frames.map(x => ({ ...x, t: x.t + 1200 })))); await attendre(900);
  const w1 = await ev(() => { const f = document.getElementById('gestes-tel'), cv = f.querySelector('canvas'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++; const k = x => f.querySelector('[data-k="' + x + '"]').textContent; return { pixels: n, liaison: k('liaison'), debit: k('debit'), delai: k('delai'), geste: k('geste'), mains: k('mains'), recues: k('recues') }; });
  verifier('le squelette des mains est dessiné en direct (points reçus)', w1.pixels > 150, JSON.stringify(w1));
  verifier('la fenêtre dit « liaison directe » et affiche débit et délai', /directe/.test(w1.liaison) && /paquets\/s/.test(w1.debit) && /ms/.test(w1.delai), JSON.stringify(w1));
  verifier('la fenêtre affiche le geste reconnu et le nombre de mains vues', w1.geste && w1.geste !== '—' && w1.mains !== '0', JSON.stringify(w1));
  verifier('aperçu vidéo : case décochée par défaut, image absente', await ev(() => !document.querySelector('#gestes-tel [data-g="apercu"]').checked && document.querySelector('#gestes-tel img').hidden));
  await attendre(1500);
  verifier('sans demande, AUCUNE image n’arrive du téléphone', await ev(() => CameraRelais.etat().apercu === null && CameraRelais.etat().apercuVoulu === false));
  await ev(() => document.querySelector('#gestes-tel [data-g="apercu"]').click()); await attendre(1800);
  const ap = await ev(() => ({ a: CameraRelais.etat().apercu, vis: !document.querySelector('#gestes-tel img').hidden }));
  verifier('l’aperçu coché : une petite image JPEG arrive par la liaison directe', typeof ap.a === 'string' && /^data:image\/jpeg;base64,/.test(ap.a) && ap.a.length < 16000 && ap.vis, String(ap.a).slice(0, 40));
  await ev(() => document.querySelector('#gestes-tel [data-g="apercu"]').click()); await attendre(300);
  await attendre(1200);
  verifier('décoché : l’image disparaît et plus rien n’arrive', await ev(() => CameraRelais.etat().apercu === null && document.querySelector('#gestes-tel img').hidden));
  const tmpA = await ev(() => { CameraRelais.definirApercu(false); return CameraRelais.etat().apercu; }); await attendre(1000);
  verifier('une image qui n’a pas été demandée serait refusée (apercuVoulu faux)', tmpA === null && await ev(() => CameraRelais.etat().apercu === null));
  await ev(() => document.querySelector('#gestes-tel [data-g="fermer"]').click());
  verifier('la fenêtre se ferme (✕) et l’aperçu est coupé', await ev(() => !document.getElementById('gestes-tel') && CameraRelais.etat().apercuVoulu === false));
  await ev(() => document.getElementById('gs-suivi').click());
  verifier('le bouton « Fenêtre de suivi » la rouvre', await ev(() => !!document.getElementById('gestes-tel')));

  // ── 7. les points du téléphone pilotent vraiment Rayle ──
  await ev(() => { GestesUI.fermer(); GestesTel.fermer(); });
  await ev(() => {
    document.body.insertAdjacentHTML('beforeend', '<button id="essai-b" style="position:fixed;left:560px;top:370px;width:80px;height:60px;z-index:2147480000">essai</button><div class="pn" id="essai-fen" style="position:fixed;left:300px;top:340px;width:600px;height:200px;z-index:2147479000;background:#223"><div class="pn-tete" id="essai-tete" style="height:40px;background:#446">titre</div></div>');
    window.__j = { clic: 0, down: 0, move: 0, up: 0, roues: [], msgs: {}, rangs: 0 };
    document.getElementById('essai-b').addEventListener('click', () => window.__j.clic++);
    const t = document.getElementById('essai-tete'); t.addEventListener('pointerdown', () => window.__j.down++); t.addEventListener('pointermove', e => { if (e.buttons & 1) window.__j.move++; }); t.addEventListener('pointerup', () => window.__j.up++);
    document.addEventListener('wheel', e => window.__j.roues.push({ dx: e.deltaX, dy: e.deltaY, ctrl: e.ctrlKey }), true);
    const o = Telecommande.appliquer; Telecommande.appliquer = m => { window.__j.msgs[m.a] = (window.__j.msgs[m.a] || 0) + 1; return o(m); };
  });
  const jouer = async (nom, extra = 900) => { const s = suite(nom); await tel2.evaluate(f => window.__RAYLE_CAM_JOUER__(f), s.frames); await attendre(s.frames.at(-1).t + extra); };
  await placer(600, 400);
  const p1 = await ev(() => Telecommande.position());
  await jouer('pointer-droite.json');
  const p2 = await ev(() => Telecommande.position());
  verifier('CURSEUR : pointer avec l’index déplace le curseur de Rayle', Math.hypot(p2.x - p1.x, p2.y - p1.y) > 15, JSON.stringify({ p1, p2 }));
  await placer(600, 400); await ev(() => { window.__j.clic = 0; });
  await jouer('clic.json');
  verifier('CLIC : un pincement vite relâché clique sur le bouton sous le curseur', await ev(() => window.__j.clic) === 1, 'clics ' + await ev(() => window.__j.clic));
  await placer(350, 480); await ev(() => { window.__j.down = window.__j.move = window.__j.up = 0; });
  await jouer('saisie.json');
  const sj = await ev(() => ({ d: window.__j.down, m: window.__j.move, u: window.__j.up }));
  verifier('SAISIE : la barre de titre de la fenêtre est saisie, déplacée, relâchée', sj.d === 1 && sj.m >= 3 && sj.u === 1, JSON.stringify(sj));
  await placer(600, 400); await ev(() => { window.__j.roues.length = 0; });
  await jouer('balayage.json');
  verifier('BALAYAGE (piles) : un défilement horizontal est envoyé sous le curseur', await ev(() => window.__j.roues.filter(r => Math.abs(r.dx) >= 600).length) >= 1, JSON.stringify(await ev(() => window.__j.roues.slice(0, 4))));
  await ev(() => { window.__j.roues.length = 0; });
  await jouer('zoom-deux-mains.json');
  const zr = await ev(() => window.__j.roues);
  verifier('ZOOM : deux mains pincées qui s’écartent envoient une molette de zoom', zr.length >= 3 && zr.every(r => r.ctrl) && zr.reduce((s, r) => s + r.dy, 0) < -300, JSON.stringify({ n: zr.length, somme: zr.reduce((s, r) => s + r.dy, 0) }));
  await ev(() => { const c = document.createElement('canvas'); c.id = 'essai-3d'; c.width = 6000; c.height = 4000; c.style.cssText = 'position:absolute;left:0;top:0;width:1400px;height:900px;z-index:2147470000'; document.body.appendChild(c); document.querySelectorAll('canvas.entite-canvas').forEach(x => { x.dataset.av = x.style.display; x.style.display = 'none'; }); window.__j.c3 = { d: 0, m: 0, u: 0 }; c.addEventListener('pointerdown', () => window.__j.c3.d++); c.addEventListener('pointermove', e => { if (e.buttons & 1) window.__j.c3.m++; }); c.addEventListener('pointerup', () => window.__j.c3.u++); document.getElementById('essai-fen').style.display = 'none'; document.getElementById('essai-b').style.display = 'none'; });
  await jouer('rotation-deux-mains.json', 1200);
  const c3 = await ev(() => window.__j.c3);
  verifier('ROTATION 3D : deux mains ouvertes qui tournent font pivoter l’objet (bouton gauche enfoncé, déplacements)', c3.d >= 1 && c3.m >= 3, JSON.stringify(c3));
  await ev(() => { document.querySelectorAll('canvas.entite-canvas').forEach(x => { x.style.display = x.dataset.av || ''; }); document.getElementById('essai-3d').remove(); document.getElementById('essai-fen').style.display = ''; document.getElementById('essai-b').style.display = ''; });
  await tel2.close(); await ev(() => Gestes.desactiver()); await attendre(500);

  // ── 8. repli : Worker sans signalisation (ancienne version déployée) ──
  vus.sansSignal = true;
  const t3 = await telephoneConnecte({ frames: suite('pointer-droite.json').frames }); const tel3 = t3.tel;
  await ev(() => document.querySelector('#gm-https [data-h="utiliser"]').click()); await attendre(3500);
  const f1 = await ev(() => { const e = CameraRelais.etat(); return { liaison: e.liaison, recues: e.recues, actif: Gestes.etat().actif }; });
  verifier('Worker sans signalisation : le relais classique continue (liaison « worker »), les gestes restent actifs', f1.liaison === 'worker' && f1.actif && f1.recues > 5, JSON.stringify(f1));
  const lat3 = await tel3.evaluate(() => document.getElementById('t-lat').textContent);
  verifier('le téléphone dit « relais Worker (lent) » et la raison', /relais Worker/.test(lat3) && /signalisation/.test(lat3), lat3);
  const q0 = await ev(() => CameraRelais.etat().recues); await attendre(2000); const q1 = await ev(() => CameraRelais.etat().recues);
  verifier('le relais plus rapide qu’avant : ≥ 8 trames/s même sans direct', (q1 - q0) >= 16, (q1 - q0) + ' trames en 2 s');
  await tel3.close(); await ev(() => Gestes.desactiver());

  verifier('aucune erreur JavaScript dans la page du PC', errPc.length === 0, errPc.join(' | '));
  verifier('aucune erreur JavaScript sur le téléphone', errTel.length === 0 && t2.err.length === 0 && t3.err.length === 0, [...errTel, ...t2.err, ...t3.err].join(' | '));
} finally { await nav.close(); await navTel.close(); serveur.close(); faux.close(); }
fin();
