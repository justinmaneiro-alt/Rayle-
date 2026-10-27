import { FAMILLES, combinaisons } from '../agent-btc/hypotheses.js';

/* ═════════════ CONCEPTS « ICT / SMART MONEY » ET FIGURES CHARTISTES COMME HYPOTHÈSES À TESTER (M6 ; module pur, testé : planetes/mars/tests/m6-ict-test.mjs) ═════════════
   Ces notions circulent beaucoup (fair value gaps, order blocks, balayages de liquidité, zones premium / discount) sans preuve statistique solide. Ici elles sont traitées comme ce qu'elles sont : des
   HYPOTHÈSES, écrites comme des règles précises, mesurées par le moteur de backtest avec EXACTEMENT les mêmes critères que toutes les autres stratégies (walk-forward, jeu final ouvert une fois,
   Sharpe déflaté avec le nombre TOTAL de variantes testées…). Aucun critère n'est assoupli pour elles. Chaque détecteur est causal (le signal en i n'utilise que les bougies 0..i, vérifié par le
   poison du futur), testé sur des cas construits à la main, et expose une grille de paramètres FIGÉE ici avant tout test sur les vraies données.
   Les mots sont des conventions de langage, pas des vérités : « liquidité », « zone institutionnelle »… ne sont pas observables dans des bougies ; on teste seulement si la FORME du prix a un effet net. */
const DEPART = 400;
const fabrique = n => ({ sens: new Int8Array(n), stop: new Float64Array(n) });
const filtreTendance = (ctx, p, i, sens) => !p.tendance || ctx.h4.phase[i] === (sens > 0 ? 1 : 2);

/* Zones « actives » : une liste de zones { bas, haut, sens, i0 } qui expirent après maxAge bougies ou quand le prix les invalide ; une zone ne sert qu'UNE fois (première retouche). */
function purger(zones, i, maxAge) { for (let k = zones.length - 1; k >= 0; k--) if (i - zones[k].i0 > maxAge) zones.splice(k, 1); }

/* ── 1. Fair value gap : un « trou » de trois bougies après une bougie de déplacement ; entrée à la première retouche qui refuse de le traverser ── */
const FVG = {
  id: 'ict_fvg', nom: 'Fair value gap : retour dans le trou et rejet',
  description: 'Une bougie de déplacement laisse un trou entre le haut de la bougie d’avant et le bas de la bougie d’après (haussier ; miroir pour le baissier). Quand le prix revient dans ce trou et que la bougie se referme du côté du déplacement, on entre dans le sens du déplacement, stop de l’autre côté du trou. Hypothèse ICT, testée comme toutes les autres.',
  grille: () => ({ minGap: [0.2, 0.5], dispo: [0.8, 1.2], maxAge: [48, 96], pad: [0.25, 0.5], R: [2, 3, 4], tendance: [0, 1] }),
  signaux(ctx, p) {
    const { m15 } = ctx, n = ctx.n, o = fabrique(n), zones = []; o.R = p.R;
    for (let i = DEPART; i < n; i++) {
      const a = ctx.h1.atr[i]; if (!(a > 0)) continue;
      purger(zones, i, p.maxAge);
      // retouche des zones existantes (créées avant cette bougie)
      for (let k = zones.length - 1; k >= 0; k--) {
        const z = zones[k];
        if (z.sens > 0) {
          if (m15.c[i] < z.bas) { zones.splice(k, 1); continue; }                                           // clôture sous le trou : invalidé
          if (m15.l[i] <= z.haut && m15.c[i] > m15.o[i] && m15.c[i] > z.bas && filtreTendance(ctx, p, i, 1)) { const st = z.bas - p.pad * a; if (st < m15.c[i]) { o.sens[i] = 1; o.stop[i] = st; } zones.splice(k, 1); }
        } else {
          if (m15.c[i] > z.haut) { zones.splice(k, 1); continue; }
          if (m15.h[i] >= z.bas && m15.c[i] < m15.o[i] && m15.c[i] < z.haut && filtreTendance(ctx, p, i, -1)) { const st = z.haut + p.pad * a; if (st > m15.c[i]) { o.sens[i] = -1; o.stop[i] = st; } zones.splice(k, 1); }
        }
      }
      // nouveau trou confirmé à la clôture de la bougie i (bougies i−2, i−1, i)
      const corps = Math.abs(m15.c[i - 1] - m15.o[i - 1]);
      if (m15.l[i] > m15.h[i - 2] && m15.l[i] - m15.h[i - 2] >= p.minGap * a && m15.c[i - 1] > m15.o[i - 1] && corps >= p.dispo * a) zones.push({ bas: m15.h[i - 2], haut: m15.l[i], sens: 1, i0: i });
      else if (m15.h[i] < m15.l[i - 2] && m15.l[i - 2] - m15.h[i] >= p.minGap * a && m15.c[i - 1] < m15.o[i - 1] && corps >= p.dispo * a) zones.push({ bas: m15.h[i], haut: m15.l[i - 2], sens: -1, i0: i });
    }
    return o;
  }
};

