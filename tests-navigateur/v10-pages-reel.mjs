import puppeteer from 'puppeteer-core';
import { CHROME } from './terre-aide.mjs';

/* Contrôle EN VRAI de la page publiée (GitHub Pages) : le Worker de détection charge MediaPipe depuis jsDelivr et le modèle depuis Google, comme le fera le téléphone.
   Lancer : node tests-navigateur/v10-pages-reel.mjs   (réseau requis ; aucune caméra, image de test sans main) */
const PAGE = process.env.PAGE || 'https://justinmaneiro-alt.github.io/Rayle-/camera/index.html';
const MP = '0.10.21', CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP + '/', MODELE = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run'] });
try {
  const page = await nav.newPage(); const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  await page.goto(PAGE, { waitUntil: 'load' });
  const r = await page.evaluate(async (cdn, modele, base) => {
    const mod = await import(base + 'detection.js'), cv = document.createElement('canvas'); cv.width = 640; cv.height = 480; const x = cv.getContext('2d'); x.fillStyle = '#556'; x.fillRect(0, 0, 640, 480);
    const t0 = performance.now();
    const d = await mod.creerDetecteur({ mjs: cdn + 'vision_bundle.mjs', wasm: cdn + 'wasm', modele, delegate: 'GPU', mains: 2, urlWorker: new URL('detection-worker.js', base).href, taille: { l: 480, h: 360 } });
    const demarrage = performance.now() - t0, ms = []; for (let i = 0; i < 30; i++) { const res = await d.detecter(cv, 1000 + i * 17); if (res) ms.push(res.total != null ? res.total : res.ms); }
    const sortie = { mode: d.mode, delegate: d.delegate, avertissement: d.avertissement, demarrage: Math.round(demarrage), n: ms.length, mediane: +ms.sort((a, b) => a - b)[ms.length >> 1].toFixed(1) }; d.fermer(); return sortie;
  }, CDN, MODELE, PAGE.replace(/[^/]*$/, ''));
  console.log(JSON.stringify(r), erreurs.join('|'));
  const ok = r.mode === 'worker' && r.n >= 25 && !erreurs.length;
  console.log(ok ? 'OK  le Worker de détection de la page publiée charge MediaPipe depuis jsDelivr et détecte (mode worker, ' + r.delegate + ', ' + r.mediane + ' ms)' : 'KO  ' + JSON.stringify(r));
  process.exitCode = ok ? 0 : 1;
} finally { await nav.close(); }
