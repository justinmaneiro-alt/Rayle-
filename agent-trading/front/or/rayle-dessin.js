/* Dessin de la stratégie Rayle v1 : moyenne mobile et ses événements (phase 1), boîtes de retournement et ligne de retournement (phase 2), scénarios (phase 5).
   Fonction de dessin pure ; renvoie les cadres cliquables pour l'infobulle. Aucune étiquette ne chevauche une autre : celle qui gênerait est omise (le détail reste au survol).
   Jamais de rectangle pleine largeur : une boîte va de son début à 40 bougies à droite au plus, ou jusqu'à son invalidation. */
const COUL = { haut: '95,184,148', bas: '216,106,106', gris: '125,135,140', sable: '201,178,122', cyan: '143,208,227', violet: '195,155,224', bleu: '110,160,255', orange: '230,160,90' };
const nb = (p, d = 0) => Number(p).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
export function dessinerRayle(ctx, T, m, { xDeT, yDe, mobile }) {
  const cadres = []; if (!m) return cadres; const fs = mobile ? 9 : 10; ctx.font = `${fs}px system-ui, 'Segoe UI', sans-serif`; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 1;
  const ok = (...v) => v.every(q => q != null && Number.isFinite(q));
  const occ = [];   // rectangles de texte déjà posés
  const place = (txt, x, y, col, a = 0.95, { alignDroite = false } = {}) => {
    const w = ctx.measureText(txt).width + 2, x0 = alignDroite ? x - w : x, r = { x0: Math.max(2, Math.min(T.width - w - 66, x0)), y0: y - fs, w, h: fs + 2 };
    if (occ.some(q => r.x0 < q.x0 + q.w && r.x0 + r.w > q.x0 && r.y0 < q.y0 + q.h && r.y0 + r.h > q.y0)) return false;
    occ.push(r); ctx.fillStyle = `rgba(${col},${a})`; ctx.fillText(txt, r.x0, y); return r;
  };
  // ── moyenne mobile ──
  if (m.ma && m.ma.length > 1) {
    ctx.strokeStyle = `rgba(${COUL.cyan},.75)`; ctx.lineWidth = 1.25; ctx.beginPath(); let debut = true;
    for (const q of m.ma) { const x = xDeT(q.t), y = yDe(q.v); if (!ok(x, y) || x < -20 || x > T.width + 20) { debut = true; continue; } if (debut) { ctx.moveTo(x, y); debut = false; } else ctx.lineTo(x, y); }
    ctx.stroke(); ctx.lineWidth = 1;
    const der = m.ma[m.ma.length - 1], xd = xDeT(der.t), yd = yDe(der.v);
    if (ok(xd, yd)) { place(m.maNom || 'MA 200', Math.min(T.width - 70, xd + 6), yd - 4, COUL.cyan, 0.85); cadres.push({ kind: 'ma', x0: xd - 40, x1: xd + 40, y0: yd - 6, y1: yd + 6, g: { p: der.v, texte: `${m.maNom || 'MA 200'} · ${nb(der.v, 2)}`, detail: m.maDetail || [] } }); }
  }
  // ── boîtes de retournement : petites, bordure fine, une étiquette ──
  for (const b of m.boites || []) {
    const x0 = xDeT(b.tDebut), x1 = xDeT(b.tFin), y0 = yDe(b.haut), y1 = yDe(b.bas), ym = yDe(b.prix); if (!ok(x0, x1, y0, y1) || x1 < 0 || x0 > T.width) continue;
    const col = b.cote === 'vente' ? COUL.bas : COUL.haut, top = Math.min(y0, y1), h = Math.max(3, Math.abs(y1 - y0)), xa = Math.max(0, x0), xb = Math.min(T.width, x1), a = b.grise ? 0.35 : 1;
    ctx.fillStyle = `rgba(${col},${0.10 * a})`; ctx.fillRect(xa, top, Math.max(2, xb - xa), h);
    ctx.strokeStyle = `rgba(${col},${0.85 * a})`; ctx.setLineDash(b.grise ? [2, 3] : []); ctx.strokeRect(xa + 0.5, Math.round(top) + 0.5, Math.max(2, xb - xa), h); ctx.setLineDash([]);
    if (ok(ym)) { ctx.strokeStyle = `rgba(${col},${0.6 * a})`; ctx.beginPath(); ctx.moveTo(xa, Math.round(ym) + 0.5); ctx.lineTo(xb, Math.round(ym) + 0.5); ctx.stroke(); }
    if (b.etiquette) place(b.etiquette, xb + 4 > T.width - 70 ? xa + 3 : xb + 4, top + (b.cote === 'vente' ? -3 : h + fs + 1), col, 0.95);
    cadres.push({ kind: 'boite', x0: xa, x1: xb, y0: top - 2, y1: top + h + 2, g: { p: b.prix, texte: b.etiquette || 'Zone', detail: b.detail || [] } });
  }
  // ── ligne de retournement : une seule, au dernier creux (ou sommet) protégé ──
  const L = m.ligne; if (L) {
    const x0 = xDeT(L.tDebut), y = yDe(L.p); if (ok(x0, y) && y > -4 && y < T.height + 4) {
      const col = L.dir < 0 ? COUL.bas : COUL.haut; ctx.strokeStyle = `rgba(${col},.75)`; ctx.setLineDash([6, 3]); ctx.beginPath(); ctx.moveTo(Math.max(0, x0), Math.round(y) + 0.5); ctx.lineTo(T.width, Math.round(y) + 0.5); ctx.stroke(); ctx.setLineDash([]);
      place(L.texte, Math.max(4, x0) + 4, y + (L.dir < 0 ? fs + 2 : -4), col, 0.95); cadres.push({ kind: 'ligne', x0: Math.max(0, x0), x1: T.width, y0: y - 3, y1: y + 3, g: { p: L.p, texte: L.texte, detail: L.detail || [] } });
    }
  }
  // ── niveaux majeurs : fines bandes sur toute la largeur, UNE courte étiquette collée à droite (zone de l'axe, hors des bougies) ──
  const axe = [];
  for (const n of m.niveaux || []) {
    const yh = yDe(n.haut), yb = yDe(n.bas), ym = yDe(n.p); if (!ok(yh, yb, ym) || ym < 0 || ym > T.height) continue; const col = n.cote === 'haut' ? COUL.bas : COUL.haut, top = Math.min(yh, yb), h = Math.max(2, Math.abs(yb - yh));
    ctx.fillStyle = `rgba(${col},.10)`; ctx.fillRect(0, top, T.width, h); ctx.strokeStyle = `rgba(${col},.55)`; ctx.beginPath(); ctx.moveTo(0, Math.round(ym) + 0.5); ctx.lineTo(T.width, Math.round(ym) + 0.5); ctx.stroke();
    const w = ctx.measureText(n.etiquette).width + 6, r = { x0: T.width - w - 2, y0: ym - fs / 2 - 1, w, h: fs + 3 }; if (axe.some(q => r.x0 < q.x0 + q.w && r.x0 + r.w > q.x0 && r.y0 < q.y0 + q.h && r.y0 + r.h > q.y0)) continue; axe.push(r); occ.push(r);
    ctx.fillStyle = 'rgba(12,18,23,.85)'; ctx.fillRect(r.x0, r.y0, r.w, r.h); ctx.fillStyle = `rgba(${col},1)`; ctx.fillText(n.etiquette, r.x0 + 3, r.y0 + fs);
    cadres.push({ kind: 'niveau', x0: 0, x1: T.width, y0: top - 2, y1: top + h + 2, g: { p: n.p, texte: n.etiquette, detail: n.detail || [] } });
  }
  cadres.etiquettesAxe = axe;
  // ── annotations de Justin : Fibonacci, texte, mesure (locales, jamais envoyées) ──
  for (const a of m.annotations || []) {
    if (a.type === 'fib') {
      const x1 = xDeT(a.t1), x2 = xDeT(a.t2), xa = Math.min(x1, x2); if (!ok(x1, x2)) continue; const hi = Math.max(a.p1, a.p2), lo = Math.min(a.p1, a.p2); let dessine = false;
      for (const [f, op] of [[0, .5], [0.236, .35], [0.382, .45], [0.5, .5], [0.618, .9], [0.786, .9], [1, .5]]) { const p = a.p2 > a.p1 ? hi - (hi - lo) * f : lo + (hi - lo) * f, y = yDe(p); if (!ok(y) || y < 0 || y > T.height) continue; dessine = true; ctx.strokeStyle = `rgba(${COUL.sable},${op})`; ctx.setLineDash(f === 0.618 || f === 0.786 ? [] : [3, 3]); ctx.beginPath(); ctx.moveTo(Math.max(0, xa), Math.round(y) + 0.5); ctx.lineTo(T.width - 66, Math.round(y) + 0.5); ctx.stroke(); ctx.setLineDash([]); if (f === 0 || f === 0.618 || f === 0.786 || f === 1) place(`${(f * 100).toFixed(1).replace('.', ',')}`, Math.max(2, xa) + 2, y - 2, COUL.sable, 0.85); }
      if (dessine) cadres.push({ kind: 'annotation', x0: Math.max(0, xa), x1: T.width, y0: yDe(hi) - 3, y1: yDe(lo) + 3, g: { p: (hi + lo) / 2, texte: 'Fibonacci', detail: [`retracement de ${nb(a.p1, 2)} à ${nb(a.p2, 2)} : 23,6 · 38,2 · 50 · 61,8 · 78,6 %`, 'tracé de Justin, local à cet appareil'], id: a.id } });
    } else if (a.type === 'texte') { const x = xDeT(a.t), y = yDe(a.p); if (!ok(x, y) || x < 0 || x > T.width) continue; ctx.fillStyle = `rgba(${COUL.sable},.9)`; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 6.3); ctx.fill(); place(a.texte, x + 5, y - 4, COUL.sable, 0.95); cadres.push({ kind: 'annotation', x0: x - 4, x1: x + 80, y0: y - 14, y1: y + 6, g: { p: a.p, texte: a.texte, detail: ['note de Justin'], id: a.id } }); }
    else if (a.type === 'mesure') { const x1 = xDeT(a.t1), x2 = xDeT(a.t2), y1 = yDe(a.p1), y2 = yDe(a.p2); if (!ok(x1, x2, y1, y2)) continue; ctx.strokeStyle = `rgba(${COUL.cyan},.9)`; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]); place(a.libelle || '', Math.min(x1, x2) + 4, Math.min(y1, y2) - 4, COUL.cyan, 0.95); }
  }
  // ── 3 dernières cassures de structure (MSS / BOS), étiquettes courtes ──
  for (const c of m.structure || []) {
    const x0 = xDeT(c.tNiveau), x1 = xDeT(c.t), y = yDe(c.niveau); if (!ok(x0, x1, y) || x1 < 0 || x0 > T.width) continue; const col = c.type === 'MSS' ? COUL.violet : c.dir > 0 ? COUL.haut : COUL.bas;
    ctx.strokeStyle = `rgba(${col},.7)`; ctx.setLineDash(c.type === 'MSS' ? [] : [3, 3]); ctx.beginPath(); ctx.moveTo(Math.max(0, x0), Math.round(y) + 0.5); ctx.lineTo(x1, Math.round(y) + 0.5); ctx.stroke(); ctx.setLineDash([]);
    place(`${c.type} ${c.dir > 0 ? '↑' : '↓'}`, Math.max(2, x1 - 38), y - 3, col, 0.9, {});
    cadres.push({ kind: 'struct', x0: Math.max(0, x0), x1, y0: y - 3, y1: y + 3, g: { p: c.niveau, texte: `${c.type === 'MSS' ? 'Changement de caractère (MSS)' : 'Cassure de structure (BOS)'} ${c.dir > 0 ? 'haussier' : 'baissier'}`, detail: ['clôture H1 au-delà d’un creux ou d’un sommet de la structure H1 (structure-marche-v1)', 'description, jamais un ordre'] } });
  }
  // ── événements de la moyenne mobile ──
  for (const e of m.evenements || []) {
    if (e.type === 'rebond') continue;   // 2026-11-12 : plus de « Rebond sur la MA » (continuation) ; seules la cassure, la fausse cassure et le retest de la MA200 restent
    const x = xDeT(e.t), y = yDe(e.p); if (!ok(x, y) || x < 0 || x > T.width) continue; const col = e.type === 'fausse' ? COUL.orange : e.dir > 0 ? COUL.haut : COUL.bas, a = e.grise ? 0.35 : 1;
    ctx.fillStyle = `rgba(${col},${0.95 * a})`; ctx.beginPath();
    const s = e.type === 'rebond' ? 3.5 : 4.5, sens = e.dir > 0 ? -1 : 1;   // pointe vers le prix
    if (e.type === 'cassure' || e.type === 'confirmee') { ctx.moveTo(x, y); ctx.lineTo(x - s, y - sens * s * 1.6); ctx.lineTo(x + s, y - sens * s * 1.6); ctx.closePath(); ctx.fill(); }
    else if (e.type === 'fausse') { ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.strokeStyle = `rgba(${col},${0.95 * a})`; ctx.lineWidth = 1.6; ctx.stroke(); ctx.lineWidth = 1; }
    else { ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill(); }
    if (e.etiquette) place(e.etiquette, x + 7, y + (e.dir > 0 ? fs + 6 : -6), col, 0.95 * a);
    cadres.push({ kind: 'evt', x0: x - 8, x1: x + 8, y0: y - 10, y1: y + 10, g: { p: e.p, texte: e.etiquette || e.nom, detail: e.detail || [] } });
  }
  // ── flèches du setup A+ (petite flèche, jamais un ordre) ──
  for (const f of m.aplus || []) { const x = xDeT(f.t), y = yDe(f.p); if (!ok(x, y) || x < 0 || x > T.width) continue; const col = f.dir > 0 ? COUL.haut : COUL.bas, s = 6, yy = y + (f.dir > 0 ? 10 : -10); ctx.fillStyle = `rgba(${col},.95)`; ctx.beginPath(); ctx.moveTo(x, yy + (f.dir > 0 ? -s : s)); ctx.lineTo(x - s * 0.8, yy + (f.dir > 0 ? s * 0.6 : -s * 0.6)); ctx.lineTo(x + s * 0.8, yy + (f.dir > 0 ? s * 0.6 : -s * 0.6)); ctx.closePath(); ctx.fill(); place('A+', x + 6, yy + (f.dir > 0 ? 14 : -6), col, 0.95); cadres.push({ kind: 'aplus', x0: x - 9, x1: x + 20, y0: yy - 10, y1: yy + 14, g: { p: f.p, texte: 'Setup A+ (règle non prouvée)', detail: ['cinq conditions réunies à la clôture de cette bougie H1 (aplus-v1)', 'proposition de lecture, jamais un ordre'] } }); }
  // ── scénarios (phase 5) ──
  if (m.scenarios) dessinerScenarios(ctx, T, m.scenarios, { xDeT, yDe, mobile, place, cadres, ok, fs });
  cadres.etiquettes = occ.slice();   // rectangles des étiquettes posées (test de non-chevauchement)
  return cadres;
}
/* cône de volatilité, trajets pointillés avec flèche d'arrivée, étiquettes ; l'archive du tracé précédent est pâle */
function dessinerScenarios(ctx, T, S, { xDeT, yDe, place, cadres, ok, fs }) {
  const cone = S.cone;
  if (cone && cone.length > 1) {
    for (const [cle, a] of [['p80', 0.07], ['p50', 0.12]]) {
      ctx.fillStyle = `rgba(${COUL.violet},${a})`; ctx.beginPath(); let debut = true;
      for (const q of cone) { const x = xDeT(q.t), y = yDe(q[cle + 'h']); if (!ok(x, y)) continue; if (debut) { ctx.moveTo(x, y); debut = false; } else ctx.lineTo(x, y); }
      for (let k = cone.length - 1; k >= 0; k--) { const q = cone[k], x = xDeT(q.t), y = yDe(q[cle + 'b']); if (ok(x, y)) ctx.lineTo(x, y); }
      ctx.closePath(); ctx.fill();
    }
  }
  const trace = (sc, pale) => {
    if (!sc || !sc.points || sc.points.length < 2) return; const col = sc.couleur === 'B' ? COUL.orange : COUL.bleu, a = pale ? 0.25 : 0.95;
    ctx.strokeStyle = `rgba(${col},${a})`; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]); ctx.beginPath(); let prev = null;
    for (const q of sc.points) { const x = xDeT(q.t), y = yDe(q.p); if (!ok(x, y)) { prev = null; continue; } if (!prev) ctx.moveTo(x, y); else ctx.lineTo(x, y); prev = [x, y]; }
    ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
    const pts = sc.points.map(q => [xDeT(q.t), yDe(q.p)]).filter(q => ok(q[0], q[1])); if (pts.length >= 2) {
      const [x1, y1] = pts[pts.length - 1], [x0, y0] = pts[pts.length - 2], ang = Math.atan2(y1 - y0, x1 - x0); ctx.fillStyle = `rgba(${col},${a})`; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 7 * Math.cos(ang - 0.4), y1 - 7 * Math.sin(ang - 0.4)); ctx.lineTo(x1 - 7 * Math.cos(ang + 0.4), y1 - 7 * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fill();
      const [xa, ya] = pts[0]; if (sc.etiquette && !pale) { place(sc.etiquette, Math.max(xa + 6, 4), Math.min(y1, ya) - 6 - (sc.couleur === 'B' ? 0 : 0), col, 0.95); if (sc.condition) place(sc.condition, Math.max(xa + 6, 4), Math.max(y1, ya) + fs + 8 + (sc.couleur === 'B' ? fs + 2 : 0), col, 0.7); }
      cadres.push({ kind: 'scenario', x0: Math.min(...pts.map(q => q[0])) - 4, x1: Math.max(...pts.map(q => q[0])) + 4, y0: Math.min(...pts.map(q => q[1])) - 6, y1: Math.max(...pts.map(q => q[1])) + 6, g: { p: sc.points[sc.points.length - 1].p, texte: sc.etiquette || 'Scénario', detail: sc.detail || [] } });
    }
  };
  for (const a of S.archives || []) trace(a, true);
  for (const sc of S.actifs || []) trace(sc, false);
}
