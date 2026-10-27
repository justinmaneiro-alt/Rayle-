import * as THREE from 'three';
import { R, vers, unit, base } from './geo.js';

/* ═════════════ NUAGES ET PLUIE ANIMÉS D'APRÈS LA MÉTÉO RÉELLE D'UN LIEU ═════════════
   Quand on s'approche d'un lieu dont on connaît la météo (Open-Meteo par le Worker : couverture nuageuse, pluie, vent), deux effets apparaissent :
   - une couche de nuages (bruit fractal) autour du lieu, dont la couverture est la couverture nuageuse réelle, qui dérive dans le sens réel du vent
     (accéléré × 60 : à vitesse réelle on ne verrait rien bouger) et qui s'assombrit quand il pleut ;
   - de la pluie (traînées) autour de la caméra quand on est près du sol et qu'il pleut réellement (intensité d'après les mm de la dernière heure).
   Sans donnée météo : rien n'est affiché (jamais de pluie ou de nuages inventés pour un lieu). La texture mondiale de nuages (globe.js) garde son rôle en vue spatiale. */
const ACCELERATION = 60;
const VERT_NUAGES = /* glsl */`
  varying vec3 vN; varying vec3 vMonde;
  void main(){ vN = normalize(position); vec4 m = modelMatrix * vec4(position, 1.0); vMonde = m.xyz; gl_Position = projectionMatrix * viewMatrix * m; }`;
const FRAG_NUAGES = /* glsl */`
  uniform vec3 uSoleil, uCentre, uEst, uNord; uniform vec2 uDerive; uniform float uRayonAng, uCouverture, uOpacite, uPluie, uRayon;
  varying vec3 vN; varying vec3 vMonde;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float bruit(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * bruit(p); p = p * 2.03 + 17.0; a *= 0.5; } return s; }
  void main(){
    float ang = acos(clamp(dot(normalize(vN), uCentre), -1.0, 1.0));
    float masque = 1.0 - smoothstep(uRayonAng * 0.5, uRayonAng, ang);
    if (masque < 0.003 || uOpacite < 0.003) discard;
    vec2 p = vec2(dot(vN, uEst), dot(vN, uNord)) * uRayon;            // km à plat autour du lieu
    p -= uDerive;                                                      // dérive : les nuages avancent dans le sens du vent
    float n = fbm(p / 22.0) * 0.72 + fbm(p / 6.0 + 3.1) * 0.28;
    float seuil = 1.0 - uCouverture;
    float dens = smoothstep(seuil - 0.05, seuil + 0.32, n) * (0.30 + 0.60 * uCouverture);
    vec3 L = normalize(uSoleil); float d = dot(normalize(vN), L);
    float lum = (smoothstep(-0.12, 0.25, d) * (max(d, 0.0) * 0.95 + 0.25) + 0.03);
    vec3 couleur = mix(vec3(1.0, 0.99, 0.97), vec3(0.50, 0.53, 0.60), clamp(uPluie, 0.0, 1.0) * 0.8 + smoothstep(0.7, 1.0, dens) * 0.15) * lum;
    gl_FragColor = vec4(couleur, dens * masque * uOpacite);
  }`;
