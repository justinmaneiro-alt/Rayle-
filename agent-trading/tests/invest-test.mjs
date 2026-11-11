/* Tests de l'espace Investissement (purs) : DCA (achat de base, tranche aux supports, espacement), XIRR, plafonds 8 % / 30 %, intérêts composés (3 scénarios), portefeuille, sceau SHA-256 de dca-v1, intégrité de screening.json (source et date partout, poids = 100, références présentes, grandes capitalisations exclues, score trié). */
import fs from 'node:fs'; import crypto from 'node:crypto';
import * as D from '../front/invest/dca-v1.js'; import * as C from '../front/invest/compose-v1.js'; import * as PF from '../front/invest/portefeuille-v1.js'; import { interpreterEspace } from '../front/espaces-voix.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const J = 86400e3, t0 = Date.UTC(2020, 0, 2);
const serie = (f, n = 400) => Array.from({ length: n }, (_, i) => { const c = f(i); return { t: t0 + i * J, o: c, h: c + 1, l: c - 1, c }; });
// DCA : prix constant = un achat par mois, aucune tranche
const plat = serie(() => 100, 400); const a = D.simuler(plat, { mensuel: 100, extra: true }); v(a.flux.filter(f => f.type === 'base').length >= 12 && a.investi === a.flux.length * 100 && D.simuler(plat, { mensuel: 100 }).tranches === 0, 'prix plat : un achat de base par mois ; un plus bas égal au support compte comme contact (documenté) ; sans la règle, aucune tranche');
// DCA : descente régulière = nouveaux plus bas tous les jours : tranches espacées d'au moins 30 jours
const bas = serie(i => 200 - i * 0.3, 400), b = D.simuler(bas, { mensuel: 100, extra: true }), tr = b.flux.filter(f => f.type === 'tranche'); v(tr.length > 3 && tr.every((f, k) => k === 0 || f.t - tr[k - 1].t >= 30 * J), `descente : ${tr.length} tranches, espacées de 30 jours au moins`);
v(D.simuler(bas, { mensuel: 100, extra: false }).tranches === 0, 'sans « supports » : jamais de tranche');
v(tr[0].t >= bas[120].t, 'aucune tranche avant 120 séances d\'historique (support défini sur les 120 séances précédentes)');
// la tranche exige un contact : montée régulière = jamais de nouveau plus bas
v(D.simuler(serie(i => 100 + i * 0.3, 400), { mensuel: 100, extra: true }).tranches === 0, 'marché qui monte : aucune tranche');
// valeur finale cohérente
const up = D.simuler(serie(i => 100 + i * 0.1), { mensuel: 100 }); v(Math.abs(up.valeur - up.parts * 139.9) < 1e-6 && up.investi > 1000, 'valeur = parts × dernier cours');
// XIRR : un versement de 1000 devenu 1100 un an plus tard = 10 %
const x = D.xirr([{ t: t0, montant: 1000 }], 1100, t0 + 365.25 * J); v(Math.abs(x - 0.1) < 1e-4, 'XIRR : 1000 → 1100 en un an = 10 % (' + x + ')'); v(D.xirr([{ t: t0, montant: 1000 }], 0, t0 + 365 * J) === null || D.xirr([{ t: t0, montant: 1000 }], 0, t0 + 365 * J) < -0.89, 'XIRR : perte totale = très négatif ou indéfini');
// plafonds : 10 candidats de secteurs différents, versement 1000 sur un portefeuille de 9000 → 8 % de 10 000 = 800 max par valeur
const cands = Array.from({ length: 10 }, (_, i) => ({ ticker: 'T' + i, secteur: 'S' + i })), al = D.allouer(1000, cands, [{ ticker: 'T0', secteur: 'S0', valeur: 700 }, { ticker: 'AUTRE', secteur: 'Z', valeur: 8300 }]);
const t0m = (al.achats.find(q => q.ticker === 'T0') || { montant: 0 }).montant; v(t0m <= 100.001 && al.achats.every(q => q.montant <= 800.001), `plafond de 8 % par valeur : T0 limité à ${t0m.toFixed(2)} (700 déjà détenus)`);
const memeSect = Array.from({ length: 6 }, (_, i) => ({ ticker: 'M' + i, secteur: 'Tech' })), al2 = D.allouer(1000, memeSect, []); v(al2.achats.reduce((s, q) => s + q.montant, 0) <= 300.001 && al2.reste >= 699.9, `plafond de 30 % par secteur : ${al2.achats.reduce((s, q) => s + q.montant, 0).toFixed(0)} placés, reste ${al2.reste.toFixed(0)}`);
// composés
const c = C.composer({ initial: 1000, mensuel: 100, annees: 10, rendement: 0.06 }); v(c.verse === 1000 + 12000 && c.valeur > c.verse && c.serie.length === 11, 'composés : total versé 13 000, valeur supérieure, série annuelle'); const c0 = C.composer({ initial: 0, mensuel: 100, annees: 10, rendement: 0 }); v(Math.abs(c0.valeur - 12000) < 1e-9, 'rendement 0 % : valeur = total versé');
const T3 = C.trois({ mensuel: 100, annees: 20 }); v(T3.length === 3 && T3[0].valeur < T3[1].valeur && T3[1].valeur < T3[2].valeur && T3.map(s => s.rendement).join() === '0.03,0.06,0.09', 'trois scénarios aux hypothèses visibles (3, 6, 9 %)');
// portefeuille
const ops = [{ type: 'achat', ticker: 'AAA', secteur: 'Tech', quantite: 10, prix: 100, date: '2026-01-05' }, { type: 'achat', ticker: 'AAA', secteur: 'Tech', quantite: 10, prix: 120, date: '2026-02-05' }, { type: 'dividende', ticker: 'AAA', montant: 15, date: '2026-03-01' }, { type: 'achat', ticker: 'BBB', secteur: 'Santé', quantite: 5, prix: 50, date: '2026-02-10' }];
const val = PF.valoriser(ops, { AAA: { prix: 130, date: '2026-11-10', source: 'saisie manuelle' } }); const pa = val.positions.find(p => p.ticker === 'AAA'); v(pa.quantite === 20 && pa.coutMoyen === 110 && Math.abs(pa.valeur - 2600) < 1e-9 && Math.abs(pa.performance - (2600 / 2200 - 1)) < 1e-9, 'coût moyen 110, valeur 2 600, performance mesurée');
v(val.sansPrix.join() === 'BBB' && val.positions.find(p => p.ticker === 'BBB').valeur === null, 'prix non renseigné : valeur null, jamais inventée'); v(val.dividendes === 15 && val.performanceAvecDividendes > val.performance, 'dividendes comptés à part');
const al3 = PF.alertes(val); v(al3.some(s => /AAA pèse/.test(s)), 'alerte de plafond (une seule valeur valorisée : 100 %)'); const vente = PF.valoriser([...ops, { type: 'vente', ticker: 'AAA', quantite: 10, prix: 140, date: '2026-06-01' }], {}); v(vente.positions.find(p => p.ticker === 'AAA').quantite === 10, 'vente : quantité réduite');
// phrases d'espace
v(interpreterEspace('ouvre l investissement') && interpreterEspace('ouvre le trading actif') && interpreterEspace('ouvre Rayle Capital') && interpreterEspace('plan DCA') && interpreterEspace('fiche de TotalEnergies') && !interpreterEspace('où est la golden zone') && !interpreterEspace('quelle heure est-il'), 'phrases d\'espace reconnues, les autres ignorées');
// sceau et données publiées
{ const f = new URL('../front/invest/dca-v1.js', import.meta.url), s = JSON.parse(fs.readFileSync(new URL('../front/invest/dca-v1.sceau.json', import.meta.url), 'utf8')); v(s.version === D.VERSION && s.sha256 === crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex'), 'sceau SHA-256 de dca-v1.js');
  const bt = JSON.parse(fs.readFileSync(new URL('../front/invest/dca-backtest.json', import.meta.url), 'utf8')); v(bt.sha256 === s.sha256 && bt.series.length === 5, 'backtest calculé avec la règle scellée actuelle (5 séries)');
  const sc = JSON.parse(fs.readFileSync(new URL('../front/invest/screening.json', import.meta.url), 'utf8')); v(Object.values(sc.poids).reduce((q, w) => q + w, 0) === 100, 'poids du score affichés, somme 100');
  v(sc.candidats.length >= 15 && sc.candidats.length <= 25 && sc.candidats.every((u, k) => k === 0 || u.score <= sc.candidats[k - 1].score), `${sc.candidats.length} candidats (15 à 25), triés par score`);
  v(sc.candidats.every(u => u.source && u.date && u.fiche && u.fiche.aMal.length && u.fiche.eligiblePEA), 'chaque candidat : source, date, fiche, risques, éligibilité PEA'); v(['TTE.PA', 'DSY.PA'].every(t => sc.references.some(u => u.ticker === t)), 'TotalEnergies et Dassault Systèmes présents comme références');
  v(!sc.candidats.some(u => sc.exclus.includes(u.ticker)) && sc.exclus.includes('NVDA') && sc.exclus.includes('MSFT') && sc.exclus.includes('AAPL'), 'très grandes capitalisations exclues (liste paramétrable)'); v(/pas un conseil financier/.test(sc.avertissement), 'avertissement « pas un conseil financier »'); v(sc.candidats.every(u => u.m.croissanceCA == null || Number.isFinite(u.m.croissanceCA)), 'aucune valeur non numérique : absent = null (« indisponible »)'); }
console.log(`invest : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
