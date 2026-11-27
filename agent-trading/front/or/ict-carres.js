/* ═════════════ PETITS CARRÉS DE L'ICT ÉPURÉ (pur, testé) ═════════════
   Chaque objet ICT est nommé par UN petit carré plein, sur UNE ligne de 14 caractères au plus (« FVG », « OB fort », « EQH · BSL »).
   Le carré se pose DANS la zone ou AU BOUT de la ligne ; il peut glisser le long de son objet (horizontalement) pour trouver une place libre,
   mais ne s'en éloigne JAMAIS verticalement ; il ne recouvre jamais une bougie (corps et mèches) ni un autre carré.
   Sans place libre, le carré n'est pas dessiné : l'objet garde sa couleur et son nom apparaît quand on le touche.
   Interprétation de l'ICT : une description, jamais un ordre. */
export const LONG_MAX = 14;
/* texte de 12 px sur PC et tablette, 11 px sur téléphone (le volume garde sa propre taille dans ict-etiquettes.js) */
export const taillePoliceCarre = largeurEcran => (largeurEcran >= 700 ? 12 : 11);

/* un nom de carré : une ligne, 14 caractères au plus (sinon tronqué proprement, jamais plus long) */
export function nomCarre(t) { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length <= LONG_MAX ? s : s.slice(0, LONG_MAX); }

const chevauche = (a, b, m = 0) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;

/* rectangles des bougies (corps ET mèches) : demi-largeur = un peu plus que le corps, de la mèche haute à la mèche basse */
export function rectsBougies(barres, xDeT, yDe, pas, { de = null, a = null } = {}) {
  const hw = Math.max(1.5, pas * 0.42), R = [];
  for (const b of barres) { const x = xDeT(b.t), yh = yDe(b.h), yl = yDe(b.l); if (x == null || yh == null || yl == null || !Number.isFinite(x + yh + yl)) continue; if ((de != null && x < de - 4) || (a != null && x > a + 4)) continue; R.push({ x: x - hw, y: Math.min(yh, yl) - 1, w: 2 * hw, h: Math.abs(yl - yh) + 2 }); }
  return R;
}

/* items : [{ id, w, h, prio, candidats: [{ x, y }, …] }] (candidats dans l'ordre de préférence, tous sur le MÊME y que l'objet : on ne s'éloigne jamais verticalement)
   obstacles : rectangles interdits (bougies, boutons…). Renvoie, dans l'ordre des items, { id, x, y, replie }. Les prioritaires sont placés en premier. */
export function placerCarres(items, { largeur = 1e9, hauteur = 1e9, obstacles = [], marge = 2 } = {}) {
  const ordre = items.map((it, k) => ({ it, k })).sort((a, b) => (b.it.prio || 0) - (a.it.prio || 0) || a.k - b.k), poses = [], res = new Array(items.length);
  for (const { it, k } of ordre) {
    let place = null;
    for (const c of it.candidats || []) {
      const r = { x: c.x, y: c.y, w: it.w, h: it.h };
      if (r.x < 0 || r.x + r.w > largeur || r.y < 0 || r.y + r.h > hauteur) continue;
      if (poses.some(p => chevauche(r, p, marge)) || obstacles.some(o => chevauche(r, o, 1))) continue;
      place = r; break;
    }
    if (place) { poses.push(place); res[k] = { id: it.id, x: place.x, y: place.y, replie: false }; } else res[k] = { id: it.id, x: null, y: null, replie: true };
  }
  return res;
}

/* candidats d'un carré DANS une zone (x0 → x1) : d'abord au bout droit, puis en glissant vers la gauche jusqu'au début ; y fixe (haut de la zone, ou centré si elle est basse) */
export function candidatsZone({ x0, x1, yHaut, yBas }, w, h) {
  const y = yBas - yHaut >= h + 4 ? yHaut + 2 : (yHaut + yBas) / 2 - h / 2, C = [], pas = Math.max(4, Math.round(w / 3));
  for (let x = x1 - w - 2; x >= x0 + 2; x -= pas) C.push({ x, y });
  return C;
}
/* candidats d'un carré AU BOUT d'une ligne (x0 → x1) : juste après le bout (dans la marge à droite des bougies), puis en glissant vers l'intérieur de la ligne ; centré sur la ligne */
export function candidatsLigne({ x0, x1, y }, w, h) {
  const yy = y - h / 2, C = [], pas = Math.max(4, Math.round(w / 3));
  for (let x = x1 + 4; x <= x1 + 4 + 3 * pas; x += pas) C.push({ x, y: yy });   // au bout de la ligne, un peu plus loin si besoin
  for (let x = x1 - w - 2; x >= x0 + 2; x -= pas) C.push({ x, y: yy });          // puis en glissant vers l'intérieur de la ligne
  C.push({ x: x0 - w - 4, y: yy });                                              // enfin juste avant son début
  return C;
}
/* candidats d'un carré CENTRÉ sur un segment (BOS / MSS) : le milieu d'abord, puis de part et d'autre */
export function candidatsSegment({ x0, x1, y }, w, h) {
  const yy = y - h / 2, C = [], mil = (x0 + x1) / 2 - w / 2, pas = Math.max(4, Math.round(w / 3));
  for (let d = 0; d <= (x1 - x0); d += pas) { for (const s of d === 0 ? [0] : [1, -1]) { const x = mil + s * d; if (x >= x0 - 2 && x + w <= x1 + 2) C.push({ x, y: yy }); } }
  return C;
}
