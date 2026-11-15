/* Test pur : UN seul prix de l'or. Usage : node trader-pro/tests/prix-or-test.mjs */
import assert from 'node:assert/strict';
import { prixOrUnique, marcheOrOuvert } from '../commun/donnees.js';
let n = 0; const ok = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const SAM = Date.UTC(2026, 10, 14, 12), LUN = Date.UTC(2026, 10, 16, 10), VEN = Date.UTC(2026, 10, 13, 12);
ok(marcheOrOuvert(SAM), false, 'samedi fermé'); ok(marcheOrOuvert(LUN), true, 'lundi ouvert'); ok(marcheOrOuvert(Date.UTC(2026, 10, 13, 23)), false, 'vendredi 23 h UTC fermé'); ok(marcheOrOuvert(Date.UTC(2026, 10, 15, 23)), true, 'dimanche 23 h UTC ouvert');
let gardee = null; const garde = { lireGarde: () => gardee, garder: v => { gardee = { prix: v.prix, t: v.t, pct: v.pct, source: v.source }; } };
const spot = { prix: 3886, t: VEN + 9 * 3600e3, pct: 0.4, source: 'Twelve Data' }, kraken = { last: '3852.92', lastTime: new Date(SAM).toISOString() };
/* week-end : le comptant répond → dernier cours de clôture, mention « fermé » ; il est gardé */
let r = await prixOrUnique({ lireSpot: async () => spot, lireTicker: async () => kraken, maintenant: SAM, ...garde });
ok(r.prix, 3886, 'le comptant est la référence'); ok(r.ferme, true); ok(/fermé/.test(r.note), true, 'mention « marché fermé »'); ok(gardee.prix, 3886, 'dernier cours gardé');
/* le comptant ne répond plus : on garde le dernier cours reçu, JAMAIS le chiffre du perpétuel Kraken */
r = await prixOrUnique({ lireSpot: async () => { throw new Error('hors ligne'); }, lireTicker: async () => kraken, maintenant: SAM + 3600e3, ...garde });
ok(r.prix, 3886, 'week-end, direct muet : dernier cours reçu'); ok(/Dernier cours reçu/.test(r.note), true); ok(r.reference, true);
/* semaine : un cours gardé de plus de 20 min n'est plus un prix d'actualité → repli étiqueté sur Kraken */
r = await prixOrUnique({ lireSpot: async () => { throw new Error('x'); }, lireTicker: async () => ({ last: '3890.5', lastTime: new Date(LUN).toISOString() }), maintenant: LUN, ...garde });
ok(r.prix, 3890.5, 'semaine, cours gardé périmé : repli Kraken'); ok(r.reference, false); ok(/Kraken/.test(r.source), true);
/* semaine : un cours gardé récent suffit */
gardee = { prix: 3895, t: LUN - 5 * 60e3, pct: 0.1, source: 'XAU/USD au comptant' };
r = await prixOrUnique({ lireSpot: async () => { throw new Error('x'); }, lireTicker: async () => kraken, maintenant: LUN, ...garde });
ok(r.prix, 3895, 'cours récent gardé'); ok(r.ferme, false);
/* rien du tout */
gardee = null; r = await prixOrUnique({ lireSpot: async () => { throw new Error('x'); }, maintenant: LUN, ...garde }); ok(r, null, 'aucune source : null, rien d’inventé');
console.log(`prix-or-test : ${n} vérifications, tout passe`);
