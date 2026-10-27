import { creerCalcul } from '../../../core/commun/fenetres-calcul.js';

/* ═════════════ ANATOMIE : PLACEMENT DES FENÊTRES HOLOGRAPHIQUES (profil du calcul commun, module pur, testé) ═════════════
   Le calcul vient du gestionnaire commun (core/commun/fenetres-calcul.js). Ici : les zones propres à la salle médicale, à éviter si possible — le panneau de commande
   (colonne de gauche, poids 3) et la colonne centrale où se tient le modèle (poids 1,2). */
export const largeurPanneau = ecran => (ecran.l < 821 ? 0 : Math.max(300, Math.min(400, Math.round(ecran.l * 0.22))));
export function zonesInterdites(ecran) {
  if (ecran.l < 821) return [];
  const p = largeurPanneau(ecran), zones = [{ x: 0, y: 0, l: p + 10, h: ecran.h, poids: 3 }];
  const lc = Math.round(ecran.l * 0.24); zones.push({ x: Math.round(ecran.l / 2 - lc / 2), y: Math.round(ecran.h * 0.14), l: lc, h: Math.round(ecran.h * 0.66), poids: 1.2, modele: true });
  return zones;
}
export const calculAnatomie = creerCalcul({ marge: 10, haut: 102, bas: 170, miniL: 320, miniH: 200, tailles: { vue3d: [0.34, 0.74] }, plafond: { vue3d: [700, 780] }, zones: zonesInterdites });
export const { MARGE, HAUT_RESERVE, BAS_RESERVE, MINI_L, MINI_H, SEUIL_ETROIT, etroit, tailleParDefaut, limiter, placer, reorganiser, recouvrements, dansEcran, pleinEcran, pincer, chevauchement } = calculAnatomie;
