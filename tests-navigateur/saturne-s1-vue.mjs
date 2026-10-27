/* Capture ciblée : node saturne-s1-vue.mjs nom vue [poussee] */
import { ouvrirGalaxie, attendre } from './terre-aide.mjs';
const [nom, vue, poussee] = process.argv.slice(2);
const { navigateur, page } = await ouvrirGalaxie({ largeur: 1600, hauteur: 900 });
await page.evaluate(() => window.Galaxie.nav.allerA('saturne', { entrer: true }));
await page.waitForFunction(() => window.Saturne && window.Saturne.etat().actif && window.Saturne.etat().entree, { timeout: 60000 }); await attendre(1200);
await page.evaluate(v => window.Saturne.vue(v), vue);
if (poussee) await page.evaluate(() => window.Saturne.forcerEntrees({ trans: [0, 0, 1], rot: [0, 0, 0], post: true }, 60000));
await attendre(poussee ? 3500 : 2200);
await page.screenshot({ path: '../docs/captures-s1/' + nom + '.png' });
await navigateur.close();
