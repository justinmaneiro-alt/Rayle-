/* Tests de l'Investissement v2 : modèle par horizon, garde-fous, saisonnalité, DCF, backtest, alertes, voix, sources. node trader-pro/tests/invest-v2-test.mjs
   Les chiffres sont INVENTÉS pour le test (sauf le profil « piège à valeur » inspiré de Charter, relevé le 2026-11-19 : Altman 0,68, dette nette 4,4 × l'EBITDA, −33 % sur 12 mois). */
import { normaliserSecteur, estFinanciere } from '../invest/secteurs.js';
import { matriceMensuelle, rendementFenetre, statsFenetre, meilleuresFenetres, encoder, decoder, fenetreDefaut, libelleFenetre } from '../invest/saison.js';
import { mesuresPrix, setupTactique, dragueMax } from '../invest/technique.js';
import { dcf2, dcfInverse, wacc, HYP2 } from '../invest/analyse-v2.js';
import { percentilesNeutres, calculerFacteurs, scoreHorizon, verdictLigne, piegeAValeur, libelleDe, pourquoi, LIBELLES, POIDS } from '../invest/modele.js';
import { calculerListe, passeFiltres, PREREGLAGES } from '../invest/calcul-liste.js';
import { backtest, enSerie, SIGNAUX, ajustement } from '../../outils-donnees/invest/backtest.mjs';
import { detecterAlertes } from '../invest/alertes.js';
import { intentionInvest, repondreInvest, parserFenetre } from '../invest/voix-invest.js';
import { lireChart, lireSeriesAnnuelles, lireRecherche, lireFred, lirePPP } from '../invest/sources2.js';
import { trouverInstrument } from '../invest/donnees-invest.js';
import { zonePays } from '../invest/pays.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } }; const proche = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const J = 86400e3, T0 = Date.UTC(2026, 10, 19);

console.log('— secteurs, pays —');
v(normaliserSecteur('Consumer Cyclical') === 'Conso. cyclique' && normaliserSecteur('Financial Services') === 'Finance' && normaliserSecteur('Information Technology') === 'Technologie' && normaliserSecteur('Health Care') === 'Santé' && normaliserSecteur('Basic Materials') === 'Matériaux' && normaliserSecteur('Utilities') === 'Services publics' && normaliserSecteur('Consumer Staples') === 'Conso. de base' && normaliserSecteur('Communication Services') === 'Communication' && normaliserSecteur('Énergie') === 'Énergie' && normaliserSecteur('') === null, 'vocabulaire des secteurs');
v(estFinanciere('Finance', null) && estFinanciere('X', 'Banks—Regional') && !estFinanciere('Technologie', 'Software'), 'financières reconnues');
v(zonePays('US') === 'US' && zonePays('FR') === 'Europe' && zonePays('UK') === 'Europe' && zonePays('JP') === 'Autres', 'zones États-Unis / Europe / Autres');

console.log('— saisonnalité —');
const serieMensuelle = (an0, an1, f) => { const S = []; let c = 100; for (let y = an0; y <= an1; y++) for (let m = 0; m < 12; m++) { c *= 1 + f(y, m); S.push([Date.UTC(y, m, 1), c]); } return S; };
const M1 = matriceMensuelle(serieMensuelle(2005, 2026, (y, m) => (m >= 7 && m <= 11 ? 0.02 : -0.002)), T0);
v(Object.keys(M1).length >= 21, 'matrice : une entrée par année');
v(!M1[2026] || M1[2026][10] == null, 'le mois en cours (novembre 2026) n’est jamais compté');
const s1 = statsFenetre(M1, 8, 12);
v(s1.significatif && s1.n >= 20 && proche(s1.median, Math.pow(1.02, 5) - 1, 1e-9) && s1.pctPositif === 1, `fenêtre août→décembre : médiane ${s1.median}, ${s1.n} ans, tout positif`);
v(statsFenetre(M1, 1, 3).median < 0 && statsFenetre(M1, 1, 3).pctPositif === 0, 'fenêtre janvier→mars négative');
const s2 = statsFenetre(M1, 11, 2); v(s2.n >= 19 && fin(s2.median), 'fenêtre qui enjambe le nouvel an (nov → févr.)');
function fin(x) { return typeof x === 'number' && Number.isFinite(x); }
const M2 = matriceMensuelle(serieMensuelle(2020, 2026, () => 0.01), T0); v(!statsFenetre(M2, 3, 5).significatif, 'moins de 10 ans : non significatif');
const best = meilleuresFenetres(M1, null, 3); v(best.length === 3 && best[0].median > 0 && best.every(b => b.pctPositif >= 0.7), 'meilleures fenêtres : positives au moins 70 % des années');
const rt = decoder(encoder(M1)); v(Object.keys(rt).length === Object.keys(M1).length && proche(rendementFenetre(rt, 2010, 8, 12), rendementFenetre(M1, 2010, 8, 12), 0.002), 'encodage compact : aller-retour');
v(fenetreDefaut(Date.UTC(2026, 7, 15)).a === 9 && fenetreDefaut(Date.UTC(2026, 11, 1)).a === 1 && libelleFenetre(8, 12) === 'août → déc.', 'fenêtre par défaut et libellé');
const Mb = matriceMensuelle(serieMensuelle(2005, 2026, () => 0.005), T0), sx = statsFenetre(M1, 8, 12, Mb); v(sx.excesMedian > 0 && sx.nExces >= 20, 'rendement en excès contre l’indice');