const VERT_PLUIE = /* glsl */`
  attribute vec3 aGraine; attribute float aFin;
  uniform vec3 uHaut, uEst, uNord; uniform float uTemps, uBoite, uLong, uVitesse;
  varying float vA;
  void main(){
    float y = fract(aGraine.y - uTemps * uVitesse);
    vec3 p = uEst * ((aGraine.x - 0.5) * 2.0 * uBoite) + uNord * ((aGraine.z - 0.5) * 2.0 * uBoite) + uHaut * ((y - 0.5) * 2.0 * uBoite);
    p += uHaut * (aFin * uLong);                                       // la traînée : le bout haut est plus haut (la pluie tombe)
    float bord = 1.0 - max(abs(aGraine.x - 0.5), abs(aGraine.z - 0.5)) * 2.0;
    vA = smoothstep(0.0, 0.25, bord) * smoothstep(0.0, 0.12, y) * smoothstep(1.0, 0.85, y) * (0.35 + 0.65 * (1.0 - aFin));
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
const FRAG_PLUIE = /* glsl */`
  uniform float uOpacite; varying float vA;
  void main(){ gl_FragColor = vec4(0.72, 0.82, 0.98, vA * uOpacite); }`;

export function creerMeteoAnim({ scene, partages }) {
  const unifN = {
    uSoleil: partages.uSoleil, uCentre: { value: new THREE.Vector3(1, 0, 0) }, uEst: { value: new THREE.Vector3(0, 0, -1) }, uNord: { value: new THREE.Vector3(0, 1, 0) },
    uDerive: { value: new THREE.Vector2() }, uRayonAng: { value: 0.045 }, uCouverture: { value: 0 }, uOpacite: { value: 0 }, uPluie: { value: 0 }, uRayon: { value: R + 3 }
  };
  /* Calotte fine autour du lieu (et non une sphère entière : une sphère de 6 374 km en 96 facettes s'affaisse de 3 km au milieu de chaque facette,
     et le relief traversait la couche de nuages). 128 × 128 points sur ±0,06 rad (≈ 760 km), les sommets sont des directions unitaires. */
  const N_CALOTTE = 128, DEMI = 0.06;
  function calotte(c, est, nord) {
    const pos = new Float32Array((N_CALOTTE + 1) ** 2 * 3), idx = new Uint32Array(N_CALOTTE * N_CALOTTE * 6);
    let k = 0;
    for (let j = 0; j <= N_CALOTTE; j++) for (let i = 0; i <= N_CALOTTE; i++) {
      const a = (i / N_CALOTTE * 2 - 1) * DEMI, b = (j / N_CALOTTE * 2 - 1) * DEMI;
      const v = [c[0] + est[0] * a + nord[0] * b, c[1] + est[1] * a + nord[1] * b, c[2] + est[2] * a + nord[2] * b], l = Math.hypot(...v);
      pos.set([v[0] / l, v[1] / l, v[2] / l], k); k += 3;
    }
    let q = 0;
    for (let j = 0; j < N_CALOTTE; j++) for (let i = 0; i < N_CALOTTE; i++) { const a = j * (N_CALOTTE + 1) + i, b = a + 1, c2 = a + N_CALOTTE + 1, d = c2 + 1; idx[q++] = a; idx[q++] = c2; idx[q++] = b; idx[q++] = b; idx[q++] = c2; idx[q++] = d; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1)); return g;
  }
  const nuages = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
    vertexShader: VERT_NUAGES, fragmentShader: FRAG_NUAGES, uniforms: unifN, transparent: true, depthWrite: false, side: THREE.DoubleSide
  }));
  nuages.frustumCulled = false; nuages.matrixAutoUpdate = false; nuages.visible = false; nuages.renderOrder = 3; scene.add(nuages);

  const N = 3200, graine = new Float32Array(N * 2 * 3), fin = new Float32Array(N * 2), pos = new Float32Array(N * 2 * 3);
  for (let i = 0; i < N; i++) { const a = Math.random(), b = Math.random(), c = Math.random(); for (let k = 0; k < 2; k++) { graine.set([a, b, c], (i * 2 + k) * 3); fin[i * 2 + k] = k; } }
  const geoP = new THREE.BufferGeometry();
  geoP.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geoP.setAttribute('aGraine', new THREE.BufferAttribute(graine, 3)); geoP.setAttribute('aFin', new THREE.BufferAttribute(fin, 1));
  const unifP = { uHaut: { value: new THREE.Vector3(0, 1, 0) }, uEst: { value: new THREE.Vector3(1, 0, 0) }, uNord: { value: new THREE.Vector3(0, 0, 1) }, uTemps: { value: 0 }, uBoite: { value: 0.35 }, uLong: { value: 0.016 }, uVitesse: { value: 0.9 }, uOpacite: { value: 0 } };
  const pluie = new THREE.LineSegments(geoP, new THREE.ShaderMaterial({ vertexShader: VERT_PLUIE, fragmentShader: FRAG_PLUIE, uniforms: unifP, transparent: true, depthWrite: false }));
  pluie.frustumCulled = false; pluie.visible = false; pluie.renderOrder = 6; scene.add(pluie);

  let meteo = null, temps = 0, derive = [0, 0];
  const lisse = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return {
    nuages, pluie,
    /* m : { lon, lat, couverture (0-100 %), pluie (mm), vent (km/h), direction (° d'où vient le vent) } ou null */
    definir(m) {
      if (!m) { meteo = null; return; }
      const c = unit(vers(m.lon, m.lat)), b = base(m.lon, m.lat);
      const moi = !meteo || meteo.lon !== m.lon || meteo.lat !== m.lat;
      meteo = m; if (moi) derive = [0, 0];
      unifN.uCentre.value.set(...c); unifN.uEst.value.set(...b.est); unifN.uNord.value.set(...b.nord);
      if (moi) { nuages.geometry.dispose(); nuages.geometry = calotte(c, b.est, b.nord); }
      unifN.uCouverture.value = Math.max(0, Math.min(1, (m.couverture || 0) / 100));
      unifN.uPluie.value = m.pluie > 0 ? Math.min(1, Math.log10(1 + m.pluie * 6) / Math.log10(25)) : 0;
    },
    actuelle: () => meteo,
    /* altitude : km au-dessus du sol (caméra) ; cam : position de la caméra (ECEF, km) ; actif : réglage de l'utilisateur */
    maj(dt, { cam, altitude, actif, sol }) {
      temps += dt;
      const visible = actif && !!meteo;
      if (!visible) { nuages.visible = false; pluie.visible = false; return; }
      // nuages locaux : visibles entre ~5 km et ~900 km d'altitude, au-dessus d'un lieu connu
      const o = lisse(5, 14, altitude) * (1 - lisse(300, 1100, altitude));
      unifN.uOpacite.value = o * 0.92; nuages.visible = o > 0.01;
      if (nuages.visible) {
        const vit = (meteo.vent || 0) / 3600 * ACCELERATION, vers_ = ((meteo.direction || 0) + 180) * Math.PI / 180;   // vers où va le vent
        derive[0] += Math.sin(vers_) * vit * dt; derive[1] += Math.cos(vers_) * vit * dt;
        unifN.uDerive.value.set(derive[0], derive[1]);
        nuages.position.set(-cam[0], -cam[1], -cam[2]); nuages.scale.setScalar(R + 3 + Math.max(0, sol || 0)); nuages.updateMatrix();
      }
      // pluie : seulement s'il pleut vraiment ici, et près du sol
      const intensite = unifN.uPluie.value, p = intensite > 0 ? (1 - lisse(1.2, 3.5, altitude)) : 0;
      pluie.visible = p > 0.01;
      if (pluie.visible) {
        const u = unit(cam), b = base(Math.atan2(-u[2], u[0]) * 180 / Math.PI, Math.asin(u[1]) * 180 / Math.PI);
        unifP.uHaut.value.set(...b.haut); unifP.uEst.value.set(...b.est); unifP.uNord.value.set(...b.nord);
        unifP.uTemps.value = temps; unifP.uOpacite.value = p * (0.25 + 0.55 * intensite);
        geoP.setDrawRange(0, Math.floor(N * (0.25 + 0.75 * intensite)) * 2);
      }
    },
    arreter() { nuages.geometry.dispose(); nuages.material.dispose(); geoP.dispose(); pluie.material.dispose(); scene.remove(nuages); scene.remove(pluie); }
  };
}
