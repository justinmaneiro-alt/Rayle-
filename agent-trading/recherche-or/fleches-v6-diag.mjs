/* Diagnostic « flèches v6 » : node agent-trading/recherche-or/fleches-v6-diag.mjs */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as V5 from '../front/or/fleches-simples-v5.js'; import * as V6 from '../front/or/fleches-simples-v6.js'; import { zonesDirect } from '../front/or/zones-direct.js';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3, dt = t => new Date(t).toISOString().slice(5, 16).replace('T', ' ');
export const serie13 = () => JSON.parse(fs.readFileSync(path.join(ici, 'donnees/kraken-xau-h1-13-nov.json'), 'utf8')).map(b => ({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const K = serie13(), now = K.at(-1).t + H, o = { maintenant: now, bougies: 1e5 };
  const r5 = V5.calculer(K, zonesDirect, o), r6 = V6.calculer(K, zonesDirect, o), r6s = V6.calculer(K, zonesDirect, { ...o, exception: false });
  const cle = f => f.id, ligne = f => `${dt(f.tCloture)} ${f.type === 'ma_cassure' ? 'MA200' : (f.niveauNom || '') + ' ' + Math.round(f.zoneBas) + '-' + Math.round(f.zoneHaut)} ${f.dir > 0 ? 'ACHAT' : 'VENTE'}${f.contre ? ' GRIS' : ''}${f.deuxiemeTouche ? ' 2eTOUCHE' : ''}`;
  console.log('v6 sans exception = v5 :', r5.fleches.map(cle).join() === r6s.fleches.map(cle).join(), r5.fleches.length, r6s.fleches.length);
  console.log('v5', r5.fleches.length, 'v6', r6.fleches.length, 'contacts', r6.contacts.length, 'dernière bougie', new Date(K.at(-1).t).toISOString());
  const s5 = new Set(r5.fleches.map(cle)); console.log('--- changements v5 → v6'); for (const f of r6.fleches) { const o5 = r5.fleches.find(x => x.id === f.id); if (!o5) console.log('NOUVELLE', ligne(f)); else if (!!o5.contre !== !!f.contre) console.log('GRIS→COULEUR', ligne(f)); }
  for (const f of r5.fleches) if (!r6.fleches.some(x => x.id === f.id)) console.log('DISPARUE', ligne(f));
  console.log('--- flèches 5-13 nov'); for (const f of r6.fleches.filter(f => f.tCloture >= Date.UTC(2026, 10, 5))) console.log(ligne(f));
  console.log('--- contacts 9-13 nov'); for (const k of r6.contacts.filter(k => k.tCloture >= Date.UTC(2026, 10, 9))) console.log(dt(k.tCloture), (k.dir > 0 ? 'sup ' : 'rés '), (k.niveauNom || ''), Math.round(k.zoneBas) + '-' + Math.round(k.zoneHaut), k.raison);
}
