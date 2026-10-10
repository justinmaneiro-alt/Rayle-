// Génère icones/*.svg (entité Raylé : sphère de points) puis, avec Edge sans tête, icones/*.png.
// Usage : node scripts/icones.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
const dossier = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'icones');
fs.mkdirSync(dossier, { recursive: true });
function sphere(rayon, n) {            // points de Fibonacci, légèrement inclinés
  let s = '';
  const inc = 0.42;
  for (let i = 0; i < n; i++) {
    const y = 1 - 2 * (i + .5) / n, r = Math.sqrt(1 - y * y), a = i * 2.399963;
    const x0 = Math.cos(a) * r, z0 = Math.sin(a) * r;
    const y1 = y * Math.cos(inc) - z0 * Math.sin(inc), z1 = y * Math.sin(inc) + z0 * Math.cos(inc);
    const prof = (z1 + 1) / 2;                      // 0 = derrière, 1 = devant
    const c = prof > .5 ? '#ff3399' : '#7a6bff';
    s += `<circle cx="${(256 + x0 * rayon).toFixed(1)}" cy="${(256 + y1 * rayon).toFixed(1)}" r="${(2.2 + prof * 5.2).toFixed(1)}" fill="${c}" opacity="${(.28 + prof * .72).toFixed(2)}"/>`;
  }
  return s;
}
function svg(rayon, fond) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs><radialGradient id="g" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#2a0f3d"/><stop offset="1" stop-color="#030106"/></radialGradient><radialGradient id="c"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".35" stop-color="#ff3399" stop-opacity=".55"/><stop offset="1" stop-color="#ff007f" stop-opacity="0"/></radialGradient></defs>`
    + (fond ? `<rect width="512" height="512" fill="url(#g)"/>` : '')
    + `<circle cx="256" cy="256" r="${rayon * .55}" fill="url(#c)"/>${sphere(rayon, 520)}</svg>`;
}
// normale : coins arrondis ; maskable : plein fond, sphère dans la zone sûre (80 % centraux)
fs.writeFileSync(path.join(dossier, 'icone.svg'), svg(190, true).replace('<rect width="512" height="512"', '<rect width="512" height="512" rx="96"'));
fs.writeFileSync(path.join(dossier, 'icone-maskable.svg'), svg(150, true));
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const tailles = [['icone', 192], ['icone', 512], ['icone-maskable', 512], ['icone', 180]];
for (const [nom, t] of tailles) {
  const sortie = path.join(dossier, nom === 'icone' && t === 180 ? 'apple-touch-icon.png' : `${nom}-${t}.png`);
  const page = path.join(dossier, `_${nom}.html`);
  fs.writeFileSync(page, `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:${nom === 'icone' ? 'transparent' : '#030106'}}img{display:block;width:${t}px;height:${t}px}</style><img src="${nom}.svg">`);
  execFileSync(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', `--window-size=${t},${t}`, `--screenshot=${sortie}`, 'file:///' + page.split(path.sep).join('/')], { stdio: 'ignore' });
  fs.unlinkSync(page);
  console.log('ok', path.basename(sortie), fs.statSync(sortie).size, 'octets');
}
