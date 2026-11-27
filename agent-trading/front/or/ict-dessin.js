/* Dessin de l'ICT ÉPURÉ (ict-v2 + ict-objets) sur UNE seule unité : zones, lignes de liquidité, cassures, équilibre, killzones, scénario, nommés par de PETITS CARRÉS.
   Un petit carré plein par objet (vert = haussier, rouge = baissier, blanc = liquidité à prendre, contour gris = pris ou Fibonacci), UNE ligne de 14 caractères au plus, 12 px (11 px sur téléphone), en gras.
   Le carré est DANS la zone ou AU BOUT de la ligne, glisse le long de son objet mais ne s'en éloigne jamais verticalement, ne recouvre jamais une bougie ni un autre carré ; sans place, il n'est pas dessiné (le nom apparaît au toucher).
   RIEN jusqu'au bord : un objet ouvert s'arrête 3 bougies après la dernière ; une zone remplie à la bougie qui l'a remplie ; une liquidité prise à la bougie du sweep (✕ jaune).
   Fonction de dessin pure ; renvoie les zones cliquables. Aucune flèche d'achat ou de vente : le scénario est une flèche en pointillé. */
import { taillePoliceCarre, rectsBougies, placerCarres, candidatsZone, candidatsLigne, candidatsSegment } from './ict-carres.js';
export const COUL = Object.freeze({ haut: '38,166,154', bas: '239,83,80', liquidite: '240,243,247', prise: '154,164,174', sweep: '255,209,102', fib: '169,180,192', kz: '143,208,227', gris: '154,164,174', dore: '255,209,102', texte: '232,238,242' });
export const EPAIS = Object.freeze({ fort: 2.4, normal: 1.4, pris: 1 });
export const BOUGIES_APRES = 3;   // un objet ouvert s'arrête 3 bougies après la dernière bougie

