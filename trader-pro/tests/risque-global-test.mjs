/* Tests du risque global (v6, B4). node trader-pro/tests/risque-global-test.mjs */
import { unifier, analyser, creerCorr, pertesRealisees, budget, risqueAutorise, phraseRisque } from '../portefeuille/risque-global.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const T = { GOLD: 'or', SILVER: 'argent', EURUSD: 'eurusd', US100: 'us100' };
/* 3 positions corrélées : or + argent + EUR/USD à l'achat = un pari contre le dollar */
const ouvertes = [{ id: '1', ticker: 'GOLD', sens: 'BUY', risqueAuStop: -100, sl: 1 }, { id: '2', ticker: 'SILVER', sens: 'BUY', risqueAuStop: -100, sl: 1 }, { id: '3', ticker: 'EURUSD', sens: 'BUY', risqueAuStop: -100, sl: 1 }];
const P = unifier({ ouvertes, traduire: t => T[t] }); const A = analyser(P, { corr: creerCorr(null), capital: 5000 });
v(A.total === 300 && Math.abs(A.totalPct - 6) < 1e-9, 'perte totale si tous les stops sont touchés : 300 € = 6 % du capital');
const d = A.expo.find(e => e.facteur === 'dollar'); v(d && d.sens === -1 && /contre le dollar/.test(d.phrase) && d.risque > 150, 'exposition « contre le dollar » : ' + (d && d.risque.toFixed(0)) + ' € (' + (d && d.phrase) + ')');
v(A.paires.length >= 1 && A.paires.every(p => p.effective > 0.7 || p.corr === 1), 'paires fortement corrélées dans le même sens : ' + A.paires.map(p => p.a + '/' + p.b).join(', '));
/* sens opposés : pas d'alerte de corrélation */
const P2 = unifier({ ouvertes: [{ ticker: 'GOLD', sens: 'BUY', risqueAuStop: -100, sl: 1 }, { ticker: 'SILVER', sens: 'SELL', risqueAuStop: -100, sl: 1 }], traduire: t => T[t] }); v(analyser(P2).paires.length === 0, 'or acheté + argent vendu : pas de corrélation de même sens');
/* corrélation de Couverture prioritaire */
const cj = { correlations: { 30: { actifs: [{ id: 'or' }, { id: 'us100' }], matrice: [[1, 0.9], [0.9, 1]] } } }; const c = creerCorr(cj)('or', 'us100'); v(c.v === 0.9 && /Couverture/.test(c.source), 'corrélation de Couverture utilisée (' + c.source + ')'); v(creerCorr(null)('or', 'argent').source === 'estimation', 'sinon estimation, dite comme telle');
/* saisies rapides, fermeture en un toucher, positions sans stop */
const P3 = unifier({ ouvertes: [{ ticker: 'US100', sens: 'BUY', sl: null }], saisies: [{ id: 'a', actif: 'btc', sens: 'BUY', risque: 100 }, { id: 'b', actif: 'sol', sens: 'BUY', risque: 100, fermee: true }], traduire: t => T[t] }); v(P3.length === 2 && analyser(P3).sansStop === 1, 'saisie rapide prise en compte, position fermée en un toucher ignorée, sans-stop signalé');
/* budget : limites 2 % jour / 5 % semaine */
const fermees = [{ tFerm: Date.UTC(2026, 10, 23, 9, 0), pnl: -60 }, { tFerm: Date.UTC(2026, 10, 20, 9, 0), pnl: -200 }, { tFerm: Date.UTC(2026, 10, 23, 8, 0), pnl: 10 }]; const pr = pertesRealisees(fermees, Date.UTC(2026, 10, 23, 14, 0));
v(pr.jour === -50 && pr.semaine === -50, 'pertes réalisées du jour et de la semaine (la perte de vendredi est dans la semaine précédente)');
let b = budget({ reglages: { capital: 5000 }, pertes: pr, engage: 0 }); v(b.jour.limite === 100 && b.semaine.limite === 250 && b.jour.reste === 50 && b.jour.etat === 'ok', 'limites 2 % (100 €) et 5 % (250 €) ; reste du jour 50 €');
let r = risqueAutorise(100, b); v(r.risque === 50 && r.depasse && /50 €/.test(r.avertissement), 'taille réduite au budget restant : ' + r.avertissement);
b = budget({ reglages: { capital: 5000 }, pertes: { jour: -100, semaine: -100 }, engage: 0 }); r = risqueAutorise(100, b); v(b.jour.etat === 'atteinte' && /limite du jour atteinte : nouvelle position déconseillée/.test(r.avertissement) && r.risque === 0, 'limite du jour atteinte : avertissement clair (alerte, pas blocage : la décision reste à l\'utilisateur)');
b = budget({ reglages: { capital: 5000 }, pertes: { jour: 0, semaine: 0 }, engage: 80 }); v(b.jour.reste === 20 && risqueAutorise(100, b).risque === 20, 'le risque déjà engagé (stops) réduit le budget restant');
v(risqueAutorise(100, budget({ reglages: { capital: 0 } })).avertissement === null, 'sans capital renseigné : aucun avertissement inventé');
v(/300 euros/.test(phraseRisque(A, b)) && /contre le dollar/.test(phraseRisque(A, b)) && /corrélées/.test(phraseRisque(A, b)) && /aucune position/i.test(phraseRisque({ n: 0 })), 'phrase parlée du risque global');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `risque-global-test : tout passe (${ok})`); process.exit(ko ? 1 : 0);
