/* ═════════════ TERRE CLASSIQUE ALLÉGÉE POUR LA TÉLÉ ═════════════
   Mêmes textures que la Terre classique de la galaxie (Solar System Scope, CC BY 4.0, galaxie/textures), jour et nuit à l'heure réelle,
   nuages, rotation lente. Qualité automatique selon les images par seconde (basse / moyenne / haute : résolution, nuages, finesse).
   Pas de tuiles, pas de relief, pas de bâtiments : une télé n'a pas le processeur graphique du PC. */
import { ajusterQualite, QUALITES, sousSolaire } from './tele-calcul.js';

const BASE = new URL('../../../galaxie/', import.meta.url).href;
export async function creerTerreTele(el, { qualiteDepart = 1 } = {}) {
  const THREE = await import(BASE + 'vendor/three.module.min.js');
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000); el.appendChild(renderer.domElement); renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100); camera.position.set(0, 0.35, 4.3); camera.lookAt(0, 0, 0);
  const tl = new THREE.TextureLoader(), charger = f => new Promise(ok => tl.load(BASE + 'textures/' + f, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; ok(t); }, undefined, () => ok(null)));
  const [jour, nuit, nuages] = await Promise.all([charger('8k_earth_daymap.jpg'), charger('2k_earth_nightmap.jpg'), charger('2k_earth_clouds.jpg')]);
  const soleil = new THREE.Vector3();
  const mat = new THREE.ShaderMaterial({
    uniforms: { jour: { value: jour }, nuit: { value: nuit }, soleil: { value: soleil } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv=uv; vN=normalize((modelMatrix*vec4(normal,0.0)).xyz); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D jour; uniform sampler2D nuit; uniform vec3 soleil; varying vec2 vUv; varying vec3 vN;
void main(){ float l=dot(normalize(vN),normalize(soleil)); float m=smoothstep(-0.12,0.18,l); vec3 j=texture2D(jour,vUv).rgb*(0.25+0.85*max(l,0.0)); vec3 n=texture2D(nuit,vUv).rgb*1.3; gl_FragColor=vec4(mix(n,j,m),1.0);
#include <colorspace_fragment>
}`
  });
  let globe = null, couche = null, niveau = qualiteDepart;
  function construire() {
    const Q = QUALITES[niveau];
    if (globe) { scene.remove(globe); globe.geometry.dispose(); } if (couche) { scene.remove(couche); couche.geometry.dispose(); couche = null; }
    globe = new THREE.Mesh(new THREE.SphereGeometry(1, Q.segments, Q.segments / 2), mat); globe.rotation.z = 0.41; scene.add(globe);
    if (Q.nuages && nuages) { couche = new THREE.Mesh(new THREE.SphereGeometry(1.012, Q.segments, Q.segments / 2), new THREE.MeshLambertMaterial({ map: nuages, transparent: true, opacity: 0.55, depthWrite: false })); couche.rotation.z = 0.41; scene.add(couche); }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * Q.ratio); taille();
  }
  const lumiere = new THREE.DirectionalLight(0xffffff, 2.2); scene.add(lumiere); scene.add(new THREE.AmbientLight(0x334455, 0.6));
  function taille() { const l = el.clientWidth || 1, h = el.clientHeight || 1; renderer.setSize(l, h, false); camera.aspect = l / h; camera.updateProjectionMatrix(); }
  const ro = new ResizeObserver(taille); ro.observe(el);
  construire();
  let anim = null, t0 = performance.now(), images = 0, actif = true, rot = Math.PI;   // l'Europe face à la caméra au départ
  function boucle(t) {
    anim = requestAnimationFrame(boucle); if (!actif) return;
    const s = sousSolaire(Date.now()), la = s.lat * Math.PI / 180, lo = s.lon * Math.PI / 180;
    rot += 0.0006; globe.rotation.y = rot; if (couche) couche.rotation.y = rot * 1.08;
    // direction du soleil dans le repère du globe tourné (longitude 0 de la texture = axe -Z... on tourne avec le globe)
    soleil.set(Math.cos(la) * Math.sin(lo + rot + Math.PI / 2), Math.sin(la), Math.cos(la) * Math.cos(lo + rot + Math.PI / 2));
    lumiere.position.copy(soleil).multiplyScalar(10);
    renderer.render(scene, camera); images++;
    if (t - t0 > 3000) { const ips = images * 1000 / (t - t0), n = ajusterQualite(niveau, ips); images = 0; t0 = t; api.ips = Math.round(ips); if (n !== niveau) { niveau = n; construire(); } }
  }
  anim = requestAnimationFrame(boucle);
  const api = { ips: null, qualite: () => QUALITES[niveau].nom, pause(v) { actif = !v; }, detruire() { cancelAnimationFrame(anim); ro.disconnect(); renderer.dispose(); renderer.domElement.remove(); } };
  return api;
}
