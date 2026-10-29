// V8 : fabrique les icônes de l'application installable (PNG 192 et 512, plus une version « maskable ») à partir de favicon.svg. node outils-positions/icones-pwa.mjs
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const svg = fs.readFileSync('favicon.svg', 'utf8');
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const p = await nav.newPage();
for (const [taille, fichier, marge] of [[192, 'icones/rayle-192.png', 0], [512, 'icones/rayle-512.png', 0], [512, 'icones/rayle-maskable-512.png', 0.12]]) {
  await p.setViewport({ width: taille, height: taille, deviceScaleFactor: 1 });
  const m = Math.round(taille * marge);
  await p.setContent(`<body style="margin:0;background:#02060c;display:grid;place-items:center;width:${taille}px;height:${taille}px"><div style="width:${taille - 2 * m}px;height:${taille - 2 * m}px">${svg.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div></body>`);
  await p.screenshot({ path: fichier });
  console.log(fichier, fs.statSync(fichier).size, 'octets');
}
await nav.close();
