/* SIMULATEUR « gros mouvements » (2), INDÉPENDANT : écrit à part sur les bougies brutes (objets) ; recalcule lui-même l'ATR14 ; boucle d'événements différente (on avance un « carnet » : niveau de stop, plus haut atteint). */
const atr14 = (B, i) => { let s = 0; for (let k = i - 13; k <= i; k++) s += Math.max(B[k].h - B[k].l, Math.abs(B[k].h - B[k - 1].c), Math.abs(B[k].l - B[k - 1].c)); return s / 14; };
export function rejouerGros(B, i, sens, cfg, scen) {
  const a0 = atr14(B, i), ouv = B[i + 1]; if (!ouv) return null; const R1 = 1.5 * a0, px = ouv.o;
  const cout0 = scen === 'cfd' ? ouv.sp + 0.5 : 0.001 * px + 0.5; if (a0 < 5 * cout0) return null;
  const etat = { niveau: px - sens * R1, extreme: sens > 0 ? ouv.h : ouv.l, be: false }; let prixSortie, barSortie;
  for (let n = 0; n < 48; n++) {
    const b = B[i + 1 + n]; if (!b) { return null; }
    const gap = n > 0 && (sens > 0 ? b.o <= etat.niveau : b.o >= etat.niveau), touche = sens > 0 ? b.l <= etat.niveau : b.h >= etat.niveau;
    if (gap) { prixSortie = b.o; barSortie = i + 1 + n; break; } if (touche) { prixSortie = etat.niveau; barSortie = i + 1 + n; break; }
    if (n === 47) { prixSortie = b.c; barSortie = i + 1 + n; break; }
    etat.extreme = sens > 0 ? Math.max(etat.extreme, b.h) : Math.min(etat.extreme, b.l);
    const aj = atr14(B, i + 1 + n); if (aj > 0) { const cand = etat.extreme - sens * cfg.chandelier * aj; etat.niveau = sens > 0 ? Math.max(etat.niveau, cand) : Math.min(etat.niveau, cand); }
    if (cfg.be && !etat.be && sens * (etat.extreme - px) >= R1) { etat.be = true; etat.niveau = sens > 0 ? Math.max(etat.niveau, px) : Math.min(etat.niveau, px); }
  }
  const brut = sens * (prixSortie - px), cout = scen === 'cfd' ? ouv.sp + 0.5 : 0.0005 * (px + prixSortie) + 0.5;
  return { barSortie, Rbrut: brut / R1, R: (brut - cout) / R1 };
}
