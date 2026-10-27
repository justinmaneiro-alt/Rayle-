/* ═════════════ MODES DE L'ACCUEIL : complet · normal · léger (module pur, testé sous Node : galaxie/tests/modes-accueil-test.mjs) ═════════════
   Même entité partout (même style que le soleil de la galaxie) ; seuls changent le nombre de neurones, la netteté et la lueur.
   Le choix « auto » détecte l'appareil, puis l'entité s'allège toute seule si les images par seconde chutent (jamais de remontée automatique).
   Numéros historiques de Entite.qualite() : 0 complet · 1 normal · 2 léger (3 = ancien dessin 2D, géré par entite.js). */
export const MODES = [
  { nom: 'complet', nuee: 12000, dpr: 1.5,  bloom: true,  force: 0.85, fps: 60, riche: true, vie: 1 },
  { nom: 'normal',  nuee: 8000,  dpr: 1.25, bloom: true,  force: 0.7,  fps: 60, riche: true, vie: 0.75 },
  { nom: 'leger',   nuee: 6000,  dpr: 1,    bloom: false, force: 0,    fps: 60, riche: true, vie: 0.45 }
];
export const LIBELLES = { complet: 'Complet', normal: 'Normal', leger: 'Léger' };

const GPU_SOFTWARE = /swiftshader|llvmpipe|software|basic render/i;
const GPU_FAIBLE = /mali-(4|t[0-7])|adreno[^0-9]*(1|2|3)\d\d\b|powervr|videocore|vivante/i;

/* env : { largeur, tactile, memoire (Go, null si inconnu), coeurs, gpu (texte du pilote ou '') } → index dans MODES */
export function detecterMode(env = {}) {
  const largeur = env.largeur || 1280, coeurs = env.coeurs || 4, memoire = env.memoire == null ? null : env.memoire, gpu = env.gpu || '';
  if (GPU_SOFTWARE.test(gpu) || GPU_FAIBLE.test(gpu)) return 2;
  if (largeur < 500) return 2;                                   // téléphone
  if (env.tactile || largeur < 1100) {                            // tablette (ou petit écran)
    return coeurs >= 6 && (memoire == null || memoire >= 4) ? 1 : 2;
  }
  if (coeurs <= 4 || (memoire != null && memoire <= 4)) return 1; // PC modeste
  return 0;                                                       // PC (RTX 3070 et plus)
}

/* Largeur « de l'appareil » pour la détection : un PC (souris) compte avec la largeur de son ÉCRAN, pas celle de la fenêtre (une petite fenêtre de Chrome sur un écran 1440p ne fait pas un PC faible) ;
   un appareil tactile compte avec sa fenêtre (la plus petite dimension élargie, pour un téléphone tenu en paysage). */
export function largeurAppareil({ largeurFenetre = 1280, hauteurFenetre = 720, largeurEcran = 0, tactile = false } = {}) {
  if (tactile) return Math.min(largeurFenetre, hauteurFenetre * 1.8);
  return Math.max(largeurFenetre, largeurEcran || 0);
}

/* choix : 'auto' | 0 | 1 | 2 (les autres valeurs, dont 3, ne concernent pas ce moteur) → index dans MODES */
export function modeEffectif(choix, env) {
  const n = Number(choix);
  if (choix !== 'auto' && choix != null && Number.isInteger(n) && n >= 0 && n <= 2) return n;
  return detecterMode(env);
}
