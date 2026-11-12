/* ═════════════ RSI 14 (Wilder) ET DIVERGENCES — règle « rsi-lecture-v1 » (2026-11-12) ═════════════
   Pur, sans DOM, sans réseau. Un SEUL RSI : période 14, lissage de Wilder, calculé sur les clôtures de la timeframe affichée.
   Divergences : seulement entre DEUX PIVOTS CONSÉCUTIFS DE MÊME NATURE du prix, chacun confirmé par 5 bougies de chaque côté (le pivot est connu 5 bougies après),
   distants d'au plus 60 bougies :
     • haussière : deuxième creux du prix PLUS BAS que le premier, RSI du deuxième creux PLUS HAUT ;
     • baissière : deuxième sommet du prix PLUS HAUT que le premier, RSI du deuxième sommet PLUS BAS.
   La divergence n'apparaît qu'à la CONFIRMATION du second pivot (5 bougies après lui) : elle arrive donc avec du retard et n'est JAMAIS redessinée.
   Repère de lecture, ni un signal d'entrée ni un ordre. */
export const VERSION = 'rsi-lecture-v1', ECRITES_LE = '2026-11-12';
export const P = Object.freeze({ periode: 14, pivot: 5, distanceMax: 60, haut: 70, bas: 30, milieu: 50 });

/* RSI de Wilder : moyenne simple des 14 premières variations, puis lissage (a·13 + x) / 14. null avant la 15e clôture. */
export function rsiWilder(closes, n = P.periode) {
  const out = new Array(closes.length).fill(null); if (closes.length <= n) return out;
  let gain = 0, perte = 0;
  for (let i = 1; i <= n; i++) { const d = closes[i] - closes[i - 1]; if (d >= 0) gain += d; else perte -= d; }
  gain /= n; perte /= n; out[n] = perte === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / perte);
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]; gain = (gain * (n - 1) + (d > 0 ? d : 0)) / n; perte = (perte * (n - 1) + (d < 0 ? -d : 0)) / n;
    out[i] = perte === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / perte);
  }
  return out;
}

/* Pivots du prix (mèches) confirmés : le pivot i est le plus haut (ou plus bas) STRICT de i-k..i+k ; connu à la clôture de la bougie i+k. */
export function pivots(B, k = P.pivot) {
  const sommets = [], creux = [];
  for (let i = k; i < B.length - k; i++) {
    let h = true, b = true;
    for (let j = i - k; j <= i + k; j++) { if (j === i) continue; if (B[j].h >= B[i].h) h = false; if (B[j].l <= B[i].l) b = false; if (!h && !b) break; }
    if (h) sommets.push({ i, p: B[i].h, t: B[i].t, connuI: i + k }); if (b) creux.push({ i, p: B[i].l, t: B[i].t, connuI: i + k });
  }
  return { sommets, creux };
}

/* Divergences entre pivots consécutifs de même nature. B : bougies { t, h, l, c } ; R : RSI aligné sur B. */
export function divergences(B, R, { k = P.pivot, max = P.distanceMax } = {}) {
  const { sommets, creux } = pivots(B, k), out = [];
  const examiner = (L, dir) => {
    for (let a = 1; a < L.length; a++) {
      const p1 = L[a - 1], p2 = L[a]; if (p2.i - p1.i > max || p1.i === p2.i) continue;
      const r1 = R[p1.i], r2 = R[p2.i]; if (r1 == null || r2 == null) continue;
      const bull = dir > 0 ? (p2.p < p1.p && r2 > r1) : (p2.p > p1.p && r2 < r1);
      if (bull) out.push({ dir, i1: p1.i, i2: p2.i, t1: p1.t, t2: p2.t, p1: p1.p, p2: p2.p, r1, r2, confirmeI: p2.connuI, confirmeT: B[p2.connuI].t + (B[1] ? B[1].t - B[0].t : 0), label: 'div', nom: dir > 0 ? 'Divergence haussière' : 'Divergence baissière' });
    }
  };
  examiner(creux, 1); examiner(sommets, -1);
  return out.sort((x, y) => x.confirmeI - y.confirmeI);
}

export const texteDivergence = d => `${d.nom} : le prix ${d.dir > 0 ? 'fait un creux plus bas' : 'fait un sommet plus haut'} (${d.p1.toFixed(2).replace('.', ',')} → ${d.p2.toFixed(2).replace('.', ',')}) pendant que le RSI ${d.dir > 0 ? 'monte' : 'baisse'} (${Math.round(d.r1)} → ${Math.round(d.r2)}). Confirmée ${P.pivot} bougies après le second pivot : elle apparaît avec ce retard et n'est jamais redessinée. Repère de lecture, pas un ordre.`;

/* Tout en un : bougies affichées (la dernière peut être en cours : elle sert au RSI mais jamais à un pivot confirmé, faute de 5 bougies après). */
export function analyser(B) {
  const R = rsiWilder(B.map(b => b.c));
  return { rsi: R, divergences: divergences(B, R), dernier: R.length ? R[R.length - 1] : null };
}
