import { atr, delta, ema, mediane, plusHautAvant, plusBasAvant, sma } from './indic.js';
import { MS, regrouper } from './colonnes.js';
import { SEUILS_PHASE, SEUILS_PHASE_H4, preparer } from './lecture.js';

/* ═════════════ CONTEXTE MULTI-ÉCHELLES DU MOTEUR (M3b ; module pur, testé : agent-backtest-test.mjs) ═════════════
   Tout est précalculé UNE fois pour la série M15, puis réutilisé par des milliers de variantes. Les informations H1 / H4 sont ALIGNÉES sur les bougies M15 sans regard vers le futur :
   à la clôture de la bougie M15 d'index i, la dernière bougie H1 (ou H4) CONNUE est la dernière dont la dernière sous-bougie M15 a l'index ≤ i (jamais celle qui est en train de se former).
   `ctx.h1.phase[i]` est donc la phase confirmée telle que l'agent l'aurait vue en direct à la clôture de la bougie i. */
export function aligner(finDe, n) {
  const idx = new Int32Array(n).fill(-1); let k = -1;
  for (let i = 0; i < n; i++) { while (k + 1 < finDe.length && finDe[k + 1] <= i) k++; idx[i] = k; }
  return idx;
}
const nan = n => { const a = new Float64Array(n); a.fill(NaN); return a; };
const surM15 = (src, idx, n) => { const out = nan(n); for (let i = 0; i < n; i++) { const k = idx[i]; if (k >= 0) out[i] = src[k]; } return out; };
const surM15u8 = (src, idx, n) => { const out = new Uint8Array(n); for (let i = 0; i < n; i++) { const k = idx[i]; if (k >= 0) out[i] = src[k]; } return out; };

/* Profil de volume léger (POC, bord haut et bord bas de la zone de valeur à 70 %) sur les bougies a..b-1 d'une série : sans objets, pour être appelé des dizaines de milliers de fois. */
export function profilLeger(s, a, b, tranches = 40, part = 0.7, vol = new Float64Array(tranches)) {
  let min = Infinity, max = -Infinity;
  for (let i = a; i < b; i++) { if (s.l[i] < min) min = s.l[i]; if (s.h[i] > max) max = s.h[i]; }
  if (!(max > min)) return null;
  const pas = (max - min) / tranches; vol.fill(0);
  for (let i = a; i < b; i++) {
    const lo = s.l[i], hi = s.h[i], v = s.v[i]; if (!(v > 0)) continue;
    const k0 = Math.min(tranches - 1, Math.floor((lo - min) / pas)), k1 = Math.min(tranches - 1, Math.floor((hi - min) / pas));
    if (k0 === k1) { vol[k0] += v; continue; }
    const ep = hi - lo; for (let k = k0; k <= k1; k++) { const l0 = Math.max(lo, min + k * pas), l1 = Math.min(hi, min + (k + 1) * pas); if (l1 > l0) vol[k] += v * (l1 - l0) / ep; }
  }
  let total = 0, poc = 0; for (let k = 0; k < tranches; k++) { total += vol[k]; if (vol[k] > vol[poc]) poc = k; }
  let lo = poc, hi = poc, cum = vol[poc];
  while (cum < total * part && (lo > 0 || hi < tranches - 1)) { const bas = lo > 0 ? vol[lo - 1] : -1, haut = hi < tranches - 1 ? vol[hi + 1] : -1; if (haut >= bas) { hi++; cum += vol[hi]; } else { lo--; cum += vol[lo]; } }
  return { poc: min + (poc + 0.5) * pas, vah: min + (hi + 1) * pas, val: min + lo * pas };
}

/* Construit le contexte. `fenetreProfil` : nombre de bougies H1 du profil roulant (120 = 5 jours). */
export function construireContexte(m15, { fenetreProfil = 120, deriv = null } = {}) {
  const n = m15.n, d15 = delta(m15);
  const g1 = regrouper(m15, MS.H1), g4 = regrouper(m15, MS.H4);
  const P1 = preparer(g1.serie, SEUILS_PHASE), P4 = preparer(g4.serie, SEUILS_PHASE_H4);
  const i1 = aligner(g1.finDe, n), i4 = aligner(g4.finDe, n);
  // profil de volume roulant en H1 (connu à la clôture de chaque H1)
  const H = g1.serie, poc = nan(H.n), vah = nan(H.n), val = nan(H.n), tmp = new Float64Array(40);
  for (let k = fenetreProfil - 1; k < H.n; k++) { const p = profilLeger(H, k - fenetreProfil + 1, k + 1, 40, 0.7, tmp); if (p) { poc[k] = p.poc; vah[k] = p.vah; val[k] = p.val; } }
  const volMoy20 = nan(n); { let s = 0; for (let i = 0; i < n; i++) { if (i >= 21) s -= m15.v[i - 21]; if (i >= 1) s += m15.v[i - 1]; if (i >= 21) volMoy20[i] = s / 20; } }   // moyenne des 20 bougies PRÉCÉDENTES (courante exclue)
  const ctx = {
    n, m15, cache: new Map(), deriv,
    atr15: atr(m15.h, m15.l, m15.c, 14), delta15: d15.d, deltaEstime: d15.estime, volMoy20,
    h1: { prep: P1, serie: g1.serie, idx: i1, phase: surM15u8(P1.phase, i1, n), phaseBrute: surM15u8(P1.phaseBrute, i1, n), atr: surM15(P1.atr, i1, n), ma200: surM15(P1.ma200, i1, n), ema50: surM15(P1.ema50, i1, n), pente: surM15(P1.pente, i1, n), atrRang: surM15(P1.rangATR, i1, n), poc: surM15(poc, i1, n), vah: surM15(vah, i1, n), val: surM15(val, i1, n), largeur: surM15(P1.largeur, i1, n) },
    h4: { prep: P4, serie: g4.serie, idx: i4, phase: surM15u8(P4.phase, i4, n), atr: surM15(P4.atr, i4, n), ma200: surM15(P4.ma200, i4, n), ema50: surM15(P4.ema50, i4, n), pente: surM15(P4.pente, i4, n) }
  };
  return ctx;
}
/* Niveaux « à battre » mis en cache : plus haut / plus bas des N bougies M15 précédentes (bougie courante exclue). */
export function hautAvant(ctx, N) { const k = 'hh' + N; if (!ctx.cache.has(k)) ctx.cache.set(k, plusHautAvant(ctx.m15.h, N)); return ctx.cache.get(k); }
export function basAvant(ctx, N) { const k = 'll' + N; if (!ctx.cache.has(k)) ctx.cache.set(k, plusBasAvant(ctx.m15.l, N)); return ctx.cache.get(k); }
export function emaM15(ctx, p) { const k = 'ema' + p; if (!ctx.cache.has(k)) ctx.cache.set(k, ema(ctx.m15.c, p)); return ctx.cache.get(k); }
export function smaM15(ctx, p) { const k = 'sma' + p; if (!ctx.cache.has(k)) ctx.cache.set(k, sma(ctx.m15.c, p)); return ctx.cache.get(k); }
export { mediane };
