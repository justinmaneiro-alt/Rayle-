/* ═════════════ CONSTRUCTION 3D : géométries procédurales (solution de repli quand aucun modèle GLB n'est fourni) ═════════════
   Tout prend THREE en paramètre (three.js est chargé à la demande par UI.three()). Les géométries sont « cuites » (transformées puis
   fusionnées) : une structure = un Mesh. Voir docs/anatomie-3d.md. */
import { J, VERTEBRES, zRachis, profilCote } from './donnees-os.js?v=2026.10.13.3';

/** Profil du tronc (rayon latéral, y) ; la profondeur est × 0,72 */
export const PROFIL_TRONC = [[.001, .88], [.12, .88], [.152, .93], [.158, 1.0], [.148, 1.08], [.138, 1.14], [.142, 1.21], [.156, 1.3], [.162, 1.37], [.145, 1.44], [.085, 1.49], [.056, 1.515], [.001, 1.515]];
export const PROFONDEUR_TRONC = .72;
export function rayonTronc(y) {
  const p = PROFIL_TRONC;
  for (let i = 1; i < p.length; i++) if (y <= p[i][1] || i === p.length - 1) { const a = p[i - 1], b = p[i]; const t = b[1] === a[1] ? 0 : Math.min(Math.max((y - a[1]) / (b[1] - a[1]), 0), 1); return a[0] + (b[0] - a[0]) * t; }
  return .15;
}

/** Segments du revêtement cutané des membres (côté gauche) */
export const SEG_PEAU = {
  MI: [{ a: J.hanche, b: J.genou, r0: .078, r1: .055 }, { a: J.genou, b: J.cheville, r0: .054, r1: .034 }],
  MS: [{ a: J.epaule, b: J.coude, r0: .043, r1: .033 }, { a: J.coude, b: J.poignet, r0: .033, r1: .024 }, { a: J.poignet, b: [.235, .68, 0], r0: .026, r1: .02 }]
};
/** Axe et rayon de la peau d'un membre à la hauteur y (pour poser le moignon et les emboîtures) */
export function axeMembre(membre, y) {
  const segs = SEG_PEAU[membre];
  let s = segs.find(g => y <= g.a[1] && y >= g.b[1]);
  if (!s) s = y > segs[0].a[1] ? segs[0] : segs[segs.length - 1];
  const t = Math.min(Math.max((s.a[1] - y) / (s.a[1] - s.b[1] || 1), 0), 1);
  return { x: s.a[0] + (s.b[0] - s.a[0]) * t, z: s.a[2] + (s.b[2] - s.a[2]) * t, r: s.r0 + (s.r1 - s.r0) * t };
}

