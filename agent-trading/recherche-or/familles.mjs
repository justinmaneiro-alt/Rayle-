/* LISTE FERMÉE des variantes (familles a à p), figée avec SHA-256 dans liste-figee.json AVANT les tests (figer.mjs). Chaque variante = { id, famille, libelle, params, stopK, mgmt }.
   `signaux(spec, X)` renvoie [{ i, d }] : signal à la CLÔTURE de la bougie H1 i (causal), d = +1 achat / −1 vente ; l'entrée se fait à l'ouverture de i+1. */
export const SPECS = [];
const add = (famille, libelle, params, extra = {}) => SPECS.push({ id: `${famille}${SPECS.filter(s => s.famille === famille).length + 1}`, famille, libelle, params, stopK: 1.5, mgmt: 'fixe', ...extra });
// a) fourchette asiatique à l'ouverture de Londres
add('a', 'Asie : cassure, 1 bougie', { fen: 1, buf: 0 }); add('a', 'Asie : cassure, 2 bougies', { fen: 2, buf: 0 }); add('a', 'Asie : cassure, 3 bougies', { fen: 3, buf: 0 }); add('a', 'Asie : cassure avec marge 0,1 ATR, 2 bougies', { fen: 2, buf: 0.1 });
// b) ouverture de New York (30 / 60 min)
add('b', 'New York 30 min, 1 bougie', { dur: 30, fen: 1 }); add('b', 'New York 30 min, 2 bougies', { dur: 30, fen: 2 }); add('b', 'New York 60 min, 1 bougie', { dur: 60, fen: 1 }); add('b', 'New York 60 min, 2 bougies', { dur: 60, fen: 2 });
// c) compression de volatilité
add('c', 'NR7 puis cassure de la bougie', { type: 'nr7' }); add('c', 'Bandes resserrées (10 %) puis cassure de 10 bougies', { type: 'bb', q: 0.1 }); add('c', 'Bandes resserrées (20 %) puis cassure de 10 bougies', { type: 'bb', q: 0.2 }); add('c', 'ATR bas (< 0,7 × moyenne 100) puis cassure de 10 bougies', { type: 'atr' });
// d) Donchian
for (const N of [20, 30, 40, 55]) add('d', `Donchian ${N}`, { N });
// e) momentum dans la tendance H4/Jour
add('e', 'Momentum 6 bougies > 1 ATR', { n: 6, k: 1 }); add('e', 'Momentum 6 bougies > 1,5 ATR', { n: 6, k: 1.5 }); add('e', 'Momentum 12 bougies > 1,5 ATR', { n: 12, k: 1.5 }); add('e', 'Momentum 12 bougies > 2 ATR', { n: 12, k: 2 });
// f) repli dans la tendance
add('f', 'Repli SMA20 (tendance Jour)', { sma: 20, h4: false }); add('f', 'Repli SMA50 (tendance Jour)', { sma: 50, h4: false }); add('f', 'Repli SMA20 (Jour et H4)', { sma: 20, h4: true }); add('f', 'Repli SMA50 (Jour et H4)', { sma: 50, h4: true });
// g) retournement sur niveau Jour/H4 avec bougie de rejet
add('g', 'Rejet sur plus haut/bas de la veille, mèche 50 %', { niv: 'jour', w: 0.5 }); add('g', 'Rejet sur plus haut/bas de la veille, mèche 60 %', { niv: 'jour', w: 0.6 }); add('g', 'Rejet sur veille et semaine précédente, mèche 50 %', { niv: 'js', w: 0.5 }); add('g', 'Rejet sur extrêmes H4 (24 bougies), mèche 50 %', { niv: 'h4', w: 0.5 });
// h) contre-tendance extrême (contraste)
add('h', 'RSI 14 sous 20 / sur 80', { type: 'rsi', s: 20 }); add('h', 'RSI 14 sous 15 / sur 85', { type: 'rsi', s: 15 }); add('h', 'Écart à la SMA20 > 2,5 ATR', { type: 'dist', s: 2.5 }); add('h', 'Écart à la SMA20 > 3 ATR', { type: 'dist', s: 3 });
// i) VWAP de séance
add('i', 'VWAP : retour depuis ±1,5 écart-type avec rejet', { type: 'rev', m: 1.5 }); add('i', 'VWAP : retour depuis ±2 écarts-types avec rejet', { type: 'rev', m: 2 }); add('i', 'VWAP : continuation après repli (tendance Jour)', { type: 'cont', h4: false }); add('i', 'VWAP : continuation après repli (Jour et H4)', { type: 'cont', h4: true });
// j) VWAP ancré
add('j', 'VWAP ancré (bas/haut de la veille) : rebond', { type: 'veille', tend: false }); add('j', 'VWAP ancré (bas/haut de la veille) : rebond dans la tendance Jour', { type: 'veille', tend: true }); add('j', 'VWAP ancré (ouverture de semaine) : rebond', { type: 'semR' }); add('j', 'VWAP ancré (ouverture de semaine) : cassure', { type: 'semC' });
// k) plus haut/bas de la veille et de la semaine précédente
add('k', 'Balayage puis réintégration (veille)', { type: 'sweep', niv: 'jour' }); add('k', 'Balayage puis réintégration (semaine précédente)', { type: 'sweep', niv: 'sem' }); add('k', 'Cassure puis retest (veille)', { type: 'retest', niv: 'jour' }); add('k', 'Cassure puis retest (semaine précédente)', { type: 'retest', niv: 'sem' });
// l) plages Asie / Londres / New York
add('l', 'Balayage de l\'Asie à l\'ouverture de Londres (1 bougie) puis retournement', { type: 'asieSweep', fen: 1 }); add('l', 'Balayage de l\'Asie à Londres (3 bougies) puis retournement', { type: 'asieSweep', fen: 3 }); add('l', 'Cassure de la fourchette de Londres pendant New York (2 bougies)', { type: 'lonBreak', fen: 2 }); add('l', 'Cassure de la fourchette de Londres pendant New York (4 bougies)', { type: 'lonBreak', fen: 4 });
// m) profil de volume (volume de ticks, approximation)
add('m', 'Ouverture hors zone de valeur de la veille, retour dedans (matin)', { type: 'va', hmax: 12, corps: 0 }); add('m', 'Ouverture hors zone de valeur, retour dedans (journée)', { type: 'va', hmax: 21, corps: 0 }); add('m', 'Retour dans la zone de valeur avec corps ≥ 0,5 ATR', { type: 'va', hmax: 21, corps: 0.5 }); add('m', 'Rejet au POC de la veille', { type: 'poc' });
// n) niveaux ronds
add('n', 'Rejet sur niveau rond de 100 $', { type: 'rej', pas: 100 }); add('n', 'Rejet sur niveau rond de 50 $', { type: 'rej', pas: 50 }); add('n', 'Cassure puis retest du niveau de 100 $', { type: 'ret', pas: 100 }); add('n', 'Cassure puis retest du niveau de 50 $', { type: 'ret', pas: 50 });
// o) 5 combinaisons de DEUX éléments
add('o', 'Donchian 40 ET tendance Jour + H4 alignées', { type: 'o1' }); add('o', 'Balayage de la veille ET écart au VWAP > 1,5 écart-type dans le sens du rejet', { type: 'o2' }); add('o', 'Cassure asiatique ET compression (plage asiatique < 2,5 ATR)', { type: 'o3' }); add('o', 'Repli SMA20 ET rebond sur le VWAP de séance', { type: 'o4' }); add('o', 'Rejet de niveau rond de 50 $ ET proximité du plus haut/bas de la veille (< 0,5 ATR)', { type: 'o5' });
// p) démarrage confirmé en temps réel (même signal, 6 gestions)
for (const [k, m] of [[1, 'fixe'], [1.5, 'fixe'], [1, 'trail'], [1.5, 'trail'], [1, 'be'], [1.5, 'be']]) add('p', `Démarrage confirmé, stop ${k} ATR, ${m === 'fixe' ? 'sortie par temps' : m === 'trail' ? 'stop suiveur ATR' : 'break-even après +1 R'}`, { type: 'start' }, { stopK: k, mgmt: m });

