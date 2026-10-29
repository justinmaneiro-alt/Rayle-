import { balayagesLiquidite } from '../liquidite/pieges-stops.js';
import { ema } from '../../planetes/mars/pc/agent-btc/indic.js';

/* ═════════════ ZONES, CONFLUENCE ET « ZONES DIAMANT » (V7, phase 3 bis ; module pur, testé : galaxie/tests/positions-zones-test.mjs) ═════════════
   Une zone de retournement est un NIVEAU où se superposent plusieurs éléments. Chaque élément a un poids ; la somme est le SCORE DE CONFLUENCE. Une « zone diamant » (interprétation de Justin, à confirmer dans
   docs/QUESTIONS_POUR_JUSTIN.md) = zone de confluence premium : score ≥ seuil réglable ET au moins 3 éléments DIFFÉRENTS.
   Éléments (poids) : balayage de liquidité avec reprise (2), mur de carnet fiable (2, en direct seulement : pas d'historique du carnet), plus hauts / bas égaux (1,5), extrême du jour précédent (1,5),
   extrême de la semaine précédente (1,5), POC du profil de volume (1,5), absorption (1,5), bord de la zone de valeur VAH / VAL (1), VWAP du jour (1), delta qui se retourne (1).
   Tout est CAUSAL : à la clôture de la barre k de la vue (M15 ou H1), seuls les niveaux connus à cet instant servent. Les poids sont des heuristiques NON calibrées : c'est le backtest par type de setup qui dit
   si une confluence a une valeur (la preuve est dans les statistiques, pas dans ce score). */
export const POIDS_ELEMENTS = Object.freeze({ balayage: 2, mur: 2, egaux: 1.5, jour_prec: 1.5, semaine_prec: 1.5, poc: 1.5, absorption: 1.5, val_vah: 1, vwap: 1, delta: 1 });
export const NOMS_ELEMENTS = Object.freeze({
  balayage: 'balayage de liquidité avec reprise', mur: 'mur du carnet d’ordres', egaux: 'plus bas / hauts égaux', jour_prec: 'extrême du jour précédent', semaine_prec: 'extrême de la semaine précédente',
  poc: 'point de contrôle du volume (POC)', absorption: 'absorption (gros volume sans progression)', val_vah: 'bord de la zone de valeur', vwap: 'VWAP du jour', delta: 'delta qui se retourne'
});
export const SEUIL_DIAMANT = Object.freeze({ score: 5, elements: 3 });
const nan = n => new Float64Array(n).fill(NaN);
const cache = (ctx, cle, f) => { if (!ctx.cache.has(cle)) ctx.cache.set(cle, f()); return ctx.cache.get(cle); };

/* La vue d'une unité de temps. `k(i)` : index de la dernière barre FERMÉE de la vue à la clôture de la barre M15 i (-1 si aucune) ; `nouvelle(i)` : une barre de la vue vient de se fermer à i. */
export function vue(ctx, tf) {
  return cache(ctx, 'pos:vue:' + tf, () => {
    if (tf === 'H1') {
      const idx = ctx.h1.idx;
      return { tf, s: ctx.h1.serie, atr: ctx.h1.prep.atr, k: i => idx[i], nouvelle: i => idx[i] >= 1 && (i === 0 || idx[i - 1] !== idx[i]), pas: 3600e3 };
    }
    return { tf: 'M15', s: ctx.m15, atr: ctx.atr15, k: i => i, nouvelle: () => true, pas: 900e3 };
  });
}

/* Éléments précalculés d'une vue (une fois par série) : VWAP du jour, extrêmes de la veille, volume moyen, delta par barre, EMA 20, piscines de liquidité et balayages. */
export function elementsVue(ctx, tf) {
  return cache(ctx, 'pos:elem:' + tf, () => {
    const V = vue(ctx, tf), s = V.s, n = s.n, vwap = nan(n), pdh = nan(n), pdl = nan(n), volMoy = nan(n), dr = nan(n);
    let jour = -1, pv = 0, v = 0, hc = -Infinity, lc = Infinity, hp = NaN, lp = NaN, acc = 0;
    for (let k = 0; k < n; k++) {
      const j = Math.floor(s.t[k] / 86400e3);
      if (j !== jour) { if (jour >= 0) { hp = hc; lp = lc; } jour = j; pv = 0; v = 0; hc = -Infinity; lc = Infinity; }
      const typ = (s.h[k] + s.l[k] + s.c[k]) / 3; pv += typ * s.v[k]; v += s.v[k]; hc = Math.max(hc, s.h[k]); lc = Math.min(lc, s.l[k]);
      vwap[k] = v > 0 ? pv / v : s.c[k]; pdh[k] = hp; pdl[k] = lp;
      acc += s.v[k]; if (k >= 20) acc -= s.v[k - 20]; if (k >= 20) volMoy[k] = (acc - s.v[k]) / 19;                        // moyenne des 19 barres précédentes (courante exclue)
      if (s.v[k] > 0) dr[k] = Number.isFinite(s.vb && s.vb[k]) && s.vb[k] >= 0 ? (2 * s.vb[k] - s.v[k]) / s.v[k] : ((s.h[k] > s.l[k]) ? (2 * s.c[k] - s.h[k] - s.l[k]) / (s.h[k] - s.l[k]) : 0);
    }
    const bal = balayagesLiquidite(s, V.atr, { garder: null });
    return { V, vwap, pdh, pdl, volMoy, dr, ema20: ema(s.c, 20), bal };
  });
}