/* ── 2. Order block : la dernière bougie contraire avant un déplacement qui casse la structure ; entrée à son retour ── */
const OB = {
  id: 'ict_order_block', nom: 'Order block : retour sur la dernière bougie contraire avant un déplacement',
  description: 'Un déplacement fort casse le plus haut (ou plus bas) des N dernières bougies. La dernière bougie de sens contraire juste avant forme une « zone » ; quand le prix y revient et se referme du bon côté, on entre dans le sens du déplacement, stop de l’autre côté de la zone. Hypothèse ICT.',
  grille: () => ({ L: [24, 48], dispo: [1.5, 2.5], maxAge: [48, 96], pad: [0.25, 0.5], R: [2, 3, 4] }),
  signaux(ctx, p) {
    const { m15 } = ctx, n = ctx.n, o = fabrique(n), zones = []; o.R = p.R;
    for (let i = DEPART; i < n; i++) {
      const a = ctx.h1.atr[i]; if (!(a > 0)) continue;
      purger(zones, i, p.maxAge);
      for (let k = zones.length - 1; k >= 0; k--) {
        const z = zones[k];
        if (z.sens > 0) {
          if (m15.c[i] < z.bas) { zones.splice(k, 1); continue; }
          if (i > z.i0 + 1 && m15.l[i] <= z.haut && m15.c[i] > m15.o[i] && m15.c[i] > z.bas) { const st = z.bas - p.pad * a; if (st < m15.c[i]) { o.sens[i] = 1; o.stop[i] = st; } zones.splice(k, 1); }
        } else {
          if (m15.c[i] > z.haut) { zones.splice(k, 1); continue; }
          if (i > z.i0 + 1 && m15.h[i] >= z.bas && m15.c[i] < m15.o[i] && m15.c[i] < z.haut) { const st = z.haut + p.pad * a; if (st > m15.c[i]) { o.sens[i] = -1; o.stop[i] = st; } zones.splice(k, 1); }
        }
      }
      // cassure de structure avec déplacement à la bougie i
      let hh = -Infinity, ll = Infinity; for (let j = i - p.L; j < i; j++) { if (m15.h[j] > hh) hh = m15.h[j]; if (m15.l[j] < ll) ll = m15.l[j]; }
      let bas3 = Infinity, haut3 = -Infinity; for (let j = i - 2; j <= i; j++) { if (m15.l[j] < bas3) bas3 = m15.l[j]; if (m15.h[j] > haut3) haut3 = m15.h[j]; }
      if (m15.c[i] > hh && m15.c[i - 1] <= hh && m15.c[i] - bas3 >= p.dispo * a) {
        for (let j = i - 1; j >= i - 6; j--) if (m15.c[j] < m15.o[j]) { zones.push({ bas: m15.l[j], haut: m15.h[j], sens: 1, i0: i }); break; }
      } else if (m15.c[i] < ll && m15.c[i - 1] >= ll && haut3 - m15.c[i] >= p.dispo * a) {
        for (let j = i - 1; j >= i - 6; j--) if (m15.c[j] > m15.o[j]) { zones.push({ bas: m15.l[j], haut: m15.h[j], sens: -1, i0: i }); break; }
      }
    }
    return o;
  }
};

