/* Dessin de l'ICT (ict-v2 + ict-objets) sur UNE seule unité : zones rectangulaires NOMMÉES, lignes de liquidité nommées, cassures de structure, Fibonacci premium / discount, killzones, scénario, pastilles de l'axe.
   RIEN SANS NOM : chaque objet est écrit sur une pastille sombre (13 px PC, 12 px tablette, 11 px téléphone, jamais moins) ; aucune étiquette ne chevauche une autre ni les dernières bougies (placerEtiquettes) ;
   une étiquette sans place est « repliée » dans l'infobulle. Aucune flèche d'achat ou de vente : le scénario est une courbe en pointillé. Fonction de dessin pure ; renvoie les zones cliquables. */
import { placerEtiquettes, taillePolice } from './ict-etiquettes.js';
export const COUL = Object.freeze({ haut: '38,166,154', bas: '239,83,80', liquidite: '230,233,238', prise: '154,164,174', sweep: '255,209,102', fib: '169,180,192', kz: '143,208,227', sable: '201,178,122', gris: '154,164,174', dore: '255,209,102', texte: '232,238,242' });
const nb = (p, d = 2) => Number(p).toLocaleString('fr-FR', { maximumFractionDigits: d }).replace(/[  ]/g, ' ');

export function dessinerIct(ctx, T, m, { xDeT, yDe, ecran = (typeof window !== 'undefined' ? window.innerWidth : 1200), barres = [] }) {
  const cadres = []; if (!m || !m.objets) return cadres;
  const fs = taillePolice(ecran), LH = fs + 4, droite = Math.max(40, T.width - 4), ok = (...v) => v.every(q => q != null && Number.isFinite(q));
  const F = (gras = false) => `${gras ? 'bold ' : ''}${fs}px system-ui, 'Segoe UI', sans-serif`; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 1; ctx.setLineDash([]);
  const mesure = (t, gras) => { ctx.font = F(gras); return ctx.measureText(t).width; };
  const etiq = [];   // étiquettes à placer
  const demander = (id, lignes, x, y, prio, opt = {}) => { const w = Math.max(...lignes.map(l => mesure(l.t, l.gras))) + 10, h = lignes.length * LH + 4; etiq.push({ id, w, h, x: opt.centre ? x - w / 2 : opt.droite ? x - w : x, y, prio, lignes, col: opt.col, o: opt.o }); };
  const xs = (t, defaut = 0) => { const x = ok(t) ? xDeT(t) : null; return x == null || !Number.isFinite(x) ? defaut : x; };
  // interdit : les dernières bougies (étiquettes jamais par-dessus) ; pastilles de l'axe
  const interdits = [{ x: Math.max(0, T.width - 100), y: 0, w: 100, h: 54 }];   // boutons Log / Auto du graphique
   if (barres.length > 4) { const L = barres.slice(-12), x0 = xDeT(L[0].t), x1 = xDeT(L[L.length - 1].t); let hmax = -Infinity, lmin = Infinity; for (const b of L) { hmax = Math.max(hmax, b.h); lmin = Math.min(lmin, b.l); } const y0 = yDe(hmax), y1 = yDe(lmin); if (ok(x0, x1, y0, y1)) interdits.push({ x: x0 - 2, y: Math.min(y0, y1) - 2, w: x1 - x0 + 8, h: Math.abs(y1 - y0) + 4 }); }
  const objs = m.objets, ordreZ = o => ({ range: 0, bande: 0, zone: 1, fib: 2, ligne: 3, segment: 4, etiquette: 5, scenario: 6 }[o.kind] ?? 3), liste = [...objs].sort((a, b) => ordreZ(a) - ordreZ(b));
  const reg = (o, x0, x1, y0, y1) => cadres.push({ kind: o.kind, famille: o.famille, x0, x1, y0, y1, objet: o, g: { p: o.p ?? ((o.bas + o.haut) / 2), texte: o.nom, detail: [...(o.statut ? ['statut : ' + o.statut] : []), ...(o.pourquoi || [])] } });
  const colDir = d => (d > 0 ? COUL.haut : d < 0 ? COUL.bas : COUL.fib);
  // bandes de killzones : en bas du graphique (fond très léger sur toute la hauteur)
  const hBande = LH + 2;
  for (const o of liste.filter(o => o.kind === 'bande')) { const x0 = xs(o.debut, -1e4), x1 = xs(o.fin, -1e4); if (x1 < 0 || x0 > T.width) continue; const a = Math.max(0, x0), b = Math.min(T.width, x1), y = T.height - hBande;
    ctx.fillStyle = `rgba(${COUL.kz},${o.sb ? 0.05 : 0.035})`; ctx.fillRect(a, 0, Math.max(1, b - a), T.height); ctx.fillStyle = `rgba(${COUL.kz},${o.sb ? 0.32 : 0.2})`; ctx.fillRect(a, y, Math.max(1, b - a), hBande);
    const w = mesure(o.nom, true); if (b - a > w + 8) { ctx.font = F(true); ctx.fillStyle = `rgba(${COUL.texte},.95)`; ctx.fillText(o.nom, a + (b - a - w) / 2, T.height - 6); } reg(o, a, b, y, T.height); }
  for (const o of liste) {
    if (o.kind === 'zone' || o.kind === 'range') {
      const yh = yDe(o.haut), yb = yDe(o.bas); const x0r = xs(o.tDebut, 0), x0 = Math.max(0, x0r), x1 = o.kind === 'range' && o.tFin != null ? Math.min(droite, xs(o.tFin, droite)) : droite; if (!ok(yh, yb) || x1 <= x0 || Math.max(yh, yb) < -4 || Math.min(yh, yb) > T.height + 4) continue;
      const top = Math.min(yh, yb), h = Math.max(3, Math.abs(yb - yh)), col = o.kind === 'range' ? COUL.gris : o.gris ? COUL.gris : o.dore ? COUL.dore : o.dir === 0 ? COUL.fib : colDir(o.dir);
      ctx.fillStyle = `rgba(${col},${o.kind === 'range' ? 0.08 : o.fort ? 0.22 : 0.16})`; ctx.fillRect(x0, top, x1 - x0, h);
      ctx.strokeStyle = `rgba(${col},${o.dore ? 1 : 0.75})`; ctx.lineWidth = o.dore ? 2 : 1; ctx.setLineDash(o.pointille || o.kind === 'range' ? [5, 3] : []); ctx.strokeRect(x0 + 0.5, top + 0.5, x1 - x0 - 1, h - 1); ctx.setLineDash([]); ctx.lineWidth = 1;
      for (const [p, dash] of [[o.ce, true], [o.mt, true]]) if (ok(p)) { const y = yDe(p); if (ok(y)) { ctx.strokeStyle = `rgba(${col},.55)`; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(x0, Math.round(y) + 0.5); ctx.lineTo(x1, Math.round(y) + 0.5); ctx.stroke(); ctx.setLineDash([]); } void dash; }
      const L = [{ t: o.nom, gras: true }]; if (o.detail) L.push({ t: o.detail, gras: false });
      if (o.kind === 'range') demander(o.id, L.slice(0, 1), x0 + 4, top - LH - 4, 30, { col, o }); else demander(o.id, L, x1 - 6, top + 3, o.prio || 50, { droite: true, col, o });
      reg(o, x0, x1, top, top + h); continue; }
    if (o.kind === 'fib') {
      const x0 = Math.max(0, xs(o.tDebut, 0)), niv = o.niveaux, yOte0 = yDe(niv.find(n => n.k === 0.618).p), yOte1 = yDe(niv.find(n => n.k === 0.786).p);
      if (ok(yOte0, yOte1)) { ctx.fillStyle = `rgba(${COUL.fib},.07)`; ctx.fillRect(x0, Math.min(yOte0, yOte1), droite - x0, Math.abs(yOte1 - yOte0)); }
      for (const n of niv) { const y = yDe(n.p); if (!ok(y) || y < -4 || y > T.height + 4) continue; ctx.strokeStyle = `rgba(${COUL.fib},${n.k === 0.5 ? 0.85 : 0.6})`; ctx.setLineDash(n.k === 0.5 ? [6, 4] : []); ctx.beginPath(); ctx.moveTo(x0, Math.round(y) + 0.5); ctx.lineTo(droite, Math.round(y) + 0.5); ctx.stroke(); ctx.setLineDash([]);
        demander(o.id + '|' + n.k, [{ t: n.nom, gras: n.k === 0.5 || n.k === 0.705 }], droite - 6, y - LH / 2 - 1, n.k === 0.5 ? 66 : 40, { droite: true, col: COUL.fib, o }); }
      const yEq = yDe(niv.find(n => n.k === 0.5).p); if (ok(yEq)) { demander(o.id + '|prem', [{ t: 'Premium ↑', gras: true }], droite - 6, yEq - 2 * LH - 6, 45, { droite: true, col: COUL.fib, o }); demander(o.id + '|disc', [{ t: 'Discount ↓', gras: true }], droite - 6, yEq + LH / 2 + 4, 45, { droite: true, col: COUL.fib, o }); }
      const ys = niv.map(n => yDe(n.p)).filter(ok); if (ys.length) reg(o, x0, droite, Math.min(...ys) - 3, Math.max(...ys) + 3); continue; }
    if (o.kind === 'ligne') {
      const y = yDe(o.p); if (!ok(y) || y < -4 || y > T.height + 4) continue; const x0 = Math.max(0, xs(o.tDebut, 0)), yy = Math.round(y) + 0.5;
      const col = o.prise ? COUL.prise : o.sable ? COUL.sable : o.cote === 'EQ' ? COUL.sable : o.projection ? COUL.fib : COUL.liquidite;
      ctx.strokeStyle = `rgba(${col},${o.prise ? 0.8 : o.projection ? 0.7 : 0.95})`; ctx.lineWidth = o.prise ? 1 : 1.6; ctx.setLineDash(o.prise || o.projection || o.sable ? [5, 4] : []); ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(droite, yy); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
      demander(o.id, [{ t: o.nom, gras: true }], droite - 6, y - LH - 3, o.prio || 40, { droite: true, col, o });
      if (o.sweep) { const sx = xs(o.sweep.t, null), sy = yDe(o.sweep.p); if (ok(sx, sy)) { ctx.strokeStyle = `rgb(${COUL.sweep})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx - 5, sy - 5); ctx.lineTo(sx + 5, sy + 5); ctx.moveTo(sx + 5, sy - 5); ctx.lineTo(sx - 5, sy + 5); ctx.stroke(); ctx.lineWidth = 1; demander(o.id + '|sweep', [{ t: 'sweep', gras: true }], sx + 8, sy - (o.cote === 'BSL' ? LH + 4 : -4), 35, { col: COUL.sweep, o }); } }
      if (o.pivots) for (const t of o.pivots) { const px2 = xs(t, null); if (ok(px2)) demander(o.id + '|' + t, [{ t: o.nom.includes('EQH') ? 'EQH' : 'EQL', gras: true }], px2, y + (o.cote === 'BSL' ? -LH - 6 : 6), 20, { centre: true, col, o }); }
      reg(o, x0, T.width, y - 5, y + 5); continue; }
    if (o.kind === 'segment') {
      const x0 = xs(o.tNiveau, null), x1 = xs(o.t, null), y = yDe(o.p); if (!ok(x0, x1, y) || x1 < 0 || x0 > T.width) continue; const col = colDir(o.dir), yy = Math.round(y) + 0.5;
      ctx.strokeStyle = `rgba(${col},.95)`; ctx.lineWidth = 1.6; ctx.setLineDash(o.mss ? [4, 3] : []); ctx.beginPath(); ctx.moveTo(Math.max(0, x0), yy); ctx.lineTo(x1, yy); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
      demander(o.id, [{ t: o.nom, gras: true }], (Math.max(0, x0) + x1) / 2, o.dir > 0 ? y - LH - 3 : y + 3, o.prio || 70, { centre: true, col, o }); reg(o, Math.max(0, x0), x1, y - 5, y + 5); continue; }
    if (o.kind === 'etiquette') {
      const x = xs(o.t, null), y = yDe(o.p); if (!ok(x, y) || x < -10 || x > T.width) continue; demander(o.id, [{ t: o.nom, gras: true }], x, o.haut ? y - LH - 3 : y + 3, o.prio || 30, { centre: true, col: COUL.liquidite, o }); reg(o, x - 12, x + 12, y - LH - 4, y + LH + 4); continue; }
    if (o.kind === 'scenario') {
      const n = barres.length, last = barres[n - 1], prev = barres[n - 2]; if (!last || !prev) continue; const xL = xDeT(last.t), pas = xL - xDeT(prev.t), yS = yDe(last.c), libre = droite - xL; if (!ok(xL, yS, pas) || libre < 90) continue;
      const yZ = yDe((o.zone.bas + o.zone.haut) / 2), yC = yDe(o.cible.p); if (!ok(yZ, yC)) continue; const xV = xL + libre * 0.4, xC = xL + libre * 0.82;
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(xL + 4, yS); ctx.quadraticCurveTo(xL + libre * 0.18, yZ, xV, yZ); ctx.quadraticCurveTo(xV + libre * 0.22, yZ, xC, yC); ctx.stroke(); ctx.setLineDash([]);
      const a = Math.atan2(yC - yZ, xC - (xV + libre * 0.22)); ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.moveTo(xC, yC); ctx.lineTo(xC - 9 * Math.cos(a - 0.4), yC - 9 * Math.sin(a - 0.4)); ctx.lineTo(xC - 9 * Math.cos(a + 0.4), yC - 9 * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1;
      demander(o.id, [{ t: o.nom, gras: true }, { t: o.detail, gras: false }], xL + libre * 0.5, Math.min(yC, yZ) - 2 * LH - 12, 62, { centre: true, col: COUL.texte, o }); reg(o, xL, droite, Math.min(yC, yZ) - 8, Math.max(yC, yZ) + 8); }
  }
  // pastilles de l'axe des prix : la BSL et la SSL visées (fixes, jamais déplacées)
  for (const q of m.pastilles || []) { const y = yDe(q.p); if (!ok(y) || y < 0 || y > T.height) continue; ctx.font = F(true); const w = ctx.measureText(q.texte).width + 12, h = LH + 2, x = T.width - w; ctx.fillStyle = 'rgba(236,240,244,.96)'; ctx.fillRect(x, y - h / 2, w, h); ctx.fillStyle = '#10151a'; ctx.fillText(q.texte, x + 6, y + fs / 2 - 1); interdits.push({ x, y: y - h / 2, w, h }); cadres.push({ kind: 'pastille', x0: x, x1: T.width, y0: y - h / 2, y1: y + h / 2, objet: null, g: { p: q.p, texte: q.texte, detail: ['liquidité visée côté ' + (q.cote === 'BSL' ? 'acheteur (au-dessus)' : 'vendeur (en dessous)')] } }); }
  // placement des étiquettes : aucune ne chevauche une autre, ni les dernières bougies, ni les pastilles ; sinon elle est repliée dans l'infobulle
  const place = placerEtiquettes(etiq.map(e => ({ id: e.id, x: e.x, y: e.y, w: e.w, h: e.h, prio: e.prio })), { largeur: T.width, hauteur: T.height - hBande, interdits });
  place.forEach((pl, k) => { const e = etiq[k]; if (pl.replie) return; ctx.fillStyle = 'rgba(10,14,18,.86)'; ctx.fillRect(pl.x, pl.y, e.w, e.h);
    e.lignes.forEach((l, i) => { ctx.font = F(l.gras); ctx.fillStyle = `rgba(${i === 0 ? (e.col || COUL.texte) : COUL.texte},${i === 0 ? 1 : 0.85})`; ctx.fillText(l.t, pl.x + 5, pl.y + (i + 1) * LH - 2); }); });
  cadres.etiquettes = place; cadres.etiquettesDemandees = etiq.length;
  return cadres;
}
void nb;
