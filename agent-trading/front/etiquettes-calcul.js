/* Placement anti-collision d'étiquettes d'une même colonne (pur, testé) : ordre gardé, écart minimal, dans le cadre [marge, hauteur − marge]. */
export function espacerEtiquettes(etiquettes, ecart = 13, hauteur = Infinity, marge = 6) {
  const l = etiquettes.map(e => ({ ...e, yTrait: e.y })).sort((a, b) => a.y - b.y);
  if (!l.length) return l;
  // si elles ne tiennent pas toutes, on garde les plus proches du centre de la vue (les autres seraient illisibles)
  const place = Math.floor((hauteur - 2 * marge) / ecart) + 1;
  let L = l;
  if (Number.isFinite(hauteur) && l.length > place) { const c = hauteur / 2; L = l.slice().sort((a, b) => Math.abs(a.y - c) - Math.abs(b.y - c)).slice(0, Math.max(1, place)).sort((a, b) => a.y - b.y); }
  L[0].y = Math.max(marge, L[0].y);
  for (let i = 1; i < L.length; i++) if (L[i].y < L[i - 1].y + ecart) L[i].y = L[i - 1].y + ecart;
  const bas = Number.isFinite(hauteur) ? hauteur - marge : Infinity, debord = L[L.length - 1].y - bas;
  if (debord > 0) { L[L.length - 1].y = bas; for (let i = L.length - 2; i >= 0; i--) if (L[i].y > L[i + 1].y - ecart) L[i].y = L[i + 1].y - ecart; }
  return L;
}