export function dessinerIct(ctx, T, m, { xDeT, yDe, ecran = (typeof window !== 'undefined' ? window.innerWidth : 1200), barres = [], reserve = null } = {}) {
  const telephone = ecran < 700, scenarioCarres = [];
  const cadres = []; cadres.carres = []; cadres.demandes = 0; if (!m || !m.objets || barres.length < 3) return cadres;
  const fs = taillePoliceCarre(ecran), SQ = fs + 6, ok = (...v) => v.every(q => q != null && Number.isFinite(q));
  const F = (gras = false) => `${gras ? 'bold ' : ''}${fs}px system-ui, 'Segoe UI', sans-serif`; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 1; ctx.setLineDash([]);
  const mesure = (t, gras = true) => { ctx.font = F(gras); return ctx.measureText(t).width; };
  const dern = barres[barres.length - 1], av = barres[barres.length - 2], xL = xDeT(dern.t), pas = Math.max(2, xL - xDeT(av.t)), xFin = Math.min(T.width - 2, xL + BOUGIES_APRES * pas);
  const xs = (t, defaut = 0) => { const x = ok(t) ? xDeT(t) : null; return x == null || !Number.isFinite(x) ? defaut : x; };
  const colDir = d => (d > 0 ? COUL.haut : d < 0 ? COUL.bas : COUL.fib);
  const dansY = (y0, y1) => !(Math.max(y0, y1) < -4 || Math.min(y0, y1) > T.height + 4);
  /* obstacles : les bougies (corps et mèches), les boutons Log / Auto du graphique et la zone du badge */
  const visibles = barres.filter(b => { const x = xDeT(b.t); return x != null && x > -pas && x < T.width + pas; });
  const obstacles = rectsBougies(visibles, xDeT, yDe, pas); obstacles.push({ x: Math.max(0, T.width - 100), y: 0, w: 100, h: 54 }); if (reserve) obstacles.push({ x: 0, y: 0, w: Math.min(T.width, reserve.w), h: reserve.h });
  const objs = m.objets, ordreZ = o => ({ range: 0, bande: 0, zone: 1, fib: 2, ligne: 3, segment: 4, etiquette: 5, scenario: 6 }[o.kind] ?? 3), liste = [...objs].sort((a, b) => ordreZ(a) - ordreZ(b));
  const reg = (o, x0, x1, y0, y1, extra = {}) => cadres.push({ kind: o.kind, famille: o.famille, x0, x1, y0, y1, objet: o, g: { p: o.p ?? ((o.bas + o.haut) / 2), texte: o.nom, detail: [...(o.statut ? ['statut : ' + o.statut] : []), ...(o.pourquoi || [])] }, ...extra });
  const carres = [];   // carrés à placer
  const demander = (id, o, texte, style, cands, prio, zone) => { const w = mesure(texte) + 10; carres.push({ id, o, texte, style, w, h: SQ, prio: prio ?? o.prio ?? 50, cands, zone }); };
  const wCand = texte => mesure(texte) + 10;

  /* bande de killzones : en bas du graphique (M15 et H1, Complet seulement), noms courts */
  const hBande = SQ; let dernierX = -1e9;   // le nom d'une bande est centré sur elle, même si elle est étroite, tant qu'il ne chevauche pas le nom précédent
  for (const o of liste.filter(o => o.kind === 'bande')) for (const k of o.bandes) { const x0 = xs(k.debut, -1e4), x1 = Math.min(xFin, xs(k.fin, -1e4)); if (x1 < 0 || x0 > T.width) continue; const a = Math.max(0, x0), b = Math.min(T.width, x1), y = T.height - hBande;
    ctx.fillStyle = `rgba(${COUL.kz},.035)`; ctx.fillRect(a, 0, Math.max(1, b - a), T.height); ctx.fillStyle = `rgba(${COUL.kz},.24)`; ctx.fillRect(a, y, Math.max(1, b - a), hBande);
    const w = mesure(k.nom), xT = a + (b - a - w) / 2; if (xT > dernierX + 4 && xT >= 0 && xT + w <= T.width) { ctx.font = F(true); ctx.fillStyle = `rgba(${COUL.texte},.95)`; ctx.fillText(k.nom, xT, T.height - 6); dernierX = xT + w; } reg(o, a, b, y, T.height); }

  for (const o of liste) {
    if (o.kind === 'zone' || o.kind === 'range') {
      const yh = yDe(o.haut), yb = yDe(o.bas); if (!ok(yh, yb) || !dansY(yh, yb)) continue;
      const x0 = Math.max(0, xs(o.tDebut, 0)), x1 = o.tFin != null ? Math.min(xFin, xs(o.tFin, xFin)) : xFin; if (x1 <= x0 + 2 || x1 < 0) continue;
      const top = Math.min(yh, yb), h = Math.max(3, Math.abs(yb - yh)), rempli = o.etat === 'rempli', col = o.kind === 'range' || o.gris || o.dir === 0 ? COUL.gris : o.dore ? COUL.dore : colDir(o.dir);
      ctx.fillStyle = `rgba(${col},${rempli ? 0.06 : o.kind === 'range' ? 0.07 : o.fort ? 0.22 : 0.15})`; ctx.fillRect(x0, top, x1 - x0, h);
      ctx.strokeStyle = `rgba(${col},${rempli ? 0.4 : o.dore ? 1 : 0.75})`; ctx.lineWidth = o.fort ? 1.8 : 1; ctx.setLineDash(o.pointille || rempli || o.kind === 'range' ? [5, 3] : []); ctx.strokeRect(x0 + 0.5, top + 0.5, x1 - x0 - 1, h - 1); ctx.setLineDash([]); ctx.lineWidth = 1;
      reg(o, x0, x1, top, top + h);
      if (o.court) demander(o.id, o, o.court, o.style, candidatsZone({ x0, x1, yHaut: top, yBas: top + h }, wCand(o.court), SQ), o.prio, { x0, x1, y0: top, y1: top + h });
      continue; }
    if (o.kind === 'fib') {
      const yEq = yDe(o.eq); if (!ok(yEq) || yEq < -4 || yEq > T.height + 4) continue; const xa = Math.max(0, xs(o.tDebut, 0), xL - 10 * pas), x1 = xFin; if (x1 <= xa + 4) continue;
      if (o.ote && !o.oteFusion && ok(yDe(o.ote.bas), yDe(o.ote.haut))) { const t1 = Math.min(yDe(o.ote.bas), yDe(o.ote.haut)), t2 = Math.max(yDe(o.ote.bas), yDe(o.ote.haut)); ctx.fillStyle = `rgba(${COUL.fib},.09)`; ctx.fillRect(xa, t1, x1 - xa, Math.max(3, t2 - t1)); ctx.strokeStyle = `rgba(${COUL.fib},.5)`; ctx.setLineDash([4, 3]); ctx.strokeRect(xa + 0.5, t1 + 0.5, x1 - xa - 1, Math.max(3, t2 - t1) - 1); ctx.setLineDash([]);
        demander(o.id + '|ote', o, 'OTE', 'gris', candidatsZone({ x0: xa, x1, yHaut: t1, yBas: t2 }, wCand('OTE'), SQ), 40, { x0: xa, x1, y0: t1, y1: t2 }); }
      ctx.strokeStyle = `rgba(${COUL.fib},.9)`; ctx.lineWidth = EPAIS.normal; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(xa, Math.round(yEq) + 0.5); ctx.lineTo(x1, Math.round(yEq) + 0.5); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
      demander(o.id, o, o.court, 'gris', candidatsLigne({ x0: xa, x1, y: yEq }, wCand(o.court), SQ), o.prio, { x0: xa, x1, y0: yEq - 4, y1: yEq + 4 });
      if (o.complet) { demander(o.id + '|prem', o, 'Premium', 'gris', candidatsLigne({ x0: xa, x1, y: yEq - SQ - 3 }, wCand('Premium'), SQ), 38, { x0: xa, x1, y0: yEq - SQ - 4, y1: yEq }); demander(o.id + '|disc', o, 'Discount', 'gris', candidatsLigne({ x0: xa, x1, y: yEq + SQ + 3 }, wCand('Discount'), SQ), 38, { x0: xa, x1, y0: yEq, y1: yEq + SQ + 4 }); }
      reg(o, xa, x1, yEq - 5, yEq + 5); continue; }
    if (o.kind === 'ligne') {
      const y = yDe(o.p); if (!ok(y) || y < -4 || y > T.height + 4) continue; const x0 = Math.max(0, xs(o.tDebut, 0)), x1 = o.etat === 'pris' && o.tFin != null ? Math.min(xFin, xs(o.tFin, xFin)) : xFin; if (x1 <= x0 + 2 || x1 < 0) continue; const yy = Math.round(y) + 0.5, pris = o.etat === 'pris';
      ctx.strokeStyle = pris ? `rgba(${COUL.prise},.85)` : `rgba(${COUL.liquidite},${o.epais === 'fort' ? 1 : 0.9})`; ctx.lineWidth = EPAIS[o.epais] || EPAIS.normal; ctx.setLineDash(pris ? [4, 4] : []); ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
      if (o.sweep) { const sx = xs(o.sweep.t, null), sy = yDe(o.sweep.p); if (ok(sx, sy)) { ctx.strokeStyle = `rgb(${COUL.sweep})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx - 5, sy - 5); ctx.lineTo(sx + 5, sy + 5); ctx.moveTo(sx + 5, sy - 5); ctx.lineTo(sx - 5, sy + 5); ctx.stroke(); ctx.lineWidth = 1; cadres.push({ kind: 'sweep', famille: o.famille, x0: sx - 8, x1: sx + 8, y0: sy - 8, y1: sy + 8, objet: o, g: { p: o.p, texte: o.nom, detail: ['statut : ' + o.statut, ...(o.pourquoi || [])] } }); } }
      reg(o, x0, x1, y - 6, y + 6);
      demander(o.id, o, o.court, o.style, candidatsLigne({ x0, x1, y }, wCand(o.court), SQ), o.prio, { x0, x1, y0: y - 4, y1: y + 4 }); continue; }
    if (o.kind === 'segment') {
      const x0 = Math.max(0, xs(o.tNiveau, 0)), x1 = xs(o.t, null), y = yDe(o.p); if (!ok(x1, y) || x1 < 0 || x1 <= x0 + 2 || y < -4 || y > T.height + 4) continue; const col = colDir(o.dir), yy = Math.round(y) + 0.5;
      ctx.strokeStyle = `rgba(${col},.95)`; ctx.lineWidth = EPAIS.normal; ctx.setLineDash(o.mss ? [5, 3] : []); ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
      reg(o, x0, x1, y - 6, y + 6); demander(o.id, o, o.court, o.style, candidatsSegment({ x0, x1, y }, wCand(o.court), SQ), o.prio, { x0, x1, y0: y - 4, y1: y + 4 }); continue; }
    if (o.kind === 'etiquette') {   // HH / HL / LH / LL / ITH / ITL : petit texte gris, sans fond, au bout de la mèche
      const x = xs(o.t, null), y = yDe(o.p); if (!ok(x, y) || x < 0 || x > T.width || y < 0 || y > T.height) continue; const w = mesure(o.court, false) + 4, h = fs + 2, yT = o.haut ? y - h - 3 : y + 3, C = [];
      for (const d of [0, 1, -1, 2, -2, 3, -3]) C.push({ x: x - w / 2 + d * pas, y: yT }); carres.push({ id: o.id, o, texte: o.court, style: 'texte', w, h, prio: o.prio, cands: C, zone: { x0: x - 4, x1: x + 4, y0: yT, y1: yT + h } }); reg(o, x - 12, x + 12, yT, yT + h); continue; }
    if (o.kind === 'scenario') {   // A et B : une courbe en pointillé qui va dans la zone de réaction, y rebondit (ou y est rejetée) et finit par une pointe de flèche sur la liquidité visée, dans la marge à droite
      if (telephone && o.lettre !== 'A') continue;
      const libre = T.width - xL, yS = yDe(dern.c); if (!ok(xL, yS) || libre < 60 || !o.zone || !o.cible) continue;
      const yH = yDe(o.zone.haut), yB = yDe(o.zone.bas), yT0 = yDe(o.cible.p); if (!ok(yH, yB, yT0)) continue;
      const w = mesure(o.court) + 10, haut = Math.min(yH, yB), hz = Math.max(8, Math.abs(yB - yH)), yE = o.sens > 0 ? haut + 0.45 * hz : haut + hz - 0.45 * hz;   // on entre dans la zone par son bord proche du prix
      const xC = Math.min(xL + libre * (o.lettre === 'A' ? 0.8 : 0.86), Math.max(xL + 30, T.width - w - 14)), yC = Math.max(10, Math.min(T.height - hBande - 10, yT0)), xV = xL + Math.min(libre * 0.3, Math.max(libre * 0.12, 3 * pas + 6)), dx1 = xV - (xL + 4), dx2 = xC - xV;
      if (!(dx1 > 6) || !(dx2 > 10)) continue;
      const P0 = [xL + 4, yS], C1 = [xL + 4 + dx1 * 0.45, yS], C2 = [xV - dx1 * 0.4, yE], V = [xV, yE], C3 = [xV + dx2 * 0.4, yE], C4 = [xC - dx2 * 0.45, yC], Pf = [xC, yC];
      const principal = o.lettre === 'A' && !o.gris, col = principal ? '255,255,255' : COUL.gris;
      ctx.strokeStyle = `rgba(${col},${principal ? 0.95 : 0.9})`; ctx.lineWidth = principal ? 2 : 1.6; ctx.setLineDash(principal ? [6, 4] : [3, 4]); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.bezierCurveTo(C1[0], C1[1], C2[0], C2[1], V[0], V[1]); ctx.bezierCurveTo(C3[0], C3[1], C4[0], C4[1], Pf[0], Pf[1]); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt';
      const an = Math.atan2(Pf[1] - C4[1], Pf[0] - C4[0]); ctx.fillStyle = `rgba(${col},.97)`; ctx.beginPath(); ctx.moveTo(xC, yC); ctx.lineTo(xC - 10 * Math.cos(an - 0.42), yC - 10 * Math.sin(an - 0.42)); ctx.lineTo(xC - 10 * Math.cos(an + 0.42), yC - 10 * Math.sin(an + 0.42)); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1;
      const bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; };
      for (let k = 0; k <= 12; k++) { const t = k / 12, q = k < 6 ? bez(P0, C1, C2, V, t * 2) : bez(V, C3, C4, Pf, (t - 0.5) * 2); reg(o, q[0] - 9, q[0] + 9, q[1] - 9, q[1] + 9, { flecheScenario: true }); }
      const cands = []; for (const k of [0, 1, -1, 2, -2, 3, -3]) cands.push({ x: xC + 6, y: yC - SQ / 2 + k * (SQ + 3) });
      for (const k of [1, -1, 2, -2]) cands.push({ x: T.width - w - 2, y: yC - SQ / 2 + k * (SQ + 5) });   // pas de place à droite de la pointe (téléphone) : au-dessus ou au-dessous, calé à droite   // au bout de la flèche, puis décalé en hauteur s'il y a un carré
      demander(o.id, o, o.court, principal ? 'scA' : 'scB', cands, 96, { x0: xL, x1: xC, y0: Math.min(yS, yC), y1: Math.max(yS, yC) }); }
  }

  /* placement des carrés : dans la zone ou au bout de la ligne, jamais sur une bougie ni sur un autre carré ; sans place, le carré n'est pas dessiné (nom au toucher) */
  const place = placerCarres(carres.map(c => ({ id: c.id, w: c.w, h: c.h, prio: c.prio, candidats: c.cands })), { largeur: T.width, hauteur: T.height - hBande, obstacles });
  const FOND = { scA: ['rgba(8,12,16,.96)', '#ffffff'], scB: ['rgba(8,12,16,.96)', '#c9d1d9'], vert: [`rgba(${COUL.haut},.97)`, '#04201c'], rouge: [`rgba(${COUL.bas},.97)`, '#2c0605'], blanc: ['rgba(240,243,247,.98)', '#0d1217'], gris: ['rgba(14,18,23,.92)', '#e6ebf0'] };
  place.forEach((pl, k) => { const c = carres[k]; cadres.demandes++; const z = c.zone; cadres.carres.push({ id: c.id, court: c.texte, style: c.style, x: pl.x, y: pl.y, w: c.w, h: c.h, replie: pl.replie, zone: z });
    if (pl.replie) return;
    if (c.style === 'texte') { ctx.font = F(false); ctx.fillStyle = 'rgba(170,180,190,.95)'; ctx.fillText(c.texte, pl.x + 2, pl.y + fs); cadres.push({ kind: c.o.kind, famille: c.o.famille, x0: pl.x, x1: pl.x + c.w, y0: pl.y, y1: pl.y + c.h, objet: c.o, carre: true, g: { p: c.o.p, texte: c.o.nom, detail: [...(c.o.statut ? ['statut : ' + c.o.statut] : []), ...(c.o.pourquoi || [])] } }); return; }
    const [fond, txt] = FOND[c.style] || FOND.gris; ctx.fillStyle = fond; if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(pl.x, pl.y, c.w, c.h, 3); ctx.fill(); } else ctx.fillRect(pl.x, pl.y, c.w, c.h);
    if (c.style === 'scA' || c.style === 'scB') { ctx.strokeStyle = c.style === 'scA' ? 'rgba(255,255,255,.95)' : `rgba(${COUL.prise},.95)`; ctx.lineWidth = 1; ctx.strokeRect(pl.x + 0.5, pl.y + 0.5, c.w - 1, c.h - 1); }
    if (c.style === 'gris') { ctx.strokeStyle = `rgba(${COUL.prise},.95)`; ctx.lineWidth = 1; ctx.strokeRect(pl.x + 0.5, pl.y + 0.5, c.w - 1, c.h - 1); }
    ctx.font = F(true); ctx.fillStyle = txt; ctx.fillText(c.texte, pl.x + 5, pl.y + c.h - 6);
    cadres.push({ kind: c.o.kind, famille: c.o.famille, x0: pl.x, x1: pl.x + c.w, y0: pl.y, y1: pl.y + c.h, objet: c.o, carre: true, g: { p: c.o.p ?? (c.o.cible ? c.o.cible.p : (c.o.bas + c.o.haut) / 2), texte: c.o.nom, detail: c.o.kind === 'scenario' ? (c.o.bulle || []) : [...(c.o.statut ? ['statut : ' + c.o.statut] : []), ...(c.o.pourquoi || [])] } }); });
  cadres.etiquettes = cadres.carres; cadres.etiquettesDemandees = cadres.demandes;
  return cadres;
}
