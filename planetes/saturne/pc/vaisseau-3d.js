import * as THREE from 'three';
import { peindreCoque, peindreVerre, spriteLueur, alea, ACCENT_CYAN, ACCENT_SABLE } from './textures-coque.js';

/* ═════════════ LE VAISSEAU « VÉSALE » (modélisation procédurale, entièrement originale) ═════════════
   Nom en hommage à l'anatomiste André Vésale. Silhouette : fuseau allongé à facettes, pont de commandement vitré sur le dessus, anneau médical tournant autour de la
   coque, deux nacelles de propulsion latérales, mât d'antennes, radiateurs. Repère local : avant = −Z, haut = +Y, droite = +X ; unité = le mètre (longueur ≈ 44 m) ;
   l'ensemble est mis à l'échelle (ECHELLE) pour tenir dans la galaxie (≈ 3 unités). Aucun fichier externe : géométries, textures PBR, lumières et flammes sont
   produites par le code. Trois niveaux de détail (0 léger, 1 moyen, 2 élevé) ; un modèle simplifié sert de silhouette dans la vue d'ensemble de la galaxie. */
export const ECHELLE = 0.07, LONGUEUR = 44;

const bascule = g => g.rotateX(Math.PI / 2);        // un cylindre d'axe Y devient un cylindre d'axe Z (sommet vers +Z)
function cyl(rAvant, rArriere, long, seg, z0, { ay = 1, ax = 1 } = {}) {
  const g = new THREE.CylinderGeometry(rArriere, rAvant, long, seg, 1, false); bascule(g); g.scale(ax, ay, 1); g.translate(0, 0, z0); return g;
}
function echelleUV(g, ku, kv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ku, uv.getY(i) * kv); return g; }
const boite = (w, h, l, x, y, z) => { const g = new THREE.BoxGeometry(w, h, l); g.translate(x, y, z); return g; };

