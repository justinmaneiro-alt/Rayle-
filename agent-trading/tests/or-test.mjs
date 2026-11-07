/* Tests purs du tableau de bord de l'or (partie A) : node agent-trading/tests/or-test.mjs */
import assert from 'node:assert/strict';
import { decalage, tempsGraphique, tempsMonotones, marcheOr, seance, retard, heureParis } from '../front/or/temps-or.js';
import { depuisKraken, depuisBinance, fusionner, appliquerTransaction, regrouperBougies, atr, ecartMesure, mediane, biaisH1, atrA } from '../front/or/bougies-or.js';
import { niveauxCles, zonesVolume, decaler, fusionnerNiveaux, cleSemaine } from '../front/or/niveaux-or.js';
import { testsZone, bilanTests, wilson, holm, deuxProportions, etudeReaction, zonesRetournement, texteType, alea } from '../front/or/zones-or.js';
import { etatZone, evenementZone, creerAntiBruit } from '../front/or/etats-or.js';
import { lecture, phraseZone, phraseEvenement } from '../front/or/lecture-or.js';
import { interpreter, normaliser } from '../front/or/commandes-or.js';
import { ratio } from '../front/or/graphique-or.js';
import { REGLES, KRAKEN } from '../front/or/config-or.js';
import { actifsVisibles } from '../commun/actifs.js';
import { admettre, admettreEtat, cible, cors } from '../../relais-or/index.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

/* ── temps ── */
const ete = Date.UTC(2026, 6, 1, 12), hiver = Date.UTC(2026, 11, 1, 12);
eq(decalage(ete), 2 * 3600e3, 'Paris = UTC+2 en été'); eq(decalage(hiver), 3600e3, 'Paris = UTC+1 en hiver');
eq(heureParis(hiver), '13:00', 'heure de Paris'); eq(tempsGraphique(hiver), (hiver + 3600e3) / 1000, 'temps du graphique décalé');
// passage à l'heure d'hiver (25/10/2026, 03:00 CEST → 02:00 CET) : temps strictement croissants
const T = []; for (let t = Date.UTC(2026, 9, 24, 23); t < Date.UTC(2026, 9, 25, 3); t += 15 * 60e3) T.push(t);
const tm = tempsMonotones(T); ok(tm.every((x, i) => i === 0 || x > tm[i - 1]), 'temps monotones au changement d’heure');
ok(!marcheOr(Date.UTC(2026, 10, 7, 14)).ouvert, 'samedi : fermé'); ok(marcheOr(Date.UTC(2026, 10, 4, 14)).ouvert, 'mercredi 15 h Paris : ouvert');
ok(!marcheOr(Date.UTC(2026, 10, 4, 22, 30)).ouvert, 'pause 17-18 h New York'); ok(marcheOr(Date.UTC(2026, 10, 8, 23, 30)).ouvert, 'dimanche 18 h 30 New York : ouvert');
eq(seance(Date.UTC(2026, 10, 4, 6)), 'Asie'); eq(seance(Date.UTC(2026, 10, 4, 9)), 'Londres'); eq(seance(Date.UTC(2026, 10, 4, 15)), 'New York');
ok(retard(Date.now() - 10 * 60e3, Date.now(), true).enRetard, 'retard détecté'); ok(!retard(Date.now() - 10 * 60e3, Date.now(), false).enRetard, 'marché fermé : pas de retard');

