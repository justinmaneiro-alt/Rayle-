import { ouvrirMobile, attendre } from './v8-aide.mjs';
const o = await ouvrirMobile('tablette', { paysage: true, attente: 3000 }), p = o.page;
await p.evaluate(() => MobileCoque.aller('agent')); await attendre(2500);
await p.evaluate(() => MobileAgent.aller('performance')); await attendre(800);
console.log(o.erreurs);
await o.fermer();