export function creerVaisseau({ detail = 2, graine = 11, renderer = null, envMap = null } = {}) {
  const R = alea(graine), groupe = new THREE.Group(); groupe.name = 'vaisseau-vesale';
  const interne = new THREE.Group(); interne.scale.setScalar(ECHELLE); groupe.add(interne);       // tout le modèle est en mètres
  const tex = peindreCoque({ taille: detail >= 2 ? 1024 : detail === 1 ? 512 : 256, graine, hublots: true });
  const texAnneau = peindreCoque({ taille: detail >= 2 ? 1024 : 512, graine: graine + 5, teinte: [196, 204, 214], hublots: true });
  const mat = (t, o = {}) => new THREE.MeshStandardMaterial({ map: t.map, roughnessMap: t.roughnessMap, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.4, metalness: 0.55, roughness: 1, envMap, envMapIntensity: 0.9, ...o });
  const matCoque = mat(tex), matAnneau = mat(texAnneau), matSombre = new THREE.MeshStandardMaterial({ color: 0x2b323d, roughness: 0.6, metalness: 0.75, envMap });
  const matSable = new THREE.MeshStandardMaterial({ color: 0xc9b27a, roughness: 0.5, metalness: 0.6, envMap });
  const matVerre = new THREE.MeshPhysicalMaterial({ color: 0x9fd8ea, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.2, envMap, envMapIntensity: 2.2, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false, alphaMap: peindreVerre({ graine: 5 }) });
  const matVoyant = (c) => new THREE.MeshBasicMaterial({ color: c });
  const pieces = { nez: new THREE.Group(), coque: new THREE.Group(), anneau: new THREE.Group(), nacelles: new THREE.Group(), mat: new THREE.Group(), pont: new THREE.Group(), verriere: new THREE.Group(), radiateurs: new THREE.Group(), moteurs: new THREE.Group() };
  for (const p of Object.values(pieces)) interne.add(p);
  const ajoute = (g, m, groupeCible, nom) => { const o = new THREE.Mesh(g, m); o.name = nom || ''; o.castShadow = o.receiveShadow = detail >= 1; groupeCible.add(o); return o; };
  const seg = detail >= 2 ? 12 : detail === 1 ? 10 : 8;

  // ── fuselage : nez effilé, corps central facetté, bloc moteur
  ajoute(echelleUV(cyl(0.5, 3.6, 10, seg, -17, { ay: 0.78 }), 2.2, 1.2), matCoque, pieces.nez, 'nez');
  ajoute(echelleUV(cyl(3.6, 4.7, 8, seg, -8, { ay: 0.9 }), 3, 1.4), matCoque, pieces.coque, 'coque-avant');
  ajoute(echelleUV(cyl(4.7, 4.7, 16, seg, 4, { ay: 0.92 }), 4, 2.4), matCoque, pieces.coque, 'coque-centrale');
  ajoute(echelleUV(cyl(4.7, 3.4, 8, seg, 16, { ay: 0.92 }), 3, 1.2), matCoque, pieces.coque, 'bloc-moteur');
  ajoute(echelleUV(boite(2.2, 1.2, 28, 0, -4.1, -1), 1, 5), matSombre, pieces.coque, 'quille');
  for (const s of [-1, 1]) ajoute(echelleUV(boite(0.5, 2.2, 18, s * 4.2, 0.4, 1), 1, 3), matSable, pieces.coque, 'lisse');

  // ── pont de commandement : coque en panneaux autour d'un intérieur creux, verrière panoramique à l'avant et sur les côtés
  // le toit seul (l'intérieur reste visible par les vitres) : plaque supérieure et cloison arrière
  ajoute(echelleUV(boite(7.6, 0.4, 7.2, 0, 6.35, -8.9), 2, 1.5), matCoque, pieces.pont, 'toit-pont');
  ajoute(echelleUV(boite(7.6, 3.4, 0.5, 0, 4.7, -5.2), 2, 1), matCoque, pieces.pont, 'cloison-arriere');
  ajoute(boite(7.6, 0.5, 8, 0, 3.0, -9), matSombre, pieces.pont, 'plancher-pont');
  for (const s of [-1, 1]) { ajoute(boite(0.35, 3.4, 7.4, s * 3.9, 4.7, -8.9), matCoque, pieces.pont, 'montant'); }
  // verrière : trois vitres inclinées à l'avant + vitres latérales, montants fins
  const vitre = (w, h, x, y, z, rx, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matVerre); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.renderOrder = 3; pieces.verriere.add(m); return m; };
  vitre(4.0, 3.6, 0, 4.7, -12.4, -0.62, 0);
  vitre(3.2, 3.6, -3.05, 4.7, -11.1, -0.62, -0.95); vitre(3.2, 3.6, 3.05, 4.7, -11.1, -0.62, 0.95);
  for (const s of [-1, 1]) { vitre(6.4, 2.4, s * 3.75, 4.9, -8.0, 0, Math.PI / 2 * s); }
  for (const [x, z, ry] of [[-1.95, -12.35, 0], [1.95, -12.35, 0], [-4.6, -10.1, -0.95], [4.6, -10.1, 0.95]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.9, 0.22), matSombre); m.position.set(x * 0.9, 4.7, z); m.rotation.set(-0.5, ry, 0); pieces.verriere.add(m); }
  ajoute(boite(4.4, 0.35, 0.6, 0, 6.2, -13.3), matSable, pieces.verriere, 'arc-avant');

  // ── anneau médical tournant
  const rAnneau = 10.2;
  ajoute(echelleUV(new THREE.TorusGeometry(rAnneau, 1.25, detail >= 2 ? 20 : 12, detail >= 2 ? 96 : 48), 8, 1.6), matAnneau, pieces.anneau, 'anneau');
  const nbRayons = 8;
  for (let i = 0; i < nbRayons; i++) { const a = i / nbRayons * Math.PI * 2, longueur = rAnneau - 4.6; const g = new THREE.BoxGeometry(0.7, longueur, 0.7); g.translate(0, (rAnneau + 4.6) / 2, 0); g.rotateZ(a); ajoute(g, matSombre, pieces.anneau, 'rayon'); }
  const bandes = new THREE.Mesh(new THREE.TorusGeometry(rAnneau, 1.27, 8, 64, Math.PI * 2), new THREE.MeshBasicMaterial({ color: 0x8fd0e3, wireframe: false, transparent: true, opacity: 0.0 })); pieces.anneau.add(bandes);
  pieces.anneau.position.z = 2;

  // ── nacelles et tuyères
  const buses = [];
  const matInterieurTuyere = new THREE.MeshBasicMaterial({ color: 0xbfe9ff });
  function nacelle(s) {
    const g = new THREE.Group(); g.position.set(s * 9.2, -0.8, 8);
    ajoute(echelleUV(cyl(1.4, 1.9, 16, seg, 0, { ay: 1 }), 3, 2), matCoque, g, 'nacelle');
    ajoute(echelleUV(cyl(1.9, 2.1, 3, seg, 9.4), 1, 1), matSombre, g, 'bloc-nacelle');
    ajoute(echelleUV(boite(5.4, 0.8, 5, -s * 4.4, 0.4, -1), 2, 1), matCoque, g, 'pylone');
    for (const [dx, dy] of [[0, 0], [0.95, 0.5], [-0.95, 0.5]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.9, 1.5, 12, 1, true), matSombre); t.rotation.x = Math.PI / 2; t.position.set(dx, dy - 0.2, 11.4); g.add(t);
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.58, 16), matInterieurTuyere); d.position.set(dx, dy - 0.2, 11.0); d.rotation.y = Math.PI; g.add(d);
      buses.push({ position: new THREE.Vector3(s * 9.2 + dx, -0.8 + dy - 0.2, 8 + 12.2), taille: 0.9, principal: false });
    }
    pieces.nacelles.add(g);
  }
  nacelle(-1); nacelle(1);
  // tuyères principales
  for (const [dx, dy, r] of [[0, 0, 1.6], [-2.1, 0.7, 0.9], [2.1, 0.7, 0.9], [-1.2, -1.4, 0.9], [1.2, -1.4, 0.9]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 1.15, 2.4, 14, 1, true), matSombre); t.rotation.x = Math.PI / 2; t.position.set(dx, dy, 21.4); pieces.moteurs.add(t);
    const d = new THREE.Mesh(new THREE.CircleGeometry(r * 0.7, 18), matInterieurTuyere); d.position.set(dx, dy, 20.4); d.rotation.y = Math.PI; pieces.moteurs.add(d);
    buses.push({ position: new THREE.Vector3(dx, dy, 22.7), taille: r * 1.25, principal: r > 1.2 });
  }

  // ── mât d'antennes, parabole, radiateurs
  const mast = new THREE.Group(); mast.position.set(0, 4.2, 6);
  ajoute(new THREE.CylinderGeometry(0.12, 0.2, 5.4, 6), matSombre, mast, 'mat'); const mh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 5), matSombre); mh.position.set(0, 3.2, 0); mh.rotation.z = Math.PI / 2; mast.add(mh);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.4, 18, 8, 0, Math.PI * 2, 0, 0.9), matSable); dish.position.set(0.9, 1.4, 0); dish.rotation.set(-0.2, 0, -1.2); dish.material = matSable.clone(); dish.material.side = THREE.DoubleSide; mast.add(dish);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), matVoyant(0xffffff)); strobe.position.y = 2.8; mast.add(strobe);
  pieces.mat.add(mast);
  for (const s of [-1, 1]) {
    const rad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 6.4, 9.5), new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.35, metalness: 0.85, emissive: 0x0b2a38, emissiveIntensity: 1, envMap }));
    rad.position.set(s * 6.0, 2.2, 14); rad.rotation.z = s * 0.7; pieces.radiateurs.add(rad);
    const bras = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.4, 6), matSombre); bras.position.set(s * 4.6, 1.0, 14); bras.rotation.z = s * 0.7; pieces.radiateurs.add(bras);
  }

  // ── détails de surface (greebles) en instances : caissons, évents, antennes courtes posés sur le fuselage
  const nbGreebles = detail >= 2 ? 240 : detail === 1 ? 80 : 0;
  if (nbGreebles) {
    const g = new THREE.BoxGeometry(1, 1, 1), im = new THREE.InstancedMesh(g, matCoque, nbGreebles), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < nbGreebles; i++) {
      const z = -9 + R() * 26, th = (R() * 1.6 - 0.8) + (R() < 0.5 ? 0 : Math.PI * 0.0), rr = z < -4 ? 3.6 + (z + 8) * 0.12 : 4.7, ang = Math.PI / 2 + (R() - 0.5) * (R() < 0.6 ? 2.4 : 5.6);
      p.set(Math.cos(ang) * rr, Math.sin(ang) * rr * 0.92, z); e.set(0, 0, ang - Math.PI / 2); q.setFromEuler(e); s.set(0.5 + R() * 1.6, 0.18 + R() * 0.5, 0.5 + R() * 2.2); p.addScaledVector(new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0), s.y * 0.4);
      M.compose(p, q, s); im.setMatrixAt(i, M);
    }
    im.castShadow = im.receiveShadow = true; pieces.coque.add(im);
  }

  // ── feux de navigation : rouge à bâbord, vert à tribord, blanc sur le mât, orangé sous la coque
  const feux = [];
  const feu = (couleur, x, y, z, nom, periode) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), matVoyant(couleur)); m.position.set(x, y, z); interne.add(m);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteLueur(), color: couleur, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.setScalar(4); halo.position.copy(m.position); interne.add(halo);
    feux.push({ m, halo, periode, phase: R() * 6.28, nom }); return m;
  };
  feu(0xff2a2a, -9.2, -0.8, 8, 'babord', 0); feu(0x2aff6a, 9.2, -0.8, 8, 'tribord', 0); feu(0xffffff, 0, 7.4, 6, 'mat', 1.4); feu(0xffa040, 0, -5.2, -1, 'dessous', 2.2);
  feux.push({ m: strobe, halo: null, periode: 1.4, phase: 0, nom: 'strobe' });

  // ── flammes : un cône additif par tuyère, plus un cœur ; leur longueur suit la poussée
  const matFlamme = () => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uPoussee: { value: 0 }, uTemps: { value: 0 }, uCouleurA: { value: new THREE.Color(0.55, 0.85, 1.0) }, uCouleurB: { value: new THREE.Color(0.25, 0.45, 1.0) } },
    vertexShader: 'varying vec2 vUv; varying float vY; void main(){ vUv = uv; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uPoussee, uTemps; uniform vec3 uCouleurA, uCouleurB; varying vec2 vUv; varying float vY;\n void main(){ float t = clamp(vUv.y, 0.0, 1.0); float f = 0.75 + 0.25 * sin(uTemps * 40.0 + vUv.x * 12.0 + t * 8.0); float a = pow(1.0 - t, 1.6) * f * uPoussee; vec3 c = mix(uCouleurA, uCouleurB, t); gl_FragColor = vec4(c * (0.7 + (1.0 - t) * 0.9), a * 0.55); }'
  });
  const flammes = buses.map(b => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(b.taille * 0.5, 1, 14, 1, true), matFlamme()); cone.geometry.translate(0, 0.5, 0); cone.geometry.rotateX(Math.PI / 2);   // base large à la tuyère (z = 0), pointe vers +Z (l'arrière)
    cone.position.copy(b.position); cone.position.z -= 1.2; cone.scale.set(1, 1, 0.001); cone.renderOrder = 4; interne.add(cone);
    return { cone, b };
  });
  for (const f of flammes) { const uv = f.cone.geometry.attributes.uv, pos = f.cone.geometry.attributes.position; for (let i = 0; i < uv.count; i++) uv.setY(i, Math.min(1, Math.max(0, pos.getZ(i)))); }

  // ── éclairage propre au vaisseau (projecteurs d'approche) : activés seulement aux niveaux de détail élevés
  const projecteurs = [];
  if (detail >= 2) for (const s of [-1, 1]) { const l = new THREE.SpotLight(0xdff4ff, 0, 40 * ECHELLE, 0.5, 0.6, 0); l.position.set(s * 2.2, 0.2, -19); l.target.position.set(s * 4, -1, -60); interne.add(l, l.target); projecteurs.push(l); }
  const lueurMoteur = new THREE.PointLight(0x7fb8ff, 0, 22 * ECHELLE, 0);   // portée en unités du monde (la lampe n'éclaire que le vaisseau) lueurMoteur.position.set(0, 0, 26); interne.add(lueurMoteur);

  let tAnneau = 0;
  const api = {
    groupe, interne, pieces, buses, flammes, feux, detail, projecteurs, rayon: LONGUEUR * ECHELLE * 0.5, ECHELLE,
    /* poussée : 0…1 (postcombustion jusqu'à 1,6) ; t : secondes ; arrive : le vaisseau est-il en manœuvre ? */
    maj(dt, t, poussee = 0, { anneauVitesse = 0.12, projecteursOn = false } = {}) {
      tAnneau += dt * anneauVitesse; pieces.anneau.rotation.z = tAnneau;
      for (const f of flammes) { const m = f.cone.material; m.uniforms.uTemps.value = t; m.uniforms.uPoussee.value = Math.min(1.6, poussee) * (f.b.principal ? 1 : 0.8); const L = Math.max(0.001, poussee * (f.b.principal ? 6.5 : 3.8) * (0.92 + 0.08 * Math.sin(t * 31 + f.b.position.x))); f.cone.scale.set(1, 1, L); f.cone.visible = poussee > 0.02; }
      for (const f of feux) {
        const on = f.periode === 0 ? 1 : (Math.sin(t * (6.2832 / f.periode) + f.phase) > 0.82 ? 1 : 0.0);
        f.m.visible = on > 0.5; if (f.halo) f.halo.visible = on > 0.5;
      }
      lueurMoteur.intensity = poussee * 1.6; for (const l of projecteurs) l.intensity = projecteursOn ? 6 : 0;
    },
    /* Cache l'enveloppe du pont pour la vue du cockpit (on regarde de l'intérieur). */
    vueInterieure(oui) { pieces.nez.visible = !oui; },
    dispose() { groupe.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach(x => x.dispose && x.dispose()); } }); for (const t of [tex, texAnneau]) for (const k of ['map', 'roughnessMap', 'normalMap', 'emissiveMap']) t[k].dispose(); }
  };
  return api;
}

