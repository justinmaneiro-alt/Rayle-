// Conversation avec Raylé depuis la galaxie : UN clic sur le soleil ouvre l'écoute, un deuxième la coupe ; plus d'anneau autour des astres.
// Ce test aurait détecté la panne « je n'arrive pas à discuter avec Raylé depuis la galaxie » : avant la correction, le clic sur le soleil
// ne faisait que sélectionner, le bouton 🎙 démarrait en veille (mot d'activation + discours d'accueil qui rend la parole « ignorée »),
// et les erreurs (micro refusé, Worker absent) restaient invisibles dans le journal caché derrière la galaxie.
import puppeteer from 'puppeteer-core';
import './mock-worker.mjs';   // faux Worker local sur le port 8787
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const RACINE = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };

const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(RACINE + 'tests-navigateur/.profil-'),
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900', '--autoplay-policy=no-user-gesture-required'] });

// scenario : 'normal' (Worker configuré), 'sans-worker', 'micro-refuse'
async function ouvrir(scenario) {
  const page = await navigateur.newPage(); await page.setViewport({ width: 1600, height: 900 });
  const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  await page.evaluateOnNewDocument((sc) => {
    class FauxSR {
      constructor() { FauxSR.instances.push(this); this.actif = false; }
      start() {
        if (this.actif) { const e = new Error('déjà démarré'); e.name = 'InvalidStateError'; throw e; }
        this.actif = true;
        setTimeout(() => { if (sc === 'micro-refuse') { this.actif = false; this.onerror && this.onerror({ error: 'not-allowed' }); this.onend && this.onend(); } else this.onstart && this.onstart(); }, 10);
      }
      stop() { this.actif = false; setTimeout(() => this.onend && this.onend(), 10); }
      abort() { this.stop(); }
      emettre(texte, final = true) { this.onresult && this.onresult({ resultIndex: 0, results: [{ 0: { transcript: texte }, isFinal: final, length: 1 }] }); }
    }
    FauxSR.instances = [];
    window.webkitSpeechRecognition = FauxSR; window.SpeechRecognition = FauxSR;
    window.__dire = (t, final = true) => { const r = FauxSR.instances[FauxSR.instances.length - 1]; if (!r) return false; r.emettre(t, final); return true; };
    if (sc !== 'sans-worker') { localStorage.setItem('rayle_worker_url', 'http://127.0.0.1:8787'); localStorage.setItem('rayle_worker_token', 'code-de-test'); }
    else { localStorage.removeItem('rayle_worker_url'); localStorage.removeItem('rayle_worker_token'); }
    localStorage.removeItem('rayle_galaxie_reglages');
  }, scenario);
  await page.goto(BASE + '/index.html#galaxie', { waitUntil: 'load' });
  await attendre(3800);
  page.erreurs = erreurs;
  return page;
}
const etat = page => page.evaluate(() => ({
  micOn, mode, speaking, processing, etat: (RayleBus.etat('raylé') || {}).etat, gDit: document.getElementById('g-dit').textContent,
  nav: window.Galaxie.nav.etat(), carte: !document.getElementById('carte').hidden, vue: RayleBus.demander('vue')
}));
const ecran = (page, id) => page.evaluate(id => {
  const G = window.Galaxie, o = G.systeme.parId(id), v = G.camera.position.clone();
  const p = (o ? o.porteur : G.soleil.groupe).getWorldPosition(v.clone().set(0, 0, 0)).project(G.camera);
  return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight };
}, id);

/* ── A. Scénario normal : Worker configuré, micro simulé ── */
let page = await ouvrir('normal');
v('la galaxie est ouverte, micro coupé au départ', (await etat(page)).vue === 'galaxie' && (await etat(page)).micOn === false);
v('aucun élément « cercle » dans la page (plus d’anneau)', await page.evaluate(() => !document.querySelector('.g-cercle') && document.getElementById('etiquette').children.length === 1));

await page.mouse.move(800, 450); await attendre(500);
let e = await etat(page);
v('survol du soleil : le nom s’affiche', e.nav.survol === 'rayle' && await page.evaluate(() => { const t = document.getElementById('etiquette'); return !t.hidden && /Raylé/i.test(t.textContent); }));
v('survol : curseur « main »', await page.evaluate(() => document.getElementById('scene3d').style.cursor === 'pointer'));
v('survol : aucun contour autour de l’étiquette', await page.evaluate(() => { const s = getComputedStyle(document.getElementById('etiquette')); return s.borderTopWidth === '0px' && s.boxShadow === 'none'; }));

await page.mouse.click(800, 450); await attendre(700);
e = await etat(page);
v('UN clic sur le soleil : l’écoute est ouverte', e.micOn === true, JSON.stringify(e));
v('… directement en conversation (pas de mot d’activation)', e.mode === 'conversation' && e.etat === 'listening', e.mode + '/' + e.etat);
v('… sans fiche ni sélection (le soleil n’est pas une planète)', e.nav.selection === null && e.carte === false);
v('… sans discours d’accueil : Raylé ne parle pas', e.speaking === false && e.processing === false);
v('… et un sous-titre confirme l’écoute', /écoute/i.test(e.gDit), e.gDit);
await page.screenshot({ path: 'conv-1-ecoute.png' });