console.log('— prix : momentum, MA200, risque, setup —');
const bougies = (n, f, v0 = 100) => { const B = []; let c = v0; for (let i = 0; i < n; i++) { c = f(i, c); B.push({ t: T0 - (n - i) * J, o: c * 0.995, h: c * 1.01, l: c * 0.99, c, v: 1e6 }); } return B; };
const hausse = bougies(1600, (i, c) => c * 1.0004), baisse = bougies(1600, (i, c) => c * 0.9996), indice = bougies(1600, (i, c) => c * 1.0002);
const mh = mesuresPrix(hausse, indice, { maintenant: T0 }), mb = mesuresPrix(baisse, indice, { maintenant: T0 });
v(mh.m12_1 > 0.08 && mh.vs200d > 0 && mh.vs200w > 0 && mh.rsIdx > 0 && mh.vol < 0.05, 'tendance haussière : momentum, MA200 Daily et Weekly, force relative');
v(mb.m12_1 < 0 && mb.vs200d < 0 && mb.mdd3 < -0.2 && mh.mdd3 === 0, 'tendance baissière : momentum négatif, drawdown 3 ans');
v(mesuresPrix(bougies(30, (i, c) => c)) === null, 'moins de 60 bougies : null');
v(proche(dragueMax([100, 120, 90, 110]), -0.25), 'drawdown maximum');
const st = setupTactique(hausse, { maintenant: T0 }); v(st && st.score >= 60 && st.tend === 1 && st.why.length, 'setup tactique en tendance haussière');
const sb = setupTactique(baisse, { maintenant: T0 }); v(sb && sb.score <= 40 && sb.tend === -1, 'setup tactique en tendance baissière');

console.log('— DCF à deux étapes, DCF inversé, WACC —');
const v1 = dcf2(100, 0.05, 0.02, 0.09, 200, 100, 10), v2 = dcf2(100, 0.10, 0.02, 0.09, 200, 100, 10), v3 = dcf2(100, 0.05, 0.02, 0.11, 200, 100, 10);
v(v1 > 0 && v2 > v1 && v3 < v1, 'DCF : croît avec la croissance, décroît avec le taux');
v(dcf2(100, 0.05, 0.1, 0.09, 0, 0, 10) === null && dcf2(-5, 0.05, 0.02, 0.09, 0, 0, 10) === null, 'DCF impossible : taux ≤ croissance terminale, flux négatif');
const inv = dcfInverse(100, 0.02, 0.09, 200, 100, 10, v2); v(inv && proche(inv.g, 0.10, 1e-4), `DCF inversé retrouve la croissance de 10 % (${inv && inv.g})`);
v(dcfInverse(100, 0.02, 0.09, 200, 100, 10, 1e9).hors === 'haut' && dcfInverse(100, 0.02, 0.09, 200, 100, 10, 0.01).hors === 'bas', 'DCF inversé : prix hors plage signalé');
v(wacc('Services publics', 'FR') < wacc('Technologie', 'US') && wacc('Technologie', 'PL') > wacc('Technologie', 'CH') && wacc('Technologie', 'US', 0.9) <= HYP2.waccMax && wacc('Santé', 'CH') >= HYP2.waccMin, 'WACC par secteur et pays, borné');

