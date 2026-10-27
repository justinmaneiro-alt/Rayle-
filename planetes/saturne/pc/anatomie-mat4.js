/* ═════════════ ANATOMIE : MATHS 3D MINIMALES (module pur, sans dépendance) ═════════════
   Vecteurs = tableaux [x, y, z] ; matrices 4×4 = tableaux de 16 nombres en colonnes (même disposition que three.js : éléments 12, 13, 14 = translation).
   Servent au moteur de cinématique (anatomie-cinematique.js) et à ses tests, qui tournent sous Node comme dans le navigateur. */
export const DEG = Math.PI / 180;
export const v = (x = 0, y = 0, z = 0) => [x, y, z];
export const ajouter = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const croix = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norme = a => Math.hypot(a[0], a[1], a[2]);
export const unitaire = a => { const n = norme(a); return n < 1e-12 ? [0, 0, 0] : [a[0] / n, a[1] / n, a[2] / n]; };
export const dist = (a, b) => norme(sub(a, b));
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const identite = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function multiplier(a, b) {          // a · b (b appliquée d'abord)
  const r = new Array(16);
  for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) r[c * 4 + l] = a[l] * b[c * 4] + a[4 + l] * b[c * 4 + 1] + a[8 + l] * b[c * 4 + 2] + a[12 + l] * b[c * 4 + 3];
  return r;
}
export const chaine = (...ms) => ms.reduce((acc, m) => multiplier(acc, m));
export const translation = t => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1];
export function rotationAxe(axe, angle) {   // angle en radians, axe unitaire ou non
  const [x, y, z] = unitaire(axe), c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  return [t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0, t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0, t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1];
}
export const point = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
export const direction = (m, d) => [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
/* Rotation d'angle `angle` autour d'un axe passant par le point p (le point p reste fixe). */
export const rotationAutour = (p, axe, angle) => chaine(translation(p), rotationAxe(axe, angle), translation(mul(p, -1)));
/* Inverse d'une transformation rigide (rotation + translation). */
export function inverseRigide(m) {
  const r = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1], t = [m[12], m[13], m[14]], ti = [-(r[0] * t[0] + r[4] * t[1] + r[8] * t[2]), -(r[1] * t[0] + r[5] * t[1] + r[9] * t[2]), -(r[2] * t[0] + r[6] * t[1] + r[10] * t[2])];
  r[12] = ti[0]; r[13] = ti[1]; r[14] = ti[2]; return r;
}
/* Rotation la plus courte qui amène la direction a sur la direction b (matrice sans translation). */
export function rotationEntre(a, b) {
  const u = unitaire(a), w = unitaire(b), c = dot(u, w);
  if (c > 1 - 1e-12) return identite();
  if (c < -1 + 1e-12) { const o = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; return rotationAxe(croix(u, o), Math.PI); }
  return rotationAxe(croix(u, w), Math.acos(Math.max(-1, Math.min(1, c))));
}
/* Rotation qui amène le repère (a1, a2) sur le repère (b1, b2) : a1→b1 exactement, puis a2 projeté dans le plan ⟂ b1 → b2 projeté. */
export function rotationRepere(a1, a2, b1, b2) {
  const R1 = rotationEntre(a1, b1), a2r = direction(R1, a2), u = unitaire(b1);
  const p = sub(a2r, mul(u, dot(a2r, u))), q = sub(b2, mul(u, dot(b2, u)));
  if (norme(p) < 1e-9 || norme(q) < 1e-9) return R1;
  const pu = unitaire(p), qu = unitaire(q), ang = Math.atan2(dot(croix(pu, qu), u), dot(pu, qu));
  return multiplier(rotationAxe(u, ang), R1);
}
/* Angle (radians) et axe d'une rotation 3×3 contenue dans une matrice 4×4. */
export function angleRotation(m) { const tr = m[0] + m[5] + m[10]; return Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2))); }
/* Axe unitaire et angle (radians, 0 à π) d'une rotation contenue dans une matrice 4×4. */
export function axeAngle(m) {
  const ang = angleRotation(m), s = Math.sin(ang);
  if (ang < 1e-9) return { axe: [0, 1, 0], angle: 0 };
  if (Math.abs(s) < 1e-6) { const d = [Math.sqrt(Math.max(0, (m[0] + 1) / 2)), Math.sqrt(Math.max(0, (m[5] + 1) / 2)), Math.sqrt(Math.max(0, (m[10] + 1) / 2))]; return { axe: unitaire(d), angle: ang }; }
  return { axe: unitaire([m[6] - m[9], m[8] - m[2], m[1] - m[4]]), angle: ang };
}
/* Quaternions [x, y, z, w] : conversion depuis / vers une matrice, interpolation sphérique (mélange de deux orientations, transitions de mouvement). */
export function quatDepuisMat(m) {
  const t = m[0] + m[5] + m[10]; let x, y, z, w;
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; w = s / 4; x = (m[6] - m[9]) / s; y = (m[8] - m[2]) / s; z = (m[1] - m[4]) / s; }
  else if (m[0] > m[5] && m[0] > m[10]) { const s = Math.sqrt(1 + m[0] - m[5] - m[10]) * 2; w = (m[6] - m[9]) / s; x = s / 4; y = (m[4] + m[1]) / s; z = (m[8] + m[2]) / s; }
  else if (m[5] > m[10]) { const s = Math.sqrt(1 + m[5] - m[0] - m[10]) * 2; w = (m[8] - m[2]) / s; x = (m[4] + m[1]) / s; y = s / 4; z = (m[9] + m[6]) / s; }
  else { const s = Math.sqrt(1 + m[10] - m[0] - m[5]) * 2; w = (m[1] - m[4]) / s; x = (m[8] + m[2]) / s; y = (m[9] + m[6]) / s; z = s / 4; }
  const n = Math.hypot(x, y, z, w) || 1; return [x / n, y / n, z / n, w / n];
}
export function matDepuisQuat(q) {
  const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [1 - (yy + zz), xy + wz, xz - wy, 0, xy - wz, 1 - (xx + zz), yz + wx, 0, xz + wy, yz - wx, 1 - (xx + yy), 0, 0, 0, 0, 1];
}
export function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], bb = b;
  if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]]; }
  if (d > 0.9995) { const r = [0, 1, 2, 3].map(i => a[i] + (bb[i] - a[i]) * t), n = Math.hypot(...r); return r.map(x => x / n); }
  const th = Math.acos(d), s = Math.sin(th), k1 = Math.sin((1 - t) * th) / s, k2 = Math.sin(t * th) / s;
  return [0, 1, 2, 3].map(i => a[i] * k1 + bb[i] * k2);
}
/* Mélange de deux transformations rigides : rotation interpolée (slerp), translation interpolée linéairement. t = 0 → a, t = 1 → b. */
export function melangerRigide(a, b, t) {
  const m = matDepuisQuat(slerp(quatDepuisMat(a), quatDepuisMat(b), t));
  m[12] = a[12] + (b[12] - a[12]) * t; m[13] = a[13] + (b[13] - a[13]) * t; m[14] = a[14] + (b[14] - a[14]) * t; return m;
}
export const copie = m => m.slice();
export const projeteSurPlan = (a, n) => sub(a, mul(n, dot(a, n)));
export const angleEntre = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(unitaire(a), unitaire(b)))));
/* Angle signé de a vers b autour de l'axe n (radians). */
export const angleSigne = (a, b, n) => { const pa = unitaire(projeteSurPlan(a, unitaire(n))), pb = unitaire(projeteSurPlan(b, unitaire(n))); return Math.atan2(dot(croix(pa, pb), unitaire(n)), dot(pa, pb)); };
/* Courbes d'accélération (0 → 1) pour des mouvements fluides. */
export const lisse = t => { const x = Math.max(0, Math.min(1, t)); return x * x * x * (x * (6 * x - 15) + 10); };          // « smootherstep » : vitesse et accélération nulles aux extrémités
export const ease = t => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, t)));                                   // sinusoïdale
export const pic = t => 0.5 - 0.5 * Math.cos(2 * Math.PI * t);                                                          // 0 → 1 → 0 sur un cycle
