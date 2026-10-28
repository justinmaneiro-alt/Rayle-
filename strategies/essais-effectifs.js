import { sharpeDeflate } from '../planetes/mars/pc/agent-btc/stats-m5.js';

/* ═════════════ NOMBRE EFFECTIF D'ESSAIS (V6, phase 4 ; module pur, testé : galaxie/tests/essais-effectifs-test.mjs) ═════════════
   Le problème : des milliers de variantes presque identiques (un paramètre qui bouge d'un cran) sont comptées comme des essais INDÉPENDANTS. Le Sharpe déflaté et le seuil « espérance > hasard attendu parmi N variantes »
   montent avec √(2 ln N) : compter 3 000 essais alors qu'il n'y en a que 200 de vraiment différents SUR-pénalise (seuil trop dur). À l'inverse, ne rien corriger du tout donnerait de faux positifs.
   La correction de justesse : regrouper les variantes dont les rendements JOURNALIERS sont fortement corrélés (≥ 0,8) en « amas » ; le nombre effectif d'essais est le nombre d'amas. Ce n'est PAS un assouplissement d'un seuil :
   les seuils (95 % de Sharpe déflaté, etc.) sont intacts, c'est le N du calcul qui devient juste. Elle est montrée À CÔTÉ de l'ancienne valeur ; l'ancienne reste la règle de validation tant que Justin n'a pas confirmé la nouvelle.
   Estimation : on ne garde pas les rendements de toutes les variantes de toute l'histoire ; le taux de redondance observé dans l'évaluation courante (amas ÷ variantes) est appliqué aux variantes déjà comptées avant elle.
   C'est une ESTIMATION, étiquetée comme telle. */
export const SEUIL_CORRELATION = 0.8, JOURS_MIN = 10;
const JOUR = 86400e3;

/* Rendements (en R) PAR JOUR UTC de sortie, sur [t0, t1) : un vecteur dense (0 les jours sans sortie). `trades` : { tSortie, R }. */
export function rendementsJournaliers(trades, t0, t1) {
  const j0 = Math.floor(t0 / JOUR), n = Math.max(1, Math.floor(t1 / JOUR) - j0 + 1), out = new Float64Array(n);
  for (const x of trades) { const j = Math.floor((x.tSortie != null ? x.tSortie : x.t) / JOUR) - j0; if (j >= 0 && j < n) out[j] += x.R; }
  return out;
}
export function correlation(a, b) {
  const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}
/* Amas par liaison simple (union-find) : deux variantes sont dans le même amas si leur corrélation dépasse `seuil`, directement ou par une chaîne. Les variantes avec moins de `joursMin` jours actifs sont des
   amas à elles seules (trop peu d'information pour dire qu'elles se ressemblent : on ne les fusionne pas, c'est le choix PRUDENT). */
export function nombreEffectif(matrice, { seuil = SEUIL_CORRELATION, joursMin = JOURS_MIN } = {}) {
  const N = matrice.length; if (!N) return { N: 0, nEff: 0, amas: [], ratio: 1 };
  const parent = Array.from({ length: N }, (_, i) => i), trouver = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const actifs = matrice.map(r => { let k = 0; for (let i = 0; i < r.length; i++) if (r[i] !== 0) k++; return k >= joursMin; });
  for (let i = 0; i < N; i++) { if (!actifs[i]) continue; for (let j = i + 1; j < N; j++) { if (!actifs[j] || trouver(i) === trouver(j)) continue; if (correlation(matrice[i], matrice[j]) >= seuil) parent[trouver(j)] = trouver(i); } }
  const groupes = new Map(); for (let i = 0; i < N; i++) { const r = trouver(i); if (!groupes.has(r)) groupes.set(r, []); groupes.get(r).push(i); }
  const amas = [...groupes.values()].sort((a, b) => b.length - a.length);
  return { N, nEff: amas.length, amas: amas.map(a => a.length), ratio: amas.length / N };
}
/* N effectif TOTAL : les variantes de l'évaluation courante (mesurées) + les variantes déjà comptées avant elle, ramenées au même taux de redondance. */
export function nombreEffectifTotal({ nEffCourant, nCourant, variantesAvant = 0 }) {
  const ratio = nCourant > 0 ? Math.min(1, nEffCourant / nCourant) : 1;
  return Math.max(1, Math.round(variantesAvant * ratio) + nEffCourant);
}
/* Les deux calculs côte à côte pour UN jeu de rendements `R` : ancien N (toutes les variantes) et N effectif. */
export function comparerDeflations(R, nAncien, nEffectif) {
  const a = sharpeDeflate(R, nAncien), c = sharpeDeflate(R, nEffectif);
  return { ancien: { N: nAncien, dsr: a.dsr, sr0: a.sr0 }, corrige: { N: nEffectif, dsr: c.dsr, sr0: c.sr0 }, sr: a.sr };
}
export const EXPLICATION = 'Correction de justesse du nombre d’essais : des variantes presque identiques comptent pour un seul essai (corrélation des rendements journaliers ≥ 0,8). Les seuils ne changent pas ; seul le N du calcul devient juste. Montrée à côté de l’ancienne valeur ; l’ancienne reste la règle tant que Justin n’a pas confirmé la nouvelle.';
