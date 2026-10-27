/* ═════════════ RÉGLAGES DE LA TERRE (pur, sauf lire/ecrire) ═════════════
   Stockés sur l'appareil seulement (rayle_terre_reglages), jamais synchronisés ni envoyés au Worker. */
export const CLE = 'rayle_terre_reglages';
export const DEFAUT = Object.freeze({
  exag: 2,            // exagération du relief (1 = réel)
  eox: true,          // imagerie Sentinel-2 haute résolution (CC BY-NC-SA : usage non commercial)
  batiments: true, noms: true, nuages: true, ocean: true,
  radar: false,       // radar de pluie (RainViewer) sur le globe
  nuagesReels: false, // image satellite du jour (nuages réels, NASA VIIRS) à la place de Blue Marble
  meteoAnim: true,    // nuages et pluie animés d'après la météo réelle du lieu, en s'approchant
  regional: true,     // photographies aériennes ouvertes (IGN, swisstopo, PNOA, PDOK, basemap.at, ČÚZK, GSI, USGS) là où elles existent
  ombres: true,       // ombres portées des bâtiments et du relief
  profil: 'auto',     // auto | haute | moyenne | basse
  fps: false
});
const lim = (v, a, b, d) => { v = Number(v); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
export function normaliser(o) {
  const r = o && typeof o === 'object' ? o : {};
  return {
    exag: lim(r.exag, 1, 10, DEFAUT.exag), eox: bool(r.eox, DEFAUT.eox), batiments: bool(r.batiments, DEFAUT.batiments), noms: bool(r.noms, DEFAUT.noms),
    nuages: bool(r.nuages, DEFAUT.nuages), ocean: bool(r.ocean, DEFAUT.ocean), fps: bool(r.fps, DEFAUT.fps),
    regional: bool(r.regional, DEFAUT.regional), ombres: bool(r.ombres, DEFAUT.ombres), radar: bool(r.radar, DEFAUT.radar), nuagesReels: bool(r.nuagesReels, DEFAUT.nuagesReels), meteoAnim: bool(r.meteoAnim, DEFAUT.meteoAnim),
    profil: ['auto', 'haute', 'moyenne', 'basse'].includes(r.profil) ? r.profil : DEFAUT.profil
  };
}
/* Profil de rendu réellement utilisé : le choix manuel, sinon celui de la galaxie ; le mode jeu force « basse ». */
export function profilEffectif(r, { niveauGalaxie = 'haute', jeu = false } = {}) {
  if (jeu) return 'basse';
  if (r.profil !== 'auto') return r.profil;
  return ['haute', 'moyenne', 'basse'].includes(niveauGalaxie) ? niveauGalaxie : 'haute';
}
export function lire() { try { return normaliser(JSON.parse(localStorage.getItem(CLE))); } catch (e) { return normaliser(null); } }
export function ecrire(r) { try { localStorage.setItem(CLE, JSON.stringify(normaliser(r))); } catch (e) {} }
