// Fluidité du carrousel avec miniatures vivantes. node outils-restructuration/fluidite-car.mjs <appareil> [ralentissementCPU]
import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const [cle = 'tel390', k = '1'] = process.argv.slice(2); const att = ms => new Promise(r => setTimeout(r, ms));
const o = await ouvrirAppareil(cle, { attente: 2500 }); const p = o.page; if (+k > 1) await o.cdp.send('Emulation.setCPUThrottlingRate', { rate: +k });
const mesure = ms => p.evaluate(ms => new Promise(res => { let n = 0, t0 = performance.now(), pire = 0, d = t0; const f = t => { n++; pire = Math.max(pire, t - d); d = t; if (t - t0 < ms) requestAnimationFrame(f); else res({ fps: +(n * 1000 / (t - t0)).toFixed(1), pireMs: +pire.toFixed(0) }); }; requestAnimationFrame(f); }), ms);
const sortie = {};
for (const [nom, i] of [['accueil', 0], ['terminal', 1], ['anatomie', 2], ['terre', 3], ['dev3d', 4]]) {
  await p.evaluate(i => Application.aller(i), i); await att(3500); sortie[nom] = await mesure(3000);
}
await p.evaluate(() => Application.aller(2)); await att(1500);
sortie.pendantBalayage = await (async () => { const m = mesure(1800); await p.evaluate(() => { Application.aller(3); setTimeout(() => Application.aller(2), 800); }); return m; })();
console.log(cle, 'x' + k, JSON.stringify(sortie)); console.log(JSON.stringify(await p.evaluate(() => Miniatures.etat())));
await o.navigateur.close();
