// Les planètes dans le ciel de la Terre : la vue Terre (Terre, Lune, Soleil, ISS, satellites) montre aussi les autres planètes du système solaire,
// à leur vraie direction vue de la Terre (Mercure → Neptune), pour que le fond de l'accueil contienne tout l'écosystème.
// Les disques sont volontairement agrandis (une planète vraie ferait moins d'un pixel) ; pour s'en approcher, Raylé bascule sur la vue Système solaire.
// creerFondEcosysteme(ctx) → { groupe, maj(ts), directions(), detruire() }
import { ASTRES, ORDRE_PLANETES, positionHelio } from '../donnees/planetes.js?v=2026.10.15.9';

const RAD = Math.PI / 180, OBLIQUITE = 23.4393 * RAD;
const DIST = 2200;                                                  // distance de dessin (la caméra voit jusqu'à 4000)
// rayon angulaire apparent (degrés) : agrandi, dans l'ordre de grandeur de ce que l'œil devine
const ANGLE = { mercure: .17, venus: .34, mars: .3, jupiter: .46, saturne: .38, uranus: .22, neptune: .2 };
const TEX = { mercure: 'espace/mercure-', venus: 'espace/venus-', mars: 'espace/mars-', jupiter: 'espace/jupiter-', saturne: 'espace/saturne-', uranus: 'espace/uranus-', neptune: 'espace/neptune-' };

// repère de l'écliptique (UA) → repère de la scène Terre (y = pôle nord céleste, voir js/univers/support/astro.js : direction)
export function versScene(p) {
  const c = Math.cos(OBLIQUITE), s = Math.sin(OBLIQUITE);
  return { x: p.x, y: p.y * s + p.z * c, z: -(p.y * c - p.z * s) };
}
// direction (vecteur unitaire de la scène) de chaque planète vue de la Terre
export function directionsPlanetes(ts) {
  const T = positionHelio('terre', ts), out = {};
  if (!T) return out;
  for (const id of ORDRE_PLANETES) {
    if (id === 'terre') continue;
    const P = positionHelio(id, ts); if (!P) continue;
    const v = versScene({ x: P.x - T.x, y: P.y - T.y, z: P.z - T.z }), n = Math.hypot(v.x, v.y, v.z) || 1;
    out[id] = { x: v.x / n, y: v.y / n, z: v.z / n, distUA: n };
  }
  return out;
}

export async function creerFondEcosysteme(ctx) {
  const { THREE, noyau, q } = ctx;
  const groupe = new THREE.Group(); groupe.name = 'planetes-dans-le-ciel';
  const res = q.tex >= 4096 ? '2k.webp' : '1k.webp';
  const libres = [], corps = new Map();
  let dernier = -1e15, tex = [], mort = false;
  const charger = async nom => { try { return await noyau.texture(nom, { srgb: true }); } catch (e) { return null; } };

  for (const id of Object.keys(ANGLE)) {
    const r = DIST * Math.tan(ANGLE[id] * RAD), d = ASTRES[id];
    const g = new THREE.SphereGeometry(1, 40, 20), m = new THREE.MeshBasicMaterial({ color: d && d.couleur != null ? d.couleur : 0xffffff, toneMapped: false });
    libres.push(g, m);
    const mesh = new THREE.Mesh(g, m); mesh.scale.setScalar(r); mesh.name = 'ciel:' + id; mesh.frustumCulled = false;
    const pivot = new THREE.Group(); pivot.add(mesh); groupe.add(pivot);
    const C = { id, pivot, mesh, r, anneau: null };
    if (id === 'saturne') {
      const ri = 1.24, ro = 2.27, gr = new THREE.RingGeometry(ri, ro, 96, 1), pos = gr.attributes.position, uv = gr.attributes.uv, v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); uv.setXY(i, (v.length() - ri) / (ro - ri), .5); }
      const mr = new THREE.MeshBasicMaterial({ color: 0xcdbb94, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: .92, toneMapped: false });
      libres.push(gr, mr);
      const an = new THREE.Mesh(gr, mr); an.rotation.x = -Math.PI / 2 + 26.7 * RAD; an.scale.setScalar(r); pivot.add(an); C.anneau = mr;
    } else if (id === 'uranus') {
      const gr = new THREE.RingGeometry(1.64, 2.0, 64), mr = new THREE.MeshBasicMaterial({ color: 0x9fb4b8, transparent: true, opacity: .2, side: THREE.DoubleSide, depthWrite: false });
      libres.push(gr, mr);
      const an = new THREE.Mesh(gr, mr); an.rotation.x = -Math.PI / 2 + 15 * RAD; an.scale.setScalar(r); pivot.add(an);
    }
    corps.set(id, C);
    // les textures arrivent d'elles-mêmes : la scène n'attend pas leur téléchargement
    charger(TEX[id] + res).then(t => { if (mort || !t) return; tex.push(t); m.map = t; m.color.setHex(0xffffff); m.needsUpdate = true; });
    if (id === 'saturne') charger('espace/saturne-anneaux.webp').then(t => { if (mort || !t || !C.anneau) return; tex.push(t); C.anneau.map = t; C.anneau.color.setHex(0xffffff); C.anneau.needsUpdate = true; });
  }

  // les planètes bougent très lentement : on ne recalcule leur direction que toutes les minutes simulées
  function maj(ts) {
    if (Math.abs(ts - dernier) < 60000) return;
    dernier = ts;
    const dirs = directionsPlanetes(ts);
    for (const [id, C] of corps) { const d = dirs[id]; if (d) C.pivot.position.set(d.x * DIST, d.y * DIST, d.z * DIST); }
  }
  maj(Date.now());
  // planète touchée (id) sous le point (nx, ny) en coordonnées normalisées de l'écran, ou null
  const rayon = new THREE.Raycaster();
  function pick(camera, nx, ny) {
    if (!groupe.visible) return null;
    rayon.setFromCamera({ x: nx, y: ny }, camera);
    // marge de toucher : les disques sont petits ; on prend la planète la plus proche du rayon dans un cône de ~1,2°
    let meilleur = null, mieux = Math.tan(1.2 * RAD);
    for (const [id, C] of corps) { const v = C.pivot.position.clone().sub(rayon.ray.origin), d = v.dot(rayon.ray.direction); if (d <= 0) continue; const e = v.addScaledVector(rayon.ray.direction, -d).length() / d; if (e < mieux) { mieux = e; meilleur = id; } }
    return meilleur;
  }
  const positions = () => { const o = {}; for (const [id, C] of corps) o[id] = C.pivot.position.clone().normalize(); return o; };

  return {
    groupe, maj, positions, corps, pick,
    detruire() { mort = true; for (const o of libres) { try { o.dispose(); } catch (e) { /* déjà libéré */ } } tex = []; groupe.removeFromParent(); },
  };
}
