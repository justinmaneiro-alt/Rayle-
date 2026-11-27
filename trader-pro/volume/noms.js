/* ═════════════ MODE VOLUME : PLUS AUCUN RECTANGLE NI AUCUNE LIGNE SANS NOM (pur pour les noms, dessin avec contexte injecté) ═════════════
   Chaque ligne et chaque zone du graphique Volume reçoit un nom lisible sur une pastille sombre (13 px PC, 12 px tablette, 11 px téléphone, jamais moins), placé sans chevauchement (placerEtiquettes, partagé avec l'ICT).
   Les étiquettes courtes de l'axe des prix restent : ce module les complète sur le graphique et fournit la légende repliable. Aucun calcul du mode Volume n'est modifié. */
import { taillePolice } from '../../agent-trading/front/or/ict-etiquettes.js';
import { placerCarres } from '../../agent-trading/front/or/ict-carres.js';

const DICO = [
  [/^POC nu S/, 'POC nu de la semaine · prix le plus échangé, jamais retesté'], [/^POC nu M/, 'POC nu du mois · prix le plus échangé, jamais retesté'], [/^POC\b\s*(.*)$/, (m) => `POC · prix le plus échangé${m[1] ? ' · ' + m[1] : ''}`],
  [/^VAH$/, 'VAH · haut de la zone de valeur (70 % du volume)'], [/^VAL$/, 'VAL · bas de la zone de valeur (70 % du volume)'], [/^R×(\d+)/, (m) => `Niveau de réaction · ${m[1]} réactions`],
  [/^Mur\s*(.*)$/, (m) => `Mur du carnet · ${m[1]} en attente`], [/^Rés\.\s*(.*)$/, (m) => `Résistance de volume · ${m[1]}`], [/^Sup\.\s*(.*)$/, (m) => `Support de volume · ${m[1]}`],
  [/^VWAP sem/, 'VWAP de la semaine · prix moyen pondéré par le volume'], [/^VWAP anc/, 'VWAP ancré · prix moyen pondéré depuis le point choisi'],
  [/^PDH$/, 'PDH · plus haut de la veille'], [/^PDL$/, 'PDL · plus bas de la veille'], [/^PWH$/, 'PWH · plus haut de la semaine précédente'], [/^PWL$/, 'PWL · plus bas de la semaine précédente'], [/^PMH$/, 'PMH · plus haut du mois précédent'], [/^PML$/, 'PML · plus bas du mois précédent'],
  [/^Ouv\. jour/, 'Ouverture du jour'], [/^Ouv\. sem/, 'Ouverture de la semaine'], [/^Ouv\. mois/, 'Ouverture du mois'], [/^50 %/, 'Équilibre 50 % · limite premium / discount'],
  [/^EQH/, 'EQH · sommets égaux (liquidité au-dessus)'], [/^EQL/, 'EQL · creux égaux (liquidité en dessous)'], [/^FVG D/, 'FVG Daily · écart de valeur non comblé'], [/^FVG W/, 'FVG Weekly · écart de valeur non comblé'],
  [/^OB D(.?)/, (m) => `Order Block Daily${m[1] === '↑' ? ' haussier' : m[1] === '↓' ? ' baissier' : ''}`], [/^OB W(.?)/, (m) => `Order Block Weekly${m[1] === '↑' ? ' haussier' : m[1] === '↓' ? ' baissier' : ''}`],
  [/^Ligne$/, 'Ma ligne tracée'], [/^Boîte$/, 'Ma boîte tracée'], [/^Fib\s*(.*)$/, (m) => `Fibonacci ${m[1]} · mon tracé`], [/^[\d.,\s]+\s*[kKMm]?$/, (m, t) => `Gros ordre · ${t.trim()}`]
];
/* nom lisible d'une étiquette courte de l'axe ; une étiquette inconnue garde son texte (jamais vide) */
export function nomLisible(texte) {
  const t = String(texte ?? '').trim(); if (!t) return 'Repère sans nom (à signaler)';
  for (const [re, f] of DICO) { const m = re.exec(t); if (m) return typeof f === 'function' ? f(m, t) : f; }
  return t;
}
export const nomZone = z => (z && z.nom) || (z && z.texte ? nomLisible(z.texte) : z && z.id === 'pd-haut' ? 'Premium · zone chère (au-dessus de 50 %)' : z && z.id === 'pd-bas' ? 'Discount · zone bon marché (sous 50 %)' : 'Zone sans nom (à signaler)');
export const NOM_ZONE_VOLUME = { achat: 'Zone de volume extrême acheteur · laissée par une bougie à fort volume', vente: 'Zone de volume extrême vendeur · laissée par une bougie à fort volume' };
export const NOM_SESSION = { asie: 'Session Asie', londres: 'Session Londres', newyork: 'Session New York' };
export const LEGENDE_VOLUME = Object.freeze([
  ['POC / VAH / VAL', 'prix le plus échangé et limites de la zone de valeur (profil à droite)'], ['Niveau de réaction', 'prix où le marché a réagi au moins 2 fois (zone fine bleu-gris)'], ['VWAP', 'prix moyen pondéré par le volume (bleu)'],
  ['Zone cyan / magenta', 'zone laissée par une bougie à volume extrême : cyan = acheteur, magenta = vendeur'], ['Premium / Discount', 'moitié chère / bon marché de la plage de la semaine précédente (vert = discount, rouge = premium)'],
  ['FVG / Order Block Daily', 'zones grises : écart de valeur non comblé / dernière bougie contraire avant un déplacement'], ['Chaleur du carnet', 'vert = ordres d\'achat en attente, rouge = ordres de vente'], ['Gros ordre / Mur', 'grosses transactions et gros ordres du carnet'], ['Sessions', 'bande en haut : Asie, Londres, New York']]);

