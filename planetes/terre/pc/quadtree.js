import { R, RAD, sub, norme, dot, unit, tuileCentre, tuileRayon, tuileLargeurKm, horizonKm, cle } from './geo.js';

/* ═════════════ CHOIX DES TUILES (pur) ═════════════
   `selectionner` descend le quadtree Web Mercator depuis le monde entier et garde les feuilles utiles : une tuile se découpe tant qu'elle
   paraît plus grande que `pixelsMax` à l'écran. Les tuiles derrière l'horizon ou hors du champ de la caméra sont ignorées.
   `couper` transforme ces feuilles voulues en liste à afficher : un parent reste affiché tant que ses quatre enfants ne sont pas prêts
   (jamais de trou ni de recouvrement). Sous `zMin`, c'est la sphère de base qui couvre le monde. */
const memoRayon = new Map();
const rayonTuile = (z, x, y) => { const k = cle(z, x, y); let r = memoRayon.get(k); if (r === undefined) { r = tuileRayon(z, x, y, z < 6 ? 9 : Math.min(2, Math.max(0.05, 0.25 * tuileLargeurKm(z, x, y)))); if (memoRayon.size > 20000) memoRayon.clear(); memoRayon.set(k, r); } return r; };

export function selectionner({ cam, avant, droite = null, haut = null, fov, aspect, hauteurEcran, zMax = 16, zMin = 3, pixelsMax = 420, maxTuiles = 400, limiteZ = null, hTerrain = 0 }) {
  const rc = norme(cam), alt = rc - R;
  const dirCam = unit(cam);
  const hor = Math.acos(Math.min(1, R / rc));                      // angle d'horizon vu du centre de la Terre
  const demi = Math.atan(Math.tan(fov / 2) * Math.sqrt(1 + aspect * aspect));
  const f = hauteurEcran / (2 * Math.tan(fov / 2));
  const hy = fov / 2, hx = Math.atan(Math.tan(hy) * aspect);
  const comb = (a, ka, b, kb) => [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
  const plans = droite && haut ? [comb(droite, Math.cos(hx), avant, Math.sin(hx)), comb(droite, -Math.cos(hx), avant, Math.sin(hx)), comb(haut, Math.cos(hy), avant, Math.sin(hy)), comb(haut, -Math.cos(hy), avant, Math.sin(hy))] : null;
  const feuilles = [];
  const visite = (z, x, y) => {
    const c = tuileCentre(z, x, y), r = rayonTuile(z, x, y) + hTerrain;   // + hauteur du relief : la sphère est centrée au niveau de la mer, la surface réelle (exagérée) est plus haut
    const d = sub(c.v, cam), dist = norme(d);
    // horizon : la tuile (vue du centre) est-elle à moins de « horizon + son rayon angulaire » de la direction de la caméra ?
    const angR = 2 * Math.asin(Math.min(1, r / (2 * R)));            // arc réel couvert par la sphère englobante (r / R sous-estime les grandes tuiles : le monde entier était rejeté)
    const ang = Math.acos(Math.min(1, Math.max(-1, dot(unit(c.v), dirCam))));
    if (ang - angR > hor + 0.002) return;
    if (plans) { for (const n of plans) if (dot(d, n) < -r) return; }   // hors du champ : sphère englobante contre les quatre plans
    else if (dist > r) {                                             // sans base de caméra : cône circonscrit
      const a = Math.acos(Math.min(1, Math.max(-1, dot(unit(d), avant))));
      if (a - Math.asin(Math.min(1, r / dist)) > demi) return;
    }
    const larg = tuileLargeurKm(z, x, y);                          // taille à l'écran d'après la largeur réelle de la tuile (pas sa sphère englobante)
    // vue rasante : une tuile vue de côté paraît écrasée, on la découpe moins (cosinus entre la direction de vue et la verticale du lieu)
    const rasant = Math.min(1, Math.max(0, dot(unit(sub(cam, c.v)), unit(c.v))));
    const px = larg * f / Math.max(dist - 0.5 * larg, Math.max(alt, 0.05) * 0.5) * (0.5 + 0.5 * rasant);
    if (z < zMax && (z < zMin || (px > pixelsMax && (!limiteZ || z < limiteZ(z, x, y))))) {
      if (feuilles.length + 4 > maxTuiles * 3) { feuilles.push({ z, x, y, d: dist }); return; }
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) visite(z + 1, x * 2 + i, y * 2 + j);
    } else feuilles.push({ z, x, y, d: dist });
  };
  visite(0, 0, 0);
  feuilles.sort((a, b) => a.d - b.d);
  return feuilles.slice(0, maxTuiles * 3);
}

/* feuilles voulues + prêt(z,x,y) → tuiles à afficher. */
export function couper(feuilles, pret, zMin = 3) {
  const interne = new Set(), voulue = new Set();
  for (const t of feuilles) {
    voulue.add(cle(t.z, t.x, t.y));
    for (let z = t.z - 1, x = t.x >> 1, y = t.y >> 1; z >= 0; z--, x >>= 1, y >>= 1) { const k = cle(z, x, y); if (interne.has(k)) break; interne.add(k); }
  }
  const afficher = (z, x, y) => {
    const k = cle(z, x, y);
    if (!voulue.has(k) && !interne.has(k)) return [];              // hors vue : rien à montrer
    const soi = () => (z >= zMin && pret(z, x, y) ? [{ z, x, y }] : null);
    if (voulue.has(k)) return soi();
    const liste = [];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const r = afficher(z + 1, x * 2 + i, y * 2 + j);
      if (r === null) { const s = soi(); return s || (z < zMin ? sansTrou(z, x, y) : null); }
      liste.push(...r);
    }
    return liste;
  };
  // sous zMin, une branche sans tuile prête n'est pas un trou : la sphère de base couvre
  const sansTrou = (z, x, y) => {
    const r = [];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const e = afficher(z + 1, x * 2 + i, y * 2 + j); if (e) r.push(...e); }
    return r;
  };
  const racine = afficher(0, 0, 0);
  return racine || sansTrou(0, 0, 0);
}

/* Tuiles à charger, des plus grossières aux plus fines : la chaîne des ancêtres de chaque feuille (jusqu'à zMin) puis la feuille. */
export function aCharger(feuilles, zMin = 3) {
  const vus = new Map();
  for (const t of feuilles) {
    for (let z = Math.max(zMin, t.z - 3); z <= t.z; z++) {
      const d = t.z - z, k = cle(z, t.x >> d, t.y >> d);
      const prio = t.d * 1 + (t.z - z) * 0;                         // les ancêtres partagent la distance de leur feuille la plus proche
      const e = vus.get(k);
      if (!e || prio < e.d) vus.set(k, { z, x: t.x >> d, y: t.y >> d, d: prio });
    }
  }
  return [...vus.values()].sort((a, b) => a.z - b.z || a.d - b.d);
}

export { horizonKm, RAD };
