// La Terre, la Lune et le Soleil du thème Espace (rendu réaliste).
// creerTerre(ctx) → { groupe, terre, lune, soleil, uniforms, maj(dt, t, ts, camera), latLon(v3), position(lat, lon, r), pointe(raycaster), qualite(q), detruire(), ... }
//   • Terre : textures NASA jour / nuit (lumières des villes) / relief, nuages animés avec ombres portées, océans réfléchissants (reflet spéculaire du Soleil),
//     terminateur jour/nuit doux avec lueur crépusculaire, halo atmosphérique, aurores polaires, éclairs d'orage côté nuit, frontières et surbrillance de zone (calques).
//   • Lune : vraie position et vraie distance (astro.luneEq), phases par l'éclairage du vrai Soleil, face visible tournée vers la Terre, éclipses de Soleil (ombre de la
//     Lune sur la Terre) et de Lune (ombre de la Terre sur la Lune, teinte cuivrée) calculées par géométrie de cône (rayon angulaire du Soleil : 0,2666°).
//   • Soleil : disque, couronne, éclat (lens flare). Distances en rayons terrestres (R⊕ = 1) : Lune ≈ 60 R⊕ (réelle), Soleil placé à 400 (taille apparente réelle 0,53°).
import { prochaineEclipse as chercherEclipse } from './eclipses.js?v=2026.10.15.6';
const K_SOLEIL = 0.004653;                 // tan(0,2666°) : demi-angle apparent du Soleil
const R_LUNE = 0.2727;                     // rayon de la Lune en R⊕
const D_SOLEIL = 400;                      // distance de dessin du Soleil
const RAD = Math.PI / 180;

const VS_TERRE = `
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main(){ vUv=uv; vec4 wp=modelMatrix*vec4(position,1.); vP=wp.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*wp; }`;

// partie commune : ombre d'un disque (cône) projetée par un occulteur le long de la direction du Soleil
const GLSL_OMBRE = `
float ombreCone(vec3 P, vec3 sun, vec3 C, float R, float minU){
  vec3 m=C-P; float t=dot(m,sun); if(t<=0.) return 1.;
  float dd=length(m-t*sun);
  float ru=max(minU,R-t*${K_SOLEIL.toFixed(6)}), rp=R+t*${K_SOLEIL.toFixed(6)};
  return smoothstep(ru,rp,dd);
}`;

