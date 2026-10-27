import { statistiques } from '../agent-btc/moteur.js';
import { monteCarlo } from '../agent-btc/evaluation.js';
import { enrichirTrades } from '../agent-btc/contexte-trades.js';
import { intervalleEsperance, sharpeDeflate } from '../agent-btc/stats-m5.js';
import { achatConservation, parAnnee, parRegime, parCote } from '../agent-m6c/validation-m6c.js';
import { simulerEvaluation } from '../agent-m6/simulation-eval.js';
import { alea } from '../mars-calcul.js';
import { simulerMS } from './simulation-ms.js';
import { DEPART, masqueEntree, niveauStop, signauxMS, codesRegime } from './signaux-ms.js';

/* ═════════════ TEST D'UNE STRATÉGIE DE L'UTILISATRICE (V1 ; module pur, testé : ms-test-test.mjs sur des marchés fabriqués) ═════════════
   Tout se passe dans la ZONE DE RECHERCHE (les 75 % premiers de l'historique) : le JEU FINAL (derniers 25 %) n'est JAMAIS touché ici.
   Mesures : espérance en R par trade (frais Kraken réglables, spread et glissement déduits), taux de réussite, creux, plus longue série de pertes, long / court, par année, par régime, par bloc de test
   successif (stabilité), Monte Carlo, comparaison OBLIGATOIRE avec l'achat-conservation et avec des ENTRÉES ALÉATOIRES (mêmes stops, même sortie, même densité de signaux, mêmes filtres),
   Sharpe déflaté avec le nombre TOTAL de variantes testées de la stratégie (compteur cumulatif : plus on la retouche, plus la barre monte).
   Verdict en trois mots, qui n'est PAS une validation : les critères de validation (v1 `c9995253`, v2, jeu final) ne sont ni appliqués ni assouplis ici ; une stratégie de cet onglet ne devient jamais « VALIDÉE ». */
export const SEUILS_MS = Object.freeze({ tradesMin: 50, centileHasardMin: 0.95, deflateMin: 0.95, icNiveau: 0.95, tirages: 200 });
const pc = x => (x == null ? '—' : String(Math.round(x * 100)));
const r2 = x => (x == null || !Number.isFinite(x) ? '—' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2).replace('.', ',') + ' R');

/* Plus longue série de trades perdants consécutifs. */
export const serieDePertes = trades => { let m = 0, c = 0; for (const x of trades) { if (x.R <= 0) { c++; if (c > m) m = c; } else c = 0; } return m; };

/* Entrées ALÉATOIRES : même densité de signaux, mêmes stops, même sortie ; un tirage = une simulation sur la zone A. Rend les espérances triées.
   `filtres` = false : le hasard peut entrer à TOUTE bougie (référence du verdict : « fais-tu mieux que le hasard pur ? ») ; `filtres` = true : seulement aux bougies où TES filtres (heures, pas de range) sont
   satisfaits (« tes conditions d'entrée apportent-elles quelque chose en plus de tes filtres ? »). */
