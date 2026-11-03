/* ═════════════ LONGUEUR DES TRAITS DE POSITION (partagé moteur + affichage) ═════════════
   Les 3 traits (entrée, SL, TP) partent de la bougie d'entrée et durent N bougies M15 :
   N = arrondi(|objectif − entrée| / ATR M15 × 1,5), borné entre 8 et 40. Si la position est encore ouverte au-delà, le trait suit jusqu'à la bougie actuelle + 3.
   (L'ATR ne sert QU'À cette longueur d'affichage : la stratégie n'utilise aucun indicateur classique.) */
export const N_MIN = 8, N_MAX = 40, FACTEUR = 1.5, MARGE_SUIVI = 3;

export function longueurTrait(entree, objectif, atrM15) {
  if (!(atrM15 > 0) || !Number.isFinite(entree) || !Number.isFinite(objectif)) return N_MIN;
  const n = Math.round(Math.abs(objectif - entree) / atrM15 * FACTEUR);
  return Math.min(N_MAX, Math.max(N_MIN, n));
}
/* indices de bougies M15 (0 = bougie d'entrée) : [début, fin] ; « ouverte » = position encore en cours, indexActuel = bougie M15 actuelle */
export function etendueTrait({ indexEntree, n, indexActuel, ouverte, indexSortie }) {
  let fin = indexEntree + n;
  if (ouverte && indexActuel + MARGE_SUIVI > fin) fin = indexActuel + MARGE_SUIVI;
  if (!ouverte && indexSortie != null) fin = Math.max(indexEntree + 2, Math.min(fin, indexSortie + 1));
  return [indexEntree, fin];
}
/* ATR M15 classique (Wilder, 14) sur des bougies [{h,l,c}] — affichage seulement */
export function atr(bougies, periode = 14) {
  if (!bougies || bougies.length < 2) return null;
  let a = null;
  for (let i = 1; i < bougies.length; i++) {
    const b = bougies[i], pc = bougies[i - 1].c, tr = Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
    a = a == null ? tr : i <= periode ? (a * (i - 1) + tr) / i : (a * (periode - 1) + tr) / periode;
  }
  return a;
}
