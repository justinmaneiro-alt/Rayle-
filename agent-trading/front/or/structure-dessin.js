/* Dessin de la structure de marché et des zones de retournement sur le graphique (fonction de dessin : contexte + conversions du graphique ; renvoie les zones cliquables pour l'infobulle). */
const COUL = { support: '95,184,148', resistance: '216,106,106', haut: '95,184,148', bas: '216,106,106', neutre: '160,170,180' };
export function dessinerStructure(ctx, T, m, { xDeT, yDe, mobile }) {
  const cadres = []; if (!m) return cadres; const fs = mobile ? 9 : 10; ctx.font = `${fs}px system-ui, 'Segoe UI', sans-serif`; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 1;
  // zones de retournement : opacité proportionnelle à la probabilité mesurée (zone sans mesure = presque transparente)
  for (const z of m.zones || []) {
    const y0 = yDe(z.haut), y1 = yDe(z.bas); if (y0 == null || y1 == null || y1 < -4 || y0 > T.height + 4) continue; const h = Math.max(2, y1 - y0), col = COUL[z.cote] || COUL.neutre, a = z.prob == null ? 0.035 : 0.04 + 0.34 * z.prob;
    ctx.fillStyle = `rgba(${col},${a})`; ctx.fillRect(0, y0, T.width - 62, h); ctx.strokeStyle = `rgba(${col},${Math.min(0.9, a + 0.15)})`; ctx.setLineDash(z.prob == null ? [2, 4] : []); ctx.beginPath(); ctx.moveTo(0, Math.round(y0) + 0.5); ctx.lineTo(T.width - 62, Math.round(y0) + 0.5); ctx.moveTo(0, Math.round(y0 + h) + 0.5); ctx.lineTo(T.width - 62, Math.round(y0 + h) + 0.5); ctx.stroke(); ctx.setLineDash([]);
    if (z.proche) { ctx.fillStyle = `rgba(${col},.95)`; ctx.fillText(z.etiquette, 6, y0 - 3); }
    cadres.push({ kind: 'zone', x0: 0, x1: T.width - 62, y0: y0 - 2, y1: y0 + h + 2, g: { p: z.p, texte: z.titre, detail: z.detail } });
  }
  // cassures de structure : trait court du niveau cassé jusqu'à la bougie de cassure
  for (const b of m.bos || []) { const x0 = xDeT(b.tNiveau), x1 = xDeT(b.t), y = yDe(b.niveau); if ([x0, x1, y].some(v => v == null) || x1 < 0 || x0 > T.width) continue; const col = b.tf === 'H4' ? '255,214,121' : COUL[b.dir > 0 ? 'haut' : 'bas']; ctx.strokeStyle = `rgba(${col},${b.tf === 'H4' ? 0.9 : 0.55})`; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(Math.max(0, x0), Math.round(y) + 0.5); ctx.lineTo(x1, Math.round(y) + 0.5); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = `rgba(${col},.9)`; if (b.etiquette) ctx.fillText(b.etiquette, Math.max(2, x1 - ctx.measureText(b.etiquette).width - 2), y - 3); cadres.push({ kind: 'bos', x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: y - 4, y1: y + 4, g: { p: b.niveau, texte: b.titre, detail: b.detail } }); }
  // événements : flèche discrète à la clôture + étiquette courte (les plus récents) ; invalidés : grisés mais visibles
  let k = 0; for (const e of [...(m.evenements || [])].reverse()) {
    const x = xDeT(e.t); if (x == null || x < -10 || x > T.width + 10) continue; const yH = yDe(e.hautBougie), yL = yDe(e.basBougie); if (yH == null || yL == null) continue;
    const gris = e.statut === 'invalide', base = e.dir > 0 ? COUL.haut : COUL.bas, col = gris ? '125,135,140' : e.tf === 'H4' ? '255,214,121' : base, s = e.tf === 'H4' ? 6 : 4.5, bas = e.dir < 0;   // flèche vers le bas au-dessus de la bougie pour un sens baissier
    ctx.fillStyle = `rgba(${col},${gris ? 0.7 : 0.95})`; ctx.strokeStyle = `rgba(${col},.95)`; ctx.beginPath();
    if (e.type === 'confirme') { const y = bas ? yH - 6 : yL + 6; ctx.moveTo(x, bas ? y + s : y - s); ctx.lineTo(x - s - 1, bas ? y - s : y + s); ctx.lineTo(x + s + 1, bas ? y - s : y + s); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    else if (e.type === 'choch') { const y = bas ? yH - 6 : yL + 6; ctx.moveTo(x, bas ? y + s : y - s); ctx.lineTo(x - s, bas ? y - s : y + s); ctx.lineTo(x + s, bas ? y - s : y + s); ctx.closePath(); ctx.stroke(); if (!gris) { ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; } }
    else { const y = bas ? yH - 6 : yL + 6; ctx.arc(x, y, e.tf === 'H4' ? 4 : 3, 0, 6.3); ctx.stroke(); }
    if (k < (m.etiquettesMax ?? 6) || e.survol) { ctx.fillStyle = `rgba(${col},${gris ? 0.75 : 0.98})`; const tx = Math.min(T.width - ctx.measureText(e.court).width - 66, Math.max(2, x + 8)); ctx.fillText(e.court, tx, bas ? yH - 10 : yL + 18); } k++;
    cadres.push({ kind: 'evt', x0: x - 9, x1: x + 9, y0: (bas ? yH - 18 : yL - 4), y1: (bas ? yH + 4 : yL + 18), g: { p: e.prix, texte: e.titre, detail: e.detail } });
  }
  return cadres;
}
