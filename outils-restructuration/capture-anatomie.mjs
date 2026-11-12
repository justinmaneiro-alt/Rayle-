// Captures du squelette : miniature du carrousel, puis grande fenêtre. node outils-restructuration/capture-anatomie.mjs [appareil]
import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const [cle = 'pc1600'] = process.argv.slice(2); const att = ms => new Promise(r => setTimeout(r, ms)); const D = 'outils-restructuration/captures/';
const o = await ouvrirAppareil(cle, { attente: 1500 }); const p = o.page;
await p.evaluate(() => Application.aller(2)); await att(10000);
await p.screenshot({ path: D + `squelette-miniature-${cle}.png` });
const r = await p.evaluate(() => { const c = document.querySelector('.ac-p[data-id="anatomie"] .ac-mini').getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height, os: Miniatures.etat().minis.find(m => m.id === 'anatomie') }; });
await p.screenshot({ path: D + `squelette-miniature-zoom-${cle}.png`, clip: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.w, 1400), height: r.h } });
console.log(JSON.stringify(r.os));
const ct = await p.evaluate(() => { const r = document.querySelector('.ac-p[data-id="anatomie"] .ac-cadre').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
if (cle.startsWith('pc')) await p.mouse.click(ct[0], ct[1]); else await p.touchscreen.tap(ct[0], ct[1]);
for (let k = 0; k < 90; k++) { await att(500); if (await p.evaluate(() => { const s = window.Saturne && Saturne.etat && Saturne.etat(); return !!(s && s.salle); })) break; }
await att(9000); await p.screenshot({ path: D + `squelette-grande-fenetre-${cle}.png` });
console.log('erreurs', [...new Set(o.erreurs)].filter(e => !/faireconomy|404|ERR_FAILED|calendar|501/.test(e)).slice(0, 5)); await o.navigateur.close();
