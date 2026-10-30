import { simuler, COUTS_TRADER } from './suivi.js';
import { fr } from './outils.js';

/* ═════════════ BILAN HONNÊTE DES PROPOSITIONS DU MODE TRADER (V12, phase 3 ; module pur, testé : galaxie/tests/trader-bilan-test.mjs) ═════════════
   Pour chaque type de setup (setup × actif × unité de temps), chaque actif, chaque style : propositions, entrées exécutées, taux de réussite, RR réalisé, espérance en R avec intervalle de confiance,
   drawdown, comparaison avec des entrées au hasard de même fréquence. Les petits échantillons sont dits tels quels : « 22 trades : peut être de la chance ». Le bilan ne distingue jamais un trade
   « en avant » (suivi en direct) d'un trade « rétro-test » sans le dire : seuls les premiers comptent comme preuve. */
const T975 = [0, 12.71, 4.3, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.2, 2.18, 2.16, 2.14, 2.13, 2.12, 2.11, 2.1, 2.09, 2.09, 2.08, 2.07, 2.07, 2.06, 2.06, 2.06, 2.05, 2.05, 2.05, 2.04];
export const tCrit = df => (df < 1 ? Infinity : df <= 30 ? T975[df] : df <= 60 ? 2.0 : df <= 120 ? 1.98 : 1.96);
const moy = l => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);

/* Statistiques d'une liste de R nets. `ic` : intervalle de confiance à 95 % de l'espérance (loi de Student). */
export function statsR(R) {
  const n = R.length; if (!n) return { n: 0, esperance: null, ic: null, taux: null, rrRealise: null, total: 0, drawdown: 0, serieMax: 0, honnete: 'Aucun trade terminé : rien à juger.' };
  const m = moy(R), sd = n > 1 ? Math.sqrt(R.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)) : null, marge = sd == null ? null : tCrit(n - 1) * sd / Math.sqrt(n);
  const g = R.filter(x => x > 0), p = R.filter(x => x <= 0);
  let cum = 0, pic = 0, dd = 0, serie = 0, pire = 0; for (const x of R) { cum += x; pic = Math.max(pic, cum); dd = Math.max(dd, pic - cum); if (x <= 0) { serie++; pire = Math.max(pire, serie); } else serie = 0; }
  const out = { n, esperance: m, ic: marge == null ? null : [m - marge, m + marge], taux: g.length / n, rrRealise: g.length && p.length ? moy(g) / -moy(p) : null, total: cum, drawdown: dd, serieMax: pire, facteurProfit: p.length && moy(p) !== 0 ? (g.reduce((a, b) => a + b, 0)) / -p.reduce((a, b) => a + b, 0) : null };
  out.honnete = phraseEchantillon(out); return out;
}
export function phraseEchantillon(s) {
  if (!s.n) return 'Aucun trade terminé : rien à juger.';
  const base = s.n + ' trade' + (s.n > 1 ? 's' : '') + ' : ';
  if (s.n < 30) return base + 'pas assez de trades pour juger — ' + (s.esperance > 0 ? 'ce résultat positif peut être de la chance.' : 'ce résultat négatif peut aussi être de la malchance.');
  if (s.ic && s.ic[0] > 0) return base + 'espérance positive, intervalle de confiance entièrement au-dessus de zéro ; à confirmer en avant, pas une promesse.';
  if (s.ic && s.ic[1] < 0) return base + 'espérance négative, intervalle entièrement sous zéro : ce type de setup perd de façon régulière.';
  return base + 'résultat compatible avec zéro : on ne peut pas dire que ça marche (ni que ça perd).';
}
export const texteStats = s => (!s.n ? 'aucun trade' : s.n + ' trades · ' + (s.esperance >= 0 ? '+' : '−') + fr(Math.abs(s.esperance), 2) + ' R/trade' + (s.ic ? ' [' + fr(s.ic[0], 2) + ' ; ' + fr(s.ic[1], 2) + ']' : '') + ' · réussite ' + Math.round(s.taux * 100) + ' %');

