import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const [cle = 'pc1600', sortie = 'outils-restructuration/captures/terre-miniature-pc1600.png'] = process.argv.slice(2); const att = ms => new Promise(r => setTimeout(r, ms));
const o = await ouvrirAppareil(cle, { attente: 1500 }); const p = o.page;
await p.evaluate(() => Application.aller(3)); await att(12000);
console.log(JSON.stringify(await p.evaluate(() => Miniatures.etat())));
await p.screenshot({ path: sortie }); console.log('erreurs', [...new Set(o.erreurs)].filter(e => !/faireconomy|404|ERR_FAILED|calendar|501/.test(e)).slice(0, 5));
await o.navigateur.close();
