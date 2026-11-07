/* Tests des repères affichés sur le graphique de l'or (fusion à 0,3 ATR, sélection, libellés clairs, séance) : node agent-trading/tests/reperes-test.mjs */
import assert from 'node:assert/strict';
import { reperes, grouper, choisirEtiquettes, ronds, veilleMarche, seanceAffichee, texteBord, nomClair, PRIORITE } from '../front/or/reperes-or.js';
import { marcheOr } from '../front/or/temps-or.js';
let n = 0; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; }, ok = (c, m) => { assert.ok(c, m); n++; };
const it = (p, type, extra = {}) => ({ p, type, couche: 'sr', nom: `n${p}`, etiquette: `Niveau ${p}`, priorite: PRIORITE[type], ...extra });

// fusion : voisins à moins de 0,3 ATR (ATR 10 → 3 $) → un seul libellé
const G = grouper([it(4064, 'veille'), it(4066, 'rond50'), it(4068.5, 'seance'), it(4071, 'semaine'), it(4090, 'rond100')], 3);
eq(G.length, 2, 'quatre niveaux voisins fusionnés, le cinquième à part');
eq(G[0].texte, 'Zone 4 064–4 071 : 4 niveaux', 'libellé de zone fusionnée'); eq(G[0].detail.length, 4, 'le détail garde chaque niveau');
eq(G[1].texte, 'Niveau 4090', 'niveau rond seul : son libellé porte déjà le prix (pas « 4 100 4 100 »)');
eq(grouper([it(4120.4, 'veille', { etiquette: 'Plus haut de la veille' })], 3)[0].texte, 'Plus haut de la veille 4 120', 'niveau seul : libellé + prix');
eq(grouper([it(4030.1, 'veille'), it(4030.3, 'semaine')], 3)[0].texte, 'Zone 4 030 : 2 niveaux', 'bornes égales à l’arrondi : un seul prix (pas « 4 030–4 030 »)');
const Gr = grouper([it(4077, 'retournement', { couche: 'retournement', etiquette: 'Résistance 4 077 · testée 13 fois, a tenu 5', historique: 'testée 13 fois, a tenu 5', cote: 'Résistance', nom: 'Résistance 4 077' })], 3);
eq(Gr[0].texte, 'Résistance 4 077 · testée 13 fois, a tenu 5', 'zone de retournement : « testée 13 fois, a tenu 5 », pas « Z1 5/13 »');
ok(grouper([it(1, 'veille'), it(3, 'veille'), it(5, 'veille'), it(7, 'veille'), it(9, 'veille')], 2.5, 5).length >= 2, 'une zone fusionnée ne s’étire pas sans fin');

// sélection : jamais plus de 8 étiquettes, un repère par bord pour ce qui sort de la vue
const beaucoup = Array.from({ length: 30 }, (_, i) => it(4000 + i * 10, i % 2 ? 'rond50' : 'veille'));
const C = choisirEtiquettes(grouper(beaucoup, 1), p => 4200 - p, 150, { prix: 4100 });
ok(C.dedans.length + C.bords.length <= 8, `au plus 8 étiquettes (${C.dedans.length} + ${C.bords.length} au bord)`);
eq(C.bords.map(b => b.bord).sort(), ['bas', 'haut'], 'un repère en haut, un en bas');
ok(C.dedans.every((g, i, L) => !i || L[i - 1].priorite >= g.priorite), 'les plus importantes d’abord');
ok(/^▲ .* · \+\d/.test(texteBord(C.bords.find(b => b.bord === 'haut'), 4100)), 'repère du haut : direction et distance');
eq(choisirEtiquettes(grouper(beaucoup, 1), p => 4200 - p, 150, { max: 5 }).dedans.length <= 3, true, 'téléphone : 5 au plus');

// ronds de 50 et 100 $ proches du prix
const R = ronds(4073); eq(R.map(r => r.p).sort((a, b) => a - b), [4000, 4050, 4100, 4150], 'ronds proches : 4 000, 4 050, 4 100, 4 150');
eq(R.find(r => r.p === 4100).type, 'rond100'); eq(R.find(r => r.p === 4050).type, 'rond50');

// bougies M15 synthétiques (heure de Paris) du lundi 2 au samedi 7 novembre 2026
const m15 = []; for (let t = Date.UTC(2026, 10, 2, 0); t < Date.UTC(2026, 10, 7, 18); t += 15 * 60e3) { const p = 4000 + ((t / 9e5) % 40); m15.push({ t, o: p, h: p + 2, l: p - 2, c: p, v: 1 }); }
const samedi = Date.UTC(2026, 10, 7, 17, 0), mardi = Date.UTC(2026, 10, 3, 10, 0);   // samedi 18 h et mardi 11 h, heure de Paris
eq(veilleMarche(m15, samedi).jour, '2026-11-06', 'samedi : la veille est vendredi (journée de marché complète)');
eq(marcheOr(samedi).ouvert, false);
const sF = seanceAffichee(m15, samedi, false); ok(sF && !sF.enCours && sF.nom === 'New York' && sF.jour === 'vendredi', 'marché fermé : pas de séance en cours, la dernière séance complète (New York, vendredi)');
const sO = seanceAffichee(m15.filter(b => b.t <= mardi), mardi, true); ok(sO && sO.enCours && sO.nom === 'Londres', 'marché ouvert : extrêmes de la séance en cours (Londres)');

// libellés clairs, sans abréviation cryptique
const L = reperes({ niveaux: [{ p: 4120, type: 'semaine', nom: 'Semaine haut' }, { p: 3990, type: 'semaine', nom: 'Semaine bas' }], zonesVol: [{ p: 4040, bas: 4035, haut: 4045, force: 1, part: 0.2 }, { p: 4010, bas: 4005, haut: 4015, force: 0.4 }, { p: 4060, bas: 4058, haut: 4062, force: 0.8 }, { p: 4090, bas: 4088, haut: 4092, force: 0.1 }], retournement: [{ id: 'z1', p: 4077, bas: 4075, haut: 4079, cote: 'resistance', tests: 13, tenues: 5, noms: ['Veille haut', 'Rond 4100'] }], prix: 4073, m15, marche: marcheOr(samedi), t: samedi });
eq(L.filter(x => x.type === 'volume').length, 3, 'au plus 3 zones de volume');
ok(L.some(x => x.etiquette === 'Plus haut de la veille') && L.some(x => x.etiquette === 'Plus haut de la semaine dernière'), 'veille et semaine en toutes lettres');
ok(!L.some(x => /séance .*en cours/.test(x.etiquette)), 'week-end : aucun extrême de séance « en cours »');
ok(L.some(x => /dernière séance de New York \(vendredi\)/.test(x.etiquette)), 'week-end : dernière séance complète');
ok(L.every(x => !/\b(V\.|S\.|NY\.|Asi\.|Lon\.|Vol\.)|\bZ\d/.test(x.etiquette)), 'aucune abréviation (V., S., NY., Asi., Vol., Z1)');
ok(L.find(x => x.type === 'retournement').etiquette.includes('testée 13 fois, a tenu 5'));
eq(nomClair('Londres haut'), 'plus haut de la séance de Londres'); eq(nomClair('Rond 4100'), 'niveau rond 4 100');
console.log(`reperes-test : ${n} vérifications OK`);
