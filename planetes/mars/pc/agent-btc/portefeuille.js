import { statistiques } from './moteur.js';

/* ═════════════ PORTEFEUILLE DE STRATÉGIES (M5 ; module pur, testé : m5-portefeuille-test.mjs) ═════════════
   Corrélation entre stratégies (sur les R journaliers, jours sans trade = 0), courbe de capital combinée, chevauchements de positions.
   Règle du portefeuille : une seule position à la fois par défaut (réglable) : si une stratégie signale pendant qu'une position d'une autre est ouverte, ce trade est ÉCARTÉ et compté.
   Les trades d'entrée sont ceux du HORS ÉCHANTILLON (walk-forward) ou du compte simulé : jamais ceux d'entraînement. */
const JOUR = 86400e3;
const jourDe = t => Math.floor(t / JOUR);

/* R par jour UTC (jour de SORTIE : c'est quand le résultat est connu). */
export function serieJournaliere(trades, debutJour, finJour) {
  const n = finJour - debutJour + 1, out = new Float64Array(Math.max(0, n));
  for (const x of trades) { const k = jourDe(x.tSortie != null ? x.tSortie : x.t) - debutJour; if (k >= 0 && k < n) out[k] += x.R; }
  return out;
}
export function correlation(a, b) {
  const n = Math.min(a.length, b.length); if (n < 3) return null;
  let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null;
}
/* strategies = [{ id, nom, trades:[{ t, tSortie, R, … }] }]. Rend la matrice des corrélations et la corrélation moyenne hors diagonale. */
export function correlations(strategies) {
  const tous = strategies.flatMap(s => s.trades); if (!tous.length) return { ids: strategies.map(s => s.id), noms: strategies.map(s => s.nom), matrice: strategies.map(() => strategies.map(() => null)), moyenne: null };
  const d0 = Math.min(...tous.map(x => jourDe(x.t))), d1 = Math.max(...tous.map(x => jourDe(x.tSortie != null ? x.tSortie : x.t)));
  const series = strategies.map(s => serieJournaliere(s.trades, d0, d1)), m = strategies.map((_, i) => strategies.map((__, j) => (i === j ? 1 : correlation(series[i], series[j]))));
  const hors = []; for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) if (m[i][j] != null) hors.push(m[i][j]);
  return { ids: strategies.map(s => s.id), noms: strategies.map(s => s.nom), matrice: m, moyenne: hors.length ? hors.reduce((a, b) => a + b, 0) / hors.length : null };
}
/* Chevauchements : paires de trades de stratégies différentes dont les durées se recouvrent. */
export function chevauchements(strategies) {
  const tr = strategies.flatMap(s => s.trades.map(x => ({ id: s.id, nom: s.nom, a: x.t, b: x.tSortie != null ? x.tSortie : x.t }))).sort((u, v) => u.a - v.a), paires = [];
  for (let i = 0; i < tr.length; i++) for (let j = i + 1; j < tr.length && tr[j].a < tr[i].b; j++) if (tr[i].id !== tr[j].id) paires.push([tr[i], tr[j]]);
  return { nombre: paires.length, paires: paires.slice(0, 50) };
}
/* Portefeuille combiné : parcourt les trades par date d'entrée, accepte un trade si moins de `maxSimultanees` positions sont ouvertes. */
export function combiner(strategies, { maxSimultanees = 1, risquePct = 1 } = {}) {
  const tous = strategies.flatMap(s => s.trades.map(x => ({ ...x, strategie: s.id, nomStrategie: s.nom }))).sort((a, b) => a.t - b.t), acceptes = [], ecartes = [], ouverts = [];
  for (const x of tous) {
    for (let k = ouverts.length - 1; k >= 0; k--) if (ouverts[k] <= x.t) ouverts.splice(k, 1);
    if (ouverts.length >= maxSimultanees) { ecartes.push(x); continue; }
    ouverts.push(x.tSortie != null ? x.tSortie : x.t); acceptes.push(x);
  }
  const barres = tous.length ? Math.round((Math.max(...tous.map(x => x.tSortie != null ? x.tSortie : x.t)) - Math.min(...tous.map(x => x.t))) / 900e3) : 0;
  const stats = statistiques(acceptes.map(x => ({ ...x, barres: x.barres || 1, sens: x.sens || 1 })), { barres, risquePct });
  return { acceptes, ecartes, stats, courbeR: stats.courbeR, parStrategie: strategies.map(s => ({ id: s.id, nom: s.nom, acceptes: acceptes.filter(x => x.strategie === s.id).length, ecartes: ecartes.filter(x => x.strategie === s.id).length })) };
}
export function phrasePortefeuille(corr, comb) {
  const l = [];
  if (corr.moyenne == null) l.push('Une seule stratégie, ou trop peu de trades communs : pas de corrélation à mesurer.');
  else l.push('Corrélation moyenne entre stratégies : ' + corr.moyenne.toFixed(2).replace('.', ',') + (corr.moyenne < 0.3 ? ' (bien complémentaires).' : corr.moyenne < 0.6 ? ' (moyennement complémentaires).' : ' (assez semblables : peu de diversification).'));
  if (comb && comb.ecartes.length) l.push(comb.ecartes.length + ' trade(s) écarté(s) parce qu’une autre position était déjà ouverte.');
  return l;
}
