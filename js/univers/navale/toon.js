// Rendu « dessin animé » du thème Bataille navale : matériaux à paliers de lumière (cel-shading), contours épais (coque inversée), couleurs riches.
//   rampe(THREE, n)                      texture de dégradé à n paliers (pour MeshToonMaterial)
//   matToon(THREE, couleur, options)     matériau toon (couleur, émissif, côté…)
//   contour(THREE, mesh, ep, couleur)    ajoute en enfant la « coque inversée » noire qui trace le trait épais autour du maillage
// Les contours se règlent par la qualité (q.contours) : désactivés en Basse pour les petits objets.
const rampes = new Map();
export function rampe(THREE, n = 3) {
  if (rampes.has(n)) return rampes.get(n);
  const d = new Uint8Array(n * 4); for (let i = 0; i < n; i++) { const v = Math.round(255 * (i === 0 ? .30 : i / (n - 1) * .78 + .22)); d.set([v, v, v, 255], i * 4); }
  const t = new THREE.DataTexture(d, n, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; rampes.set(n, t); return t;
}
export function matToon(THREE, couleur, o = {}) {
  const m = new THREE.MeshToonMaterial(Object.assign({ color: couleur, gradientMap: rampe(THREE, o.paliers || 3) }, o)); delete m.paliers; return m;
}
const VS_CONTOUR = 'uniform float uEp; void main(){ vec3 p=position+normal*uEp; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }';
const FS_CONTOUR = 'uniform vec3 uCouleur; void main(){ gl_FragColor=vec4(uCouleur,1.); }';
const contours = new Map();
export function matContour(THREE, ep = .05, couleur = 0x1a0f08) {
  const cle = ep + ':' + couleur; if (contours.has(cle)) return contours.get(cle);
  const m = new THREE.ShaderMaterial({ uniforms: { uEp: { value: ep }, uCouleur: { value: new THREE.Color(couleur) } }, vertexShader: VS_CONTOUR, fragmentShader: FS_CONTOUR, side: THREE.BackSide }); contours.set(cle, m); return m;
}
export function contour(THREE, mesh, ep = .05, couleur = 0x1a0f08) {
  const c = new THREE.Mesh(mesh.geometry, matContour(THREE, ep, couleur)); c.name = 'contour'; c.matrixAutoUpdate = false; c.raycast = () => {}; mesh.add(c); return c;
}
// version instanciée (InstancedMesh) : même géométrie, mêmes matrices
export function contourInstances(THREE, im, ep = .03, couleur = 0x1a0f08) {
  const c = new THREE.InstancedMesh(im.geometry, matContour(THREE, ep, couleur), im.count); c.instanceMatrix = im.instanceMatrix; c.name = 'contour'; c.frustumCulled = false; im.add(c); return c;
}
export function libererContours() { for (const m of contours.values()) m.dispose(); contours.clear(); for (const t of rampes.values()) t.dispose(); rampes.clear(); }
