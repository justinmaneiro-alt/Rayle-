// Ciel du thème Bataille navale : dôme à dégradé, Soleil et Lune (avec phase), étoiles qui scintillent la nuit, nuages « dessin animé » à paliers, tempête, brouillard.
// Tout vient de la météo réelle (navale/meteo.js) et de l'astronomie réelle (ui/astro.js) pour le lieu et l'heure. Repère : +x est, +y haut, −z nord.
//   couleursCiel(jour, chaud, orage, brouillard)  couleurs du zénith, de l'horizon et de la brume (pur, testé)
//   altAz(A, ra, dec, lat, lon, ts)               altitude et azimut (degrés) d'un astre (pur, testé)
//   dirDepuisAltAz(alt, az)                       vecteur unitaire du repère de la scène
//   creerCiel(THREE, {q}) → { mesh, lumiere:{soleil, lune, hemi}, maj(dt, t, camera, etat), couleurs, detruire() }
const RAD = Math.PI / 180, lisse = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export function couleursCiel(jour, chaud, orage = 0, brouillard = 0) {
  const zJ = [.22, .52, .93], hJ = [.62, .84, 1], zN = [.01, .02, .09], hN = [.04, .07, .18], hC = [1, .55, .32];
  let z = mix3(zN, zJ, jour), h = mix3(hN, hJ, jour);
  h = mix3(h, hC, chaud * .9 * (1 - Math.abs(jour - .5) * .4)); z = mix3(z, [.30, .22, .55], chaud * .35);
  const gris = [.34, .38, .42]; z = mix3(z, mix3([.02, .03, .05], gris, jour), orage * .85); h = mix3(h, mix3([.04, .05, .07], [.5, .54, .56], jour), orage * .8);
  const brume = mix3(h, mix3([.05, .06, .09], [.78, .8, .82], jour), brouillard * .8);
  return { zenith: z, horizon: mix3(h, brume, brouillard), brume };
}
export function altAz(A, ra, dec, lat, lon, ts) {
  const H = ((A.gmst(ts) + lon - ra) % 360 + 360) % 360 * RAD, phi = lat * RAD, d = dec * RAD;
  const sinAlt = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H), alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(d) * Math.cos(phi)) + Math.PI;            // depuis le nord, vers l'est
  return { alt: alt / RAD, az: ((az / RAD) % 360 + 360) % 360 };
}
export const dirDepuisAltAz = (alt, az) => { const a = alt * RAD, z = az * RAD; return [Math.sin(z) * Math.cos(a), Math.sin(a), -Math.cos(z) * Math.cos(a)]; };