/* ── bougies ── */
const K = depuisKraken({ candles: [{ time: 2000, open: '1', high: '3', low: '0.5', close: '2', volume: '4' }, { time: 1000, open: '1', high: '2', low: '1', close: '1.5', volume: '1' }] });
eq(K.map(b => b.t), [1000, 2000], 'Kraken trié'); eq(K[1].c, 2);
const B = depuisBinance([[1000, '1', '2', '0.5', '1.5', '10', 0, '15', 3, '7', '0', '0']]); eq(B[0].d, 4, 'delta = achats − ventes (7 − 3)');
eq(fusionner([{ t: 1, c: 1 }], [{ t: 1, c: 2 }, { t: 2, c: 3 }]).map(b => b.c), [2, 3], 'fusion');
const L = [{ t: 0, o: 10, h: 11, l: 9, c: 10, v: 1 }]; appliquerTransaction(L, 900e3, { t: 100e3, p: 12, q: 2 }); eq([L[0].h, L[0].c, L[0].v], [12, 12, 3], 'transaction dans la bougie');
appliquerTransaction(L, 900e3, { t: 950e3, p: 9, q: 1 }); eq(L.length, 2, 'nouvelle bougie'); eq(L[1].o, 12, 'ouverture = clôture précédente');
eq(regrouperBougies([{ t: 0, o: 1, h: 2, l: 0, c: 1, v: 1 }, { t: 900e3, o: 1, h: 5, l: 1, c: 4, v: 2 }], 3600e3)[0], { t: 0, o: 1, h: 5, l: 0, c: 4, v: 3, d: 0 });
const plat = Array.from({ length: 30 }, (_, i) => ({ t: i * 3600e3, o: 100, h: 101, l: 99, c: 100 })); ok(Math.abs(atr(plat, 14)[29] - 2) < 1e-9, 'ATR = 2');
eq(atrA(plat, atr(plat, 14), 20 * 3600e3), 2, 'ATR sans futur'); eq(atrA(plat, atr(plat, 14), 5 * 3600e3), null, 'pas d’ATR trop tôt');
eq(mediane([3, 1, 2]), 2); eq(mediane([4, 1, 2, 3]), 2.5);
eq(ecartMesure([1, 2, 3, 4, 5].map(t => ({ t, c: 105 })), [1, 2, 3, 4, 5].map(t => ({ t, c: 100 }))).ecart, 5, 'écart Kraken − Binance');
eq(biaisH1(Array.from({ length: 80 }, (_, i) => ({ c: 100 + i }))).biais, 'haussier'); eq(biaisH1(Array.from({ length: 80 }, (_, i) => ({ c: 200 - i }))).biais, 'baissier');

/* ── série synthétique (M15) : deux jours de lundi/mardi ── */
function serie(depart, n, f) { return Array.from({ length: n }, (_, i) => { const p = f(i); return { t: depart + i * 900e3, o: p, h: p + 0.5, l: p - 0.5, c: p, v: 10 + (i % 7), d: i % 2 ? 1 : -1 }; }); }
const lundi = Date.UTC(2026, 10, 2, 0) - 3600e3;   // lundi 00:00 Paris
const m15 = serie(lundi - 7 * 86400e3, 9 * 96, i => 4000 + 20 * Math.sin(i / 30));
const niv = niveauxCles(m15, lundi + 86400e3 + 10 * 3600e3, { prix: 4005 });
ok(niv.some(x => x.type === 'veille') && niv.some(x => x.type === 'semaine') && niv.some(x => x.type === 'seance') && niv.some(x => x.type === 'rond'), 'les 4 familles de niveaux');
ok(niv.filter(x => x.type === 'rond').every(x => x.p % 50 === 0), 'ronds de 50 $');
ok(niveauxCles(m15, lundi + 86400e3, { prix: 4005, ecart: 3 }).filter(x => x.type === 'rond').every(x => (x.p + 3) % 50 === 0), 'ronds en prix Kraken');
const avant = niveauxCles(m15, lundi + 86400e3 + 10 * 3600e3), triche = niveauxCles(m15.concat(serie(lundi + 86400e3 + 10 * 3600e3, 50, () => 9999)), lundi + 86400e3 + 10 * 3600e3);
eq(avant, triche, 'niveaux : aucune bougie future utilisée');
eq(cleSemaine(Date.UTC(2026, 10, 5, 12)), '2026-11-02', 'semaine du lundi');
const zv = zonesVolume(m15, lundi + 86400e3); ok(zv.length >= 1 && zv.length <= 4 && zv.every(z => z.haut > z.bas), 'zones de volume');
eq(decaler([{ p: 1, bas: 0, haut: 2 }], 5)[0], { p: 6, bas: 5, haut: 7 }, 'décalage');
eq(fusionnerNiveaux([{ p: 100, nom: 'A', court: 'a', type: 'veille' }, { p: 100.2, nom: 'B', court: 'b', type: 'rond' }], 0.5).length, 1, 'niveaux confondus fusionnés');

/* ── tests de zone : support qui tient puis support cassé ── */
const h1 = Array.from({ length: 40 }, (_, i) => ({ t: lundi - 40 * 3600e3 + i * 3600e3, o: 100, h: 101, l: 99, c: 100 })), aH1 = atr(h1, 14);   // ATR = 2
const z = { bas: 99.8, haut: 100.2 };
const prix1 = [103, 102, 101, 100.1, 101, 102, 103, 104, 103, 102, 101, 100.1, 99.4, 99.0];   // tient (monte ≥ 1), réarme, puis cassé (≤ 99,3)
const s1 = prix1.map((p, i) => ({ t: lundi + i * 900e3, o: p, h: p + 0.05, l: p - 0.05, c: p, v: 1 }));
const T1 = testsZone(s1, h1, aH1, z); eq(T1.map(x => x.issue), ['tenue', 'cassee'], 'tenue puis cassée'); eq(bilanTests(T1), { tests: 2, tenues: 1 });

