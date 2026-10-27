import { construireContexte, basAvant, hautAvant } from '../agent-btc/contexte.js';
import { ema } from '../agent-btc/indic.js';
import { CODES, detecter } from './detecteur-regime.js';

/* ═════════════ UNE RÈGLE PAR RÉGIME (M6c ; module pur, testé : m6c-regles-test.mjs) ═════════════
   Les paramètres par défaut et les grilles ci-dessous sont déclarés AVANT toute mesure (voir criteres-m6c.js) ; les grilles sont minuscules et motivées :
   - TENDANCE (cassure de qualité ou repli sur la moyenne 50 H1) : stop suiveur « chandelier » à 3 ou 4 ATR H1, pas d'objectif fixe (on laisse courir) ;
   - RANGE par défaut : AUCUNE entrée (c'est un filtre : toutes les règles de tendance exigent un régime de tendance) ; le « trade du range » est une option SÉPARÉE, testée à part ;
   - CASSURE DE RANGE : seulement avec un score de qualité (clôture au-delà de la borne + volume en expansion + delta dans le sens + sortie de compression + bougie d'élan), immédiate ou après un retest qui tient ;
     une clôture qui revient dans la boîte dans les 12 bougies M15 = FAUSSE CASSURE (balayage de liquidité) : évitée en mode retest, subie en mode immédiat ; les deux sont comptées.
   Toutes les règles sont CAUSALES : le signal en i n'utilise que les bougies M15 0..i et les bougies H1 déjà fermées. */
const DEPART = 800;
const fab = n => ({ sens: new Int8Array(n), stop: new Float64Array(n), suivi: new Float64Array(n), cible: new Float64Array(n).fill(NaN), etiq: new Uint8Array(n), regime: new Uint8Array(n), evenements: [] });
const al = (src, idx, n, Type = Float64Array, vide = NaN) => { const out = new Type(n); if (vide !== 0) out.fill(vide); for (let i = 0; i < n; i++) { const k = idx[i]; if (k >= 0) out[i] = src[k]; } return out; };

/* Contexte du moteur + régime H1 aligné sur les bougies M15 (valeur connue à la clôture de la dernière H1 fermée). */
export function contexteRegime(m15, { deriv = null } = {}) {
  const ctx = construireContexte(m15, { deriv }), H = ctx.h1.serie, det = detecter(H), n = ctx.n, idx = ctx.h1.idx;
  // dernière boîte de range connue (même si le régime a changé depuis), avec la compression récente
  const lrHaut = new Float64Array(H.n).fill(NaN), lrBas = new Float64Array(H.n).fill(NaN), lrK = new Int32Array(H.n).fill(-1), lrComp = new Uint8Array(H.n);
  let h = NaN, b = NaN, kk = -1, comp = 0, derniereComp = -1e9;
  for (let k = 0; k < H.n; k++) {
    if (det.compression[k]) derniereComp = k;
    if (det.regime[k] === CODES.RANGE) { h = det.boiteHaut[k]; b = det.boiteBas[k]; kk = k; comp = k - derniereComp <= 24 ? 1 : 0; }
    lrHaut[k] = h; lrBas[k] = b; lrK[k] = kk; lrComp[k] = comp;
  }
  const e20 = ema(H.c, 20), e50 = ema(H.c, 50);
  ctx.reg = {
    det, regime: al(det.regime, idx, n, Uint8Array, 0), volatil: al(det.volatil, idx, n, Uint8Array, 0), adx: al(det.adx, idx, n), haut: al(det.boiteHaut, idx, n), bas: al(det.boiteBas, idx, n),
    touchesH: al(det.touchesHaut, idx, n, Uint8Array, 0), touchesB: al(det.touchesBas, idx, n, Uint8Array, 0), age: al(det.age, idx, n, Int32Array, 0),
    lrHaut: al(lrHaut, idx, n), lrBas: al(lrBas, idx, n), lrK: al(lrK, idx, n, Int32Array, -1), lrComp: al(lrComp, idx, n, Uint8Array, 0), idxH1: idx,
    ema20: al(e20, idx, n), ema50: al(e50, idx, n), ema20Prec: al(e20, idx.map(k => k - 1), n), ema50Prec: al(e50, idx.map(k => k - 1), n)
  };
  return ctx;
}
const filtreTendance = (ctx, i, sens, filtre) => filtre === 0 ? true : sens > 0 ? ctx.reg.regime[i] === CODES.HAUSSIER : ctx.reg.regime[i] === CODES.BAISSIER;
const haut5 = (m, i) => m.h[i] - m.l[i] > 0 ? (m.c[i] - m.l[i]) / (m.h[i] - m.l[i]) : 0.5;     // position de la clôture dans la bougie (0 = bas, 1 = haut)

