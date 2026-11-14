/* Fabrique les textures de la Terre mobile à partir des images de galaxie/textures (Solar System Scope, CC BY 4.0, d'après NASA Blue Marble / Black Marble).
   node outils-restructuration/textures-terre.mjs  → planetes/terre/mobile/textures/{jour-1k,jour-4k,nuit-2k,nuages-1k}.jpg */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const racine = path.resolve('galaxie/textures'), sortie = path.resolve('planetes/terre/mobile/textures');
const jobs = [['8k_earth_daymap.jpg', 'jour-1k.jpg', 1024, .8], ['8k_earth_daymap.jpg', 'jour-4k.jpg', 4096, .8], ['8k_earth_nightmap.jpg', 'nuit-2k.jpg', 2048, .78], ['2k_earth_clouds.jpg', 'nuages-1k.jpg', 1024, .7]];
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
const p = await nav.newPage(); await p.goto('about:blank');
for (const [src, dst, larg, q] of jobs) {
  const b64 = fs.readFileSync(path.join(racine, src)).toString('base64');
  const out = await p.evaluate(async (b64, larg, q) => { const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = larg; c.height = larg / 2; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q).split(',')[1]; }, b64, larg, q);
  fs.writeFileSync(path.join(sortie, dst), Buffer.from(out, 'base64')); console.log(dst, Math.round(fs.statSync(path.join(sortie, dst)).size / 1024) + ' Ko');
}
await nav.close();
