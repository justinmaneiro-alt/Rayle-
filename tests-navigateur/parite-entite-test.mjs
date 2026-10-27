// Parité accueil / galaxie : l'entité de l'accueil doit avoir le même style que le soleil de la galaxie.
// Prend deux captures (accueil, galaxie face au soleil) dans le même état et compare couleurs et luminosité du nuage.
//   node parite-entite-test.mjs [etat]   → captures-accueil/parite-accueil-<etat>.png et parite-galaxie-<etat>.png
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const etat = process.argv[2] || 'idle';
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const page = await b.newPage(); await page.setViewport({ width: 1600, height: 900 });
const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error' && !/calendar|faireconomy|ERR_FAILED|404/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(3500);
await page.evaluate(e => { Entite.verrou(false); Entite.verrou = () => {}; Entite.etat(e); Entite.fixer(); }, etat);
await attendre(2500);
await page.evaluate(() => { Entite.vie(0); document.querySelectorAll('.hud,.hud-anneaux,.state,#panneaux,.titre,.bridge').forEach(e => { e.style.visibility = 'hidden'; }); });   // le HUD n'entre pas dans la comparaison
await attendre(300);
const infoA = await page.evaluate(() => Entite.info());
const accueilEtat = await page.evaluate(() => { const m = document.querySelector('.entite-canvas'); return m ? m.width : 0; });
const echantillons = async cote => { for (let i = 0; i < 5; i++) { await page.screenshot({ path: `../captures-accueil/parite-${cote}-${etat}-${i}.png`, clip: { x: 540, y: 100, width: 520, height: 520 } }); await attendre(450); } };
await echantillons('accueil');
fs.copyFileSync(`../captures-accueil/parite-accueil-${etat}-0.png`, `../captures-accueil/parite-accueil-${etat}.png`);
v('l\'accueil utilise le moteur réseau', infoA.moteur === 'reseau', JSON.stringify(infoA));
// galaxie
await page.click('#btnOuvrirGalaxie');
await page.waitForFunction(() => window.Galaxie && document.getElementById('chargement').classList.contains('fini'), { timeout: 90000 });
await page.evaluate(e => { document.querySelectorAll('#vueGalaxie .g-aide,#vueGalaxie .g-credits,#g-parole,#etiquette,#carte').forEach(x => x.style.display = 'none'); window.Galaxie.soleil.etat(e); window.Galaxie.soleil.vie(0); window.Galaxie.nav.allerA && window.Galaxie.nav.allerA('rayle'); }, etat);
await attendre(6000);
await page.evaluate(() => { document.querySelectorAll('#vueGalaxie *').forEach(x => { if (x.tagName !== 'CANVAS' && !x.querySelector('canvas')) x.style.visibility = 'hidden'; }); });
await echantillons('galaxie');
fs.copyFileSync(`../captures-accueil/parite-galaxie-${etat}-0.png`, `../captures-accueil/parite-galaxie-${etat}.png`);
const cG = await page.evaluate(() => window.Galaxie.soleil.couleurs());
const cA = await page.evaluate(() => window.Galaxie.soleil.couleurs());
// statistiques : couleur moyenne des pixels lumineux
const stats = f => { const p = PNG.sync.read(fs.readFileSync(f)); let n = 0, r = 0, g = 0, bl = 0; for (let i = 0; i < p.data.length; i += 4) { const L = p.data[i] + p.data[i + 1] + p.data[i + 2]; if (L > 300) { n++; r += p.data[i]; g += p.data[i + 1]; bl += p.data[i + 2]; } } return { n, r: r / n, g: g / n, b: bl / n }; };   // pixels lumineux seulement (le fond de la galaxie est violet)
const moyenne = cote => { const l = [0, 1, 2, 3, 4].map(i => stats(`../captures-accueil/parite-${cote}-${etat}-${i}.png`)); const m = k => l.reduce((a, x) => a + x[k], 0) / l.length; return { n: m('n'), r: m('r'), g: m('g'), b: m('b') }; };   // moyenne de 5 images : les flashs aléatoires ne faussent plus la comparaison
const sA = moyenne('accueil'), sG = moyenne('galaxie');
console.log('accueil', JSON.stringify(sA), '\ngalaxie', JSON.stringify(sG));
const teinte = s => [s.r, s.g, s.b].map(x => x / Math.max(s.r, s.g, s.b));
const tA = teinte(sA), tG = teinte(sG);
v('même teinte des neurones et des fils (écart < 0,15 par canal)', tA.every((x, i) => Math.abs(x - tG[i]) < 0.15), tA.map(x => x.toFixed(2)) + ' vs ' + tG.map(x => x.toFixed(2)));
v('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
console.log(`${ok} OK, ${ko} KO`); await b.close(); process.exit(ko ? 1 : 0);
