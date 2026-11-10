/* Statistiques communes (pures). */
export const moyenne = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export const ecart = a => { if (a.length < 2) return 0; const m = moyenne(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
export function resume(R) { const n = R.length, m = moyenne(R), sd = ecart(R), se = n > 1 ? sd / Math.sqrt(n) : Infinity; return { n, moy: m, sd, ic95: [m - 1.96 * se, m + 1.96 * se], gain: n ? R.filter(x => x > 0).length / n : 0, somme: R.reduce((s, x) => s + x, 0) }; }
export function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
export const phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
export function prng(graine) { let a = graine >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/* Holm : p ajustés (même ordre que l'entrée) */
export function holm(ps) { const m = ps.length, ord = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), adj = new Array(m); let max = 0; ord.forEach(([p, i], k) => { max = Math.max(max, Math.min(1, p * (m - k))); adj[i] = max; }); return adj; }
export const parAnnee = (T, cle) => { const m = new Map(); for (const t of T) { if (!m.has(t.an)) m.set(t.an, []); m.get(t.an).push(t[cle]); } return m; };
