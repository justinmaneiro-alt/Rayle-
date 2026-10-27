import * as THREE from 'three';
import { altitudeSol, fbm2, alea, borner, lisse, soleilLocal, nuit as facteurNuit, objetCeleste, TERRE_CIEL, lune, PHOBOS, DEIMOS, BASE, unitaire } from './mars-calcul.js';
import { texSol, texHalo, geometrieRocher, geometriePhobos, texSolaire } from './procedural.js';

/* ═════════════ LE PAYSAGE MARTIEN VU DEPUIS LA BASE ═════════════
   Repère : x = est, y = haut, z = sud ; la pièce est posée sur la plateforme (sol de la pièce à y = 0, terrain à -DECALAGE).
   Terrain en maillage POLAIRE (mailles fines près de la base, grossières au loin, jusqu'à 9 km), crête de cratère lointaine, rochers instanciés,
   ciel martien (butterscotch le jour, halo bleu autour du soleil au crépuscule), Phobos et Deimos à leur vraie position, la Terre en étoile du soir. */
export const DECALAGE = 0.38;
const ECHELLE_TEX = 5;   // mètres par répétition de la texture de sol

const VERT_CIEL = /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG_CIEL = /* glsl */`
  uniform vec3 uSoleil; varying vec3 vDir;
  void main(){
    vec3 d = normalize(vDir);
    float e = max(d.y, 0.0), se = uSoleil.y;
    float lum = smoothstep(-0.16, 0.22, se);                         // le ciel s'éteint avec le soleil
    float cosg = dot(d, uSoleil);
    vec3 horizon = vec3(0.86, 0.56, 0.38), zenith = vec3(0.46, 0.27, 0.19);
    vec3 col = mix(horizon, zenith, pow(e, 0.45)) * lum;
    float bas = 1.0 - smoothstep(0.04, 0.62, se);                      // soleil bas : halo BLEU autour du soleil (poussière), comme sur les vraies photos
    col += vec3(0.20, 0.42, 0.88) * pow(max(cosg, 0.0), 6.0) * (0.25 + 0.95 * bas) * lum * 1.15;
    col += vec3(0.28, 0.45, 0.85) * pow(max(cosg, 0.0), 40.0) * bas * lum * 0.8;
    col += vec3(1.0, 0.82, 0.62) * pow(max(cosg, 0.0), 90.0) * 0.5 * lum;
    col += vec3(0.95, 0.60, 0.42) * pow(1.0 - e, 7.0) * lum * 0.38;      // brume d'horizon
    float crep = smoothstep(-0.30, -0.02, se) * (1.0 - smoothstep(-0.02, 0.10, se));   // lueur du crépuscule, côté soleil
    col += vec3(0.30, 0.16, 0.28) * pow(1.0 - e, 3.0) * crep * (0.35 + 0.65 * max(cosg, 0.0));
    float a = clamp(lum * 1.15 + crep * 0.55 * pow(1.0 - e, 2.0) + 0.0, 0.0, 1.0);
    float disque = smoothstep(0.99996, 0.99999, cosg) * step(-0.02, d.y);   // ≈ 0,5° de diamètre
    col = mix(col, vec3(2.3, 2.0, 1.7), disque); a = max(a, disque);
    gl_FragColor = vec4(col, a);
  }`;

