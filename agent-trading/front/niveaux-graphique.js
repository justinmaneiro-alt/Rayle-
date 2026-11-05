/* ═════════════ NIVEAUX ET ZONES DE VOLUME SUR LE GRAPHIQUE (copilote d'information, info-v2) ═════════════
   Dessin seulement : niveaux et zones publiés par le moteur, en PRIX KRAKEN. Aucun calcul de marché ici.
   • Zones de volume : RECTANGLES semi-transparents (opacité 0,10 à 0,25 selon la force), du moment de formation jusqu'au bord droit,
     épaisseur = largeur réelle de la zone ; étiquette courte au bord droit (« Zone volume 4 111 · forte »).
   • Supports (sous le prix) bleu clair, résistances (au-dessus) ambre ; traits fins : plein = veille / semaine, tirets = séances, pointillés = ronds.
     Vert et rouge restent réservés aux bougies et au P&L.
   • Hors de la zone visible : petite flèche discrète au bord haut / bas (l'échelle reste calée sur les bougies).
   • Étiquettes : colonne de droite, placement anti-collision (écart minimal, ordre gardé). */
import { espacerEtiquettes } from './etiquettes-calcul.js';

export const COULEURS = { zone: '#8f88cc', support: '#86c3e8', resistance: '#e2ae62' };
export const COUCHES_DEFAUT = Object.freeze({ zones: true, sr: true, sessions: true, ronds: true, profil: false });
export const NOMS_COUCHES = { zones: 'Zones de volume', sr: 'Supports-résistances', sessions: 'Sessions', ronds: 'Niveaux ronds', profil: 'Profil de volume' };
const CAT_COUCHE = { veille: 'sr', semaine: 'sr', seance: 'sessions', rond: 'ronds', volume: 'zones' };

/* un niveau est visible si UNE de ses catégories (hors « volume », dessinée en rectangle) est cochée */
export function niveauVisible(n, couches) {
  const cats = (n.cats || []).filter(c => c !== 'volume');
  return cats.length > 0 && cats.some(c => couches[CAT_COUCHE[c]]);
}
export const opaciteZone = force => Math.round((0.10 + 0.15 * Math.max(0, Math.min(1, force || 0))) * 1000) / 1000;
const tirets = cats => cats.includes('veille') || cats.includes('semaine') ? [] : cats.includes('seance') ? [5, 4] : [1, 3];

/* mise en page PURE : yDe(prix) → y (ou null), xDe(t) → x (ou null) ; renvoie ce qu'il faut dessiner */
export function disposer({ tous = [], zones = [], couches = COUCHES_DEFAUT, yDe, xDe, largeur, hauteur, fmt = String, ecart = 13 }) {
  const rects = [], lignes = [], etq = [], fleches = { haut: [], bas: [] }, compact = largeur < 520;   // téléphone : étiquettes courtes (le prix est sur l'échelle)
  if (couches.zones) for (const z of zones) {
    const y0 = yDe(z.haut), y1 = yDe(z.bas); if (y0 == null || y1 == null) continue;
    const texte = compact ? `Vol. ${z.niveau || ''}`.trim() : `Zone volume ${fmt(z.p)} · ${z.niveau || ''}`.trim();
    if (y1 < 0) { fleches.haut.push({ p: z.p, texte, col: COULEURS.zone }); continue; }
    if (y0 > hauteur) { fleches.bas.push({ p: z.p, texte, col: COULEURS.zone }); continue; }
    let x0 = xDe(z.tFormation); x0 = x0 == null || x0 < 0 ? 0 : Math.min(x0, largeur - 24);
    const h = Math.max(2, y1 - y0);
    rects.push({ x0, y0, x1: largeur, h, a: opaciteZone(z.force), col: COULEURS.zone });
    etq.push({ y: y0 + h / 2, texte, col: COULEURS.zone });
  }
  for (const n of tous) {
    if (!niveauVisible(n, couches)) continue;
    const y = yDe(n.p); if (y == null) continue;
    const seulRond = (n.cats || []).length === 1 && n.cats[0] === 'rond', col = n.role === 'support' ? COULEURS.support : COULEURS.resistance, texte = compact ? (seulRond ? fmt(n.p) : n.court) : seulRond ? `Rond ${fmt(n.p)}` : `${n.court} ${fmt(n.p)}`;
    if (y < 0) { fleches.haut.push({ p: n.p, texte, col }); continue; }
    if (y > hauteur) { fleches.bas.push({ p: n.p, texte, col }); continue; }
    lignes.push({ y, col, tirets: tirets(n.cats || []), fort: (n.cats || []).length > 1 || (n.ids || []).length > 1 });
    etq.push({ y, texte, col });
  }
  fleches.haut.sort((a, b) => a.p - b.p); fleches.bas.sort((a, b) => b.p - a.p);   // le plus proche de la vue en premier
  return { rects, lignes, fleches, etiquettes: espacerEtiquettes(etq, ecart, hauteur) };
}

/* dessin (canvas 2D, coordonnées médias) */
export function dessinerNiveaux(ctx, taille, d, { mono = 'monospace', alpha }) {
  ctx.save();
  for (const r of d.rects) { ctx.fillStyle = alpha(r.col, r.a); ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.h); ctx.fillStyle = alpha(r.col, Math.min(0.5, r.a + 0.15)); ctx.fillRect(r.x0, r.y0, 1, r.h); }
  ctx.lineWidth = 1;
  for (const l of d.lignes) { ctx.strokeStyle = alpha(l.col, l.fort ? 0.75 : 0.5); ctx.setLineDash(l.tirets); ctx.beginPath(); ctx.moveTo(0, Math.round(l.y) + 0.5); ctx.lineTo(taille.width, Math.round(l.y) + 0.5); ctx.stroke(); }
  ctx.setLineDash([]); ctx.font = `10px ${mono}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'right'; ctx.lineJoin = 'round';
  const ecrire = (t, x, y, col) => { ctx.strokeStyle = 'rgba(11,14,17,.92)'; ctx.lineWidth = 3; ctx.strokeText(t, x, y); ctx.fillStyle = col; ctx.fillText(t, x, y); };
  for (const e of d.etiquettes) ecrire(e.texte, taille.width - 6, e.y, alpha(e.col, 0.95));
  // flèches discrètes au bord : un résumé par bord (le plus proche + nombre)
  const bord = (L, y, sym) => { if (!L.length) return; ecrire(`${sym} ${L[0].texte}${L.length > 1 ? ` (+${L.length - 1})` : ''}`, taille.width - 6, y, alpha(L[0].col, 0.8)); };
  bord(d.fleches.haut, 9, '▲'); bord(d.fleches.bas, taille.height - 9, '▼');
  ctx.restore();
}
