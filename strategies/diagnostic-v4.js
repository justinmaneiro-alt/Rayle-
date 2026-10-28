import { combinaisons } from '../planetes/mars/pc/agent-btc/hypotheses.js';
import { simuler, statistiques } from '../planetes/mars/pc/agent-btc/moteur.js';
import { alea } from '../planetes/mars/pc/mars-calcul.js';
import { famille, NOMS_V3 } from './familles-v3.js';
import { NOMS_V4 } from './familles-v4.js';

/* ═════════════ DIAGNOSTIC DE KEPLER (V4, module pur, testé : galaxie/tests/diagnostic-v4-test.mjs) ═════════════
   Répond à « pourquoi des milliers de variantes sans aucune stratégie validée ? » avec des chiffres, sans rien supposer. Aucune fonction ici ne touche aux critères de validation : on les LIT seulement.
   Deux sources : (1) les résumés de validation déjà gardés dans l'état de l'agent (entonnoir de rejet) ; (2) un balayage des variantes sur la zone de recherche (jamais le jeu final), qui sépare
   l'espérance BRUTE (avant frais) de l'espérance NETTE (après frais, spread et glissement) et la compare au HASARD (entrées aléatoires, mêmes coûts). */

/* « … parmi 3117 variantes » change à chaque évaluation : on regroupe sous un même libellé. */
export const normaliserCritere = c => String(c).replace(/\s*parmi\s+\d+\s+variantes/, ' parmi N variantes');

/* Entonnoir : pour chaque critère, combien d'évaluations (famille × actif) l'ont raté, et combien n'ont raté QUE celui-là (le vrai verrou). */
export function entonnoir(backtests) {
  const evals = (backtests || []).filter(b => Array.isArray(b.ratees)), n = evals.length, m = new Map();
  for (const b of evals) {
    const ratees = [...new Set(b.ratees.map(normaliserCritere))];
    for (const c of ratees) { const e = m.get(c) || { critere: c, rate: 0, seul: 0 }; e.rate++; if (ratees.length === 1) e.seul++; m.set(c, e); }
  }
  const criteres = [...m.values()].sort((a, b) => b.rate - a.rate || a.critere.localeCompare(b.critere)).map(e => ({ ...e, part: n ? e.rate / n : 0 }));
  const nbRatees = evals.map(b => new Set(b.ratees.map(normaliserCritere)).size).sort((a, b) => a - b);
  return { evaluations: n, criteres, moyenneRatees: n ? nbRatees.reduce((a, b) => a + b, 0) / n : null, minRatees: n ? nbRatees[0] : null, medianeRatees: n ? nbRatees[nbRatees.length >> 1] : null,
    validees: evals.filter(b => b.statut === 'validee_backtest').length };
}

/* Meilleure espérance (hors échantillon, walk-forward) par famille × actif, avec le nombre de trades. Les « presque » : espérance positive mais trop peu de trades (< tradesMin). */
export function parFamilleActif(backtests, { tradesMin = 150 } = {}) {
  const m = new Map();
  for (const b of backtests || []) {
    if (b.esperance == null || b.trades == null) continue;
    const k = b.famille + ':' + b.paire, e = m.get(k);
    if (!e || b.esperance > e.esperance) m.set(k, { famille: b.famille, nom: b.nom || NOMS_V3[b.famille] || NOMS_V4[b.famille] || b.famille, paire: b.paire, esperance: b.esperance, trades: b.trades, factProfit: b.factProfit, ratees: (b.ratees || []).length, type: b.type });
  }
  const liste = [...m.values()].sort((a, b) => b.esperance - a.esperance);
  return { liste, presque: liste.filter(x => x.esperance > 0 && x.trades < tradesMin), positives: liste.filter(x => x.esperance > 0), tradesMin };
}

