import { genererReseau, aretesPour } from '../../galaxie/reseau.js';
import { MODES, modeEffectif, largeurAppareil } from './modes-accueil.js';
import { creerEtat, srgbVersLineaire } from './etats-reseau.js';
import { VERT_NOEUDS, FRAG_NOEUDS, VERT_LIENS, FRAG_LIENS } from './shaders-reseau.js';
import { preparerDonnees } from './donnees-reseau.js';
import { surveillerFps } from '../../galaxie/qualite.js';

/* ═════════════ ENTITÉ DE L'ACCUEIL : le soleil de la galaxie, en WebGL natif (sans Three.js) ═════════════
   Même réseau (galaxie/reseau.js), mêmes états, couleurs, flashs et respiration (etats-reseau.js), mêmes shaders (shaders-reseau.js),
   mêmes données (donnees-reseau.js), même chaîne de rendu que la galaxie : lumière additive en demi-flottants, bloom (UnrealBloom : mêmes
   passes), puis tone mapping ACES (exposition 1,05) et encodage sRGB. Seul le moteur change, donc aucune différence de style.
   API identique à window.Entite (skins/neurone/entite.js, qui l'utilise et garde l'ancien dessin en secours) :
     monter(el) · demonter() · etat(nom) · verrou(b) · deverrouille(b) · alerte(ms) · amplitude(fn) · qualite(q) · fixer() · info()
   Modes : 0 complet · 1 normal · 2 léger (3 = ancien dessin 2D, géré par entite.js) ; « auto » détecte l'appareil. Le nuage est généré dans un Worker. */
const R_SOLEIL = 12;   // rayon du soleil dans la galaxie (planetes/rayle/manifeste.json) : mêmes proportions
const FOV = 50, DIST = R_SOLEIL * 3.4;   // la caméra : même champ de vision que la galaxie ; distance qui cadre l'entité dans le carré
const TAILLE_POINT = 3.6, HAUTEUR_REF = 1000;   // taille des neurones : celle de la galaxie sur un écran d'environ 1000 px de haut (le rapport neurone/entité en dépend)
const NIVEAUX = MODES;   // 0 complet · 1 normal · 2 léger (skins/neurone/modes-accueil.js)
const CLE_Q = 'rayle_entite_qualite', CLE_N = 'rayle_entite_niveau';
const lire = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

const ENTETE_VS = '#version 300 es\nprecision highp float;\n#define attribute in\n#define varying out\n';
const ENTETE_FS = '#version 300 es\nprecision highp float;\n#define varying in\nout vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n';
const MATRICES = 'uniform mat4 modelViewMatrix, projectionMatrix;\nattribute vec3 position;\n';
const PLEIN_ECRAN = ENTETE_VS + 'varying vec2 vUv;\nvoid main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }';

const FS_HALO = ENTETE_FS + `
  uniform vec3 uCouleur; uniform float uOpacite; varying vec2 vC;
  float alpha(float d) {   // le dégradé de la texture de halo de la galaxie (arrêts 0 / .2 / .55 / 1)
    if (d >= 1.0) return 0.0;
    if (d < 0.2) return mix(1.0, 0.35, d / 0.2);
    if (d < 0.55) return mix(0.35, 0.06, (d - 0.2) / 0.35);
    return mix(0.06, 0.0, (d - 0.55) / 0.45);
  }
  void main(){ gl_FragColor = vec4(uCouleur, uOpacite * alpha(length(vC))); }`;
const VS_HALO = ENTETE_VS + MATRICES + `
  uniform float uEchelleSprite; varying vec2 vC;
  void main(){ vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0; vC = c;
    gl_Position = projectionMatrix * (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0) + vec4(c * uEchelleSprite * 0.5, 0.0, 0.0)); }`;
const FS_HAUTE = ENTETE_FS + `
  uniform sampler2D tDiffuse; uniform float uSeuil, uLarge; varying vec2 vUv;
  void main(){ vec4 texel = texture(tDiffuse, vUv); float v = dot(texel.xyz, vec3(0.2126, 0.7152, 0.0722));
    gl_FragColor = mix(vec4(0.0), texel, smoothstep(uSeuil, uSeuil + uLarge, v)); }`;
