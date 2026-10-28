import { CRITERES } from './criteres.js';
import { FAMILLES, combinaisons, voisins, cleParams } from './hypotheses.js';
import { simuler, statistiques } from './moteur.js';
import { alea } from '../mars-calcul.js';
import { simulerRiche } from '../../../../strategies/simulateur-riche.js';   // V6 : ordres limités, stop minimum, sorties riches (les familles qui le demandent marquent leurs signaux `riche: true`)

/* ═════════════ PROTOCOLE D'ÉVALUATION ANTI-SUR-OPTIMISATION (M3b ; module pur, testé : agent-backtest-test.mjs) ═════════════
   Découpage, walk-forward, robustesse des voisins, Monte Carlo, comparaisons multiples, jeu final. Les seuils viennent de criteres.js (écrits avant les tests). */
const MOIS_MS = 30.4375 * 86400e3;
const indexDepuis = (m15, t) => { let a = 0, b = m15.n; while (a < b) { const m = (a + b) >> 1; if (m15.t[m] < t) a = m + 1; else b = m; } return a; };

/* Découpe les données : zone de recherche (A), jeu final (B) et blocs du walk-forward dans A. Tout est en indices de bougies M15. */
export function decouper(m15, d = CRITERES.decoupage) {
  const n = m15.n, t0 = m15.t[0], t1 = m15.t[n - 1] + 900e3, mois = (t1 - t0) / MOIS_MS;
  if (mois < d.moisMinHistorique) return { ok: false, raison: 'Historique de ' + mois.toFixed(1).replace('.', ',') + ' mois : il en faut au moins ' + d.moisMinHistorique + ' pour séparer entraînement, test et validation.' };
  const finA = Math.floor(n * d.fractionRecherche), tA = finA >= n ? t1 : m15.t[finA];
  const folds = []; let debutTest = t0 + d.entrainementMois * MOIS_MS;
  while (debutTest < tA - 1) {
    const finTest = Math.min(tA, debutTest + d.blocTestMois * MOIS_MS);
    if (finTest - debutTest >= d.blocTestMois * MOIS_MS * 0.5) folds.push({ train: [0, indexDepuis(m15, debutTest)], test: [indexDepuis(m15, debutTest), finTest >= tA ? finA : indexDepuis(m15, finTest)], debutTest, finTest });
    debutTest = finTest;
  }
  return { ok: true, n, finA, jeuFinal: [finA, n], folds, mois, moisZoneA: (tA - t0) / MOIS_MS, moisFinal: (t1 - tA) / MOIS_MS, debutFinal: tA };
}

/* Évalue une variante : signaux (une fois), puis UNE simulation continue sur [de, a). Rend { trades, stats }. */
export function evaluerVariante(ctx, famille, params, config, plage) {
  const sig = FAMILLES[famille].signaux(ctx, params), sim = sig && sig.riche ? simulerRiche(ctx.m15, sig, config, plage) : simuler(ctx.m15, sig, config, plage);
  return { params, trades: sim.trades, stats: statistiques(sim.trades, { barres: (plage.a - plage.de), risquePct: sim.config.risquePct }), ordres: sim.ordres || null };
}
const dans = (trades, de, a) => trades.filter(x => x.entree >= de && x.entree < a);
export const statsSur = (trades, de, a, config) => statistiques(dans(trades, de, a), { barres: a - de, risquePct: (config && config.risquePct) || 1 });
/* Score d'entraînement : espérance × √n (une statistique de type t) ; la variante doit avoir assez de trades. */
export const score = (st, nMin = CRITERES.recherche.tradesMin) => (st.n >= nMin && st.esperance != null ? st.esperance * Math.sqrt(st.n) : -Infinity);

/* Walk-forward : `lignes` = résultats de TOUTES les variantes d'une famille sur la zone A (une simulation continue chacune). Pour chaque bloc de test, les paramètres sont rechoisis sur l'entraînement
   seulement (de 0 au début du bloc, fenêtre croissante) ; le bloc de test n'a servi à rien pour ce choix. Les trades de tous les blocs de test sont mis bout à bout. */
