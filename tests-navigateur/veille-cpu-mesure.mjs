// v10 phase 3 : coût de la veille (écoute locale du prénom). Mesure, par le protocole Chrome (Performance.getMetrics), la part de temps de calcul consommée par la page pendant 60 s de veille,
// avec un micro de test qui entend (a) du bruit de fond, (b) de la parole continue (pire cas : Vosk tourne en permanence). Ce n'est PAS une mesure de batterie : voir docs/rayle-v10.md.
// Usage : cd tests-navigateur && node veille-cpu-mesure.mjs
import puppeteer from 'puppeteer-core'; import path from 'node:path';
import { BASE, CHROME, attendre } from './terre-aide.mjs';
async function mesure(wav, duree = 60000) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=' + path.resolve('audio', wav + '.wav'), '--no-sandbox'] });
  const page = await b.newPage();
  await page.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_mode_ecoute', 'mainslibres'); localStorage.setItem('rayle_piper_precharge', '0'); localStorage.setItem('rayle_activation', JSON.stringify({ mains: false, doigts: false, mot: true })); class F { start() { setTimeout(() => this.onstart && this.onstart(), 5); } stop() {} abort() { setTimeout(() => this.onend && this.onend(), 5); } } window.SpeechRecognition = window.webkitSpeechRecognition = F; });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1500); await page.evaluate(() => { window.speak = () => {}; startListening(); });
  await page.waitForFunction(() => Activation.etat() !== 'COUPÉ', { timeout: 30000 }).catch(() => {}); await attendre(6000);   // modèle chargé, veille établie
  const c = await page.createCDPSession(); await c.send('Performance.enable');
  const lire = async () => { const { metrics } = await c.send('Performance.getMetrics'); return Object.fromEntries(metrics.map(m => [m.name, m.value])); };
  const a = await lire(), t0 = Date.now(); await attendre(duree); const z = await lire(), dt = (Date.now() - t0) / 1000;
  const etat = await page.evaluate(() => Activation.etat()); await b.close();
  return { wav, secondes: Math.round(dt), etat, cpuTachePct: +(((z.TaskDuration - a.TaskDuration) / dt) * 100).toFixed(1), cpuScriptPct: +(((z.ScriptDuration - a.ScriptDuration) / dt) * 100).toFixed(1) };
}
for (const w of ['bruit', 'conversation']) console.log(JSON.stringify(await mesure(w)));