console.log('— percentiles neutres secteur × zone —');
const L = []; for (let i = 0; i < 30; i++) L.push({ id: 'T' + i, s: 'Technologie', z: 'US', r: { roic: i } }); for (let i = 0; i < 30; i++) L.push({ id: 'B' + i, s: 'Finance', z: 'Europe', r: { roic: 100 + i } }); L.push({ id: 'X', s: 'Rare', z: 'US', r: { roic: 15 } }); L.push({ id: 'N', s: 'Technologie', z: 'US', r: {} });
const P = percentilesNeutres(L, l => l.r.roic, l => l.s, l => l.z), pT = P[29], pB0 = P[30];
v(pT > 95 && pB0 < 5, 'un titre est comparé à son secteur et sa zone (la banque la plus faible reste la plus faible des banques)');
v(P[60] != null && Math.abs(P[60] - 50) < 25 && P[61] === null, 'petit groupe : repli sur la zone ; valeur absente : null');
const Lx = []; for (let i = 0; i < 50; i++) Lx.push({ id: 'W' + i, s: 'A', z: 'US', r: { m: i === 49 ? 1e9 : i } }); const Px = percentilesNeutres(Lx, l => l.r.m, l => l.s, l => l.z); v(Px[49] < 100 && Px[49] > 95 && Px[48] > 90, 'valeur extrême écrêtée (winsorisation)');
v(percentilesNeutres(L, l => l.r.roic, l => l.s, l => l.z, -1)[0] > 95, 'sens négatif : plus bas = mieux');
const LF = [...Array(40)].map((_, i) => ({ id: 'F' + i, s: 'A', z: 'US', c: 'action', r: { earnY: i / 100, roic: i, m12_1: i }, f: {} })); calculerFacteurs(LF); v(LF[39].f.val > 90 && LF[0].f.val < 10 && LF[39].f.qua > 90 && LF[39].f.mom > 90, 'facteurs = moyenne des percentiles de leurs mesures');

console.log('— libellés, pondérations, confiance —');
v(libelleDe(80) === LIBELLES.TRES && libelleDe(60) === LIBELLES.ATTR && libelleDe(50) === LIBELLES.NEUTRE && libelleDe(30) === LIBELLES.PEU && libelleDe(10) === LIBELLES.EVITER && libelleDe(null) === LIBELLES.ND, 'seuils des libellés');
const somme = o => Object.values(o).reduce((a, b) => a + b, 0);
v(somme(POIDS.action.tactique) === 100 && somme(POIDS.action.swing) === 100 && somme(POIDS.action.moyen) === 100 && somme(POIDS.action.long) === 100, 'les pondérations de chaque horizon font 100');
v(POIDS.action.tactique.mc === 40 && POIDS.action.tactique.set === 30 && POIDS.action.tactique.ris === 15 && POIDS.action.tactique.evt === 15 && POIDS.action.swing.mom === 35 && POIDS.action.swing.sai === 25 && POIDS.action.moyen.val === 35 && POIDS.action.moyen.qua === 25 && POIDS.action.long.iv === 35 && POIDS.action.long.moat === 35, 'pondérations du cahier des charges');
const fa = { val: 80, qua: 60, mom: 40, gro: 50, ris: 70, iv: 90, moat: 55, bil: 65, mc: 30, set: 20, evt: 100 }, h1 = scoreHorizon(fa, 'action', 'moyen');
v(proche(h1.score, (80 * 35 + 60 * 25 + 40 * 20 + 50 * 10 + 70 * 10) / 100, 1e-9) && h1.couverture === 1, 'score composite = moyenne pondérée');
const h2 = scoreHorizon({ val: 80, qua: 60 }, 'action', 'moyen'); v(h2.couverture < 0.7 && h2.manquants.includes('mom'), 'facteurs manquants : poids renormalisés, couverture réduite');
const h3 = scoreHorizon(fa, 'action', 'swing', { ajust: { mom: 0.5 } }); v(h3.contributions.find(c => c.k === 'mom').poids === 35 && h3.score !== scoreHorizon(fa, 'action', 'swing').score, 'ajustement des poids par le backtest');