export function construire(THREE) {
  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const miroir = (p, s) => [p[0] * s, p[1], p[2]];
  const sensCote = c => c === 'D' ? -1 : 1;

  // ── fusion de géométries ──
  function fusion(geoms) {
    let nbV = 0, nbI = 0;
    const liste = geoms.filter(Boolean);
    liste.forEach(g => { nbV += g.attributes.position.count; nbI += g.index ? g.index.count : g.attributes.position.count; });
    const pos = new Float32Array(nbV * 3), nor = new Float32Array(nbV * 3), idx = new Uint32Array(nbI);
    const fibre = liste.some(g => g.attributes.aFibre) ? new Float32Array(nbV * 2) : null;   // u = longueur du muscle, v = tour (stries des fibres)
    let ov = 0, oi = 0;
    liste.forEach(g => {
      if (fibre && g.attributes.aFibre) fibre.set(g.attributes.aFibre.array, ov * 2);
      pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3);
      if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + ov;
      else for (let i = 0; i < g.attributes.position.count; i++) idx[oi + i] = ov + i;
      ov += g.attributes.position.count; oi += g.index ? g.index.count : g.attributes.position.count;
      g.dispose();
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1));
    if (fibre) out.setAttribute('aFibre', new THREE.BufferAttribute(fibre, 2));
    out.computeBoundingSphere(); out.computeBoundingBox();
    return out;
  }
  const nettoie = g => { g.deleteAttribute('uv'); return g; };

  // ── primitives ──
  const Y = new THREE.Vector3(0, 1, 0);
  function geoCap(a, b, r0, r1, arrondi = true) {
    const va = V(a), vb = V(b), d = vb.clone().sub(va), L = Math.max(d.length(), 1e-4);
    const g = nettoie(new THREE.CylinderGeometry(r1, r0, L, 10, 1, true));
    const q = new THREE.Quaternion().setFromUnitVectors(Y, d.clone().normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(.5), q, new THREE.Vector3(1, 1, 1)));
    const out = [g];
    if (arrondi) { out.push(geoSph(a, r0)); out.push(geoSph(b, r1)); }
    return out;
  }
  function geoSph(c, r, seg = 10) { const g = nettoie(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 3))); g.translate(c[0], c[1], c[2]); return g; }
  function geoEll(c, r, rot) {
    const g = nettoie(new THREE.SphereGeometry(1, 14, 10)); g.scale(r[0], r[1], r[2]);
    if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'XYZ')));
    g.translate(c[0], c[1], c[2]); return g;
  }
  function partie(p, s) {
    const m = q => miroir(q, s);
    if (p.t === 'cap') return geoCap(m(p.a), m(p.b), p.r0, p.r1);
    if (p.t === 'ell') return [geoEll(m(p.c), p.r, p.rot ? [p.rot[0], p.rot[1] * s, p.rot[2] * s] : null)];
    if (p.t === 'sph') return [geoSph(m(p.c), p.r)];
    return [];
  }

  // ── os ──
  /** Géométrie d'un os (côté c) ; fracture : spec ou null. → { geoms:[…], eclats:[…], trait:{p,n}|null } */
  function geoOs(def, c, fracture) {
    const s = def.sym ? sensCote(c) : 1;
    const parts = def.parts;
    if (!fracture || !fracture.os) return { geoms: fusion(parts.flatMap(p => partie(p, s))), eclats: [], trait: null, fragments: null };
    const i = fracture.partie ? parts.findIndex(p => p.nom === fracture.partie) : parts.findIndex(p => p.diaphyse);
    const sh = parts[i]; if (!sh || sh.t !== 'cap') return { geoms: fusion(parts.flatMap(p => partie(p, s))), eclats: [], trait: null, fragments: null };
    const t = Math.min(Math.max(fracture.t == null ? .5 : fracture.t, .08), .92);
    const a = miroir(sh.a, s), b = miroir(sh.b, s);
    const pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const rt = sh.r0 + (sh.r1 - sh.r0) * t;
    const A = parts.slice(0, i).flatMap(p => partie(p, s)).concat(geoCap(a, pt, sh.r0, rt));
    const B = geoCap(pt, b, rt, sh.r1).concat(parts.slice(i + 1).flatMap(p => partie(p, s)));
    const axe = V(b).sub(V(a)).normalize();
    // déplacement du fragment distal : angulation, rotation axiale, décalage, raccourcissement
    const ang = (fracture.angulation || 0) * Math.PI / 180, rot = (fracture.rotation || 0) * Math.PI / 180;
    const dec = fracture.decalage || 0, rac = fracture.raccourcissement || 0;
    // axe d'angulation : perpendiculaire à l'os, dans le plan frontal (x) ou sagittal (z)
    const perpF = new THREE.Vector3(0, 0, 1), perpS = new THREE.Vector3(1, 0, 0);
    const axeAng = (fracture.plan === 'sagittal' ? perpS : perpF).clone().cross(axe).normalize();
    const axeRot = axe.clone();
    const M = new THREE.Matrix4().makeTranslation(pt[0], pt[1], pt[2])
      .multiply(new THREE.Matrix4().makeRotationAxis(axeAng.lengthSq() ? axeAng : perpF, ang * s))
      .multiply(new THREE.Matrix4().makeRotationAxis(axeRot, rot * s))
      .multiply(new THREE.Matrix4().makeTranslation(-pt[0], -pt[1], -pt[2]));
    const dep = (fracture.plan === 'sagittal' ? perpF : perpS).clone().multiplyScalar(dec * s).add(axe.clone().multiplyScalar(-rac));
    M.premultiply(new THREE.Matrix4().makeTranslation(dep.x, dep.y, dep.z));
    B.forEach(g => g.applyMatrix4(M));
    const eclats = [];
    if (fracture.type === 'comminutive') {
      for (let k = 0; k < 3; k++) { const g = nettoie(new THREE.IcosahedronGeometry(rt * (.5 + .12 * k), 0)); g.translate(pt[0] + (k - 1) * rt * 1.1 * s, pt[1] + (k % 2 ? .006 : -.008), pt[2] + (k === 1 ? rt * 1.2 : -rt * .9)); eclats.push(g); }
    }
    // trait de fracture : disque orienté (oblique ou spiroïde : incliné)
    const incl = fracture.type === 'oblique' ? .7 : fracture.type === 'spiroide' ? 1 : 0;
    return { geoms: fusion(A), distal: fusion(B), eclats, trait: { p: pt, r: rt * 1.35, incl, axe: axe.toArray() }, fragments: true };
  }

  // ── vertèbres, côtes, rachis ──
  function geoVertebre(v, tassement, eclat) {
    const lomb = v.region === 'lombaire', thor = v.region === 'thoracique';
    const r = lomb ? .022 : thor ? .0175 : v.id === 'C1' ? .013 : .0125, h = lomb ? .03 : thor ? .021 : .015;
    const corps = nettoie(new THREE.CylinderGeometry(r, r * 1.05, h, 14, 1, false));
    corps.scale(1, 1, .85);
    if (tassement) {                                          // cunéiformisation antérieure (tassement) ; l'explosion élargit le corps
      const p = corps.attributes.position;
      for (let k = 0; k < p.count; k++) { const z = p.getZ(k) / (r * .85); const f = 1 - tassement * Math.min(Math.max((z + 1) / 2, 0), 1); p.setY(k, p.getY(k) * f); if (eclat) { p.setX(k, p.getX(k) * (1 + .35 * tassement)); p.setZ(k, p.getZ(k) * (1 + .35 * tassement)); } }
      corps.computeVertexNormals();
    }
    const out = [corps];
    const epi = geoCap([0, 0, -r * .8], [0, -(lomb ? .008 : thor ? .012 : .006), -r * .8 - (lomb ? .036 : thor ? .04 : .03)], .005, .003); out.push(...epi);
    const tr = lomb ? .042 : thor ? .036 : .028;
    out.push(...geoCap([0, 0, -r * .55], [tr, 0, -r * .8], .003, .004, false), ...geoCap([0, 0, -r * .55], [-tr, 0, -r * .8], .003, .004, false));
    const arc = nettoie(new THREE.TorusGeometry(r * .62, .0035, 5, 12)); arc.translate(0, 0, -r * 1.35); out.push(arc);   // arc postérieur (autour du canal rachidien)
    return fusion(out);
  }

  /** Placement des vertèbres selon la scoliose : [{id,y,x,z,rotY,rotZ}] du bas vers le haut */
  function positionsRachis(courbes) {
    const spans = (courbes || []).map(c => {
      const v = VERTEBRES.find(q => q.id === c.apex) || VERTEBRES.find(q => q.id === 'T8');
      const L = v.region === 'lombaire' ? .22 : .26, cobb = Math.min(Math.max(c.cobb || 0, 0), 100) * Math.PI / 180;
      return { ya: v.y, L, A: L * Math.tan(cobb / 2) / Math.PI, sx: c.convexite === 'D' ? -1 : 1, rotAx: Math.min(.3 * (c.cobb || 0), 30) * Math.PI / 180 };
    });
    return VERTEBRES.map(v => {
      let x = 0, dx = 0, rotY = 0;
      spans.forEach(sp => {
        const u = (v.y - sp.ya + sp.L / 2) / sp.L;
        if (u > 0 && u < 1) { x += sp.sx * sp.A * Math.sin(Math.PI * u); dx += sp.sx * sp.A * Math.PI / sp.L * Math.cos(Math.PI * u); rotY += sp.sx * sp.rotAx * Math.sin(Math.PI * u); }
      });
      return { id: v.id, v, y: v.y, x, z: zRachis(v.y), rotZ: -Math.atan(dx), rotY };
    });
  }
  const matriceVertebre = p => new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.rotY, p.rotZ, 'YXZ')), new THREE.Vector3(1, 1, 1));

  function geoCote(i, c, pv) {
    const pr = profilCote(i), s = sensCote(c), N = 16;
    const pts = [];
    const zb = -.035, zf = pr.zAvant + .012 - zRachis(pv.y);
    for (let k = 0; k <= N; k++) {
      const u = k / N, th = u * Math.PI * pr.fin;
      pts.push(new THREE.Vector3(s * (.012 + (pr.rx - .012) * Math.sin(th)), -pr.chute * u, zb + (zf - zb) * (1 - Math.cos(th)) / 2));
    }
    const M = matriceVertebre(pv);
    pts.forEach(p => p.applyMatrix4(M));
    const g = nettoie(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, i === 1 ? .0065 : .0045, 6, false));
    return g;
  }

  // ── muscles et nerfs ──
  function geoFuseau(pts, rMax, miroirS) {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => V(miroir(p, miroirS))), false, 'centripetal');
    const seg = 18, g = new THREE.TubeGeometry(curve, seg, 1, 8, false);
    g.setAttribute('aFibre', g.attributes.uv.clone()); g.deleteAttribute('uv');
    const pos = g.attributes.position, ringPts = 9, tendon = Math.max(rMax * .14, .0035);
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, c = curve.getPointAt(t);
      const r = tendon + (rMax - tendon) * Math.pow(Math.sin(Math.PI * Math.min(Math.max(t * 1.0, 0), 1)), 1.3);
      for (let j = 0; j < ringPts; j++) { const k = i * ringPts + j; pos.setXYZ(k, c.x + (pos.getX(k) - c.x) * r, c.y + (pos.getY(k) - c.y) * r, c.z + (pos.getZ(k) - c.z) * r); }
    }
    g.computeVertexNormals();
    return g;
  }
  function geoMuscle(def, c) {
    const s = def.sym ? sensCote(c) : 1;
    return fusion(def.faisceaux.map(f => geoFuseau(f, def.r, s)));
  }
  function geoNerf(def, c) {
    const s = def.sym ? sensCote(c) : 1;
    return nettoie(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(def.trace.map(p => V(miroir(p, s))), false, 'centripetal'), Math.max(16, def.trace.length * 5), def.r, 6, false));
  }
  function geoTube(pts, r, seg = 20) { return nettoie(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(V), false, 'centripetal'), seg, r, 8, false)); }
  function geoOrgane(def) {
    if (def.tube) return geoTube(def.tube, def.r0, 36);
    return geoEll(def.c, def.r, def.rot);
  }

  // ── peau (silhouette translucide) ──
  function geoPeau() {
    const lathe = nettoie(new THREE.LatheGeometry(PROFIL_TRONC.map(p => new THREE.Vector2(p[0], p[1])), 28)); lathe.scale(1, 1, PROFONDEUR_TRONC);
    const out = { tronc: [lathe, ...geoCap([0, 1.5, -.005], [0, 1.64, 0], .056, .05, false), geoEll([0, 1.695, 0], [.085, .1, .1])], MI: { D: [], G: [] }, MS: { D: [], G: [] } };
    ['D', 'G'].forEach(c => {
      const s = sensCote(c);
      SEG_PEAU.MI.forEach(sg => out.MI[c].push(...geoCap(miroir(sg.a, s), miroir(sg.b, s), sg.r0, sg.r1)));
      out.MI[c].push(geoEll(miroir([.09, .03, .06], s), [.04, .03, .115]));
      SEG_PEAU.MS.forEach(sg => out.MS[c].push(...geoCap(miroir(sg.a, s), miroir(sg.b, s), sg.r0, sg.r1)));
      out.MS[c].push(geoEll(miroir([.23, .77, .005], s), [.03, .1, .02]));
    });
    return out;
  }

  // ── dermatomes ──
  function geoDermatome(def, c) {
    const s = sensCote(c), out = [];
    def.zones.forEach(z => {
      if (z.k === 'tronc') {
        const r = rayonTronc(z.y) + .004;
        const g = nettoie(new THREE.CylinderGeometry(r, r, z.h, 36, 1, true)); g.scale(1, 1, PROFONDEUR_TRONC); g.translate(0, z.y, 0); out.push(g);
      } else {
        const r = z.r + .004;
        const g = nettoie(new THREE.CylinderGeometry(r, r, z.y1 - z.y0, 14, 1, true, s > 0 ? z.th0 : -z.th0 - z.dth, z.dth));
        g.translate(z.c[0] * s, (z.y0 + z.y1) / 2, z.c[1]); out.push(g);
      }
    });
    return fusion(out);
  }

  return { V, fusion, nettoie, geoCap, geoSph, geoEll, geoOs, geoVertebre, positionsRachis, matriceVertebre, geoCote, geoMuscle, geoNerf, geoTube, geoOrgane, geoPeau, geoDermatome, sensCote, miroir, partie };
}
