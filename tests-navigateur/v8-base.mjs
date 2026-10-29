// V8 B0 : captures de l'état actuel du téléphone (accueil, pile ouverte, carte, agent). node tests-navigateur/v8-base.mjs [dossier]
import fs from 'node:fs';
import { ouvrirAppareil, attendre } from './v7b-aide.mjs';
const dos = process.argv[2] || 'docs/captures-v8/avant';
fs.mkdirSync(dos, { recursive: true });
const o = await ouvrirAppareil('telephone', { attente: 4000 });
await o.page.screenshot({ path: dos + '/accueil.png' });
const boutons = await o.page.evaluate(() => Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent && b.getBoundingClientRect().width).map(b => (b.id || b.className || b.textContent).toString().slice(0, 30) + ' ' + Math.round(b.getBoundingClientRect().height)));
console.log(boutons.join('\n'));
console.log('erreurs', o.erreurs);
await o.navigateur.close();
