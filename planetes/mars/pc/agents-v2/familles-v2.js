import { atr, ema } from '../agent-btc/indic.js';
import { emaM15 } from '../agent-btc/contexte.js';
import { FAMILLES } from '../agent-btc/hypotheses.js';

/* ═════════════ LES DEUX AGENTS PRÊTS À L'EMPLOI (V2, phase 6 ; module pur, testé : planetes/mars/tests/v2-agents-test.mjs) ═════════════
   Deux stratégies SIMPLES et connues, écrites dans le même format que la bibliothèque d'hypothèses (grille de paramètres + `signaux(ctx, p)` CAUSAL), donc évaluées par le même moteur de backtest
   (frais, spread, glissement, stop prioritaire dans une bougie ambiguë), le même walk-forward et les mêmes critères que tout le reste. AUCUNE IA, aucun ordre.
   · AGENT TENDANCE : suivi de tendance sur moyennes mobiles. Filtre H1 : prix au-dessus de l'EMA 200 H1 et EMA 20 > EMA 50 (miroir pour la vente). Entrée M15 : après un repli qui a touché la zone de
     l'EMA 50 M15 (à « touche » ATR près), la clôture reprend l'EMA 20 M15. Stop sous le creux du repli (au moins « stopATR » ATR). Objectif en R.
   · AGENT DIVERGENCE RSI : divergence haussière = nouveau creux plus bas que le précédent MAIS RSI plus haut (écart ≥ « diffRsi »), RSI du second creux sous 45 ; confirmation de STRUCTURE : la clôture
     repasse au-dessus du plus haut situé entre les deux creux. Miroir pour la divergence baissière. Stop sous le second creux (marge « pad » ATR). Objectif en R.
   Habitudes de Justin : entrées M15, objectif de 4 à 6 R, peu de positions (le moteur limite à 5 par semaine) ; pas de scalping. */
const DEPART = 400;
const nan = n => { const a = new Float64Array(n); a.fill(NaN); return a; };
const fabrique = n => ({ sens: new Int8Array(n), stop: new Float64Array(n) });
const surM15 = (src, idx, n) => { const out = nan(n); for (let i = 0; i < n; i++) { const k = idx[i]; if (k >= 0) out[i] = src[k]; } return out; };
const minSur = (x, i, k) => { let m = Infinity; for (let j = i - k + 1; j <= i; j++) if (x[j] < m) m = x[j]; return m; };
const maxSur = (x, i, k) => { let m = -Infinity; for (let j = i - k + 1; j <= i; j++) if (x[j] > m) m = x[j]; return m; };

/* RSI de Wilder (causal). */
export function rsi(c, p = 14) {
  const n = c.length, out = nan(n); if (n <= p) return out;
  let g = 0, pe = 0; for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else pe -= d; } g /= p; pe /= p; out[p] = pe === 0 ? 100 : 100 - 100 / (1 + g / pe);
  for (let i = p + 1; i < n; i++) { const d = c[i] - c[i - 1]; g = (g * (p - 1) + (d > 0 ? d : 0)) / p; pe = (pe * (p - 1) + (d < 0 ? -d : 0)) / p; out[i] = pe === 0 ? 100 : 100 - 100 / (1 + g / pe); }
  return out;
}
/* EMA H1 alignée sur les bougies M15 (la dernière bougie H1 FERMÉE à la clôture de chaque M15). Mise en cache dans ctx.cache. */
function emaH1(ctx, p) {
  const k = 'v2emaH1:' + p; if (!ctx.cache.has(k)) ctx.cache.set(k, surM15(ema(ctx.h1.serie.c, p), ctx.h1.idx, ctx.n)); return ctx.cache.get(k);
}
function rsiM15(ctx, p) { const k = 'v2rsi:' + p; if (!ctx.cache.has(k)) ctx.cache.set(k, rsi(ctx.m15.c, p)); return ctx.cache.get(k); }