export function hasardMS(ctx, strat, finA, nSignaux, { tirages = SEUILS_MS.tirages, graine = 20261023, config = {}, filtres = false } = {}) {
  const cotes = strat.cote === 'long' ? [1] : strat.cote === 'short' ? [-1] : [1, -1], n = ctx.n;
  const elig = [];
  if (filtres) { const m = masqueEntree(ctx, { ...strat, conditions: [] }, 1); for (let i = DEPART; i < finA - 1; i++) if (m[i]) elig.push(i); }
  else for (let i = DEPART; i < finA - 1; i++) elig.push(i);
  if (elig.length < 100 || nSignaux < 5) return null;
  const p = Math.min(1, nSignaux / elig.length), rnd = alea(graine), out = [];
  for (let t = 0; t < tirages; t++) {
    const sens = new Int8Array(n), stop = new Float64Array(n), suivi = new Float64Array(n);
    for (const i of elig) {
      if (rnd() >= p) continue;
      const s = cotes.length === 1 ? cotes[0] : (rnd() < 0.5 ? 1 : -1), st = niveauStop(ctx, strat, i, s); if (st == null || !Number.isFinite(st)) continue;
      sens[i] = s; stop[i] = st;
      if (strat.sortie.type === 'suiveur') { const a = (strat.sortie.tf === 'h4' ? ctx.h4.atr : ctx.h1.atr)[i]; suivi[i] = a > 0 ? strat.sortie.k * a : 0; }
    }
    const sim = simulerMS(ctx, strat, config, { de: 0, a: finA }, { sens, stop, suivi, R: strat.sortie.type === 'cible_R' ? strat.sortie.R : null });
    out.push(sim.trades.length ? sim.trades.reduce((s, x) => s + x.R, 0) / sim.trades.length : 0);
  }
  return out.sort((a, b) => a - b);
}
const centileDe = (tri, x) => { let k = 0; for (const y of tri) if (y < x) k++; return tri.length ? k / tri.length : null; };

/* Risque de sur-ajustement selon le nombre de variantes testées (la même stratégie retouchée N fois) : on affiche la raison, pas seulement un chiffre. */
export function risqueSurajustement(N) {
  const n = Math.max(1, Math.round(N || 1));
  if (n <= 2) return { niveau: 'faible', N: n, phrase: 'Tu as testé ' + n + ' variante' + (n > 1 ? 's' : '') + ' de cette stratégie : le risque de te tromper par chance reste faible.' };
  if (n <= 9) return { niveau: 'moyen', N: n, phrase: 'Tu as testé ' + n + ' variantes de cette stratégie : plus on retouche, plus la meilleure version paraît bonne par chance. La barre du hasard monte avec ce nombre.' };
  return { niveau: 'élevé', N: n, phrase: 'Tu as testé ' + n + ' variantes de cette stratégie : à force de retoucher, n’importe quelle idée finit par « marcher » sur le passé. Sur-ajustement probable : ne te fie qu’à une version figée, testée sur des données neuves.' };
}

/* Verdict simple. 'pas_assez' · 'bat_le_hasard' · 'ne_bat_pas'. Les quatre conditions pour « bat le hasard » : assez de trades, espérance > 0 avec intervalle à 95 % au-dessus de 0,
   centile ≥ 95 % parmi les entrées aléatoires, Sharpe déflaté ≥ 95 % avec le nombre total de variantes. Ce n'est PAS la validation du protocole (jeu final, critères v1 et v2). */
export function verdictMS({ stats, ic, hasard, deflate, nVariantes }) {
  const n = stats.n, raisons = [], ok = [];
  if (n < SEUILS_MS.tradesMin) return { code: 'pas_assez', titre: 'Pas assez de trades pour conclure', raisons: ['Seulement ' + n + ' trade' + (n > 1 ? 's' : '') + ' : il en faut au moins ' + SEUILS_MS.tradesMin + ' pour séparer la chance de l’avantage réel.'], ok, nVariantes };
  const esp = stats.esperance;
  if (!(esp > 0)) raisons.push('Espérance négative ou nulle (' + r2(esp) + ' par trade, frais déduits).'); else ok.push('Espérance positive : ' + r2(esp) + ' par trade.');
  if (!(ic && ic.bas != null && ic.bas > 0)) raisons.push('L’intervalle à 95 % de l’espérance (' + (ic && ic.bas != null ? r2(ic.bas) + ' à ' + r2(ic.haut) : '—') + ') n’est pas entièrement au-dessus de zéro.'); else ok.push('Intervalle à 95 % entièrement positif.');
  if (!hasard) raisons.push('Comparaison avec des entrées aléatoires impossible (pas assez de signaux ou de bougies éligibles).');
  else if (!(hasard.centile >= SEUILS_MS.centileHasardMin)) raisons.push('Des entrées prises au hasard à n’importe quelle bougie (mêmes stops, même sortie) font mieux ou presque aussi bien : ta stratégie bat ' + pc(hasard.centile) + ' % d’entre elles, il en faut ' + pc(SEUILS_MS.centileHasardMin) + ' %.'); else ok.push('Bat ' + pc(hasard.centile) + ' % des entrées aléatoires.');
  if (!(deflate && deflate.dsr != null && deflate.dsr >= SEUILS_MS.deflateMin)) raisons.push('Après ' + nVariantes + ' variante' + (nVariantes > 1 ? 's' : '') + ' testée' + (nVariantes > 1 ? 's' : '') + ', la probabilité que l’avantage soit réel est de ' + pc(deflate && deflate.dsr) + ' % (il en faut ' + pc(SEUILS_MS.deflateMin) + ' %).'); else ok.push('Sharpe déflaté ' + pc(deflate.dsr) + ' % après ' + nVariantes + ' variante(s).');
  return raisons.length ? { code: 'ne_bat_pas', titre: 'Ne bat pas le hasard', raisons, ok, nVariantes } : { code: 'bat_le_hasard', titre: 'Bat le hasard (sur le passé)', raisons: [], ok, nVariantes };
}

