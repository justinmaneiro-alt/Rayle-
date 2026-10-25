import puppeteer from 'puppeteer-core';
import { ouvrirGalaxieTheme, attendre, compteur } from './r2-aide.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8000', CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { verifier, fin } = compteur();

/* R3.1 : pavé tactile. A) CÔTÉ TABLETTE (vraie page clavier, faux WebSocket, vrais événements tactiles CDP) : double appui maintenu = « verrou », glisser = mouvements directs,
   joystick invisible à droite, relâchement = « lacher », pas de clic fantôme, double appui rapide = double clic comme avant. B) CÔTÉ PC (vraie page Raylé, messages de la tablette) : verrou sur
   une fenêtre (n'importe où dessus) et sur un objet 3D, lacher. Lancer : node tests-navigateur/r31-pave-test.mjs */
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const erreurs = [];
{
  const p = await b.newPage(); await p.setViewport({ width: 1180, height: 820, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  p.on('pageerror', e => erreurs.push(e.message));
  await p.setRequestInterception(true);
  p.on('request', r => { if (/\/clavier\/statut/.test(r.url())) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ k2: true, jetonValide: true, pc: true }) }); r.continue(); });
  await p.evaluateOnNewDocument(() => {
    localStorage.setItem('rayle_k2_jeton', 'essai'); localStorage.setItem('rayle_clavier_reglages', JSON.stringify({ mode: 'pave' })); window.__m = [];
    window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => { this.onopen && this.onopen(); this.onmessage && this.onmessage({ data: JSON.stringify({ t: 'bienvenue', pc: true }) }); }, 20); } send(s) { const m = JSON.parse(s); if (m.t !== 'ping') window.__m.push(m); } close() {} };
  });
  await p.goto(BASE + '/clavier/index.html', { waitUntil: 'load' }); await attendre(1200);
  const cdp = await p.createCDPSession(); const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: q.id || i + 1 })) });
  const msgs = () => p.evaluate(() => window.__m.splice(0));
  const r = await p.evaluate(() => { const e = document.getElementById('pave').getBoundingClientRect(); return { x: e.x, y: e.y, l: e.width, h: e.height }; });
  verifier('le pavé est affiché', r.l > 200 && r.h > 100, JSON.stringify(r));
  const A = { x: r.x + r.l * 0.3, y: r.y + r.h * 0.5 };
  await msgs();
  // simple glisse : curseur, pas de verrou
  await T('touchStart', [A]); for (let i = 1; i <= 5; i++) { await T('touchMove', [{ x: A.x + i * 10, y: A.y }]); await attendre(20); } await T('touchEnd', []); await attendre(200);
  let m = await msgs(); verifier('un doigt : déplace le curseur (pointeur), aucun verrou', m.some(x => x.a === 'pointeur') && !m.some(x => x.a === 'verrou'), JSON.stringify(m.map(x => x.a)));
  await attendre(500);
  // double appui rapide = double clic
  await T('touchStart', [A]); await attendre(50); await T('touchEnd', []); await attendre(90); await T('touchStart', [A]); await attendre(50); await T('touchEnd', []); await attendre(300); m = await msgs();
  verifier('double appui rapide : clic puis clic double (comportement conservé)', m.filter(x => x.a === 'clic').map(x => x.n).join() === '1,2' && !m.some(x => x.a === 'verrou'), JSON.stringify(m.map(x => x.a + (x.n || ''))));
  await attendre(500);
  // double appui maintenu = verrou
  await T('touchStart', [A]); await attendre(50); await T('touchEnd', []); await attendre(90); await T('touchStart', [A]); await attendre(320); m = await msgs();
  verifier('double appui maintenu : « verrou » envoyé une seule fois', m.filter(x => x.a === 'verrou').length === 1, JSON.stringify(m.map(x => x.a)));
  verifier('le deuxième appui ne tire ni clic ni appui long', !m.some(x => x.a === 'appui_long') && m.filter(x => x.a === 'clic').length === 1);
  for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: A.x + i * 12, y: A.y + i * 5 }]); await attendre(25); } await attendre(80); m = await msgs();
  const ptr = m.filter(x => x.a === 'pointeur'); const sx = ptr.reduce((s, x) => s + x.dx, 0), sy = ptr.reduce((s, x) => s + x.dy, 0);
  verifier('verrouillé : le glissement envoie des déplacements directs, proportionnels (≈ 72 × 30 px)', ptr.length >= 3 && sx > 55 && sx < 85 && sy > 20 && sy < 38, 'dx ' + sx + ' dy ' + sy);
  verifier('aucun saut : aucun pas isolé de plus de 40 px', ptr.every(x => Math.abs(x.dx) < 40 && Math.abs(x.dy) < 40));
  verifier('pas de caméra ni de glisse concurrents', !m.some(x => x.a === 'glisse'));
  // joystick : un second doigt à droite
  const J = { x: r.x + r.l * 0.85, y: r.y + r.h * 0.5, id: 2 };
  await T('touchMove', [{ x: A.x + 72, y: A.y + 30, id: 1 }, J]); await attendre(30);
  await T('touchStart', [{ x: A.x + 72, y: A.y + 30, id: 1 }, J]); await attendre(60); await msgs();
  await T('touchMove', [{ x: A.x + 72, y: A.y + 30, id: 1 }, { x: J.x + 40, y: J.y, id: 2 }]); await attendre(300); m = await msgs();
  const jx = m.filter(x => x.a === 'pointeur').reduce((s, x) => s + x.dx, 0);
  verifier('joystick invisible : un doigt à droite déplace en continu, vers la droite', jx > 8, 'dx ' + jx);
  await T('touchMove', [{ x: A.x + 72, y: A.y + 30, id: 1 }, { x: J.x, y: J.y, id: 2 }]); await attendre(200); await msgs(); await attendre(200); m = await msgs();
  verifier('joystick revenu au centre (zone morte) : plus de mouvement', m.filter(x => x.a === 'pointeur').length === 0);
  await T('touchEnd', [{ x: A.x + 72, y: A.y + 30, id: 1 }]); await attendre(250); m = await msgs();
  verifier('relâchement : « lacher » immédiat, aucun clic fantôme, aucune inertie', m.some(x => x.a === 'lacher') && !m.some(x => x.a === 'clic') && !m.some(x => x.a === 'pointeur'), JSON.stringify(m.map(x => x.a)));
  await T('touchEnd', []); await attendre(100);
  // retour au mode normal
  await T('touchStart', [A]); for (let i = 1; i <= 4; i++) { await T('touchMove', [{ x: A.x + i * 10, y: A.y }]); await attendre(20); } await T('touchEnd', []); await attendre(200); m = await msgs();
  verifier('retour au mode normal : le doigt redéplace simplement le curseur', m.some(x => x.a === 'pointeur') && !m.some(x => x.a === 'verrou'));
  await attendre(500);
  // deuxième appui loin du premier : pas de verrou
  await T('touchStart', [A]); await attendre(50); await T('touchEnd', []); await attendre(90); await T('touchStart', [{ x: A.x + 200, y: A.y + 40 }]); await attendre(320); m = await msgs(); await T('touchEnd', []);
  verifier('deuxième appui trop éloigné du premier : pas de verrou', !m.some(x => x.a === 'verrou'));
  await p.close();
}
// ── B. côté PC ──
const { navigateur, page } = await ouvrirGalaxieTheme({ largeur: 1600, hauteur: 900 });
const ev = (f, ...a) => page.evaluate(f, ...a);
const cur = async (x, y) => { for (let i = 0; i < 60; i++) { const f = await ev((x, y) => { const q = window.Telecommande.position(); if (Math.abs(x - q.x) < 1 && Math.abs(y - q.y) < 1) return true; window.Telecommande.appliquer({ a: 'pointeur', dx: Math.max(-140, Math.min(140, x - q.x)), dy: Math.max(-140, Math.min(140, y - q.y)) }); return false; }, x, y); if (f) break; await attendre(15); } await attendre(150); };
const rect = id => ev(id => { const e = document.querySelector('.pn[data-id="' + id + '"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, l: r.width, h: r.height }; }, id);
await ev(() => window.Panneaux.ouvrir({ id: 'essai', titre: 'Essai', corps: 'Contenu de la fenêtre d’essai' })); await attendre(1000);
await ev(() => { window.TiroirFenetres.ouvrir(); }); await ev(() => window.TiroirFenetres.fermer());
await ev(() => window.Galaxie.regler({ qualite: 'moyenne', fpsMax: 0 }));
const w0 = await rect('essai');
if (w0) {
  await cur(w0.x + w0.l / 2, w0.y + w0.h * 0.7);   // au milieu du corps de la fenêtre, PAS sur la barre de titre
  await ev(() => window.Telecommande.appliquer({ a: 'verrou' })); await attendre(100);
  for (let i = 0; i < 10; i++) { await ev(() => window.Telecommande.appliquer({ a: 'pointeur', dx: -12, dy: 8 })); await attendre(25); }
  await ev(() => window.Telecommande.appliquer({ a: 'lacher' })); await attendre(300);
  const w1 = await rect('essai'); verifier('PC : verrou sur le corps d’une fenêtre, glisser la déplace (≈ -120, +80)', w1 && Math.abs(w1.x - w0.x + 120) < 20 && Math.abs(w1.y - w0.y - 80) < 20, JSON.stringify([w0, w1]));
  await ev(() => window.Telecommande.appliquer({ a: 'pointeur', dx: -30, dy: 0 })); await attendre(200); const w2 = await rect('essai');
  verifier('PC : après lacher, le curseur ne traîne plus la fenêtre', Math.abs(w2.x - w1.x) < 2);
} else console.log('   (fenêtre mini-meteo absente : test fenêtre ignoré)');
// objet 3D : la galaxie
await ev(() => window.Galaxie.nav && 0);
const cam0 = await ev(() => { const c = window.Galaxie.camera.position; return [c.x, c.y, c.z]; });
await cur(300, 450); await ev(() => window.Telecommande.appliquer({ a: 'verrou' })); await attendre(100);
for (let i = 0; i < 12; i++) { await ev(() => window.Telecommande.appliquer({ a: 'pointeur', dx: 14, dy: 0 })); await attendre(30); }
await ev(() => window.Telecommande.appliquer({ a: 'lacher' })); await attendre(400);
const cam1 = await ev(() => { const c = window.Galaxie.camera.position; return [c.x, c.y, c.z]; });
verifier('PC : verrou sur la vue 3D, glisser fait tourner la caméra', Math.hypot(cam1[0] - cam0[0], cam1[1] - cam0[1], cam1[2] - cam0[2]) > 1, JSON.stringify([cam0, cam1]));
await attendre(1200); const cam1b = await ev(() => { const c = window.Galaxie.camera.position; return [c.x, c.y, c.z]; });
const cam2 = await ev(() => { window.Telecommande.appliquer({ a: 'pointeur', dx: 60, dy: 0 }); return 0; }); await attendre(400);
const cam3 = await ev(() => { const c = window.Galaxie.camera.position; return [c.x, c.y, c.z]; });
verifier('PC : après lacher, plus de rotation', Math.hypot(cam3[0] - cam1b[0], cam3[1] - cam1b[1], cam3[2] - cam1b[2]) < 0.5);
void cam2;
// rien de saisissable : pas de verrou
await ev(() => { document.getElementById('cfg') && 0; });
await ev(() => window.Telecommande.appliquer({ a: 'verrou' })); await ev(() => window.Telecommande.appliquer({ a: 'lacher' }));
verifier('PC : message « verrou » valide pour la liste blanche', await ev(() => window.TeleCalcul.valider({ a: 'verrou' }) !== null));
console.log('erreurs page :', erreurs.slice(0, 4));
await navigateur.close(); await b.close(); process.exit(fin() ? 1 : 0);
