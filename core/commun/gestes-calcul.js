/* ═════════════ GESTES DES FENÊTRES : CALCULS PURS (testés : galaxie/tests/r3-gestes-test.mjs) ═════════════
   Inertie, aimantation douce, balayage, redimensionnement par les bords, molette, clavier, cascade et carrousel de fenêtres. Aucune dépendance au navigateur.
   Les rectangles sont { x, y, l, h } ; `C` est un calcul de fenêtres (core/commun/fenetres-calcul.js). */

/* Vitesse (px/ms) d'après les derniers échantillons { t, x, y } (fenêtre de 100 ms). */
export function vitesse(points) {
  if (!points || points.length < 2) return { vx: 0, vy: 0 };
  const fin = points[points.length - 1]; let debut = points[0];
  for (const p of points) if (fin.t - p.t <= 100) { debut = p; break; }
  const dt = fin.t - debut.t; if (dt <= 0) return { vx: 0, vy: 0 };
  return { vx: (fin.x - debut.x) / dt, vy: (fin.y - debut.y) / dt };
}
/* Un pas d'inertie : la vitesse décroît de façon exponentielle (temps de demi-vie ≈ 140 ms). Rend { dx, dy, vx, vy, fini }. */
export function pasInertie({ vx, vy }, dt, demiVie = 140) {
  const k = Math.pow(0.5, dt / demiVie), vx2 = vx * k, vy2 = vy * k;
  return { dx: vx * dt * (1 + k) / 2, dy: vy * dt * (1 + k) / 2, vx: vx2, vy: vy2, fini: Math.hypot(vx2, vy2) < 0.02 };
}
/* Un lancer n'a lieu que si la vitesse dépasse un seuil (sinon la fenêtre reste où elle a été posée). */
export const estLance = (v, seuil = 0.35) => Math.hypot(v.vx, v.vy) >= seuil;
/* Distance totale parcourue par une inertie (utile pour borner et pour les tests) : v × demi-vie / ln 2. */
export const distanceInertie = (v, demiVie = 140) => ({ dx: v.vx * demiVie / Math.LN2, dy: v.vy * demiVie / Math.LN2 });

/* Balayage vertical sur la barre de titre : bas = réduire, haut = remettre. Rapide, net, presque vertical. */
export function classerBalayage(dx, dy, dt, { distance = 70, vitesseMin = 0.9 } = {}) {
  if (dt <= 0 || Math.abs(dy) < distance || Math.abs(dx) > Math.abs(dy) * 0.5) return null;
  if (Math.abs(dy) / dt < vitesseMin) return null;
  return dy > 0 ? 'bas' : 'haut';
}

/* Aimantation douce : si un bord de r est à moins de `seuil` px d'un bord de l'écran utile ou d'une autre fenêtre (qui se touche en projection), il s'y colle. */
export function aimanter(r, autres, utile, seuil = 10) {
  let { x, y } = r; const l = r.l, h = r.h;
  let meilleurX = null, meilleurY = null;
  const essaiX = (cible, bord) => { const d = Math.abs(bord - cible); if (d <= seuil && (!meilleurX || d < meilleurX.d)) meilleurX = { d, x: x + (cible - bord) }; };
  const essaiY = (cible, bord) => { const d = Math.abs(bord - cible); if (d <= seuil && (!meilleurY || d < meilleurY.d)) meilleurY = { d, y: y + (cible - bord) }; };
  essaiX(utile.x, x); essaiX(utile.x + utile.l, x + l); essaiY(utile.y, y); essaiY(utile.y + utile.h, y + h);
  for (const a of autres) {
    const chevY = y < a.y + a.h + seuil && y + h > a.y - seuil, chevX = x < a.x + a.l + seuil && x + l > a.x - seuil;
    if (chevY) { essaiX(a.x + a.l, x); essaiX(a.x, x + l); essaiX(a.x, x); essaiX(a.x + a.l, x + l); }
    if (chevX) { essaiY(a.y + a.h, y); essaiY(a.y, y + h); essaiY(a.y, y); essaiY(a.y + a.h, y + h); }
  }
  if (meilleurX) x = meilleurX.x; if (meilleurY) y = meilleurY.y;
  return { x, y, l, h, collee: !!(meilleurX || meilleurY) };
}

/* Redimensionnement par un bord ou un coin : bord ∈ n s e w ne nw se sw. */
export function redimBord(r0, bord, dx, dy, C, ecran) {
  let { x, y, l, h } = r0; const droite = r0.x + r0.l, bas = r0.y + r0.h;
  if (bord.includes('e')) l = r0.l + dx;
  if (bord.includes('s')) h = r0.h + dy;
  if (bord.includes('w')) { l = r0.l - dx; }
  if (bord.includes('n')) { h = r0.h - dy; }
  l = Math.max(C.MINI_L, Math.min(l, ecran.l - 2 * C.MARGE)); h = Math.max(C.MINI_H, Math.min(h, ecran.h - C.HAUT_RESERVE - C.BAS_RESERVE));
  if (bord.includes('w')) x = droite - l; if (bord.includes('n')) y = bas - h;
  return C.limiter({ x, y, l, h }, ecran);
}
/* Molette sur une fenêtre : vers le haut agrandit, vers le bas réduit (≈ 8 % par cran). */
export const echelleMolette = deltaY => (deltaY < 0 ? 1.08 : deltaY > 0 ? 1 / 1.08 : 1);
export const limiterRotation = (deg, max = 8) => Math.max(-max, Math.min(max, deg));
export const angleEntre = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
/* Différence d'angle ramenée dans ]-180, 180]. */
export const deltaAngle = (a, a0) => { let d = a - a0; while (d > 180) d -= 360; while (d <= -180) d += 360; return d; };

