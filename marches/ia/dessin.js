/* ═════════════ DESSIN DE L'IMAGE ANNOTÉE (par NOTRE code, sur un canvas 2D) ═════════════
   Mode « interne » : le graphique est redessiné ici à partir des bougies, la conversion prix → pixel est EXACTE (échelle linéaire connue, testée : aller-retour).
   Mode « image importée » : la capture vient de l'utilisateur ; on ne connaît que deux prix de repère saisis (haut et bas de l'échelle) : positions APPROXIMATIVES, mention très visible.
   Contenu : bandes de zones nommées, niveaux, flèches de scénarios en pointillés, invalidations, légende, avertissement. Aucune probabilité, aucune taille de position. */
import { bougie } from './prompt.js';
import { AVERTISSEMENT } from './schema.js';

export function creerEchelle({ min, max, hauteur, haut = 0, bas = 0 }) {
  if (!(isFinite(min) && isFinite(max) && max > min && hauteur > haut + bas + 10)) throw new Error('échelle invalide');
  const utile = hauteur - haut - bas, k = utile / (max - min);
  return { y: p => haut + (max - p) * k, prix: y => max - (y - haut) / k, min, max, haut, bas, hauteur };
}
const COUL = { fond: '#070b10', grille: '#14202b', texte: '#c8d6df', doux: '#7f93a1', hausse: '#57c896', baisse: '#eb6e6e', support: '#57c896', resistance: '#eb6e6e', autre: '#8fd0e3', scenH: '#57c896', scenB: '#eb6e6e', scenN: '#d6b66a', inval: '#ff9a4d' };
const fmt = p => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: Math.abs(p) >= 100 ? 1 : 3 }).format(p);

function etiquette(ctx, t, x, y, { couleur = COUL.texte, fond = 'rgba(7,11,16,.78)', align = 'left', taille = 12 } = {}) {
  ctx.font = `${taille}px system-ui, sans-serif`; const w = ctx.measureText(t).width + 8; const x0 = align === 'right' ? x - w : x;
  ctx.fillStyle = fond; ctx.fillRect(x0, y - taille, w, taille + 5); ctx.fillStyle = couleur; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillText(t, x0 + 4, y);
}
function fleche(ctx, x0, y0, x1, y1, couleur) {
  ctx.save(); ctx.strokeStyle = couleur; ctx.fillStyle = couleur; ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
  const a = Math.atan2(y1 - y0, x1 - x0); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 11 * Math.cos(a - .4), y1 - 11 * Math.sin(a - .4)); ctx.lineTo(x1 - 11 * Math.cos(a + .4), y1 - 11 * Math.sin(a + .4)); ctx.closePath(); ctx.fill(); ctx.restore();
}

