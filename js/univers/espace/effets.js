// Rayons crépusculaires (« god rays ») du Soleil, calculés en un seul passage plein écran, additif, SANS second rendu de la scène :
// le Soleil est une source lumineuse, la Terre et la Lune sont des disques occulteurs connus analytiquement (projection de leur sphère à l'écran).
// Pour chaque pixel, on intègre la lueur du Soleil le long du segment pixel → Soleil, en retirant ce qui traverse un occulteur : des faisceaux
// n'apparaissent que lorsque le Soleil affleure le limbe de la Terre ou de la Lune (coucher de Soleil vu de l'espace, éclipse), comme dans la réalité.
// creerRayons(THREE) → { rendre(renderer, camera, soleil, terre, lune, k), detruire() } ; k = intensité 0..1 (0 : désactivé, aucun coût).
const FS = `
precision highp float;
uniform vec2 uSun, uEarth, uMoon; uniform float uAspect, uEarthR, uMoonR, uK, uSunR;
varying vec2 vUv;
float occ(vec2 p, vec2 c, float r){ vec2 d=(p-c)*vec2(uAspect,1.); return smoothstep(r*.985,r*1.005,length(d)); }
float glow(vec2 p){ vec2 d=(p-uSun)*vec2(uAspect,1.); float x=length(d)/uSunR; return exp(-x*x*.9)*1.4+exp(-x*.7)*.35; }
void main(){
  vec2 dir=(uSun-vUv); float L=length(dir*vec2(uAspect,1.));
  float acc=0.; const int N=40; float w=1.; float wsum=0.;
  for(int i=0;i<N;i++){
    float t=(float(i)+.5)/float(N);
    vec2 s=vUv+dir*t;
    float o=occ(s,uEarth,uEarthR)*occ(s,uMoon,uMoonR);
    acc+=glow(s)*o*w; wsum+=w; w*=.965;
  }
  float r=acc/wsum;
  // fondu : proche du Soleil la lueur est déjà dessinée par les halos ; les faisceaux comptent loin de lui
  float k=smoothstep(.02,.35,L)*(1.-smoothstep(.9,1.8,L));
  // pas de faisceau derrière l'occulteur lui-même (le disque reste sombre)
  float o0=occ(vUv,uEarth,uEarthR)*occ(vUv,uMoon,uMoonR);
  vec3 col=vec3(1.,.88,.68)*r*k*uK*.9*o0;
  gl_FragColor=vec4(col,1.);
}`;
export function creerRayons(THREE) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uSun: { value: new THREE.Vector2() }, uEarth: { value: new THREE.Vector2() }, uMoon: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uEarthR: { value: .1 }, uMoonR: { value: 0 }, uK: { value: 1 }, uSunR: { value: .03 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }', fragmentShader: FS });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false; scene.add(quad);
  const v = new THREE.Vector3();
  const uv = (w, camera) => { v.copy(w).project(camera); return { x: v.x * .5 + .5, y: v.y * .5 + .5, z: v.z }; };
  const rayonH = (centre, R, camera) => { const d = centre.distanceTo(camera.getWorldPosition(new THREE.Vector3())); return d <= R * 1.001 ? 5 : (R / Math.sqrt(d * d - R * R)) / Math.tan(camera.fov * Math.PI / 360) * .5; };
  let actif = false;
  return {
    // soleil, terre, lune : positions du monde ; RT : rayons (terre 1, lune 0,2727). Rend le passage additif après le rendu principal.
    rendre(renderer, camera, soleil, terre, lune, rLune, k) {
      actif = false; if (k <= 0) return false;
      const s = uv(soleil, camera); if (s.z > 1 || s.x < -.6 || s.x > 1.6 || s.y < -.6 || s.y > 1.6) return false;
      const e = uv(terre, camera), m = uv(lune, camera), aspect = camera.aspect;
      const rE = rayonH(terre, 1, camera);
      // inutile si le Soleil est loin de tout occulteur (aucun faisceau possible) : rien à dessiner
      const dSE = Math.hypot((s.x - e.x) * aspect, s.y - e.y);
      if (dSE > rE * 3.2 + .25 && !(lune && Math.hypot((s.x - m.x) * aspect, s.y - m.y) < .4)) return false;
      const u = mat.uniforms; u.uSun.value.set(s.x, s.y); u.uEarth.value.set(e.x, e.y); u.uMoon.value.set(m.x, m.y); u.uAspect.value = aspect; u.uEarthR.value = rE;
      u.uMoonR.value = lune ? Math.max(1e-4, rayonH(lune, rLune, camera)) : 1e-4; u.uK.value = k;
      const ac = renderer.autoClear; renderer.autoClear = false; renderer.render(scene, cam); renderer.autoClear = ac; actif = true; return true;
    },
    actif: () => actif,
    detruire() { mat.dispose(); quad.geometry.dispose(); },
  };
}
