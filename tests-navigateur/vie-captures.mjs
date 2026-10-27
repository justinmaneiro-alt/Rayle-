// Séquences de captures de l'entité (6 images espacées de 350 ms par état) + planches de contact + mesure de l'activité.
//   node vie-captures.mjs avant     → captures-accueil/vie-avant-<etat>-<i>.png, planche vie-avant-<etat>.png, mesures vie-avant.json
//   node vie-captures.mjs apres     → idem avec « apres »
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const tag = process.argv[2] || 'essai', mode = Number(process.argv[3] ?? 0);
const attendre = ms => new Promise(r => setTimeout(r, ms));
const N = 6, PAS = 350, DIR = '../captures-accueil/';
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 900 });
p.on('pageerror', e => console.log('ERREUR', e.message.slice(0, 200)));
await p.evaluateOnNewDocument(q => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_entite_qualite', String(q)); localStorage.setItem('rayle_boot', '0'); }, mode);
await p.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(3500);
await p.evaluate(() => { Panneaux.fermerTout(); Entite.verrou(false); Entite.verrou = () => {}; document.querySelectorAll('.hud,.hud-anneaux,.state,#panneaux,.titre,.bridge,.barre').forEach(e => { e.style.visibility = 'hidden'; }); });
const r = await p.evaluate(() => { const e = document.getElementById('reactor').getBoundingClientRect(); return { x: Math.round(e.left), y: Math.round(e.top), w: Math.round(e.width), h: Math.round(e.height) }; });
const clip = { x: r.x, y: r.y, width: r.w, height: r.h };
const lire = f => PNG.sync.read(fs.readFileSync(f));
const mesures = {};
for (const etat of ['veille', 'listening', 'thinking', 'speaking']) {
  await p.evaluate(e => {
    Entite.etat(e);
    if (e === 'listening' || e === 'speaking') { window.__t0 = performance.now(); Entite.amplitude(() => 0.45 + 0.4 * Math.sin((performance.now() - window.__t0) / 1000 * (e === 'speaking' ? 7 : 3.2))); } else Entite.amplitude(null);
  }, etat);
  await attendre(3000);
  const images = [];
  for (let i = 0; i < N; i++) { const f = `${DIR}vie-${tag}-${etat}-${i}.png`; await p.screenshot({ path: f, clip }); images.push(lire(f)); await attendre(PAS); }
  // mesures : luminosité moyenne, activité (différence entre images consécutives) au cœur et en périphérie
  const W = images[0].width, H = images[0].height, cx = W / 2, cy = H / 2, R = W / 2;
  let lum = 0, nLum = 0, dCoeur = 0, nC = 0, dPeri = 0, nP = 0;
  for (let k = 0; k < N; k++) for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    const i = (y * W + x) * 4, d = images[k].data; lum += (d[i] + d[i + 1] + d[i + 2]) / 3; nLum++;
    if (k > 0) { const e = images[k - 1].data, diff = (Math.abs(d[i] - e[i]) + Math.abs(d[i + 1] - e[i + 1]) + Math.abs(d[i + 2] - e[i + 2])) / 3, rr = Math.hypot(x - cx, y - cy) / R; if (rr < 0.28) { dCoeur += diff; nC++; } else if (rr < 0.62) { dPeri += diff; nP++; } }
  }
  mesures[etat] = { luminance: +(lum / nLum).toFixed(2), activiteCoeur: +(dCoeur / nC).toFixed(2), activitePeripherie: +(dPeri / nP).toFixed(2) };
  // planche de contact : 3 colonnes × 2 lignes, images réduites de moitié + ligne du bas : cartes de différence
  const t = 280, planche = new PNG({ width: t * 3, height: t * 2 });
  images.forEach((img, k) => { const ox = (k % 3) * t, oy = Math.floor(k / 3) * t; for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) { const s = (Math.floor(y * H / t) * W + Math.floor(x * W / t)) * 4, d = ((oy + y) * planche.width + ox + x) * 4; planche.data[d] = img.data[s]; planche.data[d + 1] = img.data[s + 1]; planche.data[d + 2] = img.data[s + 2]; planche.data[d + 3] = 255; } });
  fs.writeFileSync(`${DIR}vie-${tag}-${etat}.png`, PNG.sync.write(planche));
  // carte de différences (activité) entre l'image 0 et l'image 5, amplifiée
  const carte = new PNG({ width: t, height: t });
  for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) { const s = (Math.floor(y * H / t) * W + Math.floor(x * W / t)) * 4, d = (y * t + x) * 4; let m = 0; for (let k = 1; k < N; k++) m += (Math.abs(images[k].data[s] - images[k - 1].data[s]) + Math.abs(images[k].data[s + 1] - images[k - 1].data[s + 1]) + Math.abs(images[k].data[s + 2] - images[k - 1].data[s + 2])) / 3; m = Math.min(255, m * 2.2); carte.data[d] = m; carte.data[d + 1] = m * 0.9; carte.data[d + 2] = m; carte.data[d + 3] = 255; }
  fs.writeFileSync(`${DIR}vie-${tag}-${etat}-activite.png`, PNG.sync.write(carte));
}
fs.writeFileSync(`${DIR}vie-${tag}.json`, JSON.stringify(mesures, null, 1));
console.log(tag, JSON.stringify(mesures));
await b.close();
