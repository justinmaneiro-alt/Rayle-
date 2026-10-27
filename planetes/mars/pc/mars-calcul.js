/* ═════════════ MARS : CALCULS PURS (aucune dépendance ; testés sous Node : planetes/mars/tests/mars-calcul-test.mjs) ═════════════
   Repère de la planète dans la scène : celui de la sphère de la galaxie (SphereGeometry de three.js, texture équirectangulaire), pour que la texture,
   la position de la base et la sortie vers la galaxie restent cohérentes. Repère local de la base : x = est, y = haut, z = sud (le nord est en -z).
   Les durées sont en heures martiennes (un sol martien = 24 h 37 min ; ici « heure » = heure solaire locale 0 à 24). */
export const RAYON_MARS_KM = 3389.5;
export const R = 100;                                         // rayon de Mars dans la scène en orbite (unités de scène)
export const BASE = { nom: 'Base Raylé', site: 'cratère Jezero', lon: 77.5, lat: 18.4 };   // site réel : Jezero (Isidis Planitia)
export const ECHELLE_BASE = 8;                                // diamètre de la base en unités de scène (≈ 270 km : échelle EXAGÉRÉE pour la voir depuis l'orbite)
export const DECLINAISON_DEG = 10;                            // saison : déclinaison du soleil
export const HEURE_DEPART = 17.4;                             // fin d'après-midi : soleil bas, lumières de la base visibles

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
export const rad = d => d * RAD;
export const deg = r => r * DEG;
export const norme = v => Math.hypot(v[0], v[1], v[2]);
export const unitaire = v => { const n = norme(v) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
export const scal = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vect = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const ajouter = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const borner = (v, a, b) => Math.min(b, Math.max(a, v));
export const lisse = (a, b, x) => { const t = borner((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* Direction (unitaire, repère de la sphère) d'un point de la surface. longitude -180..180 (est positif), latitude -90..90. */
export function dirDeLonLat(lon, lat) {
  const phi = (lon + 180) * RAD, c = Math.cos(lat * RAD);
  return [-Math.cos(phi) * c, Math.sin(lat * RAD), Math.sin(phi) * c];
}
export function lonLatDeDir(d) {
  const u = unitaire(d), lat = Math.asin(borner(u[1], -1, 1)) * DEG;
  let lon = Math.atan2(u[2], -u[0]) * DEG - 180; lon = ((lon + 540) % 360) - 180;
  return { lon, lat };
}
/* Base locale en un point : est, nord, haut (vecteurs unitaires dans le repère de la sphère). */
export function baseLocale(lon, lat) {
  const haut = dirDeLonLat(lon, lat), phi = (lon + 180) * RAD;
  const est = unitaire([Math.sin(phi), 0, Math.cos(phi)]);
  const nord = unitaire(vect(haut, est));
  return { est, nord, haut };
}
/* Vecteur local (e, n, u) → repère de la sphère. */
export function localVersSphere(b, e, n, u) { return [b.est[0] * e + b.nord[0] * n + b.haut[0] * u, b.est[1] * e + b.nord[1] * n + b.haut[1] * u, b.est[2] * e + b.nord[2] * n + b.haut[2] * u]; }

/* ── Soleil ── hauteur et azimut (0 = nord, 90 = est) d'après l'heure solaire locale, la latitude et la déclinaison. */
export function soleilLocal(heure, lat = BASE.lat, decl = DECLINAISON_DEG) {
  const H = (heure - 12) * 15 * RAD, f = lat * RAD, d = decl * RAD;
  const sinH = Math.sin(f) * Math.sin(d) + Math.cos(f) * Math.cos(d) * Math.cos(H);
  const elev = Math.asin(borner(sinH, -1, 1));
  const e = -Math.cos(d) * Math.sin(H);                                                   // composantes est, nord, haut
  const n = Math.cos(f) * Math.sin(d) - Math.sin(f) * Math.cos(d) * Math.cos(H);
  const u = sinH;
  const azim = (Math.atan2(e, n) * DEG + 360) % 360;
  return { elev: elev * DEG, azim, e, n, u };
}
/* 0 = plein jour, 1 = nuit noire (lumières de la base à fond). */
export const nuit = elevDeg => lisse(4, -8, elevDeg);
/* 0 = nuit, 1 = jour franc (pilote la clarté du ciel). */
export const jour = elevDeg => lisse(-6, 12, elevDeg);

/* Direction d'un objet céleste fixe (ascension droite relative au soleil à midi, déclinaison) vu du site à une heure donnée. */
export function objetCeleste(heure, lat, angleHoraire0Deg, declDeg) {
  const H = ((heure - 12) * 15 + angleHoraire0Deg) * RAD, f = lat * RAD, d = declDeg * RAD;
  const sinH = Math.sin(f) * Math.sin(d) + Math.cos(f) * Math.cos(d) * Math.cos(H);
  const e = -Math.cos(d) * Math.sin(H), n = Math.cos(f) * Math.sin(d) - Math.sin(f) * Math.cos(d) * Math.cos(H);
  return { elev: Math.asin(borner(sinH, -1, 1)) * DEG, azim: (Math.atan2(e, n) * DEG + 360) % 360, e, n, u: sinH };
}
/* La Terre vue de Mars : étoile du soir, à l'est du soleil de ~35° (angle horaire -35°), un peu plus au nord. */
export const TERRE_CIEL = { angleHoraire: 38, declinaison: DECLINAISON_DEG + 7 };

/* Phobos : orbite circulaire équatoriale (rayon 9 376 km, période 7,654 h), progradante ; Mars tourne en 24,623 h (période sidérale). Position vue du site. */
export const PHOBOS = { rayonOrbiteKm: 9376, periodeH: 7.654, rayonKm: 11.1, exageration: 6 };
export const DEIMOS = { rayonOrbiteKm: 23463, periodeH: 30.35, rayonKm: 6.2, exageration: 6 };
const ROT_MARS_H = 24.623;
export function lune(luneDef, heureSim, lonObs, latObs, phase0 = 0) {
  const thetaLune = phase0 + (heureSim / luneDef.periodeH) * 2 * Math.PI;              // angle dans le repère inertiel (équatorial)
  const thetaObs = rad(lonObs) + (heureSim / ROT_MARS_H) * 2 * Math.PI;
  const rObs = RAYON_MARS_KM, f = latObs * RAD;
  const P = [luneDef.rayonOrbiteKm * Math.cos(thetaLune), luneDef.rayonOrbiteKm * Math.sin(thetaLune), 0];   // x,y dans le plan équatorial, z = axe polaire
  const O = [rObs * Math.cos(f) * Math.cos(thetaObs), rObs * Math.cos(f) * Math.sin(thetaObs), rObs * Math.sin(f)];
  const dv = [P[0] - O[0], P[1] - O[1], P[2] - O[2]];
  const haut = unitaire(O), estV = unitaire([-Math.sin(thetaObs), Math.cos(thetaObs), 0]), nordV = vect(haut, estV);
  const dist = norme(dv), u = scal(dv, haut) / dist, e = scal(dv, estV) / dist, n = scal(dv, nordV) / dist;
  return { elev: Math.asin(borner(u, -1, 1)) * DEG, azim: (Math.atan2(e, n) * DEG + 360) % 360, e, n, u, distanceKm: dist,
    diametreRealDeg: 2 * Math.atan(luneDef.rayonKm / dist) * DEG, diametreAffichageDeg: 2 * Math.atan(luneDef.rayonKm * luneDef.exageration / dist) * DEG };
}

/* ── Seuils d'entrée / de sortie (avec hystérésis : on entre bas, on ressort plus haut) ── */
export const SEUILS = {
  ORBITE_DEPART: 3.0 * R,        // distance du centre à l'arrivée depuis la galaxie
  SORTIE_GALAXIE: 4.6 * R,       // dézoomer au-delà (et insister) : retour à la galaxie
  SORTIE_POUSSEE: 150,           // cumul de molette nécessaire pour sortir
  DIST_MIN: R + 3.2,             // jamais plus près de la surface
  DIST_MAX: 5.4 * R,
  ENTREE_DIST: R + 15,           // sous cette distance du centre, face à la base : on entre
  ENTREE_ANGLE: 16,              // la base doit être à moins de 16° de l'axe de la caméra
  ASSIST_DIST: 1.55 * R,         // au-dessous, la caméra glisse doucement vers la base si elle est à moins de 45° (zoom « sur la base »)
  ASSIST_ANGLE: 45,
  SORTIE_BASE_DIST: R + 34,      // à la sortie de la base, la caméra reparaît bien plus haut que le seuil d'entrée : pas de va-et-vient
  BLOCAGE_MS: 1600,              // après un changement, aucune entrée par zoom pendant ce délai
  INT_Z_MIN: -1.6, INT_Z_MAX: 5.2, INT_POUSSEE: 140   // intérieur : plage de déplacement de la caméra (z) et cumul de molette pour ressortir
};
/* Angle (degrés) entre la direction caméra→centre inversée (position de la caméra vue du centre) et la direction de la base. */
export const angleAvecBase = (dirCamera, dirBase) => Math.acos(borner(scal(unitaire(dirCamera), unitaire(dirBase)), -1, 1)) * DEG;
export function peutEntrer({ distCentre, angleBase, molettePositive, maintenant, bloqueJusqua = 0 }) {
  return !!molettePositive && maintenant >= bloqueJusqua && distCentre <= SEUILS.ENTREE_DIST && angleBase <= SEUILS.ENTREE_ANGLE;
}
/* Force de l'assistance de visée (0 à 1) : plus on est près et plus la base est proche du centre de l'image, plus la caméra la rejoint. */
export function forceAssist(distCentre, angleBase) {
  if (distCentre >= SEUILS.ASSIST_DIST || angleBase >= SEUILS.ASSIST_ANGLE || angleBase < 0.3) return 0;
  return lisse(SEUILS.ASSIST_DIST, SEUILS.ENTREE_DIST, distCentre) * (1 - angleBase / SEUILS.ASSIST_ANGLE);
}
/* Cumul de molette « vers l'arrière » : renvoie {cumul, sortir}. Toute molette vers l'avant remet à zéro. */
export function pousser(cumul, delta, seuil) {
  if (delta <= 0) return { cumul: 0, sortir: false };
  const c = cumul + delta; return c >= seuil ? { cumul: 0, sortir: true } : { cumul: c, sortir: false };
}

/* ── Qualité (niveau de la galaxie + mode jeu) ── */
export function profil(niveau, jeu = false) {
  if (jeu) return { niveau: 'jeu', segSphere: 48, segTerrain: 56, rochers: 60, ombres: 0, lumieres: 2, detailBase: 0, particules: 0, reflets: false };
  switch (niveau) {
    case 'haute': return { niveau: 'haute', segSphere: 192, segTerrain: 200, rochers: 700, ombres: 2048, lumieres: 6, detailBase: 2, particules: 1, reflets: true };
    case 'moyenne': return { niveau: 'moyenne', segSphere: 128, segTerrain: 140, rochers: 320, ombres: 0, lumieres: 4, detailBase: 1, particules: 1, reflets: true };
    default: return { niveau: 'basse', segSphere: 64, segTerrain: 80, rochers: 100, ombres: 0, lumieres: 2, detailBase: 0, particules: 0, reflets: false };
  }
}

/* ── Bruit déterministe (terrain, textures procédurales) ── */
export function hash2(x, y, graine = 0) { let h = (x * 374761393 + y * 668265263 + graine * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
export function bruit2(x, y, graine = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, graine), b = hash2(xi + 1, yi, graine), c = hash2(xi, yi + 1, graine), d = hash2(xi + 1, yi + 1, graine);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm2(x, y, octaves = 5, graine = 0) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < octaves; i++) { s += a * bruit2(x * f, y * f, graine + i * 17); f *= 2.03; a *= 0.5; } return s; }
/* Générateur pseudo-aléatoire reproductible (mulberry32). */
export function alea(graine) { let a = graine >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* Altitude du sol martien (en mètres) autour de la base, en x (est) et z (sud) en mètres : plateau plat près de la base (rayon 26 m), dunes et rochers au-delà,
   crête de cratère lointaine (4 à 9 km). Sert à la fois pour le maillage et pour poser les rochers. */
export function altitudeSol(x, z) {
  const d = Math.hypot(x, z);
  const plateau = lisse(24, 60, d);                                                  // 0 sur la plateforme, 1 loin
  const dunes = (fbm2(x * 0.012, z * 0.012, 4, 3) - 0.45) * 7 + (fbm2(x * 0.05, z * 0.05, 3, 9) - 0.5) * 1.2;
  const collines = (fbm2(x * 0.0016 + 40, z * 0.0016, 5, 5) - 0.4) * 130 * lisse(250, 1800, d);
  const crete = lisse(3500, 7500, d) * (60 + 520 * fbm2(Math.atan2(z, x) * 2.3, 0.7, 4, 11));   // anneau de montagnes lointain
  return plateau * (dunes + collines) + crete;
}

/* ── Fenêtres holographiques : disposition en arc au-dessus de la table (repère de la pièce : x est, y haut, z sud ; le spectateur est au sud, face au nord) ── */
export function dispositionFenetres(n, centre = [0, 0, -0.6], rayon = 2.25, hauteur = 1.5, arcDeg = 150) {
  const out = [];
  if (n >= 12) {                                    // 12 fenêtres ou plus : trois rangées en arc (4 / 4 / le reste), fenêtres un peu plus petites, sans chevauchement
    const nR = n >= 17 ? 4 : 3, base = Math.floor(n / nR), rangees = Array.from({ length: nR }, (_, r) => (r === nR - 1 ? n - base * (nR - 1) : base)), hauts = [1.04, 1.7, 2.36, 3.02]; let i0 = 0;      // M6 : à partir de 17 fenêtres, quatre rangées (le plafond est à 3,5 m)
    rangees.forEach((m, r) => { for (let k = 0; k < m; k++) { const arc = m >= 6 ? 150 : (r === nR - 1 ? 132 : 118), rr = 2.5, t = m === 1 ? 0 : k / (m - 1) - 0.5, ang = t * arc * RAD; out.push({ position: [centre[0] + Math.sin(ang) * rr, hauts[r], centre[2] - Math.cos(ang) * rr * 0.78], lacet: -ang * 0.7, largeur: 0.98, hauteurFenetre: 0.61, rangee: r }); } i0 += m; });
    return out;
  }
  if (n > 6) {                                      // 7 fenêtres : deux rangées en arc (les graphiques en bas, les tableaux au-dessus), sans chevauchement
    const bas = Math.floor(n / 2), haut = n - bas;
    for (let i = 0; i < n; i++) {
      const rangeeBas = i < bas, k = rangeeBas ? i : i - bas, m = rangeeBas ? bas : haut, arc = 118, r = 2.35, t = m === 1 ? 0 : k / (m - 1) - 0.5, ang = t * arc * RAD;
      out.push({ position: [centre[0] + Math.sin(ang) * r, rangeeBas ? 1.22 : 1.98, centre[2] - Math.cos(ang) * r * 0.78], lacet: -ang * 0.7, largeur: 1.12, hauteurFenetre: 0.7, rangee: rangeeBas ? 0 : 1 });
    }
    return out;
  }
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5, a = t * arcDeg * RAD;     // 0 = droit devant (au nord de la table)
    out.push({ position: [centre[0] + Math.sin(a) * rayon, hauteur + (Math.abs(t) < 0.2 ? 0.14 : 0) + (i % 2 ? 0.05 : -0.03), centre[2] - Math.cos(a) * rayon * 0.78], lacet: -a * 0.7, largeur: 1.12, hauteurFenetre: 0.7 });
  }
  return out;
}

/* Plan de la base vue de l'espace (repère local : x est, z sud, unités de scène) : côté ouest = BUREAU, côté est = TERMINAL DE TRADING. */
export const ZONES_BASE = {
  bureau: { id: 'bureau', nom: 'Bureau', etat: 'bientot', centre: [-2.6, 0.5, 0.2], message: 'Le bureau arrive bientôt : il accueillera les agents IA de trading.' },
  terminal: { id: 'terminal', nom: 'Terminal de trading', etat: 'actif', centre: [2.6, 0.5, 0.2], message: '' }
};
export const zoneDePosition = x => (x < 0 ? 'bureau' : 'terminal');
