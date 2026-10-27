"use strict";
/* ═════════════ MAIN SYNTHÉTIQUE : fabrique des suites de 21 repères (format MediaPipe) pour tester les gestes SANS caméra ═════════════
   Ce ne sont PAS des enregistrements réels : c'est un modèle géométrique simple (paume, quatre doigts à trois segments, pouce) qui produit des points plausibles
   (mêmes indices que MediaPipe Hands) avec un tremblement réglable. Les vrais enregistrements se font avec le bouton « Enregistrer » de l'écran des gestes
   (fichier JSON local) et se rejouent avec Gestes.rejouer(). Utilisé par galaxie/tests/gestes-test.mjs et tests-navigateur/v2-gestes-test.mjs. */
(function (racine) {
  const alea = graine => { let s = graine >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const gauss = r => { const u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  // base de chaque doigt (unités de main : poignet → bout de la base du majeur = 1), longueurs des 3 segments, étalement des doigts tendus
  const DOIGTS = [
    { nom: 'index', mcp: [-0.30, 0.96], seg: [0.45, 0.27, 0.22], ouverture: -0.08 },
    { nom: 'majeur', mcp: [0.0, 1.0], seg: [0.50, 0.30, 0.24], ouverture: 0.0 },
    { nom: 'annulaire', mcp: [0.28, 0.94], seg: [0.46, 0.28, 0.22], ouverture: 0.08 },
    { nom: 'auriculaire', mcp: [0.52, 0.84], seg: [0.36, 0.2, 0.18], ouverture: 0.18 }
  ];
  const tourner = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
  const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

  /* Points d'UNE main en unités de main (y vers le haut). pose : 'ouverte' | 'pointer' | 'poing' | 'pince' ; pince : 0 (ouvert) … 1 (bout du pouce sur le bout de l'index) pour pose 'pince'. */
  function pointsMain({ pose = 'ouverte', pince = 1, autres = 'ouverts' } = {}) {
    const pts = new Array(21); pts[0] = [0, 0];
    const tendu = { index: false, majeur: false, annulaire: false, auriculaire: false };
    if (pose === 'ouverte') Object.keys(tendu).forEach(k => { tendu[k] = true; });
    else if (pose === 'pointer') tendu.index = true;
    else if (pose === 'pince') { tendu.index = true; if (autres === 'ouverts') { tendu.majeur = tendu.annulaire = tendu.auriculaire = true; } }
    DOIGTS.forEach((d, f) => {
      const base = 5 + 4 * f; pts[base] = d.mcp.slice();
      let dir = tourner([0, 1], tendu[d.nom] ? d.ouverture : d.ouverture * 0.3), p = d.mcp.slice();
      const flexion = tendu[d.nom] ? [0, 0, 0] : [0.35, 1.65, 1.3];   // radians aux trois articulations d'un doigt replié
      for (let s = 0; s < 3; s++) { dir = tourner(dir, flexion[s]); p = [p[0] + dir[0] * d.seg[s], p[1] + dir[1] * d.seg[s]]; pts[base + 1 + s] = p.slice(); }
    });
    // pouce : tendu vers l'extérieur ; replié sur la paume ; ou rejoignant le bout de l'index (pince)
    const pouceOuvert = [[-0.25, 0.2], [-0.5, 0.45], [-0.72, 0.62], [-0.88, 0.78]], pouceRentre = [[-0.25, 0.2], [-0.38, 0.4], [-0.3, 0.52], [-0.18, 0.62]];
    const base = pose === 'ouverte' ? pouceOuvert : pose === 'pince' ? pouceOuvert : pouceRentre, indexBout = pts[8];
    for (let i = 0; i < 4; i++) {
      let q = base[i];
      if (pose === 'pince') { const cible = i === 3 ? [indexBout[0] + 0.03, indexBout[1] - 0.02] : lerp(pouceOuvert[i], lerp(pouceOuvert[i], indexBout, 0.55), 0.6); q = lerp(pouceOuvert[i], cible, pince); }
      pts[1 + i] = q.slice();
    }
    return pts;
  }

  /* Une main dans l'image : (cx, cy) = position du poignet (0…1), taille = longueur poignet → base du majeur en fraction de la hauteur de l'image, angle = rotation (rad), ratio = largeur / hauteur de l'image. */
  function creerMain(o) {
    const { pose = 'ouverte', cx = 0.5, cy = 0.7, taille = 0.16, angle = 0, lat = 'Right', ratio = 4 / 3, pince = 1, autres = 'ouverts', bruit = 0, alea: rnd = null, miroir = true } = o || {};
    const base = pointsMain({ pose, pince, autres }), R = rnd || (() => 0.5);
    const pts = base.map(p => { const r = tourner(p, angle); const dx = r[0] * taille / ratio + (bruit ? gauss(R) * bruit / ratio : 0), dy = -r[1] * taille + (bruit ? gauss(R) * bruit : 0); let x = cx + dx, y = cy + dy; if (miroir) x = 1 - (1 - x); return [+x.toFixed(5), +y.toFixed(5), 0]; });
    return { lat, pts };
  }

  /* Suites d'images (30 par seconde). Chaque générateur renvoie [{ t, ratio, mains:[…] }]. L'image est NON miroir (comme sort la caméra) : le moteur applique le miroir. */
  const IPS = 30;
  function suite(duree, fabrique, t0 = 0, ratio = 4 / 3) { const n = Math.round(duree * IPS), out = []; for (let i = 0; i <= n; i++) { const u = n ? i / n : 0; out.push({ t: Math.round(t0 + (i * 1000) / IPS), ratio, mains: fabrique(u, i).filter(Boolean) }); } return out; }
  const aller = (a, b, u) => a + (b - a) * u, facile = u => u * u * (3 - 2 * u);
  const suivant = (img, d) => img.map(x => ({ ...x, t: x.t + d }));
  function concatener(...parts) { const out = []; let t = 0; for (const p of parts) { const base = out.length ? out[out.length - 1].t + 1000 / IPS : 0; for (const f of p) out.push({ ...f, t: Math.round(base + (f.t - p[0].t)) }); t = out[out.length - 1].t; } void t; return out; }
  const G = {
    // index tendu qui se déplace de (x0,y0) à (x1,y1) (position du BOUT de l'index dans l'image) en `duree` secondes
    pointer: (x0, y0, x1, y1, duree = 1, opt = {}) => suite(duree, u => [creerMain({ pose: 'pointer', cx: aller(x0, x1, facile(u)), cy: aller(y0, y1, facile(u)) + 0.16 * 1.9, ...opt })]),
    immobile: (pose, duree = 0.6, opt = {}) => suite(duree, () => [creerMain({ pose, cx: 0.5, cy: 0.75, ...opt })]),
    // pincer (en 4 images), tenir `tenir` secondes, relâcher (en 4 images)
    pincer: (tenir = 0.15, opt = {}, avant = 6, apres = 6) => { const f = [], pas = 1000 / IPS; let t = 0; const ajoute = (pince, pose) => { f.push({ t: Math.round(t), ratio: 4 / 3, mains: [creerMain({ pose, pince, cx: 0.5, cy: 0.7, ...opt })] }); t += pas; };
      for (let i = 0; i < avant; i++) ajoute(0, 'pointer'); for (let i = 1; i <= 4; i++) ajoute(i / 4, 'pince'); for (let i = 0; i < Math.round(tenir * IPS); i++) ajoute(1, 'pince'); for (let i = 3; i >= 0; i--) ajoute(i / 4, 'pince'); for (let i = 0; i < apres; i++) ajoute(0, 'pointer'); return f; },
    // pincer, tenir puis déplacer la main de (dx, dy) en `duree` secondes, puis relâcher
    saisir: (tenir, dx, dy, duree, opt = {}) => { const f = [], pas = 1000 / IPS; let t = 0; const ajoute = (pince, pose, ox = 0, oy = 0) => { f.push({ t: Math.round(t), ratio: 4 / 3, mains: [creerMain({ pose, pince, cx: 0.4 + ox, cy: 0.7 + oy, ...opt })] }); t += pas; };
      for (let i = 0; i < 6; i++) ajoute(0, 'pointer'); for (let i = 1; i <= 4; i++) ajoute(i / 4, 'pince'); for (let i = 0; i < Math.round(tenir * IPS); i++) ajoute(1, 'pince');
      const n = Math.round(duree * IPS); for (let i = 1; i <= n; i++) ajoute(1, 'pince', dx * facile(i / n), dy * facile(i / n)); for (let i = 0; i < 6; i++) ajoute(1, 'pince', dx, dy); for (let i = 3; i >= 0; i--) ajoute(i / 4, 'pince', dx, dy); for (let i = 0; i < 6; i++) ajoute(0, 'pointer', dx, dy); return f; },
    // deux mains pincées dont l'écart passe de e0 à e1 (fractions de la largeur de l'image)
    deuxPincesEcart: (e0, e1, duree = 1, opt = {}) => suite(duree, u => { const e = aller(e0, e1, facile(u)); return [creerMain({ pose: 'pince', pince: 1, cx: 0.5 - e / 2, cy: 0.7, lat: 'Left', ...opt }), creerMain({ pose: 'pince', pince: 1, cx: 0.5 + e / 2, cy: 0.7, lat: 'Right', ...opt })]; }),
    // main ouverte qui balaie de x0 à x1 en `duree` secondes
    balayage: (x0, x1, duree = 0.35, opt = {}) => concatener(suite(0.3, () => [creerMain({ pose: 'ouverte', cx: x0, cy: 0.75, ...opt })]), suite(duree, u => [creerMain({ pose: 'ouverte', cx: aller(x0, x1, u), cy: 0.75, ...opt })]), suite(0.2, () => [creerMain({ pose: 'ouverte', cx: x1, cy: 0.75, ...opt })])),
    // deux mains ouvertes dont la ligne qui les joint tourne de a0 à a1 (rad)
    deuxOuvertesRotation: (a0, a1, duree = 1, opt = {}) => suite(duree, u => { const a = aller(a0, a1, facile(u)), r = 0.22; return [creerMain({ pose: 'ouverte', cx: 0.5 - Math.cos(a) * r / (4 / 3), cy: 0.7 - Math.sin(a) * r, lat: 'Left', ...opt }), creerMain({ pose: 'ouverte', cx: 0.5 + Math.cos(a) * r / (4 / 3), cy: 0.7 + Math.sin(a) * r, lat: 'Right', ...opt })]; }),
    deuxPoings: (duree = 2, opt = {}) => suite(duree, () => [creerMain({ pose: 'poing', cx: 0.3, cy: 0.75, lat: 'Left', ...opt }), creerMain({ pose: 'poing', cx: 0.7, cy: 0.75, lat: 'Right', ...opt })]),
    vide: (duree = 0.5) => suite(duree, () => [])
  };
  racine.MainSynthetique = { alea, pointsMain, creerMain, suites: G, suite, concatener, suivant, IPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = racine.MainSynthetique;
})(typeof globalThis !== 'undefined' ? globalThis : window);