/* Dessine les annotations sur un ctx déjà muni de l'échelle ; renvoie la liste de ce qui a été dessiné (pour les tests). */
export function dessinerAnnotations(ctx, { largeur, E, xGauche = 0, xDroite, analyse, xDernier }) {
  const fait = { zones: 0, niveaux: 0, scenarios: 0, invalidations: 0 }; const dedans = p => p >= E.min - (E.max - E.min) * 0.5 && p <= E.max + (E.max - E.min) * 0.5; const clampY = y => Math.max(E.haut + 2, Math.min(E.hauteur - E.bas - 2, y));
  analyse.zones.forEach(z => { const y0 = clampY(E.y(z.haut)), y1 = clampY(E.y(z.bas)), c = COUL[z.role] || COUL.autre; ctx.fillStyle = c + '26'; ctx.fillRect(xGauche, y0, xDroite - xGauche, Math.max(2, y1 - y0)); ctx.strokeStyle = c + '99'; ctx.lineWidth = 1; ctx.strokeRect(xGauche + .5, y0 + .5, xDroite - xGauche - 1, Math.max(2, y1 - y0) - 1); etiquette(ctx, `${z.nom} · ${fmt(z.bas)}–${fmt(z.haut)}`, xGauche + 6, y0 + 14, { couleur: c }); fait.zones++; });
  analyse.niveaux.forEach(n => { const y = clampY(E.y(n.prix)), c = COUL[n.role] || COUL.autre; ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = 1.4; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(xGauche, y); ctx.lineTo(xDroite, y); ctx.stroke(); ctx.restore(); etiquette(ctx, `${n.nom} ${fmt(n.prix)}`, xDroite - 4, y - 4, { couleur: c, align: 'right' }); fait.niveaux++; });
  analyse.invalidations.forEach(v => { if (!dedans(v.prix)) return; const y = clampY(E.y(v.prix)); ctx.save(); ctx.strokeStyle = COUL.inval; ctx.lineWidth = 1.6; ctx.setLineDash([10, 4]); ctx.beginPath(); ctx.moveTo(xGauche, y); ctx.lineTo(xDroite, y); ctx.stroke(); ctx.restore(); etiquette(ctx, `✕ invalidation ${fmt(v.prix)}`, xGauche + 6, y - 5, { couleur: COUL.inval }); fait.invalidations++; });
  analyse.scenarios.forEach((s, i) => {
    const c = s.direction === 'haussier' ? COUL.scenH : s.direction === 'baissier' ? COUL.scenB : COUL.scenN, pts = s.chemin.length ? s.chemin : (s.cible != null ? [s.cible] : []); if (!pts.length) return;
    let x = xDernier, y = E.y(analyse.depart != null ? analyse.depart : (E.min + E.max) / 2); const pas = Math.min(60, (xDroite - xDernier - 8) / pts.length);
    pts.forEach((p, k) => { const nx = x + pas, ny = clampY(E.y(p)); fleche(ctx, x, y, nx, ny, c); x = nx; y = ny; });
    etiquette(ctx, `${i + 1}. ${s.nom}${s.cible != null ? ' → ' + fmt(s.cible) : ''}`, Math.max(xGauche + 6, x - 4), clampY(y) + (i % 2 ? 16 : -8), { couleur: c, align: 'right' }); fait.scenarios++;
  });
  return fait;
}

/* Image 100 % interne : bougies + annotations + légende + avertissement. */
export function dessinerGraphiqueAnnote(ctx, { largeur = 1280, hauteur = 760, bougies, analyse, actif = '', unite = '', nBougies = 110 }) {
  const B = bougies.map(bougie).slice(-nBougies), g = 12, droite = 150, haut = 46, bas = 70, xD = largeur - droite;
  let min = Math.min(...B.map(b => b.l)), max = Math.max(...B.map(b => b.h)); const m = (max - min) * 0.12 || 1; min -= m; max += m;
  for (const p of [...analyse.zones.flatMap(z => [z.bas, z.haut]), ...analyse.niveaux.map(n => n.prix), ...analyse.invalidations.map(v => v.prix), ...analyse.scenarios.flatMap(s => [s.cible, s.invalidation, ...s.chemin].filter(x => x != null))]) { if (p < min && p > min - (max - min)) min = p - m / 2; if (p > max && p < max + (max - min)) max = p + m / 2; }
  const E = creerEchelle({ min, max, hauteur, haut, bas });
  ctx.fillStyle = COUL.fond; ctx.fillRect(0, 0, largeur, hauteur);
  ctx.strokeStyle = COUL.grille; ctx.lineWidth = 1; ctx.fillStyle = COUL.doux; ctx.font = '11px system-ui'; ctx.textAlign = 'left';
  for (let k = 0; k <= 8; k++) { const p = min + (max - min) * k / 8, y = E.y(p); ctx.beginPath(); ctx.moveTo(g, y); ctx.lineTo(xD, y); ctx.stroke(); ctx.fillText(fmt(p), xD + 8, y + 4); }
  const pas = (xD - g - 220) / B.length, cw = Math.max(2, pas * 0.62), x0 = g;
  B.forEach((b, i) => { const x = x0 + i * pas + pas / 2, c = b.c >= b.o ? COUL.hausse : COUL.baisse; ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, E.y(b.h)); ctx.lineTo(x, E.y(b.l)); ctx.stroke(); const yo = E.y(b.o), yc = E.y(b.c); ctx.fillRect(x - cw / 2, Math.min(yo, yc), cw, Math.max(1, Math.abs(yc - yo))); });
  const xDernier = x0 + B.length * pas, dernier = B[B.length - 1];
  const fait = dessinerAnnotations(ctx, { largeur, E, xGauche: g, xDroite: xD, analyse: { ...analyse, depart: dernier.c }, xDernier });
  ctx.fillStyle = COUL.texte; ctx.font = '600 15px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`${actif} · ${unite} · dernière clôture ${fmt(dernier.c)}`, g + 4, 28);
  legende(ctx, { largeur, hauteur, bas, mention: 'Capture interne : positions exactes (prix → pixel calculés par Rayle).' });
  return { E, fait, xDernier };
}

