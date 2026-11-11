/* ═════════════ OUTILS DE DESSIN DE L'OR (pur, testé) : modèle, position, aimantation, export / import ═════════════
   Objets : ligne horizontale, zone fine, ligne de tendance, rayon, position (entrée / stop / objectif, en lignes seulement).
   Valables sur toutes les unités de temps (prix et heures réels). Jamais un ordre : outils de lecture. */
import { KRAKEN } from './config-or.js';

export const TYPES = Object.freeze(['horizontale', 'zone', 'tendance', 'rayon', 'position']);
export const NOMS = Object.freeze({ horizontale: 'Support / résistance', zone: 'Zone', tendance: 'Ligne de tendance', rayon: 'Rayon', position: 'Position' });
export const COULEURS = Object.freeze({ horizontale: '#8fd0e3', zone: '#8fd0e3', tendance: '#c9b27a', rayon: '#c9b27a', position: '#cfd8dc' });
export const DEFAUTS_POSITION = Object.freeze({ capital: 10000, risquePct: 0.5 });
const r2 = x => Math.round(x * 100) / 100;
let compteur = 0;
export const nouvelId = (t = Date.now()) => `o${t.toString(36)}${(compteur++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/* création d'un objet (validation stricte ; null si invalide) */
export function creer(type, d, { t = Date.now(), id = nouvelId(t) } = {}) {
  if (!TYPES.includes(type)) return null;
  const base = { id, type, cree: d.cree ?? t, couleur: d.couleur || COULEURS[type], epaisseur: d.epaisseur || 1, etiquette: d.etiquette || '', alerte: !!d.alerte, muet: !!d.muet, repete: d.repete !== false, origine: d.origine || 'dessin' };
  if (type === 'horizontale') { if (!(d.p > 0)) return null; return { ...base, p: r2(d.p) }; }
  if (type === 'zone') { if (!(d.bas > 0) || !(d.haut > 0)) return null; const bas = Math.min(d.bas, d.haut), haut = Math.max(d.bas, d.haut); return { ...base, bas: r2(bas), haut: r2(haut) }; }
  if (type === 'tendance' || type === 'rayon') { if (!(d.p1 > 0) || !(d.p2 > 0) || !Number.isFinite(d.t1) || !Number.isFinite(d.t2) || d.t1 === d.t2) return null;
    const [a, b] = d.t1 < d.t2 ? [[d.t1, d.p1], [d.t2, d.p2]] : [[d.t2, d.p2], [d.t1, d.p1]]; return { ...base, t1: a[0], p1: r2(a[1]), t2: b[0], p2: r2(b[1]) }; }
  if (type === 'position') { if (!(d.entree > 0) || !(d.stop > 0) || !(d.objectif > 0) || d.stop === d.entree) return null;
    return { ...base, entree: r2(d.entree), stop: r2(d.stop), objectif: r2(d.objectif), risquePct: d.risquePct ?? DEFAUTS_POSITION.risquePct, capital: d.capital ?? DEFAUTS_POSITION.capital, t0: Number.isFinite(d.t0) ? d.t0 : null }; }
  return null;
}
/* modification : seuls les champs connus du type, puis revalidation (renvoie le nouvel objet ou null) */
export function modifier(o, champs) {
  const permis = { horizontale: ['p'], zone: ['bas', 'haut'], tendance: ['t1', 'p1', 't2', 'p2'], rayon: ['t1', 'p1', 't2', 'p2'], position: ['entree', 'stop', 'objectif', 'risquePct', 'capital', 't0'] }[o.type] || [];
  const d = { ...o }; for (const k of [...permis, 'couleur', 'epaisseur', 'etiquette', 'alerte', 'muet', 'repete']) if (k in champs) d[k] = champs[k];
  const n = creer(o.type, d, { t: o.cree, id: o.id }); return n ? { ...n, cree: o.cree, origine: o.origine } : null;
}
/* valeur de l'objet à l'instant t : prix (ligne, tendance, rayon), {bas, haut} (zone) ; null avant la première ancre d'une droite */
export function valeur(o, t) {
  if (o.type === 'horizontale') return o.p;
  if (o.type === 'zone') return { bas: o.bas, haut: o.haut };
  if (o.type === 'tendance' || o.type === 'rayon') { if (t < o.t1) return null; return o.p1 + (o.p2 - o.p1) * (t - o.t1) / (o.t2 - o.t1); }
  return null;
}
/* position : sens déduit du stop, R, risque en $, taille en contrats Kraken (1 once, pas de 0,001) */
export function calculPosition(o, { pas = KRAKEN.pasQuantite } = {}) {
  if (!o || !(o.entree > 0) || !(o.stop > 0) || !(o.objectif > 0)) return null;
  const sens = o.stop < o.entree ? 'achat' : 'vente', dist = Math.abs(o.entree - o.stop); if (!dist) return null;
  const gain = (o.objectif - o.entree) * (sens === 'achat' ? 1 : -1), R = gain / dist, risque = (o.capital ?? DEFAUTS_POSITION.capital) * (o.risquePct ?? DEFAUTS_POSITION.risquePct) / 100;
  const taille = Math.floor(risque / dist / pas + 1e-9) * pas;
  return { sens, dist, R, coherent: gain > 0, risque, taille: +taille.toFixed(3), risqueReel: taille * dist };
}
const nbFr = (x, d = 0) => Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
export function libellePosition(o) {
  const c = calculPosition(o); if (!c) return '';
  return `${c.sens === 'achat' ? 'Achat' : 'Vente'} · Entrée ${nbFr(o.entree)} · SL ${nbFr(o.stop)} · TP ${nbFr(o.objectif)} · R ${nbFr(c.R, 1)}${c.coherent ? '' : ' (TP du mauvais côté)'} · risque ${nbFr(c.risque)} $ · taille ${nbFr(c.taille, 3)} contrats (1 oz)`;
}
export function libelle(o) {
  if (o.type === 'position') return libellePosition(o);
  const e = o.etiquette ? `${o.etiquette} · ` : '', ret = o.retourne ? ' · retourné' : '';
  if (o.type === 'horizontale') return `${e}${o.origine === 'propose' ? 'Mon niveau' : 'Niveau'} ${nbFr(o.p)}${ret}`;
  if (o.type === 'zone') return `${e}Zone ${nbFr(o.bas)}–${nbFr(o.haut)}${ret}`;
  return `${e}${NOMS[o.type]}${ret}`;
}
/* aimantation : le prix cliqué va au haut, bas, ouverture ou clôture de la bougie la plus proche s'il en est à moins de « tol » */
export function aimanter(prix, b, tol) {
  if (!b || !(tol > 0)) return prix; let best = null;
  for (const p of [b.h, b.l, b.o, b.c]) if (Math.abs(p - prix) <= tol && (best == null || Math.abs(p - prix) < Math.abs(best - prix))) best = p;
  return best == null ? prix : best;
}
/* export / import JSON (objets + décisions sur les niveaux proposés) ; l'import valide chaque objet et ignore le reste */
export const FORMAT = 'rayle-or-outils-1';
export function exporter(objets, decisions = []) { return JSON.stringify({ format: FORMAT, exporte: new Date().toISOString(), objets, decisions }, null, 1); }
export function importer(texte) {
  let j; try { j = JSON.parse(texte); } catch (e) { return { objets: [], decisions: [], erreur: 'fichier illisible (JSON invalide)' }; }
  if (!j || j.format !== FORMAT || !Array.isArray(j.objets)) return { objets: [], decisions: [], erreur: 'format inconnu' };
  const objets = j.objets.map(o => { if (!o || !TYPES.includes(o.type)) return null; const n = creer(o.type, o, { t: o.cree, id: typeof o.id === 'string' ? o.id : undefined }); return n && { ...n, origine: o.origine || n.origine }; }).filter(Boolean);
  const decisions = Array.isArray(j.decisions) ? j.decisions.filter(d => d && typeof d.cle === 'string' && ['confirme', 'supprime'].includes(d.etat)) : [];
  return { objets, decisions, ignores: j.objets.length - objets.length };
}
/* distance (en prix) d'un point écran à un objet, pour la sélection : rendu par la couche de dessin */
export const cleNiveau = (sorte, t, p) => `${sorte}|${t}|${Math.round(p * 100)}`;