/* ── 3. Balayage de liquidité : un extrême touché plusieurs fois (« liquidité égale ») est dépassé puis refermé à l'intérieur ── */
const SWEEP = {
  id: 'ict_sweep', nom: 'Balayage de liquidité : extrême égal dépassé puis refermé à l’intérieur',
  description: 'Le plus bas (ou plus haut) des N dernières bougies a été touché au moins « eq » fois à moins de 0,2 ATR près (des ordres s’y accumulent, dit-on). Une bougie le dépasse puis se referme à l’intérieur avec une mèche marquée : on entre dans le sens du retour, stop au-delà de la mèche. Hypothèse ICT.',
  grille: () => ({ N: [48, 96, 192], eq: [1, 2, 3], meche: [0.4, 0.5], pad: [0.25, 0.5], R: [2, 3, 4] }),
  signaux(ctx, p) {
    const { m15 } = ctx, n = ctx.n, o = fabrique(n); o.R = p.R;
    for (let i = Math.max(DEPART, p.N + 2); i < n; i++) {
      const a = ctx.h1.atr[i]; if (!(a > 0)) continue; const tol = 0.2 * a, ampl = m15.h[i] - m15.l[i]; if (!(ampl > 0)) continue;
      let mn = Infinity, mx = -Infinity; for (let j = i - p.N; j < i; j++) { if (m15.l[j] < mn) mn = m15.l[j]; if (m15.h[j] > mx) mx = m15.h[j]; }
      let nb = 0, nh = 0; for (let j = i - p.N; j < i; j++) { if (m15.l[j] <= mn + tol) nb++; if (m15.h[j] >= mx - tol) nh++; }
      if (m15.l[i] < mn && m15.c[i] > mn && nb >= p.eq && (Math.min(m15.o[i], m15.c[i]) - m15.l[i]) / ampl >= p.meche) { const st = m15.l[i] - p.pad * a; if (st < m15.c[i]) { o.sens[i] = 1; o.stop[i] = st; } }
      else if (m15.h[i] > mx && m15.c[i] < mx && nh >= p.eq && (m15.h[i] - Math.max(m15.o[i], m15.c[i])) / ampl >= p.meche) { const st = m15.h[i] + p.pad * a; if (st > m15.c[i]) { o.sens[i] = -1; o.stop[i] = st; } }
    }
    return o;
  }
};

/* ── 4. Premium / discount : acheter dans la moitié basse d'un intervalle en tendance haussière, vendre dans la moitié haute en tendance baissière ── */
const PD = {
  id: 'ict_premium_discount', nom: 'Premium / discount : acheter bas, vendre haut dans l’intervalle, avec la tendance',
  description: 'Sur l’intervalle des W dernières bougies, la moitié basse est le « discount », la moitié haute le « premium ». En tendance haussière (phase H1 ou H4), on achète dans le discount après une bougie de rejet haussière ; en tendance baissière, on vend dans le premium. Stop sous (sur) le dernier extrême. Hypothèse ICT.',
  grille: () => ({ W: [96, 192, 384], niveau: [0.5, 0.382], tf: ['h1', 'h4'], pad: [0.25, 0.5], R: [2, 3, 4] }),
  signaux(ctx, p) {
    const { m15 } = ctx, n = ctx.n, o = fabrique(n), phase = p.tf === 'h4' ? ctx.h4.phase : ctx.h1.phase; o.R = p.R;
    for (let i = Math.max(DEPART, p.W); i < n; i++) {
      const a = ctx.h1.atr[i]; if (!(a > 0)) continue;
      let hi = -Infinity, lo = Infinity; for (let j = i - p.W + 1; j <= i; j++) { if (m15.h[j] > hi) hi = m15.h[j]; if (m15.l[j] < lo) lo = m15.l[j]; }
      const ampl = hi - lo, bar = m15.h[i] - m15.l[i]; if (!(ampl > 0) || !(bar > 0)) continue; const pos = (m15.c[i] - lo) / ampl;
      if (phase[i] === 1 && pos <= p.niveau && m15.c[i] > m15.o[i] && (Math.min(m15.o[i], m15.c[i]) - m15.l[i]) / bar >= 0.4) { let mn = Infinity; for (let j = i - 11; j <= i; j++) if (m15.l[j] < mn) mn = m15.l[j]; const st = mn - p.pad * a; if (st < m15.c[i]) { o.sens[i] = 1; o.stop[i] = st; } }
      else if (phase[i] === 2 && pos >= 1 - p.niveau && m15.c[i] < m15.o[i] && (m15.h[i] - Math.max(m15.o[i], m15.c[i])) / bar >= 0.4) { let mx = -Infinity; for (let j = i - 11; j <= i; j++) if (m15.h[j] > mx) mx = m15.h[j]; const st = mx + p.pad * a; if (st > m15.c[i]) { o.sens[i] = -1; o.stop[i] = st; } }
    }
    return o;
  }
};

