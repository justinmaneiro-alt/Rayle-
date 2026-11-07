/* Tests purs du journal de trades et du gardien de drawdown (partie B) : node agent-trading/tests/journal-test.mjs */
import assert from 'node:assert/strict';
import { valider, rNet, plNet, risqueDollars, enrichir, stats, bilan, compareHasard, reglesCandidates, lectureJour, importerCsv, depuisXtbJson, fusionnerTrades, mfeR, trancheDuree, ETIQUETTE_XTB } from '../front/or/journal-calcul.js';
import { etatGardien, taillePosition, DEFAUTS } from '../front/or/gardien-calcul.js';
import { regrouperBougies, atr } from '../front/or/bougies-or.js';
import { alea } from '../front/or/zones-or.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const pres = (a, b, e = 1e-9) => Math.abs(a - b) < e;

/* R net */
const t = { sens: 'achat', entree: 4000, stop: 3990, objectif: 4030, taille: 2, sortie: 4020, frais: 4, source: 'saisie', etiquette: 'balayage' };
eq(risqueDollars(t), 20); eq(plNet(t), 36); ok(pres(rNet(t), 1.8), 'R net = (40 − 4) / 20');
ok(pres(rNet({ ...t, sens: 'vente', stop: 4010, sortie: 3980 }), 1.8), 'vente symétrique');
eq(rNet({ ...t, stop: null }), null, 'sans stop : R inconnu');
eq(valider({ ...t, stop: 4005 }), ['stop du mauvais côté']); eq(valider({ ...t, etiquette: '' }), ['étiquette de setup']); eq(valider(t), []);
const x = { source: 'xtb', devise: 'EUR', sens: 'achat', entree: 100, stop: 98, sortie: 103, pl: 999, taille: 100 }; ok(pres(rNet(x), 1.5), 'XTB en euros : R sur les prix, jamais en mélangeant les devises');
eq(trancheDuree(30), '15 min – 1 h'); eq(trancheDuree(null), 'inconnue');
eq(stats([1, 2, 3]).moyenne, 2); ok(stats([1, 2, 3]).ic[0] < 2 && stats([1, 2, 3]).ic[1] > 2, 'intervalle');

/* enrichissement sans futur */
const rnd = alea(5); let p = 4000; const t0 = Date.UTC(2026, 9, 1);
const m15 = Array.from({ length: 30 * 96 }, (_, i) => { const o = p; p += (rnd() - 0.5) * 4; return { t: t0 + i * 900e3, o, h: Math.max(o, p) + rnd(), l: Math.min(o, p) - rnd(), c: p, v: 1 + rnd() * 9, d: rnd() - 0.5 }; });
const h1 = regrouperBougies(m15, 3600e3), a = atr(h1, 14), tE = t0 + 20 * 86400e3 + 3600e3;
const tr = { ...t, tEntree: tE, entree: m15.find(b => b.t >= tE).o };
const e1 = enrichir(tr, m15, h1, a), futur = m15.map(b => (b.t >= tE ? { ...b, h: b.h + 500, l: b.l - 500, c: b.c + 300 } : b));
eq(enrichir(tr, futur, regrouperBougies(futur, 3600e3), atr(regrouperBougies(futur, 3600e3), 14)), e1, 'enrichissement : changer le futur ne change rien');
ok(['Asie', 'Londres', 'New York', 'soir'].includes(e1.seance) && e1.distZoneVolume != null && e1.distNiveauCle != null && e1.tendanceH1 && e1.volatilite, 'enrichissement complet');

/* bilans et « pas assez de données » */
const mk = (i, r, et = 'balayage', mois = 9) => ({ id: 'x' + i + et + mois, source: 'saisie', etiquette: et, sens: 'achat', entree: 100, stop: 99, taille: 1, sortie: 100 + r, frais: 0, tEntree: Date.UTC(2026, mois, 1 + (i % 27), 8 + (i % 10)), tSortie: Date.UTC(2026, mois, 1 + (i % 27), 9 + (i % 10)) });
const peu = Array.from({ length: 10 }, (_, i) => mk(i, i % 2 ? 1 : -1));
const B = bilan(peu, 'etiquette'); eq(B[0].n, 10); eq(B[0].assez, false, 'moins de 20 : pas assez');
ok(bilan(Array.from({ length: 25 }, (_, i) => mk(i, 1)), 'etiquette')[0].assez, '25 trades : assez');

