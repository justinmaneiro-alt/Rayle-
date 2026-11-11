// Images/s de l'accueil et du carrousel, avec ralentissement du processeur (x4 ~ téléphone milieu de gamme, x2 ~ S23 Ultra). node outils-restructuration/fluidite.mjs [pc|telephone] [ralentissement]
import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const cle = process.argv[2] || 'telephone', k = +(process.argv[3] || 2);
const o = await ouvrirAppareil(cle, { attente: 3000 }); const p = o.page;
await o.cdp.send('Emulation.setCPUThrottlingRate', { rate: k });
const mesure = (ms) => p.evaluate(ms => new Promise(res => { let n = 0, pire = 0, t0 = performance.now(), dernier = t0; const f = t => { n++; pire = Math.max(pire, t - dernier); dernier = t; if (t - t0 < ms) requestAnimationFrame(f); else res({ fps: +(n * 1000 / (t - t0)).toFixed(1), pireMs: +pire.toFixed(1) }); }; requestAnimationFrame(f); }), ms);
console.log(cle, 'x' + k, 'accueil au repos :', JSON.stringify(await mesure(4000)));
const anim = p.evaluate(() => { Application.suivant(); setTimeout(() => Application.precedent(), 700); });
console.log(cle, 'x' + k, 'pendant un balayage :', JSON.stringify(await mesure(1500))); await anim;
await o.navigateur.close();