/* Tolérance d'égalité entre un niveau et un élément : 0,35 ATR de la vue, au moins 0,05 % du prix. */
export const tolerance = (atr, prix) => Math.max(0.35 * (atr > 0 ? atr : 0), prix * 0.0005);

/* Confluence autour du niveau `L` (support si d = +1, résistance si d = −1) à la barre k de la vue, vue depuis la barre M15 i.
   `declencheur` : { balayage?: { type, touches }, absorption?: bool } décidés par l'agent ; `murs` (facultatif, EN DIRECT) : [{ prix, ratioMediane, fiable }]. */
export function confluence(ctx, tf, i, k, L, d, declencheur = {}, { murs = null } = {}) {
  const E = elementsVue(ctx, tf), s = E.V.s, at = E.V.atr[k], tol = tolerance(at, L), proche = x => Number.isFinite(x) && Math.abs(x - L) <= tol, el = [];
  const ajouter = (cle, detail) => { if (!el.some(e => e.cle === cle)) el.push({ cle, poids: POIDS_ELEMENTS[cle], texte: NOMS_ELEMENTS[cle] + (detail ? ' (' + detail + ')' : '') }); };
  const pool = declencheur.balayage || declencheur.piscine;                                      // `piscine` : niveau pas encore balayé (zone à surveiller) → pas d'élément « balayage »
  if (pool) {
    if (declencheur.balayage) ajouter('balayage');
    const t = pool.type;
    if (t === 'egaux') ajouter('egaux', pool.touches + ' touche' + (pool.touches > 1 ? 's' : '')); else if (t === 'jour_prec') ajouter('jour_prec'); else if (t === 'semaine_prec') ajouter('semaine_prec');
  }
  if (proche(d > 0 ? E.pdl[k] : E.pdh[k])) ajouter('jour_prec');
  if (proche(ctx.h1.poc[i])) ajouter('poc');
  if (proche(d > 0 ? ctx.h1.val[i] : ctx.h1.vah[i])) ajouter('val_vah');
  if (proche(E.vwap[k])) ajouter('vwap');
  const absor = declencheur.absorption != null ? declencheur.absorption : absorption(E, s, k, d, at);
  if (absor) ajouter('absorption');
  if (deltaRetourne(E, s, k, d)) ajouter('delta');
  if (murs) for (const m of murs) if (m && m.fiable !== false && proche(m.prix)) { ajouter('mur', 'x' + (m.ratioMediane || 0).toFixed(1).replace('.', ',') + ' la médiane'); break; }
  const score = el.reduce((a, e) => a + e.poids, 0);
  return { niveau: L, cote: d > 0 ? 'support' : 'resistance', elements: el, n: el.length, score, diamant: score >= SEUIL_DIAMANT.score && el.length >= SEUIL_DIAMANT.elements };
}

/* Absorption à la barre k : gros volume (≥ 1,8 × la moyenne), peu de progression (étendue ≤ 1,2 ATR) et une mèche du bon côté (≥ 40 % de l'étendue) : on a absorbé les ordres adverses. */
export function absorption(E, s, k, d, at) {
  if (!(E.volMoy[k] > 0) || !(at > 0)) return false;
  const etendue = s.h[k] - s.l[k]; if (!(etendue > 0)) return false;
  const meche = d > 0 ? Math.min(s.o[k], s.c[k]) - s.l[k] : s.h[k] - Math.max(s.o[k], s.c[k]);
  return s.v[k] >= 1.8 * E.volMoy[k] && etendue <= 1.2 * at && meche >= 0.4 * etendue;
}
/* Delta qui se retourne : sur un support, la barre (ou la précédente) a un delta acheteur net malgré un plus bas ; sur une résistance, l'inverse. */
export function deltaRetourne(E, s, k, d) {
  if (k < 2) return false;
  const a = E.dr[k], b = E.dr[k - 1]; if (!Number.isFinite(a)) return false;
  return d > 0 ? (a > 0.1 && (s.l[k] < s.l[k - 1] || s.l[k] < s.l[k - 2] || b < 0)) : (a < -0.1 && (s.h[k] > s.h[k - 1] || s.h[k] > s.h[k - 2] || b > 0));
}

/* Texte court d'une confluence (« 💎 zone diamant : balayage de liquidité…, POC… »). */
export function resumeConfluence(c) {
  return (c.diamant ? '💎 zone diamant : ' : 'confluence (' + c.n + ' élément' + (c.n > 1 ? 's' : '') + ') : ') + c.elements.map(e => e.texte).join(', ') + ' — score ' + c.score.toFixed(1).replace('.', ',');
}
