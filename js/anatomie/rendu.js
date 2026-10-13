/* ═════════════ RENDU : studio d'éclairage, ombres douces, environnement, post-traitement ═════════════
   Trois niveaux de qualité (mémorisé : localStorage « rayle_an_qualite ») :
     eco      : matériaux simples, sans ombres ni post-traitement (téléphones modestes, batterie) ;
     standard : matériaux PBR procéduraux (js/anatomie/pbr.js), éclairage de studio à trois points, ombres douces, reflets d'environnement ;
     haute    : standard + occlusion ambiante (SSAO), bloom discret, fond dégradé, tonalité ACES (EffectComposer de three.js, chargé à la demande).
   Le post-traitement vient de three/addons (import map de index.html) ; s'il ne se charge pas (hors ligne), on retombe sur « standard ». */

export const NIVEAUX = ['eco', 'standard', 'haute'];
export const NOMS_NIVEAUX = { eco: 'Éco', standard: 'Standard', haute: 'Haute' };
const CLE = 'rayle_an_qualite';

export function lireNiveau(mini) {
  try { const v = localStorage.getItem(CLE); if (NIVEAUX.includes(v)) return v; } catch (e) { }
  return 'standard';
}
export function ecrireNiveau(n) { try { localStorage.setItem(CLE, n); } catch (e) { } }

/** Éclairage de studio : lumière principale (chaude, ombrée), lumière de remplissage (froide), contre-jour (détoure le modèle) + lueur ambiante. */
export function studio(THREE, scene, niveau, mini) {
  const lumieres = [];
  const amb = new THREE.HemisphereLight(0xdfe9ff, 0x3a2a30, niveau === 'eco' ? .95 : .35);
  const cle = new THREE.DirectionalLight(0xfff1e0, niveau === 'eco' ? .9 : 2.3); cle.position.set(2.2, 3.4, 3.0); cle.target.position.set(0, .95, 0);
  const remplissage = new THREE.DirectionalLight(0xb9d0ff, niveau === 'eco' ? .45 : .85); remplissage.position.set(-3, 1.6, 2.2);
  const contre = new THREE.DirectionalLight(0xffffff, niveau === 'eco' ? .5 : 1.5); contre.position.set(-1.2, 3, -3.6); contre.target.position.set(0, 1, 0);
  if (niveau !== 'eco') {
    cle.castShadow = true; const t = mini ? 1024 : 2048; cle.shadow.mapSize.set(t, t);
    const c = cle.shadow.camera; c.left = -1.25; c.right = 1.25; c.top = 2.2; c.bottom = -.35; c.near = .5; c.far = 12;
    cle.shadow.bias = -.0004; cle.shadow.normalBias = .006; cle.shadow.radius = 4; cle.shadow.blurSamples = 12;
  }
  for (const l of [amb, cle, remplissage, contre]) { scene.add(l); lumieres.push(l); }
  scene.add(cle.target, contre.target);
  return { cle, remplissage, contre, amb, retirer() { lumieres.forEach(l => scene.remove(l)); scene.remove(cle.target, contre.target); } };
}

/** Sol qui reçoit l'ombre du modèle */
export function solOmbre(THREE) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48), new THREE.ShadowMaterial({ opacity: .38 }));
  m.rotation.x = -Math.PI / 2; m.position.y = .001; m.receiveShadow = true; m.userData.sol = true; return m;
}

/** Fond dégradé (niveau haute : le canvas devient opaque à cause du post-traitement) */
export function fondDegrade(THREE) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  const g = c.createRadialGradient(128, 118, 8, 128, 128, 190); g.addColorStop(0, '#1d1a36'); g.addColorStop(.55, '#0b0914'); g.addColorStop(1, '#030207');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Environnement de studio (reflets des matériaux PBR) fabriqué sur place, sans image. */
export async function environnement(THREE, rendu) {
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
  const pm = new THREE.PMREMGenerator(rendu), env = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
  return env;
}

/** Pipeline de post-traitement (niveau haute). → { render(), setSize(w,h), ssao, bloom, dispose() } */
export async function pipeline(THREE, rendu, scene, camera, w, h) {
  const [{ EffectComposer }, { RenderPass }, { SSAOPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
    import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'), import('three/addons/postprocessing/SSAOPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js')]);
  const composer = new EffectComposer(rendu);
  composer.setPixelRatio(rendu.getPixelRatio()); composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  const ssao = new SSAOPass(scene, camera, w, h);
  ssao.kernelRadius = .07; ssao.minDistance = .0004; ssao.maxDistance = .035; composer.addPass(ssao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), .2, .6, .86); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(), setSize: (a, b) => { composer.setSize(a, b); }, ssao, bloom,
    dispose() { try { composer.dispose(); } catch (e) { } }
  };
}