const sma = (a, i, n) => { let s = 0; for (let k = i - n + 1; k <= i; k++) s += a[k]; return s / n; };
const hi = (X, i, N) => { let m = -Infinity; for (let k = i - N; k < i; k++) if (X.h[k] > m) m = X.h[k]; return m; };
const lo = (X, i, N) => { let m = Infinity; for (let k = i - N; k < i; k++) if (X.l[k] < m) m = X.l[k]; return m; };
const wickH = (X, i) => (X.h[i] - Math.max(X.o[i], X.c[i])) / Math.max(1e-9, X.h[i] - X.l[i]), wickL = (X, i) => (Math.min(X.o[i], X.c[i]) - X.l[i]) / Math.max(1e-9, X.h[i] - X.l[i]);

/* signaux de base partagés (les combinaisons o les réutilisent) */
const bases = {
  a(X, i, p, etat) { const A = X.asie[i]; if (!A || X.hr[i] < 7 || X.hr[i] > 6 + p.fen || etat.jourFait === X.jour[i]) return null; const a = X.atr[i]; const d = X.c[i] > A.h + p.buf * a ? 1 : X.c[i] < A.l - p.buf * a ? -1 : 0; if (d) { etat.jourFait = X.jour[i]; return d; } return null; },
  donchian(X, i, N) { if (i < N + 1) return 0; if (X.c[i] > hi(X, i, N) && !(X.c[i - 1] > hi(X, i - 1, N))) return 1; if (X.c[i] < lo(X, i, N) && !(X.c[i - 1] < lo(X, i - 1, N))) return -1; return 0; },
  repliSma20(X, i, h4) { const s20 = X.sma20[i], s50 = X.sma50[i]; if (s20 == null || s50 == null) return 0; const bull = X.tJour[i] > 0 && s20 > s50 && (!h4 || X.tH4[i] > 0), bear = X.tJour[i] < 0 && s20 < s50 && (!h4 || X.tH4[i] < 0); if (bull && X.l[i] <= s20 && X.c[i] > s20 && X.c[i] > X.o[i]) return 1; if (bear && X.h[i] >= s20 && X.c[i] < s20 && X.c[i] < X.o[i]) return -1; return 0; },
  sweepJour(X, i) { if (X.pdh[i] == null) return 0; if (X.h[i] > X.pdh[i] && X.c[i] < X.pdh[i]) return -1; if (X.l[i] < X.pdl[i] && X.c[i] > X.pdl[i]) return 1; return 0; },
  rond(X, i, pas) { const L1 = Math.floor(X.h[i] / pas) * pas, L2 = Math.ceil(X.l[i] / pas) * pas; if (L1 > Math.max(X.o[i], X.c[i]) && L1 <= X.h[i] && wickH(X, i) >= 0.5 && X.c[i] < L1) return { d: -1, L: L1 }; if (L2 < Math.min(X.o[i], X.c[i]) && L2 >= X.l[i] && wickL(X, i) >= 0.5 && X.c[i] > L2) return { d: 1, L: L2 }; return null; }
};

