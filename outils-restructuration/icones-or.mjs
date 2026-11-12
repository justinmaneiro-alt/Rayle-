// Icônes de l'application installable au thème Jarvis or (le dessin de favicon.svg, cyan → or). node outils-restructuration/icones-or.mjs
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(path.resolve('tests-navigateur/package.json')), puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CORRESP = { '#4de3ff': '#ffae3d', '#d8fbff': '#fff1d6', '#8ff0ff': '#ffd27a', '#1aa8d8': '#c9791a', '#0a2a44': '#2a1706', '#04101e': '#120a03', '#01040a': '#080503' };
let svg = fs.readFileSync('favicon.svg', 'utf8'); if (!svg.includes('#4de3ff')) svg = fs.readFileSync('outils-restructuration/favicon-cyan.svg', 'utf8'); else fs.writeFileSync('outils-restructuration/favicon-cyan.svg', svg);
for (const [a, b] of Object.entries(CORRESP)) svg = svg.split(a).join(b);
fs.writeFileSync('favicon.svg', svg);
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] }), p = await nav.newPage();
for (const [taille, fichier, marge] of [[192, 'icones/rayle-192.png', 0], [512, 'icones/rayle-512.png', 0], [512, 'icones/rayle-maskable-512.png', 0.12]]) {
  await p.setViewport({ width: taille, height: taille, deviceScaleFactor: 1 }); const m = Math.round(taille * marge);
  await p.setContent(`<body style="margin:0;background:#080503;display:grid;place-items:center;width:${taille}px;height:${taille}px"><div style="width:${taille - 2 * m}px;height:${taille - 2 * m}px">${svg.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div></body>`);
  await p.screenshot({ path: fichier }); console.log(fichier, fs.statSync(fichier).size, 'octets');
}
await nav.close();
