import { ouvrirGalaxie, entrerEnOrbite, attendre, attendreChargement } from './terre-aide.mjs';
const [lon, lat, dist] = process.argv.slice(2).map(Number);
const { navigateur, page, erreurs } = await ouvrirGalaxie({});
await entrerEnOrbite(page);
await page.evaluate(([lon, lat, dist]) => window.Terre.placer({ lon, lat, dist, cap: 0.3, incl: 0.9 }), [lon, lat, dist]);
await attendreChargement(page, { calme: 1200, max: 40000 });
console.log(JSON.stringify(await page.evaluate(() => ({ d: window.Terre.diagnostic(), s: window.Terre.stats().affichees })), null, 1));
console.log('ERREURS', erreurs.filter(e=>!/CONNECTION_REFUSED/.test(e)).slice(0,8)); await navigateur.close();
