import { ouvrirGalaxie, entrerEnOrbite, attendre, attendreChargement } from './terre-aide.mjs';
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: +(process.env.L || 1600), hauteur: +(process.env.H || 900) });
await entrerEnOrbite(page);
await page.evaluate(() => window.Terre.regler({ fps: true }));
const vues = JSON.parse(process.env.VUES || 'null') || [
  ['02-europe', { lon: 8, lat: 46, dist: 3200, cap: 0, incl: 0 }],
  ['03-france', { lon: 2.5, lat: 46.5, dist: 1100, cap: 0, incl: 0.3 }],
  ['04-occitanie', { lon: 1.6, lat: 43.6, dist: 160, cap: 0, incl: 0.5 }],
  ['05-toulouse', { lon: 1.4442, lat: 43.6047, dist: 14, cap: 0.3, incl: 0.6 }],
  ['06-mont-blanc', { lon: 6.865, lat: 45.833, dist: 28, cap: 2.6, incl: 1.1 }],
  ['07-paris-batiments', { lon: 2.3522, lat: 48.8566, dist: 1.6, cap: 0.4, incl: 1.0 }]
];
for (const [nom, v] of vues) {
  await page.evaluate(v => window.Terre.placer(v), v);
  const t0 = Date.now();
  await attendreChargement(page);
  await page.screenshot({ path: `../captures-terre/${nom}.png` });
  const s = await page.evaluate(() => { const s = window.Terre.stats(); return { aff: s.affichees.length, tuiles: s.tuiles, bat: s.batiments, vram: Math.round(s.vram / 1048576), fps: Math.round(window.Galaxie.mesures(1500).fps) }; });
  console.log(nom, JSON.stringify(s), (Date.now() - t0) + ' ms');
}
console.log('erreurs :', erreurs.filter(e => !/faireconomy|404|408|ERR_FAILED/.test(e)).join('\n  ') || 'aucune');
await navigateur.close();
