import * as THREE from 'three';
import { TYPES, FINESSES, construireForme, repartirCeinture, etatAsteroide } from './asteroides-formes.js';

/* ═════════════ CEINTURE D'ASTÉROÏDES : des cailloux, pas des boules ═════════════
   Cinq modèles de base (patatoïde, allongé, aplati, fragment anguleux, cratères) générés par bruit (asteroides-formes.js), en trois finesses selon
   la taille ; relief rocheux par texture + carte de normales procédurales ; couleurs variées (gris, brun, ocre, noir carbone, quelques fragments
   métalliques) ; tailles très variées ; chacun tourne lentement sur lui-même et suit son orbite, légèrement excentrique.
   Rendu en instances : un seul dessin par (modèle, finesse, matière). Éclairage = celui de la scène (le soleil Raylé) : une face éclairée, l'autre
   sombre mais pleine. Moins d'astéroïdes et modèles plus simples en qualité basse et en mode jeu. */
export const NB_ASTEROIDES_MAX = 3000;

/* Texture rocheuse sans raccord (bruit de valeurs périodique) : albédo + carte de normales. */
function texturesRoche(taille = 256) {
  const hash = (x, y, p, s) => { x = ((x % p) + p) % p; y = ((y % p) + p) % p; let n = (x * 374761393 + y * 668265263 + s * 1274126177) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const lisse = t => t * t * (3 - 2 * t);
  const bruit = (x, y, p, s) => { const ix = Math.floor(x), iy = Math.floor(y), fx = lisse(x - ix), fy = lisse(y - iy); return (hash(ix, iy, p, s) * (1 - fx) + hash(ix + 1, iy, p, s) * fx) * (1 - fy) + (hash(ix, iy + 1, p, s) * (1 - fx) + hash(ix + 1, iy + 1, p, s) * fx) * fy; };
  const h = new Float32Array(taille * taille), g = new Float32Array(taille * taille);
  for (let y = 0; y < taille; y++) for (let x = 0; x < taille; x++) {
    const u = x / taille, v = y / taille;
    let rel = 0.5 * bruit(u * 6, v * 6, 6, 1) + 0.28 * bruit(u * 16, v * 16, 16, 2) + 0.14 * bruit(u * 40, v * 40, 40, 3) + 0.08 * bruit(u * 96, v * 96, 96, 4);
    const fiss = 1 - Math.abs(2 * bruit(u * 12, v * 12, 12, 5) - 1);   // fissures et arêtes
    rel = rel * 0.8 + Math.pow(fiss, 5) * 0.28;
    h[y * taille + x] = rel;
    g[y * taille + x] = 0.55 + 0.45 * (0.6 * bruit(u * 8, v * 8, 8, 6) + 0.4 * bruit(u * 32, v * 32, 32, 7)) - 0.18 * Math.pow(fiss, 5);
  }
  const cA = document.createElement('canvas'), cN = document.createElement('canvas'); cA.width = cA.height = cN.width = cN.height = taille;
  const xA = cA.getContext('2d'), xN = cN.getContext('2d'), iA = xA.createImageData(taille, taille), iN = xN.createImageData(taille, taille);
  const at = (x, y) => h[((y + taille) % taille) * taille + ((x + taille) % taille)];
  for (let y = 0; y < taille; y++) for (let x = 0; x < taille; x++) {
    const i = (y * taille + x) * 4, dx = (at(x + 1, y) - at(x - 1, y)) * 3.2, dy = (at(x, y + 1) - at(x, y - 1)) * 3.2, l = Math.hypot(dx, dy, 1);
    iN.data[i] = Math.round((-dx / l * 0.5 + 0.5) * 255); iN.data[i + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255); iN.data[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); iN.data[i + 3] = 255;
    const c = Math.max(0, Math.min(1, g[y * taille + x])) * 255; iA.data[i] = iA.data[i + 1] = iA.data[i + 2] = c; iA.data[i + 3] = 255;
  }
  xA.putImageData(iA, 0, 0); xN.putImageData(iN, 0, 0);
  const tA = new THREE.CanvasTexture(cA), tN = new THREE.CanvasTexture(cN);
  tA.colorSpace = THREE.SRGBColorSpace; tN.colorSpace = THREE.NoColorSpace;
  for (const t of [tA, tN]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.anisotropy = 4; }
  return { albedo: tA, normales: tN };
}

export function creerCeinture({ interieur, exterieur }) {
  const groupe = new THREE.Group(); groupe.name = 'ceinture';
  const a = repartirCeinture(NB_ASTEROIDES_MAX, interieur, exterieur);
  const tex = texturesRoche();
  const matRoche = new THREE.MeshStandardMaterial({ map: tex.albedo, normalMap: tex.normales, normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.94, metalness: 0.02, emissive: 0x0d1a38, emissiveMap: tex.albedo });   // lueur ambiante bleutée : la face sombre reste lisible (texture et relief), jamais le fond du ciel
  const matMetal = new THREE.MeshStandardMaterial({ map: tex.albedo, normalMap: tex.normales, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.36, metalness: 0.9, color: 0xc4c8d2, emissive: 0x0a1230, emissiveMap: tex.albedo });

  // Un maillage instancié par (modèle, finesse, matière) ; chacun garde la liste (triée) des astéroïdes qu'il porte.
  const clefs = new Map();
  for (let i = 0; i < NB_ASTEROIDES_MAX; i++) { const k = a.type[i] * 10 + a.lod[i] * 2 + (a.classe[i] === 4 ? 1 : 0); if (!clefs.has(k)) clefs.set(k, []); clefs.get(k).push(i); }
  const maillages = [];
  const place = new Int32Array(NB_ASTEROIDES_MAX), dans = new Int32Array(NB_ASTEROIDES_MAX);   // pour chaque astéroïde : son maillage et sa place
  const c = new THREE.Color();
  for (const [k, liste] of clefs) {
    const type = Math.floor(k / 10), lod = Math.floor((k % 10) / 2), metal = k % 2 === 1;
    const m = new THREE.InstancedMesh(new THREE.BufferGeometry(), metal ? matMetal : matRoche, liste.length);
    m.frustumCulled = false; m.userData = { type, lod, liste };
    liste.forEach((i, j) => { place[i] = maillages.length; dans[i] = j; if (!metal) m.setColorAt(j, c.setRGB(a.teinte[i * 3], a.teinte[i * 3 + 1], a.teinte[i * 3 + 2], THREE.SRGBColorSpace)); });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    maillages.push(m); groupe.add(m);
  }

  // Géométries : par niveau de finesse, construites à la demande puis gardées
  const geoms = new Map();
  const geometrie = (niveau, type, lod) => {
    const cle = niveau + type + lod; let g = geoms.get(cle);
    if (!g) {
      const f = construireForme(TYPES[type], FINESSES[niveau][lod], 3 + type);
      g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(f.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(f.nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(f.uv, 2));
      g.setIndex(new THREE.BufferAttribute(f.index, 1)); g.computeBoundingSphere();
      geoms.set(cle, g);
    }
    return g;
  };
  let niveau = null, actifs = NB_ASTEROIDES_MAX, temps = 0, accu = 0, fige = false;
  const tmp = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), ech = new THREE.Vector3(), s = {};
  function ecrire(i) {
    etatAsteroide(a, i, temps, s);
    pos.set(s.x, s.y, s.z); quat.set(s.qx, s.qy, s.qz, s.qw); ech.set(a.echelle[i * 3], a.echelle[i * 3 + 1], a.echelle[i * 3 + 2]);
    maillages[place[i]].setMatrixAt(dans[i], tmp.compose(pos, quat, ech));
  }
  function tout() { for (let i = 0; i < actifs; i++) ecrire(i); for (const m of maillages) m.instanceMatrix.needsUpdate = true; }
  function compter() {
    for (const m of maillages) { const l = m.userData.liste; let lo = 0, hi = l.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (l[mid] < actifs) lo = mid + 1; else hi = mid; } m.count = lo; }
  }
  const api = {
    objet: groupe,
    /* Finesse des modèles : 'haute', 'moyenne' ou 'basse' (bien moins de triangles). */
    detail(nom) {
      nom = FINESSES[nom] ? nom : 'haute'; if (nom === niveau) return;
      niveau = nom;
      for (const m of maillages) m.geometry = geometrie(niveau, m.userData.type, m.userData.lod);
    },
    nombre(n) { actifs = Math.max(0, Math.min(NB_ASTEROIDES_MAX, n)); compter(); tout(); },
    /* Chaque astéroïde suit son orbite et tourne sur lui-même ; mise à jour limitée à 60 par seconde (mouvement très lent). */
    maj(dt) {
      if (fige) return;
      accu += dt; if (accu < 1 / 60) return;
      temps += accu; accu = 0; tout();
    },
    /* Fige le mouvement (tests, captures). */
    figer(oui) { fige = !!oui; },
    /* Position et taille de l'astéroïde i (monde), pour viser un caillou précis. */
    echantillon(i) { const s2 = {}; etatAsteroide(a, i, temps, s2); return { x: s2.x, y: s2.y, z: s2.z, taille: a.taille[i], classe: a.classe[i], type: a.type[i] }; },
    plusGros() { let m = 0; for (let i = 0; i < actifs; i++) if (a.taille[i] > a.taille[m]) m = i; return m; },
    info() { return { actifs, niveau, maillages: maillages.length, triangles: maillages.reduce((t, m) => t + m.count * (m.geometry.index ? m.geometry.index.count / 3 : 0), 0) }; }
  };
  api.detail('haute'); compter(); tout();
  return api;
}