console.log('— garde-fous —');
const CHTR = { id: 'CHTR.US', c: 'action', f: { val: 90, qua: 31, mom: 4, gro: 62, ris: 38, bil: 5, moat: 7, mc: 76, iv: 96, set: 30, evt: 100 }, r: { z: 0.68, nde: 4.36, m12: -0.33, mos: 0.71, financiere: false }, comp: 1 };
v(piegeAValeur(CHTR.r) && piegeAValeur(CHTR.r).length === 2, 'CHTR : zone de détresse ET dette > 4 × EBITDA avec recul de 12 mois');
for (const h of ['swing', 'moyen', 'long']) { const x = verdictLigne({ ...CHTR, f: { ...CHTR.f, val: 99, iv: 99, qua: 99, moat: 99, bil: 99, mom: 99, gro: 99, ris: 99 } }, h); v(x.lib === LIBELLES.NEUTRE && x.plafonne && x.badges.some(b => b.id === 'piege'), `CHTR : même avec de très bons facteurs, plafonné à « Neutre » + badge piège (${h} → ${x.lib})`); }
v(verdictLigne(CHTR, 'tactique').badges.every(b => b.id !== 'piege'), 'tactique : le piège à valeur ne s’applique pas (pas de valorisation)');
v(piegeAValeur({ z: 3, nde: 2, m12: -0.5 }) === null && piegeAValeur({ z: 3, nde: 5, m12: -0.1 }) === null && piegeAValeur({ z: 1, financiere: true }) === null && piegeAValeur({ nde: 5, m12: -0.3, z: 2.5 }) && piegeAValeur({ nde: 5, m12: -0.3 }).length === 1, 'piège : déclencheurs exacts, financières exclues');
v(verdictLigne({ ...CHTR, comp: 0.5, r: {} }, 'moyen').lib === LIBELLES.ND && verdictLigne({ ...CHTR, comp: 0.5, r: {} }, 'moyen').score === null, 'complétude < 60 % : « données insuffisantes », aucun verdict');
v(verdictLigne({ ...CHTR, r: { mos: 5 }, hyp: 1, comp: 1 }, 'long').badges.some(b => b.id === 'hypothese') && !verdictLigne({ ...CHTR, r: {}, hyp: 1, comp: 1 }, 'tactique').badges.some(b => b.id === 'hypothese'), 'valeur > 4 × prix : badge « hypothèse à vérifier » sur les horizons de valorisation');
v(verdictLigne({ ...CHTR, r: {}, fon: 1, comp: 1 }, 'moyen').badges.some(b => b.id === 'fonciere') && verdictLigne({ ...CHTR, r: {}, fon: 1, comp: 1 }, 'moyen').conf < verdictLigne({ ...CHTR, r: {}, comp: 1 }, 'moyen').conf, 'foncière : badge et confiance basse');
v(verdictLigne({ ...CHTR, r: {}, evt: 4, comp: 1 }, 'tactique').badges.some(b => b.id === 'resultats') && !verdictLigne({ ...CHTR, r: {}, evt: 30, comp: 1 }, 'tactique').badges.some(b => b.id === 'resultats'), 'résultats dans les 10 jours : avertissement visible');
v(verdictLigne({ ...CHTR, r: {}, disp: 0.9, comp: 1 }, 'moyen').conf < verdictLigne({ ...CHTR, r: {}, disp: 0, comp: 1 }, 'moyen').conf, 'dispersion entre méthodes : confiance réduite');
const why = pourquoi({ ...CHTR, r: { per: 3.7, fcfY: 0.12, m12_1: -0.47, vs200d: -0.15, nde: 4.4, z: 0.68, roic: 0.09, pk: 6 } }, verdictLigne(CHTR, 'moyen')); v(why.length >= 3 && why.length <= 4 && why.every(x => /\.$/.test(x)) && why.some(x => /piège/.test(x)), 'pourquoi : trois points issus des chiffres + piège');
const sai = verdictLigne({ ...CHTR, f: { mom: 50, gro: 50, qua: 50, val: 50 }, r: {}, comp: 1 }, 'swing', { saison: { score: 95 } }).score, sai0 = verdictLigne({ ...CHTR, f: { mom: 50, gro: 50, qua: 50, val: 50 }, r: {}, comp: 1 }, 'swing').score; v(sai > sai0, 'la saisonnalité de la fenêtre alimente le score swing');

