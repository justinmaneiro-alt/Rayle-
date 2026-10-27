import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
const RACINE = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=3840,2160'] });
const page = await navigateur.newPage();
await page.setViewport({ width: 1600, height: 900 });
const erreurs = [];
page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 200)); });
page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 240)));
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
const ev = f => page.evaluate(f);
const dire = t => page.evaluate(t => commandeGalaxie(t), t);
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
await ev(() => localStorage.removeItem('rayle_galaxie_reglages'));
await page.click('#btnOuvrirGalaxie');
await page.waitForFunction(() => window.Galaxie && document.getElementById('chargement').classList.contains('fini'), { timeout: 60000 });
await attendre(3000);

// Orbites : cachées par défaut, touche O, voix
v('orbites cachées par défaut', await ev(() => !window.Galaxie.systeme.orbitesVisibles()));
await page.keyboard.press('o'); await attendre(200);
v('touche O : orbites affichées', await ev(() => window.Galaxie.systeme.orbitesVisibles()));
await page.keyboard.press('O'); await attendre(200);
v('touche O (majuscule) : orbites cachées', await ev(() => !window.Galaxie.systeme.orbitesVisibles()));
let r = await dire('affiche les orbites'); v('voix : orbites affichées', /orbites/i.test(r) && await ev(() => window.Galaxie.systeme.orbitesVisibles()), r);
r = await dire('cache les orbites'); v('voix : orbites cachées', await ev(() => !window.Galaxie.systeme.orbitesVisibles()), r);
await page.keyboard.press('Escape'); await page.click('#g-retour'); await attendre(800);
await page.keyboard.press('o'); await attendre(200);
v('touche O sans effet quand la galaxie est fermée', await ev(() => !window.Galaxie.systeme.orbitesVisibles()));
await dire('ouvre la galaxie'); await attendre(1200);

// Décor riche selon la qualité
const riche = () => ev(() => { const G = window.Galaxie; return { couronne: G.soleil.flashs === true, neb: G.scene.getObjectByName('nebuleuses').visible }; });   // « couronne » = flashs blancs du soleil (il n’y a plus de couronne)
let d = await riche(); v('haute : flashs du soleil et nébuleuses présents', d.couronne && d.neb);
await ev(() => window.Galaxie.qualite('basse')); await attendre(500); d = await riche(); v('basse : flashs et nébuleuses coupés', !d.couronne && !d.neb);
await ev(() => window.Galaxie.qualite('moyenne')); await attendre(500); d = await riche(); v('moyenne : décor riche conservé (flashs, nébuleuses)', d.couronne && d.neb);
await ev(() => window.Galaxie.qualite('haute')); await attendre(500);
await dire('active le mode jeu'); await attendre(600); d = await riche(); v('mode jeu : flashs et nébuleuses coupés', !d.couronne && !d.neb);
await dire('désactive le mode jeu'); await attendre(600); d = await riche(); v('sortie du mode jeu : décor riche rétabli', d.couronne && d.neb);

// Performances à plusieurs résolutions (limite d'images supprimée pour voir la marge)
await ev(() => window.Galaxie.regler({ fpsMax: 0 }));
const mesure = async (nom, w, h) => {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 }); await attendre(1500);
  const out = {};
  for (const vue of ['ensemble', 'soleil', 'terre']) {
    await ev(`window.Galaxie.nav.placer(${vue === 'ensemble' ? 'null' : vue === 'soleil' ? "'rayle'" : "'terre'"}, {})`); await attendre(2500);
    const m = await ev(() => window.Galaxie.mesures(2000));
    out[vue] = `${Math.round(m.fps)} i/s (1 % ${Math.round(m.pire1)}, GPU ${m.gpuMs ? m.gpuMs.toFixed(1) : '?'} ms)`;
  }
  console.log('   ' + nom + ' :', JSON.stringify(out));
  return out;
};
const hd = await mesure('1600×900', 1600, 900);
const qhd = await mesure('2560×1440', 2560, 1440);
const uhd = await mesure('3840×2160 (4K)', 3840, 2160);
const fps = o => Math.min(...Object.values(o).map(s => parseInt(s)));
v('haute : au moins 60 i/s en 1440p', fps(qhd) >= 60, JSON.stringify(qhd));
v('haute : au moins 60 i/s en 4K', fps(uhd) >= 60, JSON.stringify(uhd));
console.log(`\n${ok} réussis, ${ko} échecs · erreurs console : ${erreurs.filter(e => !/calendar|faireconomy|ERR_FAILED|404/.test(e)).length}`);
await navigateur.close();
