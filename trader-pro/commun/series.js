/* ═════════════ SÉRIES JOURNALIÈRES : alignement par date, rendements, matrice de corrélations, corrélation glissante ═════════════
   Une série = [{ d: 'AAAA-MM-JJ', t (ms), c }]. Les jours manquants d'un actif (week-end, jours fériés) sont simplement absents : on ne remplit jamais un trou par une valeur inventée. */
import { correlation, moyenne, ecartType } from './analyse.js';

export const jourUtc = t => new Date(t).toISOString().slice(0, 10);
/* instantané « jour-XXX.json » du robot : { b: [[t, clôture, clôture ajustée]] } → série */
export function depuisSnapshotJour(d) {
  const B = d && Array.isArray(d.b) ? d.b : []; const out = []; let prec = null;
  for (const x of B) { const c = x[2] != null ? x[2] : x[1]; if (!Number.isFinite(c) || c <= 0) continue; const j = jourUtc(x[0]); if (j === prec) out[out.length - 1] = { d: j, t: x[0], c }; else out.push({ d: j, t: x[0], c }); prec = j; }
  return out;
}
export const depuisBougies = B => { const out = []; let prec = null; for (const b of B || []) { if (!(b.c > 0)) continue; const j = jourUtc(b.t); if (j === prec) out[out.length - 1] = { d: j, t: b.t, c: b.c }; else out.push({ d: j, t: b.t, c: b.c }); prec = j; } return out; };

/* Rendements log sur les dates COMMUNES aux deux séries (deux jours consécutifs présents dans les deux) */
export function rendementsCommuns(A, B) {
  const mb = new Map(B.map(x => [x.d, x.c])), com = A.filter(x => mb.has(x.d)), ra = [], rb = [], dates = [];
  for (let i = 1; i < com.length; i++) { const a0 = com[i - 1].c, a1 = com[i].c, b0 = mb.get(com[i - 1].d), b1 = mb.get(com[i].d); if (a0 > 0 && a1 > 0 && b0 > 0 && b1 > 0) { ra.push(Math.log(a1 / a0)); rb.push(Math.log(b1 / b0)); dates.push(com[i].d); } }
  return { ra, rb, dates };
}
/* Variation simple (différence) pour les taux : un taux peut valoir 0 ou baisser en négatif, le log n'a pas de sens */
export function differencesCommunes(A, B) {
  const mb = new Map(B.map(x => [x.d, x.c])), com = A.filter(x => mb.has(x.d)), ra = [], rb = [], dates = [];
  for (let i = 1; i < com.length; i++) { ra.push(com[i].c - com[i - 1].c); rb.push(mb.get(com[i].d) - mb.get(com[i - 1].d)); dates.push(com[i].d); }
  return { ra, rb, dates };
}
export function corrFenetre(A, B, jours, { taux = false } = {}) {
  const { ra, rb } = (taux ? differencesCommunes : rendementsCommuns)(A, B); const n = Math.min(jours, ra.length); if (n < 10) return { r: null, n };
  return { r: correlation(ra.slice(-n), rb.slice(-n)), n };
}
/* Matrice pour { id: série } sur une fenêtre de jours ; `taux` = ids traités en différences */
export function matrice(S, ids, jours, taux = []) {
  return ids.map(a => ids.map(b => (a === b ? { r: 1, n: jours } : corrFenetre(S[a] || [], S[b] || [], jours, { taux: taux.includes(a) || taux.includes(b) }))));
}
/* Corrélation glissante sur `fen` jours ; renvoie [{ d, r }] */
export function glissante(A, B, fen, opts = {}) {
  const { ra, rb, dates } = (opts.taux ? differencesCommunes : rendementsCommuns)(A, B), out = [];
  for (let i = fen; i <= ra.length; i++) out.push({ d: dates[i - 1], r: correlation(ra.slice(i - fen, i), rb.slice(i - fen, i)) });
  return out;
}
/* p-value approchée de la corrélation (test de Student bilatéral, approximation normale de la loi t pour n ≥ 30 ; sinon table courte) et intervalle de confiance 95 % (transformée de Fisher) */
export function significativite(r, n) {
  if (r == null || n < 5) return { p: null, ic: null };
  const rr = Math.max(-0.999999, Math.min(0.999999, r)), z = 0.5 * Math.log((1 + rr) / (1 - rr)), se = 1 / Math.sqrt(Math.max(1, n - 3));
  const ic = [Math.tanh(z - 1.96 * se), Math.tanh(z + 1.96 * se)], t = Math.abs(rr) * Math.sqrt((n - 2) / (1 - rr * rr));
  const p = Math.min(1, 2 * (1 - cdfNormale(t * (1 - 1 / (4 * Math.max(1, n - 2))) / Math.sqrt(1 + t * t / (2 * Math.max(1, n - 2))))));
  return { p, ic };
}
function cdfNormale(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x >= 0 ? 1 - p : p; }
export { moyenne, ecartType };

/* Rendement log d'un actif (A) face à la VARIATION d'un taux (B) sur les dates communes */
export function rendementsMixtes(A, Btaux) {
  const mb = new Map(Btaux.map(x => [x.d, x.c])), com = A.filter(x => mb.has(x.d)), ra = [], rb = [], dates = [];
  for (let i = 1; i < com.length; i++) { const a0 = com[i - 1].c, a1 = com[i].c; if (a0 > 0 && a1 > 0) { ra.push(Math.log(a1 / a0)); rb.push(mb.get(com[i].d) - mb.get(com[i - 1].d)); dates.push(com[i].d); } }
  return { ra, rb, dates };
}
export function corrActifTaux(A, Btaux, jours) { const { ra, rb } = rendementsMixtes(A, Btaux), n = Math.min(jours, ra.length); return n < 10 ? { r: null, n } : { r: correlation(ra.slice(-n), rb.slice(-n)), n }; }
