import { MOUVEMENTS2 } from './anatomie-mouvements2.js';
import { MOUVEMENTS_TEXTES } from './anatomie-mouvement-textes.js';

/* ═════════════ ANATOMIE : CATALOGUE DES MOUVEMENTS (cinématique V2 + textes explicatifs) ═════════════
   Réunit, pour chaque mouvement, la fonction de pose (anatomie-mouvements2.js) et ses textes (anatomie-mouvement-textes.js). Recherche par nom ou alias, texte parlé. */
export const A_VERIFIER_MVT2 = 'Mouvement simplifié, amplitudes de référence classiques : à vérifier avec le cours / un atlas de référence.';
export const MOUVEMENTS_V2 = MOUVEMENTS2.map(m => ({ ...m, ...MOUVEMENTS_TEXTES[m.id], niveau: 'simplifié' }));
const nn = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
/* Mouvement d'après un texte libre (français) : le plus long nom ou alias contenu dans le texte ; null si inconnu. */
export function trouverMouvementV2(texte) {
  const n = nn(texte); let meilleur = null, taille = 0;
  for (const m of MOUVEMENTS_V2) for (const a of [m.nom, ...m.alias]) { const k = nn(a); if (k && (n === k || n.includes(k)) && k.length > taille) { meilleur = m; taille = k.length; } }
  return meilleur;
}
export const parIdV2 = id => MOUVEMENTS_V2.find(m => m.id === id) || null;
export function explicationParleeV2(m) { return m.nom + '. ' + m.explication + ' Amplitude de référence : ' + m.amplitude + '. Agonistes en rouge, antagonistes en bleu, stabilisateurs en gris. ' + A_VERIFIER_MVT2; }
