// Mer animée du thème Bataille navale : vagues de Gerstner (4 trains, dirigés selon le vent), écume sur les crêtes, reflets et bandes de couleur « dessin animé », brume vers l'horizon.
// La même formule (hauteurMer, normaleMer) sert au shader (vertex) et à JavaScript : les navires flottent exactement sur la surface dessinée (tangage, roulis, pilonnement).
//   trainsDeVagues(houle, ventDir) → [{A, L, k, w, dx, dz, Q}] (pur, testé)      hauteurMer(trains, x, z, t) · normaleMer(trains, x, z, t)
//   creerMer(THREE, {q}) → { mesh, regler({houle, ventDir, couleurs…}), hauteur(x, z), normale(x, z), maj(dt, t, camera, e), detruire() }
const G = 9.81, RAD = Math.PI / 180;
export function trainsDeVagues(houle, ventDirDeg) {
  // ventDir : d'où vient le vent (degrés depuis le nord) ; les vagues avancent dans le sens où le vent souffle : direction = ventDir + 180
  const base = (ventDirDeg + 180) * RAD, L0 = 14 + 12 * houle, rel = [1, .58, .34, .2], ang = [0, 14, -22, 38], amp = [.5, .28, .13, .06], out = [];
  for (let i = 0; i < 4; i++) {
    const L = L0 * rel[i], k = 2 * Math.PI / L, A = houle * amp[i], a = base + ang[i] * RAD, w = Math.sqrt(G * k);
    out.push({ A, L, k, w, dx: Math.sin(a), dz: -Math.cos(a), Q: Math.min(.8, .85 / (k * A * 4 + 1e-6)) });
  }
  return out;
}
export function hauteurMer(T, x, z, t) { let h = 0; for (const o of T) h += o.A * Math.sin(o.k * (o.dx * x + o.dz * z) - o.w * t); return h; }
export function normaleMer(T, x, z, t) {
  let gx = 0, gz = 0; for (const o of T) { const c = o.A * o.k * Math.cos(o.k * (o.dx * x + o.dz * z) - o.w * t); gx += c * o.dx; gz += c * o.dz; }
  const l = Math.hypot(gx, 1, gz); return [-gx / l, 1 / l, -gz / l];
}
const VS = `
uniform float uT; uniform vec4 uA[4]; uniform vec4 uB[4];      // A : dx, dz, k, A ; B : w, Q, 0, 0
varying vec3 vW; varying vec3 vN; varying float vH; varying float vD; varying float vCrete;
void main(){
  vec3 p=position; vec4 wp=modelMatrix*vec4(p,1.);
  vec3 q=wp.xyz; float h=0.; float gx=0.,gz=0.; float crete=0.;
  for(int i=0;i<4;i++){
    float ph=uA[i].z*(uA[i].x*wp.x+uA[i].y*wp.z)-uB[i].x*uT; float s=sin(ph), co=cos(ph);
    q.x+=uB[i].y*uA[i].w*uA[i].x*co; q.z+=uB[i].y*uA[i].w*uA[i].y*co; h+=uA[i].w*s;
    gx+=uA[i].w*uA[i].z*co*uA[i].x; gz+=uA[i].w*uA[i].z*co*uA[i].y; crete+=uA[i].w*uA[i].z*s*uB[i].y;
  }
  q.y=h; vW=q; vH=h; vN=normalize(vec3(-gx,1.,-gz)); vCrete=crete; vD=length(q.xz-cameraPosition.xz);
  gl_Position=projectionMatrix*viewMatrix*vec4(q,1.);
}`;
const FS = `
precision highp float;
uniform vec3 uSun,uCol1,uCol2,uCol3,uHorizon,uZenith,uFog; uniform float uJour,uHoule,uBrume,uOrage,uT,uEclair,uPluie;
varying vec3 vW; varying vec3 vN; varying float vH; varying float vD; varying float vCrete;
float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); }
void main(){
  vec3 N=normalize(vN); vec3 V=normalize(cameraPosition-vW); vec3 L=normalize(uSun);
  float nl=dot(N,L)*.5+.5; float pal=floor(nl*4.)/4.;                                // 4 paliers de lumière
  float hn=clamp(vH/(uHoule*.55+.2)*.5+.5,0.,1.);
  vec3 col=mix(uCol1,uCol2,smoothstep(.15,.55,hn)); col=mix(col,uCol3,smoothstep(.55,.95,hn));
  col*= (.62+.5*pal);
  // écume : crêtes raides et motif découpé qui défile
  float motif=n2(vW.xz*.55+vec2(uT*.35,uT*.2))*.65+n2(vW.xz*1.7-vec2(uT*.2,uT*.4))*.35;
  float ecume=smoothstep(.8,.9,hn+vCrete*.45+(motif-.5)*.3)*smoothstep(.55,1.3,uHoule); ecume=step(.5,ecume);
  col=mix(col,vec3(.96,.98,1.)*(.55+.45*uJour),ecume);
  // reflet du Soleil : taches nettes
  vec3 R=reflect(-L,N); float glint=pow(max(dot(R,V),0.),90.); col+=vec3(1.,.95,.8)*step(.55,glint)*uJour*(1.-uOrage*.8)*.85;
  // reflet du ciel en rasant (fresnel) par paliers
  float fr=pow(1.-max(dot(N,V),0.),3.); col=mix(col,uHorizon*(.6+.4*uJour),floor(fr*4.)/4.*.65);
  // nuit et orage : plus sombre et plus verdâtre
  col*= .22+.78*uJour; col=mix(col,col*vec3(.62,.78,.74),uOrage*.7); col+=vec3(.55,.6,.7)*uEclair*.5;
  // pluie : petits anneaux
  col+=vec3(.9)*step(.97,n2(vW.xz*3.2+floor(uT*6.)))*uPluie*.35;
  // brume vers l'horizon (et vers la couleur du ciel)
  float f=1.-exp(-vD*uBrume); col=mix(col,uFog,clamp(f,0.,1.));
  gl_FragColor=vec4(col,1.);
  #include <colorspace_fragment>
}`;
export function creerMer(THREE, { q } = {}) {
  // maillage polaire centré sur la caméra : très fin près d'elle, de plus en plus large vers l'horizon
  const seg = Math.max(96, Math.round(q.mer * 1.7)), pas0 = q.mer >= 128 ? 1.4 : q.mer >= 96 ? 2.0 : 3.0, croiss = q.mer >= 128 ? 1.032 : q.mer >= 96 ? 1.045 : 1.065, rMax = 9000;
  const rayons = [0]; let r = 0; while (r < rMax) { r += Math.max(pas0, r * (croiss - 1)); rayons.push(Math.min(r, rMax)); }
  const nv = rayons.length * (seg + 1), pos = new Float32Array(nv * 3), idx = [];
  rayons.forEach((rr, i) => { for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2; pos.set([Math.cos(a) * rr, 0, Math.sin(a) * rr], (i * (seg + 1) + j) * 3); } });
  for (let i = 0; i < rayons.length - 1; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
  const vec = (a) => new THREE.Vector3(...a);
  const U = { uT: { value: 0 }, uA: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) }, uB: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uCol1: { value: new THREE.Color(.03, .2, .42) }, uCol2: { value: new THREE.Color(.05, .38, .6) }, uCol3: { value: new THREE.Color(.16, .6, .78) }, uHorizon: { value: new THREE.Color(.62, .84, 1) }, uZenith: { value: new THREE.Color(.2, .5, .9) }, uFog: { value: new THREE.Color(.62, .84, 1) }, uJour: { value: 1 }, uHoule: { value: 1.2 }, uBrume: { value: .00028 }, uOrage: { value: 0 }, uEclair: { value: 0 }, uPluie: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: FS });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = -1;
  let T = trainsDeVagues(1.2, 250), tAff = 0;
  function regler({ houle, ventDir }) { T = trainsDeVagues(houle, ventDir); U.uHoule.value = houle; T.forEach((o, i) => { U.uA.value[i].set(o.dx, o.dz, o.k, o.A); U.uB.value[i].set(o.w, o.Q, 0, 0); }); }
  regler({ houle: 1.2, ventDir: 250 });
  function maj(dt, t, camera, e) {
    tAff = t; U.uT.value = t; mesh.position.set(Math.round(camera.position.x / 4) * 4, 0, Math.round(camera.position.z / 4) * 4);
    U.uSun.value.copy(e.sunDir.y > -.1 ? e.sunDir : e.moonDir); U.uJour.value = e.jour; U.uOrage.value = e.orage; U.uEclair.value = e.eclair || 0; U.uPluie.value = e.pluie || 0;
    U.uHorizon.value.setRGB(...e.couleurs.horizon); U.uZenith.value.setRGB(...e.couleurs.zenith); U.uFog.value.setRGB(...e.couleurs.horizon);
    U.uBrume.value = .00022 + e.brouillard * .0075 + e.orage * .0004 + e.pluie * .0004;
    // couleurs de l'eau : plus sombres et grises par mauvais temps, plus turquoise par beau temps
    const g = e.orage * .7 + e.nuages * .2; U.uCol1.value.setRGB(.03 + g * .06, .2 - g * .08, .42 - g * .16); U.uCol2.value.setRGB(.05 + g * .1, .38 - g * .16, .6 - g * .26); U.uCol3.value.setRGB(.16 + g * .12, .6 - g * .26, .78 - g * .36);
  }
  function detruire() { geo.dispose(); mat.dispose(); }
  return { mesh, regler, hauteur: (x, z, t) => hauteurMer(T, x, z, t == null ? tAff : t), normale: (x, z, t) => normaleMer(T, x, z, t == null ? tAff : t), maj, detruire, trains: () => T, uniforms: U };
}