const FS_FLOU = ENTETE_FS + `
  uniform sampler2D colorTexture; uniform vec2 invSize, direction; uniform float gaussianCoefficients[11]; uniform int uK; varying vec2 vUv;
  void main(){ float poids = gaussianCoefficients[0]; vec3 somme = texture(colorTexture, vUv).rgb * poids;
    for (int i = 1; i < 11; i++) { if (i >= uK) break; float w = gaussianCoefficients[i]; vec2 d = direction * invSize * float(i);
      somme += (texture(colorTexture, vUv + d).rgb + texture(colorTexture, vUv - d).rgb) * w; poids += 2.0 * w; }
    gl_FragColor = vec4(somme / poids, 1.0); }`;
const FS_COMPOSE = ENTETE_FS + `
  uniform sampler2D blurTexture1, blurTexture2, blurTexture3, blurTexture4, blurTexture5; uniform float bloomStrength, bloomRadius; varying vec2 vUv;
  float lerpBloomFactor(const in float factor) { return mix(factor, 1.2 - factor, bloomRadius); }
  void main(){ gl_FragColor = bloomStrength * ( lerpBloomFactor(1.0) * texture(blurTexture1, vUv) + lerpBloomFactor(0.8) * texture(blurTexture2, vUv) +
    lerpBloomFactor(0.6) * texture(blurTexture3, vUv) + lerpBloomFactor(0.4) * texture(blurTexture4, vUv) + lerpBloomFactor(0.2) * texture(blurTexture5, vUv) ); }`;
const FS_AJOUT = ENTETE_FS + 'uniform sampler2D tDiffuse; varying vec2 vUv;\nvoid main(){ gl_FragColor = texture(tDiffuse, vUv); }';
// Sortie : tone mapping ACES (celui de Three.js, exposition 1,05) puis sRGB ; l'opacité vient de la lumière (additif sur le fond de la page)
const FS_SORTIE = ENTETE_FS + `
  uniform sampler2D tDiffuse; uniform float toneMappingExposure; varying vec2 vUv;
  vec3 RRTAndODTFit( vec3 v ) { vec3 a = v * ( v + 0.0245786 ) - 0.000090537; vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081; return a / b; }
  vec3 ACESFilmicToneMapping( vec3 color ) {
    const mat3 ACESInputMat = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
    const mat3 ACESOutputMat = mat3( vec3(  1.60475, -0.10208, -0.00327 ), vec3( -0.53108,  1.10813, -0.07276 ), vec3( -0.07367, -0.00605,  1.07602 ) );
    color *= toneMappingExposure / 0.6; color = ACESInputMat * color; color = RRTAndODTFit( color ); color = ACESOutputMat * color; return clamp( color, 0.0, 1.0 ); }
  void main(){ vec3 c = ACESFilmicToneMapping( max(texture(tDiffuse, vUv).rgb, 0.0) );
    c = mix( pow( c, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), c * 12.92, vec3( lessThanEqual( c, vec3( 0.0031308 ) ) ) );
    float bord = smoothstep(1.0, 0.7, length(vUv * 2.0 - 1.0));   // la lueur s'éteint avant le bord du carré (pas de cadre visible)
    c *= bord; gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); }`;

// tampons réutilisés à chaque image : aucune allocation pendant l'animation
const tOndes = new Float32Array(9), tCasA = new Float32Array(16), tCasB = new Float32Array(16), tC1 = new Float32Array(3), tC2 = new Float32Array(3), tFl = new Float32Array(3), tCc = new Float32Array(3);
const lin3 = (src, dst) => { dst[0] = srgbVersLineaire(src[0]); dst[1] = srgbVersLineaire(src[1]); dst[2] = srgbVersLineaire(src[2]); return dst; };
const ondesPlat = o => { for (let i = 0; i < 3; i++) { tOndes[i * 3] = o[i][0]; tOndes[i * 3 + 1] = o[i][1]; tOndes[i * 3 + 2] = o[i][2]; } return tOndes; };
const quatre = (o, dst) => { for (let i = 0; i < 4; i++) { dst[i * 4] = o[i][0]; dst[i * 4 + 1] = o[i][1]; dst[i * 4 + 2] = o[i][2]; dst[i * 4 + 3] = o[i][3]; } return dst; };
function matricePerspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov * Math.PI / 360), n = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * n, -1, 0, 0, 2 * far * near * n, 0]);
}

