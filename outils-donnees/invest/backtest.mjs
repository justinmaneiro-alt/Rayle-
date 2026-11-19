/* Backtest simple des facteurs basés sur les prix : quintile du haut contre quintile du bas, mois après mois (module PUR, testé).
   Entrée : Map id → { année: [12 rendements mensuels ou null] } (voir saison.matriceMensuelle).
   Limites (écrites dans l'onglet Méthode) : biais du survivant (l'univers est celui d'aujourd'hui), pas de fondamentaux historiques « à date », coûts de transaction ignorés, 20 ans d'historique au mieux. */
const fin = x => typeof x === 'number' && Number.isFinite(x);
const moy = L => (L.length ? L.reduce((s, x) => s + x, 0) / L.length : null);
const ecart = L => { const m = moy(L); return Math.sqrt(L.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, L.length - 1)); };
/* matrice → { debut (indice de mois), r: [] } rendements consécutifs (null = manquant) */
export function enSerie(M) {
  const ys = Object.keys(M || {}).map(Number).sort((a, b) => a - b); if (!ys.length) return null; const d0 = ys[0] * 12, d1 = ys[ys.length - 1] * 12 + 11, r = new Array(d1 - d0 + 1).fill(null);
  for (const y of ys) for (let m = 0; m < 12; m++) { const v = M[y][m]; if (fin(v)) r[y * 12 + m - d0] = v; } return { debut: d0, r };
}
export const SIGNAUX = {
  /* momentum 12-1 : rendement cumulé des mois t-12 à t-2 */
  momentum: (S, i) => { if (i < 12) return null; let p = 1; for (let k = i - 12; k <= i - 2; k++) { const v = S.r[k]; if (!fin(v)) return null; p *= 1 + v; } return p - 1; },
  /* saisonnalité : rendement moyen du même mois calendaire sur les années précédentes (au moins 10) */
  saison: (S, i) => { const L = []; for (let k = i - 12; k >= 0; k -= 12) { const v = S.r[k]; if (fin(v)) L.push(v); } return L.length >= 10 ? moy(L) : null; },
  /* tendance : niveau du mois t-1 contre la moyenne des 10 derniers niveaux (équivalent mensuel de la MA200 journalière) */
  tendance: (S, i) => { if (i < 11) return null; let niv = 1; const N = []; for (let k = i - 10; k <= i - 1; k++) { const v = S.r[k]; if (!fin(v)) return null; niv *= 1 + v; N.push(niv); } return N[N.length - 1] / moy(N) - 1; }
};
export function backtest(series, signal, { minParMois = 60, quantile = 0.2, debutMin = 0 } = {}) {
  const ids = [...series.keys()], tmin = Math.min(...ids.map(id => series.get(id).debut)), tmax = Math.max(...ids.map(id => series.get(id).debut + series.get(id).r.length - 1));
  const spreads = [], hauts = [], bas = [], mois = [];
  for (let t = tmin; t <= tmax; t++) {
    if (t < debutMin) continue; const P = [];
    for (const id of ids) { const S = series.get(id), i = t - S.debut; if (i < 0 || i >= S.r.length) continue; const r = S.r[i]; if (!fin(r)) continue; const s = signal(S, i); if (fin(s)) P.push([s, r]); }
    if (P.length < minParMois) continue; P.sort((a, b) => a[0] - b[0]); const q = Math.max(1, Math.floor(P.length * quantile)), b = moy(P.slice(0, q).map(x => x[1])), h = moy(P.slice(-q).map(x => x[1]));
    spreads.push(h - b); hauts.push(h); bas.push(b); mois.push(t);
  }
  const n = spreads.length; if (n < 24) return { n, ok: false };
  const m = moy(spreads), sd = ecart(spreads), t = sd > 0 ? m / (sd / Math.sqrt(n)) : 0;
  return { ok: true, n, spreadMensuel: m, spreadAnnuel: Math.pow(1 + m, 12) - 1, hautMensuel: moy(hauts), basMensuel: moy(bas), tstat: t, tauxPositif: spreads.filter(x => x > 0).length / n, debut: mois[0], fin: mois[n - 1], moyenneTitres: Math.round(moy(ids.map(id => series.get(id).r.filter(fin).length))) };
}
/* ajustement des poids : un facteur dont l'écart haut-bas n'est pas significatif (t < 1) voit son poids divisé par deux ; négatif et significatif : poids quart */
export function ajustement(res) { if (!res || !res.ok) return 1; return res.tstat >= 1 ? 1 : res.tstat <= -1 ? 0.25 : 0.5; }
