// Images/s et niveau de qualité choisi dans une planète, après stabilisation. node outils-restructuration/fluidite-planete.mjs <appareil> <terre|anatomie|dev3d> [ralentissementCPU]
import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const [cle = 'tel390', id = 'terre', k = '1'] = process.argv.slice(2); const att = ms => new Promise(r => setTimeout(r, ms));
const o = await ouvrirAppareil(cle, { attente: 1500 }); const p = o.page;
if (+k > 1) await o.cdp.send('Emulation.setCPUThrottlingRate', { rate: +k });
await p.evaluate(i => Application.ouvrir(i), id); await att(12000);
const m = await p.evaluate(() => new Promise(res => { let n = 0, t0 = performance.now(), pire = 0, d = t0; const f = t => { n++; pire = Math.max(pire, t - d); d = t; if (t - t0 < 4000) requestAnimationFrame(f); else res({ fps: +(n * 1000 / (t - t0)).toFixed(1), pireMs: +pire.toFixed(0) }); }; requestAnimationFrame(f); }));
const q = await p.evaluate(() => ({ niveau: Galaxie.info().qualite, dpr: Galaxie.params().dpr, msaa: Galaxie.params().msaa, bloom: Galaxie.params().bloom, appareil: Galaxie.reglages().appareil, dprEcran: devicePixelRatio }));
console.log(cle, id, 'x' + k, JSON.stringify(m), JSON.stringify(q)); await o.navigateur.close();
