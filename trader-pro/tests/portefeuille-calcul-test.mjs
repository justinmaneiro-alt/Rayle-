/* Tests des statistiques du portefeuille. node trader-pro/tests/portefeuille-calcul-test.mjs  (le vrai fichier de donnees-privees/ est utilisé s'il existe : aucun chiffre n'est écrit nulle part) */
import fs from 'node:fs'; import path from 'node:path';
import { valeursDuPoint, enrichir, resume, series, drawdown, grouper, parDuree, parTaille, courbes, pnlParJour, cumulerPeriode, cleSemaine, cleMois, exposition, filtrer, trier, formatDuree, session, partiesParis, estCapital, estAutre, H } from '../portefeuille/calcul.js';
import { importerXtb } from '../portefeuille/import-xtb.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } }; const proche = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const T0 = Date.UTC(2026, 2, 2, 8, 0, 0);   // lundi 2 mars 2026, 08:00 UTC (09:00 Paris)
const mk = (i, pnl, o = {}) => ({ id: 'p' + i, ticker: 'GOLD', instrument: 'GOLD', categorie: 'CFD', sens: 'BUY', volume: 0.01, prixOuv: 4000, tOuv: T0 + i * H, prixFerm: 4000 + pnl, tFerm: T0 + i * H + 30 * 60e3, pnl, brut: pnl, commission: 0, swap: 0, rollover: 0, sl: 3990, tp: null, origine: 'Android', commentaire: '', ...o });
/* valeur du point : 1 lot GOLD = 100 € par unité de prix → 0,01 lot = 1 € par unité */
const base = [mk(1, 10), mk(2, -5, { prixFerm: 3995 }), mk(3, 20, { prixFerm: 4020 }), mk(4, -5, { prixFerm: 3995 }), mk(5, 0.5, { prixFerm: 4000.5 })].map(t => ({ ...t, brut: (t.prixFerm - t.prixOuv) * t.volume * 100, pnl: (t.prixFerm - t.prixOuv) * t.volume * 100 }));
const vp = valeursDuPoint(base); v(vp.GOLD && proche(vp.GOLD.k, 100, 1e-6) && vp.GOLD.n === 5, 'valeur du point mesurée : ' + (vp.GOLD && vp.GOLD.k));
const E = enrichir(base, vp); v(E[0].duree === 30 * 60e3 && E[0].session === 'Asie' || E[0].session === 'Londres', 'session déduite de l’heure UTC'); v(proche(E[0].risque, 10 * 0.01 * 100) && proche(E[0].r, 1), 'R = résultat / risque (stop à 10 points, 0,01 lot) : ' + E[0].r);
v(E.every((t, i, a) => !i || a[i - 1].tFerm <= t.tFerm), 'trades triés par fermeture'); v(enrichir([{ ...base[0], sl: null }], vp)[0].r === null, 'sans stop : R absent (pas inventé)');
const R = resume(E); v(R.n === 5 && R.gagnants === 3 && R.perdants === 2, 'comptes'); v(proche(R.pnl, 10 - 5 + 20 - 5 + 0.5, 1e-6), 'P&L total'); v(proche(R.profitFactor, 30.5 / 10, 1e-6), 'profit factor'); v(proche(R.winRate, 0.6), 'win rate');
v(proche(R.gainMoyen, 30.5 / 3) && proche(R.perteMoyenne, -5), 'gain et perte moyens'); v(proche(R.payoff, (30.5 / 3) / 5), 'payoff'); v(R.series.gagnante === 1 && R.series.perdante === 1, 'séries'); v(proche(R.esperance, 20.5 / 5), 'espérance par trade');
v(series([{ pnl: 1 }, { pnl: 2 }, { pnl: 3 }, { pnl: -1 }, { pnl: -1 }, { pnl: 1 }]).gagnante === 3 && series([{ pnl: 1 }, { pnl: -1 }, { pnl: -1 }, { pnl: -1 }]).perdante === 3, 'plus longues séries');
const dd = drawdown([0, 5, 3, 8, 2, 9]); v(dd.max === -6 && dd.courbe[2] === -2, 'drawdown');
v(grouper(E, t => t.ticker)[0].n === 5 && grouper(E, t => t.sens)[0].winRate === 0.6, 'regroupement'); v(parDuree(E)[0].cle === '30 min à 2 h' || parDuree(E)[0].cle === '5 à 30 min', 'durées en tranches');
/* trésorerie : capital exclu de la performance, index à pondération temporelle */
const C = [{ id: 'c1', type: 'Deposit', t: T0, montant: 100 }, { id: 'c2', type: 'Close trade', t: T0 + H, montant: 10 }, { id: 'c3', type: 'Deposit', t: T0 + 2 * H, montant: 100 }, { id: 'c4', type: 'Close trade', t: T0 + 3 * H, montant: -5 }, { id: 'c5', type: 'Withdrawal', t: T0 + 4 * H, montant: -50 }, { id: 'c6', type: 'Free funds interest', t: T0 + 5 * H, montant: 1 }];
const K = courbes(C, E); v(proche(K.soldeFinal, 100 + 10 + 100 - 5 - 50 + 1), 'solde final = tous les flux'); v(proche(K.perfTotale, 10 - 5 + 1), 'dépôts et retraits exclus de la performance'); v(proche(K.fluxNet, 150), 'flux net de capital');
v(proche(K.capitalApporte, 200) && proche(K.drawdownPerfMax, -5) && K.drawdownPctMax < 0 && K.drawdownPctMax > -5, 'drawdown du résultat cumulé en € et en % du capital apporté (' + K.drawdownPctMax + ')'); v(estCapital(C[0]) && estCapital(C[4]) && !estCapital(C[1]) && estAutre(C[5]) && !estAutre(C[1]), 'classes de trésorerie');
const J = pnlParJour(E); v(J.length === 1 && proche(J[0].pnl, 20.5), 'P&L par jour'); v(cleSemaine('2026-03-04') === '2026-03-02' && cleMois('2026-03-04') === '2026-03', 'semaine (lundi) et mois'); v(cumulerPeriode(J, cleMois)[0].pnl === 20.5, 'cumul par mois');
v(partiesParis(Date.UTC(2026, 6, 1, 22, 30)).jour === '2026-07-02', 'jour de Paris (été : minuit passé)'); v(session(Date.UTC(2026, 0, 1, 3)) === 'Asie' && session(Date.UTC(2026, 0, 1, 15)) === 'New York', 'sessions');
/* positions ouvertes */
const X = exposition([{ id: 'o1', ticker: 'GOLD', sens: 'BUY', volume: 0.01, valeur: 400, prixOuv: 4000, prixCourant: 4010, sl: 3950, pnl: 9, swap: 0 }, { id: 'o2', ticker: 'GOLD', sens: 'SELL', volume: 0.01, valeur: 400, prixOuv: 4000, prixCourant: 4010, sl: null, pnl: -10, swap: 0 }], vp, 1000);
v(proche(X.positions[0].latent, 10) && proche(X.positions[1].latent, -10), 'P&L latent aux prix donnés'); v(proche(X.risqueAuStop, 50) && proche(X.risquePct, 5), 'risque au stop en % du capital'); v(X.sansStop === 1, 'position sans stop signalée');
v(proche(exposition([{ id: 'o', ticker: 'GOLD', sens: 'BUY', volume: 0.01, valeur: 400, prixOuv: 4000, prixCourant: 4010, sl: null, pnl: 9, swap: 0 }], vp, 1000, { GOLD: 4020 }).positions[0].latent, 20), 'prix en direct prioritaire');
/* filtres et tri */
v(filtrer(E, { resultat: 'gagnant' }).length === 3 && filtrer(E, { sens: 'SELL' }).length === 0 && filtrer(E, { texte: 'p3' }).length === 1, 'filtres'); v(trier(E, 'pnl', -1)[0].pnl === 20 && trier(E, 'pnl', 1)[0].pnl === -5, 'tri'); v(formatDuree(90 * 60e3) === '1 h 30' && formatDuree(10 * 60e3) === '10 min', 'durée lisible');
v(parTaille(E).length === 0, 'taille : trop peu de trades = rien');

