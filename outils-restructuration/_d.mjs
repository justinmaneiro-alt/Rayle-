import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const o = await ouvrirAppareil('pc1600', { attente: 9000 });
console.log(await o.page.evaluate(async () => { const m = await import(new URL('skins/neurone/etats-reseau.js', document.baseURI).href); return JSON.stringify({ idle: m.ETATS.idle.c, veille: m.ETATS.veille.c, g1c: document.body.dataset.g1c, mode: document.body.dataset.hud, ent: window.Entite && Entite.info && JSON.stringify(Entite.info()).slice(0, 400) }); }));
await o.navigateur.close();
