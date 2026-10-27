import * as THREE from 'three';

/* ═════════════ DÉCOR : Voie lactée, nébuleuses, étoiles (la ceinture d'astéroïdes est dans asteroides.js) ═════════════ */
const BRUIT_CIEL = /* glsl */`
  float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float n3(vec3 p){
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p *= 2.02; a *= 0.5; } return s; }
`;
/* La texture de la Voie lactée est très sombre (photo de ciel noir) : on la relève avec un gain et une courbe, puis on la teinte
   légèrement vers la palette de Raylé. */
const VERT_DOME = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG_DOME = /* glsl */`
  uniform sampler2D uCarte; uniform float uGain;
  varying vec2 vUv;
  void main(){
    vec3 c = texture2D(uCarte, vUv).rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c *= 1.0 - 0.92 * smoothstep(0.16, 0.7, l);   // retire les étoiles isolées de la photo (blocs carrés) : les vraies étoiles sont les points ronds ci-dessous
    c = pow(c * uGain, vec3(0.78));
    c = mix(vec3(dot(c, vec3(0.333))), c, 1.35) * vec3(1.0, 0.95, 1.12);   // un peu de couleur
    gl_FragColor = vec4(c, 1.0);
  }`;
/* Nébuleuse : nuage de bruit déformé (domain warping), deux teintes, ajouté à la lumière du fond. */
const VERT_NEB = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG_NEB = /* glsl */`
  uniform vec3 uC1, uC2; uniform float uGraine, uForce, uTemps;
  varying vec2 vUv;
  ${BRUIT_CIEL}
  void main(){
    vec2 p = (vUv - 0.5) * 2.0;
    float masque = smoothstep(1.0, 0.25, length(p));
    vec3 q = vec3(p * 2.1 + uGraine, uGraine * 0.7 + uTemps * 0.004);
    vec3 w = vec3(fbm(q * 1.2), fbm(q * 1.2 + 5.2), 0.0);
    float f = fbm(q + 1.9 * w);
    float d = smoothstep(0.36, 0.92, f) * masque;
    float teinte = fbm(q * 0.6 + 9.0);
    vec3 col = mix(uC1, uC2, teinte) * d * uForce;
    col += uC2 * pow(d, 3.0) * uForce * 0.9;                     // filaments plus lumineux
    gl_FragColor = vec4(col, 1.0);
  }`;
