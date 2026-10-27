import { vers, sub, dot, faceCamera } from './geo.js';

/* ═════════════ PROJECTION D'UN POINT DU GLOBE SUR L'ÉCRAN (pur) ═════════════
   Utilisée par les noms de lieux, les repères de pays et les liaisons vers les fenêtres. pose : issue de camera-orbite.js. */
export function projeter(pose, fov, largeur, hauteur, lon, lat, h = 0) {
  const P = vers(lon, lat, h), cam = pose.cam, rel = sub(P, cam);
  const face = faceCamera(P, cam);                          // le point est de ce côté de l'horizon
  const z = dot(rel, pose.avant);
  if (!face || z < 0.05) return null;
  const ty = Math.tan(fov / 2), tx = ty * (largeur / hauteur);
  return { x: (dot(rel, pose.droite) / (z * tx) * 0.5 + 0.5) * largeur, y: (0.5 - dot(rel, pose.haut) / (z * ty) * 0.5) * hauteur, z };
}