export const REGLES = {
  tendance_cassure: {
    id: 'tendance_cassure', regime: 'tendance', nom: 'Tendance : cassure de qualité, stop suiveur',
    description: 'En tendance H1 (haussière : achat ; baissière : vente), la clôture M15 dépasse le plus haut (bas) des N dernières bougies pour la première fois, avec un volume ≥ 1,5 fois la moyenne, un delta dans le sens et une clôture dans le tiers extrême de la bougie. Stop initial 2 ATR H1, puis stop suiveur.',
    defaut: { N: 96, trail: 3, filtre: 1 },
    grille: () => ({ N: [72, 96, 144, 192], trail: [2.5, 3, 3.5, 4, 5], filtre: [1] }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fab(n), hh = hautAvant(ctx, p.N), ll = basAvant(ctx, p.N);
      for (let i = DEPART; i < n; i++) {
        const a = ctx.h1.atr[i], vm = ctx.volMoy20[i]; if (!(a > 0) || !(vm > 0) || !(hh[i] > 0) || !(m15.v[i] >= 1.5 * vm)) continue;
        if (m15.c[i] > hh[i] && m15.c[i - 1] <= hh[i] && ctx.delta15[i] > 0 && haut5(m15, i) >= 0.67 && filtreTendance(ctx, i, 1, p.filtre)) { o.sens[i] = 1; o.stop[i] = m15.c[i] - 2 * a; o.suivi[i] = p.trail * a; o.regime[i] = ctx.reg.regime[i]; }
        else if (m15.c[i] < ll[i] && m15.c[i - 1] >= ll[i] && ctx.delta15[i] < 0 && haut5(m15, i) <= 0.33 && filtreTendance(ctx, i, -1, p.filtre)) { o.sens[i] = -1; o.stop[i] = m15.c[i] + 2 * a; o.suivi[i] = p.trail * a; o.regime[i] = ctx.reg.regime[i]; }
      }
      return o;
    },
    eligibles(ctx, p) { const n = ctx.n, e = new Int8Array(n); for (let i = DEPART; i < n; i++) e[i] = ctx.reg.regime[i] === CODES.HAUSSIER ? 1 : ctx.reg.regime[i] === CODES.BAISSIER ? -1 : 0; return e; },
    construire(ctx, p, i, sens) { const a = ctx.h1.atr[i], c = ctx.m15.c[i]; return a > 0 ? { stop: c - sens * 2 * a, suivi: p.trail * a } : null; }
  },
  tendance_repli: {
    id: 'tendance_repli', regime: 'tendance', nom: 'Tendance : repli sur la moyenne 50 H1, stop suiveur',
    description: 'En tendance H1, le prix est revenu toucher la moyenne exponentielle 50 H1 (à 0,5 ATR près) dans les 16 dernières bougies M15, puis une bougie de reprise (clôture au-delà du plus haut / plus bas précédent, dans le sens de la tendance) déclenche l’entrée. Stop sous le creux du repli, puis stop suiveur.',
    defaut: { trail: 3, prof: 0.5, filtre: 1 },
    grille: () => ({ trail: [2.5, 3, 3.5, 4, 5], prof: [0.3, 0.5, 0.8], filtre: [1] }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fab(n);
      for (let i = DEPART; i < n; i++) {
        const a = ctx.h1.atr[i], e = ctx.reg.ema50[i]; if (!(a > 0) || !(e > 0)) continue;
        let bas = Infinity, haut = -Infinity; for (let j = i - 15; j <= i; j++) { if (m15.l[j] < bas) bas = m15.l[j]; if (m15.h[j] > haut) haut = m15.h[j]; }
        if (m15.c[i] > m15.o[i] && m15.c[i] > m15.h[i - 1] && bas <= e + p.prof * a && m15.c[i] > e && filtreTendance(ctx, i, 1, p.filtre) && m15.c[i] - (bas - 0.2 * a) > 0) { o.sens[i] = 1; o.stop[i] = bas - 0.2 * a; o.suivi[i] = p.trail * a; o.regime[i] = ctx.reg.regime[i]; }
        else if (m15.c[i] < m15.o[i] && m15.c[i] < m15.l[i - 1] && haut >= e - p.prof * a && m15.c[i] < e && filtreTendance(ctx, i, -1, p.filtre)) { o.sens[i] = -1; o.stop[i] = haut + 0.2 * a; o.suivi[i] = p.trail * a; o.regime[i] = ctx.reg.regime[i]; }
      }
      return o;
    },
    eligibles(ctx, p) { return REGLES.tendance_cassure.eligibles(ctx, p); },
    construire(ctx, p, i, sens) { const a = ctx.h1.atr[i], c = ctx.m15.c[i]; return a > 0 ? { stop: c - sens * 2 * a, suivi: p.trail * a } : null; }
  },
  cassure_range: {
    id: 'cassure_range', regime: 'cassure', nom: 'Cassure de range de qualité (rejette les fausses cassures)',
    description: 'Après un range détecté (bornes tracées), la clôture M15 dépasse une borne de 0,1 ATR H1 ; la cassure n’est retenue que si son score de qualité est suffisant (volume en expansion, delta dans le sens, sortie de compression, bougie d’élan). Mode « retest » : on entre seulement quand le prix revient toucher la borne cassée et la tient ; si une clôture rentre dans la boîte, c’est une fausse cassure (évitée). Stop sous la borne (1 ATR H1), puis stop suiveur 3 ATR.',
    defaut: { mode: 'retest', score: 3, mult: 1.5 },
    grille: () => ({ mode: ['immediat', 'retest'], score: [3, 4], mult: [1.2, 1.5, 2] }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fab(n), R = ctx.reg, kk = R.idxH1;
      let pend = null; const surveille = [];
      for (let i = DEPART; i < n; i++) {
        const a = ctx.h1.atr[i]; if (!(a > 0)) continue;
        // suivi des cassures déjà prises en mode immédiat : retour dans la boîte = fausse cassure SUBIE
        for (let q = surveille.length - 1; q >= 0; q--) { const w = surveille[q]; if (i - w.b > 12) surveille.splice(q, 1); else if (w.sens > 0 ? m15.c[i] <= w.borne : m15.c[i] >= w.borne) { o.evenements.push({ t: m15.t[i], sens: w.sens, type: 'subie', borne: w.borne }); surveille.splice(q, 1); } }
        if (pend) {
          if (i - pend.b > 32) pend = null;
          else if (pend.sens > 0 ? m15.c[i] <= pend.borne : m15.c[i] >= pend.borne) { o.evenements.push({ t: m15.t[i], sens: pend.sens, type: 'evitee', borne: pend.borne }); pend = null; }
          else if (i > pend.b && (pend.sens > 0 ? m15.l[i] <= pend.borne + 0.25 * a && m15.c[i] > m15.o[i] : m15.h[i] >= pend.borne - 0.25 * a && m15.c[i] < m15.o[i])) {
            o.sens[i] = pend.sens; o.stop[i] = pend.borne - pend.sens * a; o.suivi[i] = 3 * a; o.etiq[i] = 2; o.regime[i] = CODES.RANGE; pend = null; continue;
          }
          if (pend) continue;
        }
        const haut = R.lrHaut[i], bas = R.lrBas[i]; if (!(haut > 0) || R.lrK[i] < 0 || kk[i] - R.lrK[i] > 12) continue;        // la boîte reste valable pendant la bougie H1 de la cassure (le régime ne change qu'à la clôture de cette H1)
        const sens = m15.c[i] > haut + 0.1 * a && m15.c[i - 1] <= haut + 0.1 * a ? 1 : m15.c[i] < bas - 0.1 * a && m15.c[i - 1] >= bas - 0.1 * a ? -1 : 0; if (!sens) continue;
        const vm = ctx.volMoy20[i];
        const score = Number(m15.v[i] >= p.mult * vm) + Number(sens > 0 ? ctx.delta15[i] > 0 : ctx.delta15[i] < 0) + Number(!!R.lrComp[i]) + Number(sens > 0 ? haut5(m15, i) >= 0.7 : haut5(m15, i) <= 0.3) + Number(m15.h[i] - m15.l[i] >= ctx.atr15[i]);
        if (score < p.score) continue;
        const borne = sens > 0 ? haut : bas;
        if (p.mode === 'immediat') { o.sens[i] = sens; o.stop[i] = borne - sens * a; o.suivi[i] = 3 * a; o.etiq[i] = 1; o.regime[i] = CODES.RANGE; surveille.push({ sens, borne, b: i }); }
        else pend = { sens, borne, b: i };
      }
      return o;
    },
    eligibles(ctx) { const n = ctx.n, e = new Int8Array(n), R = ctx.reg; for (let i = DEPART; i < n; i++) if (R.lrK[i] >= 0 && R.idxH1[i] - R.lrK[i] <= 12) e[i] = 2; return e; },
    construire(ctx, p, i, sens) { const a = ctx.h1.atr[i], R = ctx.reg, borne = sens > 0 ? R.lrHaut[i] : R.lrBas[i]; return a > 0 && borne > 0 ? { stop: borne - sens * a, suivi: 3 * a } : null; }
  },
  range_trade: {
    id: 'range_trade', regime: 'range', nom: 'Trade du range (acheter bas, vendre haut) — option séparée',
    description: 'En range détecté, achat quand le prix a touché le dixième bas de la boîte puis repart (bougie haussière qui clôture au-dessus du bas de la boîte + 0,1 largeur), vente symétrique en haut. Stop juste hors de la boîte (0,5 ATR H1), objectif le milieu du range ou la borne opposée.',
    defaut: { cible: 'milieu', zone: 0.1, stopATR: 0.5 },
    grille: () => ({ cible: ['milieu', 'borne'], zone: [0.08, 0.1, 0.15], stopATR: [0.3, 0.5, 0.8] }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fab(n), R = ctx.reg;
      for (let i = DEPART; i < n; i++) {
        if (R.regime[i] !== CODES.RANGE) continue; const a = ctx.h1.atr[i], hi = R.haut[i], lo = R.bas[i], w = hi - lo; if (!(a > 0) || !(w > 0)) continue;
        if (m15.l[i] <= lo + p.zone * w && m15.c[i] > m15.o[i] && m15.c[i] > lo + p.zone * w && m15.c[i] < lo + 0.4 * w) { o.sens[i] = 1; o.stop[i] = lo - p.stopATR * a; o.cible[i] = p.cible === 'milieu' ? (hi + lo) / 2 : hi - 0.1 * w; o.etiq[i] = 3; o.regime[i] = CODES.RANGE; }
        else if (m15.h[i] >= hi - p.zone * w && m15.c[i] < m15.o[i] && m15.c[i] < hi - p.zone * w && m15.c[i] > hi - 0.4 * w) { o.sens[i] = -1; o.stop[i] = hi + p.stopATR * a; o.cible[i] = p.cible === 'milieu' ? (hi + lo) / 2 : lo + 0.1 * w; o.etiq[i] = 3; o.regime[i] = CODES.RANGE; }
      }
      return o;
    },
    eligibles(ctx) { const n = ctx.n, e = new Int8Array(n), R = ctx.reg; for (let i = DEPART; i < n; i++) if (R.regime[i] === CODES.RANGE) e[i] = 2; return e; },
    construire(ctx, p, i, sens) { const a = ctx.h1.atr[i], R = ctx.reg, hi = R.haut[i], lo = R.bas[i], w = hi - lo; if (!(a > 0) || !(w > 0)) return null; return sens > 0 ? { stop: lo - p.stopATR * a, cible: p.cible === 'milieu' ? (hi + lo) / 2 : hi - 0.1 * w } : { stop: hi + p.stopATR * a, cible: p.cible === 'milieu' ? (hi + lo) / 2 : lo + 0.1 * w }; }
  }
};
export const ORDRE_REGLES = ['tendance_cassure', 'tendance_repli', 'cassure_range', 'range_trade'];
export function combinaisonsRegle(id) {
  const g = REGLES[id].grille(), cles = Object.keys(g); let out = [{}];
  for (const k of cles) out = out.flatMap(x => g[k].map(v => ({ ...x, [k]: v })));
  return out;
}

