import { FAMILLES } from '../planetes/mars/pc/agent-btc/hypotheses.js';
import { hautAvant, basAvant } from '../planetes/mars/pc/agent-btc/contexte.js';
import { FAMILLES_V2, rsi } from '../planetes/mars/pc/agents-v2/familles-v2.js';
import './familles-v4.js';                                             // V4 : enregistre aussi les familles volume / liquidité / flux dans le moteur

/* ═════════════ BIBLIOTHÈQUE DE STRATÉGIES SIMPLES DE LA V3 (module pur, testé : galaxie/tests/strategies-v3-test.mjs) ═════════════
   Six familles connues, bien faites, pas plus. Chacune a : un nom et une description en français, une grille de paramètres RAISONNABLE (jamais de grille infinie), et `signaux(ctx, p)` qui rend
   { sens, stop, R } pour chaque bougie M15 FERMÉE (causal : le signal en i n'utilise que les bougies 0..i et les infos H1 / H4 déjà connues ; la validation le vérifie par le « test du poison du futur »).
   Quatre familles existaient déjà dans le moteur (V2 et M3b) : elles sont réutilisées telles quelles, avec leur code. Deux sont nouvelles ici : cassure + retest, fin de range.
   Idées seulement : aucun code copié d'un dépôt externe (voir docs/BOTS.md). Aucun ordre, aucune IA. */
const DEPART = 400;
const fabrique = n => ({ sens: new Int8Array(n), stop: new Float64Array(n) });
const minSur = (x, i, k) => { let m = Infinity; for (let j = Math.max(0, i - k + 1); j <= i; j++) if (x[j] < m) m = x[j]; return m; };
const maxSur = (x, i, k) => { let m = -Infinity; for (let j = Math.max(0, i - k + 1); j <= i; j++) if (x[j] > m) m = x[j]; return m; };
const rsiCache = (ctx, p) => { const k = 'v3rsi:' + p; if (!ctx.cache.has(k)) ctx.cache.set(k, rsi(ctx.m15.c, p)); return ctx.cache.get(k); };

/* ── Famille 3 : cassure de range PUIS retour sur le niveau cassé (retest) ──
   Une clôture au-delà du plus haut (ou plus bas) des N dernières bougies « arme » la cassure ; dans les `attente` bougies suivantes, le prix revient toucher le niveau cassé (à `tol` ATR près)
   et une bougie de reprise (clôture dans le sens de la cassure, au-delà de l'ouverture) déclenche l'entrée. Stop de l'autre côté du niveau (marge `pad` ATR). Si le prix retraverse franchement le niveau, la cassure est annulée. */
const CASSURE_RETEST = {
  id: 'cassure_retest', nom: 'Cassure de range et retour sur le niveau (retest)',
  description: 'Le prix sort d’une boîte (plus haut / plus bas des N dernières bougies M15), puis revient tester le niveau cassé. On entre quand le niveau tient (bougie de reprise) : le stop est de l’autre côté du niveau, l’objectif en multiples du risque. Peu de signaux, jamais de poursuite d’une cassure déjà partie.',
  grille: () => ({ N: [96, 192], attente: [16, 48], tol: [0.3, 0.6], pad: [0.3, 0.6], R: [3, 4.5] }),
  signaux(ctx, p) {
    const { m15 } = ctx, n = ctx.n, o = fabrique(n), hh = hautAvant(ctx, p.N), ll = basAvant(ctx, p.N), a15 = ctx.atr15; o.R = p.R;
    let armee = null;                                       // { sens, niveau, expire }
    for (let i = DEPART; i < n; i++) {
      const a = a15[i]; if (!(a > 0) || !(hh[i] > 0)) continue;
      if (armee) {
        if (i > armee.expire) armee = null;
        else if (armee.sens > 0) {
          if (m15.c[i] < armee.niveau - 1.2 * a) armee = null;                                    // le niveau a cédé : cassure annulée
          else if (m15.l[i] <= armee.niveau + p.tol * a && m15.c[i] > m15.o[i] && m15.c[i] > armee.niveau) { o.sens[i] = 1; o.stop[i] = Math.min(m15.l[i], armee.niveau) - p.pad * a; armee = null; }
        } else {
          if (m15.c[i] > armee.niveau + 1.2 * a) armee = null;
          else if (m15.h[i] >= armee.niveau - p.tol * a && m15.c[i] < m15.o[i] && m15.c[i] < armee.niveau) { o.sens[i] = -1; o.stop[i] = Math.max(m15.h[i], armee.niveau) + p.pad * a; armee = null; }
        }
        continue;
      }
      if (m15.c[i] > hh[i] && m15.c[i - 1] <= hh[i]) armee = { sens: 1, niveau: hh[i], expire: i + p.attente };
      else if (m15.c[i] < ll[i] && m15.c[i - 1] >= ll[i]) armee = { sens: -1, niveau: ll[i], expire: i + p.attente };
    }
    return o;
  }
};

