"use strict";
/* ═════════════ FOND « JARVIS » : interface holographique, version pro (three.js, chargé à la demande) ═════════════
   Esthétique générique d'interface holographique de science-fiction (aucun logo, aucune marque) : fond très sombre, tout est lumière additive
   aux couleurs du THÈME ACTIF (UI.couleurs(), fondu quand le thème change : Univers → rose/violet, Jarvis → cyan/bleu).

   Repère : le monde est en PIXELS CSS (caméra en perspective placée pour que 1 unité = 1 px dans le plan z = 0) ; l'origine est le centre du canvas
   (qui déborde de 3 % de l'écran, voir ui.css). Les éléments 3D (globe, molécule, pièce technique) sont posés dans ce plan et tournent en perspective.

   COMPOSITION
   - Cœur (derrière l'entité, sans la gêner) : un seul shader plein écran-local : anneaux concentriques qui tournent à des vitesses différentes,
     graduations, anneau segmenté dont certains segments s'activent, secteurs qui se remplissent, arcs, marqueurs, radar avec balayage et échos,
     réticule d'écoute ; textures : degrés sur l'anneau (fixes) et petits textes techniques aux quatre coins (heure, coordonnées, valeurs).
   - Autour : grille hexagonale en perspective (plan incliné) avec ondes et cellules qui s'allument, lignes de circuit où des impulsions circulent,
     particules de données qui montent, réticules qui se verrouillent, hologrammes (globe filaire avec places boursières ouvertes/fermées,
     structure moléculaire, pièce technique rotative, onde sonore) et widgets (heure, météo, marchés, état de Raylé) alimentés par de vraies données.
   - Disposition responsive : le cœur est placé par RayleUI.cadrage (placement « centre » : centré, ENTIER, tous formats) ; l'espace restant (côtés,
     haut, bas) est découpé en cellules carrées où les éléments secondaires se rangent par priorité ; s'il manque de la place, ils disparaissent.
   RÉACTIONS (Entite.info() : état + amplitude réelle de la voix) : parole → anneaux qui pulsent avec la voix ; réflexion → arcs et balayage accélérés,
     arc de calcul ; écoute → réticule qui s'ouvre ; veille → tout ralentit.
   AMBIANCE (RayleUI.ambiance.lisse()) : nuit plus sombre, jour plus lumineux ; pluie en fines lignes numériques ; neige en carrés qui tombent ;
     brouillard (voile) ; orage = éclair d'interférences.
   Qualité q : 0 tout (halos, hologrammes complets, circuits, particules) · 1 moins d'éléments filaires, sans halo · 2 anneaux + grille simples.
   Éco : image fixe (ui/assets/fond-jarvis-*.webp + cœur pré-rendu), régénérée par le script de tests ; background.js la place.
   RayleUI.fondsReels.jarvis(canvas, {q, hd}) → {taille(), image(now, dt), qualite(q), detruire(), etat(), test} */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  UI.fondsReels=UI.fondsReels||{};
  const TAU=Math.PI*2;
  const clamp=(x,a,b)=>x<a?a:x>b?b:x;
  const lisse=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
  function rng(s){ s=s>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
  const css=(c,a)=>'rgba('+Math.round(c[0])+','+Math.round(c[1])+','+Math.round(c[2])+','+a+')';
  const MONO='ui-monospace,"Cascadia Mono",Consolas,Menlo,monospace';
  const PLACES=[['New York',40.71,-74.01,'ny'],['Londres',51.51,-.13,'lon'],['Paris',48.86,2.35,'par'],['Francfort',50.11,8.68,'fra'],['Tokyo',35.68,139.69,'tok'],['Hong Kong',22.32,114.17,'hk'],['Sydney',-33.87,151.21,'syd']];
  const ouverte=c=>{ try{ return UI.fondsReels._ouverte(c,Date.now())?1:0; }catch(e){ return 0; } };
  const JOURS=['DIM','LUN','MAR','MER','JEU','VEN','SAM'], MOIS=['JAN','FÉV','MAR','AVR','MAI','JUN','JUL','AOÛ','SEP','OCT','NOV','DÉC'];
  const NOM_METEO={clair:'CIEL CLAIR',nuageux:'NUAGEUX',brouillard:'BROUILLARD',bruine:'BRUINE',pluie:'PLUIE',orage:'ORAGE',neige:'NEIGE'};
  const NOM_ETAT={idle:'EN LIGNE',veille:'VEILLE',listening:'ÉCOUTE',thinking:'ANALYSE',speaking:'PAROLE'};

  /* ───────────── shaders ───────────── */
  const VS_PLAN=`varying vec2 v_p; uniform float u_ext; void main(){ v_p=position.xy*2.0*u_ext; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const FS_COEUR=`
uniform float u_aa,u_amp,u_listen,u_think,u_glow,u_k,u_det,u_p1,u_p2,u_p3,u_sw,u_t;
uniform vec3 u_c0,u_c1,u_c2;
varying vec2 v_p;
const float TAU=6.2831853;
float hsh(float n){ return fract(sin(n*91.345)*47453.5453); }
float band(float r,float r0,float w){ return 1.0-smoothstep(w,w+u_aa,abs(r-r0)); }
float glo(float r,float r0,float w){ return u_glow*exp(-pow(abs(r-r0)/(w*7.0+0.004),2.0))*0.22; }
float arcm(float a,float s,float l){ float d=mod(a-s,TAU); return smoothstep(0.0,0.025,d)*(1.0-smoothstep(l-0.025,l,d)); }
float tick(float r,float a,float n,float off,float r1,float len,float w,float tp){
  float inb=step(r1-len,r)*step(r,r1);
  float f=abs(fract((a+off)/TAU*n+0.5)-0.5)/n*TAU*r;
  float we=w*(1.0-tp*((r1-r)/len));
  return inb*(1.0-smoothstep(we,we+u_aa,f));
}
void main(){
  vec2 p=v_p; float r0=length(p); if(r0>1.12) discard;
  float a=atan(p.y,p.x); vec3 col=vec3(0.0); float rp;
  // 1 · cercle extérieur et graduations
  rp=r0*(1.0-u_amp*0.012);
  col+=u_c0*(band(rp,0.99,0.0022)*0.9+glo(rp,0.99,0.0022)+tick(rp,a,120.0,u_p1,0.985,0.018,0.0016,0.0)*0.7+tick(rp,a,12.0,u_p1,0.985,0.042,0.0030,0.0));
  // 2 · anneau segmenté : certains segments s'activent
  rp=r0*(1.0-u_amp*0.03);
  float sg=fract((a+u_p2)/TAU*24.0), si=floor((a+u_p2)/TAU*24.0);
  float on=smoothstep(0.04,0.08,sg)*(1.0-smoothstep(0.90,0.94,sg));
  float lvl=0.30+0.70*step(hsh(si+floor(u_t*0.35+si)),0.55+0.25*u_think);
  col+=u_c1*(band(rp,0.86,0.0075)*0.95+glo(rp,0.86,0.0075))*on*lvl+u_c0*band(rp,0.835,0.0012)*0.5;
  // 3 · secteurs qui se remplissent
  rp=r0*(1.0-u_amp*0.05);
  if(rp>0.76&&rp<0.83){
    float v8=(a+0.3927)/TAU*8.0, s8=fract(v8), i8=floor(v8);
    float fill=0.5+0.5*sin(u_t*0.45+i8*1.9+u_p1*3.0);
    float inSeg=step(0.05,s8)*step(s8,0.95), fl=step(s8,0.05+0.9*fill);
    float body=smoothstep(0.765,0.77,rp)*(1.0-smoothstep(0.815,0.82,rp))*fl;
    col+=u_c2*inSeg*((band(rp,0.82,0.0013)+band(rp,0.765,0.0013))*0.7+body*0.34);
  }
  // 4 · arcs qui tournent en sens contraires
  rp=r0*(1.0-u_amp*0.07);
  float a1=arcm(a,u_p3,2.2), a2=arcm(a,1.0-u_p3*1.4,1.3), a3=arcm(a,u_p1*5.0+3.0,0.7);
  float tete=smoothstep(0.0,2.2,mod(a-u_p3,TAU));
  col+=u_c0*(band(rp,0.72,0.0075)*(a1*(0.30+0.70*tete)+a2*0.6+a3*0.95)+glo(rp,0.72,0.0075)*(a1+a2+a3)*0.5)+u_c2*band(rp,0.70,0.0012)*0.45;
  // 5 · pointillé
  rp=r0*(1.0-u_amp*0.09);
  float dt=abs(fract((a-u_p2*0.5)/TAU*90.0)-0.5);
  col+=u_c1*band(rp,0.655,0.0035)*(1.0-smoothstep(0.10,0.22,dt))*0.85;
  // 6 · marqueurs triangulaires
  col+=u_c2*tick(rp,a,6.0,-u_p1*1.5,0.625,0.05,0.0155,0.92)*0.9+u_c0*band(rp,0.625,0.0012)*0.5;
  if(u_det>0.5){
    // 7 · radar : anneaux faibles, balayage, échos
    float inRad=step(r0,0.565)*smoothstep(0.24,0.33,r0);
    col+=u_c1*(band(r0,0.565,0.0016)*0.55+band(r0,0.42,0.0010)*0.24+band(r0,0.30,0.0010)*0.30)*smoothstep(0.22,0.3,r0);
    float d=mod(u_sw-a,TAU);
    col+=u_c1*exp(-d*(2.6-0.9*u_think))*inRad*0.55+u_c2*(1.0-smoothstep(0.0,0.012,d))*inRad*0.9;
    col+=u_c1*(1.0-smoothstep(0.0,u_aa*1.6,min(abs(p.x),abs(p.y))))*inRad*0.16;
    for(int i=0;i<6;i++){
      float fi=float(i), ai=hsh(fi+3.0)*TAU, ri=0.33+0.21*hsh(fi+9.0), ds=mod(u_sw-ai,TAU);
      vec2 bp=vec2(cos(ai),sin(ai))*ri; float bd=length(p-bp);
      col+=u_c2*(1.0-smoothstep(0.006,0.006+u_aa*2.0,bd))*exp(-ds*0.75)*0.95;
    }
    // 8 · réticule d'écoute : quatre équerres qui s'ouvrent
    float s=0.31+0.12*u_listen; vec2 q=abs(p);
    col+=u_c2*band(max(q.x,q.y),s,0.0042)*step(s-0.075,min(q.x,q.y))*(0.10+0.90*u_listen);
    // 9 · arc de calcul (réflexion)
    col+=u_c2*band(r0,0.947,0.0042)*(arcm(a,u_sw*2.3,1.0)+arcm(a,u_sw*2.3+3.14,0.6))*u_think;
  }
  col*=0.15+0.85*smoothstep(0.2,0.36,r0);
  col*=u_k*1.55*(1.0+u_amp*0.9);
  gl_FragColor=vec4(col,1.0);
}`;
  const FS_FOND=`
uniform vec3 u_c3,u_c0; uniform float u_t,u_k,u_haze,u_asp; varying vec2 v_p;
void main(){
  vec2 q=v_p*vec2(u_asp,1.0); float r=length(q);
  float base=1.0-smoothstep(0.0,1.25,r);
  vec3 c=u_c3*(0.020+0.075*base)*(0.7+0.5*u_k)+u_c0*0.012*base*base;
  c+=vec3(0.04)*u_haze*(0.3+base);
  float band=exp(-pow((fract(u_t*0.045)-(v_p.y*0.5+0.5))/0.018,2.0));   // lent balayage horizontal
  c+=u_c0*band*0.018;
  c*=1.0-0.35*smoothstep(0.55,1.4,r);
  gl_FragColor=vec4(c,1.0);
}`;
  const FS_GRILLE_VS=`
uniform float u_t; varying vec3 v_w; void main(){ vec4 w=modelMatrix*vec4(position,1.0); v_w=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
  const FS_GRILLE=`
uniform vec3 u_c; uniform float u_t,u_k,u_cell,u_cx,u_D,u_simple; varying vec3 v_w;
float hsh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
void main(){
  vec2 uv=v_w.xz/u_cell; float line, fill=0.0, id=0.0;
  if(u_simple>0.5){ vec2 g=abs(fract(uv)-0.5); float e=0.5-max(g.x,g.y); line=1.0-smoothstep(0.0,0.04,e); }
  else{
    vec2 rr=vec2(1.0,1.7320508), h=rr*0.5, a=mod(uv,rr)-h, b=mod(uv-h,rr)-h; vec2 gv=dot(a,a)<dot(b,b)?a:b; vec2 cid=uv-gv;
    vec2 pq=abs(gv); float e=0.5-max(dot(pq,vec2(0.5,0.8660254)),pq.x);
    line=1.0-smoothstep(0.0,0.05,e);
    fill=step(0.982,hsh(cid+floor(u_t*0.6)))*0.55;                    // cellules qui s'allument
  }
  float d=length(v_w.xz-vec2(u_cx,0.0));
  float wave=exp(-pow((mod(d-u_t*150.0,1100.0)-0.0)/70.0,2.0));       // onde qui part du cœur
  float dist=smoothstep(-2.4*u_D,0.25*u_D,v_w.z);                     // fondu vers l'horizon
  float I=(line*(0.42+1.1*wave)+fill*(0.5+wave))*dist*u_k;
  gl_FragColor=vec4(u_c*I,1.0);
}`;
  const VS_CIRCUIT=`attribute float a_t; attribute float a_s; uniform float u_t; varying float v_i;
void main(){ float head=fract(u_t*0.09+a_s); float d=abs(a_t-head); d=min(d,1.0-d); v_i=0.14+1.1*exp(-d*d*220.0); gl_PointSize=4.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const FS_CIRCUIT=`uniform vec3 u_c; uniform float u_k; varying float v_i; void main(){ gl_FragColor=vec4(u_c*v_i*u_k,1.0); }`;
  const VS_PART=`attribute vec4 a_s; uniform float u_t,u_W,u_H,u_px; varying float v_a;
void main(){
  float y=mod(a_s.y*u_H*1.1+u_t*a_s.z*55.0,u_H*1.1)-u_H*0.55;
  float x=(a_s.x-0.5)*u_W*1.04+sin(u_t*0.6+a_s.w*20.0)*6.0;
  v_a=(0.25+0.75*fract(a_s.w*7.0+u_t*0.3))*smoothstep(0.0,0.12,1.0-abs(y/(u_H*0.55)));
  gl_PointSize=(1.6+2.2*a_s.w)*u_px; gl_Position=projectionMatrix*modelViewMatrix*vec4(x,y,0.0,1.0);
}`;
  const FS_PART=`uniform vec3 u_c; uniform float u_k; varying float v_a; void main(){ gl_FragColor=vec4(u_c*v_a*u_k*0.8,1.0); }`;
  const VS_PLUIE=`attribute float a_e; attribute vec3 a_s; uniform float u_t,u_W,u_H,u_len,u_slant; varying float v_a;
void main(){
  float sp=0.7+0.6*a_s.z, y=mod(a_s.y*u_H*1.3+u_t*u_H*0.95*sp,u_H*1.3), L=u_len*(0.6+0.8*a_s.z);
  float yy=u_H*0.65-y, xx=(a_s.x-0.5)*u_W*1.1;
  v_a=0.18+0.5*a_s.z; gl_Position=projectionMatrix*modelViewMatrix*vec4(xx-a_e*L*u_slant,yy+a_e*L,0.0,1.0);
}`;
  const VS_NEIGE=`attribute vec3 a_s; uniform float u_t,u_W,u_H,u_px,u_slant; varying float v_a;
void main(){
  float y=mod(a_s.y*u_H*1.2+u_t*u_H*(0.045+0.05*a_s.z),u_H*1.2);
  float x=(a_s.x-0.5)*u_W*1.1+sin(u_t*0.7+a_s.y*40.0)*16.0+u_slant*y*0.2;
  v_a=0.3+0.6*a_s.z; gl_PointSize=(1.8+2.4*a_s.z)*u_px; gl_Position=projectionMatrix*modelViewMatrix*vec4(x,u_H*0.6-y,0.0,1.0);
}`;
  const FS_ALPHA=`uniform vec3 u_c; uniform float u_k; varying float v_a; void main(){ gl_FragColor=vec4(u_c*v_a*u_k,1.0); }`;
  const FS_ECLAIR=`
uniform vec3 u_c; uniform float u_t,u_fl; varying vec2 v_p;
float h(float n){ return fract(sin(n*12.9898)*43758.5453); }
void main(){
  float row=floor((v_p.y*0.5+0.5)*46.0), tk=floor(u_t*30.0);
  float bar=step(0.80,h(row+tk*1.7)), sh=h(row*3.1+tk);
  float I=u_fl*(0.07+0.55*bar*step(0.30,fract((v_p.x*0.5+0.5)*3.0+sh*7.0)));
  gl_FragColor=vec4(mix(u_c,vec3(1.0),0.4)*I,1.0);
}`;
  const FS_FRESNEL_VS=`varying vec3 v_n; varying vec3 v_v; void main(){ vec4 w=modelMatrix*vec4(position,1.0); v_n=normalize(mat3(modelMatrix)*normal); v_v=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }`;
  const FS_FRESNEL=`uniform vec3 u_c; uniform float u_k; varying vec3 v_n; varying vec3 v_v; void main(){ float f=pow(1.0-abs(dot(normalize(v_n),normalize(v_v))),2.4); gl_FragColor=vec4(u_c*f*0.55*u_k,1.0); }`;
  const VS_ATOME=`attribute float a_r; uniform float u_px; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=a_r*1.5*u_px*(900.0/-mv.z); gl_Position=projectionMatrix*mv; }`;
  const FS_ATOME=`uniform vec3 u_c; uniform float u_k; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.05,d); a*=a; gl_FragColor=vec4(u_c*a*u_k*2.0,1.0); }`;
  const VS_MARCHE=`attribute float a_o; uniform float u_px; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=(4.0+5.0*a_o)*u_px*(900.0/-mv.z); gl_Position=projectionMatrix*mv; }`;
  const FS_MARCHE=`uniform vec3 u_c0,u_c2; uniform float u_k,u_t; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d); gl_FragColor=vec4(mix(u_c0*0.6,u_c2,0.5)*a*u_k*1.5,1.0); }`;

  /* ───────────── géométries ───────────── */
  function cercle(n,r,z){ const p=[]; for(let i=0;i<n;i++){ const a=i/n*TAU, b=(i+1)/n*TAU; p.push(Math.cos(a)*r,Math.sin(a)*r,z||0,Math.cos(b)*r,Math.sin(b)*r,z||0); } return p; }
  function geoGlobe(det){
    const p=[], lat=det?[-60,-40,-20,0,20,40,60]:[-45,0,45], nm=det?18:10;
    for(const la of lat){ const r=Math.cos(la*Math.PI/180), y=Math.sin(la*Math.PI/180), N=64; for(let i=0;i<N;i++){ const a=i/N*TAU, b=(i+1)/N*TAU; p.push(Math.cos(a)*r,y,Math.sin(a)*r,Math.cos(b)*r,y,Math.sin(b)*r); } }
    for(let k=0;k<nm;k++){ const l=k/nm*TAU, N=48; for(let i=0;i<N;i++){ const a=-Math.PI/2+i/N*Math.PI, b=-Math.PI/2+(i+1)/N*Math.PI; p.push(Math.cos(a)*Math.cos(l),Math.sin(a),Math.cos(a)*Math.sin(l),Math.cos(b)*Math.cos(l),Math.sin(b),Math.cos(b)*Math.sin(l)); } }
    return new Float32Array(p);
  }
  function geoMolecule(){
    const R=rng(77), at=[]; let g=0;
    while(at.length<14&&g++<4000){ const v=[R()*2-1,R()*2-1,R()*2-1]; if(Math.hypot(...v)>1) continue; if(at.every(w=>Math.hypot(v[0]-w[0],v[1]-w[1],v[2]-w[2])>.5)) at.push(v); }
    const lines=[]; for(let i=0;i<at.length;i++) for(let j=i+1;j<at.length;j++){ const d=Math.hypot(at[i][0]-at[j][0],at[i][1]-at[j][1],at[i][2]-at[j][2]); if(d<.85) lines.push(...at[i],...at[j]); }
    return {atomes:at,lignes:new Float32Array(lines)};
  }
  function geoPiece(){                                              // pièce technique en révolution : anneaux polygonaux reliés, moyeu, dents
    const p=[], prof=[[.50,-.9],[.88,-.7],[.88,-.35],[.62,-.2],[.62,.2],[1,.38],[1,.7],[.46,.9]], N=18;
    for(let k=0;k<prof.length;k++){ const [r,z]=prof[k]; for(let i=0;i<N;i++){ const a=i/N*TAU, b=(i+1)/N*TAU; p.push(Math.cos(a)*r,z,Math.sin(a)*r,Math.cos(b)*r,z,Math.sin(b)*r); }
      if(k>0){ const [r0,z0]=prof[k-1]; for(let i=0;i<N;i+=3){ const a=i/N*TAU; p.push(Math.cos(a)*r0,z0,Math.sin(a)*r0,Math.cos(a)*r,z,Math.sin(a)*r); } } }
    for(let i=0;i<6;i++){ const a=i/6*TAU; p.push(0,.2,0,Math.cos(a)*.62,.2,Math.sin(a)*.62); }
    for(let i=0;i<24;i++){ const a=i/24*TAU; p.push(Math.cos(a)*1,.7,Math.sin(a)*1,Math.cos(a)*1.12,.7,Math.sin(a)*1.12); }
    return new Float32Array(p);
  }
  function geoReticule(){
    const p=[], L=.34; for(const sx of [-1,1]) for(const sy of [-1,1]){ p.push(sx,sy,0,sx*(1-L),sy,0, sx,sy,0,sx,sy*(1-L),0); }
    p.push(-.12,0,0,.12,0,0, 0,-.12,0,0,.12,0); p.push(-1.18,0,0,-.84,0,0, 1.18,0,0,.84,0,0, 0,-1.18,0,0,-.84,0, 0,1.18,0,0,.84,0);
    return new Float32Array(p);
  }
  const bufLignes=(arr)=>{ const g=new window.__THREE.BufferGeometry(); g.setAttribute('position',new window.__THREE.BufferAttribute(arr,3)); return g; };

  /* ───────────── emplacement du cœur (partagé avec l'image fixe du mode Éco, ui/background.js) ───────────── */
  function mesureEcran(){
    let m=null; try{ m=UI.cadrage.mesurer(); }catch(e){}
    if(!m){ const w=innerWidth,h=innerHeight; m={W:w,H:h,entite:{cx:w/2,cy:h*.42,r:Math.min(w,h)*.15},haut:56,bas:h-170,texteBas:h*.55,reserves:[],texte:null}; }
    return m;
  }
  function noyauEcran(m){                                          // {cx, cy, R} en px CSS : le plus grand carré qui tient entre le titre et la barre, centré sur l'entité
    m=m||mesureEcran(); const marge=Math.max(22,Math.round(Math.min(m.W,m.H)*.03)+10);
    let z; try{ z=UI.cadrage.disposer(Object.assign({},m,{placement:'centre',marge})).zone; }catch(e){ z={x0:m.W/2-150,x1:m.W/2+150,y0:m.H/2-150,y1:m.H/2+150}; }
    let R=Math.max(40,(z.x1-z.x0)/2*.99); if(Math.min(m.W,m.H)>520&&m.W/m.H<.9) R*=.76;     // tablette verticale : le cœur laisse de la place à une rangée d'éléments
    return {cx:(z.x0+z.x1)/2,cy:(z.y0+z.y1)/2,R,marge};
  }
  UI.fondsReels.jarvisNoyau=()=>noyauEcran();

  /* Découpe de l'espace restant (côtés, haut, bas) en cellules carrées, puis range les éléments par priorité (fonction pure, testée sous node).
     m : mesure de l'écran (UI.cadrage.mesurer) ; noyau : {cx, cy, R, marge} en px CSS. Rien ne recouvre le cercle du cœur ; s'il manque de la place, l'élément disparaît. */
  function agencerEcran(m,noyau){
    const Wd=m.W, Hd=m.H, petit=Math.min(Wd,Hd)<=520, marge=noyau.marge||24;
    const s=clamp(Math.min(Wd,Hd)/720,.62,1.7), CMAX=300*s, CMIN=petit?(Wd<Hd&&Hd<700?54:74):92, bande=petit&&Wd<Hd&&Hd<700?1:.8, g=Math.round(noyau.R*.06)+10;
    const haut=m.haut, bas=m.bas, R=noyau.R, rects=[];
    const L={x0:marge,x1:noyau.cx-R-g,y0:haut,y1:bas}, Rr={x0:noyau.cx+R+g,x1:Wd-marge,y0:haut,y1:bas};
    for(const r of (m.reserves||[])){ if(r.x0>=noyau.cx) Rr.x1=Math.min(Rr.x1,r.x0-12); else if(r.x1<=noyau.cx) L.x0=Math.max(L.x0,r.x1+12); }
    const lOk=L.x1-L.x0>=CMIN, rOk=Rr.x1-Rr.x0>=CMIN;
    if(lOk) rects.push(L); if(rOk) rects.push(Rr);
    const tx0=(lOk||rOk)?noyau.cx-R:marge, tx1=(lOk||rOk)?noyau.cx+R:Wd-marge;
    const Tt={x0:tx0,x1:tx1,y0:haut,y1:noyau.cy-R-g}, Bb={x0:tx0,x1:tx1,y0:noyau.cy+R+g,y1:bas};
    if(Tt.y1-Tt.y0>=CMIN) rects.push(Tt); if(Bb.y1-Bb.y0>=CMIN) rects.push(Bb);
    const cellules=[];
    for(const r of rects){
      const w=r.x1-r.x0, h=r.y1-r.y0, vertical=h>=w, major=vertical?h:w, minor=vertical?w:h;
      const base=Math.min(minor,CMAX), n=Math.max(1,Math.round(major/(base*bande))), c=Math.min(minor,major/n,CMAX);
      if(c<CMIN) continue;
      for(let i=0;i<n;i++){ const along=(i+.5)/n*major; cellules.push({cx:vertical?(r.x0+r.x1)/2:r.x0+along,cy:vertical?r.y0+along:(r.y0+r.y1)/2,c}); }
    }
    cellules.sort((a,b)=>b.c-a.c);
    // priorités : [élément, taille minimale de cellule] ; les widgets (texte) ne s'affichent que si le texte reste lisible
    const ordre=[['globe',CMIN],['horloge',190],['molecule',CMIN],['marches',210],['piece',CMIN],['onde',CMIN]];
    const libres=cellules.slice(), placement=[];
    for(const [nom,mn] of ordre){ const i=libres.findIndex(c=>c.c>=mn); if(i<0) continue; placement.push(Object.assign({nom},libres.splice(i,1)[0])); }
    return {cellules,placement,petit};
  }
  UI.fondsReels.jarvisAgencer=agencerEcran;

  /* ───────────── le fond ───────────── */
  UI.fondsReels.jarvis=async function(canvas,o){
    o=o||{};
    const THREE=await UI.three(); window.__THREE=THREE;
    const rendu=new THREE.WebGLRenderer({canvas,alpha:false,antialias:false,powerPreference:'low-power'});
    rendu.setClearColor(0x01040a,1); rendu.autoClear=true; rendu.outputColorSpace=THREE.LinearSRGBColorSpace;   // aucune conversion : textures, lignes et shaders se comportent pareil
    const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(40,1,20,9000);
    let q=Math.max(0,Math.min(2,o.q|0)), W=1, H=1, D=1000, t=0, fige=null;
    const T={t:{value:0}};
    const kcol=[new THREE.Color(),new THREE.Color(),new THREE.Color(),new THREE.Color()];
    const U={k:{value:1}};                                           // luminosité jour / nuit
    const ONE={blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor};
    const add=(vs,fs,uni,opt)=>new THREE.ShaderMaterial(Object.assign({uniforms:uni,vertexShader:vs,fragmentShader:fs,transparent:true,depthTest:false,depthWrite:false},ONE,opt||{}));
    const lineMat=(op)=>new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:op,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false});
    const matsLignes=[], matsTexte=[];                               // couleurs mises à jour à chaque image
    const lignes=(arr,op,sec)=>{ const m=lineMat(op); m.userData={op,sec}; matsLignes.push(m); return new THREE.LineSegments(bufLignes(arr),m); };

    /* ── fond, grille, éclair ── */
    const plan=new THREE.PlaneGeometry(1,1);
    const uFond={u_c3:{value:new THREE.Color()},u_c0:{value:new THREE.Color()},u_t:T.t,u_k:U.k,u_haze:{value:0},u_asp:{value:1},u_ext:{value:1}};
    const fond=new THREE.Mesh(plan,add(VS_PLAN,FS_FOND,uFond,{blending:THREE.NoBlending,transparent:false})); fond.renderOrder=-20; fond.frustumCulled=false; scene.add(fond);
    const uGr={u_c:{value:new THREE.Color()},u_t:T.t,u_k:U.k,u_cell:{value:60},u_cx:{value:0},u_D:{value:1000},u_simple:{value:0}};
    const grille=new THREE.Mesh(new THREE.PlaneGeometry(1,1),add(FS_GRILLE_VS,FS_GRILLE,uGr)); grille.rotation.x=-Math.PI/2; grille.renderOrder=-10; grille.frustumCulled=false; scene.add(grille);
    const uEc={u_c:{value:new THREE.Color()},u_t:T.t,u_fl:{value:0},u_ext:{value:1}};
    const eclair=new THREE.Mesh(plan,add(VS_PLAN,FS_ECLAIR,uEc)); eclair.renderOrder=30; eclair.visible=false; eclair.frustumCulled=false; scene.add(eclair);

    /* ── cœur ── */
    const EXT=1.12;
    const uCoeur={u_aa:{value:.004},u_amp:{value:0},u_listen:{value:0},u_think:{value:0},u_glow:{value:1},u_k:U.k,u_det:{value:1},u_p1:{value:0},u_p2:{value:0},u_p3:{value:0},u_sw:{value:0},u_t:T.t,
      u_c0:{value:new THREE.Color()},u_c1:{value:new THREE.Color()},u_c2:{value:new THREE.Color()},u_ext:{value:EXT}};
    const coeur=new THREE.Mesh(plan,add(VS_PLAN,FS_COEUR,uCoeur)); coeur.renderOrder=0; coeur.frustumCulled=false; scene.add(coeur);
    // degrés sur l'anneau, cardinaux dans le radar : texture fixe (tourne lentement)
    function toile(n){ const c=document.createElement('canvas'); c.width=c.height=n; return c; }
    const cDeg=toile(1024), gD=cDeg.getContext('2d');
    gD.translate(512,512); gD.fillStyle='#fff'; gD.textAlign='center'; gD.textBaseline='middle';
    for(let d=0;d<360;d+=30){ gD.save(); gD.rotate(d*Math.PI/180); gD.translate(0,-512*.915); gD.font='bold 21px '+MONO; gD.fillText(String(d).padStart(3,'0'),0,0); gD.restore(); }
    for(let d=15;d<360;d+=30){ gD.save(); gD.rotate(d*Math.PI/180); gD.translate(0,-512*.915); gD.font='15px '+MONO; gD.globalAlpha=.55; gD.fillText('·',0,0); gD.restore(); }
    gD.globalAlpha=.7; ['N','E','S','O'].forEach((l,i)=>{ gD.save(); gD.rotate(i*Math.PI/2); gD.translate(0,-512*.495); gD.font='bold 26px '+MONO; gD.fillText(l,0,0); gD.restore(); });
    const texDeg=new THREE.CanvasTexture(cDeg); texDeg.generateMipmaps=true; texDeg.anisotropy=2;
    const matDeg=new THREE.MeshBasicMaterial({map:texDeg,transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending}); matsTexte.push(matDeg);
    const degres=new THREE.Mesh(plan,matDeg); degres.renderOrder=1; degres.frustumCulled=false; scene.add(degres);
    // textes techniques aux quatre coins (dynamiques, 5 Hz)
    const cCoin=toile(768), gC=cCoin.getContext('2d'), texCoin=new THREE.CanvasTexture(cCoin); texCoin.minFilter=THREE.LinearFilter; texCoin.generateMipmaps=false;
    const matCoin=new THREE.MeshBasicMaterial({map:texCoin,transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending}); matsTexte.push(matCoin);
    const coins=new THREE.Mesh(plan,matCoin); coins.renderOrder=1; coins.frustumCulled=false; scene.add(coins);

    /* ── hologrammes ── */
    const holo=new THREE.Group(); scene.add(holo);
    // globe
    const globe=new THREE.Group(), globeFil=lignes(geoGlobe(true),.8,false), globeFil2=lignes(geoGlobe(false),.7,true);
    const uFr={u_c:{value:new THREE.Color()},u_k:U.k};
    const globeFresnel=new THREE.Mesh(new THREE.SphereGeometry(.985,28,18),add(FS_FRESNEL_VS,FS_FRESNEL,uFr));
    const orb=[0,1,2].map(i=>{ const l=lignes(new Float32Array(cercle(96,1.32+i*.1,0)),.4,false); l.rotation.x=Math.PI/2+(i-1)*.5; l.rotation.y=i*1.1; return l; });
    const gPts=new THREE.BufferGeometry(); const gp=[]; for(const p of PLACES){ const la=p[1]*Math.PI/180, lo=-p[2]*Math.PI/180; gp.push(Math.cos(la)*Math.cos(lo)*1.01,Math.sin(la)*1.01,Math.cos(la)*Math.sin(lo)*1.01); }
    gPts.setAttribute('position',new THREE.Float32BufferAttribute(gp,3)); const aO=new Float32Array(PLACES.length); gPts.setAttribute('a_o',new THREE.BufferAttribute(aO,1));
    const uMa={u_c0:{value:new THREE.Color()},u_c2:{value:new THREE.Color()},u_k:U.k,u_t:T.t,u_px:{value:1}};
    const marchePts=new THREE.Points(gPts,add(VS_MARCHE,FS_MARCHE,uMa));
    globe.add(globeFil,globeFil2,globeFresnel,marchePts,...orb); holo.add(globe);
    // molécule
    const mol=new THREE.Group(), gm=geoMolecule(), molFil=lignes(gm.lignes,.85,true);
    const gA=new THREE.BufferGeometry(); gA.setAttribute('position',new THREE.Float32BufferAttribute(gm.atomes.flat(),3)); gA.setAttribute('a_r',new THREE.Float32BufferAttribute(gm.atomes.map((_,i)=>7+(i%4)*3.5),1));
    const uAt={u_c:{value:new THREE.Color()},u_k:U.k,u_px:{value:1}};
    const atomes=new THREE.Points(gA,add(VS_ATOME,FS_ATOME,uAt));
    mol.add(molFil,atomes); holo.add(mol);
    // pièce technique + son repère circulaire
    const piece=new THREE.Group(), pieceFil=lignes(geoPiece(),.85,false), repere=lignes(new Float32Array([...cercle(96,1.35,0),...cercle(96,1.5,0)]),.4,false);
    { const tk=[]; for(let i=0;i<72;i++){ const a=i/72*TAU, r0=1.5, r1=i%6===0?1.66:1.58; tk.push(Math.cos(a)*r0,Math.sin(a)*r0,0,Math.cos(a)*r1,Math.sin(a)*r1,0); } repere.geometry=bufLignes(new Float32Array([...cercle(96,1.35,0),...cercle(96,1.5,0),...tk])); }
    piece.add(pieceFil); holo.add(piece);
    const repGroup=new THREE.Group(); repGroup.add(repere); holo.add(repGroup);
    // onde sonore (deux copies, l'une en miroir)
    const NW=110, waveA=new Float32Array(NW*3), waveB=new Float32Array(NW*3);
    const gwa=new THREE.BufferGeometry(); gwa.setAttribute('position',new THREE.BufferAttribute(waveA,3)); const gwb=new THREE.BufferGeometry(); gwb.setAttribute('position',new THREE.BufferAttribute(waveB,3));
    const mwa=lineMat(.9), mwb=lineMat(.35); matsLignes.push(mwa,mwb); mwa.userData={op:.9,sec:false}; mwb.userData={op:.35,sec:false};
    const wave=new THREE.Group(); wave.add(new THREE.Line(gwa,mwa),new THREE.Line(gwb,mwb)); holo.add(wave);

    /* ── particules, circuits, pluie, neige ── */
    function pointsAlea(n,vs,fs,uni,seed,quatre){ const R=rng(seed), a=new Float32Array(n*(quatre?4:3)); for(let i=0;i<a.length;i++) a[i]=R(); const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3)); g.setAttribute('a_s',new THREE.BufferAttribute(a,quatre?4:3)); return new THREE.Points(g,add(vs,fs,uni)); }
    const uPa={u_c:{value:new THREE.Color()},u_t:T.t,u_W:{value:1},u_H:{value:1},u_px:{value:1},u_k:U.k};
    const NPART=260, particules=pointsAlea(NPART,VS_PART,FS_PART,uPa,5,true); particules.frustumCulled=false; particules.renderOrder=-5; scene.add(particules);
    const uCi={u_c:{value:new THREE.Color()},u_t:T.t,u_k:U.k};
    let circuits=null, noeuds=null;
    const matCi=add(VS_CIRCUIT,FS_CIRCUIT,uCi);
    const uPl={u_c:{value:new THREE.Color()},u_t:T.t,u_W:{value:1},u_H:{value:1},u_len:{value:22},u_slant:{value:.15},u_k:U.k};
    const NPL=340; { const R=rng(9), s=new Float32Array(NPL*2*3), e=new Float32Array(NPL*2); for(let i=0;i<NPL;i++){ const a=R(),b=R(),c=R(); for(let k=0;k<2;k++){ s.set([a,b,c],(i*2+k)*3); e[i*2+k]=k; } }
      var gPl=new THREE.BufferGeometry(); gPl.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NPL*2*3),3)); gPl.setAttribute('a_s',new THREE.BufferAttribute(s,3)); gPl.setAttribute('a_e',new THREE.BufferAttribute(e,1)); }
    const pluie=new THREE.LineSegments(gPl,add(VS_PLUIE,FS_ALPHA,uPl)); pluie.frustumCulled=false; pluie.renderOrder=5; pluie.visible=false; scene.add(pluie);
    const NNE=260, neige=pointsAlea(NNE,VS_NEIGE,FS_ALPHA,{u_c:uPl.u_c,u_t:T.t,u_W:uPl.u_W,u_H:uPl.u_H,u_px:{value:1},u_slant:uPl.u_slant,u_k:U.k},13,false); neige.frustumCulled=false; neige.renderOrder=5; neige.visible=false; scene.add(neige);

    /* ── réticules qui se verrouillent ── */
    const retGeo=bufLignes(geoReticule()), reticules=[0,1,2].map(i=>{ const m=lineMat(0); m.userData={op:0,sec:false}; const l=new THREE.LineSegments(retGeo,m); l.visible=false; scene.add(l); return {l,m,t:-1-i*1.7,x:0,y:0,s:30,vie:4.2}; });

    /* ── widgets (canvas 2D, redessinés rarement) ── */
    const DENS=1.5;
    function widget(w,h,titre){
      const cv=document.createElement('canvas'); cv.width=Math.round(w*DENS); cv.height=Math.round(h*DENS);
      const g=cv.getContext('2d'), tex=new THREE.CanvasTexture(cv); tex.minFilter=THREE.LinearFilter; tex.generateMipmaps=false; tex.anisotropy=2;
      const mesh=new THREE.Mesh(plan,new THREE.MeshBasicMaterial({map:tex,transparent:true,depthTest:false,depthWrite:false})); mesh.renderOrder=20; mesh.frustumCulled=false; mesh.visible=false; scene.add(mesh);
      return {w,h,titre,cv,g,tex,mesh,cle:'',dernier:-1};
    }
    function cadreW(wd,c){
      const g=wd.g, w=wd.w, h=wd.h; g.setTransform(DENS,0,0,DENS,0,0); g.clearRect(0,0,w,h);
      g.fillStyle='rgba(1,5,10,.66)'; g.fillRect(0,0,w,h);
      g.strokeStyle=css(c[0],.95); g.lineWidth=1.6; const L=14;
      g.beginPath(); for(const [x,y,dx,dy] of [[1,1,1,1],[w-1,1,-1,1],[1,h-1,1,-1],[w-1,h-1,-1,-1]]){ g.moveTo(x+dx*L,y); g.lineTo(x,y); g.lineTo(x,y+dy*L); } g.stroke();
      g.strokeStyle=css(c[0],.28); g.lineWidth=1; g.beginPath(); g.moveTo(10,26); g.lineTo(w-10,26); g.stroke();
      g.fillStyle=css(c[2],.9); g.font='bold 11px '+MONO; g.textBaseline='alphabetic'; g.textAlign='left'; g.fillText(wd.titre,12,19);
      g.fillStyle=css(c[0],.9); g.fillRect(w-22,12,8,8); g.fillStyle=css(c[0],.35); g.fillRect(w-34,12,8,8);
    }
    const wHeure=widget(300,112,'HORLOGE // LOCALE'), wMeteo=widget(300,112,'MÉTÉO // AMBIANCE'), wMarches=widget(300,176,'MARCHÉS // OUVERTURE'), wEtat=widget(300,112,'RAYLÉ // ÉTAT');
    const ampHist=new Float32Array(40);
    function dessinerHeure(c,d){
      cadreW(wHeure,c); const g=wHeure.g, p=n=>String(n).padStart(2,'0');
      g.fillStyle=css(c[2],1); g.font='bold 44px '+MONO; g.textAlign='left'; g.fillText(p(d.getHours())+':'+p(d.getMinutes()),12,76);
      g.font='bold 22px '+MONO; g.fillStyle=css(c[0],1); g.fillText(p(d.getSeconds()),152,76);
      g.font='12px '+MONO; g.fillStyle=css(c[2],.8); g.fillText(JOURS[d.getDay()]+' '+p(d.getDate())+' '+MOIS[d.getMonth()]+' '+d.getFullYear(),12,98);
      const dec=-d.getTimezoneOffset()/60; g.textAlign='right'; g.fillText('UTC'+(dec>=0?'+':'−')+p(Math.abs(Math.trunc(dec)))+':'+p(Math.abs(dec%1)*60),288,98);
      const f=d.getSeconds()/60; g.strokeStyle=css(c[0],.35); g.lineWidth=1; g.strokeRect(190,60,98,6); g.fillStyle=css(c[0],.9); g.fillRect(190,60,98*f,6);
      wHeure.tex.needsUpdate=true;
    }
    function dessinerMeteo(c){
      cadreW(wMeteo,c); const g=wMeteo.g; let e=null; try{ e=UI.ambiance&&UI.ambiance.etat(); }catch(x){}
      const meteo=e?NOM_METEO[e.meteo]||'—':'—', temp=e&&e.temperature!=null?Math.round(e.temperature)+'°C':'--°C', vent=e&&e.vent?Math.round(e.vent.kmh||0)+' KM/H':'-- KM/H';
      g.fillStyle=css(c[2],1); g.font='bold 30px '+MONO; g.textAlign='left'; g.fillText(temp,12,64);
      g.font='bold 13px '+MONO; g.fillStyle=css(c[0],1); g.fillText(meteo,118,52);
      g.font='12px '+MONO; g.fillStyle=css(c[2],.8); g.fillText('VENT '+vent,118,70);
      g.fillText((e&&e.lieu&&e.lieu.nom?e.lieu.nom.toUpperCase().slice(0,16):'LIEU INCONNU')+' · '+(e?String(e.moment||'').toUpperCase():''),12,98);
      const L=UI.ambiance&&UI.ambiance.lisse?UI.ambiance.lisse():null; const lv=L?L.jour:.5;
      g.strokeStyle=css(c[0],.4); g.strokeRect(190,82,98,6); g.fillStyle=css(c[0],.9); g.fillRect(190,82,98*lv,6);
      wMeteo.tex.needsUpdate=true;
    }
    function dessinerMarches(c){
      cadreW(wMarches,c); const g=wMarches.g; g.font='12px '+MONO; g.textAlign='left';
      PLACES.forEach((p,i)=>{ const y=46+i*18, o=ouverte(p[3]);
        g.fillStyle=o?css(c[2],1):css(c[0],.3); g.beginPath(); g.arc(18,y-4,4,0,TAU); if(o) g.fill(); else{ g.strokeStyle=css(c[0],.55); g.stroke(); }
        g.fillStyle=o?css(c[2],1):css(c[0],.6); g.fillText(p[0].toUpperCase(),32,y);
        g.textAlign='right'; g.fillStyle=o?css(c[0],1):css(c[0],.45); g.fillText(o?'OUVERT':'FERMÉ',286,y); g.textAlign='left'; });
      wMarches.tex.needsUpdate=true;
    }
    function dessinerEtat(c,etat,amp){
      cadreW(wEtat,c); const g=wEtat.g; g.fillStyle=css(c[2],1); g.font='bold 20px '+MONO; g.textAlign='left'; g.fillText(NOM_ETAT[etat]||'EN LIGNE',12,56);
      g.font='11px '+MONO; g.fillStyle=css(c[0],.8); g.fillText('SIGNAL '+Math.round(amp*100)+'%',12,74);
      const n=ampHist.length, bw=(w=>w)(176/n);
      for(let i=0;i<n;i++){ const v=ampHist[(histPos+i)%n], hh=3+v*44; g.fillStyle=css(i>n-4?c[2]:c[0],.35+.6*v); g.fillRect(112+i*4.4,98-hh,3,hh); }
      void bw; wEtat.tex.needsUpdate=true;
    }
    let histPos=0, cleCouleur='';

    /* ── disposition ── */
    let ecran={W:1,H:1}, noyau={cx:0,cy:0,R:100}, cellules=[], placement=[], forcer=null, petit=false;
    function agencer(){
      const m=mesureEcran(); ecran={W:m.W,H:m.H,haut:m.haut,bas:m.bas};
      noyau=noyauEcran(m); if(forcer) noyau=Object.assign({},noyau,forcer);
      const r=agencerEcran(m,noyau); petit=r.petit; cellules=r.cellules; placement=r.placement;
    }
    const wx=sx=>sx-ecran.W/2, wy=sy=>ecran.H/2-sy;                  // écran CSS → monde (px)
    function poser(){
      holo.children.forEach(c=>c.visible=false);
      for(const w of [wHeure,wMeteo,wMarches,wEtat]) w.mesh.visible=false;
      const sec=q===0?1:q===1?0:-1;                                    // q2 : aucun hologramme
      for(const p of placement){
        if(sec<0) break;
        const X=wx(p.cx), Y=wy(p.cy), c=p.c, taille=c*.86;
        const put=(obj,k)=>{ obj.visible=true; obj.position.set(X,Y,0); obj.scale.setScalar(taille*k); };
        if(p.nom==='globe'){ put(globe,.40); }
        else if(p.nom==='molecule'&&q===0){ put(mol,.38); }
        else if(p.nom==='piece'&&q===0){ put(piece,.30); repGroup.visible=true; repGroup.position.set(X,Y,0); repGroup.scale.setScalar(taille*.32); }
        else if(p.nom==='onde'){ wave.visible=true; wave.position.set(X,Y,0); wave.userData.w=c*.92; }
        else if(p.nom==='horloge'&&q===0){ const w=c*.94, put2=(wd,yy)=>{ wd.mesh.visible=true; wd.mesh.position.set(X,yy,0); wd.mesh.scale.set(w,w*wd.h/wd.w,1); }; const h1=w*wHeure.h/wHeure.w, h2=w*wMeteo.h/wMeteo.w; put2(wHeure,Y+(h1+6)/2); put2(wMeteo,Y-(h2+6)/2); }
        else if(p.nom==='marches'&&q===0){ const w=c*.94, put2=(wd,yy)=>{ wd.mesh.visible=true; wd.mesh.position.set(X,yy,0); wd.mesh.scale.set(w,w*wd.h/wd.w,1); }; const h1=w*wMarches.h/wMarches.w, h2=w*wEtat.h/wEtat.w; put2(wMarches,Y+(h2+6)/2); put2(wEtat,Y-(h1+6)/2); }
      }
      if(!placement.some(p=>p.nom==='piece')||q>0||sec<0) repGroup.visible=false;
      if(!placement.some(p=>p.nom==='onde')||sec<0) wave.visible=false;
    }
    function placerCoeur(){
      const R=noyau.R, X=wx(noyau.cx), Y=wy(noyau.cy);
      coeur.position.set(X,Y,0); coeur.scale.set(R*EXT*2,R*EXT*2,1);
      degres.position.set(X,Y,0); degres.scale.set(R*2,R*2,1);
      coins.position.set(X,Y,0); coins.scale.set(R*2,R*2,1); coins.visible=q<2&&R>=150;
      uCoeur.u_aa.value=1.6/R;
    }

    /* ── circuits : cheminements orthogonaux hors du cœur ── */
    function bâtirCircuits(){
      if(circuits){ scene.remove(circuits,noeuds); circuits.geometry.dispose(); noeuds.geometry.dispose(); circuits=noeuds=null; }
      const n=q===0?30:q===1?12:0; if(!n) return;
      const R=rng(321), pos=[], tt=[], ss=[], np=[], nt=[], ns=[];
      const Wc=W, Hc=H, cx=wx(noyau.cx), cy=wy(noyau.cy), garde=noyau.R*1.1;
      const dedans=(x,y)=>Math.hypot(x-cx,y-cy)<garde || Math.abs(x)>Wc/2-4 || Math.abs(y)>Hc/2-4;
      for(let k=0;k<n;k++){
        const bord=R()<.5; let x,y,dx,dy;
        if(R()<.6){ const lat=R()<.5?-1:1; x=lat*(Wc/2-R()*Wc*.16); y=(R()-.5)*Hc; dx=-lat; dy=0; } else { const hh=R()<.5?-1:1; x=(R()-.5)*Wc; y=hh*(Hc/2-R()*Hc*.12); dx=0; dy=-hh; }
        void bord;
        const pts=[[x,y]], segs=3+Math.floor(R()*5); let ok=true;
        for(let s=0;s<segs;s++){
          const L=40+R()*110; let nx=x+dx*L, ny=y+dy*L; if(dedans(nx,ny)){ ok=s>0; break; }
          x=nx; y=ny; pts.push([x,y]);
          if(R()<.55){ const f=R()<.5?1:-1; const odx=dx; dx=-dy*f; dy=odx*f; }                          // virage à 90°
          else if(R()<.3){ const f=R()<.5?1:-1, c=Math.SQRT1_2; const odx=dx, ody=dy; dx=(odx-ody*f)*c; dy=(ody+odx*f)*c; }   // ou à 45°
        }
        if(!ok||pts.length<2) continue;
        let tot=0; const cum=[0]; for(let i=1;i<pts.length;i++){ tot+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]); cum.push(tot); }
        const seed=R();
        for(let i=1;i<pts.length;i++){ pos.push(pts[i-1][0],pts[i-1][1],0,pts[i][0],pts[i][1],0); tt.push(cum[i-1]/tot,cum[i]/tot); ss.push(seed,seed); }
        np.push(pts[pts.length-1][0],pts[pts.length-1][1],0,pts[0][0],pts[0][1],0); nt.push(1,0); ns.push(seed,seed);
      }
      const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('a_t',new THREE.Float32BufferAttribute(tt,1)); g.setAttribute('a_s',new THREE.Float32BufferAttribute(ss,1));
      const gn=new THREE.BufferGeometry(); gn.setAttribute('position',new THREE.Float32BufferAttribute(np,3)); gn.setAttribute('a_t',new THREE.Float32BufferAttribute(nt,1)); gn.setAttribute('a_s',new THREE.Float32BufferAttribute(ns,1));
      circuits=new THREE.LineSegments(g,matCi); noeuds=new THREE.Points(gn,matCi); circuits.renderOrder=noeuds.renderOrder=-8; circuits.frustumCulled=noeuds.frustumCulled=false; scene.add(circuits,noeuds);
    }

    /* ── qualité ── */
    function appliquerQualite(){
      const pr=[Math.min(window.devicePixelRatio||1,1.5),.9,.65][q]; rendu.setPixelRatio(pr);
      if(W>1) rendu.setSize(W,H,false);
      uCoeur.u_glow.value=q===0?1:0; uCoeur.u_det.value=q<2?1:0; uGr.u_simple.value=q===2?1:0;
      globeFresnel.visible=q===0; globeFil.visible=q===0; globeFil2.visible=q>0;
      orb.forEach((l,i)=>{ l.visible=q===0||i===0; });
      particules.geometry.setDrawRange(0,[NPART,Math.round(NPART*.4),0][q]); particules.visible=q<2;
      for(const u of [uPa,uAt,uMa,neige.material.uniforms]) if(u.u_px) u.u_px.value=pr;
    }

    /* ── dimensions ── */
    function taille(){
      W=Math.max(2,Math.round(innerWidth*1.06)); H=Math.max(2,Math.round(innerHeight*1.06));
      D=H/(2*Math.tan(camera.fov*Math.PI/360)); camera.aspect=W/H; camera.position.set(0,0,D); camera.near=D*.1; camera.far=D*8; camera.updateProjectionMatrix();
      fond.scale.set(W*1.05,H*1.05,1); uFond.u_asp.value=W/H;
      eclair.scale.set(W*1.05,H*1.05,1);
      grille.position.set(0,-H*.46,0); grille.scale.set(W*6,D*3.4,1); grille.position.z=-D*1.15; uGr.u_cell.value=Math.max(34,Math.min(W,H)*.058); uGr.u_D.value=D;
      for(const u of [uPa,uPl]){ u.u_W.value=W; u.u_H.value=H; } neige.material.uniforms.u_W.value=W; neige.material.uniforms.u_H.value=H;
      uPl.u_len.value=Math.max(14,H*.028);
      appliquerQualite(); agencer(); placerCoeur(); poser(); bâtirCircuits();
      uGr.u_cx.value=wx(noyau.cx); appliquerSeul();
    }
    function qualite(n){ q=Math.max(0,Math.min(2,n|0)); appliquerQualite(); placerCoeur(); poser(); bâtirCircuits(); }

    /* ── image ── */
    let seulP=null;
    function appliquerSeul(){
      const p=seulP; if(!p) return;
      coeur.visible=degres.visible=p.coeur; coins.visible=coins.visible&&p.coeur&&p.coins; fond.visible=grille.visible=p.decor; holo.visible=p.holo;
      if(!p.widgets) for(const w of [wHeure,wMeteo,wMarches,wEtat]) w.mesh.visible=false;
    }
    let sp=1, spC=1, think=0, listen=0, ampL=0, p1=0,p2=0,p3=0,sw=0, flash=0, prochainEclair=6, tHeure=-1, tMarches=-9, tCoin=-9, tEtat=-9, tHist=0, flK=0;
    const etatEff={idle:[1,0,0],veille:[.3,0,0],listening:[1.25,0,1],thinking:[2.8,1,0],speaking:[1.5,0,0]};
    const tmp=new THREE.Color();
    function etatEntite(){ if(fige) return {etat:fige.etat||'idle',amp:fige.amp||0}; try{ const i=Entite.info(); return {etat:i.etat||'idle',amp:i.amp||0}; }catch(e){ return {etat:'idle',amp:0}; } }
    function image(now,dt){
      if(fige){ t=fige.t; dt=0; } else t+=dt; T.t.value=t;
      const c=UI.couleurs?UI.couleurs():[[0,229,255],[79,195,255],[184,246,255],[31,107,255]];
      let L=null; try{ L=UI.ambiance&&UI.ambiance.lisse&&UI.ambiance.lisse(); }catch(e){}
      const jour=L?L.jour:.5, pluieV=L?L.pluie:0, neigeV=L?L.neige:0, brume=L?L.brouillard:0, orage=L?L.orage:0, vent=L?L.vent:.1;
      const k=(.66+.5*jour)*(1-.22*brume); U.k.value=k;
      for(let i=0;i<4;i++) kcol[i].setRGB(c[i][0]/255,c[i][1]/255,c[i][2]/255);
      // couleurs des matériaux
      uCoeur.u_c0.value.copy(kcol[0]); uCoeur.u_c1.value.copy(kcol[1]); uCoeur.u_c2.value.copy(kcol[2]);
      uFond.u_c3.value.copy(kcol[3]); uFond.u_c0.value.copy(kcol[0]); uFond.u_haze.value=brume*.5+.1*jour;
      uGr.u_c.value.copy(kcol[0]).lerp(kcol[1],.35); uCi.u_c.value.copy(kcol[0]); uPa.u_c.value.copy(kcol[2]); uPl.u_c.value.copy(kcol[2]).lerp(kcol[1],.4);
      uFr.u_c.value.copy(kcol[0]); uAt.u_c.value.copy(kcol[2]); uMa.u_c0.value.copy(kcol[0]); uMa.u_c2.value.copy(kcol[2]); uEc.u_c.value.copy(kcol[2]);
      for(const m of matsLignes){ tmp.copy(m.userData.sec?kcol[1]:kcol[0]).multiplyScalar(.55+.6*k); m.color.copy(tmp); }
      for(const m of matsTexte) m.color.copy(kcol[2]).multiplyScalar(.6+.5*k);
      // état de l'entité
      const {etat,amp}=etatEntite(), e=etatEff[etat]||etatEff.idle;
      const kk=dt>0?1-Math.exp(-dt*3):1; sp+=(e[0]-sp)*kk; think+=(e[1]-think)*kk; listen+=(e[2]-listen)*kk; ampL+=(amp-ampL)*(dt>0?1-Math.exp(-dt*14):1);
      p1+=dt*.11*sp; p2-=dt*.19*sp; p3+=dt*.33*sp; sw+=dt*(.85+1.7*think)*sp;
      if(fige&&fige.p!=null){ p1=fige.p*.11; p2=-fige.p*.19; p3=fige.p*.33; sw=fige.p*1.0; }       // image fixe : phases choisies
      uCoeur.u_p1.value=p1; uCoeur.u_p2.value=p2; uCoeur.u_p3.value=p3; uCoeur.u_sw.value=sw; uCoeur.u_amp.value=ampL; uCoeur.u_think.value=think; uCoeur.u_listen.value=listen;
      degres.rotation.z=-p1*.9;
      // hologrammes
      const rot=dt*.35*sp;
      if(globe.visible){ globe.rotation.y+=rot*.8; globe.rotation.x=.38; orb.forEach((l,i)=>{ l.rotation.z+=rot*(.6+i*.25)*(i%2?-1:1); }); }
      if(mol.visible){ mol.rotation.y+=rot*1.1; mol.rotation.x+=rot*.4; }
      if(piece.visible){ piece.rotation.y+=rot*1.4; piece.rotation.x=.55; repGroup.rotation.z+=rot*.5; repGroup.rotation.x=1.0; }
      if(wave.visible){ const w=wave.userData.w||200, a=.16+ampL*.9+.22*think*(.5+.5*Math.sin(t*3));
        for(let i=0;i<NW;i++){ const u=i/(NW-1), x=(u-.5)*w, env=Math.sin(Math.PI*u), y=env*a*w*.22*(Math.sin(u*14+t*5)*.6+Math.sin(u*31-t*3.4)*.4*(.4+ampL)+Math.sin(u*5+t*1.3)*.3);
          waveA[i*3]=x; waveA[i*3+1]=y; waveA[i*3+2]=0; waveB[i*3]=x; waveB[i*3+1]=-y*.7; waveB[i*3+2]=0; }
        gwa.attributes.position.needsUpdate=true; gwb.attributes.position.needsUpdate=true; }
      // marchés : points ouverts/fermés (toutes les 5 s)
      if(t-tMarches>5||fige&&tMarches<0){ tMarches=t; PLACES.forEach((p,i)=>{ aO[i]=ouverte(p[3]); }); gPts.attributes.a_o.needsUpdate=true; if(wMarches.mesh.visible) dessinerMarches(c); }
      // widgets
      const cle=c.map(x=>x.map(Math.round).join(',')).join('|');
      const redessiner=cle!==cleCouleur; cleCouleur=cle;
      if(!fige){
        const d=new Date(), s=d.getSeconds();
        if(wHeure.mesh.visible&&(s!==tHeure||redessiner)){ tHeure=s; dessinerHeure(c,d); }
        if(wMeteo.mesh.visible&&(t-wMeteo.dernier>2||redessiner)){ wMeteo.dernier=t; dessinerMeteo(c); }
        if(wMarches.mesh.visible&&redessiner) dessinerMarches(c);
        if(wEtat.mesh.visible&&(t-tEtat>.12||redessiner)){ tEtat=t; ampHist[histPos]=ampL; histPos=(histPos+1)%ampHist.length; dessinerEtat(c,etat,ampL); }
        if(coins.visible&&(t-tCoin>.2||redessiner)){ tCoin=t; dessinerCoins(c,d,etat,ampL); }
      }
      // particules, pluie, neige, éclair
      const pr=rendu.getPixelRatio();
      pluie.visible=q<2&&pluieV>.04; if(pluie.visible){ pluie.geometry.setDrawRange(0,2*Math.round(NPL*pluieV*(q===0?1:.6))); uPl.u_slant.value=.12+vent*.9; }
      neige.visible=q<2&&neigeV>.04; if(neige.visible){ neige.geometry.setDrawRange(0,Math.round(NNE*neigeV*(q===0?1:.6))); }
      if(q<2&&orage>.25&&!fige){ prochainEclair-=dt; if(prochainEclair<=0){ flash=.38; prochainEclair=3+Math.random()*9/(.4+orage); } }
      flash=Math.max(0,flash-dt); eclair.visible=flash>0; uEc.u_fl.value=flash>0?Math.min(1,flash*4)*(.6+.4*Math.random()):0;
      // réticules
      if(q===0) for(const r of reticules){
        if(!fige) r.t+=dt;
        if(r.t<0){ r.l.visible=false; continue; }
        if(r.t>r.vie){ r.t=-(1.5+Math.random()*3); r.l.visible=false; r.pos=false; continue; }
        if(!r.pos){                                                  // nouvelle position : hors du cœur et des cellules
          let x=0,y=0,ok=false;
          for(let g=0;g<30&&!ok;g++){ x=(Math.random()-.5)*(W-120); y=(Math.random()-.5)*(H-160); ok=Math.hypot(x-wx(noyau.cx),y-wy(noyau.cy))>noyau.R*1.05&&!placement.some(p=>Math.abs(wx(p.cx)-x)<p.c*.55&&Math.abs(wy(p.cy)-y)<p.c*.55); }
          if(!ok){ r.t=-2; continue; } r.x=x; r.y=y; r.s=16+Math.random()*12; r.pos=true; r.l.visible=true;
        }
        const u=r.t/r.vie, ouvert=1-lisse(0,.22,u), clignote=(u>.22&&u<.34)?(Math.sin((u-.22)*90)>0?1:.25):1, sortie=1-lisse(.85,1,u);
        r.l.position.set(r.x,r.y,0); r.l.scale.setScalar(r.s*(1+ouvert*2.4)); r.l.rotation.z=ouvert*.8;
        r.m.opacity=(.15+.7*(1-ouvert))*clignote*sortie*k;
      }
      else reticules.forEach(r=>{ r.l.visible=false; });
      rendu.render(scene,camera);
    }
    function dessinerCoins(c,d,etat,amp){
      const g=gC, S=768, f=clamp(noyau.R*.042,9,13)*(384/noyau.R), lh=f*1.3, m=f*.9;     // texte compact, dans les quatre coins du carré du cœur (hors du cercle)
      g.clearRect(0,0,S,S); g.fillStyle='#fff'; g.textBaseline='top';
      const p=n=>String(n).padStart(2,'0'), jit=(a,b)=>(a+Math.random()*b).toFixed(1);
      let lieu=null; try{ lieu=UI.ambiance.etat().lieu; }catch(e){} lieu=lieu||{lat:43.6063,lon:2.2411};
      const bloc=(x,y,al,lignes)=>{ g.textAlign=al; lignes.forEach((l,i)=>{ g.globalAlpha=i===0?.95:.6; g.font=(i===0?'bold ':'')+Math.round(f)+'px '+MONO; g.fillText(l,x,y+i*lh); }); };
      bloc(m,m,'left',['SYS // RAYLÉ','NOYAU '+jit(97,2.5)+'%','FLUX '+Math.round(amp*100+12*Math.random())+' MB/S']);
      bloc(S-m,m,'right',[p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()),JOURS[d.getDay()]+' '+p(d.getDate())+' '+MOIS[d.getMonth()],NOM_ETAT[etat]||'EN LIGNE']);
      bloc(m,S-m-lh*3,'left',['LAT '+Math.abs(lieu.lat).toFixed(3)+(lieu.lat>=0?' N':' S'),'LON '+Math.abs(lieu.lon).toFixed(3)+(lieu.lon>=0?' E':' O'),'ALT '+jit(143,4)+' M']);
      bloc(S-m,S-m-lh*3,'right',['LIAISON ÉTABLIE','SIGNAL '+jit(98,1.8)+'%','0x'+Math.floor(Math.random()*65535).toString(16).toUpperCase().padStart(4,'0')]);
      g.globalAlpha=1; texCoin.needsUpdate=true;
    }
    function detruire(){
      scene.traverse(x=>{ if(x.geometry) x.geometry.dispose(); if(x.material){ (Array.isArray(x.material)?x.material:[x.material]).forEach(m=>{ if(m.map) m.map.dispose(); m.dispose(); }); } });
      [texDeg,texCoin,wHeure.tex,wMeteo.tex,wMarches.tex,wEtat.tex].forEach(x=>x.dispose());
      rendu.dispose(); try{ rendu.forceContextLoss(); }catch(e){}
    }
    const etat=()=>({q,W,H,coeur:noyau,cellules:cellules.length,placement:placement.map(p=>p.nom+':'+Math.round(p.c)),circuits:!!circuits,petit,visibles:{globe:globe.visible,mol:mol.visible,piece:piece.visible,onde:wave.visible,heure:wHeure.mesh.visible,marches:wMarches.mesh.visible,coins:coins.visible}});
    return {taille,image,qualite,detruire,etat,THREE,test:{
      figer:(f)=>{ fige=f||null; },                                   // {t, etat, amp} : image fixe reproductible
      seul:(parts)=>{ seulP=Object.assign({coeur:true,decor:true,holo:true,widgets:true,coins:true},parts||{}); appliquerSeul(); },   // images fixes : ne montrer que certaines couches (réappliqué après chaque recadrage)
      coeurForce:(f)=>{ forcer=f; agencer(); placerCoeur(); poser(); bâtirCircuits(); },
      sansPieces:()=>{ if(circuits) circuits.visible=noeuds.visible=false; particules.visible=false; },
      cellules:()=>cellules.slice(),
      eclair:()=>{ flash=.38; }
    }};
  };
  UI.fondsReels.jarvisCadrage={rayonCoeur:.46};      // le cœur pré-rendu occupe 92 % de la largeur de son image (anneau extérieur compris)
})();
