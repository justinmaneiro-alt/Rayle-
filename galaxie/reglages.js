import { NIVEAUX } from './qualite.js';

/* ═════════════ RÉGLAGES DE LA GALAXIE ═════════════
   Module pur (testé sous Node : galaxie/tests/reglages-test.mjs). Les réglages restent sur l'appareil (localStorage) :
   chaque machine a ses propres capacités, ils ne se synchronisent donc pas entre PC, tablette et téléphone.

   Un réglage « auto » laisse décider le niveau de qualité ; les réglages avancés (null = suivre le niveau) le surchargent. */
export const CLE = 'rayle_galaxie_reglages';
export const APPAREILS = ['auto', 'pc', 'tablette', 'telephone'];
export const NIVEAUX_QUALITE = ['auto', 'haute', 'moyenne', 'basse'];
export const LIMITES_FPS = [0, 30, 60, 90, 120, 144];   // 0 = pas de limite (suit l'écran)
const DEPART_APPAREIL = { pc: 'haute', tablette: 'moyenne', telephone: 'basse' };
const FPS_APPAREIL = { pc: 0, tablette: 60, telephone: 30 };

export const DEFAUTS = Object.freeze({
  qualite: 'auto',
  appareil: 'auto',
  echelle: 100,        // % de la résolution du niveau (50 à 100)
  bloom: null,         // null = selon le niveau ; true / false = forcé
  msaa: null,          // null = selon le niveau ; 0, 2 ou 4
  densite: 100,        // % d'étoiles, d'astéroïdes et de neurones (20 à 100)
  vitesse: 100,        // % de la vitesse de base du système (10 à 300) : rotations et révolutions
  fpsMax: null,        // null = selon l'appareil ; sinon une valeur de LIMITES_FPS
  afficherFps: true,
  jeu: Object.freeze({ fps: 30, echelle: 60, pauseHorsFocus: true, reduireTextures: true })
});

const nombre = (v, min, max, defaut) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : defaut; };
const choix = (v, liste, defaut) => (liste.includes(v) ? v : defaut);

/* Accepte n'importe quoi (JSON ancien, corrompu, édité à la main) et renvoie toujours un réglage complet et valide. */
export function normaliser(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const j = b.jeu && typeof b.jeu === 'object' ? b.jeu : {};
  return {
    qualite: choix(b.qualite, NIVEAUX_QUALITE, DEFAUTS.qualite),
    appareil: choix(b.appareil, APPAREILS, DEFAUTS.appareil),
    echelle: nombre(b.echelle, 50, 100, DEFAUTS.echelle),
    bloom: typeof b.bloom === 'boolean' ? b.bloom : null,
    msaa: [0, 2, 4].includes(b.msaa) ? b.msaa : null,
    densite: nombre(b.densite, 20, 100, DEFAUTS.densite),
    vitesse: nombre(b.vitesse, 10, 300, DEFAUTS.vitesse),
    fpsMax: LIMITES_FPS.includes(b.fpsMax) ? b.fpsMax : null,
    afficherFps: typeof b.afficherFps === 'boolean' ? b.afficherFps : DEFAUTS.afficherFps,
    jeu: {
      fps: [15, 20, 30, 45, 60].includes(j.fps) ? j.fps : DEFAUTS.jeu.fps,
      echelle: nombre(j.echelle, 40, 100, DEFAUTS.jeu.echelle),
      pauseHorsFocus: typeof j.pauseHorsFocus === 'boolean' ? j.pauseHorsFocus : DEFAUTS.jeu.pauseHorsFocus,
      reduireTextures: typeof j.reduireTextures === 'boolean' ? j.reduireTextures : DEFAUTS.jeu.reduireTextures
    }
  };
}

export function lire(stockage = globalThis.localStorage) {
  try { return normaliser(JSON.parse(stockage.getItem(CLE) || 'null')); } catch (e) { return normaliser(null); }
}
export function ecrire(r, stockage = globalThis.localStorage) { try { stockage.setItem(CLE, JSON.stringify(normaliser(r))); } catch (e) {} }

/* Appareil réel quand le réglage est « auto » : pc, tablette ou telephone. */
export function detecterAppareil(env = {}) {
  const tactile = env.tactile ?? (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  const largeur = env.largeur ?? (typeof screen !== 'undefined' ? Math.min(screen.width, screen.height) : 1080);
  const mobile = env.mobile ?? (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ''));
  if (!tactile && !mobile) return 'pc';
  return largeur < 600 ? 'telephone' : 'tablette';
}
export const appareilEffectif = (r, env) => (r.appareil === 'auto' ? detecterAppareil(env) : r.appareil);

/* Niveau de qualité de départ : le choix de l'utilisateur, ou celui de l'appareil quand il est en « auto ». */
export const niveauDeDepart = (r, env) => (r.qualite === 'auto' ? DEPART_APPAREIL[appareilEffectif(r, env)] : r.qualite);

/* Paramètres de rendu concrets = niveau + réglages avancés (+ mode jeu qui prime sur tout). */
export function parametres(r, niveauNom, { jeu = false, appareil } = {}) {
  const n = NIVEAUX[niveauNom] || NIVEAUX.haute;
  const dispositif = appareil || appareilEffectif(r);
  const densite = r.densite / 100;
  if (jeu) {
    const basse = NIVEAUX.basse;
    return {
      dpr: Math.max(0.4, basse.dpr * r.jeu.echelle / 100), bloom: false, bloomForce: 0, msaa: 0, anisotropie: 1,
      etoiles: Math.round(basse.etoiles * 0.4), asteroides: Math.round(basse.asteroides * 0.3), nuee: Math.round(basse.nuee * 0.5),
      fpsMax: r.jeu.fps, animerDecor: false, riche: false, asteroidesDetail: 'basse'
    };
  }
  return {
    dpr: Math.max(0.4, n.dpr * r.echelle / 100),
    bloom: r.bloom === null ? n.bloom : r.bloom, bloomForce: n.bloomForce || 0.7,
    msaa: r.msaa === null ? n.msaa : r.msaa, anisotropie: n.anisotropie,
    etoiles: Math.round(n.etoiles * densite), asteroides: Math.round(n.asteroides * densite), nuee: Math.round(n.nuee * densite),
    fpsMax: r.fpsMax === null ? FPS_APPAREIL[dispositif] : r.fpsMax, animerDecor: true, riche: n.riche !== false, asteroidesDetail: n.asteroidesDetail || 'haute'
  };
}

/* Texte lisible d'un réglage modifié (pour l'affichage et la voix). */
export const nomQualite = { auto: 'automatique', haute: 'haute', moyenne: 'moyenne', basse: 'basse' };
