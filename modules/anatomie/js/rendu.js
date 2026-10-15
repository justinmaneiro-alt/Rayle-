/* ═════════════ RENDU : studio d'éclairage, ombres douces, environnement, post-traitement ═════════════
   Trois niveaux de qualité (mémorisé : localStorage « rayle_an_qualite ») :
     eco      : matériaux simples, sans ombres ni post-traitement (téléphones modestes, batterie) ;
     standard : matériaux PBR procéduraux (js/anatomie/pbr.js), éclairage de studio à trois points, ombres douces, reflets d'environnement ;
     haute    : standard + occlusion ambiante (SSAO), bloom discret, fond dégradé, tonalité ACES (EffectComposer de three.js, chargé à la demande).
   Le post-traitement vient de three/addons (import map de index.html) ; s'il ne se charge pas (hors ligne), on retombe sur « standard ». */

export const NIVEAUX = ['eco', 'standard', 'haute'];
export const NOMS_NIVEAUX = { eco: 'Éco', standard: 'Standard', haute: 'Haute' };
const CLE = 'rayle_an_qualite';

/** Capacités de l'appareil : WebGL2, mémoire annoncée (Chrome / Android), cœurs, écran tactile, taille de texture maximale. Sert à choisir le niveau par défaut. */
export function detecterCapacites() {
  const c = { webgl2: false, memoire: null, coeurs: null, mobile: false, pixelRatio: 1, texMax: 0 };
  try {
    c.pixelRatio = window.devicePixelRatio || 1; c.memoire = navigator.deviceMemory || null; c.coeurs = navigator.hardwareConcurrency || null;
    c.mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '') || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
    const cv = document.createElement('canvas'), gl = cv.getContext('webgl2'); c.webgl2 = !!gl;
    const g = gl || cv.getContext('webgl'); if (g) c.texMax = g.getParameter(g.MAX_TEXTURE_SIZE);
  } catch (e) { }
  return c;
}
/** Niveau conseillé : Éco si l'appareil est modeste (≤ 2 Go, ≤ 2 cœurs, texture max < 4096), Standard sinon, Haute seulement sur grand écran de bureau bien équipé */
export function niveauConseille(c = detecterCapacites()) {
  if ((c.memoire && c.memoire <= 2) || (c.coeurs && c.coeurs <= 2) || (c.texMax && c.texMax < 4096)) return 'eco';
  if (!c.mobile && c.webgl2 && (c.memoire || 4) >= 8 && (c.coeurs || 4) >= 8) return 'haute';
  return 'standard';
}
/** Niveau mémorisé par l'utilisateur ; à défaut, celui que conseillent les capacités de l'appareil */
export function lireNiveau(mini) {
  try { const v = localStorage.getItem(CLE); if (NIVEAUX.includes(v)) return v; } catch (e) { }
  const n = niveauConseille(); return mini && n === 'haute' ? 'standard' : n;
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

/** Vignettage léger : assombrit doucement les bords, après la tonalité (le contenu reste lisible) */
const SHADER_VIGNETTE = {
  uniforms: { tDiffuse: { value: null }, force: { value: .32 }, rayon: { value: .78 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; uniform float force; uniform float rayon; varying vec2 vUv;' +
    'void main(){ vec4 c=texture2D(tDiffuse,vUv); float d=distance(vUv,vec2(.5))*1.4142; c.rgb*=1.0-force*smoothstep(rayon*.55,rayon*1.15,d); gl_FragColor=c; }'
};

/** Pipeline de post-traitement (niveau haute) : rendu (MSAA si WebGL2) → SSAO → profondeur de champ (optionnelle) → bloom → tonalité ACES → vignettage → FXAA.
    → { render(), setSize(w,h), ssao, bloom, dof, vignette, fxaa, activerDOF(oui), focus(dist), dispose() }
    Chaque passe est indépendante : si une passe optionnelle (DOF, FXAA) ne se charge pas, les autres fonctionnent. */
export async function pipeline(THREE, rendu, scene, camera, w, h) {
  const [{ EffectComposer }, { RenderPass }, { SSAOPass }, { UnrealBloomPass }, { OutputPass }, { ShaderPass }] = await Promise.all([
    import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'), import('three/addons/postprocessing/SSAOPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js'), import('three/addons/postprocessing/ShaderPass.js')]);
  const pr = rendu.getPixelRatio();
  let cible; try { if (rendu.capabilities.isWebGL2) cible = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4, stencilBuffer: true }); } catch (e) { cible = undefined; }   // anticrénelage matériel
  const composer = new EffectComposer(rendu, cible);
  composer.setPixelRatio(pr); composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  const ssao = new SSAOPass(scene, camera, w, h);
  ssao.kernelRadius = .07; ssao.minDistance = .0004; ssao.maxDistance = .035; composer.addPass(ssao);
  let dof = null;
  try {
    const { BokehPass } = await import('three/addons/postprocessing/BokehPass.js');
    dof = new BokehPass(scene, camera, { focus: 3.5, aperture: .00012, maxblur: .004 }); dof.enabled = false; composer.addPass(dof);
  } catch (e) { dof = null; }
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), .2, .6, .86); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const vignette = new ShaderPass(SHADER_VIGNETTE); composer.addPass(vignette);
  let fxaa = null;
  try {
    const { FXAAShader } = await import('three/addons/shaders/FXAAShader.js');
    fxaa = new ShaderPass(FXAAShader); composer.addPass(fxaa);
  } catch (e) { fxaa = null; }
  const taille = (a, b) => { composer.setSize(a, b); if (fxaa) fxaa.material.uniforms.resolution.value.set(1 / (a * pr), 1 / (b * pr)); };
  taille(w, h);
  return {
    render: () => composer.render(), setSize: taille, ssao, bloom, dof, vignette, fxaa,
    activerDOF(oui) { if (dof) dof.enabled = !!oui; return !!dof && !!oui; },
    focus(dist) { if (dof) dof.uniforms.focus.value = dist; },
    dispose() { try { composer.dispose(); } catch (e) { } }
  };
}
