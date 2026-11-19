/* ═════════════ MESURES DE PRIX : momentum, tendance MA200, risque, setup tactique (module PUR, testé) ═════════════
   Entrée : bougies journalières { t (ms), o, h, l, c, v } du plus ancien au plus récent (5 ans), et les bougies de l'indice de référence du pays.
   Rien n'est inventé : moins de données qu'il n'en faut → null. Les flèches MA200 Daily sont celles du Terminal (trader-pro/terminal/ma200-h4.js), jamais recalculées autrement. */
import { sma, atr, niveauxCles, regrouper, rendements, ecartType, moyenne } from '../commun/analyse.js';
import { analyserUnite } from '../terminal/ma200-h4.js';

const J = 86400e3, fin = x => typeof x === 'number' && Number.isFinite(x);
const perf = (c, k, depuis = 0) => { const n = c.length, a = c[n - 1 - depuis], b = c[n - 1 - depuis - k]; return fin(a) && fin(b) && b > 0 ? a / b - 1 : null; };
const cle = t => Math.floor(t / J);
/* bêta sur 3 ans : pente des rendements journaliers du titre contre ceux de l'indice, alignés par jour */
export function beta(B, I, jours = 756) {
  if (!B || !I || B.length < 120 || I.length < 120) return null;
  const mi = new Map(); for (const b of I.slice(-jours - 5)) mi.set(cle(b.t), b.c);
  const X = [], Y = []; let prev = null;
  for (const b of B.slice(-jours - 5)) { const k = cle(b.t), ci = mi.get(k); if (ci == null) continue; if (prev) { const rs = b.c / prev.s - 1, ri = ci / prev.i - 1; if (fin(rs) && fin(ri) && Math.abs(rs) < 0.5) { X.push(ri); Y.push(rs); } } prev = { s: b.c, i: ci }; }
  if (X.length < 100) return null; const mx = moyenne(X), my = moyenne(Y); let sxy = 0, sxx = 0; for (let i = 0; i < X.length; i++) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) ** 2; }
  return sxx > 0 ? sxy / sxx : null;
}
export function dragueMax(c) { let pic = -Infinity, dd = 0; for (const x of c) { if (!fin(x)) continue; if (x > pic) pic = x; else dd = Math.min(dd, x / pic - 1); } return dd; }

/* position contre la MA200 Daily et Weekly, plus haut 52 semaines, volatilité, drawdown, liquidité */
export function mesuresPrix(B, I = null, { maintenant = Date.now() } = {}) {
  if (!B || B.length < 60) return null;
  const c = B.map(b => b.c), n = c.length, p = c[n - 1], m200 = sma(c, 200), W = regrouper(B, 7 * J, 4 * J, maintenant).filter(w => !w.enCours), mW = sma(W.map(w => w.c), 200);
  const r = rendements(c.slice(-253)).filter(fin), haut52 = Math.max(...B.slice(-252).map(b => b.h || b.c)), v60 = B.slice(-60).filter(b => fin(b.v) && b.v > 0);
  const out = {
    p, m1: perf(c, 21), m3: perf(c, 63), m6_1: perf(c, 105, 21), m12_1: perf(c, 231, 21), m12: perf(c, 252),
    vs200d: m200[n - 1] ? p / m200[n - 1] - 1 : null, vs200w: mW.length && mW[mW.length - 1] ? p / mW[mW.length - 1] - 1 : null, d52: haut52 > 0 ? p / haut52 - 1 : null,
    vs20: n >= 20 ? p / moyenne(c.slice(-20)) - 1 : null,
    vol: r.length > 100 ? ecartType(r) * Math.sqrt(252) : null, mdd3: dragueMax(c.slice(-756)), beta: beta(B, I),
    liq: v60.length > 20 ? moyenne(v60.map(b => b.c * b.v)) : null,   // en devise de cotation par jour
    rsIdx: I && I.length > 260 ? (perf(c, 231, 21) != null && perf(I.map(b => b.c), 231, 21) != null ? perf(c, 231, 21) - perf(I.map(b => b.c), 231, 21) : null) : null
  };
  return out;
}

/* setup tactique : tendance MA200 Daily, dernière flèche, distance à la MA200 et aux niveaux clés (en ATR). Score 0-100 + explications. */
export function setupTactique(B, { maintenant = Date.now() } = {}) {
  if (!B || B.length < 230) return null;
  const a = analyserUnite(B, 'J', { maintenant }), n = a.B.length, i = n - 1, m = a.M[i], A = a.A[i]; if (m == null || A == null) return null;
  const p = a.B[i].c, tend = a.tend[i], F = a.fleches, dern = F.length ? F[F.length - 1] : null, age = dern ? Math.round((a.B[i].t - dern.t) / J) : null, dist = (p - m) / A;
  const niv = niveauxCles(a.B), sup = niv.supports[0] || null, res = niv.resistances[0] || null, dSup = sup ? (p - sup.prix) / A : null, dRes = res ? (res.prix - p) / A : null;
  let s = 50; const why = [];
  if (tend > 0) { s += 20; why.push('tendance Daily haussière (prix au-dessus de la MA200)'); } else if (tend < 0) { s -= 20; why.push('tendance Daily baissière (prix sous la MA200)'); }
  if (dern && age <= 15) { s += dern.dir > 0 ? 15 : -15; why.push(`${dern.type === 'rebond' ? 'rebond' : 'cassure'} MA200 ${dern.dir > 0 ? 'haussier' : 'baissier'} il y a ${age} jour(s)`); }
  if (tend > 0 && Math.abs(dist) <= 1) { s += 8; why.push('prix au contact de la MA200 en tendance haussière'); }
  if (tend > 0 && dSup != null && dSup <= 1.5) { s += 8; why.push('support Daily proche sous le prix'); }
  if (dRes != null && dRes <= 1) { s -= 8; why.push('résistance Daily très proche au-dessus'); }
  if (dist > 6) { s -= 8; why.push('prix très étiré au-dessus de la MA200'); }
  return { score: Math.max(0, Math.min(100, Math.round(s))), tend, dist, atr: A, atrPct: A / p, dArrow: dern ? { type: dern.type, dir: dern.dir, jours: age } : null, dSup, dRes, support: sup ? sup.prix : null, resistance: res ? res.prix : null, ma200: m, why };
}