/* règles candidates : choix avant le dernier mois complet, confirmation sur ce mois */
const maint = Date.UTC(2026, 11, 15);
const bon = [...Array.from({ length: 40 }, (_, i) => mk(i, i % 4 === 0 ? -1 : 2, 'balayage', 9)), ...Array.from({ length: 12 }, (_, i) => mk(i + 100, i % 4 === 0 ? -1 : 2, 'balayage', 10))];
eq(reglesCandidates(bon, { maintenant: maint })[0].statut, 'à garder', 'positive sur ≥ 30 et confirmée le mois suivant');
const nonConf = [...Array.from({ length: 40 }, (_, i) => mk(i, i % 4 === 0 ? -1 : 2, 'balayage', 9)), ...Array.from({ length: 12 }, (_, i) => mk(i + 100, -1, 'balayage', 10))];
eq(reglesCandidates(nonConf, { maintenant: maint })[0].statut, 'à abandonner', 'non confirmée');
eq(reglesCandidates(peu.map(x => ({ ...x, tSortie: Date.UTC(2026, 9, 3) })), { maintenant: maint })[0].statut, 'à surveiller', 'moins de 30');
const perd = Array.from({ length: 40 }, (_, i) => mk(i, -1, 'cassure de range', 9)).concat(Array.from({ length: 12 }, (_, i) => mk(i + 50, 1, 'cassure de range', 10)));
eq(reglesCandidates(perd, { maintenant: maint })[0].statut, 'à abandonner', 'négative');
ok(reglesCandidates([...bon, ...Array.from({ length: 60 }, (_, i) => ({ ...mk(i + 300, 2, 'x', 9), source: 'xtb', etiquette: ETIQUETTE_XTB }))], { maintenant: maint }).every(r => r.etiquette !== ETIQUETTE_XTB), 'historique XTB exclu des étiquettes');

/* comparaison au hasard */
eq(compareHasard(peu, m15).assez, false);
const surM15 = Array.from({ length: 25 }, (_, i) => { const tE2 = t0 + (5 + i) * 86400e3, e = m15.find(b => b.t >= tE2).o; return { id: 'h' + i, source: 'saisie', etiquette: 'autre', sens: 'achat', entree: e, stop: e - 5, taille: 1, sortie: e + 2, frais: 0, tEntree: tE2, tSortie: tE2 + 3 * 3600e3 }; });
const H = compareHasard(surM15, m15, { tirages: 100 }); ok(H.assez && H.p >= 0 && H.p <= 1 && /hasard/.test(H.texte), 'comparaison au hasard');

/* journal du jour, MFE */
const jour = Date.UTC(2026, 10, 4, 9);
const J = lectureJour([{ ...t, id: 'a', tEntree: jour, tSortie: jour + 3600e3 }, { ...t, id: 'b', etiquette: 'hors plan', sortie: 3990, tEntree: jour + 7200e3, tSortie: jour + 9000e3 }], '2026-11-04');
ok(/2 trades/.test(J.phrases[0]) && J.phrases.some(p => /hors plan/.test(p)), 'lecture du jour factuelle');
const bk = [{ t: jour, o: 4000, h: 4025, l: 3998, c: 4010 }]; ok(pres(mfeR({ ...t, tEntree: jour, tSortie: jour + 3600e3 }, bk), 2.5), 'meilleur latent = +2,5 R');