/* Test complet sur UNE paire. entrée : { ctx, strat, decoupe, config, nVariantes (cumulé pour cette stratégie, test actuel compris), tirages, graine }. */
export function testerStrategie({ ctx, strat, decoupe, config = {}, nVariantes = 1, tirages = SEUILS_MS.tirages, graine = 20261023 }) {
  if (!decoupe || !decoupe.ok) return { ok: false, erreur: decoupe && decoupe.raison || 'historique insuffisant' };
  const finA = decoupe.finA, sim = simulerMS(ctx, strat, config, { de: 0, a: finA }), trades = enrichirTrades(sim.trades, ctx);
  const risquePct = (config && config.risquePct) || 1, stats = statistiques(trades, { barres: finA, risquePct });
  const R = trades.map(x => x.R), ic = intervalleEsperance(R, SEUILS_MS.icNiveau), deflate = R.length >= 10 ? sharpeDeflate(R, Math.max(1, nVariantes)) : null;
  const mc = trades.length >= 8 ? monteCarlo(trades) : null;
  const sig = signauxMS(ctx, strat); let nSig = 0; for (let i = 0; i < finA; i++) if (sig.sens[i]) nSig++;
  const dist = tirages > 0 && trades.length >= 10 ? hasardMS(ctx, strat, finA, nSig, { tirages, graine, config }) : null;
  const hasard = dist ? { centile: centileDe(dist, stats.esperance == null ? -Infinity : stats.esperance), mediane: dist[dist.length >> 1], p95: dist[Math.floor(dist.length * 0.95)], tirages: dist.length } : null;
  const aFiltres = !!(strat.filtres && (strat.filtres.pasRange || strat.filtres.heures)), distF = aFiltres && dist ? hasardMS(ctx, strat, finA, nSig, { tirages, graine: graine + 1, config, filtres: true }) : null;
  const hasardFiltres = distF ? { centile: centileDe(distF, stats.esperance == null ? -Infinity : stats.esperance), mediane: distF[distF.length >> 1], p95: distF[Math.floor(distF.length * 0.95)], tirages: distF.length } : null;
  const bh = achatConservation(ctx, decoupe);
  const blocs = decoupe.folds.map((f, k) => { const t = trades.filter(x => x.entree >= f.test[0] && x.entree < f.test[1]), s = statistiques(t, { barres: f.test[1] - f.test[0], risquePct }); return { k: k + 1, debut: f.debutTest, fin: f.finTest, n: s.n, esperance: s.esperance, Rtotal: s.Rtotal }; });
  const verdict = verdictMS({ stats, ic, hasard, deflate, nVariantes });
  return { ok: true, finA, n: trades.length, stats, ic, deflate, mc, hasard, hasardFiltres, achatConservation: bh, serieDePertes: serieDePertes(trades), cotes: parCote(trades), parAnnee: parAnnee(trades), parRegime: parRegime(trades), blocs,
    blocsPositifs: blocs.filter(b => b.n >= 5 && b.esperance > 0).length, blocsTestables: blocs.filter(b => b.n >= 5).length, signaux: nSig, tronque: sim.tronque, verdict, risque: risqueSurajustement(nVariantes), trades, jeuFinalTouche: false };
}

