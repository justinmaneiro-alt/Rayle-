/* Tests purs de « Mon plan » : zone d'achat, plafonds de diversification, DCA, rééquilibrage, corrélations. node trader-pro/tests/plan-test.mjs */
import { zoneAchat, contactTechnique, bandeAchat, pairesCorrelees, portefeuilleCible, repartitionDca, ecartsCible, phrasePlan, REGLES_DEFAUT, poidsDepart } from '../invest/plan.js';
import { LIBELLES } from '../invest/modele.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const somme = o => Object.values(o).reduce((a, x) => a + x, 0), proche = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
/* ───── zone d'achat ───── */
const ligne = (extra = {}, f = { val: 90, qua: 90, mom: 90, gro: 90, ris: 90, iv: 90, moat: 90, bil: 90 }) => ({ id: 'X', n: 'X', c: 'action', f, comp: 1, r: { vs200w: 0.2, m1: 0.01 }, dma: 3, dsup: 4, ...extra });
let z = zoneAchat(ligne({ dsup: 0.3 }), 'moyen'); v(z.bon && z.enZone && z.ok && z.raisons[0] === 'support majeur Daily', 'verdict Attractif+ ET sur un support Daily : en zone d’achat (' + z.lib + ')');
z = zoneAchat(ligne({ dsup: 4 }), 'moyen'); v(z.bon && !z.enZone && !z.ok, 'Attractif mais loin des supports : pas en zone');
z = zoneAchat(ligne({ dsup: 0.3 }, { val: 10, qua: 10, mom: 10, gro: 10, ris: 10 }), 'moyen'); v(!z.bon && z.enZone && !z.ok, 'sur un support mais jugé peu attractif : pas en zone d’achat');
z = zoneAchat(ligne({ dma: -0.4 }), 'moyen'); v(z.ok && z.raisons.includes('MA200 Daily'), 'contact de la MA200 Daily');
z = zoneAchat(ligne({ r: { vs200w: 0.015, m1: 0.04 } }), 'moyen'); v(z.ok && z.raisons.includes('rebond sur la MA200 Weekly'), 'rebond sur la MA200 Weekly (0 à 3 % au-dessus, mois positif)');
z = zoneAchat(ligne({ r: { vs200w: 0.015, m1: -0.04 } }), 'moyen'); v(!z.ok, 'sous la MA200 Weekly ou mois négatif : pas un rebond confirmé');
v(contactTechnique({ dsup: null, dma: null, r: {} }).length === 0, 'données manquantes : aucune zone inventée');
/* bande exacte */
const B = Array.from({ length: 30 }, (_, i) => ({ c: 100 + (i === 29 ? 1 : 0) })); const W = Array.from({ length: 220 }, () => ({ c: 100 }));
let b = bandeAchat({ B, W: W.slice(0, 50), support: 100.5, ma200d: null, atr: 2 }); v(b && b.bas === 100.5 && b.haut === 101.5 && /support/.test(b.raison), 'bande : du support à 0,5 ATR au-dessus');
b = bandeAchat({ B, W, support: 80, ma200d: null, atr: 2 }); v(b && /MA200 Weekly/.test(b.raison) && b.bas === 100 && Math.abs(b.haut - 103) < 1e-9, 'bande : MA200 Weekly à 3 % au-dessus');
v(bandeAchat({ B, W: W.slice(0, 50), support: 80, ma200d: 50, atr: 2 }) === null && bandeAchat({ B: [], atr: 1 }) === null, 'pas de zone : rien');
/* ───── portefeuille cible ───── */
const lib = { T: LIBELLES.TRES, A: LIBELLES.ATTR, N: LIBELLES.NEUTRE, P: LIBELLES.PEU, E: LIBELLES.EVITER };
const secteurs = ['Tech', 'Santé', 'Énergie', 'Finance', 'Conso', 'Industrie', 'Matériaux', 'Services', 'Immobilier', 'Télécom'], pays = ['US', 'FR', 'DE', 'UK', 'JP', 'CH'];
const mk = (n, f = {}) => Array.from({ length: n }, (_, i) => ({ id: 'L' + i, n: 'Ligne ' + i, c: 'action', s: secteurs[i % secteurs.length], p: pays[i % pays.length], lib: lib.A, zone: false, ...f(i) }));
let L = mk(30, i => ({ zone: i < 5, lib: i % 7 === 0 ? lib.N : lib.A })), C = portefeuilleCible(L);
v(proche(somme(C.poids), 1, 1e-6) && C.nonAlloue < 1e-6, '30 lignes variées : 100 % alloués (' + somme(C.poids).toFixed(4) + ')');
v(Math.max(...Object.values(C.poids)) <= REGLES_DEFAUT.maxLigne + 1e-9, 'aucune ligne au-dessus de 10 % (max ' + (Math.max(...Object.values(C.poids)) * 100).toFixed(2) + ' %)');
const parSect = {}, parPays = {}; for (const l of L) { if (C.poids[l.id]) { parSect[l.s] = (parSect[l.s] || 0) + C.poids[l.id]; parPays[l.p] = (parPays[l.p] || 0) + C.poids[l.id]; } }
v(Math.max(...Object.values(parSect)) <= 0.25 + 1e-9 && Math.max(...Object.values(parPays)) <= 0.40 + 1e-9, 'secteurs ≤ 25 % et pays ≤ 40 %');
v(C.poids.L0 > C.poids.L10 || L[0].lib === lib.N, 'une ligne en zone d’achat pèse plus qu’une ligne seulement attractive');
const L2 = mk(30, i => ({ zone: i === 1, lib: lib.A })), C2 = portefeuilleCible(L2); v(C2.poids.L1 > C2.poids.L2 * 1.5, 'zone d’achat : poids de départ ×2 (3 contre 1,5) avant plafonds : ' + (C2.poids.L1 / C2.poids.L2).toFixed(2));
const L3 = mk(12, i => ({ lib: i < 3 ? lib.E : i < 5 ? lib.P : lib.A })), C3 = portefeuilleCible(L3); v(!('L0' in C3.poids) && !('L3' in C3.poids) && C3.exclus.length === 5, 'À éviter et Peu attractif : hors du plan (5 exclus)');
const L4 = mk(5, () => ({ lib: lib.A })), C4 = portefeuilleCible(L4); v(proche(somme(C4.poids), 0.5, 1e-6) && C4.avertissements.some(a => /au moins 10 lignes/.test(a)), '5 lignes : plafond de 10 % → 50 % alloués seulement, avertissement « au moins 10 lignes »');
const L5 = mk(15, i => ({ lib: lib.A, p: 'US', s: secteurs[i % 10] })), C5 = portefeuilleCible(L5); v(somme(C5.poids) <= 0.40 + 1e-6 && C5.avertissements.some(a => /seulement/.test(a)), '15 lignes toutes américaines : pays plafonné à 40 % → avertissement (' + (somme(C5.poids) * 100).toFixed(0) + ' % alloués)');
const L6 = mk(15, i => ({ lib: lib.A, c: 'ETF', cat: 'Actions Monde', p: 'US', s: null })), C6 = portefeuilleCible(L6); v(somme(C6.poids) > 0.99, 'ETF monde : exemptés du plafond par pays (aussi pas de secteur)');
const L7 = mk(30, i => ({ lib: lib.A, s: i < 20 ? 'Tech' : 'Santé' })), C7 = portefeuilleCible(L7); v(Math.max(...Object.values(C7.poids)) <= 0.1 + 1e-9 && somme(C7.poids) <= 0.5 + 1e-6, 'deux secteurs seulement : 25 % × 2 = 50 % alloués au plus');
v(Object.keys(portefeuilleCible([]).poids).length === 0 && portefeuilleCible([{ id: 'a', lib: lib.E }]).avertissements.length === 1, 'plan vide : avertissement');
const L8 = mk(12, i => ({ zone: i === 1, lib: lib.A })); v(portefeuilleCible(L8, { maxLigne: 0.2 }).poids.L1 > portefeuilleCible(L8).poids.L1 + 0.01, 'règles modifiables : plafond de ligne relevé à 20 %');
/* ───── DCA ───── */
const R = repartitionDca(C, 500); v(proche(R.reduce((s, x) => s + x.montant, 0), 500, 0.2) && R.length === Object.keys(C.poids).length && R[0].montant >= R[R.length - 1].montant, 'DCA sans portefeuille connu : 500 € × poids cibles, trié');
const detenu = { L0: 5000, L1: 100 }, R2 = repartitionDca(C, 300, detenu); v(proche(R2.reduce((s, x) => s + x.montant, 0), 300, 0.5) && !R2.some(x => x.id === 'L0' && x.montant > 5) && R2.find(x => x.id === 'L1').montant > 0, 'DCA avec portefeuille : la ligne déjà très au-dessus de sa cible ne reçoit presque rien, la sous-pondérée oui');
v(repartitionDca({ poids: {} }, 100).length === 0 && repartitionDca(C, 0).length === 0, 'montant nul ou plan vide : rien');
/* ───── rééquilibrage ───── */
const E = ecartsCible({ poids: { A: 0.5, B: 0.5 } }, { A: 800, B: 200 }); v(E[0].id === 'A' && proche(E[0].ecart, 0.3) && E[0].constat === 'au-dessus de la cible' && E[1].constat === 'sous la cible', 'écarts à la cible : A +30 points, B −30 points');
v(ecartsCible({ poids: { A: 1 } }, { Z: 100 }).some(x => x.id === 'Z' && x.cible === 0), 'ligne détenue hors plan : cible 0'); v(ecartsCible({ poids: { A: 1 } }, null).length === 0, 'sans import XTB : pas d’écart');
/* ───── corrélations ───── */
let g = 3; const al = () => { g = (g * 1664525 + 1013904223) % 4294967296; return g / 4294967296 - 0.5; };
const base = Array.from({ length: 120 }, () => al() * 0.04), cum = r => { let p = 100; return [100, ...r.map(x => (p *= Math.exp(x)))]; };
const S = { A: cum(base), B: cum(base.map(x => x * 1.1 + al() * 0.004)), C: cum(Array.from({ length: 120 }, () => al() * 0.04)) }, pc = pairesCorrelees(S);
v(pc.length === 1 && pc[0].a === 'A' && pc[0].b === 'B' && pc[0].r > 0.9, 'deux lignes corrélées (> 0,8) détectées, la troisième indépendante non : ' + JSON.stringify(pc.map(x => [x.a, x.b, +x.r.toFixed(2)])));
v(pairesCorrelees({ A: [1, 2, 3], B: [1, 2, 3] }).length === 0, 'séries trop courtes : pas de corrélation inventée');
/* phrase */
v(/DCA du mois : Ligne \d+ \d+ euros/.test(phrasePlan(C, R, Object.fromEntries(L.map(l => [l.id, l.n])))) && /Ce n’est pas un conseil/.test(phrasePlan(C, R)), 'phrase du plan');
v(poidsDepart({ lib: lib.T, zone: true }) === 3 && poidsDepart({ lib: lib.T, zone: false }) === 1.5 && poidsDepart({ lib: lib.N }) === 1 && poidsDepart({ lib: lib.E }) === 0, 'poids de départ 3 / 1,5 / 1 / 0');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
