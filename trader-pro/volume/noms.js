/* ═════════════ MODE VOLUME : PLUS AUCUN RECTANGLE NI AUCUNE LIGNE SANS NOM (pur pour les noms, dessin avec contexte injecté) ═════════════
   Chaque ligne et chaque zone du graphique Volume reçoit un nom lisible sur une pastille sombre (13 px PC, 12 px tablette, 11 px téléphone, jamais moins), placé sans chevauchement (placerEtiquettes, partagé avec l'ICT).
   Les étiquettes courtes de l'axe des prix restent : ce module les complète sur le graphique et fournit la légende repliable. Aucun calcul du mode Volume n'est modifié. */
import { placerEtiquettes, taillePolice } from '../../agent-trading/front/or/ict-etiquettes.js';

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

/* dessin : lignes (prix) et zones (bas, haut) nommées, pastilles placées sans chevauchement. ctx : contexte 2D en pixels bitmap ; pr : rapports de pixels ; yDe : prix → y CSS. */
export function dessinerNomsVolume(ctx, { W, H, hr = 1, vr = 1, ecran = 1200, yDe, lignes = [], zones = [], interdits = [] }) {
  const fs = taillePolice(ecran), LH = fs + 4, mesure = t => { ctx.font = `bold ${fs * hr}px system-ui, 'Segoe UI', sans-serif`; return ctx.measureText(t).width / hr; }, req = [], Wc = W / hr, Hc = H / vr;
  for (const l of lignes) { const y = yDe(l.prix); if (y == null || !Number.isFinite(y) || y < 0 || y > Hc) continue; const nom = nomLisible(l.texte), w = mesure(nom) + 10; req.push({ id: 'l|' + l.prix + '|' + l.texte, x: Wc - w - 40, y: y - LH - 2, w, h: LH + 2, prio: l.prio || 50, nom, col: l.fond || '#cfd8dc' }); }
  for (const z of zones) { const y1 = yDe(z.haut), y2 = yDe(z.bas); if (y1 == null || y2 == null || !Number.isFinite(y1 + y2)) continue; const top = Math.min(y1, y2); if (top > Hc || Math.max(y1, y2) < 0) continue; const nom = nomZone(z), w = mesure(nom) + 10; req.push({ id: 'z|' + z.bas + '|' + z.haut, x: Wc - w - 40, y: top + 2, w, h: LH + 2, prio: z.prio || 60, nom, col: '#e6edf2' }); }
  const res = placerEtiquettes(req.map(r => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, prio: r.prio })), { largeur: Wc, hauteur: Hc, interdits });
  res.forEach((p, k) => { if (p.replie) return; const r = req[k]; ctx.fillStyle = 'rgba(10,14,18,.86)'; ctx.fillRect(p.x * hr, p.y * vr, r.w * hr, r.h * vr); ctx.font = `bold ${fs * hr}px system-ui, 'Segoe UI', sans-serif`; ctx.fillStyle = r.col; ctx.fillText(r.nom, (p.x + 5) * hr, (p.y + LH - 3) * vr); });
  return { demandees: req.length, placees: res.filter(p => !p.replie).length, res, req };
}
/* légende repliable (DOM) du mode Volume */
export function htmlLegendeVolume() { return LEGENDE_VOLUME.map(([k, t]) => `<div><b>${k}</b> : ${t}</div>`).join(''); }