console.log('— liste : filtres, tri, préréglages —');
const jeu = [...Array(60)].map((_, i) => ({ id: 'A' + i + '.FR', y: 'A' + i + '.PA', n: 'Société ' + i, c: 'action', p: i % 2 ? 'FR' : 'DE', z: 'Europe', s: i % 3 ? 'Santé' : 'Finance', sc: ['petite', 'moyenne', 'grande', 'méga'][i % 4], cap: 1000 * (i + 1), pea: i % 2 ? 1 : 0, da: i % 5 ? 'CFD (réel probable)' : 'réel (probable)', pal: 'A', liqM: i, comp: 1, f: { val: i + 20, qua: i + 20, mom: i + 20, gro: 50, ris: 50, iv: i + 20, moat: 50, bil: 50, mc: 50, set: 50 }, r: { dy: i / 500, mos: i / 100 - 0.2, vol: 0.2 } }));
let R = calculerListe(jeu, { horizon: 'moyen', filtres: { classe: 'action' }, tri: 'score', sens: -1 });
v(R.total === 60 && R.verdicts[R.ordre[0]].score >= R.verdicts[R.ordre[59]].score && Object.values(R.comptes).reduce((a, b) => a + b, 0) === 60, 'tri par score décroissant, comptes par verdict');
R = calculerListe(jeu, { filtres: { classe: 'action', exclureMega: true, pea: true } }); v(R.ordre.every(i => jeu[i].sc !== 'méga' && jeu[i].pea), 'filtres : hors méga-caps + PEA');
R = calculerListe(jeu, { filtres: { dispo: 'reel' } }); v(R.total === 60 && calculerListe(jeu, { filtres: { dispo: 'cfd' } }).total === 48, 'filtre réel / CFD (« CFD (réel probable) » compte dans les deux)');
R = calculerListe(jeu, { filtres: { texte: 'société 7' } }); v(R.ordre.map(i => jeu[i].id).includes('A7.FR') && R.total <= 12, 'recherche par nom');
R = calculerListe(jeu, { filtres: { liqMin: 50 } }); v(R.total === 10, 'liquidité minimale');
R = calculerListe(jeu, { filtres: { caps: ['petite', 'moyenne'] } }); v(R.ordre.every(i => ['petite', 'moyenne'].includes(jeu[i].sc)), 'filtre capitalisation');
R = calculerListe(jeu, { tri: 'n', sens: 1 }); v(jeu[R.ordre[0]].n === 'Société 0', 'tri par nom croissant');
R = calculerListe(jeu, { verdict: LIBELLES.NEUTRE }); v(R.ordre.every(i => R.verdicts[i].lib === LIBELLES.NEUTRE), 'filtre par tuile de verdict');
v(Object.keys(PREREGLAGES).length === 5 && PREREGLAGES.pepites.filtres.exclureMega && PREREGLAGES.pea.filtres.pea && PREREGLAGES.saisonMois.horizon === 'swing', 'cinq préréglages');
const enc = {}; jeu.forEach((l, i) => { enc[l.id] = encoder(matriceMensuelle(serieMensuelle(2005, 2026, (y, m) => (m >= 7 ? 0.003 * (i % 10) : -0.002)), T0)); });
R = calculerListe(jeu, { horizon: 'swing', fenetre: { a: 8, b: 12 }, encodes: enc, filtres: { saisonSignificative: true }, tri: 'sai' }); v(R.total === 60 && R.saison[R.ordre[0]].median >= R.saison[R.ordre[59]].median && Number.isFinite(R.saison[0].score), 'swing : saisonnalité de la fenêtre calculée pour chaque ligne');
R = calculerListe(jeu, { horizon: 'swing', fenetre: { a: 8, b: 12 }, encodes: {} }); v(R.saison.every(s => s === null), 'sans données saisonnières : non significatif, pas de plantage');

