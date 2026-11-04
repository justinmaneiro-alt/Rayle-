/* Terre 2.0 dans Chrome (vrai réseau) : globe CesiumJS, recherche, zoom sur une ville, couches (séismes, satellites, avions*, météo, lancements, caméras),
   modes de vision, repli SANS jeton (aucune erreur), FPS, captures PC 1600 px. Un jeton Cesium peut être fourni : JETON_CESIUM=… (jamais écrit sur disque).
   Prérequis : node serveur.mjs 8011 (racine). Usage : node tests-navigateur/terre2-test.mjs [port=8011]
   (*) avions : seulement si le relais rayle-terre-relais répond (sinon la couche doit s'éteindre proprement). */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json'));
const puppeteer = require('puppeteer-core');
const PORT = process.argv[2] || '8011', SORTIE = path.resolve('captures-terre/terre2'); fs.mkdirSync(SORTIE, { recursive: true });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const erreurs = [], echecs = []; let nOk = 0;
const v = (c, m) => { if (c) nOk++; else { echecs.push(m); console.log('ÉCHEC', m); } };
const pause = ms => new Promise(r => setTimeout(r, ms));
const p = await nav.newPage();
p.on('console', m => { if (m.type() === 'error' && !/favicon|net::ERR_|Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
p.on('pageerror', e => erreurs.push(e.message));
await p.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
const JETON = process.env.JETON_CESIUM || '';
await p.evaluateOnNewDocument(j => { try { localStorage.setItem('rayle_terre2', JSON.stringify({ jetonCesium: j, couches: { seismes: true }, vision: 'normal' })); } catch (e) { /* */ } }, JETON);
await p.goto(`http://127.0.0.1:${PORT}/tests-navigateur/terre2-banc.html`, { waitUntil: 'load' });
await p.waitForFunction(() => window.__pret && window.Terre2 && window.Terre2.etat().globe, { timeout: 90000 });
await pause(6000);
const E = () => p.evaluate(() => window.Terre2.etat());
let e = await E();
v(e.actif && e.globe, 'globe créé');
v(e.jeton === !!JETON, 'jeton ' + (JETON ? 'présent' : 'absent'));
if (!JETON) v(!e.relief && !e.batiments, 'sans jeton : ni relief ni bâtiments (et aucune erreur)');
v(e.couches.includes('seismes'), 'couche séismes active par défaut');
v(e.fps > 0, 'FPS mesurés : ' + e.fps);
const coupes = () => p.evaluate(() => { const vw = innerWidth, out = []; for (const el of document.querySelectorAll('#terre2 .t2-haut > *, #terre2 .t2-panneau, #terre2 .t2-info, #terre2 .t2-legendes, #terre2 .t2-fiche, #terre2 .t2-credits')) { const r = el.getBoundingClientRect(); if (!r.width || el.hidden) continue; if (r.right > vw + .5 || r.left < -.5 || r.bottom > innerHeight + .5) out.push(el.className + ' ' + Math.round(r.left) + '→' + Math.round(r.right)); } return out; });
v(!(await coupes()).length, 'rien de coupé : ' + JSON.stringify(await coupes()));
await p.screenshot({ path: path.join(SORTIE, `globe${JETON ? '-jeton' : ''}.png`) });
// recherche + zoom ville
await p.evaluate(async () => { const l = (await window.Terre2.chercher('Paris'))[0]; window.__lieu = l; window.Terre2.aller(l, { hauteur: 9000, duree: 0.5 }); });
await pause(9000);
const lieu = await p.evaluate(() => window.__lieu);
v(lieu && Math.abs(lieu.lat - 48.85) < 0.3, 'recherche « Paris » : ' + (lieu && lieu.nom));
e = await E(); v(e.hauteur < 20000, 'caméra près de Paris : ' + Math.round(e.hauteur) + ' m');
await p.screenshot({ path: path.join(SORTIE, `paris${JETON ? '-jeton' : ''}.png`) });
await p.evaluate(async () => window.Terre2.zoomerSur({ nom: 'Tour Eiffel', lat: 48.8584, lon: 2.2945 }, 900)); await pause(9000);
await p.screenshot({ path: path.join(SORTIE, `tour-eiffel${JETON ? '-jeton' : ''}.png`) });
// couches
await p.evaluate(() => window.Terre2.aller({ nom: 'Europe', lat: 48, lon: 5 }, { hauteur: 2.5e6, duree: 0.5 })); await pause(5000);
for (const id of ['satellites', 'meteo', 'lancements', 'cameras', 'avions']) {
  const r = await p.evaluate(async id => await window.Terre2.activerCouche(id, true), id); await pause(4000);
  e = await E();
  if (id === 'avions') v(r.ok ? e.couches.includes('avions') : !e.couches.includes('avions'), `avions : ${r.ok ? 'actifs' : 'relais indisponible → couche éteinte proprement (' + r.erreur + ')'}`);
  else v(r.ok && e.couches.includes(id), `couche ${id} : ${JSON.stringify(r)}`);
}
const cles = await p.evaluate(async () => [await window.Terre2.activerCouche('bateaux', true), await window.Terre2.activerCouche('incendies', true)]);
v(cles.every(r => r.cleManquante), 'bateaux et incendies refusés sans clé, avec la procédure');
await p.evaluate(() => { document.querySelector('[data-a="couches"]').click(); }); await pause(800);
await p.screenshot({ path: path.join(SORTIE, 'couches.png') });
v(!(await coupes()).length, 'panneau Couches sans élément coupé');
await p.evaluate(() => document.querySelector('[data-a="couches"]').click());
await p.evaluate(() => window.Terre2.aller({ nom: 'Monde', lat: 25, lon: 10 }, { hauteur: 1.6e7, duree: 0.5 })); await pause(6000);
await p.screenshot({ path: path.join(SORTIE, 'couches-monde.png') });
// fiche d'une caméra (Londres)
await p.evaluate(() => window.Terre2.aller({ nom: 'Londres', lat: 51.507, lon: -0.1276 }, { hauteur: 30000, duree: 0.5 })); await pause(6000);
await p.screenshot({ path: path.join(SORTIE, 'cameras-londres.png') });
// modes de vision
for (const m of ['nuit', 'thermique', 'crt', 'nb', 'normal']) { const ok = await p.evaluate(m => window.Terre2.vision(m), m); await pause(1500); e = await E(); v(ok && e.vision === m, 'vision ' + m); if (m !== 'normal') await p.screenshot({ path: path.join(SORTIE, `vision-${m}.png`) }); }
// touche V
await p.keyboard.press('v'); await pause(600); e = await E(); v(e.vision === 'nuit', 'touche V : ' + e.vision); await p.evaluate(() => window.Terre2.vision('normal'));
v(await p.evaluate(() => window.Terre2.masquerCouches()) && (await E()).couches.length === 0, 'masquer les couches');
// sortie
await p.evaluate(() => document.querySelector('[data-a="quitter"]').click()); await pause(800);
e = await E(); v(!e.actif && !e.globe, 'sortie : globe détruit');
await nav.close();
v(!erreurs.length, 'erreurs console : ' + erreurs.slice(0, 6).join(' | '));
console.log(`terre 2.0 Chrome : ${nOk} ok, ${echecs.length} échec(s)`); process.exit(echecs.length ? 1 : 0);