/* ── vrai fichier (si présent) : cohérence seulement ── */
let zip = null; try { zip = fs.readdirSync('donnees-privees').filter(f => /^\d+_.*\.zip$/.test(f)).map(f => path.join('donnees-privees', f))[0]; } catch (e) { /* */ }
if (zip) {
  const X2 = await importerXtb([{ nom: path.basename(zip), octets: new Uint8Array(fs.readFileSync(zip)) }]), vp2 = valeursDuPoint(X2.fermees), E2 = enrichir(X2.fermees, vp2), R2 = resume(E2), K2 = courbes(X2.tresorerie, E2);
  v(proche(R2.pnl, X2.fermees.reduce((s, t) => s + t.pnl, 0), 0.01), 'réel : P&L des positions = Σ Profit/Loss du fichier');
  v(X2.totalTresorerieFichier != null && proche(K2.soldeFinal, X2.totalTresorerieFichier, 0.011), 'réel : solde reconstitué = ligne « Total » du fichier XTB');
  v(proche(K2.perfTotale + K2.fluxNet, K2.soldeFinal, 0.011), 'réel : performance + flux de capital = solde');
  v(Object.keys(vp2).includes('GOLD') && vp2.GOLD.ecart < 0.1, 'réel : valeur du point de l\'or cohérente (écart médian < 10 %)');
  v(E2.filter(t => t.r != null).length > 100, 'réel : R calculé pour les positions avec stop');
  console.log(`  réel : ${R2.n} positions, win rate ${(R2.winRate * 100).toFixed(1)} %, profit factor ${R2.profitFactor.toFixed(2)}, séries ${R2.series.gagnante}/${R2.series.perdante}, k(or) ≈ ${vp2.GOLD.k.toFixed(1)}, R moyen ${R2.esperanceR.toFixed(2)} (n=${R2.nR})`);
}
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