/* ───── petits carrés du mode Volume (même traitement que l'ICT) : un nom court (« Vol. vendeur », « Vol. acheteur », « VAH », « POC », « VAL », « HVN », « LVN », « Réaction »…) dans un petit carré,
   6 carrés au plus par écran, jamais deux fois le même libellé, les zones voisines du même type (à moins de 0,1 ATR) fusionnées ; le détail (4 lignes au plus) se lit au toucher. ───── */
export const MAX_CARRES_VOLUME = 6, FUSION_ATR_VOLUME = 0.1;
const COURT = [[/^POC\b/, () => 'POC', 90], [/^VAH\b/, () => 'VAH', 82], [/^VAL\b/, () => 'VAL', 82], [/^HVN\b/, () => 'HVN', 72], [/^LVN\b/, () => 'LVN', 72], [/^R×/, () => 'Réaction', 60], [/^VWAP/, () => 'VWAP', 52],
  [/^(PDH|PDL|PWH|PWL|PMH|PML)\b/, m => m[1], 48], [/^EQH/, () => 'EQH', 46], [/^EQL/, () => 'EQL', 46], [/^Mur\b/, () => 'Mur', 45], [/^Rés\./, () => 'Résistance', 45], [/^Sup\./, () => 'Support', 45], [/^FVG/, () => 'FVG', 44], [/^OB\b/, () => 'OB', 44],
  [/^50 %/, () => 'EQ 50 %', 40], [/^Ouv\./, () => 'Ouverture', 35], [/^[\d.,\s]+\s*[kKMm]?$/, () => 'Gros ordre', 30]];
/* nom court d'une ligne (14 caractères au plus) et sa priorité ; une étiquette inconnue garde son texte tronqué */
export function nomCourtVolume(texte) {
  const t = String(texte ?? '').trim(); for (const [re, f, prio] of COURT) { const m = re.exec(t); if (m) return { court: f(m), prio }; }
  return { court: t.length <= 14 ? t || 'Repère' : t.slice(0, 14), prio: 30 };
}
const COUL_ZONE = { achat: '#4fd8e8', vente: '#e879f9' };
/* lignes : [{ prix, texte, fond }] ; zones : [{ bas, haut, nom, texte, id, dir }] ; renvoie les carrés à poser (6 au plus), du plus important au moins important */
export function carresVolume({ lignes = [], zones = [], atr = 0, prix = null, max = MAX_CARRES_VOLUME, fmt = v => String(v) } = {}) {
  const C = [], proche = (bas, haut) => (prix == null ? 0 : prix >= bas && prix <= haut ? 0 : Math.min(Math.abs(prix - bas), Math.abs(prix - haut)));
  /* zones : nom court par type, puis fusion des voisines du même type (à moins de 0,1 ATR) */
  const Z = zones.filter(z => Number.isFinite(z.bas) && Number.isFinite(z.haut)).map(z => { const full = nomZone(z), court = z.dir > 0 || /extrême acheteur/.test(full) ? 'Vol. acheteur' : z.dir < 0 || /extrême vendeur/.test(full) ? 'Vol. vendeur' : nomCourtVolume(z.texte || (z.id === 'pd-haut' ? 'Premium' : z.id === 'pd-bas' ? 'Discount' : full)).court;
    const vol = court === 'Vol. acheteur' || court === 'Vol. vendeur'; return { bas: Math.min(z.bas, z.haut), haut: Math.max(z.bas, z.haut), court, full: vol ? NOM_ZONE_VOLUME[court === 'Vol. acheteur' ? 'achat' : 'vente'] : full, n: 1, prio: vol ? 75 : (z.prio || 40), col: court === 'Vol. acheteur' ? COUL_ZONE.achat : court === 'Vol. vendeur' ? COUL_ZONE.vente : '#e6edf2' }; }).sort((x, y) => x.bas - y.bas);
  const G = []; for (const z of Z) { const g = G.find(q => q.court === z.court && z.bas - q.haut <= FUSION_ATR_VOLUME * (atr || 0) + 1e-9 && z.haut >= q.bas - FUSION_ATR_VOLUME * (atr || 0) - 1e-9); if (g) { g.bas = Math.min(g.bas, z.bas); g.haut = Math.max(g.haut, z.haut); g.n += z.n; } else G.push({ ...z }); }
  for (const g of G) C.push({ id: 'z|' + g.court + '|' + g.bas, kind: 'zone', court: g.court, nom: g.full, prio: g.prio, bas: g.bas, haut: g.haut, d: proche(g.bas, g.haut), col: g.col, detail: [g.full, `De ${fmt(g.bas)} à ${fmt(g.haut)}`, g.n > 1 ? `${g.n} zones voisines fusionnées` : '', 'Une description, jamais un ordre.'].filter(Boolean) });
  for (const l of lignes) { if (!Number.isFinite(l.prix)) continue; const { court, prio } = nomCourtVolume(l.texte), nom = nomLisible(l.texte); C.push({ id: 'l|' + court + '|' + l.prix, kind: 'ligne', court, nom, prio: Math.max(prio, l.prio || 0), prix: l.prix, d: prix == null ? 0 : Math.abs(prix - l.prix), col: l.fond || '#cfd8dc', detail: [nom, `Prix : ${fmt(l.prix)}`, 'Une description, jamais un ordre.'] }); }
  /* jamais deux fois le même libellé : on garde le plus important, à égalité le plus proche du prix */
  const U = new Map(); for (const c of C) { const o = U.get(c.court); if (!o || c.prio > o.prio || (c.prio === o.prio && c.d < o.d)) U.set(c.court, c); }
  return [...U.values()].sort((x, y) => y.prio - x.prio || x.d - y.d).slice(0, max);
}

