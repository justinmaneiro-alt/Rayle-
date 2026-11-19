/* ═════════════ SAISONNALITÉ (module PUR, testé) ═════════════
   Entrée : clôtures mensuelles [[t ms (début de mois), clôture ajustée]] sur 10 à 20 ans.
   Une fenêtre « du mois A au mois B » = on achète au début du mois A (clôture du mois précédent) et on revend à la fin du mois B (B < A : la fenêtre enjambe le nouvel an).
   Il faut au moins 10 années complètes : sinon « non significatif ». Le mois en cours (incomplet) n'est jamais compté. */
const fin = x => typeof x === 'number' && Number.isFinite(x);
export const MOIS = Object.freeze(['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']);
export const ANNEES_MIN = 10;
const med = L => { const A = L.filter(fin).sort((a, b) => a - b); if (!A.length) return null; const m = A.length >> 1; return A.length % 2 ? A[m] : (A[m - 1] + A[m]) / 2; };
/* [[t, c]] → { annees: { 2015: [r1..r12] (null si absent) } } ; le rendement du mois m est c(m)/c(m-1) - 1 */
export function matriceMensuelle(serie, maintenant = Date.now()) {
  const S = (serie || []).filter(p => fin(p[1]) && p[1] > 0).sort((a, b) => a[0] - b[0]), M = {}, dn = new Date(maintenant), cur = dn.getUTCFullYear() * 12 + dn.getUTCMonth();
  for (let i = 1; i < S.length; i++) { const d = new Date(S[i][0]), k = d.getUTCFullYear() * 12 + d.getUTCMonth(), kp = new Date(S[i - 1][0]), kk = kp.getUTCFullYear() * 12 + kp.getUTCMonth(); if (k === cur || k - kk !== 1) continue; (M[d.getUTCFullYear()] = M[d.getUTCFullYear()] || new Array(12).fill(null))[d.getUTCMonth()] = S[i][1] / S[i - 1][1] - 1; }
  return M;
}
/* rendement de la fenêtre pour une année de départ Y (mois a..b, 1..12) ; null si un mois manque */
export function rendementFenetre(M, Y, a, b) {
  let r = 1, y = Y, m = a - 1; const longueur = ((b - a + 12) % 12) + 1;
  for (let k = 0; k < longueur; k++) { const v = M[y] && M[y][m]; if (!fin(v)) return null; r *= 1 + v; m++; if (m > 11) { m = 0; y++; } }
  return r - 1;
}
/* statistiques de la fenêtre ; `Mb` = matrice de l'indice de référence (rendement en excès) */
export function statsFenetre(M, a, b, Mb = null) {
  const R = [], E = [];
  for (const y of Object.keys(M || {}).map(Number).sort((x, z) => x - z)) { const r = rendementFenetre(M, y, a, b); if (r == null) continue; const rb = Mb ? rendementFenetre(Mb, y, a, b) : null; R.push({ y, r }); if (rb != null) E.push(r - rb); }
  const n = R.length, rs = R.map(x => x.r);
  return { n, significatif: n >= ANNEES_MIN, median: med(rs), moyenne: n ? rs.reduce((s, x) => s + x, 0) / n : null, pctPositif: n ? rs.filter(x => x > 0).length / n : null, excesMedian: E.length >= ANNEES_MIN ? med(E) : null, nExces: E.length, pire: n ? Math.min(...rs) : null, meilleur: n ? Math.max(...rs) : null, annees: R };
}
/* meilleures fenêtres de 1 à 6 mois : classées par rendement médian parmi celles qui sont positives au moins 70 % des années */
export function meilleuresFenetres(M, Mb = null, max = 5) {
  const L = []; for (let a = 1; a <= 12; a++) for (let d = 1; d <= 6; d++) { const b = ((a - 1 + d - 1) % 12) + 1, s = statsFenetre(M, a, b, Mb); if (s.significatif && s.median != null) L.push({ a, b, duree: d, ...s, annees: undefined }); }
  return L.filter(x => x.pctPositif >= 0.7 && x.median > 0).sort((x, y) => y.median - x.median).slice(0, max);
}
/* fenêtre par défaut : du mois suivant sur 4 mois (« j'achète le mois prochain, je revends dans 4 mois ») */
export function fenetreDefaut(maintenant = Date.now()) { const m = new Date(maintenant).getUTCMonth() + 1, a = (m % 12) + 1, b = ((a - 1 + 3) % 12) + 1; return { a, b }; }
export const libelleFenetre = (a, b) => (a === b ? MOIS[a - 1] : `${MOIS[a - 1]} → ${MOIS[b - 1]}`);
/* heatmap mois × année : lignes = années, 12 colonnes (null = pas de donnée) */
export const carteChaleur = M => Object.keys(M || {}).map(Number).sort((x, y) => y - x).map(y => ({ y, mois: M[y] }));
/* encodage compact pour les fichiers : rendements en dixièmes de % entiers, année de départ */
export function encoder(M) { const ys = Object.keys(M).map(Number).sort((a, b) => a - b); if (!ys.length) return null; const y0 = ys[0], L = []; for (let y = y0; y <= ys[ys.length - 1]; y++) for (let m = 0; m < 12; m++) { const v = M[y] && M[y][m]; L.push(fin(v) ? Math.max(-999, Math.min(999, Math.round(v * 1000))) : null); } return { y0, r: L }; }
export function decoder(o) { if (!o) return {}; const M = {}; o.r.forEach((v, i) => { const y = o.y0 + Math.floor(i / 12); (M[y] = M[y] || new Array(12).fill(null))[i % 12] = fin(v) ? v / 1000 : null; }); return M; }
