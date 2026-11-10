/* Dessin des outils institutionnels sur le graphique (fonction pure de dessin : reçoit le contexte et les fonctions de conversion du graphique). */
export function dessinerInstitutionnel(ctx, T, m, { xDeT, yDe, mobile }) {
  if (!m) return; const fs = mobile ? 9 : 10; ctx.font = `${fs}px system-ui, 'Segoe UI', sans-serif`; ctx.textBaseline = 'alphabetic';
  const utilises = []; const place = y => { let yy = y; for (let k = 0; k < 8 && utilises.some(u => Math.abs(u - yy) < fs + 1); k++) yy += fs + 1; utilises.push(yy); return yy; };
  // zones de séance (Paris)
  for (const z of m.zones) { const x0 = xDeT(z.t0), x1 = xDeT(z.t1), yH = yDe(z.h), yL = yDe(z.l); if ([x0, x1, yH, yL].some(v => v == null)) continue; ctx.fillStyle = `rgba(${z.rgb},.09)`; ctx.fillRect(x0, yH, Math.max(2, x1 - x0), yL - yH); ctx.strokeStyle = `rgba(${z.rgb},.55)`; ctx.setLineDash([]); ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, yH + 0.5, Math.max(2, x1 - x0) - 1, yL - yH - 1); ctx.fillStyle = `rgba(${z.rgb},.95)`; ctx.fillText(z.txt, x0 + 3, yH + fs + 1); }
  // profils de volume : histogramme à droite, POC / VAH / VAL en lignes
  let rang = 0; for (const P of m.profils) {
    const largeur = T.width * 0.13, x0 = T.width - 56 - rang * 0; ctx.fillStyle = `rgba(127,208,255,${P.alpha})`;
    for (const c of P.cases) { const y0 = yDe(c.p + P.pas / 2), y1 = yDe(c.p - P.pas / 2); if (y0 == null || y1 == null) continue; const w = (c.v / P.max) * largeur * (P.nom === 'séance' ? 1 : P.nom === 'veille' ? 0.8 : 0.6); ctx.fillRect(x0 - w, y0, w, Math.max(1, y1 - y0 - 0.5)); }
    for (const [p, t, d] of [[P.poc, 'POC ' + P.nom, []], [P.vah, 'VAH ' + P.nom, [4, 3]], [P.val, 'VAL ' + P.nom, [4, 3]]]) { const y = yDe(p); if (y == null) continue; ctx.strokeStyle = `rgba(127,208,255,${P.nom === 'séance' ? 0.9 : 0.55})`; ctx.setLineDash(d); ctx.lineWidth = t.startsWith('POC') ? 1.4 : 1; ctx.beginPath(); ctx.moveTo(x0 - largeur - 4, Math.round(y) + 0.5); ctx.lineTo(x0, Math.round(y) + 0.5); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(127,208,255,.95)'; ctx.fillText(t, x0 - largeur - 4 - ctx.measureText(t).width - 3, place(y + 3)); }
    rang++;
  }
  // lignes horizontales
  for (const L of m.lignes) { const y = yDe(L.p); if (y == null || y < -2 || y > T.height + 2) continue; let x0 = 0; if (L.t0 != null) { const x = xDeT(L.t0); if (x != null) x0 = Math.max(0, x); }
    ctx.strokeStyle = L.col; ctx.lineWidth = L.w || 1; ctx.setLineDash(L.dash || []); ctx.beginPath(); ctx.moveTo(x0, Math.round(y) + 0.5); ctx.lineTo(T.width, Math.round(y) + 0.5); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = L.col; ctx.globalAlpha = L.discret ? 0.8 : 1; const yy = place(y - 3), tw = ctx.measureText(L.txt).width; ctx.fillText(L.txt, Math.max(4, Math.min(T.width - tw - 70, x0 + 6)), yy); ctx.globalAlpha = 1; }
  // séries (VWAP et bandes)
  for (const S of m.series) { ctx.strokeStyle = S.col; ctx.globalAlpha = S.alpha ?? 1; ctx.lineWidth = S.w || 1; ctx.setLineDash(S.dash || []); ctx.beginPath(); let debut = true, dernier = null;
    for (const q of S.pts) { const x = xDeT(q.t), y = yDe(q.p); if (x == null || y == null) { debut = true; continue; } if (x < -20 || x > T.width + 20) { debut = true; continue; } const pause = dernier != null && q.t - dernier > 3 * 3600e3; if (debut || pause) ctx.moveTo(x, y); else ctx.lineTo(x, y); debut = false; dernier = q.t; }
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; const f = S.pts[S.pts.length - 1]; if (f && S.txt) { const x = xDeT(f.t), y = yDe(f.p); if (x != null && y != null && x < T.width - 60) { ctx.fillStyle = S.col; ctx.globalAlpha = S.alpha ?? 1; ctx.fillText(S.txt, Math.min(T.width - 120, x + 6), place(y + 3)); ctx.globalAlpha = 1; } } }
  // marqueurs
  for (const q of m.marques) { const x = xDeT(q.t), y = yDe(q.p); if (x == null || y == null || x < 0 || x > T.width) continue; ctx.fillStyle = q.col; ctx.strokeStyle = q.col; ctx.beginPath();
    if (q.forme === 'triangle') { const s = 5, d = q.haut ? -1 : 1; ctx.moveTo(x, y + d * 2); ctx.lineTo(x - s, y + d * 11); ctx.lineTo(x + s, y + d * 11); ctx.closePath(); ctx.fill(); } else { ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.fill(); }
    ctx.fillText(q.txt, Math.min(T.width - ctx.measureText(q.txt).width - 4, x + 8), y + (q.haut === false ? -10 : q.forme === 'triangle' ? 20 : -8)); }
  // bande delta + CVD (bas du graphique)
  if (m.delta) { const h = mobile ? 46 : 60, y0 = T.height - h - 4, mid = y0 + h * 0.72; ctx.fillStyle = 'rgba(8,12,16,.72)'; ctx.fillRect(0, y0, T.width - 60, h); const D = m.delta; const maxD = Math.max(1e-9, ...D.bars.map(b => Math.abs(b.d))); const vis = []; for (const b of D.bars) { const x = xDeT(b.t); if (x == null || x < 0 || x > T.width - 60) continue; vis.push([x, b]); }
    const demi = vis.length > 1 ? Math.max(1, Math.abs(vis[1][0] - vis[0][0]) * 0.35) : 3; for (const [x, b] of vis) { const hh = (Math.abs(b.d) / maxD) * (h * 0.3); ctx.fillStyle = b.d >= 0 ? 'rgba(79,209,139,.8)' : 'rgba(239,95,95,.8)'; ctx.fillRect(x - demi, b.d >= 0 ? mid - hh : mid, demi * 2, Math.max(1, hh)); }
    const cv = D.cvd.map(q => [xDeT(q.t), q.v]).filter(q => q[0] != null && q[0] >= 0 && q[0] <= T.width - 60); if (cv.length > 1) { const mn = Math.min(...cv.map(q => q[1])), mx = Math.max(...cv.map(q => q[1])), sp = mx - mn || 1; ctx.strokeStyle = '#7fd0ff'; ctx.lineWidth = 1.3; ctx.beginPath(); cv.forEach(([x, v], k) => { const y = y0 + 3 + (1 - (v - mn) / sp) * (h * 0.42); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); }
    ctx.fillStyle = '#7fd0ff'; ctx.fillText('CVD (ligne) · delta par bougie (barres), transactions Kraken en direct' + (D.depuis ? ' depuis ' + new Date(D.depuis).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''), 6, y0 + fs + 2); }
  // notes
  m.notes.forEach((t, k) => { ctx.fillStyle = 'rgba(8,12,16,.8)'; const w = ctx.measureText(t).width + 12; ctx.fillRect(6, 40 + k * (fs + 8), w, fs + 6); ctx.fillStyle = '#e0b25f'; ctx.fillText(t, 12, 40 + k * (fs + 8) + fs); });
}
