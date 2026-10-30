import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import { creerServeur } from '../serveur.mjs';
import { BIBLIOTHEQUE } from './v5-aide.mjs';

/* Gestes V5, PHASE 1 : la chaîne COMPLÈTE téléphone → PC, sans caméra réelle. Un faux téléphone (second Chrome, page « Caméra Rayle » réelle, points synthétiques rejoués à 60 images/s) envoie des paquets BINAIRES
   par une vraie liaison WebRTC (signalisation par le vrai relais du Worker, fausse D1). Vérifie : débit ≥ 55 paquets/s, perte ≈ 0, délai de bout en bout < 60 ms, paquets binaires de ≈ 100–184 octets, annonce des capacités,
   repli JSON si le PC ne sait pas lire le binaire, fenêtre de suivi (débit, délai, perte, confiance), conseil sous 25 paquets/s, bouton « Économie » du téléphone, et que la main du téléphone pilote vraiment Rayle
   (engager, pointer, cliquer, saisir une fenêtre). Lancer : node tests-navigateur/v5-pont-test.mjs   Ce qui ne peut PAS être testé ici : une vraie caméra et un vrai Wi-Fi (à valider par Justin). */
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
const env = { DB: fausseD1() }, CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
const faux = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  const chunks = []; for await (const c of req) chunks.push(c); const corps = Buffer.concat(chunks), url = new URL(req.url, 'http://x');
  if (!R.ROUTES_PUBLIQUES.includes(url.pathname) && url.pathname.startsWith('/camera/') && req.headers['x-rayle-token'] !== 'local') { res.writeHead(401, { ...CORS, 'Content-Type': 'application/json' }); return res.end('{"error":"jeton refusé"}'); }
  if (!url.pathname.startsWith('/camera/')) { res.writeHead(404, { ...CORS, 'Content-Type': 'application/json' }); return res.end('{"error":"route inconnue"}'); }
  const rr = await R.routeCamera(new Request('http://w' + req.url, { method: req.method, body: ['GET', 'HEAD'].includes(req.method) ? undefined : corps }), url, env, {}, CORS);
  res.writeHead(rr.status, { ...CORS, 'Content-Type': 'application/json' }); res.end(await rr.text());
});
const PW = 8798; await new Promise(r => faux.listen(PW, '127.0.0.1', r)); const WORKER = 'http://127.0.0.1:' + PW;
const dossierDonnees = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-v5pont-')), PORT = 8144;
const serveur = creerServeur({ portReseau: 0, dossierDonnees, ip: '127.0.0.1' });
await new Promise(r => serveur.listen(PORT, '127.0.0.1', r)); const BASE = 'http://127.0.0.1:' + PORT;
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run', '--disable-features=WebRtcHideLocalIpsWithMdns', '--window-size=1400,900'] });
const navTel = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run', '--disable-features=WebRtcHideLocalIpsWithMdns', '--window-size=500,900'] });
try {
  const pc = await nav.newPage(); await pc.setViewport({ width: 1400, height: 900 }); const errPc = [];
  pc.on('pageerror', e => errPc.push(e.message.slice(0, 200)));
  await pc.evaluateOnNewDocument((w) => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_gestes', '{"gestesAvances":true}'); localStorage.setItem('rayle_worker_url', w); localStorage.setItem('rayle_worker_token', 'local'); window.RAYLE_CAMERA_PAGE = location.origin + '/camera/index.html'; } catch (e) { /* stockage refusé */ } }, WORKER);
  await pc.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(2500);
  await pc.addScriptTag({ path: path.join(RACINE, 'core/gestes/main-synthetique.js') }); await pc.evaluate(code => { window.__T = eval(code); }, BIBLIOTHEQUE);
  const ev = (f, ...a) => pc.evaluate(f, ...a);
  const T = (code, ...a) => pc.evaluate(new Function('...args', 'return (async () => { const T = window.__T; ' + code + ' })()'), ...a);
  // banc : un bouton, une fenêtre saisissable
  await ev(async () => {
    const { creerGestionnaire, chargerStyle } = await import('/core/commun/gestionnaire-fenetres.js'), { creerCalcul } = await import('/core/commun/fenetres-calcul.js');
    chargerStyle(); const ui = document.createElement('div'); ui.style.cssText = 'position:fixed;inset:0;z-index:2147470000;pointer-events:none'; document.body.appendChild(ui);
    window.__gf = creerGestionnaire({ ui, calc: creerCalcul({ haut: 64, bas: 78, miniL: 260, miniH: 160 }), cle: 'v5pont', vue: 'Banc' });
    window.__gf.ouvrir({ id: 'f1', titre: 'Fenêtre d’essai', genre: 'panneau', taille: { l: 420, h: 280 }, contenu: '<p>Contenu</p>' }); window.__gf.deplacer('f1', 120, 140);
    window.__j = { clic: 0 }; document.body.insertAdjacentHTML('beforeend', '<button id="gros" style="position:fixed;left:900px;top:300px;width:120px;height:60px;z-index:2147469000">bouton</button>'); document.getElementById('gros').addEventListener('click', () => window.__j.clic++);
  });
  async function telephone({ ips = 60, fond = null } = {}) {
    await ev(() => { GestesUI.telephone(); }); await attendre(300);
    await ev(() => document.querySelector('#gm-https [data-h="creer"]').click()); await attendre(900);
    const url = await ev(() => CameraRelais.etat().url);
    const tel = await navTel.newPage(); await tel.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true }); const err = [];
    tel.on('pageerror', e => err.push(e.message.slice(0, 200)));
    await tel.evaluateOnNewDocument((s) => { window.__RAYLE_CAM_TEST__ = s; }, fond || { ips, frames: [{ t: 0, ratio: 4 / 3, mains: [] }] });
    await tel.goto(url, { waitUntil: 'load' }); await attendre(500);
    await tel.evaluate(() => document.getElementById('b-rejoindre').click()); await attendre(900);
    await tel.evaluate(() => document.getElementById('b-cam').click()); await attendre(1200);
    await ev(() => document.querySelector('#gm-https [data-h="utiliser"]').click()); await attendre(1500);
    await ev(() => GestesUI.fermer());   // la fenêtre du QR recouvre l'écran : on la ferme comme le ferait l'utilisateur
    return { tel, err };
  }
  // main au repos pour le débit (une vraie main immobile : 21 points à 60/s)
  const reposMain = await ev(() => { const s = new __T.Suite(); s.tenir('pointer', 700, 450, 100); return s.frames.slice(0, 3); });
  const { tel, err: errTel } = await telephone({ fond: { ips: 60, frames: reposMain } });
  let direct = false; for (let i = 0; i < 40 && !direct; i++) { await attendre(250); direct = await ev(() => CameraRelais.etat().liaison === 'direct'); }
  verifier('la liaison directe WebRTC s’établit', direct);
  await attendre(3500);
  const d = await ev(() => { const e = CameraRelais.etat(); return { debit: e.debit, delai: e.delai, delaiTotal: e.delaiTotal, perte: e.perte, binaire: e.binaire, ecartes: e.ecartes, gigue: e.gigue, conseil: e.conseil, traitement: e.traitement, conf: e.confiance }; });
  verifier('paquets BINAIRES reçus (annonce des capacités prise en compte par le téléphone)', d.binaire === true, JSON.stringify(d));
  verifier('débit ≥ 55 paquets/s à 60 images/s envoyées (objectif ≥ 30, visé 45 à 60)', d.debit >= 55, 'débit ' + d.debit + '/s');
  verifier('délai de bout en bout < 60 ms', d.delaiTotal != null && d.delaiTotal < 60, JSON.stringify(d));
  verifier('perte de paquets < 3 %', d.perte < 0.03, 'perte ' + Math.round(d.perte * 1000) / 10 + ' %');
  verifier('traitement sur le PC < 3 ms par paquet', d.traitement < 3, String(d.traitement));
  verifier('aucun conseil affiché quand tout va bien', d.conseil === '', d.conseil);
  const tailles = await ev(async () => { const PB = window.PaquetBinaire; const b = PB.encoder({ t: Date.now(), ratio: 1.333, mains: [MainSynthetique.creerMain({ pose: 'pointer' })], seq: 1 }); return b.byteLength; });
  verifier('un paquet à une main fait 100 octets (au lieu de ≈ 1,4 Ko en JSON)', tailles === 100, String(tailles));
  const lat = await tel.evaluate(() => document.getElementById('t-lat').textContent);
  verifier('le téléphone affiche le débit réel et le délai de bout en bout', /direct/.test(lat) && /paquets\/s/.test(lat) && /délai \d+ ms/.test(lat), lat);
  // fenêtre de suivi
  await ev(() => GestesTel.ouvrir()); await attendre(800);
  const w = await ev(() => { const f = document.getElementById('gestes-tel'), k = x => f.querySelector('[data-k="' + x + '"]'); return { debit: k('debit').textContent, delai: k('delai').textContent, perte: k('perte').textContent, conf: +k('conf').value, confT: k('confT').textContent, geste: k('geste').textContent }; });
  verifier('fenêtre de suivi : débit (binaires), délai de bout en bout, perte, barre de confiance', /binaires/.test(w.debit) && /de bout en bout/.test(w.delai) && /perdus/.test(w.perte) && w.conf > 0 && /%/.test(w.confT), JSON.stringify(w));
  // la main du téléphone pilote Rayle : engager → pointer → cliquer → saisir
  const suite = nom => nom;
  const frames = await T(`const s = new T.Suite(); s.engager(900, 500).vers(960, 330, 500).pointer(960, 330, 300).clic(960, 330).tenir('pointer', 960, 330, 300); const f = s.frames.map(x => ({ t: x.t, ratio: x.ratio, mains: x.mains })); return f;`);
  await ev(() => { window.__ev = []; window.__act = []; Gestes.surEvenement((t, d) => { if (t === 'geste') window.__ev.push(d.type); }); const o = GestesV5Actions.appliquer; GestesV5Actions.appliquer = z => { for (const a of z.actions) if (a.a !== 'curseur' && a.a !== 'deplace') window.__act.push(a.a === 'clic' ? 'clic@' + Math.round(a.x) + ',' + Math.round(a.y) + ' pos' + JSON.stringify(Telecommande.position()) + ' sous:' + (document.elementFromPoint(a.x, a.y) || {}).id : a.a); return o(z); }; });
  await tel.evaluate((f) => window.__RAYLE_CAM_JOUER__(f), frames); await attendre(frames.at(-1).t + 400);
  const e1 = await ev(() => ({ engage: Gestes.etat().engage, clics: window.__j.clic, pos: Telecommande.position(), mode: Gestes.etat().mode, ev: window.__ev, act: window.__act, n: CameraRelais.etat().recues }));
  verifier('la main du téléphone ENGAGE les gestes (main ouverte ≈ 1 s)', e1.engage, JSON.stringify(e1));
  verifier('…déplace le curseur de Rayle sur le bouton et CLIQUE dessus (une fois)', e1.clics === 1 && /clic@9[3-9]\d,3[0-5]\d/.test(e1.act.join(' ')), JSON.stringify(e1));
  const r0 = await ev(() => { const r = window.__gf.obtenir('f1').el.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  const sx = r0.x + 150, sy = r0.y + 18;
  const f2 = await T(`const s = new T.Suite(); s.pointer(${sx}, ${sy}, 300).glisser(${sx}, ${sy}, ${sx + 200}, ${sy + 120}); return s.frames.map(x => ({ t: x.t, ratio: x.ratio, mains: x.mains }));`);
  await tel.evaluate((f) => window.__RAYLE_CAM_JOUER__(f), f2); await attendre(f2.at(-1).t + 1200);
  const r1 = await ev(() => { const r = window.__gf.obtenir('f1').el.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  verifier('…et SAISIT une fenêtre par sa barre de titre pour la déplacer (+200, +120 à 40 px près)', Math.abs(r1.x - r0.x - 200) < 45 && Math.abs(r1.y - r0.y - 120) < 45, JSON.stringify({ r0, r1 }));
  // main hors du cadre < 0,5 s pendant une saisie : rien n'est lâché
  const rr0 = await ev(() => { const r = window.__gf.obtenir('f1').el.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  const f3 = await T(`const s = new T.Suite(); const x = ${rr0.x + 150}, y = ${rr0.y + 18}; s.pointer(x, y, 300).fermerPince(x, y).tenir('pince', x, y, 400); s.vide(300); s.tenir('pince', x, y, 200); s.aller('pince', x + 120, y + 60, 400); s.rouvrirPince(x + 120, y + 60); s.tenir('pointer', x + 120, y + 60, 300); return s.frames.map(f => ({ t: f.t, ratio: f.ratio, mains: f.mains }));`);
  await tel.evaluate((f) => window.__RAYLE_CAM_JOUER__(f), f3); await attendre(f3.at(-1).t + 1200);
  const rr1 = await ev(() => { const r = window.__gf.obtenir('f1').el.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  verifier('main sortie du cadre 0,3 s en tenant la fenêtre : l’état est conservé, la fenêtre suit après le retour (+120, +60)', Math.abs(rr1.x - rr0.x - 120) < 45 && Math.abs(rr1.y - rr0.y - 60) < 45, JSON.stringify({ rr0, rr1 }));
  // bouton Économie du téléphone
  await tel.evaluate(() => document.getElementById('b-eco').click()); await attendre(1200);
  verifier('bouton « Économie » du téléphone : aperçu coupé, mémorisé, le débit reste ≥ 55', await tel.evaluate(() => document.getElementById('apercu').hidden && localStorage.getItem('rayle_cam_eco') === '1') && await ev(() => CameraRelais.etat().debit) >= 55);
  // fenêtre « Pause » (poing) sur la chaîne
  const f4 = await T(`const s = new T.Suite(); s.pointer(700, 450, 200).poing(700, 450, 2500); return s.frames.map(f => ({ t: f.t, ratio: f.ratio, mains: f.mains }));`);
  await tel.evaluate((f) => window.__RAYLE_CAM_JOUER__(f), f4); await attendre(f4.at(-1).t + 700);
  verifier('poing immobile tenu 2 s depuis le téléphone (mode avancé) : pause', await ev(() => Gestes.etat().pause));
  await tel.close();

  // ── repli : un PC qui ne sait pas lire le binaire reçoit du JSON ──
  await ev(() => { Gestes.desactiver(); });
  await attendre(500);
  await ev(() => { window.__PB_SAUVE = window.PaquetBinaire; window.PaquetBinaire = undefined; });   // le PC « ancien » : pas de module binaire => il n'annonce pas la capacité
  const t2 = await telephone({ ips: 30 });
  let direct2 = false; for (let i = 0; i < 40 && !direct2; i++) { await attendre(250); direct2 = await ev(() => CameraRelais.etat().liaison === 'direct'); }
  await attendre(2500);
  const d2 = await ev(() => { const e = CameraRelais.etat(); return { liaison: e.liaison, debit: e.debit, binaire: e.binaire }; });
  verifier('PC sans module binaire : le téléphone reste en JSON et les trames arrivent quand même (≥ 25/s)', direct2 && d2.binaire === false && d2.debit >= 25, JSON.stringify(d2));
  await t2.tel.close(); await ev(() => { window.PaquetBinaire = window.__PB_SAUVE; });
  verifier('aucune erreur JavaScript dans la page du PC', errPc.length === 0, errPc.slice(0, 2).join(' | '));
  verifier('aucune erreur JavaScript sur le téléphone', errTel.length === 0, errTel.slice(0, 2).join(' | '));
} finally { await nav.close(); await navTel.close(); faux.close(); serveur.close(); }
const ko = fin(); process.exit(ko ? 1 : 0);
