"use strict";
/* ═════════════ RÉALITÉ VIRTUELLE (V2, phase 12) : calculs PURS, sans WebXR ni Three.js (testés sous Node : galaxie/tests/vr-test.mjs) ═════════════
   Placement des fenêtres autour de l'utilisateur, visée d'un panneau avec un rayon de manette, zones d'un panneau (titre, coin, corps), déplacement fluide, rotation par cliquet,
   arc de téléportation, vignette de confort, vol libre dans l'espace, redimensionnement à deux mains. Vecteurs = tableaux [x, y, z] (mètres, y vers le haut), quaternions [x, y, z, w]. */
(function (racine) {
  const PI = Math.PI, rad = d => d * PI / 180;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], norme = a => Math.hypot(a[0], a[1], a[2]), borne = (v, a, b) => Math.max(a, Math.min(b, v));
  const unit = a => { const n = norme(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
  /* Rotation d'un vecteur par un quaternion [x, y, z, w]. */
  function tourner(v, q) {
    const [x, y, z, w] = q, [vx, vy, vz] = v, tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
    return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
  }
  const conj = q => [-q[0], -q[1], -q[2], q[3]];
  const quatLacet = yaw => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];   // rotation autour de Y
  const lacetDe = q => { const f = tourner([0, 0, -1], q); return Math.atan2(-f[0], -f[2]); };   // cap horizontal d'un regard (0 = vers −Z)

  /* ── placement des fenêtres autour de la tête (mode « Jarvis en VR ») ──
     n panneaux sur un arc centré devant l'utilisateur, sur 1 ou 2 rangées, tous tournés vers lui. Rend [{ pos, yaw, rang }] (le panneau fait face à l'origine de `centre`). */
  function disposerPanneaux(n, { centre = [0, 0, 0], rayon = 1.7, hauteurOeil = 1.5, arcDeg = 180, parRang = 6, ecartRang = 0.62, capCentre = 0 } = {}) {
    const sortie = []; if (n <= 0) return sortie;
    const rangs = Math.ceil(n / parRang);
    for (let i = 0; i < n; i++) {
      const rang = Math.floor(i / parRang), dansRang = i - rang * parRang, effectif = Math.min(parRang, n - rang * parRang);
      const u = effectif === 1 ? 0 : (dansRang / (effectif - 1) - 0.5), angle = capCentre + u * rad(arcDeg) * (effectif === 1 ? 0 : Math.min(1, 0.45 + effectif * 0.12));
      const r = rayon + rang * 0.18, y = hauteurOeil + ((rangs - 1) / 2 - rang) * ecartRang * 1 + (rang === 0 && rangs > 1 ? 0 : 0);
      const pos = [centre[0] - Math.sin(angle) * r, y, centre[2] - Math.cos(angle) * r];
      sortie.push({ pos, yaw: angle, rang });   // yaw = cap du panneau : sa normale (+Z local) regarde le centre quand yaw = angle
    }
    return sortie;
  }

  /* ── visée d'un panneau par un rayon ──
     panneau = { pos:[x,y,z], quat:[x,y,z,w], l, h } (l × h en mètres, normale = +Z local). Rend { t, point, uv:[u,v] } (u de 0 à 1 de gauche à droite, v de 0 à 1 de haut en bas) ou null. */
  function intersectionRayonPanneau(origine, direction, panneau) {
    const n = tourner([0, 0, 1], panneau.quat), d = unit(direction), den = dot(n, d);
    if (Math.abs(den) < 1e-6) return null;
    const t = dot(sub(panneau.pos, origine), n) / den; if (t < 0.02) return null;
    const point = add(origine, mul(d, t)), loc = tourner(sub(point, panneau.pos), conj(panneau.quat));
    const u = loc[0] / panneau.l + 0.5, v = 0.5 - loc[1] / panneau.h;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    return { t, point, uv: [u, v], deDos: den > 0 };
  }
  /* Le plus proche des panneaux touchés (indice dans la liste, ou -1). */
  function panneauVise(origine, direction, panneaux) {
    let meilleur = null, idx = -1;
    panneaux.forEach((p, i) => { if (p.visible === false) return; const h = intersectionRayonPanneau(origine, direction, p); if (h && (!meilleur || h.t < meilleur.t)) { meilleur = h; idx = i; } });
    return meilleur ? { indice: idx, ...meilleur } : null;
  }
  /* Zone touchée : « titre » (bande du haut : saisir / déplacer), « coin » (bas droite : redimensionner), « corps » (contenu : cliquer). */
  function zonePanneau(uv, { titre = 0.1, coin = 0.1 } = {}) {
    if (uv[0] > 1 - coin && uv[1] > 1 - coin) return 'coin';
    if (uv[1] < titre) return 'titre';
    return 'corps';
  }
  /* Point (u, v) du panneau → coordonnées de la page dans le rectangle de l'élément affiché. */
  const uvVersElement = (uv, rect) => ({ x: rect.left + uv[0] * rect.width, y: rect.top + uv[1] * rect.height });

  /* ── déplacement fluide : le stick pousse dans la direction du regard (cap seulement, jamais vers le haut). `stick` = axes bruts du contrôleur WebXR : pousser vers l'avant donne y = −1. ── */
  function deplacementFluide({ stick, cap, vitesse = 2.2, dt, zoneMorte = 0.15 }) {
    let [sx, sy] = stick; const m = Math.hypot(sx, sy);
    if (m < zoneMorte) return [0, 0, 0];
    const f = (m - zoneMorte) / (1 - zoneMorte), k = Math.min(1, f) / m; sx *= k; sy *= k;
    const avant = [-Math.sin(cap), 0, -Math.cos(cap)], droite = [Math.cos(cap), 0, -Math.sin(cap)];
    return add(mul(avant, -sy * vitesse * dt), mul(droite, sx * vitesse * dt));
  }
  /* ── rotation par cliquet (anti-nausée) : un cran de `angle` degrés à chaque poussée franche, avec un délai entre deux crans ── */
  function cliquetRotation(etat, stickX, dt, { angle = 30, seuil = 0.7, delai = 0.28 } = {}) {
    const e = { attente: Math.max(0, (etat ? etat.attente : 0) - dt), arme: etat ? etat.arme : true };
    let delta = 0;
    if (Math.abs(stickX) < seuil * 0.5) e.arme = true;
    else if (Math.abs(stickX) >= seuil && e.arme && e.attente <= 0) { delta = -Math.sign(stickX) * angle; e.arme = false; e.attente = delai; }
    return { etat: e, deltaDeg: delta };
  }
  /* ── arc de téléportation : trajectoire parabolique depuis la manette jusqu'au sol (y = solY). Rend { points, impact } ; impact = null si l'arc ne touche pas le sol dans la portée. ── */
  function arcTeleportation(origine, direction, { vitesse = 6.5, g = 9.81, pas = 0.04, portee = 12, solY = 0, pasMax = 80 } = {}) {
    const v = mul(unit(direction), vitesse), points = [origine.slice()]; let p = origine.slice(), vel = v.slice(), impact = null;
    for (let i = 0; i < pasMax; i++) {
      const suivant = [p[0] + vel[0] * pas, p[1] + vel[1] * pas, p[2] + vel[2] * pas]; vel = [vel[0], vel[1] - g * pas, vel[2]];
      if (suivant[1] <= solY && p[1] > solY) { const u = (p[1] - solY) / (p[1] - suivant[1] || 1); impact = [p[0] + (suivant[0] - p[0]) * u, solY, p[2] + (suivant[2] - p[2]) * u]; points.push(impact.slice()); break; }
      p = suivant; points.push(p.slice());
    }
    if (impact && Math.hypot(impact[0] - origine[0], impact[2] - origine[2]) > portee) impact = null;
    return { points, impact };
  }
  /* ── vignette de confort : 0 (rien) à 1 (très sombre sur les bords) selon la vitesse linéaire (m/s) et de rotation (°/s) ; montée rapide, descente lente. ── */
  function vignetteCible(vitesseLin, vitesseAngDeg, { maxLin = 2.4, maxAng = 120, force = 1 } = {}) {
    const c = Math.max(Math.min(1, vitesseLin / maxLin), Math.min(1, Math.abs(vitesseAngDeg) / maxAng) * 0.9);
    return borne(c * force, 0, 1);
  }
  const lisserVignette = (courant, cible, dt) => cible > courant ? Math.min(cible, courant + dt * 6) : Math.max(cible, courant - dt * 1.4);

  /* ── vol libre entre les planètes : la gâchette pousse dans la direction de la manette ; la vitesse maximale croît avec la distance au corps le plus proche (échelle logarithmique) ── */
  const vitesseMaxSelonDistance = d => Math.max(0.5, Math.min(2500, 0.8 * d));
  function volLibre({ vitesse, direction, poussee, distance, dt, frein = 0 }) {
    const vmax = vitesseMaxSelonDistance(distance), accel = vmax * 1.2;
    let v = vitesse.slice();
    if (poussee > 0.05) v = add(v, mul(unit(direction), accel * poussee * dt));
    const amort = Math.exp(-(poussee > 0.05 ? 0.35 : 1.6 + frein * 3) * dt); v = mul(v, amort);
    const n = norme(v); if (n > vmax) v = mul(v, vmax / n);
    return { vitesse: n < 0.01 ? [0, 0, 0] : v, deplacement: mul(v, dt), vmax };
  }
  /* ── redimensionnement à une main : échelle de départ × (distance actuelle / distance de départ de la manette au centre du panneau) ── */
  const redimensionner = (echelle0, d0, d, { min = 0.4, max = 3 } = {}) => borne(echelle0 * (d / Math.max(0.05, d0)), min, max);
  /* Taille du panneau (mètres) d'après l'élément (pixels) : 2,2 m pour 1000 px de large (un texte de 16 px reste lisible à 1,7 m), bornée. */
  function taillePanneau(largeurPx, hauteurPx, { metresPour1000px = 2.2, max = 1.8, min = 0.35 } = {}) {
    const l = borne(largeurPx / 1000 * metresPour1000px, min, max), h = l * (hauteurPx / Math.max(1, largeurPx));
    return { l, h: Math.min(h, 1.5) };
  }
  /* Rafraîchissement d'un panneau : fréquence selon qu'il est visé, visible ou hors du champ (pour ne pas écrouler la cadence du casque). */
  const intervalleRaster = ({ vise, dansChamp, focus }) => vise || focus ? 250 : dansChamp ? 1000 : 4000;

  racine.VRCalcul = { PI, rad, tourner, conj, quatLacet, lacetDe, disposerPanneaux, intersectionRayonPanneau, panneauVise, zonePanneau, uvVersElement, deplacementFluide, cliquetRotation, arcTeleportation, vignetteCible, lisserVignette, vitesseMaxSelonDistance, volLibre, redimensionner, taillePanneau, intervalleRaster };
  if (typeof module !== 'undefined' && module.exports) module.exports = racine.VRCalcul;
})(typeof globalThis !== 'undefined' ? globalThis : window);
