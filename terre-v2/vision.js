/* ═════════════ TERRE 2.0 : MODES DE VISION (post-traitement Cesium, nuanceurs GLSL ES 3.0) ═════════════
   normal · vision nocturne · thermique · CRT · noir et blanc. Bouton « Vision » + touche V (cycle). Code écrit pour Rayle. */
export const MODES = {
  normal: { nom: 'normal', suivant: 'nuit' },
  nuit: { nom: 'vision nocturne', suivant: 'thermique' },
  thermique: { nom: 'thermique', suivant: 'crt' },
  crt: { nom: 'CRT', suivant: 'nb' },
  nb: { nom: 'noir et blanc', suivant: 'normal' }
};

const TETE = `uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
uniform float temps;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float bruit(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vignette(vec2 uv, float f) { vec2 d = uv - 0.5; return clamp(1.0 - dot(d, d) * f, 0.0, 1.0); }
`;
export const NUANCEURS = {
  nuit: TETE + `void main() {
  vec2 uv = v_textureCoordinates;
  float l = lum(texture(colorTexture, uv).rgb);
  l = pow(clamp(l * 2.6, 0.0, 1.0), 0.8);
  float g = bruit(uv * czm_viewport.zw + temps * 60.0) * 0.12;
  float scan = 0.94 + 0.06 * sin(uv.y * czm_viewport.w * 1.5);
  vec3 c = vec3(0.12, 1.0, 0.25) * (l + g) * scan * vignette(uv, 1.9);
  out_FragColor = vec4(c, 1.0);
}`,
  thermique: TETE + `vec3 palette(float t) {
  vec3 a = vec3(0.02, 0.0, 0.08), b = vec3(0.35, 0.0, 0.55), c = vec3(0.9, 0.1, 0.15), d = vec3(1.0, 0.75, 0.0), e = vec3(1.0, 1.0, 0.92);
  if (t < 0.25) return mix(a, b, t / 0.25);
  if (t < 0.5) return mix(b, c, (t - 0.25) / 0.25);
  if (t < 0.78) return mix(c, d, (t - 0.5) / 0.28);
  return mix(d, e, (t - 0.78) / 0.22);
}
void main() {
  vec2 uv = v_textureCoordinates;
  vec3 s = texture(colorTexture, uv).rgb;
  float t = clamp(lum(s) * 1.15 + (s.r - s.b) * 0.25, 0.0, 1.0);
  out_FragColor = vec4(palette(t), 1.0);
}`,
  crt: TETE + `void main() {
  vec2 uv = v_textureCoordinates - 0.5;
  uv *= 1.0 + dot(uv, uv) * 0.08;
  uv += 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { out_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float a = 0.0018;
  vec3 c = vec3(texture(colorTexture, uv + vec2(a, 0.0)).r, texture(colorTexture, uv).g, texture(colorTexture, uv - vec2(a, 0.0)).b);
  float scan = 0.82 + 0.18 * sin(uv.y * czm_viewport.w * 3.14159);
  float masque = 0.92 + 0.08 * sin(uv.x * czm_viewport.z * 2.094);
  float flicker = 0.985 + 0.015 * sin(temps * 50.0);
  out_FragColor = vec4(c * scan * masque * flicker * vignette(uv, 1.4) * 1.12, 1.0);
}`,
  nb: TETE + `void main() {
  vec2 uv = v_textureCoordinates;
  float l = lum(texture(colorTexture, uv).rgb);
  l = clamp((l - 0.5) * 1.25 + 0.52, 0.0, 1.0);
  out_FragColor = vec4(vec3(l), 1.0);
}`
};

export function creerVision(viewer, Cesium) {
  let mode = 'normal', etape = null;
  const debut = performance.now();
  function choisir(m) {
    if (!MODES[m]) return false;
    if (etape) { viewer.scene.postProcessStages.remove(etape); etape = null; }
    mode = m;
    if (m !== 'normal') {
      etape = new Cesium.PostProcessStage({ name: 'rayle_vision_' + m, fragmentShader: NUANCEURS[m], uniforms: { temps: () => (performance.now() - debut) / 1000 } });
      viewer.scene.postProcessStages.add(etape);
    }
    document.documentElement.dataset.terre2Vision = m;
    return true;
  }
  return { choisir, mode: () => mode };
}
