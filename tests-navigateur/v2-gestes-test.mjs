import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import { creerServeur } from '../serveur.mjs';
import { ouvrirWSTls, requeteTls } from '../galaxie/tests/ws-tls-aide.mjs';

/* V2 phase 11 : les gestes de la main dans la vraie page, SANS main réelle : suites de points enregistrées (tests-navigateur/fixtures-gestes, synthétiques) rejouées par Gestes.rejouer, effets
   vérifiés sur de vrais éléments (clic, saisie d'une fenêtre, balayage, zoom, rotation 3D, poing = ranger), pause, calibrage, aide, voix ; chaîne MediaPipe réelle sur une caméra FACTICE de Chrome
   (le modèle se charge, la boucle tourne, aucune main n'est trouvée) ; permission refusée / aucune caméra ; pont du téléphone en HTTPS réel (points envoyés par un faux téléphone).
   Lancer : node tests-navigateur/v2-gestes-test.mjs   (fichiers : node tests-navigateur/fixtures-gestes/fabriquer.mjs)   Ce qui ne peut PAS être testé ici : une vraie main devant une vraie caméra. */
const { verifier, fin } = compteur();
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(RACINE, 'tests-navigateur/fixtures-gestes');
if (!fs.existsSync(path.join(FIX, 'clic.json'))) { console.log('Suites absentes : node tests-navigateur/fixtures-gestes/fabriquer.mjs'); process.exit(1); }
const dossierDonnees = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-gestes-')), PORT = 8127;
const serveur = creerServeur({ portReseau: 0, dossierDonnees, ip: '127.0.0.1' });
await new Promise(r => serveur.listen(PORT, '127.0.0.1', r)); const BASE = 'http://127.0.0.1:' + PORT;
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--window-size=1400,900'] });
async function ouvrir({ avant = null } = {}) {
  const page = await nav.newPage(); await page.setViewport({ width: 1400, height: 900 }); const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message.slice(0, 200))); page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 200)); });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.removeItem('rayle_gestes'); } catch (e) { /* stockage refusé */ } });
  if (avant) await avant(page);
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(2500);
  await page.addScriptTag({ path: path.join(RACINE, 'core/gestes/main-synthetique.js') });
  return { page, erreurs };
}
const { page, erreurs } = await ouvrir();
const ev = (f, ...a) => page.evaluate(f, ...a);
const suite = nom => JSON.parse(fs.readFileSync(path.join(FIX, nom), 'utf8')).frames;
const placer = async (x, y) => ev(async (x2, y2) => { for (let i = 0; i < 6; i++) Telecommande.appliquer({ a: 'pointeur', dx: -300, dy: -300 }); let rx = x2, ry = y2; while (rx > 0) { const d = Math.min(300, rx); Telecommande.appliquer({ a: 'pointeur', dx: d, dy: 0 }); rx -= d; } while (ry > 0) { const d = Math.min(300, ry); Telecommande.appliquer({ a: 'pointeur', dx: 0, dy: d }); ry -= d; } return Telecommande.position(); }, x, y);
// banc d'essai : un bouton, une fenêtre saisissable, un canevas 3D, tous sous le curseur (600, 400)
await ev(() => {
  document.body.insertAdjacentHTML('beforeend', '<button id="essai-b" style="position:fixed;left:560px;top:370px;width:80px;height:60px;z-index:2147480000">essai</button><div class="pn" id="essai-fen" style="position:fixed;left:300px;top:340px;width:600px;height:200px;z-index:2147479000;background:#223"><div class="pn-tete" id="essai-tete" style="height:40px;background:#446">titre</div></div>');
  window.__j = { clic: 0, down: 0, move: 0, up: 0, roues: [], pd3: 0, pm3: 0, pu3: 0, msgs: {}, rangs: 0 };
  document.getElementById('essai-b').addEventListener('click', () => window.__j.clic++);
  const t = document.getElementById('essai-tete'); t.addEventListener('pointerdown', () => window.__j.down++); t.addEventListener('pointermove', e => { if (e.buttons & 1) window.__j.move++; }); t.addEventListener('pointerup', () => window.__j.up++);
  document.addEventListener('wheel', e => window.__j.roues.push({ dx: e.deltaX, dy: e.deltaY, ctrl: e.ctrlKey }), true);
  const o = Telecommande.appliquer; Telecommande.appliquer = m => { window.__j.msgs[m.a] = (window.__j.msgs[m.a] || 0) + 1; return o(m); };
  (window.RayleGestionnaires = window.RayleGestionnaires || new Set()).add({ reorganiser: m => { window.__j.rangs++; return m; } });
});
verifier('Gestes et son interface sont chargés, désactivés par défaut', await ev(() => !!window.Gestes && !!window.GestesUI && Gestes.etat().actif === false && !!document.getElementById('gestes-section') && document.getElementById('gestes-pastille').hidden));
verifier('la télécommande interne (curseur virtuel) est présente', await ev(() => !!window.Telecommande && !!Telecommande.appliquer));
const pos = await placer(600, 400); verifier('curseur virtuel posé sur le bouton d’essai', Math.abs(pos.x - 600) < 3 && Math.abs(pos.y - 400) < 3, JSON.stringify(pos));
await ev(() => { document.getElementById('essai-b').style.zIndex = 2147480000; document.getElementById('essai-fen').style.top = '340px'; });