export const FAMILLES_V2 = {
  tendance_ma: {
    id: 'tendance_ma', nom: 'Agent Tendance (moyennes mobiles 20 / 50 / 200)',
    description: 'Suivi de tendance : en tendance H1 (prix au-dessus de l’EMA 200 H1 et EMA 20 au-dessus de l’EMA 50), on attend un repli qui touche la zone de l’EMA 50 en M15, puis une clôture qui reprend l’EMA 20 : entrée dans le sens de la tendance, stop sous le creux du repli, objectif en R. Symétrique pour la vente.',
    grille: () => ({ touche: [0.3, 0.6], stopATR: [1.2, 2], R: [3, 4.5, 6], exigeH4: [0, 1] }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fabrique(n), e20 = emaM15(ctx, 20), e50 = emaM15(ctx, 50), h20 = emaH1(ctx, 20), h50 = emaH1(ctx, 50), h200 = emaH1(ctx, 200), a15 = ctx.atr15; o.R = p.R;
      const FEN = 12;                                     // le repli est cherché dans les 12 dernières bougies (3 heures)
      for (let i = DEPART; i < n; i++) {
        const a = a15[i]; if (!(a > 0) || !(e20[i] > 0) || !(e50[i] > 0) || !(h200[i] > 0) || !(h20[i] > 0) || !(h50[i] > 0)) continue;
        const px = m15.c[i], hautH1 = ctx.h1.serie.c[ctx.h1.idx[i]];
        const longT = hautH1 > h200[i] && h20[i] > h50[i], courtT = hautH1 < h200[i] && h20[i] < h50[i];
        if (longT && (!p.exigeH4 || ctx.h4.phase[i] === 1)) {
          if (!(m15.c[i - 1] <= e20[i - 1] && px > e20[i])) continue;
          const creux = minSur(m15.l, i, FEN); if (!(creux <= e50[i] + p.touche * a)) continue;       // le repli est bien venu toucher la zone de l'EMA 50
          o.sens[i] = 1; o.stop[i] = Math.min(creux - 0.2 * a, px - p.stopATR * a);
        } else if (courtT && (!p.exigeH4 || ctx.h4.phase[i] === 2)) {
          if (!(m15.c[i - 1] >= e20[i - 1] && px < e20[i])) continue;
          const sommet = maxSur(m15.h, i, FEN); if (!(sommet >= e50[i] - p.touche * a)) continue;
          o.sens[i] = -1; o.stop[i] = Math.max(sommet + 0.2 * a, px + p.stopATR * a);
        }
      }
      return o;
    },
    /* État « en préparation » à la dernière bougie fermée : tendance H1 + repli en cours qui touche la zone de l'EMA 50, sans le signal d'entrée. */
    preparation(ctx, p, i) {
      const e20 = emaM15(ctx, 20), e50 = emaM15(ctx, 50), h20 = emaH1(ctx, 20), h50 = emaH1(ctx, 50), h200 = emaH1(ctx, 200), a = ctx.atr15[i];
      if (!(a > 0) || !(h200[i] > 0)) return null; const hautH1 = ctx.h1.serie.c[ctx.h1.idx[i]], px = ctx.m15.c[i];
      if (hautH1 > h200[i] && h20[i] > h50[i] && px <= e20[i] && minSur(ctx.m15.l, i, 12) <= e50[i] + p.touche * a) return { sens: 1, texte: 'tendance haussière H1, repli sur la zone de l’EMA 50 : attendre une clôture au-dessus de l’EMA 20 (M15)' };
      if (hautH1 < h200[i] && h20[i] < h50[i] && px >= e20[i] && maxSur(ctx.m15.h, i, 12) >= e50[i] - p.touche * a) return { sens: -1, texte: 'tendance baissière H1, rebond sur la zone de l’EMA 50 : attendre une clôture sous l’EMA 20 (M15)' };
      return null;
    }
  },
  divergence_rsi: {
    id: 'divergence_rsi', nom: 'Agent Divergence RSI (confirmée par la structure)',
    description: 'Divergence haussière : nouveau creux plus bas que le précédent mais RSI plus haut (RSI du second creux sous 45), puis confirmation de structure : une clôture au-dessus du plus haut situé entre les deux creux. Stop sous le second creux. Symétrique pour la divergence baissière.',
    grille: () => ({ k: [3, 5], diffRsi: [3, 6], pad: [0.2, 0.5], R: [3, 4.5, 6] }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fabrique(n), r = rsiM15(ctx, 14), a15 = ctx.atr15, k = p.k; o.R = p.R;
      let creux = [], sommets = [], attente = null;       // derniers pivots CONFIRMÉS ; divergence en attente de confirmation
      for (let i = 0; i < n; i++) {
        const j = i - k;                                  // un pivot en j n'est connu qu'à l'index j + k : jamais de regard vers le futur
        if (j >= k) {
          let bas = true, haut = true; for (let q = j - k; q <= j + k; q++) { if (q === j) continue; if (m15.l[q] <= m15.l[j]) bas = false; if (m15.h[q] >= m15.h[j]) haut = false; }
          if (bas) {
            const prec = creux[creux.length - 1]; creux.push(j); if (creux.length > 6) creux.shift();
            const a = a15[i];
            if (prec !== undefined && a > 0 && j - prec >= 8 && j - prec <= 80 && m15.l[j] < m15.l[prec] - 0.1 * a && r[j] > r[prec] + p.diffRsi && r[j] < 45) {
              const niveau = maxSur(m15.h, j, j - prec + 1);       // plus haut entre les deux creux
              attente = { sens: 1, niveau, stop: m15.l[j] - p.pad * a, expire: i + 24 };
            }
          }
          if (haut) {
            const prec = sommets[sommets.length - 1]; sommets.push(j); if (sommets.length > 6) sommets.shift();
            const a = a15[i];
            if (prec !== undefined && a > 0 && j - prec >= 8 && j - prec <= 80 && m15.h[j] > m15.h[prec] + 0.1 * a && r[j] < r[prec] - p.diffRsi && r[j] > 55) {
              const niveau = minSur(m15.l, j, j - prec + 1);
              attente = { sens: -1, niveau, stop: m15.h[j] + p.pad * a, expire: i + 24 };
            }
          }
        }
        if (attente && i >= DEPART) {
          if (i > attente.expire) attente = null;
          else if (attente.sens > 0 && m15.c[i] > attente.niveau && m15.c[i - 1] <= attente.niveau && m15.c[i] > attente.stop) { o.sens[i] = 1; o.stop[i] = attente.stop; attente = null; }
          else if (attente.sens < 0 && m15.c[i] < attente.niveau && m15.c[i - 1] >= attente.niveau && m15.c[i] < attente.stop) { o.sens[i] = -1; o.stop[i] = attente.stop; attente = null; }
        }
      }
      return o;
    },
    preparation(ctx, p, i) {
      // « en préparation » : une divergence existe parmi les 30 dernières bougies, la confirmation de structure n'a pas encore eu lieu. On rejoue les signaux et regarde si un pivot récent diverge.
      const r = rsiM15(ctx, 14), m15 = ctx.m15, a = ctx.atr15[i]; if (!(a > 0)) return null; const k = p.k;
      let b1 = -1, b2 = -1, h1 = -1, h2 = -1;
      for (let j = i - k; j >= Math.max(k, i - 90); j--) {
        let bas = true, haut = true; for (let q = j - k; q <= j + k; q++) { if (q === j) continue; if (m15.l[q] <= m15.l[j]) bas = false; if (m15.h[q] >= m15.h[j]) haut = false; }
        if (bas) { if (b2 < 0) b2 = j; else if (b1 < 0) b1 = j; } if (haut) { if (h2 < 0) h2 = j; else if (h1 < 0) h1 = j; }
        if (b1 >= 0 && h1 >= 0) break;
      }
      if (b1 >= 0 && b2 >= i - 30 && m15.l[b2] < m15.l[b1] - 0.1 * a && r[b2] > r[b1] + p.diffRsi && r[b2] < 45) return { sens: 1, texte: 'divergence RSI haussière en cours (creux plus bas, RSI plus haut) : attendre la clôture au-dessus du plus haut entre les deux creux' };
      if (h1 >= 0 && h2 >= i - 30 && m15.h[h2] > m15.h[h1] + 0.1 * a && r[h2] < r[h1] - p.diffRsi && r[h2] > 55) return { sens: -1, texte: 'divergence RSI baissière en cours (sommet plus haut, RSI plus bas) : attendre la clôture sous le plus bas entre les deux sommets' };
      return null;
    }
  }
};
/* Enregistre les deux agents dans le registre des hypothèses (le moteur d'évaluation y cherche les familles) SANS toucher à ORDRE_FAMILLES / ORDRE_TOUTES : la recherche automatique ne les voit pas. */
Object.assign(FAMILLES, FAMILLES_V2);
export const ORDRE_AGENTS_V2 = ['tendance_ma', 'divergence_rsi'];
void atr;
