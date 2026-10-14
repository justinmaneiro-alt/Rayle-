// Ciel de l'Espace : carte du ciel réelle (Voie lactée, étoiles) + étoiles scintillantes + fonds de galaxies / nébuleuses sélectionnables.
// creerCiel(ctx) → { groupe, maj(dt, t, camera), style(id), styles, courant(), detruire() }
// Les styles « galaxie » sont dessinés par le code (aucun fichier) : spirale bleue, nébuleuse rose-violette, Voie lactée dorée, émeraude, rouge ardent.
// Le style « realiste » (par défaut) utilise ui/assets/espace/ciel-*.webp (Solar System Scope, CC BY 4.0, vraies étoiles).

export const STYLES_CIEL = {
  realiste: { nom: 'Ciel réel', icone: '✨', desc: 'la vraie carte du ciel' },
  spirale: { nom: 'Spirale bleue', icone: '🌀', desc: 'une galaxie spirale bleue' },
  nebuleuse: { nom: 'Nébuleuse rose', icone: '🌸', desc: 'une nébuleuse rose et violette' },
  dore: { nom: 'Voie lactée dorée', icone: '🌅', desc: 'une Voie lactée dorée' },
  emeraude: { nom: 'Émeraude', icone: '💚', desc: 'une nébuleuse vert émeraude' },
  braise: { nom: 'Braise', icone: '🔥', desc: 'une nébuleuse rouge et orange' },
};
const PALETTES = {
  spirale: { c1: [.15, .35, 1], c2: [.45, .75, 1], c3: [.08, .1, .35], etoiles: [.75, .85, 1], bras: 2, force: 1 },
  nebuleuse: { c1: [1, .25, .75], c2: [.65, .3, 1], c3: [.2, .05, .3], etoiles: [1, .85, .95], bras: 0, force: 1.1 },
  dore: { c1: [1, .7, .25], c2: [1, .9, .6], c3: [.3, .15, .05], etoiles: [1, .93, .75], bras: 0, force: 1 },
  emeraude: { c1: [.1, .9, .55], c2: [.2, .7, 1], c3: [.02, .22, .18], etoiles: [.8, 1, .9], bras: 0, force: 1 },
  braise: { c1: [1, .3, .1], c2: [1, .65, .2], c3: [.3, .04, .04], etoiles: [1, .8, .65], bras: 0, force: 1.05 },
};

// bruit de valeur 2D/3D simple et rapide (pour dessiner les nuages de gaz à la création, une seule fois)
function bruit(seed) {
  let s = seed >>> 0 || 1; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const N = 64, g = new Float32Array(N * N * N); for (let i = 0; i < g.length; i++) g[i] = rnd();
  const lisse = t => t * t * (3 - 2 * t);
  const at = (x, y, z) => g[((x & 63) * N + (y & 63)) * N + (z & 63)];
  const n3 = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = lisse(x - xi), fy = lisse(y - yi), fz = lisse(z - zi);
    const a = (u, v, w) => at(xi + u, yi + v, zi + w), l = (p, q, t) => p + (q - p) * t;
    return l(l(l(a(0, 0, 0), a(1, 0, 0), fx), l(a(0, 1, 0), a(1, 1, 0), fx), fy), l(l(a(0, 0, 1), a(1, 0, 1), fx), l(a(0, 1, 1), a(1, 1, 1), fx), fy), fz);
  };
  const fbm = (x, y, z, o = 5) => { let a = .5, f = 1, r = 0; for (let i = 0; i < o; i++) { r += a * n3(x * f, y * f, z * f); a *= .5; f *= 2.03; } return r; };
  return { rnd, fbm };
}