/* Signaux ALÉATOIRES (même fréquence que `parSemaine`, stop = 1,5 ATR, objectif R) : le plancher du hasard avec les mêmes coûts. */
export function signauxAleatoires(ctx, { graine = 1, tauxParBougie = 1 / 300, R = 3, stopATR = 1.5 } = {}) {
  const n = ctx.n, a = alea(graine), sens = new Int8Array(n), stop = new Float64Array(n);
  for (let i = 400; i < n; i++) {
    if (a() >= tauxParBougie) continue; const s = a() < 0.5 ? 1 : -1, at = ctx.atr15[i]; if (!(at > 0)) continue;
    sens[i] = s; stop[i] = ctx.m15.c[i] - s * stopATR * at;
  }
  return { sens, stop, R };
}
export function hasard(ctx, config, plage, { essais = 20, graine = 777, ...opts } = {}) {
  const esp = [];
  for (let k = 0; k < essais; k++) {
    const sim = simuler(ctx.m15, signauxAleatoires(ctx, { graine: graine + k, ...opts }), config, plage), st = statistiques(sim.trades, { barres: plage.a - plage.de });
    if (st.n >= 30) esp.push({ esperance: st.esperance, n: st.n, brute: sim.trades.reduce((x, t) => x + t.Rbrut, 0) / st.n, couts: sim.trades.reduce((x, t) => x + t.coutsR, 0) / st.n });
  }
  const e = esp.map(x => x.esperance).sort((a, b) => a - b), moy = f => esp.length ? esp.reduce((x, y) => x + f(y), 0) / esp.length : null;
  return { essais: esp.length, esperanceMoyenne: moy(x => x.esperance), esperanceMax: e.length ? e[e.length - 1] : null, esperanceMin: e.length ? e[0] : null, bruteMoyenne: moy(x => x.brute), coutsMoyens: moy(x => x.couts), tradesMoyens: moy(x => x.n) };
}

/* Balayage d'une famille : toutes les variantes de sa grille de base sur [plage.de, plage.a) (zone de recherche : le jeu final n'est JAMAIS inclus par l'appelant). Rend des agrégats. */
export function balayerFamille(ctx, id, config, plage, { grille = null, tradesMin = 150, nMinBon = 30 } = {}) {
  const fam = famille(id); if (!fam) throw new Error('famille inconnue : ' + id);
  const combos = combinaisons(grille || fam.grille(0)), lignes = [];
  for (const params of combos) {
    const sim = simuler(ctx.m15, fam.signaux(ctx, params), config, plage), st = statistiques(sim.trades, { barres: plage.a - plage.de });
    if (!st.n) { lignes.push({ params, n: 0, esperance: null, brute: null, couts: null, factProfit: null }); continue; }
    lignes.push({ params, n: st.n, esperance: st.esperance, brute: sim.trades.reduce((x, t) => x + t.Rbrut, 0) / st.n, couts: sim.trades.reduce((x, t) => x + t.coutsR, 0) / st.n, factProfit: st.factProfit, parSemaine: st.parSemaine });
  }
  const avecTrades = lignes.filter(l => l.n >= nMinBon), meilleur = avecTrades.slice().sort((a, b) => b.esperance - a.esperance)[0] || null;
  const meilleurAssez = avecTrades.filter(l => l.n >= tradesMin).sort((a, b) => b.esperance - a.esperance)[0] || null;
  return {
    id, nom: NOMS_V3[id] || NOMS_V4[id] || fam.nom, variantes: lignes.length, avecAssezDeTrades: avecTrades.length,
    positivesNettes: avecTrades.filter(l => l.esperance > 0).length, positivesBrutes: avecTrades.filter(l => l.brute > 0).length, nettesSeuil: avecTrades.filter(l => l.esperance >= 0.25).length,
    esperanceNetteMediane: mediane(avecTrades.map(l => l.esperance)), esperanceBruteMediane: mediane(avecTrades.map(l => l.brute)), coutMoyenR: avecTrades.length ? avecTrades.reduce((a, l) => a + l.couts, 0) / avecTrades.length : null,
    meilleur, meilleurAssez
  };
}
const mediane = x => { if (!x.length) return null; const s = x.slice().sort((a, b) => a - b); return s[s.length >> 1]; };