/* ── statistiques ── */
const [a1, b1] = wilson(50, 100); ok(a1 > 0.39 && a1 < 0.41 && b1 > 0.59 && b1 < 0.61, 'Wilson 50/100');
eq(holm([0.01, 0.04, null]), [0.02, 0.04, null], 'Holm'); ok(deuxProportions(50, 100, 50, 100) > 0.99, 'même taux : p ≈ 1'); ok(deuxProportions(80, 100, 40, 100) < 0.001, 'écart net');
const r = alea(1); const x1 = r(), x2 = r(); ok(x1 !== x2 && x1 >= 0 && x1 < 1, 'aléa');
// étude sur marche au hasard : aucun type ne doit battre le hasard de façon nette (contrôle du protocole)
const rnd = alea(3); let p = 4000; const mh = Array.from({ length: 70 * 96 }, (_, i) => { const o = p; p += (rnd() - 0.5) * 3; return { t: lundi - 60 * 86400e3 + i * 900e3, o, h: Math.max(o, p) + rnd(), l: Math.min(o, p) - rnd(), c: p, v: 1 + rnd() * 10 }; });
const hh = regrouperBougies(mh, 3600e3), E = etudeReaction(mh, hh, atr(hh, 14), { tirages: 300 });
ok(E.jours > 40, 'étude : jours'); ok(Object.values(E.parType).every(t => t.pHolm == null || t.pHolm > 0.01), 'marche au hasard : rien de significatif');
ok(/pas assez de données|hasard/.test(texteType(E, 'semaine')), 'texte honnête');
eq(texteType({ parType: { rond: { tests: 5, tenues: 3, assez: false, hasard: { tests: 100 } } } }, 'rond'), 'pas assez de données (5 cas, il en faut 30)', 'moins de 30 cas');
const ZR = zonesRetournement({ niveaux: niv, volumes: zv, prix: 4005, a: 5, m15, h1: regrouperBougies(m15, 3600e3), atrH1: atr(regrouperBougies(m15, 3600e3), 14) });
ok(ZR.length >= REGLES.zonesMin && ZR.length <= REGLES.zonesMax, '3 à 5 zones'); ok(ZR.every((z, i) => i === 0 || z.score <= ZR[i - 1].score), 'classées par confluence');

/* ── états et événements ── */
eq(etatZone(100.3, z, 2), 'sur'); eq(etatZone(100.9, z, 2), 'approche'); eq(etatZone(102, z, 2), 'loin'); eq(etatZone(100, z, 2), 'sur');
const base = (ps, vol = 10, d = []) => ps.map((c, i) => ({ t: i * 900e3, o: c, h: c + 0.1, l: c - 0.1, c, v: i === ps.length - 1 ? vol : 10, d: d[i] ?? -1 }));
const avantR = Array.from({ length: 22 }, () => 103);
const rejet = base([...avantR, 102, 101, 100.1, 100.0, 100.8], 12, [...avantR.map(() => -1), -1, -1, -1, -1, 2]);
eq((evenementZone(rejet, z, 2) || {}).type, 'rejet', 'rejet sur support (volume ≥ médiane, delta retourné)');
const rejetSansDelta = base([...avantR, 102, 101, 100.1, 100.0, 100.8], 12, [...avantR.map(() => -1), -1, -1, -1, 1, 2]); eq(evenementZone(rejetSansDelta, z, 2), null, 'delta non retourné : pas de rejet');
const rejetFaible = base([...avantR, 102, 101, 100.1, 100.0, 100.8], 5, [...avantR.map(() => -1), -1, -1, -1, -1, 2]); eq(evenementZone(rejetFaible, z, 2), null, 'volume sous la médiane : pas de rejet');
const cassure = base([...avantR, 102, 101, 100.1, 100.0, 99.2], 15); eq((evenementZone(cassure, z, 2) || {}).type, 'cassure', 'cassure avec volume');
const A = creerAntiBruit(); ok(A.autoriser('z:rejet', 0, 12, 'j1').ok, '1er message'); ok(!A.autoriser('z:rejet', 30 * 60e3, 12, 'j1').ok, 'pas avant 60 min'); ok(A.autoriser('z:rejet', 61 * 60e3, 12, 'j1').ok, 'après 60 min');
ok(!A.autoriser('y:rejet', 0, 23, 'j1').ok, 'heures calmes'); A.couper(); ok(!A.autoriser('w', 0, 12, 'j1').ok, 'coupé');
const P = creerAntiBruit({ plafond: 2 }); P.autoriser('a', 0, 12, 'j'); P.autoriser('b', 0, 12, 'j'); eq(P.autoriser('c', 0, 12, 'j').raison, 'plafond du jour atteint');

