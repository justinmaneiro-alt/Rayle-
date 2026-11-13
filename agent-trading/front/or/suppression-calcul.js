/* ═════════════ SUPPRIMER UN TRAIT, UNE ZONE OU UN CARRÉ : calculs purs (sans DOM) ═════════════
   Zone de touche généreuse (10 px souris, 20 px doigt), choix du candidat le plus proche, masques de niveaux calculés (mémorisés), placement de la petite fenêtre. */
export const TOL_SOURIS = 10, TOL_TACTILE = 20, DUREE_ANNULER = 6000, TOL_MASQUE_ATR = 0.25;
export const CLE_MASQUES = 'rayle_or_masques_t11';
/* distance d'un point à un rectangle (0 à l'intérieur) */
export function distanceRect(x, y, r) { const dx = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0, dy = y < r.y0 ? r.y0 - y : y > r.y1 ? y - r.y1 : 0; return Math.hypot(dx, dy); }
export function distanceSegment(x, y, x0, y0, x1, y1) { const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L)); return Math.hypot(x - (x0 + u * dx), y - (y0 + u * dy)); }
/* candidat retenu : le plus proche ; à distance quasi égale, un dessin de l'utilisateur passe avant un niveau calculé */
export function choisir(cands) {
  if (!cands || !cands.length) return null;
  const rang = c => c.type === 'objet' || c.type === 'ann' ? 0 : c.type === 'propose' ? 1 : 2;
  return cands.slice().sort((a, b) => (Math.abs(a.d - b.d) < 3 ? rang(a) - rang(b) : a.d - b.d))[0];
}
export const tolerance = typeTouche => typeTouche === 'touch' || typeTouche === 'pen' ? TOL_TACTILE : TOL_SOURIS;
/* un masque { kind, bas, haut, t } cache une zone (kind identique) dont la plage le recouvre à 0,25 ATR près ; `now` : seulement après l'instant du masquage (aucun passé réécrit) */
export function zoneMasquee(masques, kind, bas, haut, a, now = Infinity) {
  const tol = TOL_MASQUE_ATR * (a > 0 ? a : 0);
  return (masques || []).some(m => m.kind === kind && bas <= m.haut + tol && haut >= m.bas - tol && (m.t == null || now > m.t));
}
/* option `exclure` des flèches v6 : les niveaux (zones de swing, structure) cachés par l'utilisateur ne produisent plus de nouvelles flèches */
export const exclureDe = masques => (z, a, now) => zoneMasquee(masques, 'zone', z.bas, z.haut, a, now);
export function ajouterMasque(liste, m) { const l = (liste || []).filter(x => !(x.kind === m.kind && Math.abs(x.bas - m.bas) < 1e-6 && Math.abs(x.haut - m.haut) < 1e-6)); l.push(m); return l.slice(-300); }
export function retirerMasque(liste, cle) { return (liste || []).filter(x => x.cle !== cle); }
/* fenêtre flottante près du point de clic, toujours entièrement visible */
export function placerFenetre(x, y, w, h, W, H, marge = 6) { let left = x + 14, top = y - h / 2; if (left + w > W - marge) left = x - w - 14; left = Math.max(marge, Math.min(left, W - w - marge)); top = Math.max(marge, Math.min(top, H - h - marge)); return { left, top }; }
export const fmtPrix = (bas, haut) => { const f = v => Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/[  ]/g, ' '); return Math.abs(haut - bas) < 0.5 ? f((bas + haut) / 2) : `${f(bas)} – ${f(haut)}`; };
