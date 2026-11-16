/* ═════════════ ÉVALUATION DES FLÈCHES DAILY (module PUR, testé) : vrais retournements majeurs, bonnes / fausses flèches, comparaison au hasard ═════════════
   « Vérité » = les GROS retournements vus APRÈS COUP (zigzag) : un sommet / un creux n'est majeur que si le prix repart d'au moins `seuil` en sens inverse. Ce regard vers l'avenir sert
   UNIQUEMENT à juger les flèches, jamais à les produire. Seuil = m × l'ATR 14 médian en % de l'actif (donc comparable entre l'or, le Nasdaq et le Bitcoin). */
import { atr, dernier } from '../commun/analyse.js';

const J = 86400e3;
export const mediane = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
export function atrPctMedian(B) { const A = atr(B, 14); return mediane(B.map((b, i) => (A[i] != null && b.c > 0 ? A[i] / b.c : null))); }

/* zigzag sur les hauts / bas : pivots alternés { i, t, type: 'top' | 'bottom', prix } ; `seuil` = fraction (0,07 = 7 %) */
export function zigzag(B, seuil) {
  const P = []; if (B.length < 3) return P; let dir = 0, hi = B[0].h, hiI = 0, lo = B[0].l, loI = 0;
  for (let i = 1; i < B.length; i++) {
    if (B[i].h > hi) { hi = B[i].h; hiI = i; } if (B[i].l < lo) { lo = B[i].l; loI = i; }
    if (dir === 0) {
      if (hiI < i && B[i].l <= hi * (1 - seuil)) { P.push({ i: hiI, t: B[hiI].t, type: 'top', prix: hi }); dir = -1; lo = B[i].l; loI = i; }
      else if (loI < i && B[i].h >= lo * (1 + seuil)) { P.push({ i: loI, t: B[loI].t, type: 'bottom', prix: lo }); dir = 1; hi = B[i].h; hiI = i; }
    } else if (dir === 1) { if (B[i].l <= hi * (1 - seuil) && hiI < i) { P.push({ i: hiI, t: B[hiI].t, type: 'top', prix: hi }); dir = -1; lo = B[i].l; loI = i; } }
    else if (B[i].h >= lo * (1 + seuil) && loI < i) { P.push({ i: loI, t: B[loI].t, type: 'bottom', prix: lo }); dir = 1; hi = B[i].h; hiI = i; }
  }
  return P;
}

/* Rapproche flèches et pivots majeurs. Une flèche rouge (dir −1) est BONNE si elle tombe entre 0 et `lmax` bougies APRÈS un sommet majeur non encore servi ; verte (dir +1) pour un creux.
   Les flèches en trop sur un même pivot sont comptées fausses (doublon). Retourne les comptes + les mesures de mouvement. */
export function evaluer(B, fleches, pivots, { lmax = 15, horizon = 20, adverse = 30 } = {}) {
  const sort = [...fleches].sort((a, b) => a.i - b.i), pris = new Set(), bonnes = [], fausses = [];
  for (const f of sort) {
    const type = f.dir < 0 ? 'top' : 'bottom'; let m = -1;
    for (let p = 0; p < pivots.length; p++) { const P = pivots[p]; if (P.type !== type || pris.has(p)) continue; if (f.i >= P.i && f.i - P.i <= lmax) { m = p; break; } }
    if (m >= 0) { pris.add(m); bonnes.push({ f, p: pivots[m], pIndex: m }); } else fausses.push(f);
  }
  const n = sort.length, majeurs = pivots.length, couverts = pris.size;
  /* mouvement capté : de la clôture de la flèche jusqu'au pivot majeur SUIVANT (de sens opposé), en % dans le sens de la flèche */
  const captes = bonnes.map(({ f, pIndex }) => { const suiv = pivots[pIndex + 1]; if (!suiv) return null; const c0 = B[f.i].c; return f.dir < 0 ? (c0 - suiv.prix) / c0 * 100 : (suiv.prix - c0) / c0 * 100; }).filter(Number.isFinite);
  const apres = sort.map(f => (f.i + horizon < B.length ? f.dir * (B[f.i + horizon].c - B[f.i].c) / B[f.i].c * 100 : null)).filter(Number.isFinite);
  const pires = fausses.map(f => { let m = 0; const c0 = B[f.i].c; for (let x = f.i + 1; x <= Math.min(B.length - 1, f.i + adverse); x++) { const mv = f.dir < 0 ? (B[x].h - c0) / c0 * 100 : (c0 - B[x].l) / c0 * 100; if (mv > m) m = mv; } return m; });
  const dec = bonnes.map(({ f, p }) => (f.t - p.t) / J);
  const moy = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  return { n, bonnes: bonnes.length, fausses: fausses.length, majeurs, couverts, precision: n ? bonnes.length / n : null, rappel: majeurs ? couverts / majeurs : null,
    f1: n && majeurs ? 2 * (bonnes.length / n) * (couverts / majeurs) / ((bonnes.length / n) + (couverts / majeurs) || 1) : 0,
    decalageMoyenJours: moy(dec), mouvementCaptePct: moy(captes), mouvement20jPct: moy(apres), pireFausseAdversePct: pires.length ? Math.max(...pires) : null };
}

/* Hasard : mêmes nombres de flèches rouges / vertes posées au hasard (au moins `repos` bougies entre deux flèches de même sens) ; renvoie la part des tirages qui font AUSSI BIEN (précision ≥ observée). */
export function comparerHasard(B, fleches, pivots, { essais = 400, graine = 12345, ...opts } = {}) {
  const obs = evaluer(B, fleches, pivots, opts); if (!obs.n) return { p: null, precisionHasard: null, obs };
  let s = graine; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const nR = fleches.filter(f => f.dir < 0).length, nV = fleches.length - nR, lo = Math.min(...fleches.map(f => f.i)), hi = Math.max(...fleches.map(f => f.i)); let meilleurs = 0, somme = 0;
  for (let e = 0; e < essais; e++) {
    const F = []; for (const [dir, n] of [[-1, nR], [1, nV]]) { const I = []; let garde = 0; while (I.length < n && garde++ < n * 200) { const i = lo + Math.floor(rnd() * (hi - lo + 1)); if (I.every(x => Math.abs(x - i) >= 20)) I.push(i); } for (const i of I) F.push({ i, t: B[i].t, dir }); }
    const r = evaluer(B, F, pivots, opts); somme += r.precision || 0; if ((r.precision || 0) >= obs.precision) meilleurs++;
  }
  return { p: (meilleurs + 1) / (essais + 1), precisionHasard: somme / essais, obs };
}
export const trimestres = B => (B.length ? Math.max(0.25, (B[B.length - 1].t - B[0].t) / J / 91.3) : 0);
export const dernierAtr = B => dernier(atr(B, 14));
