/* ═════════════ INDICATEURS CAUSAUX EN COLONNES (module pur, testé : agent-lecture-test.mjs et agent-backtest-test.mjs) ═════════════
   RÈGLE ABSOLUE : la valeur à l'index i n'utilise QUE les bougies 0..i (jamais de regard vers le futur). Le test « poison du futur » le vérifie pour chacune : on remplace tout ce qui suit i
   par des valeurs absurdes et la valeur en i ne doit pas bouger. Les valeurs de chauffe sont NaN. Mêmes méthodes que TradingView (EMA amorcée par la moyenne simple, ATR de Wilder). */
const nan = n => { const a = new Float64Array(n); a.fill(NaN); return a; };

export function sma(x, p) {
  const out = nan(x.length); let s = 0;
  for (let i = 0; i < x.length; i++) { s += x[i]; if (i >= p) s -= x[i - p]; if (i >= p - 1) out[i] = s / p; }
  return out;
}
export function ema(x, p) {
  const out = nan(x.length); if (x.length < p) return out;
  let e = 0; for (let i = 0; i < p; i++) e += x[i]; e /= p; out[p - 1] = e; const k = 2 / (p + 1);
  for (let i = p; i < x.length; i++) { e = x[i] * k + e * (1 - k); out[i] = e; }
  return out;
}
export function atr(h, l, c, p = 14) {
  const n = c.length, out = nan(n); if (n < p) return out;
  const tr = i => (i === 0 ? h[0] - l[0] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  let a = 0; for (let i = 0; i < p; i++) a += tr(i); a /= p; out[p - 1] = a;
  for (let i = p; i < n; i++) { a = (a * (p - 1) + tr(i)) / p; out[i] = a; }
  return out;
}
/* Plus haut / plus bas glissants sur les p dernières bougies, bougie courante incluse. */
export function plusHaut(x, p) { const out = nan(x.length); for (let i = p - 1; i < x.length; i++) { let m = -Infinity; for (let j = i - p + 1; j <= i; j++) if (x[j] > m) m = x[j]; out[i] = m; } return out; }
export function plusBas(x, p) { const out = nan(x.length); for (let i = p - 1; i < x.length; i++) { let m = Infinity; for (let j = i - p + 1; j <= i; j++) if (x[j] < m) m = x[j]; out[i] = m; } return out; }
/* Même chose en EXCLUANT la bougie courante (niveau « à battre » : cassure). */
export function plusHautAvant(x, p) { const out = nan(x.length); for (let i = p; i < x.length; i++) { let m = -Infinity; for (let j = i - p; j < i; j++) if (x[j] > m) m = x[j]; out[i] = m; } return out; }
export function plusBasAvant(x, p) { const out = nan(x.length); for (let i = p; i < x.length; i++) { let m = Infinity; for (let j = i - p; j < i; j++) if (x[j] < m) m = x[j]; out[i] = m; } return out; }

/* Rang percentile (0..1) de x[i] parmi les `fenetre` dernières valeurs finies (x[i] inclus). */
export function rangPercentile(x, fenetre) {
  const out = nan(x.length);
  for (let i = 0; i < x.length; i++) {
    if (!Number.isFinite(x[i])) continue; const a = Math.max(0, i - fenetre + 1); let inf = 0, tot = 0;
    for (let j = a; j <= i; j++) if (Number.isFinite(x[j])) { tot++; if (x[j] <= x[i]) inf++; }
    if (tot >= Math.min(fenetre, 30)) out[i] = inf / tot;
  }
  return out;
}
/* Coefficient d'efficacité de Kaufman : |c[i] - c[i-p]| / somme des |variations| sur p bougies. 1 = trait droit (tendance), 0 = va-et-vient (range). */
export function efficacite(c, p) {
  const out = nan(c.length); let somme = 0;
  for (let i = 1; i < c.length; i++) { somme += Math.abs(c[i] - c[i - 1]); if (i > p) somme -= Math.abs(c[i - p] - c[i - p - 1]); if (i >= p) out[i] = somme > 0 ? Math.abs(c[i] - c[i - p]) / somme : 0; }
  return out;
}
/* Pente en unités d'ATR : (x[i] - x[i-p]) / atr[i]. */
export function penteATR(x, a, p) { const out = nan(x.length); for (let i = p; i < x.length; i++) if (Number.isFinite(x[i]) && Number.isFinite(x[i - p]) && a[i] > 0) out[i] = (x[i] - x[i - p]) / a[i]; return out; }

/* Pivots (fractals) CONFIRMÉS : un sommet en j est connu à l'index j + k (k bougies de chaque côté). `confirme[i]` liste les pivots devenus connus à l'index i : jamais de regard vers le futur.
   Rend { haut: Float64Array (prix du dernier sommet confirmé connu à i), idxHaut, bas, idxBas, ... } sous forme de tableaux « dernier connu ». */
export function pivots(h, l, k = 3) {
  const n = h.length, dernierHaut = nan(n), idxHaut = new Int32Array(n).fill(-1), precHaut = nan(n), dernierBas = nan(n), idxBas = new Int32Array(n).fill(-1), precBas = nan(n);
  let ph = NaN, ih = -1, qh = NaN, pb = NaN, ib = -1, qb = NaN;
  for (let i = 0; i < n; i++) {
    const j = i - k;
    if (j >= k) {
      let sommet = true, creux = true;
      for (let m = j - k; m <= j + k; m++) { if (m === j) continue; if (h[m] >= h[j]) sommet = false; if (l[m] <= l[j]) creux = false; }
      if (sommet) { qh = ph; ph = h[j]; ih = j; }
      if (creux) { qb = pb; pb = l[j]; ib = j; }
    }
    dernierHaut[i] = ph; idxHaut[i] = ih; precHaut[i] = qh; dernierBas[i] = pb; idxBas[i] = ib; precBas[i] = qb;
  }
  return { haut: dernierHaut, idxHaut, precHaut, bas: dernierBas, idxBas, precBas };
}

/* Delta (volume acheteur agressif − vendeur agressif) par bougie. Réel si vb est connu ; sinon ESTIMÉ à partir de la position de la clôture dans la bougie : v × (2c − h − l) / (h − l).
   `estime[i] = 1` quand la valeur est estimée. */
export function delta(s) {
  const n = s.n, d = new Float64Array(n), estime = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(s.vb[i])) d[i] = 2 * s.vb[i] - s.v[i];
    else { const e = s.h[i] - s.l[i]; d[i] = e > 0 ? s.v[i] * (2 * s.c[i] - s.h[i] - s.l[i]) / e : 0; estime[i] = 1; }
  }
  return { d, estime };
}
export function cumul(x) { const out = new Float64Array(x.length); let s = 0; for (let i = 0; i < x.length; i++) { s += x[i]; out[i] = s; } return out; }
/* Somme glissante des p dernières valeurs. */
export function sommeGlissante(x, p) { const out = nan(x.length); let s = 0; for (let i = 0; i < x.length; i++) { s += x[i]; if (i >= p) s -= x[i - p]; if (i >= p - 1) out[i] = s; } return out; }
export function mediane(a) { const b = Array.from(a).filter(Number.isFinite).sort((u, v) => u - v); if (!b.length) return NaN; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
