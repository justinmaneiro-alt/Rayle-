// V8 : sonde rapide d'un appareil émulé. node tests-navigateur/v8-sonde.mjs telephone "<expression JS>"
import { ouvrirAppareil } from './v7b-aide.mjs';
const o = await ouvrirAppareil(process.argv[2] || 'telephone', { attente: 3500, paysage: process.argv[4] === 'paysage' });
console.log(JSON.stringify(await o.page.evaluate(process.argv[3] || '1'), null, 1));
console.log('erreurs', o.erreurs.length, o.erreurs.slice(0, 4));
await o.navigateur.close();
