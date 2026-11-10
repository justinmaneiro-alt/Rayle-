/* SIMULATEUR 2, INDÉPENDANT (audit) : écrit à part, sur les bougies brutes (objets), sans réutiliser le code du simulateur 1 ni le contexte. Il recalcule l'ATR14 lui-même
   et rejoue pas à pas, bougie par bougie, avec une boucle d'événements différente (stop et tendance gérés comme un carnet d'ordres simple).
   Ordre stop / cible dans la même bougie : il n'y a pas de cible ; le stop est toujours supposé touché avant tout ajustement du stop dans la même bougie. */
export function atr14(B, i) { let s = 0; for (let k = i - 13; k <= i; k++) s += Math.max(B[k].h - B[k].l, Math.abs(B[k].h - B[k - 1].c), Math.abs(B[k].l - B[k - 1].c)); return s / 14; }
export function rejouer(B, i, sens, stopK, mgmt) {
  const dist = stopK * atr14(B, i), ouv = B[i + 1]; if (!ouv) return null;
  const px = ouv.o; let niveau = sens === 1 ? px - dist : px + dist, vivant = true, prixSortie = 0, barSortie = -1, breakeven = false;
  for (let n = 0; n < 6 && vivant; n++) {
    const b = B[i + 1 + n]; if (!b) break; const dernier = n === 5 || !B[i + 2 + n];
    // 1) le stop est-il touché ? (gap à l'ouverture compris, sauf sur la bougie d'entrée)
    const sous = sens === 1 ? b.l <= niveau : b.h >= niveau;
    if (sous) { const gap = n > 0 && (sens === 1 ? b.o <= niveau : b.o >= niveau); prixSortie = gap ? b.o : niveau; barSortie = i + 1 + n; vivant = false; break; }
    if (dernier) { prixSortie = b.c; barSortie = i + 1 + n; vivant = false; break; }
    // 2) ajustements après la bougie
    if (mgmt === 'trail') { const cand = b.c - sens * dist; niveau = sens === 1 ? Math.max(niveau, cand) : Math.min(niveau, cand); }
    if (mgmt === 'be' && !breakeven && (sens === 1 ? b.h >= px + dist : b.l <= px - dist)) { breakeven = true; niveau = px; }
  }
  const brut = sens * (prixSortie - px);
  return { barSortie, Rbrut: brut / dist, Rc: (brut - (ouv.sp + 0.5)) / dist, Rk: (brut - (0.0005 * (px + prixSortie) + 0.5)) / dist };
}