const VERT_ETOILES = /* glsl */`
  attribute float aTaille, aGraine; attribute vec3 color;
  uniform float uTemps, uPx;
  varying vec3 vCol; varying float vScint;
  void main(){
    vCol = color;
    vScint = 0.72 + 0.28 * sin(uTemps * (1.2 + fract(aGraine * 7.3) * 2.4) + aGraine * 13.0);   // scintillement
    gl_PointSize = aTaille * uPx;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const FRAG_ETOILES = /* glsl */`
  varying vec3 vCol; varying float vScint;
  void main(){
    float k = length(gl_PointCoord - 0.5) * 2.0;
    if (k > 1.0) discard;
    float a = pow(1.0 - k, 1.4) * vScint;
    gl_FragColor = vec4(vCol * a * 1.3, a);
  }`;
const NEBULEUSES = [   // direction, taille, teintes (palette Raylé : magenta, violet, cyan), force
  { dir: [-0.89, -0.32, -0.33], taille: 1000, c1: [1.0, 0.12, 0.5], c2: [0.45, 0.2, 1.0], force: 0.24, graine: 3.1 },
  { dir: [-0.5, 0.25, -0.83], taille: 900, c1: [0.1, 0.55, 1.0], c2: [0.2, 0.9, 0.85], force: 0.20, graine: 7.7 },
  { dir: [-0.62, -0.5, 0.6], taille: 850, c1: [0.9, 0.35, 0.2], c2: [0.7, 0.15, 0.5], force: 0.18, graine: 1.3 },
  { dir: [0.4, 0.35, -0.85], taille: 950, c1: [0.5, 0.2, 1.0], c2: [1.0, 0.2, 0.7], force: 0.20, graine: 5.5 },
  { dir: [0.8, -0.2, 0.55], taille: 800, c1: [0.15, 0.7, 1.0], c2: [0.4, 0.3, 1.0], force: 0.17, graine: 9.2 }
];

const NB_ETOILES_MAX = 14000;

export function creerCiel({ textureCiel, anisotropie }) {
  const groupe = new THREE.Group(); groupe.name = 'ciel';

  // Voie lactée : grande sphère vue de l'intérieur, légèrement inclinée
  const t = textureCiel; t.anisotropy = anisotropie();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32),
    new THREE.ShaderMaterial({ vertexShader: VERT_DOME, fragmentShader: FRAG_DOME, uniforms: { uCarte: { value: t }, uGain: { value: 5 } }, side: THREE.BackSide, depthWrite: false }));
  dome.rotation.set(1.2, 3.5, 0.2); dome.renderOrder = -10;
  groupe.add(dome);

  // Nébuleuses : grands plans lointains tournés vers le centre du système
  const nebuleuses = new THREE.Group(); nebuleuses.name = 'nebuleuses';
  const unifNeb = [];
  for (const n of NEBULEUSES) {
    const u = { uC1: { value: new THREE.Color(...n.c1) }, uC2: { value: new THREE.Color(...n.c2) }, uGraine: { value: n.graine }, uForce: { value: n.force }, uTemps: { value: 0 } };
    unifNeb.push(u);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader: VERT_NEB, fragmentShader: FRAG_NEB, uniforms: u, transparent: false, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    // transparent: false (et non true) : ces plans se dessinent AVANT les corps opaques (renderOrder -9), qui les recouvrent ensuite. Avec transparent: true ils
    // passaient dans la liste « transparents », dessinée après tout le reste sans test de profondeur : la nébuleuse s'ajoutait par-dessus les planètes (face nuit « transparente »).
    const d = new THREE.Vector3(...n.dir).normalize();
    m.position.copy(d).multiplyScalar(800); m.scale.setScalar(n.taille); m.lookAt(0, 0, 0); m.renderOrder = -9; m.frustumCulled = false;
    nebuleuses.add(m);
  }
  groupe.add(nebuleuses);
  let temps = 0;

  // Étoiles : points de taille et de teinte variées
  const pos = new Float32Array(NB_ETOILES_MAX * 3), col = new Float32Array(NB_ETOILES_MAX * 3), taille = new Float32Array(NB_ETOILES_MAX), graine = new Float32Array(NB_ETOILES_MAX);
  const teinte = new THREE.Color();
  for (let i = 0; i < NB_ETOILES_MAX; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), d = 500 + Math.random() * 300;
    pos.set([Math.cos(a) * r * d, u * d, Math.sin(a) * r * d], i * 3);
    teinte.setHSL(Math.random() < 0.7 ? 0.6 : 0.08, 0.35 + Math.random() * 0.4, 0.75 + Math.random() * 0.25);
    teinte.multiplyScalar(0.3 + Math.pow(Math.random(), 3) * 0.55);
    col.set([teinte.r, teinte.g, teinte.b], i * 3);
    taille[i] = 1.5 + Math.pow(Math.random(), 5) * 4.5; graine[i] = Math.random() * 100;
  }
  const geoE = new THREE.BufferGeometry();
  geoE.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geoE.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geoE.setAttribute('aTaille', new THREE.BufferAttribute(taille, 1)); geoE.setAttribute('aGraine', new THREE.BufferAttribute(graine, 1));
  let unifEtoiles, matEtoiles;
  const etoiles = new THREE.Points(geoE, (unifEtoiles = { uTemps: { value: 0 }, uPx: { value: 1 } }, matEtoiles = new THREE.ShaderMaterial({ vertexShader: VERT_ETOILES, fragmentShader: FRAG_ETOILES, uniforms: unifEtoiles, transparent: false, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }), matEtoiles));
  // Comme les nébuleuses : transparent: false + depthTest: false = dessinées AVANT les corps opaques (renderOrder -9), qui les recouvrent. Avec transparent: true les étoiles passaient
  // dans la liste « transparents », dessinée après les astres avec test de profondeur : celles de la coquille (rayon 500-800 × k, plus proche que le globe de la Terre en orbite)
  // passaient devant la face nuit du globe, qui paraissait transparente.
  etoiles.frustumCulled = false; etoiles.renderOrder = -9;
  groupe.add(etoiles);

  return {
    groupe,
    nombreEtoiles(n) { geoE.setDrawRange(0, Math.min(n, NB_ETOILES_MAX)); },
    /* Nébuleuses : coûteuses en fragments, coupées en qualité basse et en mode jeu. */
    riche(oui) { nebuleuses.visible = !!oui; },
    /* Taille des points en pixels écran réels. */
    echelle(px) { unifEtoiles.uPx.value = px; },
    maj(dt) { dome.rotation.y += dt * 0.0015; temps += dt; unifEtoiles.uTemps.value = temps; for (const u of unifNeb) u.uTemps.value = temps; }
  };
}
