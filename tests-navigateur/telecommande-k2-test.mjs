import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import { creerServeur } from '../serveur.mjs';
/* Télécommande K2 de bout en bout : activation depuis ⚙ Réglages, appairage par code, les quatre modes avec de vrais événements tactiles (émulation tablette),
   effets dans la page Rayle du PC, liste blanche, latence, déconnexion depuis le PC, arrêt d'urgence. Captures : docs/captures-k2/ (modes de la tablette en une planche + fenêtre du PC). */
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { verifier, fin } = compteur();
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-k2-'));
const srv = creerServeur({ ip: '127.0.0.1', portReseau: 0, dossierDonnees: dossier });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const erreurs = [];
const pc = await nav.newPage(); await pc.setViewport({ width: 1280, height: 720 });
pc.on('pageerror', e => erreurs.push('PC: ' + e.message)); pc.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::|worker|Worker|CORS policy/i.test(m.text())) erreurs.push('PC: ' + m.text().slice(0, 160)); });
await pc.goto(base + '/index.html', { waitUntil: 'load' }); await pc.waitForFunction(() => window.Telecommande && document.getElementById('telInterrupteur'), { timeout: 30000 }); await attendre(500);

// 1. Activation depuis les réglages
verifier('désactivée par défaut', await pc.evaluate(() => document.getElementById('telInterrupteur').checked === false && window.Telecommande.etat().actif === false));
await pc.evaluate(() => document.getElementById('telInterrupteur').click());
await pc.waitForFunction(() => window.Telecommande.etat().actif && window.Telecommande.connectee(), { timeout: 10000 });
const e0 = await pc.evaluate(() => window.Telecommande.etat());
verifier('activation par l\'interrupteur : fenêtre avec QR, adresse et code', await pc.evaluate(() => { const f = document.getElementById('tele-fenetre'); return !!f && !f.hidden && !!f.querySelector('.tele-qr svg') && /^\d{6}$/.test(f.querySelector('.tele-code').textContent); }));
verifier('liaison de la page PC établie', await pc.evaluate(() => window.Telecommande.connectee()));

