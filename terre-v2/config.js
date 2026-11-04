/* ═════════════ TERRE 2.0 : CONFIGURATION ═════════════
   JETON_CESIUM_PUBLIC : jeton Cesium ion GRATUIT, restreint au domaine GitHub Pages de Justin (il peut être public : Cesium le limite à ce domaine).
   Vide = globe sans relief ni bâtiments 3D, sans erreur. Procédure : RAPPORT-NUIT.md, section « Jeton Cesium ».
   Les clés facultatives (Google 3D, AISStream, FIRMS) ne sont JAMAIS ici : elles sont collées dans le panneau « Couches » et restent dans le navigateur (localStorage). */
export const JETON_CESIUM_PUBLIC = '';

export const VERSION_CESIUM = '1.123.0';
export const CESIUM_BASE = `https://cdn.jsdelivr.net/npm/cesium@${VERSION_CESIUM}/Build/Cesium/`;
export const SATELLITE_JS = 'https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/dist/satellite.min.js';
/* petit relais séparé, sans secret, pour les sources sans CORS (avions, FIRMS) ; vide = couches concernées en secours ou désactivées */
export const RELAIS = 'https://rayle-terre-relais.justinmaneiro.workers.dev';

const CLE = 'rayle_terre2';
export const DEFAUTS = { jetonCesium: '', cleGoogle: '', cleAis: '', cleFirms: '', google3d: false, relief: true, batiments: true, noms: true, couches: { seismes: true }, vision: 'normal', qualite: 'auto', fps: true };
export function lire() { try { const o = JSON.parse(localStorage.getItem(CLE)) || {}; return { ...DEFAUTS, ...o, couches: { ...DEFAUTS.couches, ...(o.couches || {}) } }; } catch (e) { return { ...DEFAUTS, couches: { ...DEFAUTS.couches } }; } }
export function ecrire(r) { try { localStorage.setItem(CLE, JSON.stringify(r)); } catch (e) { /* stockage refusé : réglages de la visite seulement */ } }
export const jeton = r => (r.jetonCesium || JETON_CESIUM_PUBLIC || '').trim();

/* qualité automatique : rend la nouvelle échelle de rendu selon les images/s mesurées (pur, testé) */
export function ajusterQualite(echelle, fps, { bas = 40, haut = 85, min = 0.6, max = 1 } = {}) {
  if (fps < bas) return Math.max(min, Math.round((echelle - 0.1) * 100) / 100);
  if (fps > haut) return Math.min(max, Math.round((echelle + 0.05) * 100) / 100);
  return echelle;
}
