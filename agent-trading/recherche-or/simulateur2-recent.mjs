/* SIMULATEUR 2 (audit, INDÉPENDANT) de l'étude « fenêtre récente » : réécrit à part sur les bougies brutes, ATR14 recalculé, boucle d'événements différente. */
const atr14 = (B, i) => { let s = 0; for (let k = i - 13; k <= i; k++) s += Math.max(B[k].h - B[k].l, Math.abs(B[k].h - B[k - 1].c), Math.abs(B[k].l - B[k - 1].c)); return s / 14; };
export function rejouerRecent(B, i, sens, cfg, scen, cible = null) {
  const a0 = atr14(B, i), ouv = B[i + 1]; if (!ouv) return null; const R1 = cfg.stopInit * a0, px = ouv.o; if (cfg.filtre && a0 < 5 * (scen === 'cfd' ? ouv.sp + 0.5 : 0.001 * px + 0.5)) return null;
  let niveau = px - sens * R1, extreme = sens > 0 ? ouv.h : ouv.l, prixSortie, barSortie;
  for (let n = 0; n < 48; n++) {
    const b = B[i + 1 + n]; if (!b) return null;
    if (n > 0 && (sens > 0 ? b.o <= niveau : b.o >= niveau)) { prixSortie = b.o; barSortie = i + 1 + n; break; }
    if (sens > 0 ? b.l <= niveau : b.h >= niveau) { prixSortie = niveau; barSortie = i + 1 + n; break; }
    if (cible != null && (sens > 0 ? b.h >= cible : b.l <= cible)) { prixSortie = (sens > 0 ? b.o >= cible : b.o <= cible) ? b.o : cible; barSortie = i + 1 + n; break; }
    if (n === 47) { prixSortie = b.c; barSortie = i + 1 + n; break; }
    if (cfg.chandelier) { extreme = sens > 0 ? Math.max(extreme, b.h) : Math.min(extreme, b.l); const aj = atr14(B, i + 1 + n); if (aj > 0) { const c = extreme - sens * cfg.chandelier * aj; niveau = sens > 0 ? Math.max(niveau, c) : Math.min(niveau, c); } }
  }
  const brut = sens * (prixSortie - px), cout = scen === 'cfd' ? ouv.sp + 0.5 : 0.0005 * (px + prixSortie) + 0.5; return { barSortie, Rbrut: brut / R1, R: (brut - cout) / R1 };
}
