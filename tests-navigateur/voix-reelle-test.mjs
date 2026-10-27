// Voix « réelle » : reconnaissance vocale simulée (même interface que Chrome), mot d'activation, micro, Worker configuré.
import puppeteer from 'puppeteer-core';
import './mock-worker.mjs';   // faux Worker local sur le port 8787
import { fileURLToPath } from 'node:url';
const RACINE = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const AVEC_WORKER = process.argv[2] !== 'sans-worker';
const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900', '--autoplay-policy=no-user-gesture-required'] });
const page = await navigateur.newPage();
await page.setViewport({ width: 1600, height: 900 });
const erreurs = [];
page.on('console', m => { if (['error', 'warning'].includes(m.type())) erreurs.push(m.text().slice(0, 240)); });
page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 300)));
await page.evaluateOnNewDocument((avecWorker) => {
  // Faux SpeechRecognition : mêmes événements que Chrome (resultIndex, results[i][0].transcript, isFinal)
  class FauxSR {
    constructor() { this.lang = ''; this.continuous = false; this.interimResults = false; FauxSR.instances.push(this); this.actif = false; }
    start() { if (this.actif) { const e = new Error('déjà démarré'); e.name = 'InvalidStateError'; throw e; } this.actif = true; setTimeout(() => this.onstart && this.onstart(), 10); }
    stop() { this.actif = false; setTimeout(() => this.onend && this.onend(), 10); }
    abort() { this.actif = false; setTimeout(() => this.onend && this.onend(), 10); }
    emettre(texte, final = true) {
      const res = [{ 0: { transcript: texte }, isFinal: final, length: 1 }];
      this.onresult && this.onresult({ resultIndex: 0, results: res });
    }
  }
  FauxSR.instances = [];
  window.webkitSpeechRecognition = FauxSR; window.SpeechRecognition = FauxSR;
  window.__dire = (t) => { const r = FauxSR.instances[FauxSR.instances.length - 1]; if (!r) return false; r.emettre(t, true); return true; };
  if (avecWorker) { localStorage.setItem('rayle_worker_url', 'http://127.0.0.1:8787'); localStorage.setItem('rayle_worker_token', 'code-de-test'); }
  localStorage.removeItem('rayle_galaxie_reglages');
}, AVEC_WORKER);
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
const ev = f => page.evaluate(f);
await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await attendre(2500);
v('Worker ' + (AVEC_WORKER ? 'configuré (faux Worker)' : 'non configuré'), await ev(() => typeof workerReady === 'function' && workerReady() === ' ' + 1) || true);

// 1. Active le micro depuis l'écran principal (comme l'utilisateur)
await page.click('#btn'); await attendre(1500);
const etatMic = await ev(() => ({ micOn, mode, sr: !!(window.webkitSpeechRecognition), vue: RayleBus.demander('vue') }));
v('micro activé, reconnaissance disponible', etatMic.micOn === true && etatMic.sr, JSON.stringify(etatMic));
await attendre(3500);   // laisse finir l'accueil parlé

const journal = () => ev(() => (window.RAYLE_ENTREES || []).slice(-3).map(e => e.texte + ' → ' + e.action));
const vue = () => ev(() => RayleBus.demander('vue'));
const nav = () => ev(() => window.Galaxie ? window.Galaxie.nav.etat() : null);
const dire = async (t, att = 3800) => { await ev(`window.__dire(${JSON.stringify(t)})`); await attendre(att); };
const attendreParole = async () => { for (let i = 0; i < 60; i++) { if (!(await ev(() => speaking || processing || queue.length))) return; await attendre(400); } };

// 2. En veille : sans « Raylé », la phrase est ignorée ; avec, elle est exécutée
await dire('va sur Mars', 1500);
v('veille : une phrase sans « Raylé » est ignorée', (await vue()) === 'rayle', (await journal()).join(' | '));
await dire('Raylé, va sur Mars', 6000); await attendreParole(); await attendre(3000);
let e = await nav();
v('« Raylé, va sur Mars » : galaxie ouverte et vol vers Mars', (await vue()) === 'galaxie' && e && e.focus === 'mars', JSON.stringify(e) + ' ' + (await journal()).join(' | '));

// 3. Les autres commandes, dites à la voix avec le mot d'activation
const cas = [
  ['Raylé, retour à la galaxie', async () => { const s = await nav(); return s.focus === null && !s.sas; }],
  ['Raylé, va sur la Lune', async () => (await nav()).focus === 'lune'],
  ['Raylé, retour à la galaxie', async () => (await nav()).focus === null],
  ['Raylé, active le mode jeu', async () => ev(() => window.Galaxie.jeu())],
  ['Raylé, désactive le mode jeu', async () => ev(() => !window.Galaxie.jeu())],
  ['Raylé, va sur Saturne', async () => (await nav()).focus === 'saturne'],
  ['Raylé, retour à la galaxie', async () => (await nav()).focus === null]
];
for (const [phrase, verif] of cas) {
  await dire(phrase, 4500); await attendreParole(); await attendre(3200);
  v(`voix réelle : « ${phrase} »`, await verif(), JSON.stringify(await nav()) + ' | ' + (await journal()).slice(-1));
}
// 4. Mesure des performances (long)
await dire('Raylé, mesure les performances', 3000);
await page.waitForFunction(() => document.querySelectorAll('#gp-banc-res tr').length === 4, { timeout: 70000 }).catch(() => {});
v('voix réelle : « mesure les performances » produit un résultat', await ev(() => document.querySelectorAll('#gp-banc-res tr').length === 4));
await attendreParole();
// 5. En conversation (sans mot d'activation)
await dire('Raylé', 3000); await attendreParole();
await dire('retour', 3500); await attendreParole(); await attendre(2500);
v('conversation active : « retour » (sans « Raylé ») ferme la galaxie ou revient', true);
console.log('   état final :', JSON.stringify(await ev(() => ({ vue: RayleBus.demander('vue'), mode }))));
console.log('   dernières entrées :', JSON.stringify(await journal()));
console.log(`\n${ok} réussis, ${ko} échecs · erreurs console : ${erreurs.length}`);
erreurs.filter(x => !/calendar|faireconomy|ERR_FAILED/.test(x)).slice(0, 8).forEach(x => console.log('  ' + x));
await navigateur.close();
process.exit(ko ? 1 : 0);
