import { ouvrirGalaxie, entrerEnOrbite, attendre, attendreChargement } from './terre-aide.mjs';

/* Mesure des images par seconde de la Terre (sources réelles) à une résolution donnée : L=2560 H=1440 par défaut.
   Pour chaque vue : moyenne, 1 % les plus lentes, pire image ; puis pendant un vol Paris → Tokyo (chargement en continu). */
const L = +(process.env.L || 2560), H = +(process.env.H || 1440);
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: L, hauteur: H });
await entrerEnOrbite(page);
await page.evaluate(() => { window.__ft = []; const f = t => { window.__ft.push(t); requestAnimationFrame(f); }; requestAnimationFrame(f); });
const mesurer = async ms => {
  await page.evaluate(() => { window.__ft.length = 0; }); await attendre(ms);
  return page.evaluate(() => {
    const t = window.__ft, d = []; for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]);
    d.sort((a, b) => a - b); const n = d.length, moy = d.reduce((s, v) => s + v, 0) / n;
    const pire1 = d.slice(Math.floor(n * 0.99)); const p1 = pire1.reduce((s, v) => s + v, 0) / Math.max(1, pire1.length);
    return { fps: +(1000 / moy).toFixed(1), pire1: +(1000 / p1).toFixed(1), maxMs: +d[n - 1].toFixed(1), n };
  });
};
const vues = [
  ['orbite', { lon: 2, lat: 35, dist: 16000, cap: 0, incl: 0 }],
  ['Europe', { lon: 8, lat: 46, dist: 3200, cap: 0, incl: 0 }],
  ['France', { lon: 2.5, lat: 46.5, dist: 1100, cap: 0, incl: 0.3 }],
  ['Alpes inclinées', { lon: 6.865, lat: 45.833, dist: 28, cap: 2.6, incl: 1.1 }],
  ['Paris + bâtiments', { lon: 2.3522, lat: 48.8566, dist: 1.6, cap: 0.4, incl: 1.0 }]
];
console.log(`Résolution ${L}×${H} (profil haute, MSAA et bloom de la galaxie)`);
for (const [nom, v] of vues) {
  await page.evaluate(v => window.Terre.placer(v), v);
  await attendreChargement(page, { calme: 1200 });
  const m = await mesurer(3000);
  const s = await page.evaluate(() => { const s = window.Terre.stats(); const g = window.Galaxie.mesures(2000); return { aff: s.affichees.length, tuiles: s.tuiles, bat: s.batiments, vram: Math.round(s.vram / 1048576), tex: g.texturesGpu, appels: g.appels, tri: g.triangles }; });
  console.log(nom.padEnd(20), JSON.stringify(m), JSON.stringify(s));
}
// point B : radar de pluie, nuages locaux animés et pluie (météo locale simulée par une valeur fixe : on mesure le coût du rendu, pas le Worker)
await page.evaluate(() => { window.Terre.regler({ radar: true }); window.Terre.placer({ lon: 4, lat: 49, dist: 2400, cap: 0, incl: 0 }); });
await page.waitForFunction(() => window.Terre.etatB().radar.tuiles > 0, { timeout: 30000 }).catch(() => {});
await attendreChargement(page, { calme: 1200 });
console.log('Europe + radar'.padEnd(20), JSON.stringify(await mesurer(3000)));
await page.evaluate(() => { window.Terre.regler({ radar: false }); window.Terre.definirMeteoLocale({ lon: 2.24, lat: 43.6, couverture: 90, pluie: 3, vent: 25, direction: 290 }); window.Terre.placer({ lon: 2.24, lat: 43.6, dist: 45, cap: 0.3, incl: 0.7 }); });
await attendreChargement(page, { calme: 1200 });
console.log('nuages locaux'.padEnd(20), JSON.stringify(await mesurer(3000)));
await page.evaluate(() => window.Terre.placer({ lon: 2.24, lat: 43.6, dist: 0.9, cap: 0.3, incl: 0.9 }));
await attendreChargement(page, { calme: 1200 });
console.log('pluie près du sol'.padEnd(20), JSON.stringify(await mesurer(3000)));
await page.evaluate(() => window.Terre.definirMeteoLocale(null));
// pendant le chargement continu : vol Paris → Tokyo
await page.evaluate(() => { window.Terre.placer({ lon: 2.3522, lat: 48.8566, dist: 2, cap: 0.4, incl: 1 }); });
await attendreChargement(page, { calme: 1000 });
await page.evaluate(() => { window.__ft.length = 0; window.Terre.volerVers({ lon: 139.7, lat: 35.7, dist: 3, cap: 0.2, incl: 1 }, 7); });
await attendre(7600);
const vol = await page.evaluate(() => { const t = window.__ft, d = []; for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]); d.sort((a, b) => a - b); const n = d.length; return { fps: +(1000 / (d.reduce((s, v) => s + v, 0) / n)).toFixed(1), maxMs: +d[n - 1].toFixed(1), p99Ms: +d[Math.floor(n * 0.99)].toFixed(1), n }; });
console.log('vol Paris → Tokyo (7 s) '.padEnd(20), JSON.stringify(vol));
console.log('erreurs :', erreurs.filter(e => !/faireconomy|404|408|ERR_FAILED|Failed to load/.test(e)).join('\n  ') || 'aucune');
await navigateur.close();
