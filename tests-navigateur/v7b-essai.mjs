// Essai rapide : ouvre Rayle dans un appareil émulé, affiche le mode, les fichiers de Galaxie demandés, le poids, les erreurs, et prend une capture. node tests-navigateur/v7b-essai.mjs telephone [paysage]
import fs from 'node:fs';
import { ouvrirAppareil, galaxieChargee, ko, attendre } from './v7b-aide.mjs';
const cle = process.argv[2] || 'telephone', paysage = process.argv[3] === 'paysage';
fs.mkdirSync('docs/captures-v7b', { recursive: true });
const o = await ouvrirAppareil(cle, { paysage });
const info = await o.page.evaluate(() => ({ mode: window.RayleAppareil && RayleAppareil.mode(), raison: window.RayleAppareil && RayleAppareil.raison(), classes: document.body.className, theme: localStorage.getItem('rayle_theme'), g1: !!window.G1, vue: RayleBus.demander('vue'), w: innerWidth, h: innerHeight, scrollW: document.documentElement.scrollWidth }));
console.log(JSON.stringify(info));
console.log('chargement', o.chargeMs, 'ms ·', o.requetes.length, 'fichiers ·', ko(o.octets.total), '· galaxie lourde:', galaxieChargee(o.requetes).map(r => r.url).join(', ') || 'aucune', '· erreurs:', o.erreurs.length, o.erreurs.slice(0, 3));
await o.page.screenshot({ path: 'docs/captures-v7b/essai-' + cle + (paysage ? '-paysage' : '') + '.png' });
await o.navigateur.close();