/* Crée l'entité réseau ; renvoie null si le navigateur ne sait pas (WebGL2 et rendu en demi-flottants requis). */
/* Génère le nuage hors du fil principal (Worker) ; repli sur le fil principal si le Worker est impossible. */
function genererNuage() {
  return new Promise(resolve => {
    const direct = () => { const t0 = performance.now(); const r = genererReseau(); resolve({ reseau: r, donnees: preparerDonnees(r), ms: Math.round(performance.now() - t0), worker: false }); };
    let w;
    try { w = new Worker(new URL('./generation-worker.js', import.meta.url), { type: 'module' }); } catch (e) { direct(); return; }
    const t0 = performance.now();
    w.onmessage = e => { w.terminate(); if (e.data.erreur) { direct(); return; } const d = e.data; resolve({ reseau: { N: d.N, pos: d.pos, poids: d.poids, hub: d.hub, maxParArete: d.maxParArete }, donnees: d.donnees, ms: Math.round(performance.now() - t0), worker: true }); };
    w.onerror = () => { w.terminate(); direct(); };
    w.postMessage({});
  });
}

export async function creerEntiteReseau() {
  const test = document.createElement('canvas').getContext('webgl2');
  if (!test || !(test.getExtension('EXT_color_buffer_float') || test.getExtension('EXT_color_buffer_half_float'))) return null;
  test.getExtension('WEBGL_lose_context')?.loseContext();

  const nuage = await genererNuage();
  const reseau = nuage.reseau, donnees = nuage.donnees, tempsGeneration = nuage.ms;
  const machine = creerEtat(R_SOLEIL), v = machine.v;
  const calmeMq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  machine.calme(!!(calmeMq && calmeMq.matches));
  if (calmeMq && calmeMq.addEventListener) calmeMq.addEventListener('change', e => machine.calme(e.matches));

  let hote = null, canvas = null, gl = null, ro = null, rafId = 0, niveau = 0, cote = 0, dpr = 1, nbNeurones = 0, nbSegments = 0;
  let etatNom = 'idle', verrouille = false, deverrouille = false, alerteJusqua = 0, etatApplique = '';
  const tactile = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
  let detecte = 0, origine = 'auto', tMonte = 0, tRedim = 0, tPrec = 0, tDebut = 0, dernierDessin = 0, fpsAff = 60, surveillance = null, perdu = false;
  let P = null;   // programmes, tampons et cibles GL

  /* ───── utilitaires GL ───── */
  const compiler = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader'); return s; };
  function programme(vs, fs) {
    const p = gl.createProgram(); gl.attachShader(p, compiler(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compiler(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'liaison');
    const loc = {}; const get = n => (n in loc ? loc[n] : (loc[n] = gl.getUniformLocation(p, n)));
    return { p, u: get };
  }
  function cible(w, h) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }
  function tampon(tab, nom, prog, taille = 1) {
    const l = gl.getAttribLocation(prog.p, nom); if (l < 0) return;
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, tab, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, taille, gl.FLOAT, false, 0, 0);
  }

  function initGL() {
    gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 indisponible');
    gl.getExtension('EXT_color_buffer_float'); gl.getExtension('EXT_color_buffer_half_float');
    const vide = gl.createVertexArray();
    const noeuds = programme(ENTETE_VS + MATRICES + VERT_NOEUDS, ENTETE_FS + FRAG_NOEUDS);
    const liens = programme(ENTETE_VS + MATRICES + VERT_LIENS, ENTETE_FS + FRAG_LIENS);
    const vaoN = gl.createVertexArray(); gl.bindVertexArray(vaoN);
    tampon(reseau.pos, 'position', noeuds, 3); tampon(reseau.poids, 'aPoids', noeuds); tampon(donnees.graine, 'aGraine', noeuds); tampon(reseau.hub, 'aHub', noeuds);
    const vaoL = gl.createVertexArray(); gl.bindVertexArray(vaoL);
    tampon(donnees.pL, 'position', liens, 3);
    for (const [n, t] of [['aU', donnees.aU], ['aPh', donnees.aPh], ['aV', donnees.aV], ['aW', donnees.aW], ['aGr', donnees.aGr], ['aRad', donnees.aRad]]) tampon(t, n, liens);
    gl.bindVertexArray(null);
    const mv = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -DIST, 1]);
    P = {
      noeuds, liens, vaoN, vaoL, vide, mv, proj: matricePerspective(FOV, 1, 0.1, 3000),
      halo: programme(VS_HALO, FS_HALO), haute: programme(PLEIN_ECRAN, FS_HAUTE), flou: programme(PLEIN_ECRAN, FS_FLOU),
      compose: programme(PLEIN_ECRAN, FS_COMPOSE), ajout: programme(PLEIN_ECRAN, FS_AJOUT), sortie: programme(PLEIN_ECRAN, FS_SORTIE),
      scene: null, clair: null, horiz: [], vert: []
    };
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);   // AdditiveBlending de Three.js
  }
  function cibles() {
    const s = canvas.width, lib = c => { if (c) { gl.deleteTexture(c.tex); gl.deleteFramebuffer(c.fbo); } };
    lib(P.scene); lib(P.clair); P.horiz.forEach(lib); P.vert.forEach(lib); P.horiz = []; P.vert = [];
    P.scene = cible(s, s);
    if (NIVEAUX[niveau].bloom) {
      let r = Math.round(s / 2); P.clair = cible(r, r);
      for (let i = 0; i < 5; i++) { P.horiz.push(cible(r, r)); P.vert.push(cible(r, r)); r = Math.max(1, Math.round(r / 2)); }
    } else P.clair = null;
  }

  /* ───── niveaux et taille ───── */
  function appliquerNiveau(n) {
    niveau = Math.max(0, Math.min(NIVEAUX.length - 1, n));
    const cfg = NIVEAUX[niveau];
    nbNeurones = Math.min(reseau.N, cfg.nuee); nbSegments = aretesPour(reseau, nbNeurones) * 2;
    machine.riche(cfg.riche); machine.vie(cfg.vie == null ? 1 : cfg.vie);
    dpr = Math.min(window.devicePixelRatio || 1, cfg.dpr);
    cote = 0; redimensionner(true);
    surveillance = surveillerFps({ seuil: 45, mesures: 5, fenetreMs: 2000, baisser: () => baisser() });   // 10 s de suite sous 45 i/s
  }
  function baisser() {
    const q = lire(CLE_Q); if (q != null && q !== 'auto') return;   // mode choisi dans les réglages : jamais touché
    if (performance.now() - tMonte < 8000) return;                   // pas pendant le démarrage (chargement, séquence de démarrage)
    // Allègement automatique valable pour cette visite seulement : rien n'est mémorisé, donc un PC fort ne reste pas coincé en léger
    // parce qu'un jeu ou une vidéo occupait la carte graphique un jour.
    if (niveau < NIVEAUX.length - 1) { origine = 'allege'; appliquerNiveau(niveau + 1); }
    else if (api.surRepli) api.surRepli();   // déjà au plus léger : l'ancien dessin 2D prend le relais
  }
  function redimensionner(force) {
    if (!hote || !canvas || !gl) return;
    const w = Math.max(1, Math.round(hote.clientWidth)), h = Math.max(1, Math.round(hote.clientHeight));
    const c = Math.max(1, Math.min(w, h));
    if (!force && c === cote) return;
    cote = c;
    canvas.style.width = c + 'px'; canvas.style.height = c + 'px';   // tout de suite : le navigateur étire l'ancienne image pendant que l'entité change de taille
    const appliquer = () => { canvas.width = Math.max(2, Math.round(c * dpr)); canvas.height = canvas.width; cibles(); };
    clearTimeout(tRedim);
    if (force) appliquer(); else tRedim = setTimeout(appliquer, 140);   // pas de réallocation des cibles à chaque image pendant l'animation de taille
  }

  /* ───── dessin ───── */
  function poser(prog, lin) {
    const { u } = prog;
    gl.uniformMatrix4fv(u('modelViewMatrix'), false, P.mv); gl.uniformMatrix4fv(u('projectionMatrix'), false, P.proj);
    for (const [n, x] of [['uTemps', v.temps], ['uDerive', v.derive], ['uEchelle', v.echelle], ['uTour', v.tour], ['uAmp', v.amp], ['uFlash', v.flash], ['uFront', v.front],
      ['uLum', v.lum], ['uVitesse', v.vitesse], ['uImpulsions', v.impulsions], ['uVieIndiv', v.vieIndiv], ['uVieDerive', v.vieDerive], ['uVieFils', v.vieFils], ['uVieNais', v.vieNais], ['uSerre', v.serre], ['uTourb', v.tourb], ['uSecousse', v.secousse], ['uForme', v.forme], ['uEtincelles', v.etincelles], ['uPulse', v.pulse], ['uPx', dpr], ['uTaille', TAILLE_POINT * cote / HAUTEUR_REF]]) { const l = u(n); if (l) gl.uniform1f(l, x); }
    gl.uniform3fv(u('uC1'), lin3(v.c, tC1)); gl.uniform3fv(u('uC2'), lin3(v.d, tC2));
    const lf = u('uFlashCol'); if (lf) gl.uniform3fv(lf, lin3(v.flashCol, tFl));
    const lc = u('uCasCol'); if (lc) gl.uniform3fv(lc, lin3(v.cascCol, tCc));
    const lA = u('uCasA'); if (lA) gl.uniform4fv(lA, quatre(v.casA, tCasA));
    const lB = u('uCasB'); if (lB) gl.uniform4fv(lB, quatre(v.casB, tCasB));
    const lp = u('uPointeur'); if (lp) gl.uniform3f(lp, v.pointeur[0], v.pointeur[1], v.pointeur[2]);
    const li = u('uIncl'); if (li) gl.uniform2f(li, v.incl[0], v.incl[1]);
    const lo = u('uOndes'); if (lo) gl.uniform3fv(lo, ondesPlat(v.ondes));
  }
  function plein(prog, tex, unite = 0) { gl.useProgram(prog.p); gl.activeTexture(gl.TEXTURE0 + unite); gl.bindTexture(gl.TEXTURE_2D, tex); }
  function passe(c) { gl.bindFramebuffer(gl.FRAMEBUFFER, c ? c.fbo : null); gl.viewport(0, 0, c ? c.w : canvas.width, c ? c.h : canvas.height); }
  function triangle() { gl.bindVertexArray(P.vide); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  function bloom() {
    const cfg = NIVEAUX[niveau];
    gl.disable(gl.BLEND);
    passe(P.clair); plein(P.haute, P.scene.tex); gl.uniform1i(P.haute.u('tDiffuse'), 0); gl.uniform1f(P.haute.u('uSeuil'), 1.05); gl.uniform1f(P.haute.u('uLarge'), 0.01); triangle();
    const rayons = [3, 5, 7, 9, 11]; let entree = P.clair;
    for (let i = 0; i < 5; i++) {
      const K = rayons[i], coef = new Float32Array(11); for (let j = 0; j < K; j++) coef[j] = 0.39894 * Math.exp(-0.5 * j * j / (K * K)) / K;
      for (const [sortie, dir, src] of [[P.horiz[i], [1, 0], entree], [P.vert[i], [0, 1], P.horiz[i]]]) {
        passe(sortie); plein(P.flou, src.tex); gl.uniform1i(P.flou.u('colorTexture'), 0);
        gl.uniform2f(P.flou.u('invSize'), 1 / sortie.w, 1 / sortie.h); gl.uniform2f(P.flou.u('direction'), dir[0], dir[1]);
        gl.uniform1fv(P.flou.u('gaussianCoefficients'), coef); gl.uniform1i(P.flou.u('uK'), K); triangle();
      }
      entree = P.vert[i];
    }
    passe(P.horiz[0]); gl.useProgram(P.compose.p);
    for (let i = 0; i < 5; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, P.vert[i].tex); gl.uniform1i(P.compose.u('blurTexture' + (i + 1)), i); }
    gl.uniform1f(P.compose.u('bloomStrength'), cfg.force); gl.uniform1f(P.compose.u('bloomRadius'), 0.7); triangle();
    gl.enable(gl.BLEND); passe(P.scene); plein(P.ajout, P.horiz[0].tex); gl.uniform1i(P.ajout.u('tDiffuse'), 0); triangle();   // ajout additif (alpha = force du bloom, comme UnrealBloomPass)
  }
  function dessiner() {
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND);
    passe(P.scene); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(P.liens.p); poser(P.liens); gl.bindVertexArray(P.vaoL); gl.drawArrays(gl.LINES, 0, nbSegments);
    gl.useProgram(P.noeuds.p); poser(P.noeuds); gl.bindVertexArray(P.vaoN); gl.drawArrays(gl.POINTS, 0, nbNeurones);
    gl.useProgram(P.halo.p);   // cœur lumineux puis halo très doux, centrés sur l'entité
    gl.uniformMatrix4fv(P.halo.u('modelViewMatrix'), false, P.mv); gl.uniformMatrix4fv(P.halo.u('projectionMatrix'), false, P.proj);
    gl.uniform3fv(P.halo.u('uCouleur'), lin3(v.c, tC1)); gl.bindVertexArray(P.vide);
    gl.uniform1f(P.halo.u('uEchelleSprite'), R_SOLEIL * 1.15); gl.uniform1f(P.halo.u('uOpacite'), v.coeurOpacite); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.uniform1f(P.halo.u('uEchelleSprite'), R_SOLEIL * 3.2); gl.uniform1f(P.halo.u('uOpacite'), v.haloOpacite); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (NIVEAUX[niveau].bloom) bloom();
    gl.disable(gl.BLEND); passe(null); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    plein(P.sortie, P.scene.tex); gl.uniform1i(P.sortie.u('tDiffuse'), 0); gl.uniform1f(P.sortie.u('toneMappingExposure'), 1.05); triangle();
  }

  /* ───── boucle ───── */
  function nomEffectif() {
    if (verrouille) return 'verrouille';
    if (performance.now() < alerteJusqua) return 'alerte';
    if (deverrouille && (etatNom === 'idle' || etatNom === 'veille')) return 'deverrouille';
    return etatNom;
  }
  function boucle(now) {
    rafId = requestAnimationFrame(boucle);
    if (!canvas || !gl || perdu || document.hidden) { tPrec = now; return; }   // onglet caché : pause
    if (!hote || (!hote.offsetParent && getComputedStyle(hote).position !== 'fixed')) { tPrec = now; return; }   // caché (vue terminal, galaxie…)
    const derriere = document.body.classList.contains('vue-galaxie');   // la galaxie recouvre l'accueil : on ne dessine plus, mais la voix continue de faire vibrer le soleil (amplitude)
    // Cadence : tactile (batterie) = 60 i/s au plus ; souris = autant que l'écran (sinon, sur un écran 144 Hz, une image sur deux seulement : ~70 i/s)
    const cadence = derriere ? 20 : (tactile ? NIVEAUX[niveau].fps : 0);
    if (cadence && now - dernierDessin < 1000 / cadence - 3) return;
    dernierDessin = now;
    const dt = Math.min(0.1, (now - (tPrec || now)) / 1000); tPrec = now;
    const nom = nomEffectif(); if (nom !== etatApplique) { etatApplique = nom; machine.etat(nom); }
    machine.maj((now - tDebut) / 1000, dt);
    if (derriere) return;
    dessiner();
    surveillance.image(); fpsAff = Math.round(surveillance.fps);
  }

  /* Regard et clic : l'entité s'incline vers le curseur ou le doigt, une onde part du cœur à chaque clic ou toucher. */
  let curseurSuivi = false; const dernierPointeur = { x: 0, y: 0 };
  function suivreCurseur() {
    if (curseurSuivi) return; curseurSuivi = true;
    const place = e => {
      if (!hote || document.hidden || !hote.offsetParent) return;
      const r = hote.getBoundingClientRect(), s = Math.max(240, Math.min(window.innerWidth, window.innerHeight) * 0.5);
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      machine.regard(dx / s, dy / s);
      const u = Math.max(120, r.width * 0.315);   // 1 unité du nuage ≈ 0,315 × la largeur du réacteur à l'écran
      machine.pointeur(dx / u, dy / u); dernierPointeur.x = dx / u; dernierPointeur.y = dy / u;
    };
    window.addEventListener('pointermove', place, { passive: true });
    window.addEventListener('pointerdown', e => {
      if (!hote || !hote.offsetParent) return;
      place(e);
      if (hote.contains(e.target)) { machine.onde(1, 1.7); machine.clic(dernierPointeur.x, dernierPointeur.y); }   // clic ou toucher sur l'entité : une vague du cœur et une cascade depuis le point touché
    }, { passive: true });
  }

  function environnement() {
    let gpu = ''; try { const e = gl.getExtension('WEBGL_debug_renderer_info'); if (e) gpu = String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL) || ''); } catch (err) {}
    const tact = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
    return { largeur: largeurAppareil({ largeurFenetre: window.innerWidth, hauteurFenetre: window.innerHeight, largeurEcran: (window.screen && screen.width) || 0, tactile: tact }), tactile: tact, memoire: navigator.deviceMemory == null ? null : navigator.deviceMemory, coeurs: navigator.hardwareConcurrency || 4, gpu };
  }

  /* ───── API ───── */
  const api = {
    surRepli: null,
    actif: () => !!gl && !perdu,
    monter(el) {
      if (!el) return;
      hote = el;
      if (!canvas) {
        canvas = document.createElement('canvas'); canvas.className = 'entite-canvas'; canvas.setAttribute('aria-hidden', 'true');
        canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); perdu = true; if (api.surRepli) api.surRepli(); }, false);
        initGL(); tDebut = performance.now();
        const q = lire(CLE_Q);
        try { localStorage.removeItem(CLE_N); } catch (e) {}   // ancien réglage : un allègement automatique ne se mémorise plus
        let depart; tMonte = performance.now();
        if (q != null && q !== 'auto' && !isNaN(+q)) { depart = Math.min(2, +q); origine = 'choisi'; }
        else { depart = modeEffectif('auto', environnement()); origine = 'auto'; }
        detecte = depart;
        appliquerNiveau(depart);
      }
      hote.insertBefore(canvas, hote.firstChild);
      suivreCurseur();
      if (ro) ro.disconnect();
      if ('ResizeObserver' in window) { ro = new ResizeObserver(() => redimensionner(false)); ro.observe(hote); }
      redimensionner(true);
      if (!rafId) rafId = requestAnimationFrame(boucle);
    },
    demonter() { if (rafId) cancelAnimationFrame(rafId); rafId = 0; if (ro) ro.disconnect(); if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas); },
    etat(nom) { etatNom = nom && (nom in { idle: 1, veille: 1, listening: 1, thinking: 1, speaking: 1 }) ? nom : 'idle'; },
    verrou(b) { verrouille = !!b; },
    deverrouille(b) { deverrouille = !!b; },
    alerte(ms) { alerteJusqua = performance.now() + (ms || 6000); },
    amplitude(fn) { machine.amplitude(fn); },
    onde(force, vitesse) { machine.onde(force, vitesse); },
    cascade(...a) { return machine.cascade(...a); },
    naissance(duree) { machine.naitre(duree); },
    vie(n) { machine.vie(n); },
    fixer() { const nom = nomEffectif(); etatApplique = nom; machine.etat(nom); machine.fixer(); },
    qualite(q) {
      if (q === 'auto' || q == null) { ecrire(CLE_Q, 'auto'); try { localStorage.removeItem(CLE_N); } catch (e) {} return; }
      ecrire(CLE_Q, String(q)); if (canvas && +q <= 2) { origine = 'choisi'; appliquerNiveau(+q); }
    },
    environnement,
    modeAuto() {
      ecrire(CLE_Q, 'auto'); try { localStorage.removeItem(CLE_N); } catch (e) {}
      origine = 'auto'; detecte = modeEffectif('auto', environnement());
      if (canvas) appliquerNiveau(detecte);
    },
    info: () => ({ niveau, mode: NIVEAUX[niveau].nom, origine, detecte: NIVEAUX[detecte].nom, calme: machine.calmeActif, worker: nuage.worker, points: nbNeurones, moteur: 'reseau', fps: fpsAff, amp: +v.amp.toFixed(2), etat: etatNom, bloom: NIVEAUX[niveau].bloom, generation: Math.round(tempsGeneration), c: v.c.map(x => +x.toFixed(2)), d: v.d.map(x => +x.toFixed(2)), flash: +v.flash.toFixed(2), lum: +v.lum.toFixed(2),
      vie: { casc: v.casA.filter((a, i) => v.casB[i][1] > 0 && v.temps - a[3] < Math.min(4, 1.8 / Math.max(0.3, v.casB[i][0]) + 3 * v.casB[i][3])).length, indiv: v.vieIndiv, derive: v.vieDerive, fils: v.vieFils, nais: v.vieNais, pointeur: +v.pointeur[2].toFixed(2), etincelles: +v.etincelles.toFixed(2), serre: +v.serre.toFixed(2), tourb: +v.tourb.toFixed(2), pulse: +v.pulse.toFixed(2), secousse: +v.secousse.toFixed(2), forme: +v.forme.toFixed(2), incl: v.incl.map(x => +x.toFixed(3)), flashCol: v.flashCol.map(x => +x.toFixed(2)), ondes: v.ondes.filter(o => o[1] > 0 && v.temps - o[0] < 2.6).length } }),
    /* Pour les tests et le diagnostic : l'état courant de la machine (couleurs, flash, amplitude). */
    machine
  };
  return api;
}
