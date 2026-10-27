import * as THREE from 'three';
import * as M from './mars-calcul.js';
import { creerBase } from './base-exterieur.js';
import { geometriePhobos } from './procedural.js';

/* ═════════════ MARS EN ORBITE : la planète, la base et les lunes ═════════════
   La caméra tourne autour de Mars (longitude/latitude de la caméra + distance au centre, jamais d'inclinaison libre : la base reste toujours à l'endroit).
   La sphère est la même que celle de la galaxie (même repère, même texture) : l'entrée et la sortie par zoom se raccordent sans saut.
   Soleil : sa direction vient de l'heure solaire locale de la base (réglable), la tombée de la nuit allume les lumières. */
const VERT_ATMO = /* glsl */`
  varying vec3 vN; varying vec3 vMonde;
  void main(){ vN = normalize(normalMatrix * normal); vMonde = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG_ATMO = /* glsl */`
  uniform vec3 uSoleil, uCentre; uniform float uForce;
  varying vec3 vN; varying vec3 vMonde;
  void main(){
    float rim = pow(max(0.0, 0.62 - dot(normalize(vN), vec3(0.0, 0.0, 1.0))), 3.0) * 3.4;   // plus fort au bord (face arrière de la coque)
    vec3 n = normalize(vMonde - uCentre);
    float d = dot(n, normalize(uSoleil));
    float jour = smoothstep(-0.25, 0.45, d);
    float crep = smoothstep(-0.35, 0.0, d) * (1.0 - smoothstep(0.0, 0.35, d));
    vec3 col = mix(vec3(1.0, 0.58, 0.38), vec3(0.45, 0.62, 1.0), clamp(crep * 1.5, 0.0, 1.0));    // poussière ocre le jour, halo bleu au crépuscule
    float a = rim * (jour * 0.9 + crep * 1.1 + 0.03) * uForce;
    gl_FragColor = vec4(col * a, a);
  }`;

export function creerOrbite({ profil, textureMars, ciel, aniso = 8 }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 5000);
  const planete = new THREE.Group(); scene.add(planete);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(M.R, profil.segSphere, Math.round(profil.segSphere / 2)), new THREE.MeshStandardMaterial({ map: textureMars, bumpMap: textureMars, bumpScale: 2.2, roughness: 1, metalness: 0 }));
  sphere.name = 'mars'; planete.add(sphere);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(M.R * 1.05, 64, 32), new THREE.ShaderMaterial({
    vertexShader: VERT_ATMO, fragmentShader: FRAG_ATMO, transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uSoleil: { value: new THREE.Vector3(1, 0, 0) }, uCentre: { value: new THREE.Vector3() }, uForce: { value: 1.25 } }
  }));
  planete.add(atmo);
  const soleil = new THREE.DirectionalLight(0xfff0dd, 3.4); scene.add(soleil, soleil.target);
  const ambiance = new THREE.HemisphereLight(0x6b7fb5, 0x2a1810, 0.16); scene.add(ambiance);

  // La base, posée au bon endroit de la surface
  const base = creerBase({ profil });
  const loc = M.baseLocale(M.BASE.lon, M.BASE.lat), dirBase = M.dirDeLonLat(M.BASE.lon, M.BASE.lat);
  const sud = [-loc.nord[0], -loc.nord[1], -loc.nord[2]];
  base.groupe.position.set(dirBase[0] * M.R, dirBase[1] * M.R, dirBase[2] * M.R);
  base.groupe.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...loc.est), new THREE.Vector3(...loc.haut), new THREE.Vector3(...sud)));
  planete.add(base.groupe);

  // Lunes (échelle exagérée : Phobos ≈ 1,5 unité au lieu de 0,3)
  const matLune = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const phobos = new THREE.Mesh(geometriePhobos(profil.niveau === 'basse' ? 3 : 4), matLune), deimos = new THREE.Mesh(geometriePhobos(3), matLune);
  phobos.scale.setScalar(1.7); deimos.scale.setScalar(1.0); scene.add(phobos, deimos);
  const orbiteLune = (def, heureSim, phase0) => { const theta = phase0 + heureSim / def.periodeH * Math.PI * 2, lon = theta - heureSim / 24.623 * Math.PI * 2; return M.dirDeLonLat(M.deg(lon), 0); };

  // Caméra
  const vue = { lon: M.BASE.lon - 38, lat: M.BASE.lat + 12, dist: M.SEUILS.ORBITE_DEPART };
  const direction = () => M.dirDeLonLat(vue.lon, vue.lat);
  const raycaster = new THREE.Raycaster();
  let heureSim = 0;

  function appliquerCamera() {
    const d = direction();
    camera.position.set(d[0] * vue.dist, d[1] * vue.dist, d[2] * vue.dist);
    camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0);
  }
  function lumiere(heure) {
    const s = M.soleilLocal(heure, M.BASE.lat), v = M.localVersSphere(loc, s.e, s.n, s.u), u = M.unitaire(v);
    soleil.position.set(u[0] * 600, u[1] * 600, u[2] * 600); soleil.target.position.set(0, 0, 0);
    atmo.material.uniforms.uSoleil.value.set(u[0], u[1], u[2]);
    return { s, nuit: M.nuit(s.elev), dirSoleil: u };
  }
  /* Une image. heure = heure solaire locale de la base ; t = temps (s) ; retourne l'état utile à l'interface. */
  function maj(dt, t, heure, sim) {
    heureSim = sim;
    const l = lumiere(heure);
    ambiance.intensity = 0.16 + 0.22 * l.nuit;   // la nuit, la surface reste devinable
    base.maj(t, l.nuit);
    const p = orbiteLune(M.PHOBOS, sim, 0.6), q = orbiteLune(M.DEIMOS, sim, 2.4);
    phobos.position.set(p[0] * M.R * 2.77, p[1] * M.R * 2.77, p[2] * M.R * 2.77); phobos.rotation.y = sim * 0.8;
    deimos.position.set(q[0] * M.R * 6.9, q[1] * M.R * 6.9, q[2] * M.R * 6.9);
    appliquerCamera();
    return l;
  }
  function redimensionner(l, h) { const a = l / Math.max(1, h); camera.aspect = a; camera.fov = a < 1 ? Math.min(80, 42 / Math.pow(a, 0.5)) : 42; camera.updateProjectionMatrix(); }
  /* Étiquettes : position écran de chaque zone de la base (null si cachée derrière la planète). */
  function projeterAncres(largeur, hauteur) {
    const out = {}; camera.updateMatrixWorld();
    const dB = new THREE.Vector3(...dirBase), vers = camera.position.clone().normalize();
    const face = vers.dot(dB) > 0.2;
    for (const [id, a] of Object.entries(base.ancres)) {
      const w = base.groupe.localToWorld(a.clone()), p = w.clone().project(camera);
      out[id] = { x: (p.x * 0.5 + 0.5) * largeur, y: (-p.y * 0.5 + 0.5) * hauteur, visible: face && p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 };
    }
    return out;
  }
  function viserZone(ndc) {
    raycaster.setFromCamera(new THREE.Vector2(ndc[0], ndc[1]), camera);
    const h = raycaster.intersectObjects(base.pickables, false)[0]; return h ? h.object.userData.zone : null;
  }
  const angleBase = () => M.angleAvecBase(direction(), dirBase);
  scene.add(ciel.groupe);   // le ciel de la galaxie (étoiles, Voie lactée)
  return { scene, camera, planete, sphere, base, vue, direction, dirBase, angleBase, maj, redimensionner, projeterAncres, viserZone, appliquerCamera, phobos, deimos,
    dispose() { sphere.geometry.dispose(); atmo.geometry.dispose(); } };
}