const VS = 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position.z=gl_Position.w*.99999; }';
const FS = `
precision highp float;
varying vec3 vD;
uniform vec3 uSun,uMoon,uZenith,uHorizon,uBrume,uSunCol; uniform float uJour,uChaud,uNuages,uOrage,uBrouillard,uTemps,uPhase,uMoonLum; uniform vec2 uVent; uniform vec3 uMoonToSun;
float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float a=.5,r=0.; for(int i=0;i<5;i++){ r+=a*n2(p); p*=2.03; a*=.5; } return r; }
void main(){
  vec3 d=normalize(vD); float h=clamp(d.y,-.2,1.);
  vec3 col=mix(uHorizon,uZenith,pow(clamp(h,0.,1.),.55));
  col=mix(col,uBrume,smoothstep(.35,0.,h)*(.4+uBrouillard*.6));
  // paliers (dessin animé) : le dégradé du ciel est découpé en 9 bandes douces
  col=floor(col*9.+.5)/9.;
  // Soleil : disque net + halo à anneaux
  float cs=max(dot(d,normalize(uSun)),0.);
  float disque=smoothstep(.99965,.9998,cs); float halo1=smoothstep(.9985,.9992,cs)*.55, halo2=smoothstep(.985,.995,cs)*.3, halo3=pow(cs,6.)*.25;
  float visible=smoothstep(-.1,.08,uSun.y);
  col+=uSunCol*(halo3+halo2+halo1)*visible*(1.-uBrouillard*.5); col=mix(col,uSunCol*1.15,disque*visible*(1.-uOrage*.8));
  // étoiles (nuit) qui scintillent
  float nuit=1.-smoothstep(.0,.55,uJour);
  vec2 su=d.xz/(abs(d.y)+.35)*60.; vec2 ci=floor(su), cf=fract(su);
  float etoile=step(.985,h2(ci)); float tw=.6+.4*sin(uTemps*(1.5+h2(ci+3.)*3.)+h2(ci)*20.);
  float pt=smoothstep(.22,.0,length(cf-.5+(h2(ci+7.)-.5)*.4)); col+=vec3(.9,.95,1.)*etoile*pt*tw*nuit*(1.-uNuages*.8)*step(0.,d.y);
  // Lune : disque avec phase (croissant par décalage de l'ombre), halo doux
  vec3 m=normalize(uMoon); float cm=dot(d,m); float rd=smoothstep(.99955,.9998,cm);
  if(rd>0.){
    vec3 u=normalize(cross(m,vec3(0.,1.,0.))); vec3 v=cross(u,m);
    vec2 p=vec2(dot(d-m*cm,u),dot(d-m*cm,v))/ .0215; float r2=dot(p,p); vec3 nrm=vec3(p,sqrt(max(0.,1.-r2)));
    vec3 l=normalize(vec3(dot(uMoonToSun,u),dot(uMoonToSun,v),dot(uMoonToSun,m)*0.+0.6*(uPhase*2.-1.)));
    float lit=smoothstep(-.03,.03,dot(nrm,normalize(vec3(l.xy,l.z))));
    vec3 mcol=mix(vec3(.12,.14,.2),vec3(1.,.97,.86),lit); mcol=floor(mcol*5.+.5)/5.;
    col=mix(col,mcol,rd*smoothstep(-.1,.06,m.y)*(1.-uOrage*.9));
  }
  col+=vec3(.5,.6,.9)*pow(max(cm,0.),90.)*.35*nuit*uMoonLum*smoothstep(-.1,.06,m.y);
  // nuages en deux tons : lumière / ombre, qui dérivent avec le vent ; l'orage les noircit
  if(d.y>.02){
    vec2 uv=d.xz/(d.y+.28)*1.15+uVent*uTemps*.012;
    float nu=fbm(uv*1.7), cov=uNuages;
    float seuil=1.-cov*.78; float c=smoothstep(seuil-.02,seuil+.02,nu);
    float c2=smoothstep(seuil-.02,seuil+.02,fbm((uv+normalize(uSun.xz+1e-4)*.06)*1.7));             // décalé vers le Soleil : face éclairée
    vec3 clair=mix(vec3(.55,.58,.7),vec3(1.,1.,1.),uJour), sombre=mix(vec3(.18,.2,.3),vec3(.66,.7,.8),uJour);
    clair=mix(clair,vec3(1.,.66,.46),uChaud*.8); sombre=mix(sombre,vec3(.62,.38,.4),uChaud*.7);
    vec3 nc=mix(clair,sombre,smoothstep(.0,.5,c-c2*.9+.35*(nu-.5)));
    nc=mix(nc,vec3(.13,.15,.17)*(.45+uJour*.7),uOrage*.8); nc=floor(nc*6.+.5)/6.;
    col=mix(col,nc,c*smoothstep(.02,.22,d.y)*(.55+.45*cov));
  }
  col=mix(col,uBrume,uBrouillard*.35*smoothstep(.7,0.,h));
  gl_FragColor=vec4(col,1.);
  #include <colorspace_fragment>
}`;
export function creerCiel(THREE, { q } = {}) {
  const geo = new THREE.SphereGeometry(7000, 40, 24), vec3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const U = { uSun: { value: new THREE.Vector3(0, 1, 0) }, uMoon: { value: new THREE.Vector3(0, -1, 0) }, uZenith: { value: new THREE.Vector3() }, uHorizon: { value: new THREE.Vector3() }, uBrume: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Vector3(1, .95, .7) }, uJour: { value: 1 }, uChaud: { value: 0 }, uNuages: { value: .3 }, uOrage: { value: 0 }, uBrouillard: { value: 0 }, uTemps: { value: 0 }, uPhase: { value: .5 }, uMoonLum: { value: 1 }, uVent: { value: new THREE.Vector2(1, 0) }, uMoonToSun: { value: new THREE.Vector3(1, 0, 0) } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, depthWrite: false }), mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = -10; mesh.frustumCulled = false;
  const soleil = new THREE.DirectionalLight(0xfff1d6, 2.6), lune = new THREE.DirectionalLight(0x9fb4ff, 0), hemi = new THREE.HemisphereLight(0xaec9ff, 0x2a4a63, .9);
  const etat = { sunDir: new THREE.Vector3(0, 1, 0), moonDir: new THREE.Vector3(0, -1, 0), couleurs: couleursCiel(1, 0), eclair: 0 };
  // éclairs : flash blanc bref qui éclaire tout (orage)
  let prochain = 2, flash = 0;
  function maj(dt, t, camera, e) {
    // e : { jour 0..1, chaud 0..1, nuages, orage, brouillard, soleil:{alt,az}, lune:{alt,az,phase}, ventDir }
    const c = couleursCiel(e.jour, e.chaud, e.orage, e.brouillard); etat.couleurs = c;
    U.uZenith.value.set(...c.zenith); U.uHorizon.value.set(...c.horizon); U.uBrume.value.set(...c.brume);
    const sd = dirDepuisAltAz(e.soleil.alt, e.soleil.az), md = dirDepuisAltAz(e.lune.alt, e.lune.az); etat.sunDir.set(...sd); etat.moonDir.set(...md);
    U.uSun.value.copy(etat.sunDir); U.uMoon.value.copy(etat.moonDir);
    U.uJour.value = e.jour; U.uChaud.value = e.chaud; U.uNuages.value = e.nuages; U.uOrage.value = e.orage; U.uBrouillard.value = e.brouillard; U.uTemps.value = t; U.uPhase.value = e.lune.phase; U.uMoonLum.value = e.lune.eclairee;
    const w = (e.ventDir + 180) * RAD; U.uVent.value.set(Math.sin(w), -Math.cos(w));
    const toSun = etat.sunDir.clone().sub(etat.moonDir.clone().multiplyScalar(etat.sunDir.dot(etat.moonDir))); if (toSun.lengthSq() > 1e-4) U.uMoonToSun.value.copy(toSun.normalize());
    // couleur du Soleil : blanc de jour, orange à l'aube et au crépuscule
    const alt = e.soleil.alt, ch = lisse(14, 0, alt) * lisse(-8, -1, alt) + 0; U.uSunCol.value.set(1, .93 - ch * .38, .75 - ch * .5);
    // lumières de la scène : soleil le jour, lune la nuit, hémisphérique selon le ciel
    const il = lisse(-4, 12, alt) * (1 - e.orage * .65) * (1 - e.brouillard * .45); soleil.intensity = 2.8 * il; soleil.color.setRGB(1, .93 - ch * .3, .78 - ch * .45); soleil.position.copy(etat.sunDir).multiplyScalar(300);
    lune.intensity = (.55 + e.lune.eclairee * .75) * (1 - e.jour) * lisse(-8, 6, e.lune.alt) * (1 - e.orage * .6); lune.position.copy(etat.moonDir).multiplyScalar(300);
    hemi.intensity = .45 + .75 * e.jour * (1 - e.orage * .4) + .18 * (1 - e.jour); hemi.color.setRGB(...mix3([.18, .22, .42], c.zenith.map(x => Math.min(1, x * 1.25 + .12)), e.jour)); hemi.groundColor.setRGB(.16, .26, .34);
    // éclairs
    if (e.orage > .3) { prochain -= dt; if (prochain <= 0) { flash = 1; prochain = 2.5 + Math.random() * 6 / e.orage; } }
    flash = Math.max(0, flash - dt * 3.2); const f = flash > .5 ? 1 : flash > .3 ? .2 : flash > .15 ? .8 : 0; etat.eclair = f * e.orage;
    if (f) { hemi.intensity += 2.2 * f * e.orage; U.uZenith.value.add(new THREE.Vector3(.6, .6, .7).multiplyScalar(f * .8)); U.uHorizon.value.add(new THREE.Vector3(.6, .6, .7).multiplyScalar(f * .6)); }
    mesh.position.copy(camera.getWorldPosition(new THREE.Vector3()));
  }
  function detruire() { geo.dispose(); mat.dispose(); }
  return { mesh, lumiere: { soleil, lune, hemi }, maj, etat, detruire, U };
}
