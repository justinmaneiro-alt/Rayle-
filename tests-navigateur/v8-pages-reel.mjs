// V8 : contrôle de GitHub Pages en vrai (téléphone émulé, sans Worker) : la coque s'affiche, aucun fichier de Galaxie, pas d'erreur de page. node tests-navigateur/v8-pages-reel.mjs
import { ouvrirAppareil, galaxieChargee, attendre } from './v7b-aide.mjs';
process.env.BASE = 'https://justinmaneiro-alt.github.io/Rayle-';
const o = await ouvrirAppareil('telephone', { url: '/index.html', attente: 6000 });
const r = await o.page.evaluate(() => ({ mode: RayleAppareil.mode(), coque: !!document.getElementById('m-app'), cartes: document.querySelectorAll('.m-carte').length, nav: document.querySelectorAll('#m-nav button').length, version: window.RAYLE_VERSION, sw: 'serviceWorker' in navigator }));
console.log(JSON.stringify(r), 'galaxie:', galaxieChargee(o.requetes).length, 'erreurs:', o.erreurs.filter(e => !/faireconomy|CORS|ERR_FAILED/.test(e)).slice(0, 3));
await o.page.screenshot({ path: 'docs/captures-v8/pages-reel-telephone.png' });
await o.navigateur.close();
