import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
const RACINE = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const page = await navigateur.newPage();
await page.setViewport({ width: 1600, height: 900 });
const erreurs = [];
page.on('console', m => { if (['error', 'warning'].includes(m.type())) erreurs.push(m.text().slice(0, 200)); });
page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 200)));
const evenements = [];
await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await new Promise(r=>setTimeout(r,800)); await page.click('#btnOuvrirGalaxie');
await page.waitForFunction(() => document.getElementById('chargement')?.classList.contains('fini'), { timeout: 60000 });
await page.evaluate(() => ['selection', 'vol', 'arrive', 'entree', 'sortie'].forEach(n => window.addEventListener('galaxie:' + n, e => (window.__ev = window.__ev || []).push(n + ':' + JSON.stringify(e.detail)))));
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const verifier = (nom, cond, detail = '') => { cond ? ok++ : ko++; console.log((cond ? 'OK  ' : 'KO  ') + nom + (detail ? ' — ' + detail : '')); };
const ecran = id => page.evaluate(id => {
  const G = window.Galaxie, o = G.systeme.parId(id), v = G.camera.position.clone();
  const p = (o ? o.porteur : G.soleil.groupe).getWorldPosition(v.clone().set(0, 0, 0)).project(G.camera);
  return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight };
}, id);
const etat = () => page.evaluate(() => window.Galaxie.nav.etat());
await attendre(800);
await page.screenshot({ path: 'nav-0-ensemble.png' });

// 1. Survol de Mars
let m = await ecran('mars');
await page.mouse.move(m.x + 2, m.y + 2); await attendre(300);
let e = await etat();
verifier('survol de Mars détecté', e.survol === 'mars', JSON.stringify(e));
verifier('étiquette visible', await page.evaluate(() => !document.getElementById('etiquette').hidden));
await page.screenshot({ path: 'nav-1-survol.png' });

// 2. Clic : sélection + carte
await page.mouse.click(m.x + 2, m.y + 2); await attendre(300);
e = await etat();
verifier('clic = sélection de Mars', e.selection === 'mars');
verifier('carte d’information affichée', await page.evaluate(() => !document.getElementById('carte').hidden && document.getElementById('carte-titre').textContent === 'Mars'));
await page.screenshot({ path: 'nav-2-carte.png' });

// 3. Double-clic : vol puis sas
await page.evaluate(() => { window.__f = 0; const b = () => { window.__f++; if (!window.__stop) requestAnimationFrame(b); }; requestAnimationFrame(b); });
const t0 = Date.now();
await page.mouse.click(m.x + 2, m.y + 2, { clickCount: 2 });
await attendre(600);
e = await etat(); verifier('vol en cours', e.vol === true);
const fpsVol = await page.evaluate(() => window.Galaxie.info().fps);
await attendre(2600);
e = await etat();
verifier('arrivée sur Mars', e.focus === 'mars' && !e.vol, JSON.stringify(e));
verifier('sas ouvert', e.sas === true && await page.evaluate(() => !document.getElementById('sas').hidden));
verifier('distance proche de Mars', e.distance < 12, e.distance.toFixed(2));
await page.screenshot({ path: 'nav-3-mars.png' });
const nf = await page.evaluate(() => { window.__stop = true; return window.__f; });
console.log('   images pendant ~3,2 s de vol et d arrivée :', nf, '(≈' + Math.round(nf / 3.2) + ' i/s)');

// 4. Zoom et rotation en focus
await page.mouse.move(800, 450);
await page.mouse.wheel({ deltaY: -400 }); await attendre(600);
const dProche = (await etat()).distance;
await page.mouse.wheel({ deltaY: 900 }); await attendre(700);
const dLoin = (await etat()).distance;
verifier('molette : zoom avant puis arrière', dProche < dLoin, dProche.toFixed(2) + ' → ' + dLoin.toFixed(2));
const cam0 = await page.evaluate(() => window.Galaxie.camera.position.toArray());
await page.mouse.move(800, 450); await page.mouse.down(); await page.mouse.move(980, 420, { steps: 8 }); await page.mouse.up(); await attendre(700);
const cam1 = await page.evaluate(() => window.Galaxie.camera.position.toArray());
verifier('glisser gauche : la caméra tourne', Math.hypot(cam1[0] - cam0[0], cam1[1] - cam0[1], cam1[2] - cam0[2]) > 0.3);
verifier('la caméra suit Mars sur son orbite', (await etat()).focus === 'mars');

// 5. Échap : ferme le sas, puis retour
await page.keyboard.press('Escape'); await attendre(300);
e = await etat(); verifier('Échap ferme le sas', e.sas === false && e.focus === 'mars');
await page.keyboard.press('Escape'); await attendre(3000);
e = await etat(); verifier('Échap ramène à la vue d’ensemble', e.focus === null && !e.vol && e.distance > 100, e.distance.toFixed(1));

// 6. Déplacement (clic droit) en vue d’ensemble
const c0 = await page.evaluate(() => window.Galaxie.camera.position.toArray());
await page.mouse.move(800, 450); await page.mouse.down({ button: 'right' }); await page.mouse.move(700, 400, { steps: 6 }); await page.mouse.up({ button: 'right' }); await attendre(300);
const c1 = await page.evaluate(() => window.Galaxie.camera.position.toArray());
verifier('clic droit + glisser : la vue se déplace', Math.hypot(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]) > 1);
await page.keyboard.press('h'); await attendre(3000);

// 7. Vaisseau d’anatomie en orbite de Saturne : sélectionnable
await page.evaluate(() => window.Galaxie.nav.placer(null, { distance: 150 })); await attendre(800);
const vs = await page.evaluate(() => { const G = window.Galaxie; const c = G.systeme.parId('saturne').satellites[0].vaisseau; const v = c.getWorldPosition(G.camera.position.clone()).project(G.camera); return { x: (v.x * .5 + .5) * innerWidth, y: (-v.y * .5 + .5) * innerHeight, devant: v.z < 1 }; });
await page.screenshot({ path: 'nav-4-saturne.png' });
await page.mouse.click(vs.x, vs.y); await attendre(300);
e = await etat(); verifier('le vaisseau d’anatomie se sélectionne', e.selection === 'vaisseau-anatomie', JSON.stringify({ vs, sel: e.selection }));

// 8. H et clic dans le vide
await page.keyboard.press('h'); await attendre(3000);
await page.mouse.click(120, 700); await attendre(200);
e = await etat(); verifier('clic dans le vide : désélection', e.selection === null);
verifier('événements émis', (await page.evaluate(() => window.__ev || [])).length >= 6, (await page.evaluate(() => window.__ev || [])).slice(0, 8).join(' | '));
console.log(`\n${ok} réussis, ${ko} échecs · erreurs console : ${erreurs.length}`, erreurs.slice(0, 5));
await navigateur.close();