// ── rejeu : clic ──
await ev(() => Gestes.activer({ source: 'rejeu', memoriser: false }));
verifier('source « rejeu » active : pastille visible', await ev(() => { const p = document.getElementById('gestes-pastille'); return !p.hidden && /rejeu/.test(p.textContent); }));
await ev(async f => { await Gestes.rejouer(f, { instantane: true }); }, suite('clic.json'));
verifier('clic.json : le bouton sous le curseur reçoit UN clic', await ev(() => window.__j.clic) === 1);
await ev(async f => { await Gestes.rejouer(f, { instantane: true }); }, suite('tremblement.json'));
verifier('tremblement.json : main immobile qui tremble = aucun clic, curseur immobile', await ev(() => window.__j.clic) === 1 && Math.abs((await ev(() => Telecommande.position().x)) - 600) < 25);
// ── saisie ──
await placer(350, 480);   // sur la fenêtre d'essai, hors du bouton
await ev(() => { window.__j.msgs = {}; });
await ev(async f => { await Gestes.rejouer(f, { instantane: true }); }, suite('saisie.json'));
const sj = await ev(() => ({ ...window.__j, msgs: { ...window.__j.msgs } }));
verifier('saisie.json : la barre de titre de la fenêtre est saisie (appui), suivie (déplacements), relâchée', sj.down === 1 && sj.move >= 3 && sj.up === 1, JSON.stringify({ d: sj.down, m: sj.move, u: sj.up, msgs: sj.msgs }));
verifier('le curseur a bougé dans le sens du geste (main à droite et en bas : curseur à gauche et en bas, miroir)', await ev(() => { const p = Telecommande.position(); return p.x < 130 && p.y > 480; }), JSON.stringify(await ev(() => Telecommande.position())));
await placer(600, 400);
// ── balayage, zoom, rotation ──
await ev(() => { window.__j.roues.length = 0; });
await ev(async f => { await Gestes.rejouer(f, { instantane: true }); }, suite('balayage.json'));
verifier('balayage.json : un défilement horizontal de ± 700 est envoyé sous le curseur', await ev(() => window.__j.roues.filter(r => Math.abs(r.dx) >= 600).length) === 1);
await ev(() => { window.__j.roues.length = 0; });
await ev(async f => { await Gestes.rejouer(f, { instantane: true }); }, suite('zoom-deux-mains.json'));
const zr = await ev(() => window.__j.roues);
verifier('zoom-deux-mains.json : deux mains pincées qui s’écartent = molette de zoom (ctrl) vers l’avant', zr.length >= 4 && zr.every(r => r.ctrl) && zr.reduce((s, r) => s + r.dy, 0) < -300, JSON.stringify({ n: zr.length, somme: zr.reduce((s, r) => s + r.dy, 0) }));
await ev(() => { const c = document.createElement('canvas'); c.id = 'essai-3d'; c.width = 6000; c.height = 4000; c.style.cssText = 'position:absolute;left:0;top:0;width:1400px;height:900px;z-index:2147470000'; document.body.appendChild(c); document.querySelectorAll('canvas.entite-canvas').forEach(x => { x.dataset.av = x.style.display; x.style.display = 'none'; }); window.__j.c3 = { d: 0, m: 0, u: 0 }; c.addEventListener('pointerdown', () => window.__j.c3.d++); c.addEventListener('pointermove', e => { if (e.buttons & 1) window.__j.c3.m++; }); c.addEventListener('pointerup', () => window.__j.c3.u++); document.getElementById('essai-fen').style.display = 'none'; document.getElementById('essai-b').style.display = 'none'; });
await ev(async f => { await Gestes.rejouer(f, { instantane: true }); }, suite('rotation-deux-mains.json')); await attendre(700);
verifier('rotation-deux-mains.json : l’objet 3D (canevas principal) est tourné (bouton gauche enfoncé, déplacements)', await ev(() => window.__j.c3.d >= 1 && window.__j.c3.m >= 3), JSON.stringify(await ev(() => window.__j.c3)));
await placer(600, 400);   // la rotation d'un objet 3D recentre le curseur virtuel sur le canevas : on le remet sur le bouton
await ev(() => { document.querySelectorAll('canvas.entite-canvas').forEach(x => { x.style.display = x.dataset.av || ''; }); document.getElementById('essai-3d').remove(); document.getElementById('essai-fen').style.display = ''; document.getElementById('essai-b').style.display = ''; });
// ── poing, pause ──
const poing = await ev(() => { const H = window.MainSynthetique; return H.suites.immobile('poing', 1.3); });
await ev(async f => { await Gestes.rejouer(f, { instantane: true }); }, poing);
verifier('poing tenu : les fenêtres sont rangées (réorganisation en grille de chaque gestionnaire)', await ev(() => window.__j.rangs) === 1);
await ev(() => { window.__j.clic = 0; });
await ev(async f => { await Gestes.rejouer(f, { instantane: true }); }, suite('deux-poings.json'));
verifier('deux poings tenus : gestes en pause (pastille « en pause »)', await ev(() => Gestes.etat().pause && /pause/.test(document.getElementById('gestes-pastille').textContent)));
await ev(async f => { await Gestes.rejouer(f, { instantane: true }); }, suite('clic.json'));
verifier('en pause, un clic enregistré ne clique pas', await ev(() => window.__j.clic) === 0);
await ev(async f => { await Gestes.rejouer(f, { instantane: true }); }, suite('deux-poings.json'));
verifier('deux poings tenus de nouveau : les gestes reprennent', await ev(() => !Gestes.etat().pause));
await ev(async f => { await Gestes.rejouer(f, { instantane: true }); }, suite('clic.json'));
verifier('après la reprise, le clic marche de nouveau', await ev(() => window.__j.clic) === 1);
await ev(() => Gestes.mettreEnPause(true)); await ev(async f => { await Gestes.rejouer(f, { instantane: true }); }, suite('clic.json'));
verifier('Gestes.mettreEnPause(true) (voix, bouton, Alt+G) coupe toute action', await ev(() => window.__j.clic) === 1);
await page.keyboard.down('Alt'); await page.keyboard.press('g'); await page.keyboard.up('Alt');
verifier('Alt+G bascule la pause', await ev(() => !Gestes.etat().pause));
// ── interface ──
await ev(() => { document.getElementById('gear').click(); });
verifier('⚙ → Gestes : section avec case, source, aide, calibrage, caméra du téléphone, enregistrement', await ev(() => ['gs-actif', 'gs-source', 'gs-aide', 'gs-calib', 'gs-tel', 'gs-pause', 'gs-enreg'].every(id => !!document.getElementById(id))));
await ev(() => document.getElementById('gs-aide').click());
verifier('écran d’aide : 8 gestes décrits', await ev(() => document.querySelectorAll('#gestes-modale .gm-tab tr').length) === 8 && await ev(() => /Pincer et tenir/.test(document.getElementById('gestes-modale').textContent)));
await page.screenshot({ path: 'captures-accueil/v2-gestes-aide.png' });
await ev(() => document.querySelector('#gestes-modale [data-g="fermer"]').click());
verifier('l’écran se ferme', await ev(() => document.getElementById('gestes-modale').hidden));
// ── calibrage ──
await ev(() => { Gestes.reinitialiserReglages(); });
const cal = await ev(async () => {
  const H = window.MainSynthetique; let phase = 0; const etapes = [];
  const feed = async ms => { phase++; const frames = phase === 1 ? H.suites.immobile('ouverte', 1.2, { pince: 0 }) : phase === 2 ? H.suites.immobile('pince', 1.2, { pince: 1 }) : H.suites.pointer(0.2, 0.2, 0.8, 0.7, 2); await Gestes.rejouer(frames, { instantane: true }); };
  const r = await Gestes.calibrer({ secondes: 1, etape: (n, t) => etapes.push(n + ':' + t.slice(0, 20)), attente: feed });
  return { r, etapes, prefs: Gestes.reglages() };
});
verifier('calibrage : trois étapes guidées, seuils et zone mesurés sur les points reçus, puis enregistrés', cal.etapes.length === 3 && cal.r.seuils.ok && cal.r.zone.ok && cal.prefs.seuilFerme > 0.15 && cal.prefs.seuilFerme < cal.prefs.seuilOuvre, JSON.stringify({ s: cal.r.seuils, z: cal.r.zone }));
verifier('les réglages sont gardés sur l’appareil (rayle_gestes)', await ev(() => JSON.parse(localStorage.getItem('rayle_gestes')).seuilFerme > 0));
await ev(() => Gestes.reinitialiserReglages());
// ── enregistrement de points réels (ici : rejeu) ──
const enr = await ev(async f => { const p = Gestes.enregistrer(0.5); await Gestes.rejouer(f.slice(0, 12), { instantane: true }); return await p; }, suite('clic.json'));
verifier('enregistrement local : points + origine, format identique aux suites de test', enr.frames.length >= 10 && enr.frames[0].mains[0].pts.length === 21 && /caméra réelle/.test(enr.origine));
// ── voix ──
const vo = await ev(async () => ({ aide: await Gestes.traiterVoix('aide des gestes'), hors: await Gestes.traiterVoix('quelle heure est-il'), pause: await Gestes.traiterVoix('mets les gestes en pause'), reprise: await Gestes.traiterVoix('reprends les gestes'), coupe: await Gestes.traiterVoix('désactive les gestes'), actif: Gestes.etat().actif }));
verifier('voix : aide, pause, reprise et désactivation ; phrase étrangère ignorée', /Pointer avec l’index/.test(vo.aide) && vo.hors === null && /pause/.test(vo.pause) && /repris/.test(vo.reprise) && /désactivés/.test(vo.coupe) && vo.actif === false, JSON.stringify(vo));
verifier('désactivé : le curseur est libéré et la pastille masquée', await ev(() => document.getElementById('gestes-pastille').hidden));
await ev(() => document.querySelector('#gestes-modale [data-g="fermer"]')?.click());