/* Clavier : flèches = déplacer de 24 px (96 avec Ctrl) ; Maj + flèches = redimensionner. Rend { dx, dy, dl, dh } ou null. */
export function pasClavier(touche, { maj = false, ctrl = false } = {}) {
  const p = ctrl ? 96 : 24, v = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[touche]; if (!v) return null;
  return maj ? { dx: 0, dy: 0, dl: v[0] * p, dh: v[1] * p } : { dx: v[0] * p, dy: v[1] * p, dl: 0, dh: 0 };
}
/* Fenêtre suivante / précédente (Tab / Maj+Tab), en boucle, parmi des identifiants ordonnés. */
export function fenetreSuivante(ids, courante, arriere = false) {
  if (!ids.length) return null; const i = ids.indexOf(courante);
  if (i < 0) return ids[arriere ? ids.length - 1 : 0];
  return ids[(i + (arriere ? -1 : 1) + ids.length) % ids.length];
}

/* ── Dispositions de réorganisation : grille (C.reorganiser), cascade, carrousel ── */
export function cascade(liste, ecran, C, { decalage = 36 } = {}) {
  const utileL = ecran.l - 2 * C.MARGE, utileH = ecran.h - C.HAUT_RESERVE - C.BAS_RESERVE, n = liste.length;
  const maxDec = Math.max(0, Math.min(decalage, Math.floor((Math.min(utileL, utileH) * 0.45) / Math.max(1, n - 1))));
  return liste.map((f, i) => {
    const l = Math.max(C.MINI_L, Math.min(f.l, utileL - maxDec * (n - 1))), h = Math.max(C.MINI_H, Math.min(f.h, utileH - maxDec * (n - 1)));
    return { id: f.id, ...C.limiter({ x: C.MARGE + i * maxDec, y: C.HAUT_RESERVE + i * maxDec, l, h }, ecran) };
  });
}
/* Carrousel : la fenêtre centrale est grande, les autres sont plus petites et décalées sur les côtés (elles se recouvrent, la centrale est devant : zOrdre croissant vers le centre). */
export function carrouselFenetres(liste, ecran, C, centre = 0) {
  const n = liste.length; if (!n) return [];
  const utileL = ecran.l - 2 * C.MARGE, utileH = ecran.h - C.HAUT_RESERVE - C.BAS_RESERVE;
  const lc = Math.max(C.MINI_L, Math.min(Math.round(utileL * 0.46), 900)), hc = Math.max(C.MINI_H, Math.min(Math.round(utileH * 0.86), 900));
  const pas = Math.max(40, Math.min(Math.round(lc * 0.42), Math.floor((utileL - lc) / 2 / Math.max(1, Math.ceil((n - 1) / 2)))));
  return liste.map((f, i) => {
    const dec = i - centre, a = Math.abs(dec), k = Math.max(0.62, 1 - 0.1 * a), l = Math.max(C.MINI_L, Math.round(lc * k)), h = Math.max(C.MINI_H, Math.round(hc * k));
    const cx = ecran.l / 2 + dec * pas;
    return { id: f.id, ...C.limiter({ x: Math.round(cx - l / 2), y: Math.round(C.HAUT_RESERVE + (utileH - h) / 2), l, h }, ecran), zOrdre: 100 - a };
  });
}

/* Arc (V2) : les fenêtres se placent en demi-cercle devant l'utilisateur, SANS se chevaucher. Rangées de 4 fenêtres au plus (3 sur écran étroit) ; au milieu d'une rangée la fenêtre est
   un peu plus basse, aux extrémités un peu plus haute (courbure), toutes à la même taille. La rangée la plus remplie est en bas (au plus près de la table). */
export function arcFenetres(liste, ecran, C, { parRangee = ecran.l < 700 ? 3 : 4, courbure = 26, ecart = 14, part = 0.74 } = {}) {
  const n = liste.length; if (!n) return [];
  const utileL = ecran.l - 2 * C.MARGE, utileH = ecran.h - C.HAUT_RESERVE - C.BAS_RESERVE;
  const rangees = Math.ceil(n / parRangee), parLigne = Math.ceil(n / rangees);
  const gapV = ecart + courbure, l = Math.max(C.MINI_L, Math.min(Math.floor((utileL - ecart * (parLigne - 1)) / parLigne), 760));
  // l'arc occupe le haut de l'écran (la table reste visible dessous) ; si les fenêtres deviendraient trop basses, il prend toute la hauteur utile
  const hauteurPour = zone => Math.floor((zone - gapV * (rangees - 1) - courbure) / rangees);
  let h = hauteurPour(utileH * part); if (h < C.MINI_H) h = hauteurPour(utileH);
  h = Math.max(C.MINI_H, Math.min(h, 640));
  const out = []; let idx = 0;
  for (let r = 0; r < rangees; r++) {
    const k = Math.min(parLigne, n - idx), totalL = k * l + (k - 1) * ecart, x0 = Math.round((ecran.l - totalL) / 2);
    const yBase = C.HAUT_RESERVE + r * (h + gapV);
    for (let i = 0; i < k; i++, idx++) {
      const t = k > 1 ? (2 * i / (k - 1) - 1) : 0, dy = Math.round(courbure * (1 - t * t));   // 0 aux extrémités, courbure au milieu (centre plus bas)
      out.push({ id: liste[idx].id, ...C.limiter({ x: x0 + i * (l + ecart), y: yBase + dy, l, h }, ecran) });
    }
  }
  return out;
}