console.log('— backtest —');
const series = new Map(); for (let k = 0; k < 150; k++) { const M = {}; for (let y = 2005; y <= 2025; y++) { M[y] = []; for (let m = 0; m < 12; m++) M[y][m] = 0.01 * ((k % 10) - 4.5) / 4.5 + 0.002 * Math.sin(k * 7 + y * 3 + m); } series.set('S' + k, enSerie(M)); }
const bt = backtest(series, (S, i) => (S.r[i - 1] != null ? S.r[i - 1] : null)); v(bt.ok && bt.spreadMensuel > 0.005 && bt.tstat > 3, `backtest d’un facteur persistant : écart haut-bas positif et significatif (t = ${bt.tstat && bt.tstat.toFixed(1)})`);
const bt2 = backtest(series, (S, i) => Math.sin(i * 12.9898) * 43758); v(!bt2.ok || Math.abs(bt2.tstat) < 3, 'backtest d’un bruit : pas de signal significatif');
v(ajustement({ ok: true, tstat: 2 }) === 1 && ajustement({ ok: true, tstat: 0.4 }) === 0.5 && ajustement({ ok: true, tstat: -2 }) === 0.25 && ajustement(null) === 1, 'ajustement des poids selon le t-stat');
v(backtest(new Map([['a', enSerie({ 2020: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1] })]]), SIGNAUX.momentum).ok === false, 'historique insuffisant : non calculé');

console.log('— alertes de la liste —');
const ligneA = { id: 'X.FR', n: 'Xylo', c: 'action', f: { val: 40, qua: 40, mom: 40, gro: 40, ris: 40 }, r: {}, comp: 1 }, ligneB = { ...ligneA, f: { val: 95, qua: 95, mom: 95, gro: 95, ris: 95 } };
let a1 = detecterAlertes(['X.FR'], [ligneA], {}, { horizon: 'moyen', maintenant: T0 }); v(a1.alertes.length === 0 && a1.etat['X.FR'].lib.moyen, 'première lecture : aucune alerte, état mémorisé');
a1 = detecterAlertes(['X.FR'], [ligneB], a1.etat, { horizon: 'moyen', maintenant: T0 }); v(a1.alertes.length === 1 && a1.alertes[0].type === 'attractif' && /Xylo/.test(a1.alertes[0].texte), 'passage à Attractif / Très attractif : alerte');
a1 = detecterAlertes(['X.FR'], [ligneB], a1.etat, { horizon: 'moyen', maintenant: T0 }); v(a1.alertes.length === 0, 'pas d’alerte répétée');
let a2 = detecterAlertes(['X.FR'], [{ ...ligneA, dma: 0.3 }], {}, { maintenant: T0 }); v(a2.alertes.some(x => x.type === 'ma200'), 'prix sur la MA200 Daily');
v(detecterAlertes(['X.FR'], [{ ...ligneA, dma: 0.3 }], a2.etat, { maintenant: T0 }).alertes.length === 0, 'MA200 : une seule alerte par jour');
v(detecterAlertes(['X.FR'], [{ ...ligneA, dsup: 0.2 }], {}, { maintenant: T0 }).alertes.some(x => x.type === 'support'), 'support majeur Daily');
const mNum = new Date(T0).getUTCMonth() + 1; const a3 = detecterAlertes(['X.FR'], [ligneA], {}, { maintenant: T0, fenetres: { 'X.FR': { a: mNum, b: mNum + 3, median: 0.06, pctPositif: 0.85, n: 15 } } }); v(a3.alertes.some(x => x.type === 'fenetre' && /85 %/.test(x.texte)), 'ouverture d’une fenêtre saisonnière favorable');