/* Maillage polaire du terrain. */
function creerTerrain(profil) {
  const S = Math.max(48, profil.segTerrain), N = profil.niveau === 'haute' ? 150 : profil.niveau === 'moyenne' ? 120 : 84;
  const r0 = 6, rMax = 9000, k = Math.pow(rMax / r0, 1 / (N - 1));
  const nv = N * S + 1, pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = [];
  pos.set([0, altitudeSol(0, 0), 0], 0); uv.set([0, 0], 0);
  for (let i = 0; i < N; i++) {
    const r = r0 * Math.pow(k, i);
    for (let j = 0; j < S; j++) {
      const a = (j + (i % 2) * 0.5) / S * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r, v = 1 + i * S + j;
      pos[v * 3] = x; pos[v * 3 + 1] = altitudeSol(x, z); pos[v * 3 + 2] = z; uv[v * 2] = x / ECHELLE_TEX; uv[v * 2 + 1] = z / ECHELLE_TEX;
    }
  }
  for (let j = 0; j < S; j++) idx.push(0, 1 + (j + 1) % S, 1 + j);                      // éventail central (orientation vers le haut)
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < S; j++) {
    const a = 1 + i * S + j, b = 1 + i * S + (j + 1) % S, c = 1 + (i + 1) * S + j, d = 1 + (i + 1) * S + (j + 1) % S;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  // teintes : rouille / ocre, plus sombre sur les pentes, un peu de basalte
  const nrm = g.attributes.normal, col = new Float32Array(nv * 3), c1 = new THREE.Color(0.66, 0.34, 0.2), c2 = new THREE.Color(0.86, 0.55, 0.32), c3 = new THREE.Color(0.30, 0.20, 0.16), t = new THREE.Color();
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], z = pos[v * 3 + 2], m = fbm2(x * 0.004 + 3, z * 0.004, 4, 21), basalte = lisse(0.58, 0.72, fbm2(x * 0.011, z * 0.011 + 8, 3, 6)), pente = 1 - nrm.getY(v);
    t.copy(c1).lerp(c2, m).lerp(c3, borner(basalte * 0.7 + pente * 2.2, 0, 0.85)); col.set([t.r, t.g, t.b], v * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: texSol(profil.niveau === 'basse' ? 256 : 512), vertexColors: true, roughness: 1, metalness: 0 }));
  m.position.y = -DECALAGE; m.receiveShadow = true; m.frustumCulled = false; return m;
}

function creerRochers(profil, G) {
  const n = profil.rochers; if (!n) return null;
  const geos = [geometrieRocher(1, 2), geometrieRocher(4, 2), geometrieRocher(9, 1)];
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a5a43, roughness: 1, metalness: 0 });
  const groupe = new THREE.Group(), a = alea(2024);
  const parGeo = geos.map(() => []);
  for (let i = 0; i < n; i++) {
    const r = 9 + Math.pow(a(), 1.7) * 220, th = a() * Math.PI * 2, x = Math.cos(th) * r, z = Math.sin(th) * r;
    if (Math.abs(x) < 9 && z < -3 && z > -9) continue;                                        // pas sur la terrasse
    if (Math.hypot(x - 6, z + 12) < 2.2) continue;                                            // ni sous le rover
    const s = 0.12 + Math.pow(a(), 3.2) * 2.4;
    parGeo[Math.floor(a() * geos.length)].push({ x, z, s, ry: a() * 6.28, tilt: (a() - 0.5) * 0.4 });
  }
  const d = new THREE.Object3D();
  geos.forEach((g, k) => {
    const lst = parGeo[k]; if (!lst.length) return;
    const m = new THREE.InstancedMesh(g, mat, lst.length);
    lst.forEach((r, i) => { d.position.set(r.x, altitudeSol(r.x, r.z) - DECALAGE + r.s * 0.18, r.z); d.rotation.set(r.tilt, r.ry, r.tilt * 0.6); d.scale.set(r.s * (1.0 + (i % 3) * 0.2), r.s * 0.85, r.s); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
    m.instanceMatrix.needsUpdate = true; m.castShadow = profil.ombres > 0; m.receiveShadow = true; groupe.add(m);
  });
  return groupe;
}

/* Quelques ouvrages au loin, visibles par les baies : mât d'antenne, champ solaire, rover. */
function creerOuvrages(G) {
  const g = new THREE.Group(), balises = [];
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.45, metalness: 0.7 }), sombre = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.6, metalness: 0.5 });
  const rouge = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.3, 0.2) });
  const sol = (x, z) => altitudeSol(x, z) - DECALAGE;
  // mât
  const mat = new THREE.Group(); mat.position.set(-17, sol(-17, -26), -26);
  const fut = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 11, 10), metal); fut.position.y = 5.5; fut.castShadow = true; mat.add(fut);
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(2.6 - i * 0.6, 0.07, 0.07), metal); b.position.y = 6.5 + i * 1.6; mat.add(b); }
  const lampe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), rouge); lampe.position.y = 11.2; mat.add(lampe); balises.push(lampe);
  g.add(mat);
  // champ solaire
  const panneau = new THREE.BoxGeometry(2.4, 0.06, 1.5), matSol = new THREE.MeshStandardMaterial({ map: texSolaire(256), roughness: 0.2, metalness: 0.8 });
  for (let j = 0; j < 3; j++) for (let i = 0; i < 6; i++) {
    const x = 11 + i * 2.7, z = -22 - j * 2.2, p = new THREE.Mesh(panneau, matSol); p.position.set(x, sol(x, z) + 1.0, z); p.rotation.x = -0.55; p.castShadow = true; g.add(p);
    const pied = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.0, 6), sombre); pied.position.set(x, sol(x, z) + 0.5, z + 0.1); g.add(pied);
  }
  // rover
  const rover = new THREE.Group(); rover.position.set(6, sol(6, -12), -12); rover.rotation.y = 0.7;
  const caisse = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.7, 1.3), new THREE.MeshStandardMaterial({ color: 0xe4e0d6, roughness: 0.5, metalness: 0.3 })); caisse.position.y = 0.95; caisse.castShadow = true; rover.add(caisse);
  const dessus = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.0), matSol); dessus.position.y = 1.34; rover.add(dessus);
  for (const dx of [-0.8, 0, 0.8]) for (const dz of [-0.75, 0.75]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 14), sombre); r.rotation.x = Math.PI / 2; r.position.set(dx, 0.34, dz); r.castShadow = true; rover.add(r); }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), metal); mast.position.set(0.7, 1.85, 0); rover.add(mast);
  const tete = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.16), sombre); tete.position.set(0.7, 2.4, 0); rover.add(tete);
  g.add(rover);
  return { groupe: g, balises };
}