// ── chaîne MediaPipe réelle, caméra FACTICE de Chrome ──
const t0 = Date.now(); const act = await ev(() => Gestes.activer({ source: 'locale', memoriser: false }));
verifier('webcam factice : le modèle MediaPipe (WASM + hand_landmarker.task, servis par le serveur local) se charge et la caméra démarre', act === true && await ev(() => Gestes.etat().camera && Gestes.etat().charge), await ev(() => JSON.stringify({ err: Gestes.etat().erreur, info: Gestes.etat().info, ms: 0 })) + ' ' + (Date.now() - t0) + ' ms');
await attendre(2500);
const st = await ev(() => Gestes.etat());
verifier('la boucle de détection tourne (images par seconde > 0) et ne trouve aucune main sur l’image de test', st.fps > 0 && st.mains === 0, JSON.stringify({ fps: st.fps, mains: st.mains, info: st.info }));
verifier('aucun message envoyé sans main (aucun clic fantôme)', await ev(() => window.__j.clic) === 1);
await ev(() => Gestes.desactiver());
verifier('désactivation : la caméra est coupée (plus aucune piste active)', await ev(() => !Gestes.etat().camera));

// ── permission refusée / aucune caméra ──
for (const [nom, motif, attendu] of [['NotAllowedError', 'refusée', /Permission de la caméra refusée/], ['NotFoundError', 'absente', /Aucune caméra détectée/]]) {
  const { page: p2 } = await ouvrir({ avant: async pg => { await pg.evaluateOnNewDocument(n => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('essai', n)); }, nom); } });
  const r = await p2.evaluate(async () => { const ok = await Gestes.activer({ source: 'locale', memoriser: false }); return { ok, e: Gestes.etat() }; });
  verifier('caméra ' + motif + ' : message clair, gestes éteints, la page reste utilisable', r.ok === false && r.e.actif === false && attendu.test(r.e.erreur) && await p2.evaluate(() => typeof document.getElementById('gear').click === 'function'), r.e.erreur);
  await p2.evaluate(() => { document.getElementById('gear').click(); });
  verifier('caméra ' + motif + ' : le message est aussi visible dans ⚙ → Gestes', await p2.evaluate(async () => { await Gestes.activer({ source: 'locale', memoriser: false }); return /caméra/i.test(document.getElementById('gs-etat').textContent); }));
  await p2.close();
}

