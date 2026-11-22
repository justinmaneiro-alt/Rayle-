// v10 phase 3 : taux de faux déclenchements du prénom. Le micro de test rejoue en boucle (150 s) des phrases SANS le prénom ; on compte les « Déclencheur : le mot » affichés dans le journal.
// Les phrases : conversation ordinaire, « le rail de la gare… », « c'est réel… », « le rallye de Monte-Carlo… », bruit, claquements (désactivés). Usage : cd tests-navigateur && node faux-declenchements-mesure.mjs [secondes]
import puppeteer from 'puppeteer-core'; import path from 'node:path';
import { BASE, CHROME, attendre } from './terre-aide.mjs';
const duree = (+process.argv[2] || 150) * 1000;
async function mesure(wav, niveau) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=' + path.resolve('audio', wav + '.wav'), '--no-sandbox'] });
  const page = await b.newPage();
  await page.evaluateOnNewDocument(n => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_mode_ecoute', 'mainslibres'); localStorage.setItem('rayle_piper_precharge', '0'); localStorage.setItem('rayle_activation', JSON.stringify({ mains: false, doigts: false, mot: true, delai: 5, niveauPrenom: n })); class F { start() { setTimeout(() => this.onstart && this.onstart(), 5); } stop() {} abort() { setTimeout(() => this.onend && this.onend(), 5); } } window.SpeechRecognition = window.webkitSpeechRecognition = F; }, niveau);
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1500); await page.evaluate(() => { window.speak = () => {}; startListening(); });
  /* on compte les passages VEILLE → ACTIF (le journal est tronqué) */
  let n = 0, avant = 'VEILLE'; const t0 = Date.now();
  while (Date.now() - t0 < duree) { await attendre(400); const e = await page.evaluate(() => Activation.etat()); if (avant === 'VEILLE' && e === 'ACTIF') n++; avant = e; }
  await b.close(); return n;
}
for (const niveau of (process.argv[3] || 'stricte,normale,large').split(',')) { const L = {}; for (const w of (process.argv[4] || 'conversation,rail-gare,reel,rallye').split(',')) L[w] = await mesure(w, niveau); console.log(niveau, JSON.stringify(L), '(' + duree / 1000 + ' s par phrase en boucle)'); }
