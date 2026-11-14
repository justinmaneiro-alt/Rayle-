/* Statistiques descriptives par actif (PURES, sans navigateur) : SMA, RSI de Wilder, tendance, multi-échelles de temps, score descriptif.
   Ce sont des LECTURES, jamais des signaux d'achat ou de vente. Testées : agent-trading/tests/marches-fenetre-test.mjs. */
export const H1MS = 3600e3;
export function smaSerie(c, n) { const o = new Array(c.length).fill(null); let s = 0; for (let i = 0; i < c.length; i++) { s += c[i]; if (i >= n) s -= c[i - n]; if (i >= n - 1) o[i] = s / n; } return o; }
export function rsiSerie(c, n = 14) {
  const o = new Array(c.length).fill(null); if (c.length <= n) return o; let g = 0, p = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d >= 0) g += d; else p -= d; } g /= n; p /= n; o[n] = p === 0 ? 100 : 100 - 100 / (1 + g / p);
  for (let i = n + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; p = (p * (n - 1) + Math.max(-d, 0)) / n; o[i] = p === 0 ? 100 : 100 - 100 / (1 + g / p); }
  return o;
}
export function atrSimple(B, n = 14) { if (!B || B.length < 2) return null; const k = Math.min(n, B.length - 1); let s = 0; for (let i = B.length - k; i < B.length; i++) s += Math.max(B[i].h - B[i].l, Math.abs(B[i].h - B[i - 1].c), Math.abs(B[i].l - B[i - 1].c)); return s / k; }
export const derniere = a => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; };
/* H1 → bougies de ms millisecondes alignées sur l'UTC */
export function agreger(B, ms) { const o = []; let cur = null; for (const b of B) { const t0 = Math.floor(b.t / ms) * ms; if (!cur || cur.t !== t0) { cur = { t: t0, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 }; o.push(cur); } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v || 0; } } return o; }
/* tendance d'une série : la MA lente si elle existe (200, sinon 50, sinon 20), le prix et la pente de la MA — décrit, ne prédit pas */
export function tendance(B) {
  const c = (B || []).map(b => b.c).filter(Number.isFinite), n = c.length; if (n < 30) return { sens: 'indéterminée', raison: `seulement ${n} bougies`, n };
  const lent = n >= 210 ? 200 : n >= 60 ? 50 : 20, ma = smaSerie(c, lent), m = ma[n - 1], recul = Math.min(20, n - lent), m0 = ma[n - 1 - recul];
  const ecart = (c[n - 1] / m - 1) * 100, pente = m0 ? (m / m0 - 1) * 100 : 0;
  const sens = Math.abs(ecart) < 0.15 && Math.abs(pente) < 0.1 ? 'neutre' : ecart > 0 && pente >= -0.05 ? 'haussière' : ecart < 0 && pente <= 0.05 ? 'baissière' : 'neutre';
  return { sens, raison: `prix ${ecart >= 0 ? 'au-dessus' : 'sous'} la moyenne ${lent} (${ecart >= 0 ? '+' : ''}${ecart.toFixed(2)} %), pente ${pente >= 0 ? '+' : ''}${pente.toFixed(2)} %`, ma: lent, ecartPct: ecart, pentePct: pente, n };
}
const SIGNE = { 'haussière': 1, 'baissière': -1 };
export function scoreMTF(t) {
  const L = Object.entries(t).filter(([, v]) => v && v.sens && v.sens !== 'indéterminée'); const s = L.reduce((a, [, v]) => a + (SIGNE[v.sens] || 0), 0);
  return { score: s, sur: L.length, texte: !L.length ? 'indéterminé' : s === L.length ? `haussier sur ${L.length} échelles de temps sur ${L.length}` : s === -L.length ? `baissier sur ${L.length} échelles de temps sur ${L.length}` : `mitigé (${s >= 0 ? '+' : ''}${s} sur ${L.length})` };
}
/* analyse complète d'un actif : series = { M15?, H1?, J? } de bougies {t,o,h,l,c,v} */
export function analyseActif(series) {
  const H1 = series.H1 || [], J = series.J || [], M15 = series.M15 || [], H4 = H1.length ? agreger(H1, 4 * H1MS) : [];
  const t = { M15: tendance(M15), H1: tendance(H1), H4: tendance(H4), J: tendance(J) };
  const cJ = J.map(b => b.c), cH = H1.map(b => b.c), rJ = rsiSerie(cJ), rH = rsiSerie(cH), dernier = H1.length ? H1[H1.length - 1] : (J.length ? J[J.length - 1] : null);
  return { tendances: t, mtf: scoreMTF(t), rsiJ: derniere(rJ), rsiH1: derniere(rH), atrH1: atrSimple(H1), prix: dernier ? dernier.c : null, tDernier: dernier ? dernier.t : null, nBarres: { M15: M15.length, H1: H1.length, J: J.length } };
}