export function signaux(spec, X) {
  const out = [], p = spec.params, n = X.n, etat = {}; const emit = (i, d) => { if (d) out.push({ i, d }); };
  const ok = i => X.atr[i] != null && X.sma200[i] != null && X.pdh[i] != null && X.atr100[i] > 0 && i >= 210;
  const f = spec.famille;
  // largeurs de bandes pour c/bb
  let bw = null; if (f === 'c' && p.type === 'bb') { bw = new Array(n).fill(null); for (let i = 20; i < n; i++) { const m = sma(X.c, i, 20); let v = 0; for (let k = i - 19; k <= i; k++) v += (X.c[k] - m) ** 2; bw[i] = 4 * Math.sqrt(v / 20) / m; } }
  for (let i = 210; i < n; i++) {
    if (!ok(i)) continue; if (X.t[i] - X.t[i - 1] > 4 * 3600e3 && X.hr[i] !== 0) { /* après un trou : on ignore la bougie suivante */ }
    const a = X.atr[i];
    switch (f) {
      case 'a': emit(i, bases.a(X, i, p, etat)); break;
      case 'b': { const R = p.dur === 30 ? X.ny30[i] : X.ny60[i], h0 = p.dur === 30 ? 14 : 15; if (!R || X.hr[i] < h0 || X.hr[i] > h0 + p.fen - 1 || etat.j === X.jour[i]) break; const d = X.c[i] > R.h ? 1 : X.c[i] < R.l ? -1 : 0; if (d) { etat.j = X.jour[i]; emit(i, d); } break; }
      case 'c': {
        if (p.type === 'nr7') { const r = k => X.h[k] - X.l[k]; let min = true; for (let k = i - 7; k < i - 1; k++) if (r(i - 1) >= r(k)) min = false; if (min) emit(i, X.c[i] > X.h[i - 1] ? 1 : X.c[i] < X.l[i - 1] ? -1 : 0); break; }
        let comp = false; if (p.type === 'bb') { const w = bw[i - 1]; if (w != null && i > 120) { const q = []; for (let k = i - 100; k < i; k++) if (bw[k] != null) q.push(bw[k]); q.sort((x, y) => x - y); comp = w <= q[Math.floor(q.length * p.q)]; } } else comp = X.atr[i - 1] < 0.7 * X.atr100[i - 1];
        if (comp) emit(i, X.c[i] > hi(X, i, 10) ? 1 : X.c[i] < lo(X, i, 10) ? -1 : 0); break;
      }
      case 'd': emit(i, bases.donchian(X, i, p.N)); break;
      case 'e': { const roc = (X.c[i] - X.c[i - p.n]) / a, ro1 = (X.c[i - 1] - X.c[i - 1 - p.n]) / X.atr[i - 1]; if (roc > p.k && !(ro1 > p.k) && X.tJour[i] > 0 && X.tH4[i] > 0) emit(i, 1); else if (roc < -p.k && !(ro1 < -p.k) && X.tJour[i] < 0 && X.tH4[i] < 0) emit(i, -1); break; }
      case 'f': { const sm = p.sma === 20 ? X.sma20 : X.sma50, s50 = X.sma50[i], s20 = X.sma20[i]; if (sm[i] == null || s50 == null) break; const bull = X.tJour[i] > 0 && s20 > s50 && (!p.h4 || X.tH4[i] > 0), bear = X.tJour[i] < 0 && s20 < s50 && (!p.h4 || X.tH4[i] < 0); if (bull && X.l[i] <= sm[i] && X.c[i] > sm[i] && X.c[i] > X.o[i]) emit(i, 1); else if (bear && X.h[i] >= sm[i] && X.c[i] < sm[i] && X.c[i] < X.o[i]) emit(i, -1); break; }
      case 'g': {
        const hs = [], ls = []; if (p.niv === 'h4') { hs.push(hi(X, i, 24)); ls.push(lo(X, i, 24)); } else { hs.push(X.pdh[i]); ls.push(X.pdl[i]); if (p.niv === 'js' && X.pwh[i] != null) { hs.push(X.pwh[i]); ls.push(X.pwl[i]); } }
        if (hs.some(L => X.h[i] > L && X.c[i] < L) && wickH(X, i) >= p.w) emit(i, -1); else if (ls.some(L => X.l[i] < L && X.c[i] > L) && wickL(X, i) >= p.w) emit(i, 1); break;
      }
      case 'h': {
        if (p.type === 'rsi') { const r = X.rsi[i], r1 = X.rsi[i - 1]; if (r < p.s && r1 >= p.s) emit(i, 1); else if (r > 100 - p.s && r1 <= 100 - p.s) emit(i, -1); }
        else { const z = (X.c[i] - X.sma20[i]) / a, z1 = (X.c[i - 1] - X.sma20[i - 1]) / X.atr[i - 1]; if (z < -p.s && !(z1 < -p.s)) emit(i, 1); else if (z > p.s && !(z1 > p.s)) emit(i, -1); }
        break;
      }
      case 'i': {
        const j = i - 1; if (X.jour[j] !== X.jour[i] || X.hr[i] < 3 || !X.vsd[j] || X.vsd[j] <= 0) break; const V = X.vw[j], S = X.vsd[j];
        if (p.type === 'rev') { if (X.l[i] <= V - p.m * S && X.c[i] > V - p.m * S && X.c[i] > X.o[i]) emit(i, 1); else if (X.h[i] >= V + p.m * S && X.c[i] < V + p.m * S && X.c[i] < X.o[i]) emit(i, -1); }
        else { if (X.tJour[i] > 0 && (!p.h4 || X.tH4[i] > 0) && X.l[i] <= V && X.c[i] > V && X.c[i] > X.o[i]) emit(i, 1); else if (X.tJour[i] < 0 && (!p.h4 || X.tH4[i] < 0) && X.h[i] >= V && X.c[i] < V && X.c[i] < X.o[i]) emit(i, -1); }
        break;
      }
      case 'j': {
        if (p.type === 'veille') { const A = X.avwap(X.pdiL[i], i - 1), B = X.avwap(X.pdiH[i], i - 1); if (A != null && i - X.pdiL[i] > 3 && X.l[i] <= A && X.c[i] > A && X.c[i] > X.o[i] && (!p.tend || X.tJour[i] > 0)) emit(i, 1); else if (B != null && i - X.pdiH[i] > 3 && X.h[i] >= B && X.c[i] < B && X.c[i] < X.o[i] && (!p.tend || X.tJour[i] < 0)) emit(i, -1); }
        else { const a0 = X.sem[X.semOf[i]].i0; if (i - a0 < 4) break; const A = X.avwap(a0, i - 1); if (A == null) break; if (p.type === 'semR') { if (X.c[i - 1] > A && X.l[i] <= A && X.c[i] > A && X.c[i] > X.o[i]) emit(i, 1); else if (X.c[i - 1] < A && X.h[i] >= A && X.c[i] < A && X.c[i] < X.o[i]) emit(i, -1); } else { if (X.c[i - 1] < A && X.c[i] > A && X.c[i] > X.o[i]) emit(i, 1); else if (X.c[i - 1] > A && X.c[i] < A && X.c[i] < X.o[i]) emit(i, -1); } }
        break;
      }
      case 'k': {
        const H = p.niv === 'jour' ? X.pdh[i] : X.pwh[i], L = p.niv === 'jour' ? X.pdl[i] : X.pwl[i]; if (H == null) break;
        if (p.type === 'sweep') { if (X.h[i] > H && X.c[i] < H) emit(i, -1); else if (X.l[i] < L && X.c[i] > L) emit(i, 1); }
        else { let up = false, dn = false; for (let k = i - 6; k < i - 1; k++) { if (X.c[k] > H) up = true; if (X.c[k] < L) dn = true; } if (up && !dn && X.l[i] <= H && X.c[i] > H) emit(i, 1); else if (dn && !up && X.h[i] >= L && X.c[i] < L) emit(i, -1); }
        break;
      }
      case 'l': {
        if (p.type === 'asieSweep') { const A = X.asie[i]; if (!A || X.hr[i] < 7 || X.hr[i] > 6 + p.fen || etat.j === X.jour[i]) break; if (X.h[i] > A.h && X.c[i] < A.h) { etat.j = X.jour[i]; emit(i, -1); } else if (X.l[i] < A.l && X.c[i] > A.l) { etat.j = X.jour[i]; emit(i, 1); } }
        else { const Lr = X.lon[i]; if (!Lr || X.hr[i] < 13 || X.hr[i] > 12 + p.fen || etat.j === X.jour[i]) break; const d = X.c[i] > Lr.h ? 1 : X.c[i] < Lr.l ? -1 : 0; if (d) { etat.j = X.jour[i]; emit(i, d); } }
        break;
      }
      case 'm': {
        const P = X.vp[i]; if (!P) break;
        if (p.type === 'va') { if (X.hr[i] > p.hmax || etat.j === X.jour[i]) break; const o = X.dOpen[i]; if (o > P.vah && X.c[i - 1] > P.vah && X.c[i] <= P.vah && X.c[i] >= P.val && Math.abs(X.c[i] - X.o[i]) >= p.corps * a) { etat.j = X.jour[i]; emit(i, -1); } else if (o < P.val && X.c[i - 1] < P.val && X.c[i] >= P.val && X.c[i] <= P.vah && Math.abs(X.c[i] - X.o[i]) >= p.corps * a) { etat.j = X.jour[i]; emit(i, 1); } }
        else { if (X.c[i - 1] > P.poc && X.l[i] <= P.poc && X.c[i] > P.poc && X.c[i] > X.o[i] && wickL(X, i) >= 0.4) emit(i, 1); else if (X.c[i - 1] < P.poc && X.h[i] >= P.poc && X.c[i] < P.poc && X.c[i] < X.o[i] && wickH(X, i) >= 0.4) emit(i, -1); }
        break;
      }
      case 'n': {
        if (p.type === 'rej') { const r = bases.rond(X, i, p.pas); if (r) emit(i, r.d); }
        else { for (let j = i - 6; j < i - 1; j++) { const L = Math.floor(X.c[j] / p.pas) * p.pas; if (X.c[j - 1] < L && X.c[j] >= L) { if (X.l[i] <= L && X.c[i] > L && X.c[i] > X.o[i]) { emit(i, 1); break; } } const L2 = Math.ceil(X.c[j] / p.pas) * p.pas; if (X.c[j - 1] > L2 && X.c[j] <= L2) { if (X.h[i] >= L2 && X.c[i] < L2 && X.c[i] < X.o[i]) { emit(i, -1); break; } } } }
        break;
      }
      case 'o': {
        if (p.type === 'o1') { const d = bases.donchian(X, i, 40); if (d && X.tJour[i] === d && X.tH4[i] === d) emit(i, d); }
        else if (p.type === 'o2') { const d = bases.sweepJour(X, i); if (d && X.vsd[i - 1] > 0 && X.jour[i - 1] === X.jour[i]) { const z = (X.c[i] - X.vw[i - 1]) / X.vsd[i - 1]; if ((d === -1 && z > 1.5) || (d === 1 && z < -1.5)) emit(i, d); } }
        else if (p.type === 'o3') { const A = X.asie[i]; if (A && A.h - A.l < 2.5 * a) emit(i, bases.a(X, i, { fen: 2, buf: 0 }, etat)); }
        else if (p.type === 'o4') { const d = bases.repliSma20(X, i, false); if (d && X.vw[i - 1] != null && X.jour[i - 1] === X.jour[i] && ((d === 1 && X.l[i] <= X.vw[i - 1] + 0.3 * a && X.c[i] > X.vw[i - 1]) || (d === -1 && X.h[i] >= X.vw[i - 1] - 0.3 * a && X.c[i] < X.vw[i - 1]))) emit(i, d); }
        else { const r = bases.rond(X, i, 50); if (r && ((r.d === -1 && Math.abs(r.L - X.pdh[i]) < 0.5 * a) || (r.d === 1 && Math.abs(r.L - X.pdl[i]) < 0.5 * a))) emit(i, r.d); }
        break;
      }
      case 'p': {
        const corps = Math.abs(X.c[i] - X.o[i]); if (corps < a || X.v[i] <= X.medVol20[i]) break; const d = X.c[i] > X.o[i] ? 1 : -1;
        const lv = [X.pdh[i], X.pdl[i], hi(X, i, 24), lo(X, i, 24), X.pwh[i], X.pwl[i]]; if (X.asie[i]) lv.push(X.asie[i].h, X.asie[i].l); if (X.lon[i]) lv.push(X.lon[i].h, X.lon[i].l);
        const cross = lv.some(L => L != null && (d === 1 ? X.c[i] > L && X.c[i - 1] <= L && X.o[i] <= L + 0.5 * a : X.c[i] < L && X.c[i - 1] >= L && X.o[i] >= L - 0.5 * a));
        if (!cross) break;
        let sweep = false; for (let k = i - 6; k < i; k++) { if (d === 1 && X.l[k] < X.pdl[i] && X.c[k] > X.pdl[i]) sweep = true; if (d === -1 && X.h[k] > X.pdh[i] && X.c[k] < X.pdh[i]) sweep = true; }
        if (X.tJour[i] === -d && !sweep) break; emit(i, d); break;
      }
    }
  }
  return out;
}