/* ── 5. Double creux / double sommet : deux extrêmes confirmés au même niveau, entrée à la cassure de la « ligne de cou » ── */
const DOUBLE = {
  id: 'figure_double', nom: 'Double creux / double sommet : cassure de la ligne de cou',
  description: 'Deux creux (ou sommets) confirmés au même niveau, à moins de « tol » ATR l’un de l’autre, séparés d’au moins 12 et d’au plus 200 bougies. La ligne de cou est l’extrême opposé entre les deux. La clôture au-delà de cette ligne déclenche l’entrée, stop sous (sur) les deux creux (sommets). Figure chartiste classique, testée comme une hypothèse.',
  grille: () => ({ tol: [0.5, 1], k: [3, 5], pad: [0.25, 0.5], R: [2, 3, 4] }),
  signaux(ctx, p) {
    const { m15 } = ctx, n = ctx.n, o = fabrique(n), k = p.k; o.R = p.R;
    const lows = [], highs = []; let actif = null;                                  // pivots confirmés (jamais de futur : un pivot en j est connu à j + k)
    for (let i = 0; i < n; i++) {
      const j = i - k;
      if (j >= k) {
        let creux = true, sommet = true; for (let m = j - k; m <= j + k; m++) { if (m === j) continue; if (m15.l[m] <= m15.l[j]) creux = false; if (m15.h[m] >= m15.h[j]) sommet = false; }
        if (creux) { lows.push({ idx: j, prix: m15.l[j], i: i }); if (lows.length > 8) lows.shift(); const q = lows[lows.length - 2]; if (q && j - q.idx >= 12 && j - q.idx <= 200 && Math.abs(q.prix - m15.l[j]) <= p.tol * ctx.h1.atr[i]) { let cou = -Infinity; for (let m = q.idx; m <= j; m++) if (m15.h[m] > cou) cou = m15.h[m]; if (cou > Math.max(q.prix, m15.l[j]) + 0.5 * ctx.h1.atr[i]) actif = { sens: 1, cou, stop: Math.min(q.prix, m15.l[j]) - p.pad * ctx.h1.atr[i], i0: i }; } }
        if (sommet) { highs.push({ idx: j, prix: m15.h[j], i: i }); if (highs.length > 8) highs.shift(); const q = highs[highs.length - 2]; if (q && j - q.idx >= 12 && j - q.idx <= 200 && Math.abs(q.prix - m15.h[j]) <= p.tol * ctx.h1.atr[i]) { let cou = Infinity; for (let m = q.idx; m <= j; m++) if (m15.l[m] < cou) cou = m15.l[m]; if (cou < Math.min(q.prix, m15.h[j]) - 0.5 * ctx.h1.atr[i]) actif = { sens: -1, cou, stop: Math.max(q.prix, m15.h[j]) + p.pad * ctx.h1.atr[i], i0: i }; } }
      }
      if (i < DEPART || !actif) continue;
      if (i - actif.i0 > 96) { actif = null; continue; }
      if (actif.sens > 0) { if (m15.c[i] < actif.stop) { actif = null; continue; } if (m15.c[i] > actif.cou && m15.c[i] > m15.o[i] && actif.stop < m15.c[i]) { o.sens[i] = 1; o.stop[i] = actif.stop; actif = null; } }
      else { if (m15.c[i] > actif.stop) { actif = null; continue; } if (m15.c[i] < actif.cou && m15.c[i] < m15.o[i] && actif.stop > m15.c[i]) { o.sens[i] = -1; o.stop[i] = actif.stop; actif = null; } }
    }
    return o;
  }
};

