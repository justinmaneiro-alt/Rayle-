import { PATHOS_RACHIS } from './anatomie-patho-rachis.js';
import { PATHOS_MEMBRES } from './anatomie-patho-membres.js';
import { PATHOS_NEURO_ORTHO } from './anatomie-patho-neuro-ortho.js';
import { PATHOLOGIES } from './anatomie-pathologies-calcul.js';
import { norm } from './anatomie-catalogue.js';

/* ═════════════ ANATOMIE : CATALOGUE COMPLET DES PATHOLOGIES (Phase E) ═════════════
   Réunit les 34 cas modélisés en S6 (anatomie-pathologies-calcul.js, niveau « modèle 3D » ou « simplifié ») et les fiches de la phase E (rachis, membres, neurologie, orthopédie).
   Chaque cas a une catégorie, un niveau (modèle 3D · simplifié · schématique · information générale), une recherche par nom et alias. NE PRÉTEND PAS À L'EXHAUSTIVITÉ MÉDICALE. */
const niveauDe = p => (p.categorie === 'déformation du rachis' || /amputation|déficience|fracture/.test(p.categorie) ? 'modèle 3D' : /attitude|déformation|neurologique/.test(p.categorie) ? 'simplifié' : 'information générale');
export const EXTRA = [...PATHOS_RACHIS, ...PATHOS_MEMBRES, ...PATHOS_NEURO_ORTHO];
export const TOUTES = [...PATHOLOGIES.map(p => ({ ...p, niveau: p.niveau || niveauDe(p), categorie: 'Cas modélisés : ' + p.categorie })), ...EXTRA.map(p => ({ ...p, categorie: p.categorie }))];
export const parId = id => TOUTES.find(p => p.id === id) || null;
export const extraParId = id => EXTRA.find(p => p.id === id) || null;
/* Cas d'après un texte libre : le plus long nom ou alias contenu dans le texte (ou égal) ; null si inconnu. Les fiches de la phase E sont cherchées par leur nom entier ou un mot clé fort. */
export function trouverExtra(texte) {
  const n = norm(texte); if (!n) return null; let m = null, t = 0;
  for (const p of EXTRA) for (const a of [p.nom, ...(p.alias || [])]) { const k = norm(a.replace(/\([^)]*\)/g, ' ')); if (k.length > 3 && (n === k || n.includes(k)) && k.length > t) { m = p; t = k.length; } }
  if (m) return m;
  // mot clé : au moins deux mots significatifs du nom présents dans la demande
  let meilleur = null, score = 0; const mots = n.split(' ').filter(w => w.length > 3);
  for (const p of EXTRA) { const kk = norm(p.nom.replace(/\([^)]*\)/g, ' ')).split(' ').filter(w => w.length > 3); const c = kk.filter(w => mots.includes(w)).length; if (c >= 2 && c > score) { meilleur = p; score = c; } }
  return meilleur;
}
export const categoriesPatho = () => { const s = new Map(); for (const p of TOUTES) s.set(p.categorie, (s.get(p.categorie) || 0) + 1); return [...s.entries()].map(([nom, nb]) => ({ nom, nb })); };
export const RUBRIQUES = ['description', 'causes', 'mecanisme', 'signes', 'appareillage'];
