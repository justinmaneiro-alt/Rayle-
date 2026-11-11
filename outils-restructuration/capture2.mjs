// Capture avec géolocalisation simulée (Bordeaux) : node outils-restructuration/capture2.mjs <appareil> <sortie.png>
import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const [cle = 'pc', sortie = 'outils-restructuration/accueil.png'] = process.argv.slice(2);
const o = await ouvrirAppareil(cle, { attente: 500, avant: async page => { const c = page.browser().defaultBrowserContext(); try { await c.overridePermissions('http://127.0.0.1:8000', ['geolocation']); } catch (e) {} await page.setGeolocation({ latitude: 44.84, longitude: -0.58 }); } });
await new Promise(r => setTimeout(r, 6000));
console.log(JSON.stringify(await o.page.evaluate(() => { const e = AccueilRayle.etat(); return { ville: e.ville, meteo: e.meteo && e.meteo.etat, temp: e.meteo && e.meteo.temp, jour: e.jour && (e.jour.erreur || e.jour.liste.length), actus: e.actus && (e.actus.erreur || e.actus.sujets.length) }; })));
await o.page.screenshot({ path: sortie });
console.log('erreurs', [...new Set(o.erreurs)].filter(e => !/faireconomy|404|ERR_FAILED|calendar/.test(e)));
await o.navigateur.close();
