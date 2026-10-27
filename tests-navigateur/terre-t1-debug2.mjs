import { ouvrirGalaxie, entrerEnOrbite, attendre } from './terre-aide.mjs';
const [lon, lat, dist] = process.argv.slice(2).map(Number);
const { navigateur, page } = await ouvrirGalaxie({});
await entrerEnOrbite(page);
await page.evaluate(([lon, lat, dist]) => window.Terre.placer({ lon, lat, dist, cap: 0.3, incl: 0.9 }), [lon, lat, dist]);
for (let i = 0; i < 10; i++) {
  await attendre(700);
  console.log(JSON.stringify(await page.evaluate(() => { const d = window.Terre.diagnostic(); return { alt: d.args && Math.round(d.args.altitude), fe: d.feuilles, hz: d.hz, aff: window.Terre.stats().affichees.length, hud: document.body.innerText.match(/ALTITUDE\s*([\d, ]+ ?\w+)/)?.[1], etat: window.Terre.etat() }; })));
}
await navigateur.close();
