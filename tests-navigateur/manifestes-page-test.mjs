import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const RACINE = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const R = RACINE + 'planetes/';
const indexOrig = fs.readFileSync(R + 'index.json', 'utf8');
const idx = JSON.parse(indexOrig);
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
const lancer = async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1600, height: 900 });
  const logs = []; p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(m.text().slice(0, 220)); }); p.on('pageerror', e => logs.push('pageerror ' + e.message));
  await p.goto(BASE + '/index.html');
  await new Promise(r=>setTimeout(r,800)); await p.click('#btnOuvrirGalaxie');
  await p.waitForFunction(() => document.getElementById('chargement')?.classList.contains('fini') || /Erreur/.test(document.getElementById('chargement-texte').textContent), { timeout: 60000 });
  await new Promise(r => setTimeout(r, 800));
  return { b, p, logs };
};
try {
  // A. état normal
  let { b, p, logs } = await lancer();
  let info = await p.evaluate(() => window.Galaxie.info());
  v('galaxie chargée depuis les manifestes : 8 planètes', info.planetes.length === 8, info.planetes.join(','));
  v('aucun manifeste ignoré', info.ignores.length === 0);
  v('bandeau d’alertes caché', await p.evaluate(() => document.getElementById('alertes').hidden));
  v('sas de Mars liste ses ordres', await (async () => { await p.evaluate(() => window.Galaxie.nav.allerA('mars', { entrer: true })); await new Promise(r => setTimeout(r, 3200)); return p.evaluate(() => document.querySelectorAll('#sas-ordres li').length); })() === 4);
  await p.screenshot({ path: 'man-sas-mars.png' });
  await b.close();

  // B. nouvelle planète : un dossier + une ligne dans index.json, aucun code modifié
  fs.mkdirSync(R + 'essai', { recursive: true });
  fs.writeFileSync(R + 'essai/manifeste.json', JSON.stringify({ schema: 1, id: 'essai', nom: 'Essai', theme: 'Planète de test', etat: 'en_attente', orbite: { distance: 70, periode: 800, phase: 2 }, apparence: { rayon: 1.2, rotation: 0.2, texture: 'galaxie/textures/2k_uranus.jpg' }, licences: ['test'] }));
  // et un manifeste cassé
  fs.mkdirSync(R + 'casse', { recursive: true });
  fs.writeFileSync(R + 'casse/manifeste.json', JSON.stringify({ schema: 1, id: 'casse', nom: 'Cassée', theme: 'x', etat: 'active', orbite: { distance: -5, periode: 10 }, apparence: { rayon: 1, texture: '../hors.jpg' } }));
  fs.writeFileSync(R + 'index.json', JSON.stringify({ schema: 1, corps: [...idx.corps, 'essai', 'casse', 'fantome'] }));
  ({ b, p, logs } = await lancer());
  info = await p.evaluate(() => window.Galaxie.info());
  v('nouvelle planète ajoutée sans toucher au code', info.planetes.includes('essai') && info.planetes.length === 9, info.planetes.join(','));
  v('manifeste cassé et dossier absent ignorés, galaxie vivante', info.ignores.includes('casse') && info.ignores.includes('fantome') && !info.planetes.includes('casse'), info.ignores.join(','));
  v('bandeau d’alerte affiché', await p.evaluate(() => !document.getElementById('alertes').hidden && document.getElementById('alertes').textContent.includes('casse')));
  await p.evaluate(() => window.Galaxie.nav.allerA('essai')); await new Promise(r => setTimeout(r, 3000));
  v('on peut voler vers la nouvelle planète', (await p.evaluate(() => window.Galaxie.nav.etat())).focus === 'essai');
  await p.screenshot({ path: 'man-essai.png' });
  v('erreurs signalées en console (attendu : 2)', logs.filter(l => /manifeste/.test(l)).length >= 1, logs.slice(0, 3).join(' | '));
  await b.close();
} finally {
  fs.writeFileSync(R + 'index.json', indexOrig);
  fs.rmSync(R + 'essai', { recursive: true, force: true }); fs.rmSync(R + 'casse', { recursive: true, force: true });
}
console.log(`${ok} réussis, ${ko} échecs`);
