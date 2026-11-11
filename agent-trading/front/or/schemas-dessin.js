/* Dessin des divergences RSI et des schémas de retournement (schemas-retournement-v1) : lignes fines, étiquettes courtes, en formation = pointillés, figé à la confirmation, invalidé = grisé mais visible.
   Fonction de dessin pure : reçoit le contexte et les conversions du graphique ; renvoie les zones cliquables pour l'infobulle. */
const COUL = { haut: '95,184,148', bas: '216,106,106', gris: '125,135,140' };
const rgb = (dir, gris) => (gris ? COUL.gris : dir > 0 ? COUL.haut : COUL.bas);
export function dessinerSchemas(ctx, T, m, { xDeT, yDe, mobile }) {
  const cadres = []; if (!m) return cadres; const fs = mobile ? 9 : 10; ctx.font = `${fs}px system-ui, 'Segoe UI', sans-serif`; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 1;
  const X = t => { const x = xDeT(t); return x == null ? null : x; }, ok = (...v) => v.every(q => q != null && Number.isFinite(q));
  const point = (x, y, col, a = 0.95) => { ctx.strokeStyle = `rgba(${col},${a})`; ctx.fillStyle = `rgba(${col},${a * 0.3})`; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 6.3); ctx.fill(); ctx.stroke(); };
  const texte = (t, x, y, col, a = 0.95) => { ctx.fillStyle = `rgba(${col},${a})`; const w = ctx.measureText(t).width; ctx.fillText(t, Math.max(2, Math.min(T.width - w - 66, x)), y); };
  // divergences : droite entre les deux pivots SUR LE PRIX, étiquette à la bougie de confirmation avec l'heure
  for (const d of m.divs || []) {
    const x1 = X(d.t1), x2 = X(d.t2), y1 = yDe(d.p1), y2 = yDe(d.p2), xc = X(d.tConf); if (!ok(x1, x2, y1, y2) || x2 < -10 || x1 > T.width + 10) continue;
    const col = rgb(d.dir, false); ctx.strokeStyle = `rgba(${col},${d.cachee ? 0.7 : 0.95})`; ctx.setLineDash(d.cachee ? [3, 3] : []); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
    point(x1, y1, col, 0.8); point(x2, y2, col, 0.8);
    if (ok(xc) && xc >= 0 && xc <= T.width && d.etiquette) texte(d.etiquette, xc + 4, d.dir < 0 ? y2 - 8 : y2 + 16, col);
    cadres.push({ kind: 'div', x0: Math.min(x1, x2) - 3, x1: Math.max(x1, x2) + 3, y0: Math.min(y1, y2) - 4, y1: Math.max(y1, y2) + 4, g: d.g });
  }
  // schémas : points, ligne de cou, cible indicative
  for (const s of m.schemas || []) {
    const gris = s.statut === 'invalide', col = rgb(s.dir, gris), forme = s.statut === 'formation';
    const pts = (s.points || []).map(q => [X(q.t), yDe(q.p)]); if (pts.some(q => !ok(q[0], q[1]))) continue; if (pts[pts.length - 1][0] < -10) continue;
    ctx.strokeStyle = `rgba(${col},${gris ? 0.55 : 0.9})`; ctx.setLineDash(forme ? [3, 3] : gris ? [2, 4] : []);
    if (s.kind === 'tete') { ctx.beginPath(); pts.forEach((q, k) => (k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke(); }
    for (const q of pts) point(q[0], q[1], col, gris ? 0.6 : 0.9);
    // ligne de cou : du premier creux jusqu'à la confirmation (ou au dernier point connu si en formation) ; couFin = { t, p } fourni par le modèle
    const c = s.cou, xc0 = X(c.t0), yc0 = yDe(c.p0), xe = s.couFin ? X(s.couFin.t) : T.width, ye = s.couFin ? yDe(s.couFin.p) : yc0;
    if (ok(xc0, yc0, xe, ye)) { ctx.beginPath(); ctx.moveTo(xc0, yc0); ctx.lineTo(xe, ye); ctx.stroke(); }
    ctx.setLineDash([]);
    if (s.statut === 'confirme' && s.cible != null) { const yt = yDe(s.cible), xt = X(s.tConfirm); if (ok(yt, xt) && xt >= 0 && xt <= T.width) { ctx.setLineDash([2, 4]); ctx.strokeStyle = `rgba(${col},.6)`; ctx.beginPath(); ctx.moveTo(xt, yt); ctx.lineTo(Math.min(T.width - 66, xt + 80), yt); ctx.stroke(); ctx.setLineDash([]); texte('cible indicative', Math.min(T.width - 150, xt + 6), yt - 3, col, 0.75); } }
    const xm = (pts[0][0] + pts[pts.length - 1][0]) / 2, ym = Math.min(...pts.map(q => q[1])) - 8, yb = Math.max(...pts.map(q => q[1])) + 16;
    if (s.etiquette) texte(s.etiquette, xm - 30, s.dir < 0 ? ym : yb, col, gris ? 0.7 : 0.95);
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    cadres.push({ kind: 'schema', x0: Math.min(...xs) - 4, x1: Math.max(...xs, ok(xe) ? xe : 0) + 4, y0: Math.min(...ys, ok(yc0) ? yc0 : 1e9) - 6, y1: Math.max(...ys, ok(yc0) ? yc0 : -1e9) + 6, g: s.g });
  }
  // balayages avec réintégration : trait du niveau jusqu'à la bougie, repère à la mèche
  for (const b of m.balayages || []) {
    const x0 = X(b.tNiveau), x1 = X(b.t), y = yDe(b.niveau), yw = yDe(b.extreme); if (!ok(x0, x1, y) || x1 < 0 || x0 > T.width) continue; const col = rgb(b.dir, false);
    ctx.strokeStyle = `rgba(${col},.7)`; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(Math.max(0, x0), y); ctx.lineTo(x1, y); ctx.stroke(); ctx.setLineDash([]);
    if (ok(yw)) { ctx.beginPath(); ctx.arc(x1, yw, 3.5, 0, 6.3); ctx.stroke(); }
    if (b.etiquette) texte(b.etiquette, x1 + 6, b.dir < 0 ? (yw ?? y) - 7 : (yw ?? y) + 15, col, 0.9);
    cadres.push({ kind: 'balayage', x0: Math.max(0, x0), x1: x1 + 6, y0: Math.min(y, yw ?? y) - 5, y1: Math.max(y, yw ?? y) + 5, g: b.g });
  }
  // bougies de retournement en zone : petit triangle
  for (const q of m.bougies || []) {
    const x = X(q.t), y = yDe(q.p); if (!ok(x, y) || x < 0 || x > T.width) continue; const col = rgb(q.dir, false), d = q.dir < 0 ? -1 : 1;
    ctx.fillStyle = `rgba(${col},.85)`; ctx.beginPath(); ctx.moveTo(x, y + d * 4); ctx.lineTo(x - 4, y + d * 11); ctx.lineTo(x + 4, y + d * 11); ctx.closePath(); ctx.fill();
    cadres.push({ kind: 'bougie', x0: x - 6, x1: x + 6, y0: Math.min(y, y + d * 12) - 2, y1: Math.max(y, y + d * 12) + 2, g: q.g });
  }
  return cadres;
}
