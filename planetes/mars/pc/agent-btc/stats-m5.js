/* ═════════════ STATISTIQUES ANTI-HASARD (M5 ; module pur, testé : planetes/mars/tests/m5-stats-test.mjs) ═════════════
   Une recherche sans fin finit toujours par trouver une « belle » stratégie par chance. Ce module fournit :
   - le Sharpe DÉFLATÉ (Bailey et López de Prado) : la probabilité que le vrai ratio de la stratégie dépasse le meilleur ratio que le HASARD seul produirait parmi toutes les variantes testées ;
   - l'intervalle de confiance de l'espérance (en R par trade) ;
   - le ratio de Sharpe par trade, l'asymétrie et le kurtosis (le déflaté en tient compte).
   Explication simple pour l'utilisateur : « sur N idées sans aucune valeur, la meilleure paraît toujours bonne ; plus on teste d'idées, plus la barre monte ». */
const EULER = 0.5772156649015329;

/* Fonction de répartition de la loi normale centrée réduite (erreur < 1e-7). */
export function phi(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
/* Inverse de la répartition normale (algorithme d'Acklam, erreur relative < 1,2e-9). */
export function phiInv(p) {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const bas = 0.02425;
  if (p < bas) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - bas) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/* Moments d'une liste de R : moyenne, écart-type, asymétrie (γ3), kurtosis (γ4, 3 pour une loi normale). */
export function moments(R) {
  const n = R.length; if (n < 2) return { n, moy: n ? R[0] : null, sigma: null, gamma3: 0, gamma4: 3 };
  let s = 0; for (const x of R) s += x; const moy = s / n;
  let m2 = 0, m3 = 0, m4 = 0; for (const x of R) { const d = x - moy; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
  m2 /= n; m3 /= n; m4 /= n; const sigma = Math.sqrt(m2 * n / (n - 1));
  return { n, moy, sigma, gamma3: m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0, gamma4: m2 > 0 ? m4 / (m2 * m2) : 3 };
}

/* Ratio de Sharpe PAR TRADE (espérance ÷ écart-type, sans annualiser). */
export const sharpeParTrade = R => { const m = moments(R); return m.sigma > 0 ? m.moy / m.sigma : null; };

/* Meilleur ratio attendu du HASARD parmi N variantes sans aucun avantage (SR0). `varianceSR` = variance du ratio estimé quand le vrai ratio est nul (≈ 1/n par trade). */
export function sharpeHasard(N, varianceSR) {
  if (!(N > 1) || !(varianceSR > 0)) return 0;
  return Math.sqrt(varianceSR) * ((1 - EULER) * phiInv(1 - 1 / N) + EULER * phiInv(1 - 1 / (N * Math.E)));
}

/* Sharpe DÉFLATÉ : probabilité que le vrai ratio dépasse SR0 (le maximum du hasard parmi N variantes). Rend { dsr, sr, sr0, N, n }.
   `varianceObservee` (facultatif) = variance observée des ratios des variantes testées : si elle est plus grande que l'hypothèse nulle (1/n), on prend la plus grande (barre plus haute). */
export function sharpeDeflate(R, N, { varianceObservee = null } = {}) {
  const m = moments(R); if (m.n < 10 || !(m.sigma > 0)) return { dsr: null, sr: null, sr0: null, N, n: m.n };
  const sr = m.moy / m.sigma, nulle = 1 / m.n, v = Math.max(nulle, varianceObservee || 0), sr0 = sharpeHasard(N, v);
  const denom = Math.sqrt(Math.max(1e-12, 1 - m.gamma3 * sr + (m.gamma4 - 1) / 4 * sr * sr));
  return { dsr: phi((sr - sr0) * Math.sqrt(m.n - 1) / denom), sr, sr0, N, n: m.n };
}

/* Intervalle de confiance de l'espérance (loi normale, valable dès ~30 trades ; à 150 trades l'erreur est faible). niveau = 0,95 par défaut. */
export function intervalleEsperance(R, niveau = 0.95) {
  const m = moments(R); if (m.n < 5 || !(m.sigma >= 0)) return { bas: null, haut: null, moy: m.moy, n: m.n };
  const z = phiInv(1 - (1 - niveau) / 2), e = z * m.sigma / Math.sqrt(m.n);
  return { bas: m.moy - e, haut: m.moy + e, moy: m.moy, n: m.n, niveau };
}

/* Phrase simple sur le Sharpe déflaté, pour l'interface. */
export function phraseDeflation(d, N) {
  if (!d || d.dsr == null) return 'Trop peu de trades pour mesurer l’effet du hasard.';
  const p = Math.round(d.dsr * 100);
  return 'Après ' + N.toLocaleString('fr-FR') + ' variantes testées, le hasard seul pouvait produire un ratio de ' + d.sr0.toFixed(3).replace('.', ',') + ' par trade ; cette stratégie fait ' + d.sr.toFixed(3).replace('.', ',') + '. Probabilité que son avantage soit réel et pas de la chance : ' + p + ' %.';
}