// dessine une carte équirectangulaire de galaxie/nébuleuse (canvas), tournée vers la bande galactique
export function dessinerGalaxie(id, largeur = 2048) {
  const P = PALETTES[id]; const W = largeur, H = W / 2;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const img = c.createImageData(W, H), d = img.data, { rnd, fbm } = bruit(id.length * 7919 + 13);
  for (let y = 0; y < H; y++) {
    const lat = (.5 - (y + .5) / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const lon = ((x + .5) / W - .5) * 2 * Math.PI, px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      // bande lumineuse inclinée (plan galactique) + nuages de gaz
      const bande = Math.exp(-Math.pow((py * .88 + px * .47) * 3.1, 2));
      let n = fbm(px * 2.2 + 3, py * 2.2 + 3, pz * 2.2 + 3, 5), n2 = fbm(px * 5.5 + 9, py * 5.5, pz * 5.5 + 5, 4);
      if (P.bras) { const ang = Math.atan2(pz, px), r = Math.abs(py * .88 + px * .47); n += .25 * Math.sin(P.bras * (ang * 2 + r * 6)) * bande; }
      const gaz = Math.max(0, n - .32) * 2.1 * (.25 + bande * 1.4) * P.force;
      const poussiere = Math.max(0, fbm(px * 4 + 1, py * 4 + 7, pz * 4 + 2, 4) - .52) * 3 * bande;
      const m = Math.min(1, gaz), t2 = Math.min(1, n2 * 1.3);
      let r = (P.c3[0] + (P.c1[0] - P.c3[0]) * m + (P.c2[0] - P.c1[0]) * m * t2 * .8) * gaz;
      let g = (P.c3[1] + (P.c1[1] - P.c3[1]) * m + (P.c2[1] - P.c1[1]) * m * t2 * .8) * gaz;
      let b = (P.c3[2] + (P.c1[2] - P.c3[2]) * m + (P.c2[2] - P.c1[2]) * m * t2 * .8) * gaz;
      const noyau = Math.exp(-Math.pow(Math.hypot(py * 1.1, px * .6 + pz * .0 + .1) * 3.8, 2)) * .9;
      r += P.c2[0] * noyau; g += P.c2[1] * noyau; b += P.c2[2] * noyau;
      const k = 1 - Math.min(.8, poussiere);
      const i = (y * W + x) * 4; d[i] = Math.min(255, r * k * 255 * .95); d[i + 1] = Math.min(255, g * k * 255 * .95); d[i + 2] = Math.min(255, b * k * 255 * .95); d[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  // étoiles
  const nE = W * 2.2 | 0;
  for (let i = 0; i < nE; i++) {
    const x = rnd() * W, y = rnd() * H, dens = Math.exp(-Math.pow((Math.sin((.5 - y / H) * Math.PI) * .88 + Math.cos((.5 - y / H) * Math.PI) * Math.cos((x / W - .5) * 6.2832) * .47) * 2.8, 2));
    if (rnd() > .3 + .7 * dens) continue;
    const m = Math.pow(rnd(), 5), a = .25 + .75 * m, r = .5 + m * 1.2, e = P.etoiles;
    c.fillStyle = `rgba(${e[0] * 255 | 0},${e[1] * 255 | 0},${e[2] * 255 | 0},${a})`; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
  }
  return cv;
}

export async function creerCiel(ctx) {
  const { THREE, noyau, q } = ctx;
  const groupe = new THREE.Group(); groupe.name = 'ciel';
  const R = 1800;
  const mat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, color: 0xffffff });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), mat); sphere.renderOrder = -10; sphere.frustumCulled = false;
  // même repère que le fond Espace : la carte est en coordonnées galactiques, retournée de 180° (vérifié sur le Grand Nuage de Magellan)
  sphere.rotation.y = Math.PI; groupe.add(sphere);
  let courant = 'realiste', tex = null, canvasTex = null;

  // étoiles scintillantes (points) par-dessus
  const nE = q.etoiles, pos = new Float32Array(nE * 3), col = new Float32Array(nE * 3), ph = new Float32Array(nE), tl = new Float32Array(nE);
  for (let i = 0; i < nE; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * 6.2832, r = Math.sqrt(1 - u * u);
    pos[3 * i] = r * Math.cos(a) * R * .98; pos[3 * i + 1] = u * R * .98; pos[3 * i + 2] = r * Math.sin(a) * R * .98;
    const t = Math.random(), k = .6 + .4 * Math.random(); col[3 * i] = k * (t < .3 ? 1 : .85 + .15 * t); col[3 * i + 1] = k * (.85 + .15 * Math.random()); col[3 * i + 2] = k * (t > .6 ? 1 : .8);
    ph[i] = Math.random() * 6.28; tl[i] = Math.pow(Math.random(), 3) * 3.2 + .8;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1)); g.setAttribute('tl', new THREE.BufferAttribute(tl, 1));
  const matE = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uPx: { value: 1 }, uK: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float ph; attribute float tl; attribute vec3 color; uniform float uT; uniform float uPx; uniform float uK; varying vec3 vC; varying float vA; void main(){ vC=color; float s=.72+.28*sin(uT*(1.2+tl*.5)+ph); vA=s; gl_PointSize=(1.2+tl*.9)*uPx*uK; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,d); gl_FragColor=vec4(vC*a*vA,a*vA); }',
  });
  const pts = new THREE.Points(g, matE); pts.frustumCulled = false; pts.renderOrder = -9; groupe.add(pts);

  async function style(id) {
    if (!STYLES_CIEL[id]) return false;
    courant = id;
    if (id === 'realiste') {
      if (!tex) { try { tex = await noyau.texture(q.tex >= 4096 ? 'espace/ciel-4k.webp' : 'espace/ciel-2k.webp'); } catch (e) { tex = null; } }
      mat.map = tex; mat.color.setScalar(tex ? 1.15 : 0); mat.needsUpdate = true; sphere.rotation.y = Math.PI; matE.uniforms.uK.value = 1;
    } else {
      if (canvasTex) { canvasTex.dispose(); canvasTex = null; }
      canvasTex = new THREE.CanvasTexture(dessinerGalaxie(id, q.tex >= 4096 ? 1536 : 1024)); canvasTex.colorSpace = THREE.SRGBColorSpace; canvasTex.anisotropy = 4;
      mat.map = canvasTex; mat.color.setScalar(1.05); mat.needsUpdate = true; sphere.rotation.y = 0; matE.uniforms.uK.value = 1.15;
    }
    return true;
  }
  await style('realiste');
  return {
    groupe, style, styles: STYLES_CIEL, courant: () => courant,
    maj(dt, t, camera) { matE.uniforms.uT.value = t; matE.uniforms.uPx.value = ctx.renderer.getPixelRatio(); if (camera) groupe.position.copy(camera.getWorldPosition(new THREE.Vector3())); },
    detruire() { g.dispose(); matE.dispose(); mat.dispose(); sphere.geometry.dispose(); if (canvasTex) canvasTex.dispose(); },
  };
}
