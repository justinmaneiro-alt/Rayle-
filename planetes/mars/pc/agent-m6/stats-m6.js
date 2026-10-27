import { intervalleEsperance, moments, phi, phiInv } from '../agent-btc/stats-m5.js';

/* ═════════════ STATISTIQUES HONNÊTES DE M6 (module pur, testé : m6-graphique-test.mjs et m6-eval-test.mjs) ═════════════
   Toute proportion et toute moyenne s'affiche avec sa taille d'échantillon et son incertitude. Intervalle de Wilson pour les proportions (valable même pour de petits n), loi normale pour les
   moyennes de R (déjà dans stats-m5), rééchantillonnage (bootstrap) à graine fixe pour la médiane et les cas tordus. Aucune promesse : on rend des fourchettes. */
export { intervalleEsperance, moments, phi, phiInv };

/* Intervalle de Wilson à 95 % d'une proportion k/n. */
export function wilson(k, n, niveau = 0.95) {
  if (!(n > 0)) return { p: null, bas: null, haut: null, n: 0, k: 0 };
  const z = phiInv(1 - (1 - niveau) / 2), p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return { p, bas: Math.max(0, (c - m) / d), haut: Math.min(1, (c + m) / d), n, k, niveau };
}
/* Générateur pseudo-aléatoire déterministe (mulberry32). */
export function alea(graine) { let a = graine >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/* Bootstrap de la moyenne : intervalle percentile à 95 % (graine fixe : même entrée, même sortie). */
export function bootstrapMoyenne(x, { B = 2000, graine = 12345, niveau = 0.95 } = {}) {
  const n = x.length; if (n < 5) return { bas: null, haut: null, moy: n ? x.reduce((s, y) => s + y, 0) / n : null, n };
  const a = alea(graine), m = []; for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < n; i++) s += x[Math.floor(a() * n)]; m.push(s / n); }
  m.sort((u, v) => u - v); const lo = (1 - niveau) / 2; return { bas: m[Math.floor(lo * B)], haut: m[Math.min(B - 1, Math.floor((1 - lo) * B))], moy: x.reduce((s, y) => s + y, 0) / n, n };
}
/* Résumé standard d'une liste de R : tout ce qu'il faut pour afficher « n, taux de réussite et son incertitude, R moyen et son incertitude ». */
export function resumeR(R) {
  const n = R.length; if (!n) return { n: 0, gagnants: 0, taux: wilson(0, 0), esperance: null, ic: { bas: null, haut: null }, Rtotal: 0, facteurProfit: null, sigma: null };
  const g = R.filter(x => x > 0).length, gains = R.filter(x => x > 0).reduce((s, x) => s + x, 0), pertes = -R.filter(x => x < 0).reduce((s, x) => s + x, 0), m = moments(R), ic = intervalleEsperance(R);
  return { n, gagnants: g, taux: wilson(g, n), esperance: m.moy, ic: { bas: ic.bas, haut: ic.haut }, Rtotal: R.reduce((s, x) => s + x, 0), facteurProfit: pertes > 0 ? gains / pertes : (gains > 0 ? Infinity : null), sigma: m.sigma };
}
/* Qualité de l'échantillon : mots simples, utilisés dans toutes les phrases. */
export function qualiteEchantillon(n) { return n < 10 ? 'très insuffisant' : n < 30 ? 'insuffisant' : n < 100 ? 'modeste' : n < 300 ? 'correct' : 'solide'; }
export const pct = (x, d = 0) => (x == null ? '—' : (x * 100).toFixed(d).replace('.', ',') + ' %');
export const fR = (x, d = 2) => (x == null ? '—' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d).replace('.', ',') + ' R');
export const AVERTISSEMENT = 'Ce n’est pas un conseil financier : les résultats passés ne garantissent rien, et la précision dépend de la taille de l’échantillon.';