const FS_TERRE = `
precision highp float;
uniform sampler2D uDay,uNight,uSpec,uNorm,uClouds,uBord,uHL;
uniform vec3 uSun,uCam,uMoonP; uniform float uMoonR,uTime,uBordA,uBumpK,uHLk,uHLoc,uCloudOff,uCityK,uSpecK;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
${GLSL_OMBRE}
vec3 pert(vec3 N,vec3 p,vec2 uv,vec3 m){
  vec3 q0=dFdx(p),q1=dFdy(p); vec2 s0=dFdx(uv),s1=dFdy(uv);
  vec3 S=normalize(q0*s1.t-q1*s0.t); vec3 T=normalize(-q0*s1.s+q1*s0.s);
  return normalize(mat3(S,T,N)*m);
}
void main(){
  vec3 Ng=normalize(vN); vec3 V=normalize(uCam-vP); vec3 N=Ng;
  #ifdef RELIEF
  vec3 mn=texture2D(uNorm,vUv).xyz*2.-1.; mn.xy*=uBumpK; mn=normalize(mn); N=pert(Ng,vP,vUv,mn);
  #endif
  float ngl=dot(Ng,uSun);
  float eclipse=ombreCone(vP,uSun,uMoonP,uMoonR,0.012);
  float jour=smoothstep(-.09,.14,ngl);
  float nl=max(dot(N,uSun),0.)*smoothstep(-.02,.12,ngl);
  vec3 day=texture2D(uDay,vUv).rgb;
  float oc=texture2D(uSpec,vUv).r;
  float cl=texture2D(uClouds,vUv+vec2(uCloudOff,0.)).r;
  vec2 duv=vec2(-uSun.x,uSun.y)*.0025; float clOmbre=texture2D(uClouds,vUv+vec2(uCloudOff,0.)+duv*3.).r;
  float lum=nl*eclipse;
  vec3 col=day*(lum*1.18)*(1.-.42*clOmbre*smoothstep(0.,.35,nl));
  // océans : reflet du Soleil (lobe fin + halo), reflet de ciel de Fresnel
  vec3 H=normalize(uSun+V); float nh=max(dot(Ng,H),0.);
  float glint=(pow(nh,260.)*1.7+pow(nh,40.)*.07)*oc*jour*(1.-.85*cl)*eclipse*uSpecK;
  float fr=pow(1.-max(dot(Ng,V),0.),4.);
  col+=vec3(1.,.93,.82)*glint;
  col+=vec3(.05,.13,.30)*fr*oc*jour*.5*eclipse;
  // ciel : voile bleu au limbe côté jour
  float rim=pow(1.-max(dot(Ng,V),0.),2.6);
  col+=vec3(.20,.44,1.)*rim*(jour*.75+.02)*eclipse*.65;
  // crépuscule : lueur orangée sur le terminateur
  float tw=exp(-pow((ngl-.02)*8.5,2.));
  col=mix(col,col*vec3(1.35,.78,.5)+vec3(.05,.015,0.)*tw,tw*.55*eclipse);
  col+=vec3(1.,.42,.14)*tw*.09*rim*eclipse;
  // nuit : lumières des villes (masquées par les nuages), lueur très faible du sol
  float nuit=1.-smoothstep(-.16,.03,ngl);
  vec3 v=texture2D(uNight,vUv).rgb;
  col+=v*vec3(1.25,.95,.6)*nuit*uCityK*(1.-.7*cl);
  col+=day*.006*nuit;
  // frontières et zone surlignée
  vec4 h=texture2D(uHL,vUv); h.a*=mix(1.,smoothstep(.25,.75,oc),uHLoc);
  float pulse=.78+.22*sin(uTime*2.4);
  col=mix(col,col*(vec3(.35)+h.rgb*1.55)+h.rgb*(.10*pulse*(.4+.6*jour)+.30*uHLoc),h.a*uHLk*mix(1.,.7,uHLoc));
  gl_FragColor=vec4(col,1.);
  #include <colorspace_fragment>
}`;

const FS_NUAGES = `
precision highp float;
uniform sampler2D uC; uniform vec3 uSun,uMoonP; uniform float uMoonR,uOpa;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
${GLSL_OMBRE}
void main(){
  vec3 N=normalize(vN); float c=texture2D(uC,vUv).r;
  c=smoothstep(.12,.92,c)*uOpa;
  float ngl=dot(N,uSun); float l=smoothstep(-.12,.18,ngl)*(.18+.9*max(ngl,0.));
  float ec=ombreCone(vP,uSun,uMoonP,uMoonR,0.012);
  float tw=exp(-pow((ngl-.01)*8.,2.));
  vec3 col=vec3(.96,.97,1.)*(l*ec)+vec3(1.,.5,.25)*tw*.35*c+vec3(.012,.015,.025);
  gl_FragColor=vec4(col,c);
  #include <colorspace_fragment>
}`;

const FS_ATMO = `
precision highp float;
uniform vec3 uSun,uCam;
varying vec3 vN; varying vec3 vP;
void main(){
  vec3 N=normalize(vN); vec3 V=normalize(uCam-vP);
  float a=pow(max(dot(-N,V)*.5+.5,0.),1.)*0.; // inutilisé
  float rim=1.-abs(dot(N,V));
  float ngl=dot(normalize(vP),uSun);
  float jour=smoothstep(-.35,.45,ngl);
  float halo=pow(clamp(rim,0.,1.),2.2);
  float tw=exp(-pow((ngl-.04)*4.2,2.));
  vec3 bleu=vec3(.30,.56,1.), orange=vec3(1.,.48,.16);
  float fwd=pow(max(dot(-V,uSun),0.),5.);                    // on regarde vers le Soleil : diffusion vers l'avant
  vec3 col=mix(bleu,orange,tw*.75)*halo*(jour*1.15+.03)+vec3(1.,.66,.34)*halo*fwd*1.9*(.35+.65*smoothstep(-.5,.3,ngl));
  gl_FragColor=vec4(col,min(1.,halo*(jour*.9+.04+fwd*.9)));
  #include <colorspace_fragment>
}`;

