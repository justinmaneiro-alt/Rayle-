/* Diagnostic « flèches v8 » : node agent-trading/recherche-or/fleches-v8-diag.mjs */
import { serie13 } from './fleches-v6-diag.mjs';
import * as V6 from '../front/or/fleches-simples-v6.js'; import * as V7 from '../front/or/fleches-simples-v7.js'; import * as V8 from '../front/or/fleches-simples-v8.js'; import { zonesDirect } from '../front/or/zones-direct.js';
const H = 3600e3, dt = t => new Date(t).toISOString().slice(5, 16).replace('T', ' ');
const K = serie13(), now = K.at(-1).t + H, o = { maintenant: now, bougies: 1e5 };
const ligne = f => `${dt(f.tCloture)} ${f.type === 'ma_cassure' ? 'MA200' : f.type === 'rebond_base' ? 'BASE' : (f.niveauNom || '') + ' ' + Math.round(f.zoneBas) + '-' + Math.round(f.zoneHaut)} ${f.dir > 0 ? 'ACHAT' : 'VENTE'}${f.contre ? ' GRIS' : ''}${f.invalidee ? ' INVALIDÉE' : ''}${f.deuxiemeTouche ? ' 2eT' : ''}${f.confirmation ? ' [' + f.confirmation + ']' : ''}`;
const t0 = Date.now(); const r8 = V8.calculer(K, zonesDirect, o); console.log('durée', Date.now() - t0, 'ms');
const r7 = V7.calculer(K, zonesDirect, o), r6 = V6.calculer(K, zonesDirect, o);
console.log('v6', r6.fleches.length, 'v7', r7.fleches.length, 'v8', r8.fleches.length, 'colorées v8', r8.fleches.filter(f => !f.contre && !f.invalidee).length, 'retirées', JSON.stringify(r8.retirees), 'alertes', r8.alertes.length, 'boîtes', r8.boites.length);
for (const f of r8.fleches) console.log(ligne(f));
console.log('--- alertes'); for (const a of r8.alertes.slice(-8)) console.log(dt(a.tCloture), a.niveauNom, Math.round(a.zoneBas), Math.round(a.zoneHaut), a.cote);
console.log('--- boîtes'); for (const b of r8.boites) console.log(dt(b.t0), b.dir > 0 ? 'A' : 'V', b.etat, b.libelle);
console.log('--- zones lisibles', V8.zonesLisibles(r8.zones, K.at(-1).c).map(z => z.etiquette + ' ' + z.plage + ' ' + (z.niveauNom || '')).join(' | '));