/* ── lecture ── */
const zs = { id: 'z1', p: 4085, bas: 4084, haut: 4086, cote: 'support', noms: ['Veille bas'], vol: false, cles: ['veille'], tests: 6, tenues: 4, dist: 0 };
eq(phraseZone(zs, 'sur'), 'on est sur un support à 4 085 (plus bas de la veille), testé 6 fois, a tenu 4');
ok(/delta se retourne/.test(phraseEvenement({ type: 'rejet' }, zs)), 'phrase de rejet'); ok(/pas un signal/.test(phraseEvenement({ type: 'cassure', sens: 'baisse' }, zs)), 'jamais un signal');
const Lc = lecture({ prix: 4085.5, zones: [zs], biais: { biais: 'haussier' }, etats: { z1: 'sur' }, marche: { ouvert: true } });
ok(/Biais H1 haussier/.test(Lc.phrase) && !/achet|vend/i.test(Lc.phrase), 'lecture sans ordre');

/* ── commandes ── */
eq(interpreter('Rayle, on en est où ?').type, 'lecture'); eq(normaliser('Hey Raylé, lance ma playlist'), 'lance ma playlist');
for (const [t, c] of [['lance ma playlist', 'playlist'], ['mets ma musique', 'playlist'], ['joue le mix', 'mix'], ['garde ce morceau', 'garder'], ['retire ce morceau', 'retirer'], ['combien de morceaux dans ma playlist ?', 'combien'], ['quel est ce morceau ?', 'quoi'], ['pause', 'pause'], ['suivant', 'suivant'], ['morceau précédent', 'precedent'], ['monte le son', 'volume_plus'], ['baisse le volume', 'volume_moins'], ['coupe le son', 'muet'], ['mélange', 'melange'], ['arrête la musique', 'stop'], ['reprends', 'reprendre']]) eq(interpreter(t).cmd, c, t);
eq(interpreter('affiche l’or').vue, 'or'); eq(interpreter('montre la Terre').vue, 'terre'); eq(interpreter('bonjour').type, null);

/* ── outil position, actifs, relais ── */
eq(ratio({ entree: 100, stop: 98, objectif: 106 }).rr, 3); eq(ratio({ entree: 100, stop: 102, objectif: 96 }).sens, 'vente'); eq(ratio({ entree: 100, stop: 98, objectif: 99 }).coherent, false);
eq(actifsVisibles({ getItem: () => null }).map(a => a.id), ['OR'], 'l’or seul par défaut'); eq(actifsVisibles({ getItem: () => '1' }).length, 6, 'réglage : tous');
eq(KRAKEN.tailleContrat, 1, 'contrat = 1 once');
eq(admettre(JSON.stringify({ t: 'cmd', cmd: 'pause' })), { t: 'cmd', cmd: 'pause' }); eq(admettre(JSON.stringify({ t: 'cmd', cmd: 'rm -rf' })), null, 'commande hors liste');
eq(admettre(JSON.stringify({ t: 'cmd', cmd: 'volume_plus', v: 500 })), null); eq(admettre('x'.repeat(600)), null, 'trop long');
eq(admettreEtat(JSON.stringify({ t: 'etat', titre: 'a'.repeat(300), vue: 'or', secret: 1 })).titre.length, 120, 'titre tronqué, champ inconnu retiré');
eq(cible('https://r/kraken/bougies?res=15m&from=1790000000').url, 'https://futures.kraken.com/api/charts/v1/trade/PF_XAUUSD/15m?from=1790000000');
ok(cible('https://r/kraken/bougies?res=1m&from=1790000000').erreur, 'résolution hors liste'); eq(cible('https://r/autre'), null);
eq(cors('https://evil.example')['Access-Control-Allow-Origin'], 'https://justinmaneiro-alt.github.io', 'CORS liste blanche');
console.log(`or-test : ${n} vérifications OK`);
