import puppeteer from 'puppeteer-core';
import { ouvrirGalaxieTheme, entrerSurMars, attendreMode, attendre, compteur } from './r2-aide.mjs';
import { demarrerFauxWorkerMarche } from './mock-worker-marche.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8000', CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { verifier, fin } = compteur();

/* V2 phase 4 : mini-carte (carrés = fenêtres, ronds = objets 3D) et Pad 3D.
   A) CÔTÉ TABLETTE : vraie page clavier, faux WebSocket, vrais événements tactiles CDP : la carte est dessinée à l'échelle de l'écran du PC, glisser / pincer / toucher / appui long envoient
      les bons messages, au plus 30 par seconde. B) CÔTÉ PC : vraie page Raylé dans Mars, vraies fenêtres : les messages de la tablette les déplacent, les redimensionnent, les rangent, les ferment ;
      les objets 3D tournent. Lancer : node tests-navigateur/v2-pad-test.mjs */
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const erreurs = [];
{
  const p = await b.newPage(); await p.setViewport({ width: 1180, height: 820, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  p.on('pageerror', e => erreurs.push(e.message));
  await p.setRequestInterception(true);
  p.on('request', r => { if (/\/clavier\/statut/.test(r.url())) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ k2: true, jetonValide: true, pc: true }) }); r.continue(); });
  await p.evaluateOnNewDocument(() => {
    localStorage.setItem('rayle_k2_jeton', 'essai'); localStorage.setItem('rayle_clavier_reglages', JSON.stringify({ mode: 'carte' })); window.__m = [];
    window.WebSocket = class { constructor() { window.__ws = this; this.readyState = 1; setTimeout(() => { this.onopen && this.onopen(); this.onmessage && this.onmessage({ data: JSON.stringify({ t: 'bienvenue', pc: true }) }); }, 20); }
      send(s) { const m = JSON.parse(s); if (m.t === 'ping') { this.onmessage && this.onmessage({ data: JSON.stringify({ t: 'pong', n: m.n }) }); return; } window.__m.push(Object.assign({ _t: Date.now() }, m)); } close() {} };
  });
  await p.goto(BASE + '/clavier/index.html', { waitUntil: 'load' }); await attendre(1200);
  const cdp = await p.createCDPSession(); const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: q.id || i + 1 })) });
  const msgs = () => p.evaluate(() => window.__m.splice(0));
  const carte = { ecran: { l: 1920, h: 1080 }, fenetres: [
    { id: 'mars-terminal:p-graphique-us100', titre: 'US100 · Nasdaq 100', x: 0.05, y: 0.1, l: 0.3, h: 0.35, actif: true, mobile: true },
    { id: 'mars-terminal:p-cot', titre: 'COT', x: 0.55, y: 0.5, l: 0.3, h: 0.3, actif: false, mobile: true },
    { id: 'pn:holo-points', titre: 'Réponse', x: 0.7, y: 0.05, l: 0.2, h: 0.2, actif: false, mobile: false }], objets: [{ id: 'scene', nom: 'Mars (base et planète)', actif: true }, { id: 'squelette', nom: 'Squelette', actif: false }] };
  await p.evaluate(c => window.__ws.onmessage({ data: JSON.stringify({ t: 'carte', carte: c }) }), carte); await attendre(300);
  verifier('mode Carte affiché, les 6 modes dans la barre', await p.evaluate(() => document.body.dataset.mode === 'carte' && document.querySelectorAll('.modes .mode').length === 6));
  const r = await p.evaluate(() => { const e = document.getElementById('carte-ecran').getBoundingClientRect(); return { x: e.x, y: e.y, l: e.width, h: e.height }; });
  verifier('la carte garde le rapport 16/9 de l’écran du PC', Math.abs(r.l / r.h - 16 / 9) < 0.02, JSON.stringify(r));
  verifier('un carré par fenêtre (3)', await p.evaluate(() => document.querySelectorAll('.carre').length === 3));
  const pos = await p.evaluate(() => [...document.querySelectorAll('.carre')].map(c => { const q = c.getBoundingClientRect(), z = document.getElementById('carte-ecran').getBoundingClientRect(); return { id: c.dataset.id, x: (q.x - z.x) / z.width, y: (q.y - z.y) / z.height, l: q.width / z.width }; }));
  verifier('même position et même proportion que sur le PC', Math.abs(pos[0].x - 0.05) < 0.01 && Math.abs(pos[0].y - 0.1) < 0.01 && Math.abs(pos[0].l - 0.3) < 0.01, JSON.stringify(pos[0]));
  verifier('couleur différente pour la fenêtre active ; fenêtre non déplaçable grisée', await p.evaluate(() => document.querySelector('.carre.actif') && document.querySelector('.carre.fixe')));
  verifier('un rond par objet 3D (2), le premier choisi', await p.evaluate(() => document.querySelectorAll('.rond').length === 2 && document.querySelector('.rond.choisi')));
  await msgs();
  await p.screenshot({ path: 'captures-accueil/v2-pad-carte.png' });

  // ── glisser un carré : 100 px à droite, 50 px en bas ; 40 événements en 400 ms ──
  const q = await p.evaluate(() => { const e = document.querySelector('.carre[data-id="mars-terminal:p-graphique-us100"]').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
  await T('touchStart', [q]); for (let i = 1; i <= 40; i++) { await T('touchMove', [{ x: q.x + i * 2.5, y: q.y + i * 1.25 }]); await attendre(10); } await T('touchEnd', []); await attendre(300);
  let m = await msgs(); const dep = m.filter(x => x.a === 'fenetre_deplace');
  const sx = dep.reduce((s, x) => s + x.dx, 0), sy = dep.reduce((s, x) => s + x.dy, 0), exp = { dx: 100 / r.l, dy: 50 / r.h };
  verifier('glisser un carré envoie des déplacements en FRACTIONS de l’écran PC (somme conservée)', Math.abs(sx - exp.dx) < 0.012 && Math.abs(sy - exp.dy) < 0.012, 'dx ' + sx.toFixed(3) + ' / ' + exp.dx.toFixed(3) + ' · dy ' + sy.toFixed(3) + ' / ' + exp.dy.toFixed(3));
  verifier('…avec le bon identifiant de fenêtre', dep.length > 0 && dep.every(x => x.id === 'mars-terminal:p-graphique-us100'));
  const t0 = dep[0] && dep[0]._t, t1 = dep[dep.length - 1] && dep[dep.length - 1]._t, dur = Math.max(1, t1 - t0);
  verifier('au plus ~30 messages par seconde (lissage)', dep.length / (dur / 1000) <= 36 || dep.length <= 3, dep.length + ' messages en ' + dur + ' ms');
  verifier('un tap n’a pas été pris pour un déplacement (aucun focus après un glisser)', !m.some(x => x.a === 'fenetre_act' && x.act === 'focus'));
  // ── toucher = passer devant ──
  const q2 = await p.evaluate(() => { const e = document.querySelector('.carre[data-id="mars-terminal:p-cot"]').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
  await T('touchStart', [q2]); await attendre(60); await T('touchEnd', []); await attendre(300); m = await msgs();
  verifier('toucher un carré = « focus »', m.some(x => x.a === 'fenetre_act' && x.act === 'focus' && x.id === 'mars-terminal:p-cot'), JSON.stringify(m.map(x => x.a + (x.act || ''))));
  // ── pincer = agrandir ──
  await T('touchStart', [{ x: q2.x - 20, y: q2.y, id: 1 }, { x: q2.x + 20, y: q2.y, id: 2 }]);
  for (let i = 1; i <= 10; i++) { await T('touchMove', [{ x: q2.x - 20 - i * 4, y: q2.y, id: 1 }, { x: q2.x + 20 + i * 4, y: q2.y, id: 2 }]); await attendre(15); } await T('touchEnd', []); await attendre(300); m = await msgs();
  const ech = m.filter(x => x.a === 'fenetre_taille').reduce((s, x) => s * x.ech, 1);
  verifier('pincer à deux doigts agrandit la fenêtre (écart 40 → 120 px = ×3 borné par envoi)', ech > 1.8, 'échelle cumulée ' + ech.toFixed(2));
  verifier('…et ne la déplace pas', !m.some(x => x.a === 'fenetre_deplace' && (Math.abs(x.dx) > 0.02)));
  // ── appui long = menu ──
  await T('touchStart', [q2]); await attendre(700);
  verifier('appui long : le menu apparaît (Ranger, Réduire, Agrandir, Fermer)', await p.evaluate(() => { const mn = document.getElementById('carte-menu'); return !mn.hidden && ['Ranger', 'Réduire', 'Agrandir', 'Fermer'].every(t => mn.textContent.includes(t)); }));
  await T('touchEnd', []); await attendre(200); await msgs();
  await p.evaluate(() => document.querySelector('#carte-menu [data-act="fermer"]').click()); await attendre(200); m = await msgs();
  verifier('« Fermer » envoie fenetre_act fermer', m.some(x => x.a === 'fenetre_act' && x.act === 'fermer' && x.id === 'mars-terminal:p-cot'));
  // ── ronds ──
  const o1 = await p.evaluate(() => { const e = document.querySelector('.rond[data-id="scene"]').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
  await T('touchStart', [o1]); for (let i = 1; i <= 12; i++) { await T('touchMove', [{ x: o1.x + i * 3, y: o1.y + i }]); await attendre(12); } await T('touchEnd', []); await attendre(300); m = await msgs();
  verifier('glisser un rond = faire tourner l’objet', m.filter(x => x.a === 'objet' && x.g === 'tourner').length > 0 && m.filter(x => x.g === 'tourner').reduce((s, x) => s + x.dx, 0) > 0.1, JSON.stringify(m.map(x => x.a + (x.g || ''))).slice(0, 120));
  verifier('…et se termine par « fin » (bouton relâché côté PC)', m.some(x => x.a === 'objet' && x.g === 'fin'));
  await T('touchStart', [{ x: o1.x - 15, y: o1.y, id: 1 }, { x: o1.x + 15, y: o1.y, id: 2 }]);
  for (let i = 1; i <= 8; i++) { await T('touchMove', [{ x: o1.x - 15 - i * 3, y: o1.y, id: 1 }, { x: o1.x + 15 + i * 3, y: o1.y, id: 2 }]); await attendre(15); } await T('touchEnd', []); await attendre(300); m = await msgs();
  verifier('2 doigts écartés sur un rond = zoom', m.some(x => x.a === 'objet' && x.g === 'zoom' && x.delta > 0), JSON.stringify(m.map(x => (x.g || '') + (x.delta || ''))).slice(0, 140));
  const o2 = await p.evaluate(() => { const e = document.querySelector('.rond[data-id="squelette"]').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
  await T('touchStart', [o2]); await attendre(60); await T('touchEnd', []); await attendre(300); m = await msgs();
  verifier('toucher un rond = le choisir', m.some(x => x.a === 'objet' && x.g === 'choisir' && x.id === 'squelette') && await p.evaluate(() => document.querySelector('.rond.choisi').dataset.id === 'squelette'));

  // ── Pad 3D ──
  await p.evaluate(() => document.querySelector('.mode[data-m="pad3d"]').click()); await attendre(500); await msgs();
  verifier('mode Pad 3D affiché, objet courant = Squelette', await p.evaluate(() => document.body.dataset.mode === 'pad3d' && /Squelette/.test(document.getElementById('pad3d-cible').textContent)));
  await p.screenshot({ path: 'captures-accueil/v2-pad-3d.png' });
  const pz = await p.evaluate(() => { const e = document.getElementById('pad3d-zone').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2, l: e.width, h: e.height }; });
  await T('touchStart', [pz]); for (let i = 1; i <= 20; i++) { await T('touchMove', [{ x: pz.x + i * 6, y: pz.y + i * 2 }]); await attendre(12); } await T('touchEnd', []); await attendre(300); m = await msgs();
  const rot = m.filter(x => x.a === 'objet' && x.g === 'tourner');
  verifier('Pad 3D : 1 doigt = tourner l’objet choisi', rot.length > 0 && rot.every(x => x.id === 'squelette') && rot.reduce((s, x) => s + x.dx, 0) > 0.05, JSON.stringify(rot.slice(0, 2)));
  await T('touchStart', [{ x: pz.x - 40, y: pz.y, id: 1 }, { x: pz.x + 40, y: pz.y, id: 2 }]);
  for (let i = 1; i <= 8; i++) { await T('touchMove', [{ x: pz.x - 40 - i * 5, y: pz.y + i * 2, id: 1 }, { x: pz.x + 40 + i * 5, y: pz.y + i * 2, id: 2 }]); await attendre(15); } await T('touchEnd', []); await attendre(300); m = await msgs();
  verifier('2 doigts : déplacer (pan) et pincer = zoom', m.some(x => x.a === 'objet' && x.g === 'pan') && m.some(x => x.a === 'objet' && x.g === 'zoom' && x.delta > 0), JSON.stringify(m.map(x => x.g)).slice(0, 120));
  await T('touchStart', [pz]); await attendre(50); await T('touchEnd', []); await attendre(300); m = await msgs();
  verifier('un tap = clic', m.some(x => x.a === 'clic'));
  await p.evaluate(() => document.getElementById('pad3d-joy-bt').click()); await attendre(200); await msgs();
  const jz = await p.evaluate(() => { const e = document.getElementById('pad3d-joy').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
  await T('touchStart', [jz]); await T('touchMove', [{ x: jz.x, y: jz.y - 50 }]); await attendre(250); m = await msgs(); await T('touchEnd', []); await attendre(200); const apres = await msgs();
  verifier('joystick virtuel (facultatif) : pousser vers le haut = avancer (pilote ty > 0.5)', m.some(x => x.a === 'pilote' && x.ty > 0.5), JSON.stringify(m.slice(-1)));
  verifier('relâcher le joystick = retour à zéro', apres.some(x => x.a === 'pilote' && x.tx === 0 && x.ty === 0));
  await p.close();
}
// ── B) CÔTÉ PC ──
const worker = await demarrerFauxWorkerMarche(8797);
const { navigateur, page, erreurs: errPc } = await ouvrirGalaxieTheme({ largeur: 1600, hauteur: 900 });
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(() => window.Galaxie.regler({ qualite: 'moyenne', fpsMax: 0 }));
await entrerSurMars(page); await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur'); await ev(() => window.Mars.auto(false));
await ev(async () => { const t = await window.Mars.afficherGraphique({ instrument: 'US100' }); await window.Mars.afficherGraphique({ instrument: 'XAU' }); return t; }); await attendre(1500);
const carte = await ev(() => window.CartePad.construire());
verifier('PC : la carte décrit les fenêtres ouvertes (2 graphiques) en fractions de l’écran', carte.fenetres.filter(f => /^mars-terminal:/.test(f.id)).length === 2 && carte.fenetres.every(f => f.x > -0.5 && f.l > 0 && f.l <= 1.5), JSON.stringify(carte.fenetres.map(f => f.id)));
verifier('PC : la carte contient l’objet 3D principal (Mars)', carte.objets.some(o => o.id === 'scene' && /Mars/.test(o.nom)), JSON.stringify(carte.objets));
const id = carte.fenetres.find(f => /us100/.test(f.id)).id, avant = carte.fenetres.find(f => f.id === id);
await ev(i => window.Telecommande.appliquer({ a: 'fenetre_deplace', id: i, dx: -0.2, dy: 0 }), id); await attendre(200);   // la fenêtre est contre le bord droit : on part vers la gauche
const avant2 = (await ev(() => window.CartePad.construire())).fenetres.find(f => f.id === id);
await ev(i => window.Telecommande.appliquer({ a: 'fenetre_deplace', id: i, dx: 0.05, dy: 0.04 }), id); await attendre(200);
const c2 = await ev(() => window.CartePad.construire()), ap = c2.fenetres.find(f => f.id === id);
verifier('PC : fenetre_deplace déplace la VRAIE fenêtre (+5 % en x, +4 % en y)', Math.abs((ap.x - avant2.x) - 0.05) < 0.012 && Math.abs((ap.y - avant2.y) - 0.04) < 0.012, JSON.stringify([avant2.x, ap.x, avant2.y, ap.y]));
verifier('PC : un déplacement vers la gauche a bien eu lieu (−20 %)', avant2.x < avant.x - 0.1, JSON.stringify([avant.x, avant2.x]));
await ev(i => window.Telecommande.appliquer({ a: 'fenetre_taille', id: i, ech: 1.2 }), id); await attendre(200);
const c3 = await ev(() => window.CartePad.construire()), gr = c3.fenetres.find(f => f.id === id);
verifier('PC : fenetre_taille agrandit de 20 % et garde le centre', Math.abs(gr.l / ap.l - 1.2) < 0.03 && Math.abs((gr.x + gr.l / 2) - (ap.x + ap.l / 2)) < 0.02, JSON.stringify([ap.l, gr.l]));
verifier('PC : un identifiant inconnu ou refusé ne fait rien (pas d’erreur)', await ev(() => { try { window.Telecommande.appliquer({ a: 'fenetre_deplace', id: 'nexiste:pas', dx: 0.1, dy: 0 }); window.Telecommande.appliquer({ a: 'fenetre_deplace', id: 'a b', dx: 0.1, dy: 0 }); return true; } catch (e) { return false; } }));
const yaw0 = await ev(() => window.Mars.etat().yaw);
for (let i = 0; i < 6; i++) { await ev(() => window.Telecommande.appliquer({ a: 'objet', id: 'scene', g: 'tourner', dx: 0.04, dy: 0 })); await attendre(30); }
await ev(() => window.Telecommande.appliquer({ a: 'objet', id: 'scene', g: 'fin' })); await attendre(200);
const yaw1 = await ev(() => window.Mars.etat().yaw);
verifier('PC : objet « tourner » fait tourner la vue 3D de Mars (comme la souris)', Math.abs(yaw1 - yaw0) > 0.05, yaw0.toFixed(3) + ' → ' + yaw1.toFixed(3));
const av0 = await ev(() => window.Mars.etat().avancee);
await ev(() => window.Telecommande.appliquer({ a: 'objet', id: 'scene', g: 'zoom', delta: 300 })); await attendre(200);
verifier('PC : objet « zoom » avance dans le salon (molette)', Math.abs((await ev(() => window.Mars.etat().avancee)) - av0) > 0.05);
verifier('PC : objet enregistré par une vue (Objets3DPad) : geste transmis à la vue', await ev(() => { let recu = null; window.Objets3DPad.enregistrer('test', { nom: 'Test', tourner: (dx, dy) => { recu = [dx, dy]; } }); window.Telecommande.appliquer({ a: 'objet', id: 'test', g: 'tourner', dx: 0.1, dy: 0.05 }); window.Objets3DPad.retirer('test'); return recu && Math.abs(recu[0] - 0.1 * innerWidth) < 1; }));
await ev(i => window.Telecommande.appliquer({ a: 'fenetre_act', id: i, act: 'ranger' }), id); await attendre(900);
verifier('PC : « ranger » remet la fenêtre dans sa pile', !(await ev(() => window.CartePad.construire())).fenetres.some(f => f.id === id));
const id2 = (await ev(() => window.CartePad.construire())).fenetres.find(f => /^mars-terminal:/.test(f.id)).id;
await ev(i => window.Telecommande.appliquer({ a: 'fenetre_act', id: i, act: 'fermer' }), id2); await attendre(600);
verifier('PC : « fermer » ferme la fenêtre', !(await ev(() => window.CartePad.construire())).fenetres.some(f => f.id === id2));
const e = [...erreurs, ...errPc].filter(x => !/faireconomy|404|ERR_FAILED|ERR_CONNECTION|net::/.test(x)); verifier('aucune erreur JavaScript', !e.length, e.slice(0, 3).join(' | '));
await navigateur.close(); await b.close(); process.exit(fin() ? 1 : 0);
