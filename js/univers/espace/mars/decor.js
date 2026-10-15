// Décor de la surface de Mars (unités : mètres) : terrain, ciel martien, Soleil, Phobos et Deimos, rochers, poussière.
// Terrain procédural (aucun relevé d'altitude gratuit sans clé n'a la finesse voulue à l'échelle du rover) : plaine de cratère avec dunes, cailloux, bords de cratère lointains.
// L'altitude vient de hauteur(x, z) : fonction pure partagée par le terrain, les rochers et les roues du rover (testée).
// creerDecor(THREE, {q, texRoche, geoRocher}) → { groupe, ciel, soleil, lunes, hauteur, majCiel(t, camera), poussiere:{emettre,maj}, qualite(q), detruire() }
import { geometrieRocher, textureRoche } from '../asteroides.js?v=2026.10.15.2';

// bruit de valeur lissé, déterministe
function h2(x, y) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function n2(x, y) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, y, o = 5) { let a = .5, f = 1, r = 0; for (let i = 0; i < o; i++) { r += a * n2(x * f, y * f); a *= .5; f *= 2.07; } return r; }
const CRATERES = [[900, -400, 260, 22], [-1400, 700, 420, 40], [2600, 1900, 700, 70], [-2600, -2100, 900, 90]];   // x, z, rayon, profondeur (m)
// hauteur du sol (m) : relief doux, dunes, cratères ; plate et lisse dans les 90 m autour du point d'atterrissage (0, 0) où le rover se pose
export function hauteur(x, z) {
  let h = 55 * (fbm(x / 3200 + 11, z / 3200 + 3, 5) - .45) + 9 * (fbm(x / 520, z / 520, 4) - .5) + 1.1 * (fbm(x / 55, z / 55, 3) - .5) + .12 * (fbm(x / 7, z / 7, 2) - .5);
  for (const [cx, cz, r, p] of CRATERES) { const d = Math.hypot(x - cx, z - cz) / r; if (d < 1.6) h += d < 1 ? -p * (1 - d * d) * (1 - d * d * .35) : p * .22 * Math.exp(-Math.pow((d - 1.05) * 4.2, 2)); }
  const dc = Math.hypot(x, z), k = Math.max(0, Math.min(1, (dc - 90) / 160)), l = k * k * (3 - 2 * k);
  return h * l;
}
// couleur du sol selon l'altitude et la pente : poussière rouille claire, dépôts sombres de basalte
function couleurSol(x, z, h, pente) {
  const grain = fbm(x / 9, z / 9, 3), poussiere = fbm(x / 400 + 5, z / 400, 3), sombre = Math.min(1, Math.max(0, pente * 3.5 + (fbm(x / 140 + 9, z / 140, 3) - .55) * 1.4));
  const base = [.66 + .12 * poussiere, .38 + .1 * poussiere, .23 + .06 * poussiere], noir = [.26, .17, .13], k = sombre * .75, g = .86 + grain * .28;
  return [(base[0] * (1 - k) + noir[0] * k) * g, (base[1] * (1 - k) + noir[1] * k) * g, (base[2] * (1 - k) + noir[2] * k) * g];
}
const VS_CIEL = 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position.z=gl_Position.w*.9999; }';
const FS_CIEL = `
precision highp float; varying vec3 vD; uniform vec3 uSun; uniform float uPoussiere;
void main(){
  vec3 d=normalize(vD); float h=clamp(d.y,-.05,1.);
  vec3 horizon=vec3(.88,.66,.50), milieu=vec3(.70,.49,.37), zenith=vec3(.30,.22,.22);
  vec3 col=mix(horizon,milieu,smoothstep(0.,.22,h)); col=mix(col,zenith,smoothstep(.15,.95,h));
  float cs=max(dot(d,normalize(uSun)),0.);
  vec3 aur=vec3(.55,.68,.85)*pow(cs,14.)*.9;                                  // auréole bleue autour du Soleil (diffusion de la poussière)
  col+=aur*(.55+uPoussiere*.3)+vec3(1.,.82,.62)*pow(cs,4.)*.18+vec3(1.)*pow(cs,900.)*3.;
  col=mix(col,vec3(.85,.66,.52),smoothstep(.06,-.05,d.y)*.8);                // brume de poussière à l'horizon
  gl_FragColor=vec4(col,1.);
  #include <colorspace_fragment>
}`;
export function creerDecor(THREE, { q, graine = 1 } = {}) {
  const groupe = new THREE.Group(); groupe.name = 'surface-mars';
  const vec = (x, y, z) => new THREE.Vector3(x, y, z), libres = [];
  /* ───── terrain : grand plan grossier + tapis fin autour du point d'atterrissage ───── */
  const grain = (() => { const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d'), im = g.createImageData(N, N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = 150 + 70 * (fbm(x / 6, y / 6, 3) - .5) * 2 + 35 * (h2(x, y) - .5); const i = (y * N + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = Math.max(0, Math.min(255, v)); im.data[i + 3] = 255; } g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; libres.push(t); return t; })();
  function creerPlan(taille, seg, rep) {
    const g = new THREE.PlaneGeometry(taille, taille, seg, seg); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, c = new Float32Array(p.count * 3), uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = hauteur(x, z); p.setY(i, y); }
    g.computeVertexNormals(); const nrm = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), pente = 1 - nrm.getY(i), col = couleurSol(x, z, p.getY(i), pente); c.set(col, i * 3); uv.setXY(i, x / taille * rep, z / taille * rep); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); libres.push(g); return g;
  }
  const matSol = new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 1, metalness: 0 }); libres.push(matSol);
  const grand = new THREE.Mesh(creerPlan(36000, q.tex >= 4096 ? 300 : 200, 900), matSol); grand.position.y = -.2; groupe.add(grand);
  const fin = new THREE.Mesh(creerPlan(700, q.tex >= 4096 ? 220 : 140, 90), matSol); groupe.add(fin);
  // lointain : arête du cratère Jezero (collines basses, très fondues dans la brume)
  const bord = (() => { const seg = 160, g = new THREE.BufferGeometry(), pos = [], idx = []; for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, r = 7800 + 900 * fbm(i * .09, 3, 3), hh = 380 + 520 * fbm(i * .13, 7, 4); pos.push(Math.cos(a) * r, -30, Math.sin(a) * r, Math.cos(a) * (r + 700), hh, Math.sin(a) * (r + 700)); if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } } g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); libres.push(g); return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x8a5a3e, roughness: 1, side: THREE.DoubleSide })); })();
  libres.push(bord.material); groupe.add(bord);

  /* ───── rochers : 3 formes, texture rocheuse, plus nombreux près du point d'atterrissage ───── */
  const texR = textureRoche(THREE, 5, [118, 96, 82]); libres.push(texR);
  const matR = new THREE.MeshStandardMaterial({ map: texR, bumpMap: texR, bumpScale: 2, roughness: 1, color: 0xb59a86 }); libres.push(matR);
  const nR = q.tex >= 4096 ? 1500 : 800, geos = [0, 1, 2].map(i => geometrieRocher(THREE, 11 + i * 4, 1)); libres.push(...geos);
  const rnd = (() => { let s = 4242 + graine; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
  geos.forEach((g, vi) => {
    const nb = Math.floor(nR / 3), m = new THREE.InstancedMesh(g, matR, nb); m.castShadow = false;
    for (let i = 0; i < nb; i++) {
      const r = 8 + Math.pow(rnd(), 1.7) * 650, a = rnd() * 6.2832, x = Math.cos(a) * r, z = Math.sin(a) * r, taille = (.06 + Math.pow(rnd(), 4.2) * 1.5) * (r < 40 ? .6 : 1);
      P.set(x, hauteur(x, z) + taille * .25, z); E.set(rnd() * 3, rnd() * 6, rnd() * 3); Q.setFromEuler(E); S.set(taille * (.8 + rnd() * .6), taille * (.55 + rnd() * .5), taille * (.8 + rnd() * .6)); M.compose(P, Q, S); m.setMatrixAt(i, M);
    }
    m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; groupe.add(m); libres.push(m);
  });

  /* ───── ciel martien, Soleil, Phobos, Deimos ───── */
  const sunDir = vec(.55, .62, -.56).normalize();
  const matCiel = new THREE.ShaderMaterial({ uniforms: { uSun: { value: sunDir }, uPoussiere: { value: .5 } }, vertexShader: VS_CIEL, fragmentShader: FS_CIEL, side: THREE.BackSide, depthWrite: false }); libres.push(matCiel);
  const ciel = new THREE.Mesh(new THREE.SphereGeometry(20000, 40, 20), matCiel); ciel.renderOrder = -5; ciel.frustumCulled = false; libres.push(ciel.geometry); groupe.add(ciel);
  const soleil = new THREE.Mesh(new THREE.CircleGeometry(20000 * Math.tan(.175 * Math.PI / 180), 24), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false, depthWrite: false })); libres.push(soleil.geometry, soleil.material);
  soleil.position.copy(sunDir).multiplyScalar(19500); soleil.lookAt(0, 0, 0); soleil.renderOrder = -4; groupe.add(soleil);
  const lumiere = new THREE.DirectionalLight(0xfff0dc, 3.1); lumiere.position.copy(sunDir).multiplyScalar(500); groupe.add(lumiere); groupe.add(lumiere.target);
  const ambiante = new THREE.HemisphereLight(0xd9a98a, 0x6b3f2c, .75); groupe.add(ambiante);
  const brume = new THREE.FogExp2(0xd1a07d, .000085);
  const lunes = {};
  for (const [nom, rayon, el, az, g] of [['phobos', 20000 * Math.tan(.11 * Math.PI / 180), 38, 205, geometrieRocher(THREE, 4, 2)], ['deimos', 20000 * Math.tan(.017 * Math.PI / 180) * 1.4, 56, 95, geometrieRocher(THREE, 9, 1)]]) {
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x8c7f73, roughness: 1, fog: false })); libres.push(g, m.material); m.scale.set(rayon * 1.2, rayon * .95, rayon); m.userData = { el, az, rayon }; groupe.add(m); lunes[nom] = m;
  }
  const posCiel = (el, az, R = 19000) => { const e = el * Math.PI / 180, a = az * Math.PI / 180; return vec(Math.cos(e) * Math.sin(a) * R, Math.sin(e) * R, -Math.cos(e) * Math.cos(a) * R); };
  function majCiel(t, camera) {
    ciel.position.copy(camera.position); soleil.position.copy(camera.position).addScaledVector(sunDir, 19500); soleil.lookAt(camera.position);
    lunes.phobos.userData.el = 38 + 3 * Math.sin(t * .02); lunes.phobos.userData.az = (205 + t * .35) % 360; lunes.deimos.userData.az = (95 + t * .03) % 360;
    for (const m of Object.values(lunes)) { m.position.copy(camera.position).add(posCiel(m.userData.el, m.userData.az)); m.rotation.y = t * .1; }
  }

  /* ───── poussière soulevée par les rétrofusées et les roues ───── */
  const NP = q.fumee > .5 ? 700 : 300, pos = new Float32Array(NP * 3), vie = new Float32Array(NP).fill(-1), vit = new Float32Array(NP * 3), tail = new Float32Array(NP), age = new Float32Array(NP);
  const gP = new THREE.BufferGeometry(); gP.setAttribute('position', new THREE.BufferAttribute(pos, 3)); gP.setAttribute('a', new THREE.BufferAttribute(tail, 1)); gP.setAttribute('t', new THREE.BufferAttribute(age, 1)); gP.boundingSphere = new THREE.Sphere(vec(0, 0, 0), 1e5);
  const matP = new THREE.ShaderMaterial({ uniforms: { uPx: { value: 1 } }, transparent: true, depthWrite: false, vertexShader: 'attribute float a; attribute float t; uniform float uPx; varying float vA; void main(){ vA=t; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=min(160.,a*uPx*900./max(-mv.z,1.)); }', fragmentShader: 'varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.0,d)*vA*.55; gl_FragColor=vec4(.78,.58,.42,a); }' }); libres.push(gP, matP);
  const poussiere = new THREE.Points(gP, matP); poussiere.frustumCulled = false; poussiere.renderOrder = 6; groupe.add(poussiere);
  let curseur = 0;
  const poussiereAPI = {
    // émet n particules autour de (x, z) à la hauteur y, en nappe qui s'étale (rayon, vitesse en m/s)
    emettre(x, y, z, n, vitesse = 12, taille = 6) { for (let k = 0; k < n; k++) { const i = curseur++ % NP, a = Math.random() * 6.2832, v = vitesse * (.4 + Math.random() * .9); pos[i * 3] = x + Math.cos(a) * 1.5; pos[i * 3 + 1] = y + Math.random() * .8; pos[i * 3 + 2] = z + Math.sin(a) * 1.5; vit[i * 3] = Math.cos(a) * v; vit[i * 3 + 1] = Math.random() * 1.6; vit[i * 3 + 2] = Math.sin(a) * v; vie[i] = 1; tail[i] = taille * (.6 + Math.random() * .9); age[i] = 1; } },
    maj(dt) {
      for (let i = 0; i < NP; i++) { if (vie[i] < 0) continue; vie[i] -= dt * .25; if (vie[i] <= 0) { vie[i] = -1; age[i] = 0; pos[i * 3 + 1] = -1e4; continue; } pos[i * 3] += vit[i * 3] * dt; pos[i * 3 + 1] += vit[i * 3 + 1] * dt; pos[i * 3 + 2] += vit[i * 3 + 2] * dt; vit[i * 3] *= 1 - dt * .55; vit[i * 3 + 2] *= 1 - dt * .55; vit[i * 3 + 1] *= 1 - dt * .3; tail[i] += dt * 2.4; age[i] = Math.min(1, vie[i] * 1.3); }
      gP.attributes.position.needsUpdate = gP.attributes.a.needsUpdate = gP.attributes.t.needsUpdate = true; matP.uniforms.uPx.value = 1;
    },
    vider() { vie.fill(-1); age.fill(0); pos.fill(-1e4); gP.attributes.position.needsUpdate = true; gP.attributes.t.needsUpdate = true; },
  };
  poussiereAPI.vider();

  function detruire() { for (const x of libres) { try { x.dispose && x.dispose(); } catch (e) { /* déjà libéré */ } } }
  return { groupe, ciel, soleil, lunes, hauteur, majCiel, poussiere: poussiereAPI, lumiere, ambiante, brume, sunDir, detruire, texR, matR };
}
