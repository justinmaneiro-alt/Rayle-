import { ouvrirGalaxie, entrerEnOrbite, attendre, attendreChargement } from './terre-aide.mjs';
import { demarrerWorkerReel } from './worker-local-reel.mjs';

/* Images par seconde avec les actualités affichées (balises, cartes, bandeau, traits animés), avec les VRAIES sources de tuiles et le vrai fil d'actualités
   (mini-Worker local). L=2560 H=1440 par défaut. Objectif : 60 i/s minimum en qualité haute. */
const L = +(process.env.L || 2560), H = +(process.env.H || 1440);
const worker = await demarrerWorkerReel(8797);
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: L, hauteur: H, avant: async p => {
  await p.evaluateOnNewDocument(u => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', u); localStorage.setItem('rayle_worker_token', 'test'); }, worker.url);
} });
const G = (f, ...a) => page.evaluate(f, ...a);
await G(() => { window.__ft = []; const f = t => { window.__ft.push(t); requestAnimationFrame(f); }; requestAnimationFrame(f); });
const mesurer = async ms => {
  await G(() => { window.__ft.length = 0; }); await attendre(ms);
  return G(() => { const t = window.__ft, d = []; for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]); d.sort((a, b) => a - b); const n = d.length, moy = d.reduce((s, v) => s + v, 0) / n; const p = d.slice(Math.floor(n * 0.99)); const p1 = p.reduce((s, v) => s + v, 0) / Math.max(1, p.length); return { fps: +(1000 / moy).toFixed(1), pire1: +(1000 / p1).toFixed(1), maxMs: +d[n - 1].toFixed(1), n }; });
};
console.log(`Résolution ${L}×${H}, qualité haute, vraies sources`);
await page.waitForFunction(() => window.Galaxie.balisesLointaines && window.Galaxie.balisesLointaines.etat().balises > 0, { timeout: 60000 }).catch(() => {});
await G(() => window.Galaxie.nav.placer('terre', { angle: 0.9, pitch: 0.25, distance: 3.2 * 6 })); await attendre(1500);
console.log('galaxie, Terre + balises lointaines'.padEnd(36), JSON.stringify(await mesurer(3000)), 'balises', await G(() => window.Galaxie.balisesLointaines.etat().balises));
await entrerEnOrbite(page, { directe: true }); await attendreChargement(page, { calme: 1200 });
const vues = [['monde', 'monde', { lon: 10, lat: 20, dist: 17000, cap: 0, incl: 0 }], ['france', 'france', null]];
for (const [nom, portee] of vues) {
  await G(p => document.querySelector('#terre-ui [data-a="' + p + '"]').click(), portee);
  await page.waitForFunction(() => window.Terre.sujetsEtat().visibles.length >= 3, { timeout: 40000 }).catch(() => {});
  await page.waitForFunction(() => !window.Terre.etat().vol, { timeout: 15000 }); await attendreChargement(page, { calme: 1200 }); await attendre(800);
  const e = await G(() => window.Terre.sujetsEtat());
  console.log(('actualités · ' + nom).padEnd(36), JSON.stringify(await mesurer(3500)), `sujets ${e.sujets}, balises ${e.visibles.length}, cartes ${e.cartes.length}`);
}
// pendant le vol caméra de sujet en sujet (présentation de Raylé)
const ids = await G(() => window.Terre.sujetsEtat().visibles.slice(0, 5).map(v => v.id));
await G(() => { window.__ft.length = 0; });
for (const id of ids) { await G(id => window.Terre.eclairerSujet(id), id); await attendre(2300); }
const vol = await G(() => { const t = window.__ft, d = []; for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]); d.sort((a, b) => a - b); const n = d.length, moy = d.reduce((s, v) => s + v, 0) / n; return { fps: +(1000 / moy).toFixed(1), maxMs: +d[n - 1].toFixed(1), p99Ms: +d[Math.floor(n * 0.99)].toFixed(1), n }; });
console.log('vol de sujet en sujet (5 sujets)'.padEnd(36), JSON.stringify(vol));
const s = await G(() => { const s = window.Terre.stats(); return { vram: Math.round(s.vram / 1048576) + ' Mo', tuiles: s.tuiles }; });
console.log('mémoire vidéo (tuiles)', JSON.stringify(s));
await G(() => window.Terre.sujetsEtat());
console.log('erreurs :', erreurs.filter(e => !/faireconomy|404|408|ERR_FAILED|Failed to load/.test(e)).join('\n  ') || 'aucune');
await navigateur.close(); await worker.fermer();
process.exit(0);
