// Liste les erreurs de console / pageerror / 404 au chargement de l'accueil. Usage : node outils-restructuration/erreurs-chargement.mjs [pc|tablette|telephone]
import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const cle = process.argv[2] || 'pc';
const o = await ouvrirAppareil(cle, { attente: 2500 });
const mauvais = [];
o.page.on('response', r => { if (r.status() >= 400) mauvais.push(r.status() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, '')); });
await o.page.reload({ waitUntil: 'load' }); await new Promise(r => setTimeout(r, 2500));
console.log('erreurs :', o.erreurs.length); [...new Set(o.erreurs)].slice(0, 25).forEach(e => console.log(' -', e));
console.log('reponses >= 400 :', mauvais.length); [...new Set(mauvais)].slice(0, 25).forEach(e => console.log(' -', e));
await o.navigateur.close();
