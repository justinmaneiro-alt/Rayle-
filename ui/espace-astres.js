"use strict";
/* ═════════════ ASTRES RÉALISTES DU FOND « ESPACE » : shaders et textures réelles (RayleUI.espaceAstres) ═════════════
   Ce fichier ne dessine rien lui-même : il fournit à ui/fond-espace.js
   - les shaders des corps (lumière du Soleil avec terminateur doux, relief simulé, atmosphère en fresnel, nuages de Vénus, bandes de Jupiter,
     Grande Tache rouge, ombre des anneaux de Saturne sur la planète), des anneaux, du Soleil (surface granuleuse, couronne, éruptions),
     de la Terre (relief, reflet du Soleil sur les océans, nuages fins et leur ombre, atmosphère au limbe) ;
   - la table des planètes (pôle de rotation IAU, vitesse, couleurs simples du palier 2) ;
   - le chargeur de textures réelles : ui/assets/espace/<nom>-1k.webp (défaut) ou -2k.webp (palier 0 sur appareil capable, pour l'astre visité),
     à la demande, une seule fois, libérées quand le palier baisse. Hors ligne ou fichier absent : le fond retombe sur les textures dessinées
     par ui/espace-textures.js, rien ne casse. Sources et licences : ui/assets/CREDITS.txt.
   Paliers : q0 textures complètes + relief + atmosphères ; q1 textures 1k, sans relief ; q2 couleurs simples, sans texture. */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  const BASE=(()=>{ try{ return new URL('ui/assets/espace/',document.baseURI).href; }catch(e){ return 'ui/assets/espace/'; } })();

  /* ───── bruit commun aux shaders ───── */
  const BRUIT=`
float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float h31(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn2(vec2 x){ vec2 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),f.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),f.x),f.y); }
float vn3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1.0,0.0,0.0)),f.x),mix(h31(i+vec3(0.0,1.0,0.0)),h31(i+vec3(1.0,1.0,0.0)),f.x),f.y),
             mix(mix(h31(i+vec3(0.0,0.0,1.0)),h31(i+vec3(1.0,0.0,1.0)),f.x),mix(h31(i+vec3(0.0,1.0,1.0)),h31(i+vec3(1.0,1.0,1.0)),f.x),f.y),f.z); }
float lum3(vec3 c){ return dot(c,vec3(0.30,0.59,0.11)); }`;

  /* ───── corps rocheux ou gazeux ───── */
  const VS_CORPS=`
varying vec2 v_uv; varying vec3 v_n; varying vec3 v_w; varying vec3 v_vue; varying vec3 v_loc; varying vec3 v_E; varying vec3 v_Nn;
void main(){
  v_uv=uv; v_loc=position;
  vec4 wp=modelMatrix*vec4(position,1.0);
  vec3 nl=normalize(position);
  vec3 e=cross(vec3(0.0,1.0,0.0),nl); if(length(e)<1e-3) e=vec3(0.0,0.0,-1.0); e=normalize(e);
  v_E=mat3(modelMatrix)*e; v_Nn=mat3(modelMatrix)*cross(nl,e);
  v_w=wp.xyz; v_n=normalize(mat3(modelMatrix)*normal); v_vue=normalize(cameraPosition-wp.xyz);
  gl_Position=projectionMatrix*viewMatrix*wp;
}`;
  const FS_CORPS=BRUIT+`
uniform sampler2D u_map, u_ring; uniform vec3 u_sunPos,u_col,u_atmo,u_shine,u_earthDir,u_ringN,u_ringC;
uniform vec2 u_texel,u_term,u_ringR; uniform float u_gain,u_hasMap,u_amb,u_atmoK,u_bump,u_limb,u_anim,u_t,u_flat,u_ringOn,u_rimP;
varying vec2 v_uv; varying vec3 v_n; varying vec3 v_w; varying vec3 v_vue; varying vec3 v_loc; varying vec3 v_E; varying vec3 v_Nn;
vec2 animer(vec2 uv){
  if(u_anim<0.5) return uv;
  float lat=(uv.y-0.5)*3.14159265;
  if(u_anim>2.5){                                              // Saturne : très léger balancement des bandes
    uv.x+=0.0016*sin(u_t*0.06+lat*15.0);
    return uv;
  }
  if(u_anim>1.5){                                              // Jupiter : bandes qui coulent doucement (balancement borné, la Grande Tache reste en place) + tourbillon de la tempête
    uv.x+=0.0034*sin(u_t*0.07+lat*13.0)+0.0017*sin(u_t*0.13+lat*31.0+1.7);
    uv+=0.0014*vec2(vn2(uv*vec2(48.0,96.0)+vec2(u_t*0.05,0.0))-0.5,vn2(uv*vec2(60.0,120.0)+vec2(-u_t*0.04,7.0))-0.5);
    vec2 d=(uv-vec2(0.371,0.391))*vec2(1.0,2.0); float r2=dot(d,d);   // Grande Tache rouge : l'image tourne lentement autour de son centre
    float a=0.55*sin(u_t*0.21)*exp(-r2/0.0016);
    float ca=cos(a), sa=sin(a); d=vec2(ca*d.x-sa*d.y,sa*d.x+ca*d.y); uv=vec2(0.371,0.391)+d*vec2(1.0,0.5);
    return uv;
  }
  return uv;                                                   // Vénus : traité à part (deux couches de nuages), voir main
}
vec3 echantillon(vec2 uv){
  if(u_anim>0.5&&u_anim<1.5){                                  // Vénus : deux couches de nuages qui dérivent à des vitesses différentes, cisaillées par la latitude
    float lat=(uv.y-0.5)*3.14159265;
    vec2 a=vec2(uv.x+u_t*0.0042*(1.0+0.35*cos(lat*2.0)),uv.y);
    vec2 b=vec2(uv.x*1.0-u_t*0.0019+0.31+0.012*sin(uv.y*18.0+u_t*0.08),uv.y+0.012*sin(uv.x*25.0+u_t*0.06));
    vec3 c1=texture2D(u_map,a).rgb, c2=texture2D(u_map,b).rgb;
    vec3 c=mix(c1,c2,0.42); float m=lum3(c);
    c=(c-m)*1.45+m;                                            // les nuages ressortent un peu plus
    float f=vn2(vec2(uv.x*18.0+u_t*0.05,uv.y*9.0)); c*=0.92+0.16*f;
    return c;
  }
  return texture2D(u_map,uv).rgb;
}
void main(){
  vec3 Ng=normalize(v_n), N=Ng, Vv=normalize(v_vue);
  vec2 uv=animer(v_uv);
  vec3 alb=u_hasMap>0.5?echantillon(uv):u_col;
  if(u_bump>0.0&&u_hasMap>0.5){                                // relief simulé : pente de la luminance de la texture, repère est / nord de la sphère
    float hE=lum3(texture2D(u_map,uv+vec2(u_texel.x,0.0)).rgb)-lum3(texture2D(u_map,uv-vec2(u_texel.x,0.0)).rgb);
    float hN=lum3(texture2D(u_map,uv+vec2(0.0,u_texel.y)).rgb)-lum3(texture2D(u_map,uv-vec2(0.0,u_texel.y)).rgb);
    float cl=max(length(v_loc.xz)/length(v_loc),0.3);
    N=normalize(Ng-u_bump*(hE/cl*normalize(v_E)+hN*normalize(v_Nn)));
  }
  vec3 L=normalize(u_sunPos-v_w);
  float dg=dot(Ng,L), d=dot(N,L);
  float term=smoothstep(u_term.x,u_term.y,dg);                 // terminateur : net pour les corps sans air, doux pour les atmosphères
  float lum=term*(u_flat+(1.0-u_flat)*clamp(d,0.0,1.0));
  if(u_ringOn>0.5){                                            // ombre des anneaux sur la planète
    vec3 P=v_w-u_ringC; float nl=dot(u_ringN,L);
    if(abs(nl)>0.002){ float s=-dot(u_ringN,P)/nl; if(s>0.0){ float r=length(P+L*s); float t=(r-u_ringR.x)/(u_ringR.y-u_ringR.x);
      if(t>0.0&&t<1.0){ float a=texture2D(u_ring,vec2(t,0.5)).a; lum*=1.0-0.82*a; } } }
  }
  alb*=u_gain;
  vec3 c=alb*(u_amb+lum*(1.0-u_amb));
  float es=max(dot(N,u_earthDir),0.0)*(1.0-term);              // lueur cendrée : la Terre éclaire la face nuit de la Lune
  c+=alb*u_shine*es;
  float nv=max(dot(Ng,Vv),0.0);
  c*=mix(1.0,0.42+0.58*pow(nv,0.45),u_limb);                   // assombrissement du bord des géantes
  float f=pow(1.0-nv,u_rimP);                                  // atmosphère en fresnel, plus vive côté jour
  c+=u_atmo*f*u_atmoK*(0.15+0.85*smoothstep(-0.3,0.55,dg));
  gl_FragColor=vec4(c,1.0);
}`;
  const FS_LUEUR=`
uniform vec3 u_c, u_sunPos; uniform float u_k;
varying vec3 v_n; varying vec3 v_w; varying vec3 v_vue; varying vec2 v_uv; varying vec3 v_loc; varying vec3 v_E; varying vec3 v_Nn;
void main(){
  vec3 n=normalize(v_n);
  float f=pow(max(0.0,0.70+dot(n,v_vue)),4.0);
  float lit=0.25+0.75*smoothstep(-0.45,0.5,dot(n,normalize(u_sunPos-v_w)));
  gl_FragColor=vec4(u_c*f*lit*u_k,f*lit*u_k);
}`;
  const FS_ANNEAU=`
uniform sampler2D u_ring; uniform vec3 u_sunPos, u_ctr; uniform float u_R, u_in, u_out, u_flat;
varying vec3 v_n; varying vec3 v_w; varying vec3 v_vue; varying vec2 v_uv; varying vec3 v_loc; varying vec3 v_E; varying vec3 v_Nn;
void main(){
  float t=(length(v_loc.xy)-u_in)/(u_out-u_in);
  vec4 s=texture2D(u_ring,vec2(clamp(t,0.0,1.0),0.5));
  vec3 L=normalize(u_sunPos-v_w), P=v_w-u_ctr;
  float b=dot(P,L), perp=sqrt(max(dot(P,P)-b*b,0.0));
  float sh=(-b>0.0)?mix(0.07,1.0,smoothstep(u_R*0.965,u_R*1.035,perp)):1.0;       // ombre de la planète sur ses anneaux, bord adouci
  float face=0.5+0.5*abs(dot(normalize(v_n),L));
  vec3 rgb=s.rgb*1.55; if(u_flat>0.5) rgb=vec3(0.80,0.72,0.55)*(0.5+0.5*s.a);
  gl_FragColor=vec4(rgb*(0.20+1.0*face)*sh,s.a*0.96);
}`;

  /* ───── Soleil : disque granuleux, couronne, éruptions (un seul plan toujours face à la caméra) ───── */
  const VS_SOLEIL=`
uniform float u_taille; varying vec2 v_p;
void main(){
  v_p=position.xy*2.0;                                          // −1 … 1
  vec4 c=modelViewMatrix*vec4(0.0,0.0,0.0,1.0);
  gl_Position=projectionMatrix*(c+vec4(position.xy*u_taille,0.0,0.0));
}`;
  const FS_SOLEIL=BRUIT+`
uniform float u_t, u_ext, u_det, u_k; varying vec2 v_p;
void main(){
  vec2 p=v_p*u_ext; float r=length(p);                          // r en rayons du Soleil
  vec3 col=vec3(0.0); float alpha=0.0;
  if(r<1.0){
    float nz=sqrt(1.0-r*r); vec3 s=vec3(p,nz);
    float ang=u_t*0.02; vec3 q=vec3(s.x*cos(ang)+s.z*sin(ang),s.y,-s.x*sin(ang)+s.z*cos(ang));   // rotation lente
    float g=vn3(q*16.0+vec3(0.0,0.0,u_t*0.05))*0.5+vn3(q*38.0-vec3(u_t*0.07,0.0,0.0))*0.5;
    if(u_det>0.5) g=g*0.75+vn3(q*90.0+vec3(0.0,u_t*0.09,0.0))*0.25;
    float cell=smoothstep(0.25,0.78,g);                         // fins granules clairs, intervalles un peu plus sombres
    float large=vn3(q*3.5+vec3(2.0,0.0,u_t*0.01));              // plages plus chaudes, très douces
    float tache=smoothstep(0.86,0.94,vn3(q*2.6+vec3(5.0,1.0,2.0)))*smoothstep(0.5,0.15,abs(q.y))*0.35;   // une tache discrète, rare, près de l'équateur
    float limb=0.42+0.58*pow(nz,0.6);                           // assombrissement du bord
    vec3 chaud=vec3(1.0,0.84,0.46), froid=vec3(0.96,0.46,0.10);
    col=mix(froid,chaud,clamp(0.30+0.68*cell+0.30*(large-0.5),0.0,1.0))*mix(vec3(1.0,0.66,0.34),vec3(1.0),pow(nz,0.5))*limb*(1.0-0.5*tache);
    col=min(col*0.92,vec3(0.93,0.88,0.70));                     // jamais aveuglant : le centre reste jaune-orangé, jamais blanc
    alpha=1.0;
  }
  float x=max(r-1.0,0.0);
  float a=atan(p.y,p.x);
  float rayons=vn2(vec2(a*5.0+u_t*0.02,r*0.6-u_t*0.05));
  float rayons2=vn2(vec2(a*13.0-u_t*0.03,r*1.3+u_t*0.04));
  float cor=exp(-x*2.8)*0.78+exp(-x*0.95)*(0.14+0.20*rayons*rayons+(u_det>0.5?0.10*rayons2:0.0));
  vec3 cc=mix(vec3(1.0,0.66,0.32),vec3(1.0,0.90,0.66),exp(-x*5.0));
  vec3 add=cc*cor*(r<1.0?0.55:1.0);
  if(u_det>0.5){                                                // éruptions : arcs de protubérance qui montent et retombent près du bord
    for(int i=0;i<2;i++){
      float per=21.0+7.0*float(i), ph=u_t/per+float(i)*0.43, k=floor(ph), f=fract(ph);
      float a0=h21(vec2(k,float(i)+3.0))*6.2831853;
      float da=atan(sin(a-a0),cos(a-a0));
      float amp=pow(sin(3.14159265*f),2.0), w=0.10+0.05*h21(vec2(k,7.0)), hh=0.10+0.16*h21(vec2(k,11.0));
      float arc=exp(-pow((x-hh*amp*(1.0-pow(da/w,2.0)))/0.022,2.0))*step(abs(da),w)*step(1.0,r);
      add+=vec3(1.0,0.33,0.16)*arc*amp*0.55;
    }
  }
  add*=smoothstep(u_ext,u_ext*0.55,r);                          // fondu aux bords du plan
  gl_FragColor=vec4(col+add*u_k,alpha);                         // avec CustomBlending : disque opaque, couronne additive
}`;

  /* ───── Terre : relief, reflet du Soleil sur les océans, ombre des nuages, atmosphère au limbe ───── */
  const VS_TERRE=VS_CORPS;
  const FS_TERRE=BRUIT+`
uniform sampler2D u_jour,u_nuit,u_relief,u_ocean,u_nuages; uniform vec3 u_soleil,u_atmo; uniform vec2 u_texel;
uniform float u_nuitForce,u_det,u_relK,u_hasOcean,u_dec,u_couv;
varying vec2 v_uv; varying vec3 v_n; varying vec3 v_w; varying vec3 v_vue; varying vec3 v_loc; varying vec3 v_E; varying vec3 v_Nn;
void main(){
  vec3 Ng=normalize(v_n), V=normalize(v_vue), N=Ng;
  vec3 E=normalize(v_E), Nn=normalize(v_Nn);
  if(u_det>0.5&&u_relK>0.0){ vec3 nm=texture2D(u_relief,v_uv).xyz*2.0-1.0; N=normalize(Ng+u_relK*(nm.x*E+nm.y*Nn)); }   // relief des montagnes
  float sg=dot(Ng,u_soleil), s=dot(N,u_soleil);
  float jourK=smoothstep(-0.10,0.22,sg);
  vec3 tj=texture2D(u_jour,v_uv).rgb;
  float shade=clamp(s*1.2+0.15,0.0,1.0);
  float nuage=0.0;
  if(u_det>0.5){                                                // ombre portée des nuages : on lit les nuages un peu décalés vers le Soleil
    float cl=max(length(v_loc.xz)/length(v_loc),0.3);
    vec2 off=vec2(dot(u_soleil,E)/cl,dot(u_soleil,Nn))*vec2(0.0046,0.0092);
    float ca=texture2D(u_nuages,vec2(fract(v_uv.x+u_dec-off.x),v_uv.y-off.y)).r;
    nuage=smoothstep(0.30,0.95,ca)*u_couv;
  }
  vec3 jour=tj*(0.30+0.85*shade)*(1.0-0.30*nuage*jourK);
  vec3 nuit=texture2D(u_nuit,v_uv).rgb;
  nuit=nuit*nuit*u_nuitForce+nuit*0.25;
  vec3 c=mix(nuit,jour,jourK);
  c+=vec3(1.0,0.45,0.15)*0.05*exp(-pow(sg*9.0,2.0))*(0.35+0.65*lum3(tj)*2.0);   // lueur orangée sur la ligne du crépuscule, plus discrète et modulée par le sol
  // reflet du Soleil sur les océans : masque réel (palier 0), sinon estimation par la couleur
  float oc=texture2D(u_ocean,v_uv).r;
  float ocean=mix(smoothstep(0.12,0.0,tj.r+tj.g*0.3-tj.b*0.4),smoothstep(0.35,0.7,oc),u_hasOcean);
  vec3 h=normalize(u_soleil+V); float nh=max(dot(N,h),0.0), nv=max(dot(N,V),0.0);
  float fres=0.04+0.96*pow(1.0-nv,5.0);
  float glint=pow(nh,u_det>0.5?140.0:60.0)*(u_det>0.5?1.1:0.5)+(u_det>0.5?pow(nh,14.0)*0.10:0.0);
  c+=vec3(1.0,0.93,0.80)*glint*ocean*jourK*(1.0-0.85*nuage);
  if(u_det>0.5) c+=mix(u_atmo,vec3(0.55,0.7,1.0),0.5)*fres*ocean*jourK*0.35*(1.0-nuage);
  // bord de l'atmosphère : bleu côté jour, orangé vers le crépuscule
  float f=pow(1.0-max(dot(Ng,V),0.0),3.0);
  vec3 ac=u_atmo; if(u_det>0.5) ac=mix(u_atmo,vec3(1.0,0.55,0.25),0.55*exp(-pow((sg-0.02)*4.5,2.0)));
  c+=ac*f*(0.35+0.65*jourK);
  gl_FragColor=vec4(c,1.0);
}`;
  const FS_NUAGES=BRUIT+`
uniform sampler2D u_nuages; uniform vec3 u_soleil; uniform float u_dec,u_couv;
varying vec2 v_uv; varying vec3 v_n; varying vec3 v_w; varying vec3 v_vue; varying vec3 v_loc; varying vec3 v_E; varying vec3 v_Nn;
void main(){
  vec2 uv=vec2(fract(v_uv.x+u_dec),v_uv.y);
  float a=texture2D(u_nuages,uv).r;
  float a2=texture2D(u_nuages,vec2(fract(uv.x*2.7+u_dec*0.6),uv.y*2.7)).r;    // détail fin : les nuages se déchirent, moins de bouillie
  float fin=smoothstep(0.34,0.94,a*0.80+a2*0.30*a);
  float s=dot(normalize(v_n),u_soleil);
  float l=smoothstep(-0.12,0.25,s);
  vec3 ombre=mix(vec3(0.70,0.75,0.84),vec3(1.0),smoothstep(0.2,0.9,a2));
  gl_FragColor=vec4(ombre*(0.05+0.95*l)*0.97,clamp(fin*(0.30+0.62*l)*u_couv,0.0,1.0));
}`;
  const FS_ATMO=`
uniform vec3 u_atmo; uniform vec3 u_soleil;
varying vec2 v_uv; varying vec3 v_n; varying vec3 v_w; varying vec3 v_vue; varying vec3 v_loc; varying vec3 v_E; varying vec3 v_Nn;
void main(){
  vec3 n=normalize(v_n); float sg=dot(n,u_soleil);
  float f=pow(max(0.0,0.72+dot(n,v_vue)),4.0);                  // face arrière : halo autour du limbe
  float fin=pow(max(0.0,0.90+dot(n,v_vue)),9.0);                // liseré brillant tout au bord
  float jour=0.35+0.65*smoothstep(-0.30,0.40,sg);
  vec3 c=mix(u_atmo,vec3(1.0,0.55,0.26),0.50*exp(-pow((sg-0.03)*4.2,2.0)));
  c=mix(c,vec3(0.8,0.9,1.0),0.25*fin);
  gl_FragColor=vec4(c*(f*1.35+fin*0.9)*jour,(f+fin*0.6)*jour);
}`;

  /* ───── table des planètes ─────
     ang : diamètre apparent (degrés, agrandi pour la composition) · pole : [ascension droite, déclinaison] du pôle nord de rotation (IAU) ·
     spin : degrés par jour (négatif = rotation rétrograde), joués ×TEMPS_ACCELERE · couleur : palier 2 (aucune texture) ·
     term : terminateur [début, fin] · flat : aplatissement de la lumière (gazeux) · limb : assombrissement du bord · anim : 1 Vénus, 2 Jupiter, 3 Saturne ·
     bump : force du relief (0 = aucun) · cadre : distance de la caméra en rayons lors d'une visite */
  const TEMPS_ACCELERE=60;
  const PLANETES={
    mercure:{ang:1.2,pole:[281.01,61.45],spin:6.1385,couleur:[.56,.53,.50],term:[-.02,.26],flat:0,limb:0,bump:2.4,gain:1.5,atmo:null,cadre:4.9},
    venus:  {ang:2.0,pole:[272.76,67.16],spin:-1.4813,couleur:[.90,.78,.55],term:[-.30,.60],flat:.30,limb:.45,bump:0,anim:1,atmo:[1,.84,.52],k:.42,cadre:4.9},
    mars:   {ang:1.8,pole:[317.68,52.89],spin:350.89,couleur:[.76,.40,.26],term:[-.03,.30],flat:0,limb:0,bump:1.6,gain:1.2,atmo:[1,.60,.50],k:.50,cadre:4.9},
    jupiter:{ang:3.6,pole:[268.06,64.50],spin:870.54,couleur:[.78,.65,.50],term:[-.20,.50],flat:.35,limb:.65,bump:0,anim:2,atmo:[.95,.82,.62],k:.45,cadre:9.5},
    saturne:{ang:3.0,pole:[40.59,83.54],spin:810.79,couleur:[.85,.76,.55],term:[-.20,.50],flat:.35,limb:.55,bump:0,anim:3,atmo:[.95,.85,.62],k:.40,cadre:11.5,anneaux:true},
    uranus: {ang:1.6,pole:[257.31,-15.18],spin:-501.16,couleur:[.60,.85,.88],term:[-.20,.50],flat:.30,limb:.55,bump:0,atmo:[.50,.90,1],k:.85,cadre:5.2},
    neptune:{ang:1.6,pole:[299.36,43.46],spin:536.31,couleur:[.30,.45,.85],term:[-.20,.50],flat:.30,limb:.55,bump:0,atmo:[.30,.50,1],k:.85,cadre:5.2}
  };
  const COULEUR_LUNE=[.62,.62,.60], GAIN_LUNE=1.75;                  // les roches sombres de la Lune et de Mercure sont éclaircies (exposition d'une photo)
  const RING={in:1.17,out:2.36};                                   // anneaux de Saturne en rayons de la planète : la texture s'étend de la division C au bord de l'anneau A

  /* ───── chargeur de textures (un par montage de la scène) ───── */
  function chargeur(THREE){
    const cache=new Map(), L=new THREE.TextureLoader();
    function tex(nom,res,opt){
      opt=opt||{}; const k=res?nom+'-'+res:nom; if(cache.has(k)) return cache.get(k).p;
      const e={t:null,p:null};
      e.p=new Promise((ok,ko)=>L.load(BASE+k+'.webp',t=>{
        t.anisotropy=opt.anis||4; t.wrapS=THREE.RepeatWrapping; t.wrapT=THREE.ClampToEdgeWrapping; t.colorSpace=THREE.NoColorSpace;
        if(opt.lineaire){ t.generateMipmaps=false; t.minFilter=THREE.LinearFilter; }
        e.t=t; ok(t);
      },undefined,()=>ko(new Error('texture '+k))));
      cache.set(k,e); e.p.catch(()=>{ if(cache.get(k)===e) cache.delete(k); }); return e.p;
    }
    function liberer(nom,res){ const k=res?nom+'-'+res:nom, e=cache.get(k); if(!e) return; cache.delete(k); if(e.t) e.t.dispose(); else e.p.then(t=>t.dispose(),()=>{}); }
    function toutLiberer(){ for(const [k,e] of cache){ if(e.t) e.t.dispose(); else e.p.then(t=>t.dispose(),()=>{}); } cache.clear(); }
    return {tex,liberer,toutLiberer,tailles:()=>[...cache.keys()]};
  }

  UI.espaceAstres={BASE,BRUIT,VS_CORPS,FS_CORPS,FS_LUEUR,FS_ANNEAU,VS_SOLEIL,FS_SOLEIL,VS_TERRE,FS_TERRE,FS_NUAGES,FS_ATMO,PLANETES,COULEUR_LUNE,GAIN_LUNE,RING,TEMPS_ACCELERE,chargeur};
})();
