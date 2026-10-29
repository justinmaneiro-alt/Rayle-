import { base, aimants, choisirCibles, fmt, RR_MIN } from './agents.js';
import { vue, elementsVue, confluence, resumeConfluence } from './zones.js';

/* ═════════════ AGENT « LIBRE » : TESTER UNE HYPOTHÈSE (V7, phase 4.5 ; module pur) ═════════════
   Une hypothèse vient d'un exemple de Justin ou d'une occasion manquée : un niveau de la structure (extrême de la veille, bord de la zone de valeur, POC, VWAP, moyenne 20, plus bas / haut des 24 dernières barres)
   touché par une barre qui referme du bon côté, avec AU MOINS les éléments de confluence demandés. Même exécution, mêmes coûts, mêmes cibles que les trois agents ; signaux CAUSAUX. */
const DEPART = 800;
export function signauxLibres(ctx, hyp) {
  const tf = hyp.tf || 'M15', n = ctx.n, o = base(ctx, tf, { rrMin: hyp.rrMin || RR_MIN }), V = vue(ctx, tf), E = elementsVue(ctx, tf), s = V.s, requis = (hyp.elementsRequis || []).filter(e => e !== 'balayage'), reg = hyp.regime || null;
  for (let i = DEPART; i < n; i++) {
    if (!V.nouvelle(i)) continue; const k = V.k(i), at = V.atr[k]; if (!(k >= 30) || !(at > 0)) continue;
    for (const d of (hyp.sens ? [hyp.sens] : [1, -1])) {
      if (reg) { const ph = ctx.h1.phase[i]; if (!((reg === 'hausse' && ph === 1) || (reg === 'baisse' && ph === 2) || (reg === 'range' && ph === 3))) continue; }
      const niveaux = [d > 0 ? E.pdl[k] : E.pdh[k], d > 0 ? ctx.h1.val[i] : ctx.h1.vah[i], ctx.h1.poc[i], E.vwap[k], E.ema20[k]];
      let ex = d > 0 ? Infinity : -Infinity; for (let j = k - 24; j < k; j++) ex = d > 0 ? Math.min(ex, s.l[j]) : Math.max(ex, s.h[j]); niveaux.push(ex);
      const extreme = d > 0 ? s.l[k] : s.h[k]; let meilleur = null;
      for (const L of niveaux) {
        if (!Number.isFinite(L)) continue; if (Math.abs(extreme - L) > 0.4 * at || !(d * (s.c[k] - L) > 0)) continue;
        const c = confluence(ctx, tf, i, k, L, d, {}); if (requis.every(e => c.elements.some(x => x.cle === e)) && (!meilleur || c.score > meilleur.c.score)) meilleur = { L, c };
      }
      if (!meilleur) continue;
      const limite = meilleur.L + d * 0.25 * at, stop = extreme - d * 0.2 * at, ch = choisirCibles(aimants(ctx, tf, i, k, limite, d), limite, stop, d, o.options.rrMin); if (!ch.ok) continue;
      o.sens[i] = d; o.stop[i] = stop; o.limite[i] = limite; o.cible[i] = ch.cible.prix;
      o.meta.set(i, { agent: 'libre', tf, type: 'libre:hypothese', sens: d, niveau: meilleur.L, zone: [Math.min(meilleur.L, limite), Math.max(meilleur.L, limite)], limite, stop, cible: ch.cible.prix, cibleNom: ch.cible.nom, cible2: ch.cible2 ? ch.cible2.prix : null,
        rr: ch.rr, rr2: ch.rr2, ttlBarres: o.ttl, confluence: meilleur.c, raison: 'Hypothèse « ' + (hyp.titre || hyp.id) + ' » : ' + resumeConfluence(meilleur.c), invalidation: 'clôture ' + tf + ' ' + (d > 0 ? 'sous ' : 'au-dessus de ') + fmt(stop), t: ctx.m15.t[i], atrVue: at });
    }
  }
  return o;
}
