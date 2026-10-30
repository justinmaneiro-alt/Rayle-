/* ═════════════ OUTILS DU MOTEUR « TRADER » (V12 ; module pur, testé : galaxie/tests/trader-moteur-test.mjs) ═════════════
   Tout ce qui est calculé ici est CAUSAL : la valeur à l'index i ne dépend que des bougies d'index ≤ i. Les swings sont « confirmés » avec un retard (k bougies de chaque côté), les bougies H1 / H4 ne
   comptent qu'une fois COMPLÈTES, les niveaux de la veille ne servent qu'après la fin de la veille. Le test de fuite du futur (préfixe contre série complète) le vérifie. */
export const PAS = 900e3;

export function ema(x, p) {
  const out = new Float64Array(x.length).fill(NaN), a = 2 / (p + 1); let e = NaN, n = 0, s = 0;
  for (let i = 0; i < x.length; i++) {
    if (!Number.isFinite(x[i])) { out[i] = e; continue; }
    if (Number.isNaN(e)) { s += x[i]; n++; if (n === p) { e = s / p; out[i] = e; } continue; }
    e = e + a * (x[i] - e); out[i] = e;
  }
  return out;
}
/* ATR de Wilder. */
export function atr(h, l, c, p = 14) {
  const out = new Float64Array(h.length).fill(NaN); let a = NaN, s = 0;
  for (let i = 0; i < h.length; i++) {
    const tr = i === 0 ? h[0] - l[0] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
    if (i < p) { s += tr; if (i === p - 1) { a = s / p; out[i] = a; } continue; }
    a = (a * (p - 1) + tr) / p; out[i] = a;
  }
  return out;
}
export function sma(x, p) {
  const out = new Float64Array(x.length).fill(NaN); let s = 0;
  for (let i = 0; i < x.length; i++) { s += x[i]; if (i >= p) s -= x[i - p]; if (i >= p - 1) out[i] = s / p; }
  return out;
}
/* Swings confirmés : un haut à j est un swing si h[j] est le plus haut strict des k bougies de chaque côté ; il n'est CONNU qu'à l'index j + k.
   Rend { j, conf, prix, haut } triés par `conf` croissant. */
export function swings(h, l, k) {
  const out = [];
  for (let j = k; j + k < h.length; j++) {
    let haut = true, bas = true;
    for (let q = 1; q <= k; q++) { if (!(h[j] > h[j - q] && h[j] >= h[j + q])) haut = false; if (!(l[j] < l[j - q] && l[j] <= l[j + q])) bas = false; if (!haut && !bas) break; }
    if (haut) out.push({ j, conf: j + k, prix: h[j], haut: true });
    if (bas) out.push({ j, conf: j + k, prix: l[j], haut: false });
  }
  return out.sort((a, b) => a.conf - b.conf || a.j - b.j);
}
/* Dernier index d'une liste triée par `conf` dont conf ≤ i (−1 si aucun). */
export function dernierConf(liste, i) { let lo = 0, hi = liste.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (liste[m].conf <= i) { r = m; lo = m + 1; } else hi = m - 1; } return r; }
/* Regroupe les bougies M15 en bougies de `ms` (H1 : 3 600 000, H4 : 14 400 000), COMPLÈTES seulement ; fin[k] = index M15 de la dernière sous-bougie. */
export function regrouper(s, ms) {
  const k = Math.round(ms / PAS), o = [], hh = [], ll = [], c = [], v = [], vb = [], t = [], fin = [];
  let a = 0;
  for (let i = 0; i <= s.n; i++) {
    const cle = i < s.n ? Math.floor(s.t[i] / ms) : null, cleA = Math.floor(s.t[a] / ms);
    if (i === s.n || cle !== cleA) {
      const b = i; if (b - a === k && s.t[b - 1] - s.t[a] === (k - 1) * PAS) {
        let H = -Infinity, L = Infinity, V = 0, VB = 0, ok = true; for (let q = a; q < b; q++) { if (s.h[q] > H) H = s.h[q]; if (s.l[q] < L) L = s.l[q]; V += s.v[q]; if (Number.isNaN(s.vb[q])) ok = false; else VB += s.vb[q]; }
        t.push(s.t[a]); o.push(s.o[a]); hh.push(H); ll.push(L); c.push(s.c[b - 1]); v.push(V); vb.push(ok ? VB : NaN); fin.push(b - 1);
      }
      a = i;
    }
  }
  const F = x => Float64Array.from(x);
  return { n: t.length, t: F(t), o: F(o), h: F(hh), l: F(ll), c: F(c), v: F(v), vb: F(vb), fin: Int32Array.from(fin) };
}
/* Pour chaque index M15 i : index de la dernière bougie agrégée COMPLÈTE à l'instant i (−1 si aucune). */
export function alignerFin(fin, n) {
  const out = new Int32Array(n).fill(-1); let k = -1;
  for (let i = 0; i < n; i++) { while (k + 1 < fin.length && fin[k + 1] <= i) k++; out[i] = k; }
  return out;
}
export const mediane = a => { const b = Array.from(a).filter(Number.isFinite).sort((x, y) => x - y); if (!b.length) return NaN; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };

/* Profil de volume sur les bougies a..b (inclus) : POC, zone de valeur (≈ 70 % du volume) VAL / VAH. Le volume de chaque bougie est réparti sur sa fourchette. */
export function profilVolume(s, a, b, tranches = 48) {
  let lo = Infinity, hi = -Infinity; for (let q = a; q <= b; q++) { if (s.l[q] < lo) lo = s.l[q]; if (s.h[q] > hi) hi = s.h[q]; }
  if (!(hi > lo)) return null;
  const pas = (hi - lo) / tranches, vol = new Float64Array(tranches);
  for (let q = a; q <= b; q++) {
    const i0 = Math.min(tranches - 1, Math.floor((s.l[q] - lo) / pas)), i1 = Math.min(tranches - 1, Math.floor((s.h[q] - lo) / pas)), part = s.v[q] / (i1 - i0 + 1);
    for (let t = i0; t <= i1; t++) vol[t] += part;
  }
  let poc = 0, tot = 0; for (let t = 0; t < tranches; t++) { tot += vol[t]; if (vol[t] > vol[poc]) poc = t; }
  let g = poc, d = poc, acc = vol[poc];
  while (acc < 0.7 * tot && (g > 0 || d < tranches - 1)) { const vg = g > 0 ? vol[g - 1] : -1, vd = d < tranches - 1 ? vol[d + 1] : -1; if (vg >= vd) { g--; acc += vol[g]; } else { d++; acc += vol[d]; } }
  return { poc: lo + (poc + 0.5) * pas, val: lo + g * pas, vah: lo + (d + 1) * pas, pas };
}
export const fr = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ','));
export const prixTexte = x => (x == null || !Number.isFinite(x) ? '—' : (Math.abs(x) >= 1000 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(2) : x.toFixed(4)).replace('.', ','));