/* Particules de sillage : points additifs émis par les tuyères, qui restent dans le monde (le vaisseau s'éloigne d'elles). */
export function creerSillage({ n = 400 } = {}) {
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), age = new Float32Array(n).fill(9), taille = new Float32Array(n), duree = new Float32Array(n).fill(1);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('age', new THREE.BufferAttribute(age, 1)); geo.setAttribute('taille', new THREE.BufferAttribute(taille, 1)); geo.setAttribute('duree', new THREE.BufferAttribute(duree, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTex: { value: spriteLueur(['rgba(255,255,255,1)', 'rgba(140,210,255,.55)', 'rgba(60,120,255,0)']) }, uEchelle: { value: 900 } },
    vertexShader: 'attribute float age, taille, duree; varying float vA; uniform float uEchelle; void main(){ float k = clamp(age / duree, 0.0, 1.0); vA = (1.0 - k) * step(age, duree); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(taille * (0.5 + 1.0 * k) * uEchelle / max(-mv.z, 0.0005), 60.0); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D uTex; varying float vA; void main(){ vec4 c = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(c.rgb * 0.8, c.a * vA * 0.5); }'
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 4;
  let idx = 0; const R = alea(99);
  return {
    pts, mat,
    /* origines : positions monde des tuyères ; arriere : direction monde (unitaire) ; vitesseVaisseau : THREE.Vector3 (u/s) ; intensite : 0…1,6 ; echelle : taille des particules (monde) */
    maj(dt, origines, arriere, vitesseVaisseau, intensite, echelle = 0.04) {
      for (let i = 0; i < n; i++) age[i] += dt;
      const parSeconde = intensite > 0.02 ? 60 * intensite : 0, emit = Math.floor(parSeconde * dt * origines.length + (R() < (parSeconde * dt * origines.length) % 1 ? 1 : 0));
      for (let k = 0; k < emit; k++) {
        const o = origines[(R() * origines.length) | 0], i = idx = (idx + 1) % n, v = 1.8 + intensite * 3.2;
        pos[i * 3] = o.x + (R() - 0.5) * echelle; pos[i * 3 + 1] = o.y + (R() - 0.5) * echelle; pos[i * 3 + 2] = o.z + (R() - 0.5) * echelle;
        vel[i * 3] = arriere.x * v * echelle * 8 + vitesseVaisseau.x * 0.0 + (R() - 0.5) * echelle * 6; vel[i * 3 + 1] = arriere.y * v * echelle * 8 + (R() - 0.5) * echelle * 6; vel[i * 3 + 2] = arriere.z * v * echelle * 8 + (R() - 0.5) * echelle * 6;
        age[i] = 0; duree[i] = 0.5 + R() * 0.9; taille[i] = echelle * (0.7 + R() * 0.9);
      }
      for (let i = 0; i < n; i++) if (age[i] < duree[i]) { pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt; }
      geo.attributes.position.needsUpdate = true; geo.attributes.age.needsUpdate = true; geo.attributes.taille.needsUpdate = true; geo.attributes.duree.needsUpdate = true;
    },
    dispose() { geo.dispose(); mat.dispose(); mat.uniforms.uTex.value.dispose(); }
  };
}
