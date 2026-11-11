// Mesure de chargement de l'accueil (poids, fichiers, temps). Usage : node outils-restructuration/mesure-chargement.mjs [etiquette]  (serveur : node serveur.mjs 8000)
import fs from 'node:fs';
import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const etiquette = process.argv[2] || 'mesure';
const sortie = {};
for (const cle of ['pc', 'tablette', 'telephone']) {
  const o = await ouvrirAppareil(cle, { attente: 3000 });
  const m = await o.page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), js: performance.getEntriesByType('resource').filter(r => /\.js(\?|$)/.test(r.name)).length }; });
  sortie[cle] = { fichiers: o.requetes.length, octets: o.octets.total, chargeMs: o.chargeMs, ...m, erreurs: o.erreurs.length };
  console.log(cle, JSON.stringify(sortie[cle]));
  await o.navigateur.close();
}
fs.writeFileSync(`outils-restructuration/mesure-${etiquette}.json`, JSON.stringify(sortie, null, 1));
