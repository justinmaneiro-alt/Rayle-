import { intervalleEsperance } from './stats-m5.js';

/* ═════════════ DIAGNOSTIC « QUAND ÇA MARCHE / QUAND ÇA NE MARCHE PAS » (M5 ; module pur, testé : m5-diagnostic-test.mjs) ═════════════
   Découpe les trades (déjà enrichis par contexte-trades.js) selon la phase du marché, la session, la volatilité, le jour de la semaine, la saison, le trimestre et le régime.
   Honnêteté : ces sous-groupes sont EXPLORATOIRES. Les regarder après coup pour ne garder que les bons créerait une sur-optimisation ; chaque groupe affiche sa taille d'échantillon
   et un avertissement quand elle est trop petite. Un filtre tiré d'ici doit être re-testé comme une NOUVELLE hypothèse (et compte dans le nombre de variantes). */
export const DIMENSIONS = Object.freeze([
  { cle: 'phase', nom: 'Phase du marché (H1)' }, { cle: 'regime', nom: 'Régime (hausse, baisse, range)' }, { cle: 'session', nom: 'Session' }, { cle: 'vol', nom: 'Volatilité' },
  { cle: 'jour', nom: 'Jour de la semaine' }, { cle: 'saison', nom: 'Saison' }, { cle: 'trimestre', nom: 'Trimestre' }, { cle: 'annee', nom: 'Année' }
]);
export const NMIN_GROUPE = 15;
const dec = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ','));
const signe = x => (x >= 0 ? '+' : '−') + dec(Math.abs(x));

export function statGroupe(trades) {
  const n = trades.length; if (!n) return { n: 0, esperance: null, Rtotal: 0, taux: null, factProfit: null, ic: null };
  let g = 0, p = 0, s = 0, gagn = 0; for (const x of trades) { s += x.R; if (x.R > 0) { g += x.R; gagn++; } else p += -x.R; }
  return { n, esperance: s / n, Rtotal: s, taux: gagn / n, factProfit: p > 0 ? g / p : (g > 0 ? Infinity : null), ic: intervalleEsperance(trades.map(x => x.R)) };
}
function phraseGroupe(dim, valeur, st) {
  if (st.n < NMIN_GROUPE) return dim.nom.split(' (')[0] + ' « ' + valeur + ' » : seulement ' + st.n + ' trade' + (st.n > 1 ? 's' : '') + ', trop peu pour conclure.';
  const verdict = st.ic.bas > 0 ? 'ça marche' : st.ic.haut < 0 ? 'ça ne marche pas' : st.esperance > 0 ? 'plutôt positif, mais pas assez sûr' : 'plutôt négatif, mais pas assez sûr';
  return dim.nom.split(' (')[0] + ' « ' + valeur + ' » : ' + verdict + ' (' + signe(st.esperance) + ' R par trade sur ' + st.n + ' trades, ' + Math.round(st.taux * 100) + ' % gagnants).';
}

/* Rend { global, dimensions:[{ cle, nom, groupes:[{ valeur, n, esperance, Rtotal, taux, factProfit, ic, phrase, fiable }] }], resume:[phrases], avertissement }. */
export function diagnostiquer(trades, { nomStrategie = 'la stratégie' } = {}) {
  const global = statGroupe(trades), dims = [];
  for (const dim of DIMENSIONS) {
    const m = new Map(); for (const x of trades) { const k = x[dim.cle]; if (k == null) continue; (m.get(k) || m.set(k, []).get(k)).push(x); }
    const groupes = [...m.entries()].map(([valeur, t]) => { const st = statGroupe(t); return { valeur, ...st, fiable: st.n >= NMIN_GROUPE, phrase: phraseGroupe(dim, valeur, st) }; })
      .sort((a, b) => (dim.cle === 'trimestre' || dim.cle === 'annee' ? String(a.valeur).localeCompare(String(b.valeur)) : (b.esperance == null ? -9 : b.esperance) - (a.esperance == null ? -9 : a.esperance)));
    dims.push({ cle: dim.cle, nom: dim.nom, groupes });
  }
  const resume = [];
  if (!trades.length) resume.push('Aucun trade à analyser pour ' + nomStrategie + '.');
  else {
    resume.push('Au total, ' + nomStrategie + ' fait ' + signe(global.esperance) + ' R par trade sur ' + global.n + ' trades (' + Math.round(global.taux * 100) + ' % gagnants).');
    const tous = dims.filter(d => !['trimestre', 'annee'].includes(d.cle)).flatMap(d => d.groupes.filter(g => g.fiable).map(g => ({ ...g, dim: d })));
    const bons = tous.filter(g => g.ic.bas > 0).sort((a, b) => b.esperance - a.esperance).slice(0, 3), mauvais = tous.filter(g => g.ic.haut < 0).sort((a, b) => a.esperance - b.esperance).slice(0, 3);
    if (bons.length) resume.push('Quand ça marche : ' + bons.map(g => g.dim.nom.split(' (')[0].toLowerCase() + ' « ' + g.valeur + ' » (' + signe(g.esperance) + ' R, ' + g.n + ' trades)').join(' ; ') + '.');
    else resume.push('Aucune condition ne ressort clairement comme bonne (intervalle de confiance au-dessus de zéro).');
    if (mauvais.length) resume.push('Quand ça ne marche pas : ' + mauvais.map(g => g.dim.nom.split(' (')[0].toLowerCase() + ' « ' + g.valeur + ' » (' + signe(g.esperance) + ' R, ' + g.n + ' trades)').join(' ; ') + '.');
    else resume.push('Aucune condition ne ressort clairement comme mauvaise.');
  }
  return { global, dimensions: dims, resume, avertissement: 'Exploratoire : sur beaucoup de sous-groupes, certains paraissent bons ou mauvais par hasard. Un filtre tiré d’ici doit être re-testé comme une nouvelle hypothèse.' };
}
