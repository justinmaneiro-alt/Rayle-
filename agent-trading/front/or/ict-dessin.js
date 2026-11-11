/* Dessin de l'analyse ICT (ict-v1) : zones du début à la fin de leur vie (jamais pleine largeur), liquidité en trait puis pointillé jusqu'au balayage, équilibre premium / discount,
   bandes fines de killzones sur l'axe du temps, ouvertures, cassures de structure, plage asiatique. Fonction de dessin pure ; renvoie les zones cliquables pour l'infobulle. */
import { dessinerLiquidite } from './zones-affichage-dessin.js';
const COUL = { haut: '95,184,148', bas: '216,106,106', gris: '125,135,140', sable: '201,178,122', cyan: '143,208,227', violet: '195,155,224' };
const KZ = { asie: '143,136,204', londres: '95,184,148', ny_am: '216,170,98', londres_cloture: '143,208,227', sb_londres: '255,214,121', sb_ny_am: '255,214,121', sb_ny_pm: '255,214,121' };
const nb = (p, d = 0) => Number(p).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
export function dessinerIct(ctx, T, m, { xDeT, yDe, mobile }) {
  const cadres = []; if (!m) return cadres; const fs = mobile ? 9 : 10; ctx.font = `${fs}px system-ui, 'Segoe UI', sans-serif`; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 1;
  const ok = (...v) => v.every(q => q != null && Number.isFinite(q)), texte = (t, x, y, col, a = 0.9) => { ctx.fillStyle = `rgba(${col},${a})`; const w = ctx.measureText(t).width; ctx.fillText(t, Math.max(2, Math.min(T.width - w - 66, x)), y); };
  // bandes de killzones sur l'axe du temps (5 px de haut, au bas du graphique)
  for (const k of m.killzones || []) { const x0 = xDeT(k.debut), x1 = xDeT(k.fin); if (!ok(x0, x1) || x1 < 0 || x0 > T.width) continue; const col = KZ[k.id] || COUL.cyan, y = T.height - 6 - (k.id.startsWith('sb_') ? 6 : 0), a = Math.max(0, x0), b = Math.min(T.width, x1);
    ctx.fillStyle = `rgba(${col},.35)`; ctx.fillRect(a, y, Math.max(1, b - a), 5); if (b - a > 54 && !mobile) texte(k.nom, a + 2, y - 2, col, 0.7);
    cadres.push({ kind: 'kz', x0: a, x1: b, y0: y - 2, y1: T.height, g: { p: null, texte: `Killzone ${k.nom}`, detail: [`${k.heure}`, 'repère de temps, pas un signal'] } }); }
  // plage asiatique (accumulation)
  for (const e of m.amd || []) { const x0 = xDeT(e.accumulation.t0), x1 = xDeT(e.accumulation.t1), yH = yDe(e.accumulation.h), yL = yDe(e.accumulation.l); if (!ok(x0, x1, yH, yL) || x1 < 0 || x0 > T.width) continue;
    ctx.strokeStyle = `rgba(${COUL.violet},.5)`; ctx.setLineDash([2, 3]); ctx.strokeRect(Math.max(0, x0) + 0.5, Math.min(yH, yL) + 0.5, Math.max(1, Math.min(T.width, x1) - Math.max(0, x0)), Math.abs(yL - yH)); ctx.setLineDash([]);
    if (e.etiquette) { const xm = xDeT(e.manipulation ? e.manipulation.t : e.accumulation.t1); if (ok(xm)) texte(e.etiquette, xm + 4, Math.min(yH, yL) - 4, COUL.violet, 0.9); }
    cadres.push({ kind: 'amd', x0: Math.max(0, x0), x1: Math.min(T.width, x1) + 40, y0: Math.min(yH, yL) - 6, y1: Math.max(yH, yL) + 6, g: e.g }); }
  // ouvertures de minuit et de 8h30 (heure de New York)
  for (const o of m.ouvertures || []) { const x0 = xDeT(o.t), x1 = o.tFin ? xDeT(o.tFin) : T.width, y = yDe(o.p); if (!ok(x0, x1, y) || x1 < 0 || x0 > T.width || y < -4 || y > T.height + 4) continue; ctx.strokeStyle = `rgba(${COUL.sable},.7)`; ctx.setLineDash([1, 3]); ctx.beginPath(); ctx.moveTo(Math.max(0, x0), Math.round(y) + 0.5); ctx.lineTo(Math.min(T.width, x1), Math.round(y) + 0.5); ctx.stroke(); ctx.setLineDash([]); if (x0 >= 0) texte(o.nom, x0 + 2, y - 3, COUL.sable, 0.8);
    cadres.push({ kind: 'ouv', x0: Math.max(0, x0), x1: Math.min(T.width, x1), y0: y - 3, y1: y + 3, g: { p: o.p, texte: `${o.nom} ${nb(o.p, 2)}`, detail: [o.detail] } }); }
  // équilibre premium / discount
  if (m.pd) { const y = yDe(m.pd.equilibre), x0 = xDeT(m.pd.tDebut); if (ok(y, x0) && y > -4 && y < T.height + 4) { ctx.strokeStyle = `rgba(${COUL.cyan},.55)`; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(Math.max(0, x0), Math.round(y) + 0.5); ctx.lineTo(T.width, Math.round(y) + 0.5); ctx.stroke(); ctx.setLineDash([]);
      texte('Équilibre 50 %', Math.max(4, x0) + 4, y - 3, COUL.cyan, 0.8); const yh = yDe(m.pd.haut), yb = yDe(m.pd.bas); if (ok(yh)) texte('Premium ↑', Math.max(4, x0) + 4, yh + 11, COUL.bas, 0.65); if (ok(yb)) texte('Discount ↓', Math.max(4, x0) + 4, yb - 4, COUL.haut, 0.65);
      cadres.push({ kind: 'pd', x0: Math.max(0, x0), x1: T.width, y0: y - 3, y1: y + 3, g: m.pd.g }); } }
  // cassures de structure (MSS / BOS) : trait du niveau jusqu'à la bougie de cassure
  for (const s of m.structure || []) { const x0 = xDeT(s.tNiveau), x1 = xDeT(s.t), y = yDe(s.niveau); if (!ok(x0, x1, y) || x1 < 0 || x0 > T.width) continue; const col = s.type === 'MSS' ? COUL.violet : s.dir > 0 ? COUL.haut : COUL.bas;
    ctx.strokeStyle = `rgba(${col},.8)`; ctx.setLineDash(s.type === 'MSS' ? [] : [3, 3]); ctx.beginPath(); ctx.moveTo(Math.max(0, x0), Math.round(y) + 0.5); ctx.lineTo(x1, Math.round(y) + 0.5); ctx.stroke(); ctx.setLineDash([]); texte(s.type, Math.max(2, x1 - ctx.measureText(s.type).width - 2), y - 3, col, 0.95);
    cadres.push({ kind: 'struct', x0: Math.max(0, x0), x1, y0: y - 3, y1: y + 3, g: s.g }); }
  for (const d of m.deplacements || []) { const x = xDeT(d.t), y = yDe(d.p); if (!ok(x, y) || x < 0 || x > T.width) continue; ctx.fillStyle = `rgba(${d.dir > 0 ? COUL.haut : COUL.bas},.9)`; ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3.5, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3.5, y); ctx.closePath(); ctx.fill(); cadres.push({ kind: 'depl', x0: x - 5, x1: x + 5, y0: y - 6, y1: y + 6, g: d.g }); }
  // objets : zones et liquidité (une étiquette qui chevaucherait une autre est omise ; le détail reste au survol)
  const places = []; const libre = y => { if (places.some(q => Math.abs(q - y) < fs + 3)) return false; places.push(y); return true; };
  for (const o of m.objets || []) {
    if (o.kind === 'liquidite') { const c = dessinerLiquidite(ctx, T, { p: o.p, sorte: o.dir < 0 ? 'haute' : 'basse', n: o.brut.pivots || 1, tPremier: o.tDebut, tDernier: o.tDebut, tBalayage: o.tFin, texte: o.nom, detail: o.detail }, { xDeT, yDe }); if (c) { if (o.actif && o.etiquette && libre(c.ym - 3)) texte(o.etiquette, Math.max(4, xDeT(o.tDebut)) + 4, c.ym - 3, COUL.violet, 0.9); cadres.push(c); } continue; }
    const y0 = yDe(o.haut), y1 = yDe(o.bas); let x0 = xDeT(o.tDebut); const x1 = o.tFin != null ? xDeT(o.tFin) : T.width; if (!ok(y0, y1, x0, x1) || x1 < 0 || x0 > T.width || Math.max(y0, y1) < -4 || Math.min(y0, y1) > T.height + 4) continue; x0 = Math.max(0, x0);
    const col = o.kind === 'ote' ? COUL.cyan : o.kind === 'ecart' ? COUL.sable : o.dir > 0 ? COUL.haut : COUL.bas, trace = !o.actif, h = Math.max(2, Math.abs(y1 - y0)), top = Math.min(y0, y1);
    ctx.fillStyle = `rgba(${col},${trace ? 0.03 : 0.10})`; ctx.fillRect(x0, top, Math.max(1, Math.min(T.width, x1) - x0), h); ctx.strokeStyle = `rgba(${col},${trace ? 0.25 : 0.8})`; ctx.setLineDash(o.kind === 'breaker' ? [4, 3] : o.kind === 'ifvg' ? [1, 3] : trace ? [2, 3] : []);
    ctx.beginPath(); ctx.moveTo(x0, Math.round(top) + 0.5); ctx.lineTo(Math.min(T.width, x1), Math.round(top) + 0.5); ctx.moveTo(x0, Math.round(top + h) + 0.5); ctx.lineTo(Math.min(T.width, x1), Math.round(top + h) + 0.5); ctx.stroke(); ctx.setLineDash([]);
    if (o.etiquette && !trace && libre(top - 3)) texte(o.etiquette, x0 + 3, top - 3, col, 0.95);
    cadres.push({ kind: o.kind, x0, x1: Math.min(T.width, x1), y0: top - 2, y1: top + h + 2, g: { p: (o.bas + o.haut) / 2, texte: o.nom + (trace ? ' (terminé)' : ''), detail: o.detail } });
  }
  return cadres;
}
