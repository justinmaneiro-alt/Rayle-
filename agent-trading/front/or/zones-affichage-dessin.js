/* Dessin des zones et de la liquidité (zones-affichage-v1) : segments précis, jamais de rectangle pleine largeur.
   Une zone active va de sa bougie d'origine au bord droit ; une zone invalidée s'arrête à sa bougie d'invalidation (trace très pâle) ;
   la liquidité est pleine du 1er au dernier pivot, pointillée jusqu'au balayage, puis s'arrête avec un repère. */
import { detailZone } from './zones-affichage-v1.js';

export const COUL = Object.freeze({ resistance: '216,106,106', support: '95,184,148', liquidite: '195,155,224' });
const nb = (p, d = 0) => Number(p).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ');

/* zone : ligne fine au prix exact + bande d'épaisseur ≤ 0,3 ATR ; opa = facteur d'opacité (probabilité mesurée pour la couche Retournements) */
export function dessinerZone(ctx, T, z, { xDeT, yDe, opa = 1, fs = 10, rgb = null }) {
  const e = z.epaisseur ?? Math.min(z.haut - z.bas, 1e9), y0 = yDe(z.p + e / 2), y1 = yDe(z.p - e / 2), ym = yDe(z.p);
  if (y0 == null || y1 == null || ym == null || y1 < -4 || y0 > T.height + 4) return null;
  let x0 = xDeT(z.tDebut); if (x0 == null) return null;
  const x1 = z.actif === false ? xDeT(z.tFin) : T.width; if (x1 == null || x1 < 0 || x0 > T.width) return null;
  x0 = Math.max(0, x0); if (!(x1 > x0)) return null;
  const col = rgb || COUL[z.cote] || COUL.support, trace = z.actif === false, h = Math.max(2, y1 - y0), yy = Math.round(ym) + 0.5;
  ctx.fillStyle = `rgba(${col},${trace ? 0.035 * opa : 0.11 * opa})`; ctx.fillRect(x0, Math.min(y0, y1), x1 - x0, h);
  ctx.strokeStyle = `rgba(${col},${trace ? 0.22 : Math.min(0.95, 0.85 * Math.max(0.45, opa))})`; ctx.lineWidth = 1; ctx.setLineDash(trace ? [2, 3] : []);
  ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); ctx.setLineDash([]);
  if (x0 > 0) { ctx.beginPath(); ctx.moveTo(Math.round(x0) + 0.5, Math.min(y0, y1) - 2); ctx.lineTo(Math.round(x0) + 0.5, Math.max(y0, y1) + 2); ctx.stroke(); }   // repère de naissance
  if (trace && x1 < T.width) { ctx.beginPath(); ctx.moveTo(Math.round(x1) + 0.5, yy - 3); ctx.lineTo(Math.round(x1) + 0.5, yy + 3); ctx.stroke(); }
  if (z.retournee && !trace && x0 > 0 && x0 < T.width - 14) { ctx.font = `${fs}px system-ui, sans-serif`; ctx.fillStyle = `rgba(${col},.9)`; ctx.fillText('↺', x0 + 3, yy - 3); }
  return { x0, x1, y0: Math.min(y0, y1), y1: Math.max(y0, y1), ym, g: { p: z.p, texte: `${z.cote === 'resistance' ? 'Résistance' : 'Support'}${z.retournee ? ' retournée' : ''} ${nb(z.p)}${trace ? ' (invalidée)' : ''}`, detail: [...detailZone(z, nb), ...(z.elements && z.elements.length === 1 && z.elements[0].detail ? z.elements[0].detail : [])] } };
}
/* liquidité : { p, sorte, n, tPremier, tDernier, tBalayage, texte, detail } */
export function dessinerLiquidite(ctx, T, L, { xDeT, yDe, rgb = COUL.liquidite }) {
  const y = yDe(L.p); if (y == null || y < -4 || y > T.height + 4) return null;
  const xa = xDeT(L.tPremier), xd = xDeT(L.tDernier), xb = L.tBalayage != null ? xDeT(L.tBalayage) : T.width; if (xa == null || xd == null || xb == null || xb < 0 || xa > T.width) return null;
  const yy = Math.round(y) + 0.5, balayee = L.tBalayage != null, a = balayee ? 0.45 : 0.9;
  ctx.strokeStyle = `rgba(${rgb},${a})`; ctx.lineWidth = 1;
  const x0 = Math.max(0, xa), x1 = Math.max(x0, Math.min(xd, T.width)), x2 = Math.min(T.width, Math.max(x1, xb));
  if (L.n >= 2 && x1 > x0) { ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); }
  ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(L.n >= 2 ? x1 : x0, yy); ctx.lineTo(x2, yy); ctx.stroke(); ctx.setLineDash([]);
  if (balayee && xb >= 0 && xb <= T.width) { ctx.beginPath(); ctx.arc(xb, yy, 3, 0, 6.3); ctx.stroke(); }   // repère à la bougie de balayage : la ligne s'arrête
  return { x0, x1: x2, y0: y - 4, y1: y + 4, ym: y, g: { p: L.p, texte: L.texte + (balayee ? ' · balayée' : ''), detail: L.detail } };
}