/* imports */
const csvX = 'Instrument;Ticker;Type;Volume;Open Time (UTC);Open Price;Close Time (UTC);Close Price;Stop Loss;Take Profit;Profit/Loss;Commission;Swap;Position ID\nGOLD;GOLD;BUY;0,05;2026-11-03 09:00:00;4000,5;2026-11-03 10:00:00;4010,5;3995;4020;42,1;-1;0;123\nUS100;US100;SELL;1;2026-11-03 09:00:00;20000;2026-11-03 10:00:00;19990;;;10;0;0;124';
const I = importerCsv(csvX); eq(I.format, 'XTB'); eq(I.trades.length, 1, 'or seulement'); eq(I.ignores, 1); eq(I.trades[0].taille, 5, '0,05 lot = 5 onces'); eq(I.trades[0].entree, 4000.5); eq(I.trades[0].tEntree, Date.UTC(2026, 10, 3, 9));
const csvK = 'fill_id,symbol,side,size,price,fillTime,fee\nf1,PF_XAUUSD,buy,0.5,4001.2,2026-11-03T09:00:00.000Z,0.4\nf2,PF_XBTUSD,sell,1,90000,2026-11-03T09:00:00.000Z,1';
const K = importerCsv(csvK); eq(K.format, 'Kraken'); eq(K.trades.length, 1); eq(K.trades[0].taille, 0.5);
const X = depuisXtbJson({ trades: [{ instrument: 'GOLD', sens: -1, volume: 0.1, ouverture: 4000, tOuv: 1, fermeture: 3990, tFerm: 2, pl: 90, stop: 4010, tp: null, commission: -1, swap: 0, id: 7 }, { instrument: 'US100', sens: 1, volume: 1, ouverture: 1, tOuv: 1, fermeture: 2, tFerm: 2, pl: 1, id: 8 }] });
eq(X.length, 1); eq(X[0].etiquette, ETIQUETTE_XTB); eq(X[0].taille, 10); ok(pres(rNet(X[0]), 1), 'vente XTB : +1 R');
eq(fusionnerTrades([{ id: 'a', tEntree: 1 }], [{ id: 'a', tEntree: 1 }, { id: 'b', tEntree: 2 }]).ajoutes, 1, 'sans doublon');

/* gardien */
const G0 = etatGardien([], {}); eq(G0.statut, 'ok'); eq(G0.actuel, 10000); eq(DEFAUTS.limiteJour, 3); eq(DEFAUTS.limiteTotale, 6);
const now = Date.UTC(2026, 10, 4, 15), perte = (pl, h, id) => ({ id, source: 'saisie', pl, tSortie: Date.UTC(2026, 10, 4, h), tEntree: Date.UTC(2026, 10, 4, h - 1) });
eq(etatGardien([perte(-160, 10, 'a')], { maintenant: now }).statut, 'attention', '1,6 % : alerte');
eq(etatGardien([perte(-260, 10, 'a')], { maintenant: now }).statut, 'stop', '2,6 % : stop pour aujourd’hui');
eq(etatGardien([perte(-20, 10, 'a'), perte(-30, 11, 'b')], { maintenant: now }).statut, 'stop', '2 pertes de suite : stop');
eq(etatGardien([perte(-20, 10, 'a'), { ...perte(10, 11, 'b') }, perte(-30, 12, 'c')], { maintenant: now }).pertesDeSuite, 1, 'série coupée par un gain');
const hier = (pl, id) => ({ id, source: 'saisie', pl, tSortie: Date.UTC(2026, 10, 2, 10) });
const G3 = etatGardien([hier(-320, 'h')], { maintenant: now }); eq(G3.statut, 'attention'); ok(G3.alertes.some(a => /palier 3 %/.test(a.texte)), 'alerte 3 % totale');
ok(etatGardien([hier(-520, 'h')], { maintenant: now }).alertes.some(a => /palier 5 %/.test(a.texte)), 'alerte 5 % totale');
eq(etatGardien([hier(-610, 'h')], { maintenant: now }).statut, 'limite', 'limite totale 6 %');
eq(etatGardien([], { maintenant: now, latent: -260, reglages: { base: 'equite' } }).statut, 'stop', 'équité : le latent compte');
eq(etatGardien([], { maintenant: now, latent: -300, reglages: { base: 'solde' } }).statut, 'ok', 'solde : le latent ne compte pas');
ok(pres(etatGardien([hier(500, 'h')], { maintenant: now }).avancement, 0.5), 'avancement vers +10 %');
eq(etatGardien([{ ...hier(-900, 'x'), source: 'xtb', devise: 'EUR' }], { maintenant: now }).statut, 'ok', 'historique XTB (autre compte, euros) non compté');

/* taille */
const T1 = taillePosition({ equite: 10000, risquePct: 0.5, entree: 4000, stop: 3990 }); eq(T1.contrats, 5, '50 $ / 10 $ = 5 contrats'); eq(T1.risque$, 50);
eq(taillePosition({ equite: 10000, risquePct: 0.5, entree: 4000, stop: 3993 }).contrats, 7.142, 'arrondi vers le bas au pas de 0,001');
eq(taillePosition({ equite: 10000, risquePct: 0.5, entree: 4000, stop: 4000 }).ok, false);
console.log(`journal-test : ${n} vérifications OK`);
