import { execFileSync, spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { compteur, attendre } from './terre-aide.mjs';
import { demarrerFauxWorker } from './mock-worker-terre.mjs';

/* Mode multi-écrans AVEC DE VRAIES FENÊTRES sur les vrais écrans de ce PC (lanceur réel, Edge réel, Win32 réel).
   Isolé de l'application de tous les jours : autre port (8123), autres données (%TEMP%\rayle-multi-test), autre verrou : ton Rayle ouvert n'est pas touché.
   Pendant le test, des fenêtres s'ouvrent et se ferment sur tes écrans (environ 2 minutes). Lancer :  node tests-navigateur/multi-ecrans-test.mjs */
const { verifier, fin } = compteur();
const RACINE = path.resolve(import.meta.dirname, '..');
const PORT = 8123, PORT_DEBUG = 9444, BASE = 'http://127.0.0.1:' + PORT;
const DONNEES = path.join(os.tmpdir(), 'rayle-multi-test'), PROFIL = path.join(DONNEES, 'profil-edge');
const ps = (...a) => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...a], { encoding: 'utf8' }).trim();
const fen = (action, ...extra) => JSON.parse(ps('-File', path.join(RACINE, 'app-pc', 'fenetres.ps1'), '-Action', action, '-Profil', PROFIL, ...extra));
const procProfil = () => Number(ps('-Command', `(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*rayle-multi-test*' } | Measure-Object).Count`));
let portServeur = PORT;
const serveursTest = () => ps('-Command', `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*serveur.mjs*${portServeur}*' } | ForEach-Object { $_.ProcessId }`).split(/\s+/).filter(Boolean);
const appelServeur = (chemin, { methode = 'GET', corps, entetes = {} } = {}) => new Promise(ok => {
  const donnees = corps === undefined ? null : JSON.stringify(corps);
  const r = http.request({ host: '127.0.0.1', port: PORT, path: chemin, method: methode, headers: { ...(donnees ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(donnees) } : {}), ...entetes } }, res => { let t = ''; res.on('data', c => t += c); res.on('end', () => ok({ code: res.statusCode, texte: t })); });
  r.on('error', e => ok({ code: 0, texte: String(e) })); if (donnees) r.write(donnees); r.end();
});
async function jusqua(cond, max = 30000, pas = 400) { const t0 = Date.now(); while (Date.now() - t0 < max) { try { const v = await cond(); if (v) return v; } catch (e) {} await attendre(pas); } return false; }

fs.rmSync(DONNEES, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
fs.mkdirSync(DONNEES, { recursive: true });
const faux = await demarrerFauxWorker(8795);
const env = { ...process.env, RAYLE_DONNEES: DONNEES, RAYLE_DEBUG_PORT: String(PORT_DEBUG) };
const lancer = (...extra) => spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(RACINE, 'app-pc', 'lancer-rayle.ps1'), '-Port', String(PORT), ...extra], { stdio: 'ignore', env, windowsHide: true });   // pas « detached » : PowerShell sans console ne démarre pas
let nav = null;
const connecter = async () => { for (let i = 0; i < 60; i++) { try { return await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT_DEBUG, defaultViewport: null }); } catch (e) { await attendre(500); } } return null; };
let base = BASE;
const pages = async () => (await nav.pages()).filter(p => p.url().startsWith(base));
const principale = async () => (await pages()).find(p => !/[?&]ecran=/.test(p.url()));
const satellites = async () => (await pages()).filter(p => /[?&]ecran=/.test(p.url()));
const vraiesFenetres = () => fen('fenetres').fenetres || [];
const ecransReels = () => fen('ecrans').ecrans;
const CAPTURES = process.env.CAPTURES || '';
const capturer = nom => { if (!CAPTURES) return; fs.mkdirSync(CAPTURES, { recursive: true }); ps('-Command', `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.X,$b.Y,0,0,$bmp.Size); $bmp.Save('${path.join(CAPTURES, nom + '.png')}'); $g.Dispose(); $bmp.Dispose()`); };
const une = t => String(t).replace(/\s+/g, ' ').slice(0, 90);

