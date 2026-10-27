import { ouvrirGalaxie, attendre, attendreChargement } from './terre-aide.mjs';

/* Captures « avant / après » : la Terre dans la galaxie (texture 8k, avant) puis le globe détaillé à la même distance (après),
   et le raccord entre les deux (même orientation, même taille). */
const L = +(process.env.L || 1600), H = +(process.env.H || 900);
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: L, hauteur: H });
await page.evaluate(() => { window.Galaxie.nav.placer('terre', { angle: 0.9, pitch: 0.25 }); });
await attendre(1200);
await page.screenshot({ path: '../captures-terre/avant-galaxie-terre.png' });
await page.evaluate(() => window.Galaxie.nav.allerA('terre', { entrer: true }));
await page.waitForFunction(() => window.Terre && window.Terre.etat().actif, { timeout: 60000 });
// premier instant après le fondu : l'orientation doit être celle de la galaxie
await page.waitForFunction(() => !document.getElementById('terre-fondu').classList.contains('noir'), { timeout: 20000 });
await page.screenshot({ path: '../captures-terre/apres-0-raccord.png' });
await attendreChargement(page, { calme: 1200 });
await page.screenshot({ path: '../captures-terre/apres-1-orbite.png' });
await page.evaluate(() => window.Terre.placer({ lon: 10, lat: 40, dist: 9000, cap: 0, incl: 0 }));
await attendreChargement(page, { calme: 1200 });
await page.screenshot({ path: '../captures-terre/apres-2-europe-proche.png' });
console.log('erreurs :', erreurs.filter(e => !/faireconomy|404|408|ERR_FAILED|Failed to load/.test(e)).join('\n  ') || 'aucune');
await navigateur.close();
