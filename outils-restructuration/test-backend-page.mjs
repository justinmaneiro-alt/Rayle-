// La page contre le backend local (8788) puis contre le Worker en ligne actuel. node outils-restructuration/test-backend-page.mjs
import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const att = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + String(d).slice(0, 260) : '')); };
// 1. backend local
let o = await ouvrirAppareil('pc', { attente: 7000, storage: { rayle_worker_url: 'http://127.0.0.1:8788', rayle_worker_token: 'essai' } });
let e = await o.page.evaluate(() => AccueilRayle.etat());
v('accueil : actualités de France reçues du backend', e.actus && e.actus.sujets && e.actus.sujets.length === 3, JSON.stringify(e.actus).slice(0, 120));
const images = await o.page.evaluate(() => document.querySelectorAll('.ar-actu .ar-img img').length);
v('accueil : images des actualités affichées', images >= 2, images + ' images');
await o.page.evaluate(() => document.getElementById('gear').click()); await att(500);
await o.page.evaluate(() => document.getElementById('btnEtatSourcesTester').click()); for (let k = 0; k < 40; k++) { await att(2000); if (await o.page.evaluate(() => document.querySelectorAll('.es-l').length > 60)) break; }
const lignes = await o.page.evaluate(() => ({ v: document.querySelectorAll('.es-ok').length, r: document.querySelectorAll('.es-ko').length, texte: document.getElementById('etatSources').innerText.slice(0, 200) }));
v('état des sources : lignes vertes et rouges affichées', lignes.v > 50 && lignes.v + lignes.r > 70, JSON.stringify({ v: lignes.v, r: lignes.r }));
await o.page.screenshot({ path: 'outils-restructuration/etat-sources.png' });
await o.navigateur.close();
// 2. Worker en ligne actuel (site statique à la place du Worker)
o = await ouvrirAppareil('pc', { attente: 2000, storage: { rayle_worker_token: 'x' } });
const d = await o.page.evaluate(() => diagnostiquerWorker(true));
v('diagnostic du Worker en ligne : cause précise (pas « injoignable »)', ['pas-le-backend','cors','sans-cors'].includes(d.cause), d.cause + ' : ' + d.message);
await o.navigateur.close();
console.log(ok + ' OK, ' + ko + ' KO'); process.exit(ko ? 1 : 0);