/* ── Références de comparaison (mêmes stops, mêmes sorties) ── */
/* Croisement de moyennes mobiles EMA 20 / 50 H1 : mêmes conditions d'éligibilité (régime), mêmes stops et même suivi que la règle de tendance. */
export function signauxCroisement(ctx, p = { trail: 3, filtre: 1 }) {
  const { m15 } = ctx, n = ctx.n, o = fab(n), R = ctx.reg;
  for (let i = DEPART; i < n; i++) {
    const a = ctx.h1.atr[i], e20 = R.ema20[i], e50 = R.ema50[i], q20 = R.ema20Prec[i], q50 = R.ema50Prec[i]; if (!(a > 0) || !(e20 > 0) || !(q20 > 0) || !(e50 > 0) || !(q50 > 0)) continue;
    if (q20 <= q50 && e20 > e50 && filtreTendance(ctx, i, 1, p.filtre)) { o.sens[i] = 1; o.stop[i] = m15.c[i] - 2 * a; o.suivi[i] = p.trail * a; o.regime[i] = R.regime[i]; }
    else if (q20 >= q50 && e20 < e50 && filtreTendance(ctx, i, -1, p.filtre)) { o.sens[i] = -1; o.stop[i] = m15.c[i] + 2 * a; o.suivi[i] = p.trail * a; o.regime[i] = R.regime[i]; }
  }
  return o;
}