/* dessin : les carrés de carresVolume, posés sans chevauchement au bout de leur ligne ou dans leur zone. ctx : contexte 2D en pixels bitmap ; hr / vr : rapports de pixels ; yDe : prix → y CSS.
   Renvoie aussi `carres` (position CSS et détail) pour la bulle au toucher. */
export function dessinerNomsVolume(ctx, { W, H, hr = 1, vr = 1, ecran = 1200, yDe, lignes = [], zones = [], interdits = [], atr = 0, prix = null, fmt }) {
  const fs = taillePolice(ecran), LH = fs + 6, mesure = t => { ctx.font = `bold ${fs * hr}px system-ui, 'Segoe UI', sans-serif`; return ctx.measureText(t).width / hr; }, req = [], Wc = W / hr, Hc = H / vr;
  /* un carré ne quitte JAMAIS son prix : il glisse seulement vers la gauche (jamais en hauteur) jusqu'à trouver une place libre, sans recouvrir une bougie ni un autre carré */
  const glisse = (w, y) => { const L = []; for (let x = Wc - w - 40; x >= 40; x -= Math.max(6, Math.round(w / 3))) L.push({ x, y }); return L; };
  const C = carresVolume({ lignes, zones, atr, prix, fmt });
  for (const c of C) { const w = mesure(c.court) + 10;
    if (c.kind === 'ligne') { const y = yDe(c.prix); if (y == null || !Number.isFinite(y) || y < 0 || y > Hc) continue; req.push({ id: c.id, w, h: LH, prio: c.prio, c, cands: glisse(w, y - LH / 2) }); }
    else { const y1 = yDe(c.haut), y2 = yDe(c.bas); if (y1 == null || y2 == null || !Number.isFinite(y1 + y2)) continue; const top = Math.min(y1, y2), bas = Math.max(y1, y2); if (top > Hc || bas < 0) continue; req.push({ id: c.id, w, h: LH, prio: c.prio, c, cands: glisse(w, bas - top >= LH + 4 ? top + 2 : (top + bas) / 2 - LH / 2) }); } }
  const res = placerCarres(req.map(r => ({ id: r.id, w: r.w, h: r.h, prio: r.prio, candidats: r.cands })), { largeur: Wc, hauteur: Hc, obstacles: interdits }), carres = [];
  res.forEach((p, k) => { const r = req[k], c = r.c; carres.push({ id: c.id, court: c.court, nom: c.nom, detail: c.detail, x: p.x, y: p.y, w: r.w, h: r.h, replie: !!p.replie }); if (p.replie) return;
    ctx.fillStyle = 'rgba(10,14,18,.92)'; ctx.fillRect(p.x * hr, p.y * vr, r.w * hr, r.h * vr); if (ctx.strokeRect) { ctx.strokeStyle = c.col; ctx.lineWidth = Math.max(1, hr); ctx.strokeRect(p.x * hr + 0.5, p.y * vr + 0.5, r.w * hr - 1, r.h * vr - 1); }
    ctx.font = `bold ${fs * hr}px system-ui, 'Segoe UI', sans-serif`; ctx.fillStyle = c.col; ctx.fillText(c.court, (p.x + 5) * hr, (p.y + LH - 6) * vr); });
  return { demandees: req.length, placees: res.filter(p => !p.replie).length, res, req, carres };
}

/* légende repliable (DOM) du mode Volume */
export function htmlLegendeVolume() { return LEGENDE_VOLUME.map(([k, t]) => `<div><b>${k}</b> : ${t}</div>`).join(''); }
