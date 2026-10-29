// V8 : essai rapide avec faux Worker : captures de chaque écran. node tests-navigateur/v8-essai.mjs [telephone|tablette] [paysage] [dossier]
import fs from 'node:fs';
import { ouvrirMobile, attendre } from './v8-aide.mjs';
const cle = process.argv[2] || 'telephone', paysage = process.argv[3] === 'paysage', dos = process.argv[4] || 'docs/captures-v8/essai';
fs.mkdirSync(dos, { recursive: true });
const o = await ouvrirMobile(cle, { paysage, attente: 4500 });
const p = o.page, suf = cle + (paysage ? '-paysage' : '');
await p.screenshot({ path: `${dos}/accueil-${suf}.png` });
await p.evaluate(() => document.getElementById('m-ecrans').children[0].scrollTo(0, 560)); await attendre(500);
await p.screenshot({ path: `${dos}/accueil-bas-${suf}.png` });
for (const ecran of ['actus', 'agent', 'plus']) {
  await p.evaluate(e => MobileCoque.aller(e), ecran); await attendre(2500);
  await p.screenshot({ path: `${dos}/${ecran}-${suf}.png` });
}
await p.evaluate(() => MobileAgent.aller('performance')); await attendre(800); await p.screenshot({ path: `${dos}/agent-perf-${suf}.png` });
await p.evaluate(() => MobileAgent.aller('graphique')); await attendre(2500); await p.screenshot({ path: `${dos}/agent-graphe-${suf}.png` });
console.log('erreurs', o.erreurs.length, o.erreurs.slice(0, 6));
console.log('stats', JSON.stringify(o.stats));
await o.fermer();