export function walkForward(lignes, decoupe, config) {
  const blocs = [], tous = [];
  for (const f of decoupe.folds) {
    let meilleur = null, sc = -Infinity;
    for (const l of lignes) { const st = statsSur(l.trades.filter(x => x.sortie < f.train[1]), f.train[0], f.train[1], config), s = score(st, 15);   // purge V4 : un trade encore ouvert à la fin de l'entraînement n'est pas compté (son résultat vient du bloc de test)
      if (s > sc) { sc = s; meilleur = { l, st }; } }
    if (!meilleur) { blocs.push({ debut: f.debutTest, fin: f.finTest, params: null, entrainement: null, test: statsSur([], f.test[0], f.test[1], config) }); continue; }
    const tr = dans(meilleur.l.trades, f.test[0], f.test[1]); tous.push(...tr);
    blocs.push({ debut: f.debutTest, fin: f.finTest, params: meilleur.l.params, entrainement: meilleur.st, test: statistiques(tr, { barres: f.test[1] - f.test[0], risquePct: (config && config.risquePct) || 1 }), cle: cleParams(meilleur.l.params) });
  }
  const barres = decoupe.folds.reduce((a, f) => a + (f.test[1] - f.test[0]), 0);
  return { blocs, trades: tous, stats: statistiques(tous, { barres, risquePct: (config && config.risquePct) || 1 }), barres };
}

/* Stabilité par trimestre : { trimestres:[{cle, n, R}], part positive parmi les trimestres ayant assez de trades }. */
export function parTrimestre(trades, nMin = 2) {
  const m = new Map();
  for (const x of trades) { const d = new Date(x.t), k = d.getUTCFullYear() + 'T' + (Math.floor(d.getUTCMonth() / 3) + 1); const e = m.get(k) || { cle: k, n: 0, R: 0 }; e.n++; e.R += x.R; m.set(k, e); }
  const liste = [...m.values()].sort((a, b) => (a.cle < b.cle ? -1 : 1)), utiles = liste.filter(q => q.n >= nMin);
  return { trimestres: liste, utiles: utiles.length, positifs: utiles.filter(q => q.R > 0).length, partPositive: utiles.length ? utiles.filter(q => q.R > 0).length / utiles.length : null };
}

/* Monte Carlo (graine fixe : résultat reproductible). Ordre : on mélange l'ORDRE des trades → distribution du creux maximal ; rééchantillonnage avec remise → distribution de l'espérance. */
export function monteCarlo(trades, { simulations = CRITERES.monteCarlo.simulations, graine = 12345 } = {}) {
  const n = trades.length; if (n < 8) return null;
  const R = Float64Array.from(trades, x => x.R), a = alea(graine), dd = new Float64Array(simulations), esp = new Float64Array(simulations), tmp = Float64Array.from(R);
  for (let s = 0; s < simulations; s++) {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(a() * (i + 1)), x = tmp[i]; tmp[i] = tmp[j]; tmp[j] = x; }
    let c = 0, pic = 0, d = 0; for (let i = 0; i < n; i++) { c += tmp[i]; if (c > pic) pic = c; if (pic - c > d) d = pic - c; } dd[s] = d;
    let somme = 0; for (let i = 0; i < n; i++) somme += R[Math.floor(a() * n)]; esp[s] = somme / n;
  }
  const q = (arr, p) => { const b = Float64Array.from(arr).sort(); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
  return { ddP50: q(dd, 0.5), ddP95: q(dd, 0.95), espP5: q(esp, 0.05), espP50: q(esp, 0.5), espP95: q(esp, 0.95), simulations };
}

/* Maximum attendu du hasard : parmi N variantes sans aucun avantage, la meilleure espérance observée dépasse en moyenne σ·√(2 ln N)/√n. */
export const seuilComparaisonsMultiples = (N, sigma, n, facteur = CRITERES.comparaisonsMultiples.facteur) => (N > 1 && n > 0 && sigma > 0 ? facteur * sigma * Math.sqrt(2 * Math.log(N)) / Math.sqrt(n) : 0);

/* Robustesse : les voisins des paramètres retenus (un paramètre décalé d'un cran), évalués sur la zone de recherche. */
export function robustesse(ctx, famille, params, config, plage, gen = 0, c = CRITERES.robustesse) {
  const liste = voisins(famille, params, gen), res = [], centre = evaluerVariante(ctx, famille, params, config, plage).stats.esperance;
  for (const p of liste) { const e = evaluerVariante(ctx, famille, p, config, plage); res.push({ params: p, n: e.stats.n, esperance: e.stats.esperance }); }
  const valides = res.filter(r => r.n >= 10 && r.esperance != null), pos = valides.filter(r => r.esperance > 0).length;
  const mediane = valides.length ? valides.map(r => r.esperance).sort((a, b) => a - b)[valides.length >> 1] : null;
  return { voisins: res, testables: valides.length, partPositive: valides.length ? pos / valides.length : null, mediane, centre };
}