/* Conclusion en langage simple, tirée des chiffres (jamais d'une supposition). `balayages` = [{ paire, famille: agrégat, hasard }] ; `entonnoirRes` = résultat d'`entonnoir`. */
export function conclusion({ entonnoirRes, balayages, pairesHasard }) {
  const lignes = [], bal = balayages || [], total = bal.reduce((a, b) => a + b.variantes, 0), bonnes = bal.reduce((a, b) => a + b.avecAssezDeTrades, 0);
  const posNettes = bal.reduce((a, b) => a + b.positivesNettes, 0), posBrutes = bal.reduce((a, b) => a + b.positivesBrutes, 0), seuil = bal.reduce((a, b) => a + b.nettesSeuil, 0);
  const verrou = entonnoirRes && entonnoirRes.criteres[0];
  if (verrou) { const tous = entonnoirRes.criteres.filter(c => c.part >= 0.95); lignes.push(tous.length + ' critères sur ' + entonnoirRes.criteres.length + ' sont ratés par au moins 95 % des évaluations (dont « ' + verrou.critere + ' », raté ' + verrou.rate + ' fois sur ' + entonnoirRes.evaluations + ') : aucun verrou isolé, tout tombe en même temps parce que l’espérance nette manque.'); }
  if (entonnoirRes && entonnoirRes.evaluations) lignes.push('Une évaluation ratée l’est en moyenne sur ' + entonnoirRes.moyenneRatees.toFixed(1) + ' critères (au minimum ' + entonnoirRes.minRatees + ') : ce n’est pas « un critère un peu trop strict », c’est l’espérance elle-même qui manque.');
  if (bonnes) lignes.push('Sur ' + bonnes + ' variantes avec au moins 30 trades (zone de recherche, tous actifs), ' + posBrutes + ' ont une espérance positive AVANT frais, ' + posNettes + ' APRÈS frais, ' + seuil + ' atteignent +0,25 R (le seuil de validation) — mais ces chiffres sont mesurés sur les données qui ont servi à choisir : ils sont optimistes.');
  const h = (pairesHasard || []).filter(x => x && x.essais);
  if (h.length) lignes.push('Le hasard (entrées aléatoires, mêmes coûts) donne en moyenne ' + moyenne(h.map(x => x.esperanceMoyenne)).toFixed(2).replace('.', ',') + ' R par trade ; le meilleur essai aléatoire atteint ' + Math.max(...h.map(x => x.esperanceMax)).toFixed(2).replace('.', ',') + ' R. Une stratégie qui ne fait pas nettement mieux que ce plancher n’a pas d’avantage prouvé.');
  let verdict;
  if (!bonnes) verdict = 'DONNÉES INSUFFISANTES : le balayage n’a pas produit assez de trades pour juger.';
  else if (posBrutes > 0 && posNettes === 0) verdict = 'LES FRAIS MANGENT L’AVANTAGE : certaines idées sont positives avant frais, aucune après. Cherche des signaux avec des stops plus larges (moins de frais en R) ou des mouvements plus grands.';
  else if (seuil === 0) verdict = 'MAL ARMÉ, PAS TROP STRICT : aucune variante n’atteint le seuil d’espérance même sur les données d’entraînement. Les prix seuls (bougies, volume, RSI, moyennes) ne montrent pas d’avantage net : il faut de nouvelles données (flux d’ordres, liquidité, liquidations) et de nouvelles idées, pas des critères plus faciles.';
  else verdict = 'PEU DE PISTES, ET FRAGILES : ' + seuil + ' variantes sur ' + bonnes + ' passent le seuil d’espérance sur les données d’entraînement. Avec autant d’essais, quelques chanceuses sont attendues par le simple hasard ; rien ne dit qu’elles survivent hors échantillon (c’est le rôle de la validation, qui ne change pas). Plus de données et de meilleures idées, pas des critères plus faciles.';
  lignes.push('Verdict : ' + verdict);
  return { lignes, verdict, chiffres: { total, bonnes, posBrutes, posNettes, seuil } };
}
const moyenne = x => x.reduce((a, b) => a + b, 0) / x.length;