/* Résultats groupés des trois paires (mêmes paramètres) : les R sont mis bout à bout, chaque paire garde ses frais. */
export function grouperPaires(resultats) {
  const ok = Object.entries(resultats).filter(([, r]) => r && r.ok), tous = []; for (const [p, r] of ok) for (const t of r.trades) tous.push({ ...t, paire: p });
  if (!ok.length) return null;
  tous.sort((a, b) => a.t - b.t);
  const stats = statistiques(tous, { barres: 0 }), R = tous.map(x => x.R), ic = intervalleEsperance(R);
  const nV = Math.max(...ok.map(([, r]) => r.verdict.nVariantes)), deflate = R.length >= 10 ? sharpeDeflate(R, nV) : null;
  const centiles = ok.map(([, r]) => r.hasard && r.hasard.centile).filter(x => x != null), centile = centiles.length ? centiles.reduce((a, b) => a + b, 0) / centiles.length : null;
  const hasard = centiles.length ? { centile, mediane: null, p95: null, tirages: ok[0][1].hasard.tirages } : null;
  const verdict = verdictMS({ stats, ic, hasard, deflate, nVariantes: nV });
  return { paires: ok.map(([p]) => p), n: tous.length, stats, ic, deflate, hasard, serieDePertes: serieDePertes(tous), cotes: parCote(tous), parAnnee: parAnnee(tous), verdict, positives: ok.filter(([, r]) => r.stats.esperance > 0).map(([p]) => p) };
}

/* Capital et pire creux pour plusieurs risques par trade : sur la VRAIE suite de trades du test (rejouée), capital de départ réglable. */
export function courbesCapital(trades, { capital = 10000, risques = [0.25, 0.5, 1] } = {}) {
  const liste = trades.slice().sort((a, b) => a.tSortie - b.tSortie);
  return risques.map(rp => {
    let E = capital, pic = capital, pire = 0, nPoints = 0; const pts = [E], pas = Math.max(1, Math.floor(liste.length / 120));
    liste.forEach((x, i) => { E += capital * rp / 100 * x.R; if (E > pic) pic = E; const dd = (pic - E) / capital * 100; if (dd > pire) pire = dd; if (i % pas === 0 || i === liste.length - 1) { pts.push(E); nPoints++; } });
    return { risquePct: rp, capitalFinal: E, rendementPct: (E / capital - 1) * 100, pireCreuxPct: pire, points: pts };
  });
}

/* Simulation d'évaluation prop pour la stratégie (mêmes limites que le gardien : −3 % par jour, −6 % de creux, +10 % d'objectif), à 0,25 / 0,5 / 1 % de risque, avec et sans arrêt du jour. */
export function simulationProp(trades, { regles = {}, tradesParSemaine = null, risques = [0.25, 0.5, 1], graine = 20261023, gain = 0, pic = null } = {}) {
  const R = trades.map(x => x.R).filter(Number.isFinite);
  if (R.length < 8) return { ok: false, erreur: 'il faut au moins 8 trades pour simuler (il y en a ' + R.length + ')' };
  const freq = tradesParSemaine || (trades.length > 1 ? Math.max(0.5, trades.length / Math.max(1, (Math.max(...trades.map(x => x.tSortie)) - Math.min(...trades.map(x => x.t))) / (7 * 86400e3))) : 2);
  return simulerEvaluation({ R, trades, tradesParSemaine: freq, regles, gain, pic, risquesPct: risques, graine, nExt: 30, nInt: 100 });
}
export { codesRegime };