const FS_LUNE = `
precision highp float;
uniform sampler2D uTex; uniform vec3 uSun,uCam,uTerreP; uniform float uTerreR;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
${GLSL_OMBRE}
void main(){
  vec3 N=normalize(vN); vec3 alb=texture2D(uTex,vUv).rgb*1.05;
  float nl=max(dot(N,uSun),0.);
  float e=ombreCone(vP,uSun,uTerreP,uTerreR,0.0);          // 0 : dans l'ombre de la Terre, 1 : au Soleil
  float profond=1.-smoothstep(0.,.55,e);
  vec3 cuivre=vec3(.50,.14,.05)*.16*profond;                 // lumière rougie par l'atmosphère terrestre pendant une éclipse totale
  vec3 terreshine=vec3(.060,.072,.095)*(.55+.45*dot(N,normalize(uTerreP-vP)));   // lumière cendrée : la Terre éclaire la face nocturne
  vec3 col=alb*(nl*(.15+.85*e)*1.35)+alb*cuivre*smoothstep(0.,.35,nl+.25)+alb*terreshine*(1.-nl*.8)*.7+alb*.003;
  gl_FragColor=vec4(col,1.);
  #include <colorspace_fragment>
}`;

const FS_AURORE = `
precision highp float;
uniform float uT; uniform vec3 uSun; uniform float uK;
varying vec2 vUv; varying vec3 vP;
float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
void main(){
  float a=vUv.x*62.83, y=vUv.y;
  float riders=n(vec2(a*.35+uT*.12,uT*.05))*.65+n(vec2(a*1.1-uT*.2,y*2.))*.35;
  float rideau=.30+.70*smoothstep(.18,.85,riders);
  float rayons=.55+.45*n(vec2(a*3.2,uT*.6));
  float bas=smoothstep(0.,.14,y), haut=pow(1.-y,1.6);
  float nuit=1.-smoothstep(-.1,.18,dot(normalize(vP),uSun));
  float I=rideau*(.55+.45*rayons)*bas*haut*nuit*uK*1.7;
  vec3 vert=vec3(.15,1.,.45), pourpre=vec3(.65,.2,.95), rouge=vec3(1.,.18,.3);
  vec3 col=mix(vert,pourpre,smoothstep(.45,.9,y))+rouge*smoothstep(.82,1.,y)*.4;
  gl_FragColor=vec4(col*I*1.6,I);
}`;