// Parole sans « Raylé » : doit être prise en compte
await page.evaluate(() => window.__dire('quelle heure est-il ?')); await attendre(1800);
e = await etat(page);
const journal = await page.evaluate(() => (window.RAYLE_ENTREES || []).slice(-2).map(x => x.texte + ' → ' + x.action));
v('une phrase sans « Raylé » est entendue et traitée', journal.some(j => /heure/.test(j) && !/ignoré/.test(j)), journal.join(' | '));
v('la réponse s’affiche en sous-titre dans la galaxie', /Il est \d/.test(e.gDit), e.gDit);

// Question qui passe par l'IA (faux Worker)
for (let i = 0; i < 40 && (await page.evaluate(() => speaking || processing || queue.length)); i++) await attendre(300);
await attendre(1500);   // la fin de sa parole laisse un court délai pendant lequel l'écoute est ignorée
await page.evaluate(() => window.__dire('pourquoi le ciel est bleu pendant la journée'));
for (let i = 0; i < 40 && !(await page.evaluate(() => [...document.querySelectorAll('#log .line')].some(l => /Réponse de test/.test(l.textContent)))); i++) await attendre(300);
const lignes = await page.evaluate(() => [...document.querySelectorAll('#log .line')].slice(-4).map(l => l.textContent));
v('une vraie question part vers l’IA et la réponse revient', lignes.some(l => /Réponse de test de l’IA/.test(l)), lignes.join(' | ').slice(0, 220));
v('conversation toujours ouverte après la réponse', (await etat(page)).micOn === true);

// Ce que Raylé entend, en direct
for (let i = 0; i < 40 && (await page.evaluate(() => speaking || processing || queue.length)); i++) await attendre(300);
await attendre(1500);
await page.evaluate(() => window.__dire('je réfléchis à voix', false)); await attendre(500);
v('sous-titre en direct de ce qui est entendu', /je réfléchis/.test((await etat(page)).gDit), (await etat(page)).gDit);

// Deuxième clic : coupe
await page.mouse.click(800, 450); await attendre(700);
e = await etat(page);
v('DEUXIÈME clic sur le soleil : la conversation est coupée', e.micOn === false && e.etat === 'idle' && !e.speaking && !e.processing, JSON.stringify(e));
v('… avec un message clair', /coupée|Coupé/i.test(e.gDit), e.gDit);
await page.mouse.click(800, 450); await attendre(700);
v('troisième clic : ça repart', (await etat(page)).micOn === true);
await page.mouse.click(800, 450); await attendre(500);

// Le bouton 🎙 suit le même chemin
await page.click('#g-mic'); await attendre(600);
e = await etat(page);
v('bouton 🎙 : même comportement (conversation directe)', e.micOn === true && e.mode === 'conversation');
await page.click('#g-mic'); await attendre(500);
v('bouton 🎙 : second appui coupe', (await etat(page)).micOn === false);

// Planètes : comportement inchangé (clic = fiche, double-clic = vol) et jamais de micro
await page.evaluate(() => window.Galaxie.nav.placer(null));
await attendre(500);
const marsXY = await ecran(page, 'mars');
v('Mars repérée à l’écran pour le test', marsXY.x > 0 && marsXY.x < 1600, JSON.stringify(marsXY));
if (marsXY) {
  await page.mouse.click(marsXY.x, marsXY.y); await attendre(500);
  e = await etat(page);
  v('planète : un clic ouvre la fiche (comportement conservé)', e.nav.selection === 'mars' && e.carte === true && e.micOn === false, JSON.stringify(e.nav));
  await page.mouse.move(40, 880); await attendre(400);
  v('… sélection sans survol : l’étiquette est cachée (nom seulement au survol)', await page.evaluate(() => document.getElementById('etiquette').hidden));
  await page.mouse.click(marsXY.x, marsXY.y, { clickCount: 2 }); await attendre(3300);
  e = await etat(page);
  v('planète : double-clic = vol jusqu’à elle (comportement conservé)', e.nav.focus === 'mars', JSON.stringify(e.nav));
  v('… et toujours aucun micro ouvert', e.micOn === false);
}
v('aucune exception JavaScript', page.erreurs.length === 0, page.erreurs.join(' | '));
await page.close();

/* ── B. Sans Worker : un message clair, visible dans la galaxie (et pas un silence) ── */
page = await ouvrir('sans-worker');
await page.mouse.click(800, 450); await attendre(600);
e = await etat(page);
v('sans Worker : le clic ne prétend pas écouter', e.micOn === false, JSON.stringify(e));
v('sans Worker : la raison est affichée dans la galaxie', /verrouill/i.test(e.gDit) && /Worker|⚙|accès/i.test(e.gDit), e.gDit);
await page.close();

/* ── C. Micro refusé par le navigateur : message visible, écoute coupée proprement ── */
page = await ouvrir('micro-refuse');
await page.mouse.click(800, 450); await attendre(900);
e = await etat(page);
v('micro refusé : l’écoute est coupée', e.micOn === false, JSON.stringify(e));
v('micro refusé : la marche à suivre est visible dans la galaxie', /Micro refusé/.test(e.gDit) && /cadenas/.test(e.gDit), e.gDit);
await page.close();

await navigateur.close();
for (const d of fs.readdirSync(RACINE + 'tests-navigateur')) if (d.startsWith('.profil-')) { try { fs.rmSync(RACINE + 'tests-navigateur/' + d, { recursive: true, force: true }); } catch (x) {} }
console.log(`\n${ok} réussis, ${ko} échecs`);
process.exit(ko ? 1 : 0);