export function creerPaysage({ profil, ciel }) {
  const groupe = new THREE.Group(); groupe.name = 'paysage';
  const terrain = creerTerrain(profil); groupe.add(terrain);
  const rochers = creerRochers(profil); if (rochers) groupe.add(rochers);
  const ouvrages = creerOuvrages(); groupe.add(ouvrages.groupe);

  // Ciel : dôme transparent la nuit (laisse voir les étoiles et la Voie lactée de la galaxie, posées dans le pivot ci-dessous)
  const matCiel = new THREE.ShaderMaterial({ vertexShader: VERT_CIEL, fragmentShader: FRAG_CIEL, uniforms: { uSoleil: { value: new THREE.Vector3(0, 1, 0) } }, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false });
  const domeCiel = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), matCiel); domeCiel.renderOrder = -8; domeCiel.frustumCulled = false; groupe.add(domeCiel);
  const pivotCiel = new THREE.Group(); groupe.add(pivotCiel);                    // étoiles : tournent avec le ciel
  // Soleil, lumière directe
  const soleil = new THREE.DirectionalLight(0xffd9b0, 3); soleil.name = 'soleil'; groupe.add(soleil, soleil.target);
  if (profil.ombres > 0) {
    soleil.castShadow = true; soleil.shadow.mapSize.set(profil.ombres, profil.ombres);
    const c = soleil.shadow.camera; c.left = -14; c.right = 14; c.top = 14; c.bottom = -14; c.near = 1; c.far = 160; soleil.shadow.bias = -0.0004; soleil.shadow.normalBias = 0.03;
  }
  const hemi = new THREE.HemisphereLight(0xc6a28a, 0x6a3b28, 0.5); groupe.add(hemi);
  // Lunes et Terre
  const phobos = new THREE.Mesh(geometriePhobos(profil.niveau === 'basse' ? 3 : 5), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })); phobos.frustumCulled = false; groupe.add(phobos);
  const deimos = new THREE.Mesh(geometriePhobos(3), phobos.material); deimos.frustumCulled = false; groupe.add(deimos);
  const terre = new THREE.Sprite(new THREE.SpriteMaterial({ map: texHalo(128), color: new THREE.Color(1.6, 2.2, 3.4), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
  terre.scale.setScalar(20); terre.renderOrder = -6; groupe.add(terre);

  const fogCouleur = new THREE.Color(), tmp = new THREE.Color();
  const etat = { heure: 17.4, elevSoleil: 10, nuit: 0, phobos: null, deimos: null, terre: null };
  const dirDe = (o, rayon = 1) => new THREE.Vector3(o.e, o.u, -o.n).multiplyScalar(rayon);   // (est, nord, haut) → repère de la pièce (x est, y haut, z sud)

  /* Place tout le ciel pour une heure solaire locale `heure` et un temps simulé `heureSim` (en heures depuis l'origine, pour les lunes). */
  function reglerHeure(heure, heureSim, scene, afficherAstres = true) {
    const s = soleilLocal(heure, BASE.lat);
    const d = new THREE.Vector3(s.e, s.u, -s.n).normalize();
    matCiel.uniforms.uSoleil.value.copy(d);
    const haut = lisse(-2, 9, s.elev), sombre = 1 - lisse(-14, -4, s.elev);
    soleil.position.copy(d).multiplyScalar(80); soleil.target.position.set(0, 0, 0);
    soleil.intensity = 3.0 * haut; soleil.color.setRGB(1, 0.78 + 0.2 * lisse(0, 28, s.elev), 0.55 + 0.35 * lisse(0, 28, s.elev));
    hemi.intensity = 0.06 + 0.36 * lisse(-8, 15, s.elev); hemi.color.setRGB(0.80, 0.62, 0.52).lerp(tmp.setRGB(0.28, 0.34, 0.6), 1 - lisse(-6, 10, s.elev)); hemi.groundColor.setRGB(0.42, 0.22, 0.14);
    // brume : couleur de l'horizon du ciel
    fogCouleur.setRGB(0.80, 0.52, 0.36).multiplyScalar(0.12 + 0.88 * lisse(-8, 14, s.elev)); fogCouleur.lerp(tmp.setRGB(0.12, 0.10, 0.18), 1 - lisse(-14, -2, s.elev));
    if (scene.fog) { scene.fog.color.copy(fogCouleur); scene.fog.density = 0.00018 + 0.00012 * (1 - lisse(-6, 20, s.elev)); }
    // étoiles : tournent autour de l'axe du pôle céleste
    const pole = new THREE.Vector3(0, Math.sin(BASE.lat * Math.PI / 180), -Math.cos(BASE.lat * Math.PI / 180)).normalize();
    pivotCiel.quaternion.setFromAxisAngle(pole, -(heure * 15 * Math.PI / 180));
    // lunes
    const p = lune(PHOBOS, heureSim, BASE.lon, BASE.lat, 0.6), dm = lune(DEIMOS, heureSim, BASE.lon, BASE.lat, 2.4);
    const poser = (m, o, def) => { const dir = dirDe(o).normalize(); const R = 700; m.position.copy(dir).multiplyScalar(R); const rayon = R * Math.tan(o.diametreAffichageDeg * Math.PI / 360); m.scale.setScalar(rayon); m.visible = afficherAstres && o.elev > -1.5; m.rotation.y = heureSim * 0.8; };
    poser(phobos, p, PHOBOS); poser(deimos, dm, DEIMOS);
    const te = objetCeleste(heure, BASE.lat, TERRE_CIEL.angleHoraire, TERRE_CIEL.declinaison);
    terre.position.copy(dirDe(te)).normalize().multiplyScalar(850); terre.visible = afficherAstres && te.elev > -1 && s.elev < 4;
    terre.material.opacity = borner(1 - lisse(-2, 6, s.elev), 0, 1);
    Object.assign(etat, { heure, elevSoleil: s.elev, nuit: facteurNuit(s.elev), phobos: p, deimos: dm, terre: te, dirSoleil: d.clone(), jour: haut, sombre });
    return etat;
  }
  function maj(t) {
    for (const b of ouvrages.balises) b.material.color.setRGB(2.6, 0.3, 0.2).multiplyScalar(Math.sin(t * 2.7) > 0.5 ? 1 : 0.1);
    for (const b of ouvrages.balises) b.material.needsUpdate = false;
  }
  /* Scène minuscule pour la carte d'environnement : ciel + sol (reflets des vitres et du sol de la pièce). */
  function sceneEnvironnement() {
    const s = new THREE.Scene(); s.background = new THREE.Color(0x000000);
    const dome = new THREE.Mesh(domeCiel.geometry, matCiel); s.add(dome);
    const sol = new THREE.Mesh(new THREE.CircleGeometry(900, 24), new THREE.MeshBasicMaterial({ color: fogCouleur.clone().multiplyScalar(0.85).lerp(new THREE.Color(0.42, 0.22, 0.15), 0.5) })); sol.rotation.x = -Math.PI / 2; sol.position.y = -2; s.add(sol);
    return s;
  }
  return { groupe, terrain, soleil, hemi, matCiel, pivotCiel, reglerHeure, maj, sceneEnvironnement, etat, dispose() { terrain.geometry.dispose(); } };
}
