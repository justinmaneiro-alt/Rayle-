import { ouvrirGalaxie, entrerEnOrbite, attendreChargement, attendre } from './terre-aide.mjs';
const [lon, lat, dist, cap, incl] = process.argv.slice(2).map(Number);
const { navigateur, page } = await ouvrirGalaxie({});
await entrerEnOrbite(page);
await page.evaluate(([lon, lat, dist, cap, incl]) => window.Terre.placer({ lon, lat, dist, cap, incl }), [lon, lat, dist, cap, incl]);
await attendreChargement(page, { calme: 1500, max: 60000 }); await attendre(800);
console.log(JSON.stringify(await page.evaluate(() => ({ cam: window.Terre.cameraInfo(), e: window.Terre.etat() }))));
await navigateur.close();
