// Les astres sont PLEINS et OPAQUES : la face nuit ne laisse jamais voir le fond du ciel (nébuleuses, étoiles, Voie lactée).
// Méthode : pour chaque astre (8 planètes, Lune, vaisseaux), on se place du côté nuit sous plusieurs angles, le temps figé, et on compare les pixels du
// centre du disque avec le ciel visible puis entièrement caché. Si le ciel « passe à travers », les deux images diffèrent. Garde-fou : le même test
// doit voir une vraie différence sur le fond (sinon il ne détecterait rien).
// Panne détectée : les nébuleuses étaient « transparentes » + sans test de profondeur, donc dessinées après les planètes et additionnées par-dessus.
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const page = await b.newPage(); await page.setViewport({ width: 1600, height: 900 });
const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
const ev = (f, ...a) => page.evaluate(f, ...a);
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
await ev(() => localStorage.removeItem('rayle_galaxie_reglages'));
await page.click('#btnOuvrirGalaxie');
await page.waitForFunction(() => window.Galaxie && document.getElementById('chargement').classList.contains('fini'), { timeout: 90000 });
await attendre(2500);
await ev(() => {
  document.querySelectorAll('#vueGalaxie .g-aide,#vueGalaxie .g-credits,#g-parole,#carte,#etiquette,.g-titre,#fil,.g-reglages,#g-retour,#g-jeu,#alertes').forEach(e => e.style.display = 'none');
  window.Galaxie.systeme.vitesse(0);          // temps figé : rien ne bouge entre les deux images
  window.Galaxie.soleil.flashs = false;
});

const pixels = async clip => PNG.sync.read(Buffer.from(await page.screenshot({ clip })));
const ecart = (a, b) => { let m = 0; for (let i = 0; i < a.data.length; i += 4) for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(a.data[i + k] - b.data[i + k])); return m; };
const lumMoy = a => { let s = 0, n = 0; for (let i = 0; i < a.data.length; i += 4) { s += 0.2126 * a.data[i] + 0.7152 * a.data[i + 1] + 0.0722 * a.data[i + 2]; n++; } return s / n; };
const CENTRE = { x: 790, y: 440, width: 20, height: 20 }, COIN = { x: 40, y: 700, width: 60, height: 60 };
const ciel = oui => ev(oui => { const G = window.Galaxie; G.scene.getObjectByName('ciel').visible = oui; G.scene.getObjectByName('ceinture').visible = oui; }, oui);

const ids = await ev(() => window.Galaxie.nav.cibles().filter(i => i !== 'rayle' && i !== 'vaisseau-anatomie'));   // le vaisseau d'anatomie détaillé (S1) a une verrière transparente voulue : testé par saturne-s1-test
v('astres à tester : 8 planètes + Lune + vaisseau de Jupiter', ids.length >= 10, ids.join(', '));
const ANGLES = [Math.PI - 0.7, Math.PI, Math.PI + 0.7, Math.PI + 1.4, Math.PI - 1.4];
let vuLeFond = 0, pire = { id: '', e: 0, a: 0 };
for (const id of ids) {
  let max = 0, maxA = 0, lum = 0;
  for (const a of ANGLES) {
    await ev((id, a) => window.Galaxie.nav.placer(id, { angle: a, pitch: 0.1 }), id, a);
    await attendre(450);
    await ciel(true); await attendre(150); const avec = await pixels(CENTRE), coinAvec = await pixels(COIN);
    await ciel(false); await attendre(150); const sans = await pixels(CENTRE), coinSans = await pixels(COIN);
    await ciel(true);
    const e = ecart(avec, sans); lum = Math.max(lum, lumMoy(avec));
    if (e > max) max = e;
    if (e > pire.e) pire = { id, e, a };
    if (ecart(coinAvec, coinSans) > 12) vuLeFond++;   // le test voit bien le ciel quand il est effectivement derrière
  }
  v(`${id} : face nuit opaque (écart avec/sans ciel ≤ 4 sur 5 angles)`, max <= 4, `écart max ${max}, luminance max ${lum.toFixed(0)}`);
  maxA = max;
}
v('garde-fou : le test voit bien le ciel quand il est derrière (fond visible sur au moins 5 prises)', vuLeFond >= 5, String(vuLeFond));

// Les nébuleuses sont dessinées AVANT les corps opaques (cause de la panne)
const regl = await ev(() => { const n = window.Galaxie.scene.getObjectByName('nebuleuses'); return n.children.map(m => ({ transparent: m.material.transparent, ordre: m.renderOrder, prof: m.material.depthTest })); });
v('nébuleuses : dans la liste des objets opaques (transparent=false), dessinées avant les astres', regl.length >= 5 && regl.every(m => m.transparent === false && m.ordre < 0));

// Terre côté nuit : lueur ambiante bleutée visible (pas noir total, pas le ciel)
await ev(() => window.Galaxie.nav.placer('terre', { angle: Math.PI, pitch: 0.1 })); await attendre(600);
const t = await pixels({ x: 700, y: 380, width: 200, height: 140 });
let r = 0, g = 0, bl = 0, n = 0; for (let i = 0; i < t.data.length; i += 4) { r += t.data[i]; g += t.data[i + 1]; bl += t.data[i + 2]; n++; }
v('Terre côté nuit : sombre mais pleine, teinte bleutée', lumMoy(t) > 2 && lumMoy(t) < 90 && bl / n >= r / n, `r ${(r / n).toFixed(0)} g ${(g / n).toFixed(0)} b ${(bl / n).toFixed(0)}`);
await page.screenshot({ path: 'nuit-terre.png' });
await ev(() => window.Galaxie.nav.placer('jupiter', { angle: Math.PI, pitch: 0.1 })); await attendre(600);
await page.screenshot({ path: 'nuit-jupiter.png' });

v('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await b.close();
console.log(`\n${ok} réussis, ${ko} échecs`);
process.exit(ko ? 1 : 0);
