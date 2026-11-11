// Captures du carrousel à plusieurs positions. node outils-restructuration/capture-car.mjs <appareil> <prefixe>
import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const [cle = 'pc1600', pref = 'outils-restructuration/captures-design/car'] = process.argv.slice(2); const att = ms => new Promise(r => setTimeout(r, ms));
const o = await ouvrirAppareil(cle, { attente: 1500, avant: async page => { try { await page.browser().defaultBrowserContext().overridePermissions('http://127.0.0.1:8000', ['geolocation']); } catch (e) {} await page.setGeolocation({ latitude: 44.84, longitude: -0.58 }); } });
await att(5000); await o.page.screenshot({ path: pref + '-0.png' });
for (const i of [1, 2, 3, 4]) { await o.page.evaluate(i => Application.aller(i), i); await att(i === 1 ? 7000 : 6000); await o.page.screenshot({ path: pref + '-' + i + '.png' }); }
console.log(JSON.stringify(await o.page.evaluate(() => Miniatures.etat()))); console.log('erreurs', [...new Set(o.erreurs)].filter(e => !/faireconomy|404|ERR_FAILED|calendar/.test(e)).slice(0, 5));
await o.navigateur.close();