try {
  // ══ A. lancement NORMAL (raccourci « Rayle ») : une seule fenêtre, rien d'automatique ══
  lancer();
  nav = await connecter();
  verifier('A. le lanceur ouvre la fenêtre principale', !!nav);
  let page = await jusqua(principale, 40000);
  verifier('A. la page Rayle est chargée', !!page);
  await attendre(4000);
  verifier('A. lancement normal : UNE seule fenêtre (aucun satellite)', (await satellites()).length === 0 && vraiesFenetres().filter(f => /RAYL|Rayl/.test(f.titre)).length === 1);
  verifier('A. le mode multi-écrans est désactivé au lancement normal', await page.evaluate(() => window.MultiEcrans && !window.MultiEcrans.actif()));

  // ══ B. sécurité du serveur local ══
  const ok1 = await appelServeur('/__multi/ecrans');
  const j1 = JSON.parse(ok1.texte);
  verifier('B. détection des écrans par le serveur local', ok1.code === 200 && j1.ok && j1.ecrans.length >= 1, ok1.texte.slice(0, 150));
  verifier('B. aucun appel sans l’en-tête de Rayle (POST refusé)', (await appelServeur('/__multi/fermer', { methode: 'POST', corps: { tout: true } })).code === 403);
  verifier('B. hôte étranger refusé (anti rebond DNS)', (await appelServeur('/__multi/ecrans', { entetes: { Host: 'evil.example.com' } })).code === 403);
  verifier('B. origine étrangère refusée', (await appelServeur('/__multi/ecrans', { entetes: { Origin: 'https://evil.example.com' } })).code === 403);
  verifier('B. appel venant d’un autre site refusé', (await appelServeur('/__multi/ecrans', { entetes: { 'Sec-Fetch-Site': 'cross-site' } })).code === 403);
  verifier('B. identifiant de fenêtre piégé refusé', JSON.parse((await appelServeur('/__multi/ouvrir', { methode: 'POST', corps: { id: 'x" --evil', ecran: { x: 0, y: 0, w: 800, h: 600 } }, entetes: { 'X-Rayle-Multi': '1' } })).texte).ok === false);
  verifier('B. route inconnue → 404', (await appelServeur('/__multi/rien')).code === 404);

  // Worker simulé (actualités) et rechargement
  await page.evaluate(u => { localStorage.setItem('rayle_worker_url', u); localStorage.setItem('rayle_worker_token', 'essai'); }, faux.url);
  await page.reload({ waitUntil: 'load' }); await attendre(2500);
  page = await principale();
  const ecr = await page.evaluate(async () => { await MultiEcrans.detecter(); return { liste: MultiEcrans.ecrans(), dispo: MultiEcrans.disponible(), etat: MultiEcrans.etat() }; });
  const reels = ecransReels();
  verifier('C. la page voit les mêmes écrans que Windows (nombre, positions, tailles)', ecr.dispo === true && ecr.liste.length === reels.length && reels.every(r => ecr.liste.some(e => e.x === r.x && e.y === r.y && e.w === r.w && e.h === r.h)), JSON.stringify(ecr.liste.map(e => [e.numero, e.x, e.y, e.w, e.h, e.orientation])));
  verifier('C. disposition par défaut proposée (principal = Raylé, écran 2 = actualités, vertical = fil + conversation)',
    (() => { const d = ecr.etat.dispositions[ecr.etat.courante].ecrans; const t = e => (d[e.id] || []).map(m => m.type).join('+'); return ecr.liste.length >= 3 ? t(ecr.liste.find(e => e.primaire)) === 'rayle' && ecr.liste.some(e => !e.primaire && e.orientation === 'horizontal' && t(e) === 'actus') && ecr.liste.some(e => e.orientation === 'vertical' && t(e) === 'fil+conversation') : true; })());

  // ══ D. éditeur ⚙ « Mes écrans » : de vrais clics ══
  await page.waitForFunction(() => !document.body.classList.contains('boot'), { timeout: 20000 }).catch(() => {});
  await page.click('#gear'); await page.waitForSelector('#mxEditeur .mx-carte', { timeout: 8000 }).catch(() => {}); await attendre(500);
  const ed = await page.evaluate(() => ({ tuiles: document.querySelectorAll('#mxEditeur .mx-tuile').length, ecrans: document.querySelectorAll('#mxEditeur .mx-ecran').length, bouton: document.getElementById('mxBascule').textContent, carte: !!document.querySelector('#mxEditeur .mx-carte') }));
  verifier('D. ⚙ affiche « Mes écrans » : un rectangle par écran, une tuile par module', ed.carte && ed.ecrans === reels.length && ed.tuiles >= 1, JSON.stringify(ed));
  verifier('D. le bouton propose d’activer le mode', /Activer le mode multi/.test(ed.bouton));
  const echelle = await page.evaluate(() => [...document.querySelectorAll('#mxEditeur .mx-ecran')].map(e => { const r = e.getBoundingClientRect(); return r.width / r.height; }));
  verifier('D. écrans dessinés à l’échelle (16/9 et 9/16)', echelle.every(x => Math.abs(x - 16 / 9) < 0.06 || Math.abs(x - 9 / 16) < 0.06), echelle.map(x => x.toFixed(2)).join());

  // ── D2. éditeur : vrais clics, glisser-déposer, dispositions enregistrées (sur une copie « Essai » : le défaut n'est pas touché) ──
  const dispo = () => page.evaluate(() => ({ d: MultiEcrans.disposition(), courante: MultiEcrans.etat().courante, noms: Object.keys(MultiEcrans.etat().dispositions) }));
  await page.type('#mxNom', 'Essai'); await page.click('#mxEditeur button[data-a="enreg"]'); await attendre(500);
  let st = await dispo();
  verifier('D2. « Enregistrer sous ce nom » crée la disposition « Essai » (copie, devient la courante)', st.courante === 'Essai' && st.noms.includes('Défaut'), st.noms.join());
  const premiereTuile = await page.$('#mxEditeur .mx-tuile'); await premiereTuile.click(); await attendre(300);
  verifier('D2. un clic sur une tuile ouvre ses réglages', !!(await page.$('#mxEditeur .mx-insp')));
  const partDe = () => page.evaluate(() => { const id = document.querySelector('#mxEditeur .mx-insp').dataset.m; return Object.values(MultiEcrans.disposition().ecrans).flat().find(m => m.id === id).part; });
  const partAvant = await partDe();
  await page.click('#mxEditeur .mx-insp button[data-a="plus"]'); await attendre(300);
  const partApres = await partDe();
  verifier('D2. « + » agrandit le module (taille proportionnelle)', partApres === partAvant + 1, `${partAvant} → ${partApres}`);
  const nbAvantAjout = (await page.$$('#mxEditeur .mx-tuile')).length;
  await page.select('#mxType', 'meteo|0'); await page.click('#mxEditeur button[data-a="ajout"]'); await attendre(400);
  verifier('D2. « + Ajouter » pose un module sur l’écran choisi', (await page.$$('#mxEditeur .mx-tuile')).length === nbAvantAjout + 1);
  const champ = await page.$('#mxChamp');
  verifier('D2. le module météo propose un champ « Ville »', !!champ);
  if (champ) {
    await page.type('#mxChamp', 'Bordeaux'); await page.click('#mxEditeur button[data-a="champ"]');
    await jusqua(() => page.evaluate(() => Object.values(MultiEcrans.disposition().ecrans).flat().some(m => m.type === 'meteo' && Number.isFinite(m.params.lat))), 15000, 400);
  }
  verifier('D2. la ville est trouvée (géocodage Open-Meteo réel) et enregistrée dans le module', await page.evaluate(() => Object.values(MultiEcrans.disposition().ecrans).flat().some(m => m.type === 'meteo' && Number.isFinite(m.params.lat) && /Bordeaux/.test(m.params.nom))), JSON.stringify(await page.evaluate(() => Object.values(MultiEcrans.disposition().ecrans).flat().filter(m => m.type === 'meteo').map(m => m.params))));
  // glisser-déposer : une tuile d'un écran vers un autre
  const dnd = await page.evaluate(() => {
    const tuiles = [...document.querySelectorAll('#mxEditeur .mx-tuile')], ecrans = [...document.querySelectorAll('#mxEditeur .mx-ecran')];
    const cible = ecrans[ecrans.length - 1], t = tuiles.find(x => x.dataset.e !== cible.dataset.e);
    if (!t || !cible) return null;
    const dt = new DataTransfer(), r = cible.getBoundingClientRect();
    t.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    cible.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 5, clientY: r.top + 5 }));
    cible.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 5, clientY: r.top + 5 }));
    t.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    return { module: t.dataset.m, de: t.dataset.e, vers: cible.dataset.e };
  });
  st = await dispo();
  verifier('D2. glisser-déposer d’une tuile sur un autre écran déplace le module', !!dnd && (st.d.ecrans[dnd.vers] || []).some(m => m.id === dnd.module) && !(st.d.ecrans[dnd.de] || []).some(m => m.id === dnd.module), JSON.stringify(dnd));
  // réorganiser sur le même écran : la dernière tuile passe en première place
  const ordreAvant = await page.evaluate(() => { const e = [...document.querySelectorAll('#mxEditeur .mx-ecran')].find(x => x.querySelectorAll('.mx-tuile').length >= 2); return e ? { e: e.dataset.e, ids: [...e.querySelectorAll('.mx-tuile')].map(t => t.dataset.m) } : null; });
  if (ordreAvant) {
    await page.evaluate(o => {
      const e = document.querySelector(`#mxEditeur .mx-ecran[data-e="${CSS.escape(o.e)}"]`), t = e.querySelectorAll('.mx-tuile')[o.ids.length - 1], dt = new DataTransfer(), r = e.getBoundingClientRect();
      t.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      e.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 2, clientY: r.top + 2 }));
    }, ordreAvant);
    const apres = (await dispo()).d.ecrans[ordreAvant.e].map(m => m.id);
    verifier('D2. glisser une tuile en première place réorganise l’écran', apres[0] === ordreAvant.ids[ordreAvant.ids.length - 1], apres.join());
  }
  await page.type('#mxNom', 'Détente'); await page.click('#mxEditeur button[data-a="renom"]'); await attendre(400);
  st = await dispo(); verifier('D2. « Renommer en ce nom » renomme la disposition courante', st.courante === 'Détente' && !st.noms.includes('Essai'), st.noms.join());
  await page.click('#mxEditeur button[data-a="dupli"]'); await attendre(400);
  st = await dispo(); verifier('D2. « Dupliquer » crée une copie', st.noms.length === 3, st.noms.join());
  await page.click('#mxEditeur button[data-a="suppr"]'); await attendre(300);
  verifier('D2. « Supprimer » demande d’abord une confirmation', (await dispo()).noms.length === 3 && /Confirmer/.test(await page.$eval('#mxEditeur button[data-a="suppr"]', b => b.textContent)));
  await page.click('#mxEditeur button[data-a="suppr"]'); await attendre(400);
  st = await dispo(); verifier('D2. confirmer supprime la disposition', st.noms.length === 2, st.noms.join());
  await page.select('#mxDispoSel', 'Défaut'); await attendre(400);
  st = await dispo(); verifier('D2. le menu « Disposition » en choisit une autre', st.courante === 'Défaut');
  for (const n of st.noms.filter(x => x !== 'Défaut')) { await page.evaluate(x => MultiEcrans.edition.supprimer(x), n); }
  verifier('D2. disposition par défaut intacte après les essais', await page.evaluate(() => Object.values(MultiEcrans.disposition().ecrans).flat().map(m => m.type).sort().join() === 'actus,conversation,fil,rayle'));

  // ══ E. ACTIVATION par le bouton ⚙ ══
  await page.click('#mxBascule');
  const attendus = ecr.liste.filter(e => !e.primaire && (ecr.etat.dispositions[ecr.etat.courante].ecrans[e.id] || []).length).length;
  const ouvertes = await jusqua(async () => (await satellites()).length >= attendus, 60000, 500);
  verifier('E. le bouton ⚙ ouvre une fenêtre par écran à remplir', !!ouvertes && (await satellites()).length === attendus, `${(await satellites()).length}/${attendus}`);
  await attendre(5000);
  const fw = vraiesFenetres(), sats = fw.filter(f => /\[rayle-sat-/.test(f.titre));
  verifier('E. les fenêtres satellites existent côté Windows (titre repérable)', sats.length === attendus, sats.map(f => f.titre).join(' | '));
  const colle = (f, r) => f.x === r.x && f.y === r.y && f.w === r.w && Math.abs(f.h - r.h) <= 2;   // Windows garde parfois 1 pixel en bas (barre des tâches masquée)
  const placeOk = sats.every(f => reels.some(r => colle(f, r)));
  verifier('E. chaque satellite est EXACTEMENT sur son écran (position et taille réelles, sans bordure)', placeOk, sats.map(f => `${f.x},${f.y} ${f.w}×${f.h}`).join(' | '));
  const principal = fw.find(f => /RAYL/.test(f.titre) && !/\[rayle-sat-/.test(f.titre));
  const ecP = reels.find(r => r.primaire);
  verifier('E. la fenêtre principale reste sur l’écran principal', principal && principal.x >= ecP.x - 20 && principal.x < ecP.x + ecP.w && principal.y >= ecP.y - 20 && principal.y < ecP.y + ecP.h, principal && `${principal.x},${principal.y}`);

  const sp = await satellites();
  const etatSat = async p => p.evaluate(() => ({ titre: document.title, sr: typeof (window.SpeechRecognition || window.webkitSpeechRecognition), role: window.MultiEcrans && window.MultiEcrans.role, slots: [...document.querySelectorAll('#multi-satellite .mx-slot')].map(s => ({ type: s.dataset.type, texte: s.innerText.slice(0, 160), w: Math.round(s.getBoundingClientRect().width), h: Math.round(s.getBoundingClientRect().height) })), accueilCache: getComputedStyle(document.getElementById('scene')).display === 'none' && getComputedStyle(document.getElementById('barre')).display === 'none', largeur: innerWidth, hauteur: innerHeight }));
  const infos = []; for (const p of sp) infos.push(await etatSat(p));
  verifier('E. les satellites sont bien des satellites (rôle, accueil masqué, titre)', infos.every(i => i.role === 'satellite' && i.accueilCache && /\[rayle-sat-/.test(i.titre)), JSON.stringify(infos.map(i => i.role)));
  verifier('E. UNE SEULE fenêtre a le micro : pas de reconnaissance vocale dans les satellites', infos.every(i => i.sr === 'undefined') && (await page.evaluate(() => typeof (window.SpeechRecognition || window.webkitSpeechRecognition))) === 'function');
  const typesSat = infos.flatMap(i => i.slots.map(s => s.type)).sort().join();
  verifier('E. les modules de la disposition sont affichés dans les satellites', typesSat === 'actus,conversation,fil' || attendus < 2, typesSat);
  const actusSat = infos.flatMap(i => i.slots).find(s => s.type === 'actus');
  verifier('E. les actualités affichent de vrais titres du flux (faux Worker)', !attendus || (actusSat && /Titre|Mobilisation|Bordeaux|tramway/i.test(actusSat.texte)), actusSat && une(actusSat.texte));
  const vert = infos.find(i => i.slots.some(s => s.type === 'fil'));
  verifier('E. écran vertical : fil et conversation empilés, tailles proportionnelles (1 pour 2)', !vert || (vert.slots.length === 2 && vert.slots[0].h < vert.slots[1].h && vert.slots[0].w === vert.slots[1].w), vert && JSON.stringify(vert.slots.map(s => [s.type, s.w, s.h])));

  // ══ F. synchronisation entre fenêtres ══
  await page.evaluate(() => { addLine('user', 'Bonjour Raylé, essai multi-écrans'); addLine('ray', 'Je t’entends parfaitement, Justin.'); });
  await attendre(900);
  const conv = await (async () => { for (const p of await satellites()) { const t = await p.evaluate(() => (document.querySelector('.mx-conv') || {}).innerText || ''); if (t) return t; } return ''; })();
  verifier('F. la conversation de la fenêtre principale apparaît dans le satellite (BroadcastChannel)', /essai multi-écrans/.test(conv) && /parfaitement/.test(conv), une(conv));
  capturer('1-ecrans-reels-disposition-defaut');
  // voix : « mets la disposition … » passe par command() (le vrai chemin du micro) et le bus d'ordres
  await page.evaluate(() => { const e = MultiEcrans.etat(); const ec = MultiEcrans.ecrans(); MultiEcrans.edition.enregistrerSous('Trading'); });
  const journal0 = await page.evaluate(() => RayleOrdres.journal().length);
  const sec = ecr.liste.find(e => !e.primaire && e.orientation === 'horizontal') || ecr.liste.find(e => !e.primaire);
  if (sec) {
    // disposition Trading : l'écran 2 reçoit Raylé + météo (au lieu des actualités)
    await page.evaluate(async idE => {
      const d = MultiEcrans.disposition(); for (const m of d.ecrans[idE] || []) MultiEcrans.edition.retirerModule(idE, m.id);
      MultiEcrans.edition.ajouterModule(idE, 'rayle'); MultiEcrans.edition.ajouterModule(idE, 'meteo', { ville: 'Bordeaux', nom: 'Bordeaux', lat: 44.84, lon: -0.58 });
      MultiEcrans.edition.enregistrerSous('Trading');
      MultiEcrans.edition.choisir('Défaut');
    }, sec.id);
    await jusqua(async () => (await page.evaluate(() => MultiEcrans.etat().courante)) === 'Défaut', 5000);
    const rv = await page.evaluate(() => command('mets la disposition Trading'));
    const apresVoix = await jusqua(async () => (await page.evaluate(() => MultiEcrans.etat().courante)) === 'Trading', 20000, 500);
    const bascule = apresVoix && await jusqua(async () => { for (const p of await satellites()) { const t = await p.evaluate(() => [...document.querySelectorAll('.mx-slot')].map(s => s.dataset.type).join()); if (/rayle,meteo/.test(t)) return true; } return false; }, 25000, 500);
    verifier('F. « mets la disposition Trading » (voix : command()) est reconnue et change les fenêtres en direct', rv === true && !!bascule, 'command=' + rv + ' courante=' + apresVoix);
    await jusqua(() => page.evaluate(() => RayleOrdres.journal().some(o => o.action === 'disposition')), 40000, 700);   // l'ordre se termine quand les fenêtres sont en place
    const ordres = await page.evaluate(() => RayleOrdres.journal().slice(-4));
    verifier('F. la commande vocale est passée par le bus d’ordres (rayle/disposition)', ordres.some(o => o.action === 'disposition' && o.ok), JSON.stringify(ordres));
    const etatEntite = await jusqua(async () => { await page.evaluate(() => setState('listening')); await attendre(900); for (const p of await satellites()) { const t = await p.evaluate(() => (document.querySelector('.mx-etat') || {}).innerText || ''); if (/CONVERSATION/.test(t)) return t; } return false; }, 20000, 100);
    verifier('F. l’état de Raylé (écoute) est reflété dans le module Raylé du satellite', /CONVERSATION/.test(etatEntite || ''), String(etatEntite));
    await page.evaluate(() => setState('idle'));
    // micro depuis un satellite : le clic passe par la fenêtre principale
    const avantMic = await page.evaluate(() => { window.__mic = 0; const f = RayleBus.demander; RayleBus.fournir('rayle:conversation', () => { window.__mic++; return 'ok'; }); return 1; });
    for (const p of await satellites()) { const a = await p.$('.mx-micro'); if (a) { await a.click(); break; } }
    await attendre(800);
    verifier('F. le bouton micro d’un satellite agit sur la fenêtre principale (une seule fenêtre a le micro)', (await page.evaluate(() => window.__mic)) === 1);
    // actualités : une demande vocale agit sur les autres fenêtres
    await page.evaluate(() => { MultiEcrans.edition.choisir('Défaut'); });
    await attendre(6000);
    await page.evaluate(() => { MultiEcrans.diffuserVoix('actualités sport'); });
    await attendre(1500);
    let titreActus = ''; for (const p of await satellites()) { const t = await p.evaluate(() => (document.querySelector('.mx-actus .mx-tete b') || {}).innerText || ''); if (t) titreActus = t; }
    verifier('F. une demande vocale (« actualités sport ») est appliquée dans la fenêtre des actualités', /Sport/i.test(titreActus), titreActus);
  }

  // ══ G. changer d'écran en direct (fenêtres d'actualité) ══
  const modActus = await page.evaluate(() => { const d = MultiEcrans.disposition(); for (const [e, l] of Object.entries(d.ecrans)) for (const m of l) if (m.type === 'actus') return { e, m: m.id }; return null; });
  const autreEcran = ecr.liste.filter(e => !e.primaire && e.id !== (modActus && modActus.e));
  if (modActus && autreEcran.length) {
    const cible = autreEcran[0];
    await page.evaluate((m, de, vers) => MultiEcrans.edition.deplacer(m, de, vers), modActus.m, modActus.e, cible.id);
    const bouge = await jusqua(async () => { for (const p of await satellites()) { const r = await p.evaluate(() => ({ slots: [...document.querySelectorAll('.mx-slot')].map(s => s.dataset.type), t: document.title })); if (r.slots.includes('actus') && r.t.includes(require_id(cible.id))) return true; } return false; }, 25000, 600);
    function require_id(id) { return 'rayle-sat-e' + id.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 30); }
    verifier('G. les actualités passent d’un écran à l’autre en direct', !!bouge);
    // et par les boutons de la fenêtre elle-même (↦ n)
    const sp2 = await satellites(); let fait = false;
    for (const p of sp2) { const b = await p.$('.mx-slot[data-type="actus"] .mx-outils button[data-a="vers"]'); if (b) { await p.evaluate(() => { document.querySelector('.mx-slot[data-type="actus"] .mx-outils button[data-a="vers"]').click(); }); fait = true; break; } }
    await attendre(5000);
    const dispoApres = await page.evaluate(() => { const d = MultiEcrans.disposition(); for (const [e, l] of Object.entries(d.ecrans)) if (l.some(m => m.type === 'actus')) return e; return null; });
    verifier('G. le bouton « ↦ n » d’un module déplace le module (message au principal)', fait && dispoApres && dispoApres !== cible.id, dispoApres);
    if (dispoApres) await page.evaluate((m, de, vers) => MultiEcrans.edition.deplacer(m, de, vers), modActus.m, dispoApres, modActus.e);   // on remet les actualités à leur place d'origine
    await attendre(6000);
  }

  // ══ H. fermer UNE fenêtre n'arrête pas les autres ══
  await page.evaluate(() => MultiEcrans.edition.choisir('Défaut'));
  await jusqua(() => vraiesFenetres().filter(f => /\[rayle-sat-/.test(f.titre)).length >= attendus, 40000, 800); await attendre(3000);
  const avantFermeture = vraiesFenetres().filter(f => /\[rayle-sat-/.test(f.titre));
  if (avantFermeture.length >= 2) {
    const id = /\[rayle-sat-([a-z0-9-]+)\]/.exec(avantFermeture[0].titre)[1];
    await page.evaluate(i => fetch('/__multi/fermer', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rayle-Multi': '1' }, body: JSON.stringify({ id: i }) }), id);
    await attendre(3500);
    const apres = vraiesFenetres();
    verifier('H. fermer une fenêtre laisse les autres ouvertes (et la principale)', apres.filter(f => /\[rayle-sat-/.test(f.titre)).length === avantFermeture.length - 1 && apres.some(f => /RAYL/.test(f.titre) && !/\[rayle-sat-/.test(f.titre)));
    const ouvertEncore = await page.evaluate(() => MultiEcrans.actif());
    verifier('H. le mode reste actif', ouvertEncore === true);
    // rouvrir : ré-appliquer la disposition rouvre seulement la fenêtre fermée
    await attendre(9500);
    await page.evaluate(() => MultiEcrans.appliquer());
    await jusqua(() => vraiesFenetres().filter(f => /\[rayle-sat-/.test(f.titre)).length === avantFermeture.length, 40000, 800);
    verifier('H. « rouvrir » remet la fenêtre fermée à sa place', vraiesFenetres().filter(f => /\[rayle-sat-/.test(f.titre)).length === avantFermeture.length);
  }

  // ══ I. DÉSACTIVATION (bouton ⚙) : les satellites se ferment, l'écran principal revient à la normale, rien n'est perdu ══
  const conversationAvant = await page.evaluate(() => document.getElementById('log').children.length);
  await page.evaluate(() => document.getElementById('cfg').classList.contains('open') || document.getElementById('gear').click());
  await attendre(500);
  await page.click('#mxBascule');
  const fermes = await jusqua(() => vraiesFenetres().filter(f => /\[rayle-sat-/.test(f.titre)).length === 0, 30000, 600);
  verifier('I. « Désactiver » ferme toutes les fenêtres satellites', !!fermes);
  verifier('I. la fenêtre principale reste, avec son journal intact (rien perdu)', vraiesFenetres().some(f => /RAYL/.test(f.titre) && !/\[rayle-sat-/.test(f.titre)) && (await page.evaluate(() => document.getElementById('log').children.length)) >= conversationAvant);
  verifier('I. la disposition choisie est conservée', await page.evaluate(() => !!MultiEcrans.etat().dispositions.Trading && !MultiEcrans.actif()));
  const mem = await page.evaluate(() => JSON.parse(localStorage.getItem('rayle_multi')));
  verifier('I. le choix est mémorisé (rayle_multi)', mem && mem.actif === false && !!mem.dispositions.Trading);

  // ══ J. écran principal avec autre chose que Raylé : surface plein écran + retour au normal ══
  await page.evaluate(async idE => { MultiEcrans.edition.choisir('Défaut'); const d = MultiEcrans.disposition(); for (const m of d.ecrans[idE] || []) MultiEcrans.edition.retirerModule(idE, m.id); MultiEcrans.edition.ajouterModule(idE, 'rayle'); MultiEcrans.edition.ajouterModule(idE, 'meteo', { nom: 'Paris' }); await MultiEcrans.activer(); }, ecr.liste.find(e => e.primaire).id);
  await attendre(2500);
  const voile = await page.evaluate(() => ({ present: !!document.getElementById('multi-voile'), types: [...document.querySelectorAll('#multi-voile .mx-slot')].map(s => s.dataset.type).join() }));
  verifier('J. écran principal avec Raylé + météo : la surface des modules couvre la fenêtre principale', voile.present && voile.types === 'rayle,meteo', JSON.stringify(voile));
  await page.evaluate(() => document.querySelector('#multi-voile .mx-barre-principale button[data-a="normal"]').click());
  await attendre(1500);
  verifier('J. le bouton « normal » rend l’écran principal à Raylé seul', await page.evaluate(() => !document.getElementById('multi-voile') && MultiEcrans.disposition() && true));

  // ══ K. RECHARGEMENT de la page principale pendant que le mode est actif : les fenêtres sont reprises, pas dupliquées ══
  const nbAvant = vraiesFenetres().filter(f => /\[rayle-sat-/.test(f.titre)).length;
  await page.reload({ waitUntil: 'load' });
  await attendre(9000);
  page = await principale();
  const apresRecharge = vraiesFenetres().filter(f => /\[rayle-sat-/.test(f.titre)).length;
  verifier('K. rechargement de la page : aucune fenêtre dupliquée, le mode est repris', apresRecharge === nbAvant && (await page.evaluate(() => MultiEcrans.actif())) === true, `${nbAvant} → ${apresRecharge}`);

  // ══ L. FERME TOUT (Ctrl+F9) : tout se ferme, sans processus fantôme ══
  verifier('L. avant : des fenêtres et le serveur du test tournent', vraiesFenetres().length >= 1 && serveursTest().length === 1);
  await page.keyboard.down('Control'); await page.keyboard.press('F9'); await page.keyboard.up('Control');
  const toutFerme = await jusqua(() => procProfil() === 0 && serveursTest().length === 0, 60000, 1000);
  verifier('L. « Ferme tout » (Ctrl+F9) : plus aucune fenêtre ni processus du navigateur de Rayle', procProfil() === 0, 'processus restants : ' + procProfil());
  verifier('L. le serveur démarré par le lanceur est arrêté aussi', serveursTest().length === 0);
  nav = null;

  // ══ M. LE VRAI RACCOURCI « Rayle Multi-écrans » (RayleMulti.vbs → lanceur -Multi, port et données du test) : le mode démarre seul ; « ferme tout » à la voix ══
  {
    const port8000Libre = true;   // le vrai raccourci est lancé sur le port du test (RAYLE_PORT) : ton Rayle sur le port 8000 n'est pas touché
    spawn('wscript.exe', [path.join(RACINE, 'app-pc', 'RayleMulti.vbs')], { detached: true, stdio: 'ignore', env: { ...env, RAYLE_PORT: String(PORT) } }).unref();
    nav = await connecter();
    verifier('M. RayleMulti.vbs ouvre la fenêtre principale', !!nav);
    const pm = nav && await jusqua(principale, 40000);
    verifier('M. l’adresse porte ?multi=1', !!pm && /[?&]multi=1/.test(pm.url()), pm && pm.url());
    const venus = await jusqua(async () => (await satellites()).length >= attendus, 90000, 800);
    if (!venus) console.log('   journal de la page :', await pm.evaluate(() => [...document.querySelectorAll('#log .line')].slice(-5).map(l => l.textContent.slice(0, 160)).join(' / ')));
    verifier('M. le mode multi-écrans démarre tout seul : une fenêtre par écran à remplir', !!venus && (await satellites()).length === attendus, `${(await satellites()).length}/${attendus}`);
    await attendre(5000);
    const fwM = vraiesFenetres().filter(f => /\[rayle-sat-/.test(f.titre));
    verifier('M. satellites exactement sur leurs écrans dès le lancement', fwM.length === attendus && fwM.every(f => reels.some(r => colle(f, r))), fwM.map(f => `${f.x},${f.y} ${f.w}×${f.h}`).join(' | '));
    capturer('2-lancement-rayle-multi-ecrans');
    verifier('M. mode actif et mémorisé', await pm.evaluate(() => MultiEcrans.actif() === true));
    // « ferme tout » à la voix (le mode est actif : la phrase ferme tout Rayle)
    await pm.evaluate(() => command('ferme tout'));
    const fini = await jusqua(() => procProfil() === 0 && serveursTest().length === 0, 60000, 1000);
    verifier('M. « ferme tout » à la voix : toutes les fenêtres et le serveur sont arrêtés, rien ne reste', !!fini, `processus ${procProfil()}, serveurs ${serveursTest().length}`);
    nav = null;
  }
} catch (e) {
  verifier('Aucune exception pendant le test', false, e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e));
} finally {
  try { if (nav) { await nav.disconnect(); } } catch (e) {}
  // nettoyage de sécurité : ne laisse rien du test
  try { execFileSync('powershell.exe', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*rayle-multi-test*') -or ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*serveur.mjs*${PORT}*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`]); } catch (e) {}
  await faux.fermer();
  fin();
}