/* Génère un petit aléa reproductible. */
function alea(graine) { let a = graine >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* Entrées AU HASARD de même fréquence et mêmes distances (stop, cibles en % du prix, durée) sur la même période : l'espérance moyenne de `tirages` essais. C'est la barre à battre. */
export function hasardMemeFrequence(m15, props, { couts = COUTS_TRADER, tirages = 12, graine = 20261030, gestion = 'partielle' } = {}) {
  const util = props.filter(p => p.entree && p.stop && p.cible1); if (util.length < 5) return { assez: false, n: util.length };
  const i0 = Math.min(...util.map(p => p.i)), i1 = Math.max(...util.map(p => p.i)), a = alea(graine), moyens = [];
  for (let s = 0; s < tirages; s++) {
    const R = [];
    for (const p of util) {
      const i = i0 + Math.floor(a() * Math.max(1, i1 - i0)), d = a() < 0.5 ? 1 : -1, px = m15.c[i], f = px / p.entree, rs = Math.abs(p.entree - p.stop) * f, off = Math.abs(p.entree - m15.c[p.i]) * f;
      const E = px - d * Math.max(off, 0.0003 * px), q = { i, sens: d, entree: E, stop: E - d * rs, cible1: E + d * Math.abs(p.cible1 - p.entree) * f, cible2: E + d * Math.abs(p.cible2 - p.entree) * f, ttl: p.ttl, atr: p.atr * f };
      const r = simuler(m15, q, { couts, gestion }); if (r.statut === 'cloturee') R.push(r.R);
    }
    if (R.length) moyens.push(moy(R));
  }
  return { assez: moyens.length > 0, n: util.length, esperance: moyens.length ? moy(moyens) : null, tirages: moyens.length };
}

/* Regroupe des propositions (avec `resultat` si terminées) et rend le tableau de bord par dimension. `cle` : fonction de regroupement. */
export function parDimension(props, cle) {
  const m = new Map(); for (const p of props) { const k = cle(p); if (!m.has(k)) m.set(k, []); m.get(k).push(p); }
  return [...m.entries()].map(([k, l]) => ligneBilan(k, l)).sort((a, b) => (b.stats.esperance ?? -9) - (a.stats.esperance ?? -9));
}
export function ligneBilan(cle, l) {
  const closes = l.filter(p => p.resultat && p.resultat.statut === 'cloturee'), R = closes.map(p => p.resultat.R), stats = statsR(R);
  return { cle, propositions: l.length, executees: closes.length + l.filter(p => p.resultat && p.resultat.statut === 'ouverte').length, enAttente: l.filter(p => !p.resultat || p.resultat.statut === 'en_attente').length,
    expirees: l.filter(p => p.resultat && (p.resultat.statut === 'expiree' || p.resultat.statut === 'annulee')).length, stats, resultatPct: null };
}
export const cleType = p => p.setup + '|' + p.actif + '|' + p.tf;
export const nomType = (p, SETUPS) => (SETUPS[p.setup] || p.setup) + ' · ' + p.actif + ' · ' + p.tf;

/* Bilan complet : par type, par actif, par unité de temps, par style, résultat total en % (au risque `risquePct` par trade). */
export function bilanTrader(props, { risquePct = 0.5, m15ParActif = null, couts = COUTS_TRADER } = {}) {
  const tout = ligneBilan('tous', props), res = {
    tous: tout, parType: parDimension(props, cleType), parActif: parDimension(props, p => p.actif), parTf: parDimension(props, p => p.tf), parStyle: parDimension(props, p => p.style || 'equilibre'), parSetup: parDimension(props, p => p.setup),
    risquePct, totalPct: tout.stats.total * risquePct
  };
  if (m15ParActif) {
    const h = {}; for (const a of Object.keys(m15ParActif)) h[a] = hasardMemeFrequence(m15ParActif[a], props.filter(p => p.actif === a), { couts }); res.hasard = h;
  }
  res.phrase = tout.stats.n ? tout.stats.honnete + ' (' + (res.totalPct >= 0 ? '+' : '−') + fr(Math.abs(res.totalPct), 1) + ' % à ' + fr(risquePct, 1).replace(',0', '') + ' % de risque par trade — estimation à partir du passé, pas une promesse).' : 'Aucun trade simulé terminé pour l’instant : le bilan se construit en direct.';
  return res;
}
/* Objectif hebdomadaire (+1 % / +2 %) comparé aux résultats SIMULÉS : part de semaines atteintes, jamais une promesse. */
export function objectifHebdo(props, { risquePct = 0.5, maintenant = Date.now() } = {}) {
  const JOUR = 86400e3, closes = props.filter(p => p.resultat && p.resultat.statut === 'cloturee' && p.tSortie); if (!closes.length) return { n: 0, phrase: 'Pas encore de semaine complète simulée. Un objectif n’est pas une promesse.' };
  const sem = t => Math.floor((t / JOUR + 3) / 7), par = new Map(); for (const p of closes) par.set(sem(p.tSortie), (par.get(sem(p.tSortie)) || 0) + p.resultat.R * risquePct);
  const s0 = sem(Math.min(...closes.map(p => p.t))), s1 = sem(maintenant) - 1; if (s1 < s0) return { n: 0, phrase: 'Pas encore de semaine complète simulée. Un objectif n’est pas une promesse.' };
  const l = []; for (let s = s0; s <= s1; s++) l.push(par.get(s) || 0);
  const p1 = l.filter(x => x >= 1).length, p2 = l.filter(x => x >= 2).length;
  return { n: l.length, moyenne: moy(l), part1: p1 / l.length, part2: p2 / l.length, semaines: l, phrase: 'Sur ' + l.length + ' semaine(s) simulée(s) : ' + p1 + ' à +1 % ou plus, ' + p2 + ' à +2 % ou plus ; moyenne ' + (moy(l) >= 0 ? '+' : '−') + fr(Math.abs(moy(l)), 2) + ' % par semaine. Estimation à partir du passé, pas une promesse.' };
}