// ── pont du téléphone (HTTPS réel) : un faux téléphone envoie des points ──
const camera = serveur.camera, pontEtat = await camera.activer();
verifier('pont téléphone : activé en HTTPS avec QR et code', pontEtat.actif && pontEtat.https && /^https:\/\//.test(pontEtat.url) && pontEtat.qr.length > 20, pontEtat.avertissement || pontEtat.erreur || '');
if (pontEtat.actif && pontEtat.https) {
  const portC = Number(pontEtat.adresse.split(':')[1]), jetonQR = pontEtat.url.split('jeton=')[1];
  const pageC = await requeteTls(portC, '/camera?jeton=' + jetonQR), cookie = String(pageC.entetes['set-cookie'] || '').split(';')[0];
  const ap = await requeteTls(portC, '/camera/appairer', { methode: 'POST', entetes: { cookie }, corps: JSON.stringify({ code: pontEtat.code, nom: 'Faux téléphone' }) }), jeton = JSON.parse(ap.corps.toString()).jeton;
  await ev(async () => { Gestes.mettreEnPause(false); await Gestes.activer({ source: 'telephone', memoriser: false }); }); await attendre(600);
  await placer(600, 400); await ev(() => { window.__j.clic = 0; });
  const tel = await ouvrirWSTls(portC, '/camera/ws?jeton=' + jeton);
  verifier('faux téléphone appairé et connecté', tel.ok === true);
  for (const f of suite('clic.json')) { tel.envoyer({ a: 'mains', t: f.t, ratio: f.ratio, mains: f.mains }); await attendre(8); }
  await attendre(500);
  verifier('points reçus par le téléphone → clic sur le bouton de la page (même chemin que la webcam)', await ev(() => window.__j.clic) === 1);
  verifier('la pastille indique la source « téléphone »', await ev(() => /téléphone/.test(document.getElementById('gestes-pastille').textContent)));
  const avantMsgs = await ev(() => Object.values(window.__j.msgs).reduce((s, n) => s + n, 0));
  tel.envoyer({ a: 'commande', id: 'terre' }); tel.envoyer({ a: 'clic', n: 1 }); await attendre(300);
  verifier('un téléphone ne peut déclencher aucune autre action que des points de main', await ev(() => Object.values(window.__j.msgs).reduce((s, n) => s + n, 0)) === avantMsgs);
  await ev(async () => { await Gestes.activer({ source: 'telephone', memoriser: false }); document.getElementById('gear').click(); });
  await ev(() => document.getElementById('gs-tel').click()); await attendre(900);
  verifier('écran « Caméra du téléphone » : QR code, code d’appairage, appareil connecté listé, réserve sur le certificat', await ev(() => { const t = document.getElementById('gm-tel').textContent; return !!document.querySelector('#gm-tel svg') && /\d{6}/.test(t) && /Faux téléphone/.test(t) && /connexion non privée/.test(t); }));
  await page.screenshot({ path: 'captures-accueil/v2-gestes-telephone.png' });
  await ev(() => document.querySelector('#gestes-modale [data-g="fermer"]').click());
  tel.sock.destroy(); await camera.arreter(); await ev(() => Gestes.desactiver());
}
const miennes = erreurs.filter(e => !/faireconomy|CORS|Failed to load resource/.test(e));
verifier('aucune erreur JavaScript de la page', miennes.length === 0, miennes.join(' | '));
await nav.close(); serveur.camera.fermerTout(); serveur.tele.fermerTout(); serveur.close(); fs.rmSync(dossierDonnees, { recursive: true, force: true }); fin();