const ligne = (critere, valeur, seuil, ok, unite = '') => ({ critere, valeur, seuil, ok, unite });
/* Juge un ensemble de trades hors échantillon contre les critères (rend le détail critère par critère, jamais un simple oui/non). */
export function jugerHorsEchantillon(wf, { nVariantes = 1, mc = null, robuste = null, c = CRITERES } = {}) {
  const o = c.horsEchantillon, st = wf.stats, tri = parTrimestre(wf.trades, o.trimestresTradesMin), seuilMulti = seuilComparaisonsMultiples(nVariantes, st.ecartType, st.n, c.comparaisonsMultiples.facteur);
  const lignes = [
    ligne('Trades hors échantillon', st.n, '≥ ' + o.tradesMin, st.n >= o.tradesMin),
    ligne('Espérance nette (R par trade)', st.esperance, '≥ ' + o.esperanceMin, st.esperance != null && st.esperance >= o.esperanceMin, ' R'),
    ligne('Espérance > hasard attendu parmi ' + nVariantes + ' variantes', st.esperance, '> ' + seuilMulti.toFixed(2), st.esperance != null && st.esperance > seuilMulti, ' R'),
    ligne('Facteur de profit', st.factProfit, '≥ ' + o.factProfitMin, st.factProfit != null && st.factProfit >= o.factProfitMin),
    ligne('Creux maximal (R)', st.ddR, '≤ ' + o.drawdownMaxR, st.ddR <= o.drawdownMaxR, ' R'),
    ligne('Positions par semaine', st.parSemaine, o.parSemaineMin + ' à ' + o.parSemaineMax, st.parSemaine != null && st.parSemaine >= o.parSemaineMin && st.parSemaine <= o.parSemaineMax),
    ligne('Trimestres positifs (≥ ' + o.trimestresTradesMin + ' trades)', tri.partPositive, '≥ ' + Math.round(o.trimestresPositifsMin * 100) + ' %', tri.partPositive != null && tri.utiles >= 3 && tri.partPositive >= o.trimestresPositifsMin),
    ligne('Part du meilleur trade dans le gain brut', st.concentration, '≤ ' + Math.round(o.concentrationMax * 100) + ' %', st.concentration != null && st.concentration <= o.concentrationMax)
  ];
  if (mc) lignes.push(ligne('Monte Carlo : creux au 95e centile', mc.ddP95, '≤ ' + c.monteCarlo.drawdownP95MaxR, mc.ddP95 <= c.monteCarlo.drawdownP95MaxR, ' R'), ligne('Monte Carlo : espérance au 5e centile', mc.espP5, '> ' + c.monteCarlo.esperanceP5Min, mc.espP5 > c.monteCarlo.esperanceP5Min, ' R'));
  else lignes.push(ligne('Monte Carlo', null, 'échantillon suffisant', false));
  if (robuste) lignes.push(ligne('Voisins des paramètres positifs', robuste.partPositive, '≥ ' + Math.round(c.robustesse.voisinsPositifsMin * 100) + ' %', robuste.testables >= c.robustesse.voisinsMin && robuste.partPositive != null && robuste.partPositive >= c.robustesse.voisinsPositifsMin),
    ligne('Médiane des voisins vs paramètres retenus', robuste.mediane, '≥ ' + Math.round(c.robustesse.medianeVoisinsVsMeilleur * 100) + ' % de ' + (robuste.centre != null ? robuste.centre.toFixed(2) : '—'), robuste.centre > 0 && robuste.mediane != null && robuste.mediane >= c.robustesse.medianeVoisinsVsMeilleur * robuste.centre, ' R'));
  else lignes.push(ligne('Robustesse des voisins', null, 'testée', false));
  return { ok: lignes.every(l => l.ok), lignes, trimestres: tri, seuilMulti };
}
export function jugerJeuFinal(stats, c = CRITERES.jeuFinal) {
  const lignes = [ligne('Trades sur le jeu final', stats.n, '≥ ' + c.tradesMin, stats.n >= c.tradesMin), ligne('Espérance nette', stats.esperance, '≥ ' + c.esperanceMin, stats.esperance != null && stats.esperance >= c.esperanceMin, ' R'),
    ligne('Facteur de profit', stats.factProfit, '≥ ' + c.factProfitMin, stats.factProfit != null && stats.factProfit >= c.factProfitMin), ligne('Creux maximal', stats.ddR, '≤ ' + c.drawdownMaxR, stats.ddR <= c.drawdownMaxR, ' R'),
    ligne('Positions par semaine', stats.parSemaine, '≤ ' + c.parSemaineMax, stats.parSemaine != null && stats.parSemaine <= c.parSemaineMax)];
  return { ok: lignes.every(l => l.ok), lignes };
}
export { combinaisons };