console.log('— voix de Rayle —');
v(parserFenetre('d aout a decembre') && parserFenetre('d aout a decembre').a === 8 && parserFenetre('d aout a decembre').b === 12 && parserFenetre('de novembre a fevrier').b === 2 && parserFenetre('en mai').a === 5 && parserFenetre('bonjour') === null, 'fenêtre dictée');
let I = intentionInvest('Rayle, montre-moi les actions européennes attractives sur 1 à 3 ans hors méga-caps');
v(I && I.type === 'liste' && I.spec.horizon === 'moyen' && I.spec.filtre.classe === 'action' && I.spec.filtre.zone === 'Europe' && I.spec.filtre.exclureMega === true && I.spec.attractifs === true && I.spec.filtre.scoreMin === 58, 'phrase 1 : actions européennes attractives, 1–3 ans, hors méga-caps : ' + JSON.stringify(I));
I = intentionInvest('quelle est la saisonnalité de LVMH d’août à décembre ?'); v(I && I.type === 'saison' && /lvmh/.test(I.nom) && I.fenetre && I.fenetre.a === 8 && I.fenetre.b === 12, 'phrase 2 : saisonnalité de LVMH d’août à décembre : ' + JSON.stringify(I));
I = intentionInvest('pourquoi Airbus est neutre ?'); v(I && I.type === 'pourquoi' && /airbus/.test(I.nom), 'phrase 3 : pourquoi Airbus est neutre : ' + JSON.stringify(I));
I = intentionInvest('montre-moi les ETF à éviter sur 5 à 10 ans'); v(I && I.spec.filtre.classe === 'ETF' && I.spec.horizon === 'long' && I.spec.verdict === LIBELLES.EVITER, 'ETF à éviter, long terme');
for (const t of ['quelle heure est-il', 'où en est mon portefeuille', 'ouvre les marchés', 'quel temps fait-il', 'pourquoi le ciel est bleu', 'quels signaux H4 aujourd’hui']) v(intentionInvest(t) === null, `« ${t} » n’est pas une demande d’investissement`);
const lignesV = [{ id: 'MC.FR', y: 'MC.PA', n: 'LVMH Moët Hennessy - Louis Vuitton, Société Européenne', c: 'action', p: 'FR', pal: 'A', vx: 1, cap: 190000, f: { val: 81, qua: 50, mom: 6, gro: 28, ris: 33, bil: 55, moat: 42, iv: 83 }, r: { per: 17.9, fcfY: 0.07, mos: 0.27, roic: 0.13, pk: 7, nde: 0.9, m12_1: -0.37 }, comp: 1 }, { id: 'AIR.FR', y: 'AIR.PA', n: 'Airbus SE', c: 'action', p: 'FR', pal: 'A', vx: 1, cap: 150000, f: { val: 50, qua: 52, mom: 50, gro: 50, ris: 50, bil: 50, moat: 50, iv: 50 }, r: { per: 28, m12_1: 0.1 }, comp: 1 }, { id: 'AIR.DE', y: 'AIR.DE', n: 'Airbus SE', c: 'action', p: 'DE', pal: 'A', vx: 1, cap: 150000, f: {}, r: {}, comp: 1 }];
const enc2 = { 'MC.FR': encoder(matriceMensuelle(serieMensuelle(2005, 2026, (y, m) => (m >= 7 && m <= 11 ? 0.012 : -0.001)), T0)) };
const API = { piloter: async s => ({ total: 123, premiers: [{ nom: 'Schneider Electric SE', lib: 'Attractif', score: 66 }, { nom: 'Sanofi', lib: 'Très attractif', score: 74 }] }), lignes: async () => lignesV, saison: async () => ({ encodes: enc2, ref: {} }), horizon: () => 'moyen', ajust: async () => ({}) };
let r1 = await repondreInvest('montre-moi les actions européennes attractives sur 1 à 3 ans hors méga-caps', API); v(/J’affiche 123 actions/.test(r1) && /1 à 3 ans/.test(r1) && /Schneider Electric/.test(r1) && /pas un conseil/.test(r1), 'réponse 1 : ' + r1);
r1 = await repondreInvest('quelle est la saisonnalité de LVMH d’août à décembre', API, { maintenant: T0 }); v(/LVMH/.test(r1) && /Sur \d+ ans/.test(r1) && /d’août à décembre/.test(r1) && /pour cent/.test(r1) && /ne prédit pas l’avenir/.test(r1), 'réponse 2 : ' + r1);
r1 = await repondreInvest('pourquoi Airbus est neutre', API); v(/Airbus est (neutre|peu attractif|attractif)/.test(r1) && /confiance/.test(r1) && /pas un conseil/.test(r1), 'réponse 3 : ' + r1);
r1 = await repondreInvest('pourquoi Zorglub est neutre', API); v(/Je ne trouve pas/.test(r1), 'instrument inconnu : le dit');
r1 = await repondreInvest('quelle est la saisonnalité de Airbus d’août à décembre', API); v(/Je n’ai pas l’historique|n’est pas significative/.test(r1), 'sans historique : ne l’invente pas : ' + r1);
r1 = await repondreInvest('pourquoi Airbus est neutre', { ...API, lignes: async () => { throw new Error('réseau'); } }); v(/Je n’ai pas pu lire/.test(r1), 'panne : message clair');
v(trouverInstrument(lignesV, 'Airbus').id === 'AIR.FR' && trouverInstrument(lignesV, 'lvmh').id === 'MC.FR' && trouverInstrument(lignesV, 'MC.FR').id === 'MC.FR' && trouverInstrument(lignesV, 'zzz') === null, 'recherche d’instrument (le plus gros et le mieux coté d’abord)');