// 2. Tablette : page servie sur le réseau local (jeton QR), appairage par code
await pc.evaluate(() => { window.__dit = []; window.respond = t => { window.__dit.push(t); }; window.__bc = 0; window.basculerConversation = () => { window.__bc++; }; window.__demandes = []; const d = RayleBus.demander; RayleBus.demander = (...a) => { window.__demandes.push(a[0]); return d.apply(RayleBus, a); }; });
const tab = await nav.newPage(); const errT = []; tab.on('pageerror', e => errT.push(e.message)); tab.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Ignored attempt to cancel a touchstart/.test(m.text())) errT.push(m.text()); });   // R2 : le passage en plein écran au premier appui fait dire cela à Chrome (sans conséquence)   // le 403 du mauvais code est attendu
await tab.setViewport({ width: 1024, height: 600, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const cdp = await tab.createCDPSession();
const toucher = (pts, type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
const rect = sel => tab.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; }, sel);
const clicHTML = sel => tab.evaluate(s => document.querySelector(s).click(), sel);
await tab.goto(e0.url, { waitUntil: 'load' }); await attendre(500);
verifier('tablette : demande l\'appairage au premier accès', await tab.evaluate(() => !document.getElementById('appairage').hidden));
const saisir = async code => { for (const c of code) await tab.evaluate(c => document.querySelector('#pave-num [data-c="' + c + '"]').click(), c); await attendre(300); };
await saisir('000000' === e0.code ? '111111' : '000000');
verifier('tablette : mauvais code refusé', await tab.evaluate(() => /refusé|incorrect/i.test(document.getElementById('app-msg').textContent) && !document.getElementById('appairage').hidden));
await saisir(e0.code);
await tab.waitForFunction(() => window.ClavierEventail.etat().liaison, { timeout: 8000 });
verifier('tablette : appairée et connectée, appareil nommé', await tab.evaluate(() => document.getElementById('appairage').hidden && window.ClavierEventail.etat().liaison));
await pc.waitForFunction(() => window.Telecommande.etat().appareils.some(a => a.connecte), { timeout: 5000 });
await tab.waitForFunction(() => window.ClavierEventail.etat().pc === true && window.ClavierEventail.etat().rtt != null, { timeout: 8000 });
verifier('latence mesurée et affichée sur la tablette', await tab.evaluate(() => /\d+ ms/.test(document.getElementById('liaison-t').textContent)));
verifier('indicateur PC connecté sur la tablette', await tab.evaluate(() => document.getElementById('pc').dataset.etat === 'ok'));
await pc.waitForFunction(() => document.getElementById('tele-pastille') && !document.getElementById('tele-pastille').hidden && /ms/.test(document.getElementById('tele-pastille').textContent), { timeout: 15000, polling: 200 });   // polling : l'onglet du PC est en arrière-plan (pas de requestAnimationFrame)
verifier('latence et connexion affichées sur le PC', true);

// 3. Mode PAVÉ
await tab.evaluate(() => window.ClavierEventail.mode('pave')); await attendre(300);
await tab.evaluate(() => { const s = JSON.parse(localStorage.getItem('rayle_clavier_reglages') || '{}'); });
const pv = await rect('#pave'); const dep = { x: pv.x - 100, y: pv.y };
const avant = await pc.evaluate(() => window.Telecommande.position());
await toucher([dep], 'touchStart');
for (let i = 1; i <= 8; i++) { await toucher([{ x: dep.x + i * 14, y: dep.y + i * 6 }], 'touchMove'); await attendre(18); }
await toucher([], 'touchEnd'); await attendre(600);
const apres = await pc.evaluate(() => window.Telecommande.position());
verifier('pavé : un doigt déplace le curseur de Rayle', apres.x - avant.x > 100 && apres.y - avant.y > 40, JSON.stringify({ avant, apres }));
verifier('pavé : curseur virtuel visible', await pc.evaluate(() => !document.getElementById('tele-curseur').hidden));
// Cible sous le curseur : conteneur défilant avec un bouton
await pc.evaluate(() => {
  const p = window.Telecommande.position(); const d = document.createElement('div'); d.id = 'k2-scroll';
  d.style.cssText = 'position:fixed;z-index:2147482999;overflow:auto;width:240px;height:160px;background:#123;left:' + (p.x - 120) + 'px;top:' + (p.y - 80) + 'px';
  d.innerHTML = '<button id="k2-btn" style="display:block;width:100%;height:150px">test</button><div style="height:1200px"></div>';
  document.body.appendChild(d); window.__c = { clic: 0, dbl: 0, droit: 0, wheel: 0, det: [] };
  d.addEventListener('click', e => { window.__c.clic++; window.__c.det.push(e.detail); }); d.addEventListener('dblclick', () => window.__c.dbl++); d.addEventListener('contextmenu', () => window.__c.droit++); d.addEventListener('wheel', e => { if (e.deltaY < 0) window.__c.wheel++; });
});
await toucher([pv], 'touchStart'); await attendre(60); await toucher([], 'touchEnd'); await attendre(500);
verifier('pavé : un tap = un clic dans Rayle', await pc.evaluate(() => window.__c.clic === 1 && window.__c.dbl === 0), await pc.evaluate(() => JSON.stringify(window.__c)));
await attendre(450);
await toucher([pv], 'touchStart'); await attendre(50); await toucher([], 'touchEnd'); await attendre(120); await toucher([pv], 'touchStart'); await attendre(50); await toucher([], 'touchEnd'); await attendre(500);
verifier('pavé : double tap = double clic', await pc.evaluate(() => window.__c.dbl === 1 && window.__c.clic === 3), await pc.evaluate(() => JSON.stringify(window.__c)));
await toucher([pv], 'touchStart'); await attendre(800); await toucher([], 'touchEnd'); await attendre(400);
verifier('pavé : appui long = clic droit', await pc.evaluate(() => window.__c.droit === 1 && window.__c.clic === 3), await pc.evaluate(() => JSON.stringify(window.__c)));
const A = { x: pv.x - 40, y: pv.y - 40 }, B = { x: pv.x + 40, y: pv.y - 40 };
await toucher([A, B], 'touchStart');
for (let i = 1; i <= 8; i++) { await toucher([{ x: A.x, y: A.y - i * 14 }, { x: B.x, y: B.y - i * 14 }], 'touchMove'); await attendre(18); }
await toucher([], 'touchEnd'); await attendre(400);
verifier('pavé : deux doigts font défiler', await pc.evaluate(() => document.getElementById('k2-scroll').scrollTop > 20), await pc.evaluate(() => String(document.getElementById('k2-scroll').scrollTop)));
await toucher([A, B], 'touchStart');
for (let i = 1; i <= 8; i++) { await toucher([{ x: A.x - i * 10, y: A.y }, { x: B.x + i * 10, y: B.y }], 'touchMove'); await attendre(18); }
await toucher([], 'touchEnd'); await attendre(400);
verifier('pavé : pincement = zoom', await pc.evaluate(() => window.__c.wheel > 0), await pc.evaluate(() => String(window.__c.wheel)));
await toucher([{ x: 300, y: 300 }, { x: 400, y: 300 }, { x: 500, y: 300 }], 'touchStart'); await attendre(150); await toucher([], 'touchEnd'); await attendre(400);
verifier('pavé : trois doigts = accueil', await pc.evaluate(() => window.__demandes.includes('vue:fermer')));
// Cible caméra : un doigt = glisser (bouton enfoncé) dans la page
await tab.evaluate(() => document.getElementById('pave-cible').click()); await tab.evaluate(() => document.getElementById('pave-cible').click());
verifier('pavé : cible caméra choisie', await tab.evaluate(() => window.ClavierEventail.etat().cible === 'camera'));
await pc.evaluate(() => { window.__g = []; const d = document.getElementById('k2-scroll'); for (const t of ['pointerdown', 'pointermove', 'pointerup']) d.addEventListener(t, e => window.__g.push(t + ':' + e.buttons)); });
await toucher([pv], 'touchStart'); for (let i = 1; i <= 5; i++) { await toucher([{ x: pv.x + i * 20, y: pv.y }], 'touchMove'); await attendre(25); } await toucher([], 'touchEnd'); await attendre(400);
verifier('pavé caméra : appui, déplacements bouton enfoncé, relâchement', await pc.evaluate(() => window.__g[0] === 'pointerdown:1' && window.__g.some(x => x === 'pointermove:1') && window.__g[window.__g.length - 1] === 'pointerup:0'), await pc.evaluate(() => window.__g.join(',')));
await tab.evaluate(() => document.getElementById('pave-cible').click());   // retour en auto

// Changement de mode d'un geste (balayage de l'en-tête)
const h = await rect('#haut'); const mAvant = await tab.evaluate(() => window.ClavierEventail.etat().mode);
await toucher([{ x: h.x + 120, y: h.y }], 'touchStart'); for (let i = 1; i <= 6; i++) { await toucher([{ x: h.x + 120 - i * 40, y: h.y }], 'touchMove'); await attendre(20); } await toucher([], 'touchEnd'); await attendre(300);
verifier('balayage de l\'en-tête : change de mode', await tab.evaluate(m => window.ClavierEventail.etat().mode !== m, mAvant), mAvant + ' → ' + await tab.evaluate(() => window.ClavierEventail.etat().mode));

// 4. Mode CLAVIER
await pc.evaluate(() => { document.getElementById('k2-scroll')?.remove(); const i = document.createElement('input'); i.id = 'k2-champ'; i.type = 'text'; i.style.cssText = 'position:fixed;left:10px;top:10px;z-index:2147482999;width:300px'; document.body.appendChild(i); i.focus(); window.__rt = []; i.addEventListener('keydown', e => window.__rt.push(e.key)); });
await tab.evaluate(() => window.ClavierEventail.mode('clavier')); await attendre(300);
const centreK = id => tab.evaluate(i => { const r = document.querySelector('[data-id="' + i + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; }, id);
const taper = async id => { const p = await centreK(id); await toucher([p], 'touchStart'); await attendre(40); await toucher([], 'touchEnd'); await attendre(80); };
for (const id of ['c-a', 'c-b', 'espace', 'c-é']) await taper(id);
const maj = await centreK('maj'), kz = await centreK('c-z'); await toucher([maj], 'touchStart'); await attendre(50); await toucher([maj, kz], 'touchStart'); await attendre(50); await toucher([maj], 'touchEnd'); await attendre(50); await toucher([], 'touchEnd'); await attendre(100);
await taper('effacer'); await attendre(200);
verifier('clavier : les lettres s\'écrivent dans le champ de Rayle (Maj, Espace, accent, Effacer)', await pc.evaluate(() => document.getElementById('k2-champ').value === 'ab é'), await pc.evaluate(() => JSON.stringify(document.getElementById('k2-champ').value)));
await taper('entree'); await attendre(150);
verifier('clavier : Entrée reçue par le champ', await pc.evaluate(() => window.__rt.includes('Enter')));
const taillesArc = await tab.evaluate(() => [...document.querySelectorAll('#arc .touche')].map(g => { const r = g.getBoundingClientRect(); return { id: g.dataset.id, m: Math.min(r.width, r.height) }; }));
verifier('éventail : 12 commandes de Rayle + la touche Échap (R1)', taillesArc.length === 13 && ['echap', 'accueil', 'terre', 'mars', 'saturne', 'atelier3d', 'precedent', 'suivant', 'fermer', 'retour', 'plein_ecran', 'mode_leger', 'capture'].every(i => taillesArc.some(t => t.id === i)));
verifier('éventail : touches ≥ 44 px (min ' + Math.min(...taillesArc.map(t => t.m)).toFixed(0) + ')', Math.min(...taillesArc.map(t => t.m)) >= 44);
const interieur = taillesArc.filter(t => ['accueil', 'retour', 'fermer'].includes(t.id)); const ancien = 108 * 0 + 0;
verifier('éventail : anneau intérieur agrandi (≥ 60 px)', Math.min(...interieur.map(t => t.m)) >= 60, interieur.map(t => t.m.toFixed(0)).join('/'));
await taper('terre'); await taper('mars'); await taper('saturne'); await taper('atelier3d'); await taper('fermer');
verifier('commandes : Terre, Mars, Saturne, Atelier 3D, Fermer arrivent à Rayle', await pc.evaluate(() => JSON.stringify(window.__dit) === JSON.stringify(['va sur la Terre', 'va sur Mars', 'va sur Saturne', 'va sur Neptune', 'ferme ça'])), await pc.evaluate(() => JSON.stringify(window.__dit)));
await taper('accueil'); await attendre(200);
verifier('commande Accueil', await pc.evaluate(() => window.__demandes.filter(d => d === 'vue:fermer').length >= 2));

// 5. Mode RAYLÉ
await tab.evaluate(() => window.ClavierEventail.mode('rayle')); await attendre(300);
const pa = await rect('#parler'); await toucher([pa], 'touchStart'); await attendre(250);
verifier('Raylé : appui sur Parler = Rayle écoute sur le PC', await pc.evaluate(() => window.__bc === 1) && await tab.evaluate(() => document.getElementById('parler').classList.contains('on')));
await toucher([], 'touchEnd'); await attendre(200);
verifier('Raylé : relâchement = fin de l\'appui-pour-parler', await tab.evaluate(() => !document.getElementById('parler').classList.contains('on')));
await pc.evaluate(() => RayleBus.emit('raylé:reponse', { texte: 'Bonjour Justin, tout va bien.' })); await attendre(400);
verifier('Raylé : la dernière réponse s\'affiche sur la tablette', await tab.evaluate(() => /Bonjour Justin/.test(document.getElementById('fil').textContent)));
await clicHTML('#trio [data-r="veille"]'); await clicHTML('#raccourcis [data-f="meteo"]'); await clicHTML('#stop-parole'); await attendre(300);
verifier('Raylé : VEILLE / raccourci météo / arrête de parler traités sans erreur', await pc.evaluate(() => typeof window.Telecommande.derniereAction() === 'number') && errT.length === 0, errT.join(' | '));

// 6. Mode PILOTAGE
await pc.evaluate(() => { window.__k = []; window.addEventListener('keydown', e => window.__k.push('d:' + e.code)); window.addEventListener('keyup', e => window.__k.push('u:' + e.code)); });
await tab.evaluate(() => window.ClavierEventail.mode('pilotage')); await attendre(300);
const sg = await rect('#stick-g .base'), sd = await rect('#stick-d .base');
await toucher([sg], 'touchStart'); await toucher([{ x: sg.x, y: sg.y - sg.w * 0.4 }], 'touchMove'); await attendre(200);
await toucher([{ x: sg.x, y: sg.y - sg.w * 0.4 }, sd], 'touchStart'); await toucher([{ x: sg.x, y: sg.y - sg.w * 0.4 }, { x: sd.x + sd.w * 0.4, y: sd.y }], 'touchMove'); await attendre(250);
const p1 = await pc.evaluate(() => window.__k.slice());
verifier('pilotage : stick gauche vers l\'avant = W, stick droit à droite = flèche droite', p1.includes('d:KeyW') && p1.includes('d:ArrowRight'), p1.join(','));
await toucher([{ x: sg.x, y: sg.y - sg.w * 0.4 }], 'touchEnd'); await toucher([], 'touchEnd'); await attendre(300);
const p2 = await pc.evaluate(() => window.__k.slice());
verifier('pilotage : relâcher les sticks relâche les touches', p2.includes('u:KeyW') && p2.includes('u:ArrowRight'), p2.join(','));
const post = await rect('#b-post'); await toucher([post], 'touchStart'); await attendre(250);
verifier('pilotage : postcombustion = Maj maintenue', await pc.evaluate(() => window.__k.includes('d:ShiftLeft')));
await toucher([], 'touchEnd'); await attendre(250);
verifier('pilotage : postcombustion relâchée', await pc.evaluate(() => window.__k.includes('u:ShiftLeft')));
const rail = await tab.evaluate(() => { const r = document.querySelector('.rail').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.1 }; });
await toucher([rail], 'touchStart'); await attendre(250); await toucher([], 'touchEnd'); await attendre(200);
verifier('pilotage : poussée à fond = avance maintenue', await tab.evaluate(() => window.ClavierEventail.etat().pilote.poussee > 0.8) && await pc.evaluate(() => window.__k.lastIndexOf('d:KeyW') > window.__k.lastIndexOf('u:KeyW')));
await tab.evaluate(() => window.ClavierEventail.mode('clavier')); await attendre(300);
verifier('pilotage : quitter le mode relâche tout', await pc.evaluate(() => window.__k.lastIndexOf('u:KeyW') > window.__k.lastIndexOf('d:KeyW')));

// 7. Liste blanche côté page
const wl = await pc.evaluate(() => ({ a: window.Telecommande.appliquer({ a: 'executer', cmd: 'calc' }), b: window.Telecommande.appliquer({ a: 'commande', id: 'rm' }), c: window.Telecommande.appliquer({ a: 'texte', c: 'xxx' }), d: window.Telecommande.appliquer({ a: 'commande', id: 'terre' }) }));
verifier('liste blanche : une action hors liste est ignorée par la page', !wl.a && !wl.b && !wl.c && wl.d === true, JSON.stringify(wl));

// Captures : les 4 modes en une planche + la fenêtre du PC
fs.mkdirSync(path.join(RACINE, 'docs', 'captures-k2'), { recursive: true });
const vues = [];
for (const m of ['pave', 'clavier', 'rayle', 'pilotage']) { await tab.evaluate(m => window.ClavierEventail.mode(m), m); await attendre(350); vues.push((await tab.screenshot({ type: 'jpeg', quality: 80, encoding: 'base64' }))); }
const planche = await nav.newPage(); await planche.setViewport({ width: 2060, height: 1220 });
await planche.setContent('<body style="margin:0;background:#000;display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:6px">' + vues.map(v => '<img style="width:1024px;height:600px" src="data:image/jpeg;base64,' + v + '">').join('') + '</body>');
await planche.screenshot({ path: path.join(RACINE, 'docs', 'captures-k2', 'quatre-modes.png') });
await pc.evaluate(() => { document.getElementById('k2-champ')?.remove(); window.Telecommande.ouvrir(); }); await attendre(600);
await pc.screenshot({ path: path.join(RACINE, 'docs', 'captures-k2', 'fenetre-pc.png') });

// 8. Déconnexion depuis le PC, puis arrêt d'urgence
await pc.evaluate(() => document.querySelector('#tele-fenetre [data-a="deconnecter"]').click());
await tab.waitForFunction(() => !document.getElementById('appairage').hidden, { timeout: 8000 });
verifier('déconnecter depuis le PC : la tablette redemande un appairage', await tab.evaluate(() => !document.getElementById('appairage').hidden && /déconnect|autoris/i.test(document.getElementById('app-msg').textContent)), await tab.evaluate(() => document.getElementById('app-msg').textContent));
const e1 = await pc.evaluate(() => window.Telecommande.etat()); verifier('PC : plus aucun appareil', e1.appareils.length === 0);
await pc.evaluate(() => document.querySelector('#tele-fenetre [data-a="urgence"]').click()); await attendre(500);
const e2 = await pc.evaluate(() => window.Telecommande.etat());
verifier('arrêt d\'urgence : écoute fermée', e2.actif === false && await fetch(e0.url).then(() => false, () => true));
verifier('aucune erreur JavaScript (PC et tablette)', erreurs.length === 0 && errT.length === 0, erreurs.concat(errT).slice(0, 4).join(' | '));
await nav.close(); srv.close(); fs.rmSync(dossier, { recursive: true, force: true });
fin();