// textures procédurales petites (halo du Soleil, éclair)
function texRadiale(THREE, taille, etapes) {
  const c = document.createElement('canvas'); c.width = c.height = taille; const g = c.getContext('2d'), r = taille / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r); for (const [p, col] of etapes) gr.addColorStop(p, col);
  g.fillStyle = gr; g.fillRect(0, 0, taille, taille); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export async function creerTerre(ctx) {
  const { THREE, noyau, q } = ctx;
  const A = window.RayleUI && window.RayleUI.astro;
  if (!A) throw new Error('astro.js non chargé');
  const groupe = new THREE.Group(); groupe.name = 'terre-lune-soleil';
  const vec = (x, y, z) => new THREE.Vector3(x, y, z);
  const U = {
    uSun: { value: vec(1, 0, 0) }, uCam: { value: vec(0, 0, 4) }, uMoonP: { value: vec(60, 0, 0) }, uMoonR: { value: R_LUNE },
    uTime: { value: 0 }, uBordA: { value: 0 }, uBumpK: { value: 1.3 }, uHLk: { value: 0 }, uHLoc: { value: 0 }, uCloudOff: { value: 0 }, uCityK: { value: 1.6 }, uSpecK: { value: 1 },
  };
  const libres = [];                                // tout ce qu'il faut libérer
  const vide = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); vide.needsUpdate = true;

  /* ───── Terre ───── */
  const terre = new THREE.Group(); groupe.add(terre);
  const matTerre = new THREE.ShaderMaterial({
    uniforms: Object.assign({ uDay: { value: vide }, uNight: { value: vide }, uSpec: { value: vide }, uNorm: { value: vide }, uClouds: { value: vide }, uBord: { value: vide }, uHL: { value: vide } }, U),
    vertexShader: VS_TERRE, fragmentShader: FS_TERRE, defines: q.relief ? { RELIEF: 1 } : {},
  });
  const geoTerre = new THREE.SphereGeometry(1, q.segs, q.segs / 2); const sphere = new THREE.Mesh(geoTerre, matTerre); terre.add(sphere);
  const matNuages = new THREE.ShaderMaterial({ uniforms: { uC: { value: vide }, uSun: U.uSun, uMoonP: U.uMoonP, uMoonR: U.uMoonR, uOpa: { value: .95 } }, vertexShader: VS_TERRE, fragmentShader: FS_NUAGES, transparent: true, depthWrite: false });
  const nuages = new THREE.Mesh(new THREE.SphereGeometry(1.0075, Math.max(48, q.segs * .75 | 0), Math.max(24, q.segs * .375 | 0)), matNuages); nuages.renderOrder = 2; terre.add(nuages);
  nuages.visible = !!q.nuages;
  const matAtmo = new THREE.ShaderMaterial({ uniforms: { uSun: U.uSun, uCam: U.uCam }, vertexShader: VS_TERRE, fragmentShader: FS_ATMO, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.075, 64, 32), matAtmo); atmo.renderOrder = 3; groupe.add(atmo);   // hors du groupe « terre » : ne tourne pas

  // textures : 2048 tout de suite (affichage immédiat), puis la définition choisie (4096 / 8192) en arrière-plan
  const T = noyau.texture;
  const [jour2, nuit2, cl, oc] = await Promise.all([T('terre-jour-2048.jpg'), T('terre-nuit-2048.jpg'), T('nuages-2048.jpg', { srgb: false }), T('espace/terre-ocean-1k.webp', { srgb: false })]);
  matTerre.uniforms.uDay.value = jour2; matTerre.uniforms.uNight.value = nuit2; matTerre.uniforms.uSpec.value = oc; matNuages.uniforms.uC.value = cl; matTerre.uniforms.uClouds.value = cl;
  T('espace/terre-relief-2k.webp', { srgb: false }).then(t => { matTerre.uniforms.uNorm.value = t; }).catch(() => {});
  let defCourante = 2048;
  async function definition(px) {
    px = Math.min(px, ctx.renderer.capabilities.maxTextureSize >= 8192 ? 8192 : 4096);
    if (px <= defCourante) return;
    try {
      const [j, n] = await Promise.all([T('terre-jour-' + px + '.jpg', { aniso: 8 }), T('terre-nuit-' + px + '.jpg', { aniso: 4 })]);
      matTerre.uniforms.uDay.value = j; matTerre.uniforms.uNight.value = n; defCourante = px;
    } catch (e) { console.warn('[terre] définition', px, e && e.message); }
  }
  definition(q.tex === 8192 ? 4096 : q.tex).then(() => { if (q.tex === 8192) setTimeout(() => definition(8192), 1500); });

  /* ───── aurores polaires ───── */
  const aurores = [];
  for (const s of [1, -1]) {
    const lat = 66 * RAD, b = [Math.cos(lat) * 1.008, Math.sin(lat) * 1.008], t = [Math.cos(lat) * 1.11, Math.sin(lat) * 1.11];
    const geo = new THREE.CylinderGeometry(t[0], b[0], t[1] - b[1], 160, 6, true); const m = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSun: U.uSun, uK: { value: 1.25 } }, vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vP=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }', fragmentShader: FS_AURORE, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, m); mesh.position.y = s * (t[1] + b[1]) / 2; if (s < 0) mesh.rotation.x = Math.PI; mesh.renderOrder = 4; groupe.add(mesh); aurores.push(mesh);
  }

  /* ───── éclairs d'orage (face nuit) ───── */
  const texFlash = texRadiale(THREE, 64, [[0, 'rgba(255,255,255,1)'], [.25, 'rgba(190,210,255,.7)'], [1, 'rgba(120,150,255,0)']]);
  const eclairs = []; const nbEcl = q.eclairs ? 14 : 0;
  for (let i = 0; i < nbEcl; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texFlash, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); sp.visible = false; sp.renderOrder = 5; terre.add(sp); eclairs.push({ sp, t: -1, dur: 0, scale: 0 });
  }
  let prochainEclair = 1;
  // foyers d'orage : zones tropicales (Amazonie, Congo, Indonésie, golfe du Mexique, Inde, Pacifique ouest…) : lat, lon, rayon (degrés)
  const ORAGES = [[-3, -62, 14], [0, 22, 12], [-2, 112, 14], [26, -90, 9], [22, 85, 10], [8, 135, 12], [-15, 30, 10], [34, -86, 10], [-25, -55, 9], [14, -20, 8], [5, 100, 8], [-10, 145, 8]];
  const latLonVec = (lat, lon, r = 1) => { const a = lat * RAD, b = lon * RAD; return vec(r * Math.cos(a) * Math.cos(b), r * Math.sin(a), -r * Math.cos(a) * Math.sin(b)); };
  function lancerEclair(sunLocal) {
    const e = eclairs.find(x => x.t < 0); if (!e) return;
    for (let k = 0; k < 8; k++) {
      const [la, lo, r] = ORAGES[Math.random() * ORAGES.length | 0], p = latLonVec(la + (Math.random() - .5) * r * 2, lo + (Math.random() - .5) * r * 2, 1.012);
      if (p.dot(sunLocal) < -.12) { e.sp.position.copy(p); e.t = 0; e.dur = .18 + Math.random() * .35; e.scale = .03 + Math.random() * .05; e.flick = Math.random() * 6.28; e.sp.visible = true; return; }
    }
  }

  /* ───── Lune ───── */
  const lune = new THREE.Mesh(new THREE.SphereGeometry(R_LUNE, 64, 32), new THREE.ShaderMaterial({ uniforms: { uTex: { value: vide }, uSun: U.uSun, uCam: U.uCam, uTerreP: { value: vec(0, 0, 0) }, uTerreR: { value: 1 } }, vertexShader: VS_TERRE, fragmentShader: FS_LUNE }));
  lune.name = 'lune'; groupe.add(lune); lune.visible = true;
  T(q.tex >= 4096 ? 'espace/lune-2k.webp' : 'espace/lune-1k.webp').then(t => { lune.material.uniforms.uTex.value = t; }).catch(() => {});

  /* ───── Soleil ───── */
  const soleil = new THREE.Group(); groupe.add(soleil);
  const disque = new THREE.Mesh(new THREE.SphereGeometry(D_SOLEIL * K_SOLEIL, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.45, 1.1), toneMapped: false })); soleil.add(disque);
  const texHalo = texRadiale(THREE, 256, [[0, 'rgba(255,248,225,1)'], [.08, 'rgba(255,236,180,.85)'], [.25, 'rgba(255,200,120,.32)'], [.6, 'rgba(255,150,70,.07)'], [1, 'rgba(255,120,40,0)']]);
  const halo1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: texHalo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); halo1.scale.setScalar(D_SOLEIL * .075); soleil.add(halo1);
  const halo2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: texHalo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .45 })); halo2.scale.setScalar(D_SOLEIL * .26); soleil.add(halo2);
  halo1.renderOrder = halo2.renderOrder = 6;
  let flare = null;
  async function monterFlare() {
    if (flare || !q.reflets) return;
    try {
      const { Lensflare, LensflareElement } = await import('three/addons/objects/Lensflare.js');
      const cercle = texRadiale(THREE, 128, [[0, 'rgba(255,255,255,.0)'], [.7, 'rgba(255,230,190,.10)'], [.88, 'rgba(255,200,140,.28)'], [1, 'rgba(255,170,100,0)']]);
      const point = texRadiale(THREE, 128, [[0, 'rgba(255,255,255,.7)'], [.3, 'rgba(255,225,170,.35)'], [1, 'rgba(255,190,120,0)']]);
      const hex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + .5; g.lineTo(64 + 58 * Math.cos(a), 64 + 58 * Math.sin(a)); } g.closePath(); g.fillStyle = 'rgba(120,190,255,.16)'; g.fill(); g.strokeStyle = 'rgba(190,230,255,.35)'; g.lineWidth = 2; g.stroke(); return new THREE.CanvasTexture(c); })();
      flare = new Lensflare();
      flare.addElement(new LensflareElement(point, 520, 0, new THREE.Color(1, .93, .8)));
      flare.addElement(new LensflareElement(cercle, 160, .35)); flare.addElement(new LensflareElement(hex, 70, .55)); flare.addElement(new LensflareElement(hex, 110, .72));
      flare.addElement(new LensflareElement(cercle, 240, .9, new THREE.Color(.7, .85, 1))); flare.addElement(new LensflareElement(hex, 60, 1));
      soleil.add(flare);
    } catch (e) { console.warn('[soleil] lens flare indisponible', e && e.message); }
  }
  monterFlare();
  const lumiere = new THREE.DirectionalLight(0xfff2e0, 3); groupe.add(lumiere); groupe.add(lumiere.target);
  const ambiante = new THREE.AmbientLight(0x1a2438, .22); groupe.add(ambiante);

  /* ───── repères Terre–Lune (visibles quand on est loin) : orbite, marqueurs à taille d'écran fixe ───── */
  const orbite = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7fb4ff, transparent: true, opacity: .45, depthWrite: false })); orbite.frustumCulled = false; orbite.visible = false; groupe.add(orbite);
  const texAnneau = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.strokeStyle = 'rgba(190,225,255,.95)'; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 26, 0, 6.2832); g.stroke(); return new THREE.CanvasTexture(c); })();
  const marqueurT = new THREE.Sprite(new THREE.SpriteMaterial({ map: texAnneau, sizeAttenuation: false, depthTest: false, transparent: true, opacity: .9 })), marqueurL = marqueurT.clone(); marqueurL.material = marqueurT.material.clone();
  marqueurT.scale.setScalar(.03); marqueurL.scale.setScalar(.022); marqueurT.visible = marqueurL.visible = false; marqueurT.renderOrder = marqueurL.renderOrder = 9; groupe.add(marqueurT, marqueurL);
  const ptsOrbite = []; for (let i = 0; i < 160; i++) ptsOrbite.push(new THREE.Vector3());
  const cw = new THREE.Vector3();
  function majRepereLune(dCam, camera) {
    camera.getWorldPosition(cw); const dMoon = cw.distanceTo(lune.position), k = Math.max(0, Math.min(1, (Math.min(dCam, dMoon) - 9) / 25));
    marqueurT.visible = dCam > 9; marqueurL.visible = dMoon > 6; orbite.visible = dCam > 9 || dMoon > 6; if (!orbite.visible) return;
    const u = moonDir, tn = A.luneEq(Date.now() + 36e5), nxt = new THREE.Vector3(...A.direction(tn.ra, tn.dec)); // sens de marche approximatif (indépendant du temps accéléré : forme du plan)
    const w = nxt.clone().sub(u.clone().multiplyScalar(nxt.dot(u))).normalize();
    for (let i = 0; i < ptsOrbite.length; i++) { const a = i / ptsOrbite.length * 6.2832; ptsOrbite[i].copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)).multiplyScalar(moonDist); }
    orbite.geometry.setFromPoints(ptsOrbite); orbite.material.opacity = .15 + .35 * k;
    marqueurL.position.copy(lune.position); marqueurT.position.set(0, 0, 0);
  }

  /* ───── état astronomique ───── */
  const sunDir = vec(1, 0, 0), moonDir = vec(0, 0, 1);
  let moonDist = 60.3, gmst = 0;
  function astres(ts) {
    const s = A.soleilEq(ts), l = A.luneEq(ts);
    const sd = A.direction(s.ra, s.dec), md = A.direction(l.ra, l.dec);
    sunDir.set(sd[0], sd[1], sd[2]).normalize(); moonDir.set(md[0], md[1], md[2]).normalize(); moonDist = l.dist; gmst = A.gmst(ts) * RAD;
  }
  astres(Date.now());

  const camLocal = vec(0, 0, 4);
  function maj(dt, t, ts, camera, tSim) {
    astres(ts);
    terre.rotation.y = gmst;
    nuages.rotation.y = t * .0012 + (tSim || 0) * 5e-6;
    U.uCloudOff.value = 0;
    U.uSun.value.copy(sunDir); U.uTime.value = t;
    camera.getWorldPosition(camLocal); U.uCam.value.copy(camLocal);
    // Lune : vraie direction et distance ; face visible vers la Terre
    const mp = moonDir.clone().multiplyScalar(moonDist); lune.position.copy(mp); U.uMoonP.value.copy(mp);
    lune.quaternion.setFromUnitVectors(vec(1, 0, 0), mp.clone().negate().normalize());
    // Soleil : à D_SOLEIL dans la vraie direction, lumière parallèle
    soleil.position.copy(sunDir).multiplyScalar(D_SOLEIL); lumiere.position.copy(sunDir).multiplyScalar(50); lumiere.target.position.set(0, 0, 0);
    const dCam = camLocal.length(); const echelle = Math.max(.6, Math.min(2.2, dCam / 6));
    halo1.scale.setScalar(D_SOLEIL * .06 * echelle); halo2.scale.setScalar(D_SOLEIL * .2 * echelle);
    for (const a of aurores) { a.material.uniforms.uT.value = t; }
    majRepereLune(dCam, camera);
    // frontières : fondu selon la distance (apparaissent en s'approchant), bien visibles de près
    const proche = Math.max(0, Math.min(1, (3.4 - dCam) / 2.0));
    U.uBordA.value = geoBord * (.25 + .75 * proche) * (dCam > 14 ? 0 : 1);   // opacité des frontières (lue par le thème)
    // éclairs : seulement côté nuit, en rafales
    if (nbEcl) {
      prochainEclair -= dt; const lsun = terre.worldToLocal(sunDir.clone().multiplyScalar(10)).normalize();
      if (prochainEclair <= 0) { lancerEclair(lsun); if (Math.random() < .4) lancerEclair(lsun); prochainEclair = .35 + Math.random() * 1.3; }
      for (const e of eclairs) if (e.t >= 0) {
        e.t += dt; const k = e.t / e.dur; if (k >= 1) { e.t = -1; e.sp.visible = false; e.sp.material.opacity = 0; continue; }
        const fl = .55 + .45 * Math.sin(e.t * 55 + e.flick) ** 2; e.sp.material.opacity = (1 - k) * fl; e.sp.scale.setScalar(e.scale * (1 + k * .6));
      }
    }
  }

  /* ───── calques : frontières et zone surlignée (dessinés par geo-calques.js) ───── */
  let geoBord = 1;
  const calqueBord = { tex: null }, calqueHL = { tex: null };
  function poserBord(canvas) { if (calqueBord.tex) calqueBord.tex.dispose(); const t = new THREE.CanvasTexture(canvas); t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; calqueBord.tex = t; matTerre.uniforms.uBord.value = t; }
  function poserHL(canvas) { if (!calqueHL.tex) { calqueHL.tex = new THREE.CanvasTexture(canvas); calqueHL.tex.colorSpace = THREE.SRGBColorSpace; calqueHL.tex.anisotropy = 4; matTerre.uniforms.uHL.value = calqueHL.tex; } calqueHL.tex.image = canvas; calqueHL.tex.needsUpdate = true; }
  function surbrillance(k) { U.uHLk.value = k; }

  /* ───── conversions et visée ───── */
  const _m = new THREE.Matrix4();
  const position = (lat, lon, r = 1) => latLonVec(lat, lon, r).applyMatrix4(terre.matrixWorld);   // point du monde pour (lat, lon) à la rayon r
  function latLon(w) {                                              // point du monde → {lat, lon} sur la Terre
    const l = terre.worldToLocal(w.clone()).normalize();
    return { lat: Math.asin(Math.max(-1, Math.min(1, l.y))) / RAD, lon: Math.atan2(-l.z, l.x) / RAD };
  }
  const ray = new THREE.Raycaster(), sph = new THREE.Sphere(vec(0, 0, 0), 1);
  function pointe(camera, nx, ny) {                                // coordonnées normalisées écran (-1..1) → {lat, lon} ou null
    ray.setFromCamera({ x: nx, y: ny }, camera); const hit = ray.ray.intersectSphere(sph, vec(0, 0, 0)); return hit ? latLon(hit) : null;
  }
  function visible(w, camera) { if (api.masquee) return false; const n = w.clone().normalize(), c = camera.getWorldPosition(vec(0, 0, 0)); return n.dot(c.clone().sub(w).normalize()) > -.02; }

  const prochaineEclipse = (ts0, jours, seul) => chercherEclipse(A, ts0, jours, seul);   // js/univers/espace/eclipses.js

  function poseLunePres() {
    const m = lune.position.clone(), versTerre = m.clone().negate().normalize(), perp = versTerre.clone().cross(new THREE.Vector3(0, 1, 0)); if (perp.lengthSq() < .05) perp.set(1, 0, 0); perp.normalize();
    const pos = m.clone().addScaledVector(versTerre, R_LUNE * 3.1).addScaledVector(perp, R_LUNE * .55).addScaledVector(new THREE.Vector3(0, 1, 0), R_LUNE * .25);
    return { pos, regard: m };
  }
  function qualite(nq) {
    nuages.visible = !!nq.nuages; for (const a of aurores) a.visible = true;
    if (nq.relief !== !!matTerre.defines.RELIEF) { if (nq.relief) matTerre.defines.RELIEF = 1; else delete matTerre.defines.RELIEF; matTerre.needsUpdate = true; }
    if (nq.tex > defCourante) definition(nq.tex);
    if (!nq.reflets && flare) { soleil.remove(flare); flare = null; } else if (nq.reflets) monterFlare();
  }
  function detruire() {
    geoTerre.dispose(); sphere.material.dispose(); nuages.geometry.dispose(); matNuages.dispose(); atmo.geometry.dispose(); matAtmo.dispose();
    for (const a of aurores) { a.geometry.dispose(); a.material.dispose(); } for (const e of eclairs) e.sp.material.dispose();
    lune.geometry.dispose(); lune.material.dispose(); disque.geometry.dispose(); disque.material.dispose(); texHalo.dispose(); texFlash.dispose();
    if (calqueBord.tex) calqueBord.tex.dispose(); if (calqueHL.tex) calqueHL.tex.dispose();
  }
  const api = {
    groupe, terre, lune, soleil, uniforms: U, maj, position, latLon, pointe, visible, qualite, detruire, prochaineEclipse, poserBord, poserHL, surbrillance,
    definition, sunDir, moonDir, moonDist: () => moonDist, etatEclipse: () => null, regler: o => { if (o.bord != null) geoBord = o.bord; if (o.villes != null) U.uCityK.value = o.villes; },
    lumiere, ambiante, nuages, atmo, aurores, poseLunePres, orbite, marqueurT, marqueurL, rLune: R_LUNE,
  };
  return api;
}