console.log('— lecture des sources —');
const ch = lireChart({ chart: { result: [{ meta: { currency: 'GBp', regularMarketPrice: 1280, regularMarketTime: 1700000000, instrumentType: 'EQUITY', longName: 'HSBC' }, timestamp: [1, 2, 3], indicators: { quote: [{ open: [1000, 1100, 1200], high: [1100, 1200, 1300], low: [900, 1000, 1100], close: [1050, 1150, 1250], volume: [10, 20, 30] }], adjclose: [{ adjclose: [1000, 1100, 1200] }] }, events: { dividends: { a: { date: 2, amount: 50 } }, splits: { b: { date: 3, numerator: 2, denominator: 1 } } } }] } });
v(ch.devise === 'GBP' && ch.k === 0.01 && proche(ch.prix, 12.8) && proche(ch.bougies[2].c, 12.5) && proche(ch.ajuste[2][1], 12) && proche(ch.dividendes[0].v, 0.5) && ch.splits[0].num === 2, 'chart Yahoo : pence converties en livres, dividendes, splits, clôture ajustée');
let err = null; try { lireChart({ chart: { result: null } }); } catch (e) { err = e; } v(!!err, 'chart vide : erreur explicite');
const ts = lireSeriesAnnuelles({ timeseries: { result: [{ meta: { type: ['annualTotalRevenue'] }, annualTotalRevenue: [{ asOfDate: '2024-12-31', periodType: '12M', currencyCode: 'EUR', reportedValue: { raw: 1000 } }, { asOfDate: '2025-12-31', periodType: '12M', currencyCode: 'EUR', reportedValue: { raw: 1100 } }] }, { meta: { type: ['annualCapitalExpenditure'] }, annualCapitalExpenditure: [{ asOfDate: '2025-12-31', periodType: '12M', currencyCode: 'EUR', reportedValue: { raw: -50 } }] }, { meta: { type: ['annualNetIncome'] }, annualNetIncome: [{ asOfDate: '2025-12-31', periodType: 'TTM', currencyCode: 'EUR', reportedValue: { raw: 5 } }] }] } });
v(ts.annuel.length === 2 && ts.annuel[1].rev === 1100 && ts.annuel[1].capex === 50 && ts.annuel[1].ni === null && ts.devise === 'EUR' && ts.annuel[1].filedT > ts.annuel[1].finT, 'séries annuelles Yahoo : devise, capex en valeur absolue, TTM ignoré');
const rs = lireRecherche({ quotes: [{ symbol: 'MC.PA', longname: 'LVMH', sector: 'Consumer Cyclical', industry: 'Luxury Goods', quoteType: 'EQUITY' }] }, 'MC.PA'); v(rs && rs.secteur === 'Conso. cyclique' && rs.industrie === 'Luxury Goods' && lireRecherche({ quotes: [] }, 'X') === null, 'recherche Yahoo : secteur normalisé');
v(lireFred('DATE,X\n2024-01-01,4.1\n2024-02-01,.\n2024-03-01,4.3').length === 2 && lirePPP([{}, [{ value: null, date: '2024' }, { value: 0.8, date: '2023' }]]).annee === 2023, 'FRED et Banque mondiale : valeurs manquantes ignorées');

console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
