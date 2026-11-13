/* ═════════════ ENTRÉE / STOP / TP1 / TP2 d'une flèche (module pur, un seul calcul pour l'infobulle, la notification navigateur, Telegram et l'image) ═════════════
   Entrée = clôture de la bougie de confirmation. Vente sur résistance : stop = bord HAUT de la zone + 0,2 ATR, objectifs en dessous. Achat sur support : stop = bord BAS − 0,2 ATR, objectifs au-dessus.
   Cassure MA200 confirmée : stop de l'autre côté de la MA200 à 1 ATR. TP1 = 1 R, TP2 = 2 R (R = distance entrée → stop). Repères de lecture, JAMAIS un ordre : stop et objectifs indicatifs. */
export const MARGE_STOP_ATR = 0.2, MA_STOP_ATR = 1;
const fr = (x, d = 0) => Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
export function niveauxSignal(f) {
  if (!f || !(f.atr > 0) || !Number.isFinite(f.prix)) return null;
  const dir = f.dir > 0 ? 1 : -1, entree = f.prix;
  const stop = f.type === 'ma_cassure' ? (f.niveau - dir * MA_STOP_ATR * f.atr) : (dir > 0 ? f.zoneBas - MARGE_STOP_ATR * f.atr : f.zoneHaut + MARGE_STOP_ATR * f.atr);
  const r = (entree - stop) * dir; if (!(r > 0)) return null;
  return { dir, entree, stop, r, rAtr: r / f.atr, atr: f.atr, tp1: entree + dir * r, tp2: entree + dir * 2 * r };
}
/* texte court : « Entrée 4 131 · Stop 4 150 (19 pts, 1,1 ATR) · TP1 4 112 · TP2 4 093 » */
export function texteNiveaux(n) { if (!n) return 'Stop / objectifs : non calculables'; return `Entrée ${fr(n.entree)} · Stop ${fr(n.stop)} (${fr(n.r)} pts, ${fr(n.rAtr, 1)} ATR) · TP1 ${fr(n.tp1)} (1 R) · TP2 ${fr(n.tp2)} (2 R)`; }
export const AVERTISSEMENT = 'repère de lecture, pas un ordre. Stop/TP indicatifs.';
