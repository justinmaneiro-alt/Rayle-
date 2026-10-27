/* S1 : essai rapide du vaisseau : ouvre la galaxie, entre dans Saturne, prend des captures (extérieur, cockpit, salle médicale), affiche erreurs et images/s. */
import { ouvrirGalaxie, attendre } from './terre-aide.mjs';
import fs from 'node:fs';
const dossier = process.env.OUT || '../docs/captures-s1/'; fs.mkdirSync(dossier, { recursive: true });
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: +(process.env.L || 1600), hauteur: +(process.env.H || 900) });
await page.evaluate(() => window.Galaxie.nav.allerA('saturne', { entrer: true }));
await page.waitForFunction(() => window.Saturne && window.Saturne.etat().actif && window.Saturne.etat().entree, { timeout: 60000 });
await attendre(1500);
const info = () => page.evaluate(() => { const e = window.Saturne.etat(); return { mode: e.mode, vue: e.vue, v: e.vol && e.vol.vitesse.toFixed(2), cam: e.camera && e.camera.pos.map(x => +x.toFixed(2)) }; });
console.log('entrée', JSON.stringify(await info()));
await page.screenshot({ path: dossier + 'exterieur.png' });
await page.evaluate(() => window.Saturne.vue('cockpit')); await attendre(2200);
await page.screenshot({ path: dossier + 'cockpit.png' });
console.log('cockpit', JSON.stringify(await info()));
await page.evaluate(() => window.Saturne.salleMedicale()); await attendre(2500);
await page.screenshot({ path: dossier + 'salle.png' });
console.log('salle', JSON.stringify(await info()));
console.log('erreurs :', erreurs.filter(e => !/faireconomy|404|408|ERR_FAILED|CONNECTION_REFUSED|Failed to load resource|CORS/.test(e)).join('\n  ') || 'aucune');
await navigateur.close();