/* Annotations sur une capture IMPORTÉE : repères saisis par l'utilisateur (prix en haut et en bas de l'image utile). Positions APPROXIMATIVES. */
export function dessinerSurImage(ctx, { image, largeur, hauteur, prixHaut, prixBas, margeHaut = 0, margeBas = 0, analyse }) {
  ctx.fillStyle = COUL.fond; ctx.fillRect(0, 0, largeur, hauteur + 64); ctx.drawImage(image, 0, 0, largeur, hauteur);
  const E = creerEchelle({ min: prixBas, max: prixHaut, hauteur, haut: margeHaut, bas: margeBas });
  const fait = dessinerAnnotations(ctx, { largeur, E, xGauche: 0, xDroite: largeur, analyse, xDernier: largeur * 0.82 });
  ctx.fillStyle = 'rgba(255,154,77,.95)'; ctx.fillRect(0, 0, largeur, 26); ctx.fillStyle = '#1a0f05'; ctx.font = '700 13px system-ui'; ctx.textAlign = 'left'; ctx.fillText('⚠ POSITIONS APPROXIMATIVES : capture importée, échelle estimée à partir de deux repères saisis à la main', 10, 18);
  legende(ctx, { largeur, hauteur: hauteur + 64, bas: 64, mention: 'Les zones et niveaux sont placés d\'après les prix de repère saisis : écart possible avec le graphique réel.' });
  return { E, fait };
}

function legende(ctx, { largeur, hauteur, bas, mention }) {
  const y = hauteur - bas + 18; ctx.fillStyle = 'rgba(7,11,16,.9)'; ctx.fillRect(0, hauteur - bas + 4, largeur, bas - 4);
  const it = [['Zone', COUL.autre + 'cc', 'fill'], ['Niveau', COUL.autre, 'dot'], ['Scénario haussier', COUL.scenH, 'dash'], ['Scénario baissier', COUL.scenB, 'dash'], ['Invalidation', COUL.inval, 'dash']]; let x = 12;
  ctx.font = '12px system-ui'; ctx.textAlign = 'left'; for (const [t, c, k] of it) { ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 2; if (k === 'fill') ctx.fillRect(x, y - 9, 16, 10); else { ctx.save(); ctx.setLineDash(k === 'dot' ? [2, 3] : [6, 3]); ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 18, y - 4); ctx.stroke(); ctx.restore(); } ctx.fillStyle = COUL.texte; ctx.fillText(t, x + 24, y); x += 24 + ctx.measureText(t).width + 18; }
  ctx.fillStyle = COUL.doux; ctx.font = '11.5px system-ui'; ctx.fillText(mention, 12, y + 20); ctx.fillStyle = '#e6d7a8'; ctx.font = '600 12px system-ui'; ctx.fillText(AVERTISSEMENT + ' Scénarios conditionnels, sans probabilité ni taille de position.', 12, y + 38);
}
