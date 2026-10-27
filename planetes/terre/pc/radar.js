import { ancetre } from './geo.js';

/* ═════════════ RADAR DE PLUIE (RainViewer) ═════════════
   API publique gratuite de RainViewer (https://www.rainviewer.com/api.html) : mosaïque mondiale des radars météo, une image toutes les 10 minutes
   sur les 2 dernières heures (« passé » seulement : pas de prévision). Usage personnel et éducatif, mention demandée, disponibilité non garantie.
   Niveau de zoom maximal réel : 7 (au-delà, le serveur renvoie une image vide : on étire donc le niveau 7). Pas de radar au-dessus des océans ni là où
   aucun radar n'existe : « pas d'écho » n'est pas « pas de pluie ». Les adresses sont construites ici ; le chargement passe par les Workers de tuiles. */
const T = (typeof globalThis !== 'undefined' && globalThis.__RAYLE_TERRE_TEST__) || {};
export const INDEX = T.radar || 'https://api.rainviewer.com/public/weather-maps.json';
export const Z_RADAR = 7;
export const PALETTE = 2;                // « Universal Blue »

/* Réponse de l'index → { hote, images:[{ temps, chemin }] } (anciennes → récentes) ; null si inutilisable */
export function lireIndex(j) {
  if (!j || typeof j.host !== 'string' || !/^(?:https:\/\/|http:\/\/127\.0\.0\.1[:/])/.test(j.host) || !j.radar || !Array.isArray(j.radar.past)) return null;
  const images = j.radar.past.filter(p => p && Number.isFinite(p.time) && typeof p.path === 'string' && /^\/v2\/radar\/[A-Za-z0-9_-]+$/.test(p.path)).map(p => ({ temps: p.time * 1000, chemin: p.path })).sort((a, b) => a.temps - b.temps);
  return images.length ? { hote: j.host.replace(/\/+$/, ''), images, genere: Number.isFinite(j.generated) ? j.generated * 1000 : Date.now() } : null;
}
/* Tuile (z,x,y) affichée → adresse de l'image radar et sous-rectangle */
export function tuileRadar(index, rang, z, x, y) {
  const im = index.images[Math.max(0, Math.min(index.images.length - 1, rang))], a = ancetre(z, x, y, Math.min(z, Z_RADAR));
  return { url: `${index.hote}${im.chemin}/256/${a.zs}/${a.xs}/${a.ys}/${PALETTE}/1_1.png`, rect: [a.ox, a.oy, a.k], temps: im.temps };
}
export const heureImage = temps => new Date(temps).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
