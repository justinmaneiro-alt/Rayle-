// Extrait des images d'un enregistrement d'écran (Chrome lit le MP4). node tests-navigateur/_frames.mjs <fichier> <sortie-prefixe> [n]
import puppeteer from 'puppeteer-core';
import { CHROME } from './terre-aide.mjs';
import http from 'node:http'; import fs from 'node:fs';
const [fichier, pref, n = '8'] = process.argv.slice(2);
const srv = http.createServer((q, s) => { const st = fs.statSync(fichier); const r = q.headers.range; if (r) { const m = /bytes=([0-9]+)-([0-9]*)/.exec(r); const a = +m[1], b = m[2] ? +m[2] : st.size - 1; s.writeHead(206, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': 'bytes ' + a + '-' + b + '/' + st.size, 'Content-Length': b - a + 1 }); fs.createReadStream(fichier, { start: a, end: b }).pipe(s); } else { s.writeHead(200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': st.size }); fs.createReadStream(fichier).pipe(s); } }).listen(8777);
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
const page = await nav.newPage(); await page.setViewport({ width: 1600, height: 900 });
await page.setContent('<body style="margin:0;background:#000"><video id=v muted style="width:1600px;height:900px;object-fit:contain"></video></body>');
await page.evaluate(u => { document.getElementById('v').src = u; }, "http://127.0.0.1:8777/v.mp4");
const dur = await page.evaluate(() => new Promise(r => { const v = document.getElementById('v'); v.onloadedmetadata = () => r(v.duration); v.onerror = () => r(-1); setTimeout(() => r(-2), 20000); }));
console.log('durée', dur); if (dur <= 0) process.exit(1);
for (let i = 0; i < +n; i++) {
  const t = dur * (i + 0.5) / +n;
  await page.evaluate(t => new Promise(r => { const v = document.getElementById('v'); v.onseeked = () => setTimeout(r, 300); v.currentTime = t; }), t);
  await page.screenshot({ path: `${pref}-${String(i).padStart(2, '0')}.png` }); console.log('image', i, t.toFixed(0) + ' s');
}
await nav.close(); srv.close();
