// Génère l'icône de Raylé : un neurone cyan (cœur lumineux, nœuds et fils) sur fond nuit.
// Sorties : app-pc/icone-rayle.svg, app-pc/rayle.ico (16 à 256 px), app-pc/icone-rayle-256.png et favicon.svg (même dessin).
// Usage : node app-pc/generer-icone.mjs   (Chrome ou Edge installé ; puppeteer-core vient de tests-navigateur/node_modules)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ici = path.dirname(fileURLToPath(import.meta.url)), racine = path.dirname(ici);
const puppeteer = (await import(pathToFileURL(path.join(racine, 'tests-navigateur/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js')).href)).default;
const NAVIGATEURS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'];
const exe = NAVIGATEURS.find(p => fs.existsSync(p)); if (!exe) throw new Error('ni Edge ni Chrome trouvés');

/* ── Dessin : positions pseudo-aléatoires (graine fixe : toujours la même icône) ── */
let graine = 20261017; const alea = () => { graine = (graine * 1664525 + 1013904223) >>> 0; return graine / 4294967296; };
const noeuds = [];
for (let i = 0; i < 46; i++) {
  const u = alea() * 2 - 1, a = alea() * Math.PI * 2, r = Math.sqrt(1 - u * u), rayon = 0.35 + 0.65 * Math.pow(alea(), 0.7);
  const x = Math.cos(a) * r * rayon, y = u * rayon * 0.92, z = Math.sin(a) * r * rayon;   // dans une boule ; z = profondeur
  noeuds.push({ x: 256 + x * 196, y: 256 + y * 196, z, t: 3 + (1 - Math.hypot(x, y, z)) * 3.5 + alea() * 2 });
}
const fils = [];
for (let i = 0; i < noeuds.length; i++) for (let j = i + 1; j < noeuds.length; j++) {
  const d = Math.hypot(noeuds[i].x - noeuds[j].x, noeuds[i].y - noeuds[j].y);
  if (d < 112) fils.push({ a: noeuds[i], b: noeuds[j], o: Math.max(0.12, 0.62 - d / 220) * (0.55 + 0.45 * ((noeuds[i].z + noeuds[j].z + 2) / 4)) });
}
for (const n of noeuds) fils.push({ a: { x: 256, y: 256 }, b: n, o: 0.13 + 0.15 * (1 - Math.hypot(n.x - 256, n.y - 256) / 200) });   // fils vers le cœur
const f = v => v.toFixed(1);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>
<radialGradient id="fond" cx="50%" cy="46%" r="72%"><stop offset="0" stop-color="#0a2a44"/><stop offset=".62" stop-color="#04101e"/><stop offset="1" stop-color="#01040a"/></radialGradient>
<radialGradient id="coeur"><stop offset="0" stop-color="#ffffff"/><stop offset=".18" stop-color="#d8fbff" stop-opacity=".98"/><stop offset=".42" stop-color="#4de3ff" stop-opacity=".6"/><stop offset="1" stop-color="#1aa8d8" stop-opacity="0"/></radialGradient>
<radialGradient id="halo"><stop offset="0" stop-color="#4de3ff" stop-opacity=".30"/><stop offset="1" stop-color="#4de3ff" stop-opacity="0"/></radialGradient>
<radialGradient id="noeud"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#8ff0ff"/><stop offset="1" stop-color="#4de3ff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="512" height="512" rx="112" fill="url(#fond)"/>
<rect x="6" y="6" width="500" height="500" rx="106" fill="none" stroke="#4de3ff" stroke-opacity=".35" stroke-width="3"/>
<circle cx="256" cy="256" r="214" fill="url(#halo)"/>
<g stroke="#4de3ff" stroke-linecap="round">${fils.map(l => `<line x1="${f(l.a.x)}" y1="${f(l.a.y)}" x2="${f(l.b.x)}" y2="${f(l.b.y)}" stroke-opacity="${l.o.toFixed(2)}" stroke-width="${(l.a.z === undefined ? 1.6 : 2.2).toFixed(1)}"/>`).join('')}</g>
<g>${noeuds.map(n => `<circle cx="${f(n.x)}" cy="${f(n.y)}" r="${(n.t * 2.2).toFixed(1)}" fill="url(#noeud)" opacity="${(0.55 + 0.45 * ((n.z + 1) / 2)).toFixed(2)}"/>`).join('')}</g>
<circle cx="256" cy="256" r="92" fill="url(#coeur)"/>
<circle cx="256" cy="256" r="17" fill="#ffffff"/>
</svg>
`;
fs.writeFileSync(path.join(ici, 'icone-rayle.svg'), svg);
fs.writeFileSync(path.join(racine, 'favicon.svg'), svg);   // l'onglet / la barre des tâches de la fenêtre d'application reprennent le même neurone

/* ── PNG à chaque taille (Chrome headless, fond transparent) puis assemblage .ico ── */
const TAILLES = [16, 24, 32, 48, 64, 128, 256];
const navigateur = await puppeteer.launch({ executablePath: exe, headless: 'new' });
const page = await navigateur.newPage();
const pngs = {};
for (const t of TAILLES) {
  await page.setViewport({ width: t, height: t, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img style="display:block" width="${t}" height="${t}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`);
  await new Promise(r => setTimeout(r, 120));
  pngs[t] = Buffer.from(await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: t, height: t } }));
}
await navigateur.close();
fs.writeFileSync(path.join(ici, 'icone-rayle-256.png'), pngs[256]);
const entete = Buffer.alloc(6); entete.writeUInt16LE(0, 0); entete.writeUInt16LE(1, 2); entete.writeUInt16LE(TAILLES.length, 4);
const entrees = Buffer.alloc(16 * TAILLES.length); let decalage = 6 + 16 * TAILLES.length;
TAILLES.forEach((t, i) => { const o = i * 16; entrees[o] = t >= 256 ? 0 : t; entrees[o + 1] = t >= 256 ? 0 : t; entrees.writeUInt16LE(1, o + 4); entrees.writeUInt16LE(32, o + 6); entrees.writeUInt32LE(pngs[t].length, o + 8); entrees.writeUInt32LE(decalage, o + 12); decalage += pngs[t].length; });
fs.writeFileSync(path.join(ici, 'rayle.ico'), Buffer.concat([entete, entrees, ...TAILLES.map(t => pngs[t])]));
console.log('icône générée :', TAILLES.map(t => t + ' px (' + pngs[t].length + ' o)').join(', '));
