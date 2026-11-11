/* RÈGLES FIGÉES « ema200-long-v1 » (SHA-256 dans ema200-long-sceau.json, posé AVANT les résultats) : positions de plusieurs jours sur les événements EMA200 de 2026 (ema200-regles.mjs, lui aussi scellé). Pur.
   Entrée à l'ouverture de la bougie suivant l'événement ; une seule position à la fois par sens (un événement de même sens qu'une position ouverte est ignoré) ;
   stop initial au-delà du dernier extrême des 24 dernières bougies (sommet pour une vente, creux pour un achat), distance bornée entre 1,5 et 3 ATR(14) ;
   sortie A : stop suiveur à 3 ATR (du meilleur cours de clôture depuis l'entrée, ne recule jamais, touché en séance) ; sortie B : clôture de l'autre côté de l'EMA200 (le stop initial reste actif). */
export const VERSION = 'ema200-long-v1';
export const L = Object.freeze({ extremeBougies: 24, stopMinAtr: 1.5, stopMaxAtr: 3, suiveurAtr: 3, tirages: 1000, graine: 20261112, casMin: 30, partGainSeuilR: 3 });
const side = (B, E, k) => (E[k] == null ? 0 : B[k].c > E[k] ? 1 : B[k].c < E[k] ? -1 : 0);
/* un trade depuis l'événement de la bougie i ; version 'A' ou 'B' ; renvoie { e, sortie (indice de la bougie de sortie), dir, entree, risque, R0 (brut), mfeR (gain maximal possible en R brut), raison, encours } */
export function tradeLong(B, E, A, i, dir, version) {
  const e = i + 1, n = B.length; if (e >= n || A[i] == null) return null;
  const entree = B[e].o; let ext = dir > 0 ? Infinity : -Infinity; for (let k = Math.max(0, i - L.extremeBougies + 1); k <= i; k++) ext = dir > 0 ? Math.min(ext, B[k].l) : Math.max(ext, B[k].h);
  const brut = Math.abs(entree - ext), risque = Math.min(L.stopMaxAtr * A[i], Math.max(L.stopMinAtr * A[i], brut)); let stop = entree - dir * risque, best = entree, extremeFavorable = entree;
  const fin = (k, px, raison, encours = false) => ({ e, sortie: k, dir, entree, risque, R0: dir * (px - entree) / risque, mfeR: Math.max(0, dir * (extremeFavorable - entree) / risque), raison, encours, stopInitial: entree - dir * risque, prixSortie: px });
  for (let k = e; k < n; k++) {
    const b = B[k];
    if (dir > 0 ? b.l <= stop : b.h >= stop) { extremeFavorable = dir > 0 ? Math.max(extremeFavorable, b.h) : Math.min(extremeFavorable, b.l); const px = dir > 0 ? Math.min(stop, b.o) : Math.max(stop, b.o); return fin(k, px, version === 'A' && stop !== entree - dir * risque ? 'stop suiveur' : 'stop initial'); }
    extremeFavorable = dir > 0 ? Math.max(extremeFavorable, b.h) : Math.min(extremeFavorable, b.l);
    if (version === 'A') { best = dir > 0 ? Math.max(best, b.c) : Math.min(best, b.c); if (A[k] != null) { const ns = best - dir * L.suiveurAtr * A[k]; stop = dir > 0 ? Math.max(stop, ns) : Math.min(stop, ns); } }
    else if (side(B, E, k) === -dir) return fin(k, b.c, 'clôture de l\'autre côté de l\'EMA200');
  }
  return fin(n - 1, B[n - 1].c, 'en cours', true);
}
/* positions séquentielles : une seule par sens ; un événement de même sens tant qu'une position est ouverte est ignoré */
export function positions(B, E, A, EV, version) {
  const libre = { 1: -1, [-1]: -1 }, T = [], ignores = [];
  for (const ev of EV) { const e = ev.i + 1; if (e <= libre[ev.dir]) { ignores.push(ev); continue; } const t = tradeLong(B, E, A, ev.i, ev.dir, version); if (!t) continue; T.push({ ...t, ev }); libre[ev.dir] = t.encours ? Infinity : t.sortie; }
  return { trades: T, ignores };
}