/* ── 6. Drapeau : impulsion forte puis consolidation serrée, entrée à la sortie de la consolidation dans le sens de l'impulsion ── */
const DRAPEAU = {
  id: 'figure_drapeau', nom: 'Drapeau : impulsion, pause serrée, reprise',
  description: 'Une impulsion d’au moins « imp » ATR sur les 24 dernières bougies avant la pause, puis une consolidation de C bougies dont l’amplitude ne dépasse pas « cons » fois celle de l’impulsion. La clôture au-delà de la consolidation, dans le sens de l’impulsion, déclenche l’entrée ; stop de l’autre côté de la consolidation. Figure chartiste classique, testée comme une hypothèse.',
  grille: () => ({ imp: [3, 5], C: [8, 16], cons: [0.35, 0.5], pad: [0.25], R: [2, 3] }),
  signaux(ctx, p) {
    const { m15 } = ctx, n = ctx.n, o = fabrique(n); o.R = p.R; const M = 24;
    for (let i = Math.max(DEPART, M + p.C + 1); i < n; i++) {
      const a = ctx.h1.atr[i]; if (!(a > 0)) continue;
      let ch = -Infinity, cl = Infinity; for (let j = i - p.C; j < i; j++) { if (m15.h[j] > ch) ch = m15.h[j]; if (m15.l[j] < cl) cl = m15.l[j]; }          // consolidation : les C bougies AVANT la bougie i
      const debut = i - p.C - M; let ih = -Infinity, il = Infinity, kh = -1, kl = -1; for (let j = debut; j < i - p.C; j++) { if (m15.h[j] > ih) { ih = m15.h[j]; kh = j; } if (m15.l[j] < il) { il = m15.l[j]; kl = j; } }
      const impulsion = ih - il; if (!(impulsion >= p.imp * a) || !(ch - cl <= p.cons * impulsion)) continue;
      if (kl < kh && m15.c[i] > ch && m15.c[i] > m15.o[i] && cl > il + 0.5 * impulsion) { const st = cl - p.pad * a; if (st < m15.c[i]) { o.sens[i] = 1; o.stop[i] = st; } }                  // impulsion haussière (creux avant sommet), consolidation en haut
      else if (kh < kl && m15.c[i] < cl && m15.c[i] < m15.o[i] && ch < ih - 0.5 * impulsion) { const st = ch + p.pad * a; if (st > m15.c[i]) { o.sens[i] = -1; o.stop[i] = st; } }
    }
    return o;
  }
};

export const FAMILLES_ICT = { ict_fvg: FVG, ict_order_block: OB, ict_sweep: SWEEP, ict_premium_discount: PD, figure_double: DOUBLE, figure_drapeau: DRAPEAU };
export const ORDRE_ICT = ['ict_fvg', 'ict_order_block', 'ict_sweep', 'ict_premium_discount', 'figure_double', 'figure_drapeau'];
Object.assign(FAMILLES, FAMILLES_ICT);                      // ces familles rejoignent le registre du moteur (comme la microstructure en M4)

/* Chantiers de la file « ICT et figures » : chaque famille est une idée avec sa grille figée. */
export function chantiersICT() {
  return ORDRE_ICT.map(id => ({ id: id + '@ict', nom: FAMILLES_ICT[id].nom, description: FAMILLES_ICT[id].description, niveau: 6, famille: id, gen: 0, variants: combinaisons(FAMILLES_ICT[id].grille(0)).map(params => ({ famille: id, params })) }));
}
export const nombreVariantesICT = () => ORDRE_ICT.reduce((s, id) => s + combinaisons(FAMILLES_ICT[id].grille(0)).length, 0);
