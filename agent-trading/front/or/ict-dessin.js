/* Dessin sobre de l'analyse ICT (ict-v2, UNE seule unité à la fois : celle du graphique).
   Code couleur unique, repris des jetons du terminal : liquidité en rouge brique (216,106,106), FVG / order blocks / breakers en bleu (--at-achat 78,163,255 : plein = order block fort, contour = simple),
   équilibre du dealing range en gris pointillé, repères de temps très discrets. Lignes fines, zones translucides, étiquettes courtes à droite. Aucune flèche d'achat ou de vente.
   Fonction de dessin pure ; renvoie les zones cliquables pour l'infobulle. */
export const COUL = Object.freeze({ liquidite: '216,106,106', bleu: '78,163,255', gris: '125,135,140', sable: '201,178,122', swing: '150,160,200' });
const KZ = '143,208,227';
export function dessinerIct(ctx, T, m, { xDeT, yDe, mobile }) {
  const cadres = []; if (!m) return cadres; const fs = mobile ? 9 : 10; ctx.font = `${fs}px system-ui, 'Segoe UI', sans-serif`; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 1; ctx.setLineDash([]);
  const ok = (...v) => v.every(q => q != null && Number.isFinite(q)), droite = Math.max(40, T.width - 4);
  const texte = (t, x, y, col, a = 0.9) => { ctx.fillStyle = `rgba(${col},${a})`; ctx.fillText(t, x, y); };
  const etiqDroite = (t, y, col) => { const w = ctx.measureText(t).width; texte(t, Math.max(2, droite - w - 2), y, col, 0.95); };
  const places = []; const libre = y => { if (places.some(q => Math.abs(q - y) < fs + 2)) return false; places.push(y); return true; };
  // fond très discret : killzones du jour (M15 et H1)
  for (const k of m.killzones || []) { const x0 = xDeT(k.debut), x1 = xDeT(k.fin); if (!ok(x0, x1) || x1 < 0 || x0 > T.width) continue; const a = Math.max(0, x0), b = Math.min(T.width, x1);
    ctx.fillStyle = `rgba(${KZ},.035)`; ctx.fillRect(a, 0, Math.max(1, b - a), T.height); ctx.fillStyle = `rgba(${KZ},.4)`; ctx.fillRect(a, T.height - 3, Math.max(1, b - a), 3);
    cadres.push({ kind: 'kz', x0: a, x1: b, y0: T.height - 6, y1: T.height, g: { p: null, texte: `Killzone ${k.nom}`, detail: [`${k.heure}`, 'repère de temps, pas un signal'] } }); }
  // les objets : les plus proches du prix en dernier pour rester lisibles
  for (const o of [...(m.objets || [])].reverse()) {
    const x0r = xDeT(o.tDebut); const x0 = ok(x0r) ? Math.max(0, x0r) : 0;
    if (o.p != null) {
      const y = yDe(o.p); if (!ok(y) || y < -4 || y > T.height + 4 || (ok(x0r) && x0r > T.width)) continue; const yy = Math.round(y) + 0.5;
      if (o.kind === 'equilibre') { ctx.strokeStyle = `rgba(${COUL.gris},.7)`; ctx.setLineDash([6, 4]); } else if (o.kind === 'ouverture') { ctx.strokeStyle = `rgba(${COUL.sable},.6)`; ctx.setLineDash([1, 3]); } else if (o.kind === 'swing') { ctx.strokeStyle = `rgba(${COUL.swing},.65)`; ctx.setLineDash([2, 3]); } else { ctx.strokeStyle = `rgba(${COUL.liquidite},.8)`; ctx.setLineDash(o.famille === 'repere' ? [] : [4, 3]); }
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(droite, yy); ctx.stroke(); ctx.setLineDash([]);
      const col = o.kind === 'equilibre' ? COUL.gris : o.kind === 'ouverture' ? COUL.sable : o.kind === 'swing' ? COUL.swing : COUL.liquidite; if (libre(yy - 3)) etiqDroite(o.nom, yy - 3, col);
      cadres.push({ kind: o.kind, x0, x1: T.width, y0: yy - 4, y1: yy + 4, g: { p: o.p, texte: `${o.nom} ${Number(o.p).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`, detail: o.detail || [] } }); continue; }
    const y0 = yDe(o.haut), y1 = yDe(o.bas); if (!ok(y0, y1) || Math.max(y0, y1) < -4 || Math.min(y0, y1) > T.height + 4 || (ok(x0r) && x0r > T.width)) continue;
    const top = Math.min(y0, y1), h = Math.max(2, Math.abs(y1 - y0)), plein = o.kind === 'ob' && o.fort, contour = o.kind === 'ob' && !o.fort, col = COUL.bleu;
    ctx.fillStyle = `rgba(${col},${plein ? 0.26 : contour ? 0.05 : 0.10})`; ctx.fillRect(x0, top, Math.max(1, droite - x0), h);
    ctx.strokeStyle = `rgba(${col},${o.kind === 'ifvg' ? 0.55 : 0.85})`; ctx.setLineDash(o.kind === 'breaker' ? [4, 3] : o.kind === 'ifvg' ? [1, 3] : []); ctx.lineWidth = contour ? 1.2 : 1;
    ctx.beginPath(); ctx.moveTo(x0, Math.round(top) + 0.5); ctx.lineTo(droite, Math.round(top) + 0.5); ctx.moveTo(x0, Math.round(top + h) + 0.5); ctx.lineTo(droite, Math.round(top + h) + 0.5); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
    if (o.kind === 'fvg' && ok(o.ce)) { const yc = yDe(o.ce); if (ok(yc)) { ctx.strokeStyle = `rgba(${col},.35)`; ctx.setLineDash([1, 3]); ctx.beginPath(); ctx.moveTo(x0, Math.round(yc) + 0.5); ctx.lineTo(droite, Math.round(yc) + 0.5); ctx.stroke(); ctx.setLineDash([]); } }
    if (libre(top - 3)) etiqDroite(o.nom, top - 3, col);
    cadres.push({ kind: o.kind, x0, x1: T.width, y0: top - 2, y1: top + h + 2, g: { p: (o.bas + o.haut) / 2, texte: o.nom, detail: o.detail || [] } });
  }
  // badge de tendance, en haut à gauche
  if (m.badge) { const t = m.badge.texte, w = ctx.measureText(t).width + 14, x = 6, y = 6, col = m.badge.sens === 'haussiere' ? '95,184,148' : m.badge.sens === 'baissiere' ? '216,106,106' : '160,170,176';
    ctx.fillStyle = 'rgba(8,12,16,.78)'; ctx.fillRect(x, y, w, fs + 10); ctx.strokeStyle = `rgba(${col},.8)`; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, fs + 9); ctx.fillStyle = `rgba(${col},1)`; ctx.fillRect(x, y, 3, fs + 10); texte(t, x + 9, y + fs + 2, '230,236,240', 0.95);
    cadres.push({ kind: 'badge', x0: x, x1: x + w, y0: y, y1: y + fs + 10, g: { p: null, texte: t, detail: m.badge.detail || [] } });
    // petite légende repliable (ouverte par un clic sur le badge, état gardé par l'appelant)
    if (m.legendeOuverte) { const L = m.legende || [], hh = L.length * (fs + 4) + 8, yL = y + fs + 14, wL = Math.max(...L.map(l => ctx.measureText(l[1]).width)) + 26; ctx.fillStyle = 'rgba(8,12,16,.82)'; ctx.fillRect(x, yL, wL, hh);
      L.forEach((l, i) => { const yy = yL + 6 + (i + 1) * (fs + 4) - 4, c = l[0] === 'liquidite' ? COUL.liquidite : l[0] === 'zone' ? COUL.bleu : COUL.gris; ctx.fillStyle = `rgba(${c},.9)`; ctx.fillRect(x + 5, yy - fs + 3, 8, 4); texte(l[1], x + 18, yy, '215,225,230', 0.9); }); } }
  return cadres;
}
