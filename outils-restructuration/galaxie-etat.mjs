import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const o = await ouvrirAppareil('pc', { url: '/index.html#galaxie', attente: 7000 });
const info = await o.page.evaluate(() => ({ galaxie: !!window.Galaxie, marche: window.Galaxie && Galaxie.enMarche(), planetes: window.Galaxie && Galaxie.info().planetes, ignores: window.Galaxie && Galaxie.info().ignores, vue: RayleBus.demander('vue') }));
console.log(JSON.stringify(info)); console.log('erreurs', [...new Set(o.erreurs)].filter(e => !/faireconomy|404|ERR_FAILED/.test(e)));
await o.page.screenshot({ path: 'outils-restructuration/phase1-galaxie.png' });
await o.navigateur.close();