/* ── Famille 5 : retournement en fin de range ──
   H1 en range (phase « range » confirmée), le prix touche le bord haut (ou bas) de la boîte des N dernières bougies, le RSI M15 est étiré (≥ rsiHaut ou ≤ rsiBas) et le volume ne confirme pas une cassure
   (volume relatif < `volMax` fois la moyenne). Confirmation : la clôture repasse sous le plus bas (ou au-dessus du plus haut) de la bougie précédente. Stop au-delà de l'extrême (marge `pad` ATR). */
const FIN_RANGE = {
  id: 'fin_range', nom: 'Retournement en fin de range',
  description: 'Quand le marché évolue dans une boîte (H1 en range), le prix qui touche le haut ou le bas de la boîte avec un RSI étiré et SANS gros volume de cassure a tendance à revenir vers le milieu. On entre sur une bougie de confirmation, stop juste au-delà de l’extrême. Jamais en tendance.',
  grille: () => ({ N: [96, 192], rsiExtreme: [68, 75], volMax: [1.3, 2], pad: [0.3, 0.6], R: [3, 4.5] }),
  signaux(ctx, p) {
    const { m15 } = ctx, n = ctx.n, o = fabrique(n), hh = hautAvant(ctx, p.N), ll = basAvant(ctx, p.N), r = rsiCache(ctx, 14), a15 = ctx.atr15, vm = ctx.volMoy20; o.R = p.R;
    for (let i = DEPART; i < n; i++) {
      const a = a15[i]; if (!(a > 0) || ctx.h1.phase[i] !== 3 || !(vm[i] > 0) || !(hh[i] > 0)) continue;
      const hauteur = hh[i] - ll[i]; if (hauteur < 3 * a) continue;                           // boîte trop étroite : pas un vrai range
      const volRel = m15.v[i] / vm[i], haut5 = maxSur(m15.h, i, 4), bas5 = minSur(m15.l, i, 4);
      if (haut5 >= hh[i] - 0.25 * a && maxSur(r, i, 4) >= p.rsiExtreme && volRel < p.volMax && m15.c[i] < m15.l[i - 1] && m15.c[i] < m15.o[i]) { o.sens[i] = -1; o.stop[i] = haut5 + p.pad * a; }
      else if (bas5 <= ll[i] + 0.25 * a && minSur(r, i, 4) <= 100 - p.rsiExtreme && volRel < p.volMax && m15.c[i] > m15.h[i - 1] && m15.c[i] > m15.o[i]) { o.sens[i] = 1; o.stop[i] = bas5 - p.pad * a; }
    }
    return o;
  }
};
export const FAMILLES_NOUVELLES_V3 = { cassure_retest: CASSURE_RETEST, fin_range: FIN_RANGE };
Object.assign(FAMILLES, FAMILLES_NOUVELLES_V3);

/* ── Les six familles de la V3 (id dans le moteur, nom d'usage, rôle) ── */
export const ORDRE_V3 = ['tendance_ma', 'divergence_rsi', 'cassure_retest', 'faux_breakout', 'fin_range', 'vwap_extension'];
export const NOMS_V3 = Object.freeze({
  tendance_ma: 'Tendance sur moyennes mobiles', divergence_rsi: 'Divergence RSI', cassure_retest: 'Cassure de range et retest',
  faux_breakout: 'Prise de liquidité (faux breakout)', fin_range: 'Retournement en fin de range', vwap_extension: 'Retour sur la valeur (VWAP / POC)'
});
export function famille(id) { return FAMILLES[id] || FAMILLES_V2[id] || null; }
export function descriptionV3(id) { const f = famille(id); return f ? { id, nom: NOMS_V3[id] || f.nom, description: f.description, grille: f.grille(0) } : null; }
export function bibliotheque() { return ORDRE_V3.map(descriptionV3).filter(Boolean); }
export function tailleGrille(id) { const g = famille(id).grille(0); return Object.values(g).reduce((a, v) => a * v.length, 1); }
