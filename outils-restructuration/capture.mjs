// Capture : node outils-restructuration/capture.mjs <pc|tablette|telephone> <sortie.png> [hash]
import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const [cle = 'pc', sortie = 'outils-restructuration/capture.png', hash = ''] = process.argv.slice(2);
const o = await ouvrirAppareil(cle, { url: '/index.html' + hash, attente: 4000 });
await o.page.screenshot({ path: sortie });
console.log('ok', sortie, 'erreurs', o.erreurs.length);
await o.navigateur.close();
