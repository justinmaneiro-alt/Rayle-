"use strict";
/* ═════════════ FOND « VILLE 3D » : survol en drone d'une ville de nuit générée (three.js, chargé à la demande) ═════════════
   Tout est généré au chargement, aucune image à télécharger :
   - immeubles : UN InstancedMesh ; les milliers de fenêtres sont dessinées par le shader (grille par étage, allumées au hasard,
     quelques-unes qui s'allument ou s'éteignent avec le temps), sommets sombres, brouillard au loin ;
   - circulation : UN nuage de points animé par le shader (phares blancs dans un sens, feux arrière rouges dans l'autre) ;
   - feux rouges clignotants en haut des plus hautes tours : UN nuage de points ;
   - sol mouillé (reflet léger des rues éclairées et du ciel) + ciel en dégradé : deux maillages.
   Environ 5 appels de dessin, aucun post-traitement. Les lumières d'ambiance (ciel, brouillard, quelques enseignes) suivent le thème.
   Qualité q : 0 complète · 1 allégée · 2 minimale (moins d'immeubles, de voitures et de pixels).
   RayleUI.fondsReels.ville3d(canvas, {q}) → {taille(), image(now, dt), qualite(q), detruire()} */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  UI.fondsReels=UI.fondsReels||{};

  const ILOT=46, RUE=14, PAS=ILOT+RUE, DEMI=18;         // îlots de 46 m, rues de 14 m, 37 × 37 îlots (le bord se perd dans le brouillard)
  const TAILLE=PAS*(2*DEMI+1);
  const COMMUN=`
uniform vec3 u_brume; uniform float u_densite;
float brouillard(float d){ return 1.0-exp(-pow(d*u_densite,1.6)); }
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
`;
  const VS_IMM=`
attribute float a_seed;
varying vec3 v_wp; varying vec3 v_n; varying vec3 v_loc; varying vec3 v_taille; varying float v_seed;
void main(){
  vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0);
  v_wp=wp.xyz; v_seed=a_seed;
  v_n=normalize(mat3(instanceMatrix)*normal);
  v_loc=position+0.5;
  v_taille=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
  gl_Position=projectionMatrix*viewMatrix*wp;
}`;
  const FS_IMM=COMMUN+`
uniform float u_temps; uniform vec3 u_theme;
varying vec3 v_wp; varying vec3 v_n; varying vec3 v_loc; varying vec3 v_taille; varying float v_seed;
void main(){
  vec3 n=normalize(v_n);
  float h=v_loc.y*v_taille.y;
  vec3 facade=vec3(0.035,0.04,0.06)*(0.6+0.4*v_loc.y);
  vec3 c=facade;
  if(abs(n.y)<0.5){
    // coordonnées de la façade en mètres
    float u=abs(n.x)>0.5 ? v_loc.z*v_taille.z : v_loc.x*v_taille.x;
    vec2 cell=vec2(floor(u/2.6),floor(h/3.3));
    vec2 f=vec2(fract(u/2.6),fract(h/3.3));
    float fenetre=step(0.18,f.x)*step(f.x,0.82)*step(0.22,f.y)*step(f.y,0.78);
    float etage=step(3.3,h);                                         // rez-de-chaussée : vitrines
    float face=n.x>0.5?1.0:n.x<-0.5?2.0:n.z>0.5?3.0:4.0;
    vec2 id=cell+vec2(face*31.7+v_seed*97.0,v_seed*53.0);
    float taux=0.18+0.45*fract(v_seed*7.13);                          // chaque immeuble a son taux d'occupation
    float r=hash(id);
    float creneau=floor(u_temps/(18.0+40.0*hash(id+3.1))+hash(id+7.7)*10.0);
    float bascule=step(0.93,hash(id+creneau));                        // quelques fenêtres changent d'état avec le temps
    float allume=abs(step(r,taux)-bascule);
    float teinte=hash(id+1.3);
    vec3 lumiere=teinte<0.55?vec3(1.0,0.78,0.45):teinte<0.85?vec3(0.85,0.9,1.0):teinte<0.95?vec3(1.0,0.95,0.8):u_theme;
    lumiere*=0.55+0.45*hash(id+2.9);
    c+=fenetre*etage*allume*lumiere*0.9;
    c+=fenetre*(1.0-etage)*vec3(0.9,0.7,0.5)*0.35*step(0.4,hash(id+5.0));
    // éclairage des rues sur le bas des façades
    c+=vec3(1.0,0.6,0.3)*0.10*exp(-h*0.12);
  }else{
    c=vec3(0.02,0.022,0.03)+u_theme*0.02;
  }
  float d=length(v_wp-cameraPosition);
  c=mix(c,u_brume,brouillard(d));
  gl_FragColor=vec4(c,1.0);
}`;
  const VS_SOL=`
varying vec3 v_wp;
void main(){ vec4 wp=modelMatrix*vec4(position,1.0); v_wp=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`;
  const FS_SOL=COMMUN+`
uniform float u_pas,u_ilot; uniform vec3 u_theme,u_ciel;
varying vec3 v_wp;
void main(){
  vec2 p=mod(v_wp.xz+u_ilot*0.5,u_pas);                               // 0..ilot : îlot ; ilot..pas : rue
  vec2 dr=step(u_ilot,p);                                             // 1 dans la rue
  float rue=max(dr.x,dr.y);
  vec2 milieu=abs(p-u_ilot-(u_pas-u_ilot)*0.5);
  float axe=max(step(milieu.x,0.25)*dr.x,step(milieu.y,0.25)*dr.y);  // marquage central
  vec3 c=mix(vec3(0.012,0.013,0.018),vec3(0.03,0.028,0.03),rue);
  // lampadaires : halos orangés sur la chaussée
  vec2 q=mod(v_wp.xz,22.0)-11.0;
  c+=rue*vec3(1.0,0.62,0.3)*0.13*exp(-dot(q,q)*0.02);
  c+=axe*vec3(0.25,0.22,0.15)*0.25;
  // sol mouillé : reflet du ciel et de la ville vu en rasant
  vec3 v=normalize(cameraPosition-v_wp);
  float fres=pow(1.0-max(v.y,0.0),4.0);
  c+=(u_ciel*0.8+vec3(0.06,0.05,0.04))*fres*0.6*rue;
  float d=length(v_wp-cameraPosition);
  c=mix(c,u_brume,brouillard(d));
  gl_FragColor=vec4(c,1.0);
}`;
  const VS_CIEL=`
varying vec3 v_d;
void main(){ v_d=normalize(position); gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }`;
  const FS_CIEL=`
uniform vec3 u_ciel,u_brume;
varying vec3 v_d;
void main(){
  float y=v_d.y;
  vec3 c=mix(u_brume,vec3(0.006,0.007,0.014),smoothstep(0.0,0.45,y));
  c+=u_ciel*0.35*exp(-max(y,0.0)*9.0);                               // lueur de la ville sur l'horizon
  gl_FragColor=vec4(c,1.0);
}`;
  const VS_AUTOS=COMMUN+`
attribute vec4 a_voie;    // axe (0 = le long de x, 1 = le long de z), position de la voie, départ, vitesse (signée)
uniform float u_temps,u_long,u_px;
varying float v_rouge; varying float v_brume;
void main(){
  float s=mod(a_voie.z+u_temps*a_voie.w,u_long)-u_long*0.5;
  vec3 p=a_voie.x<0.5 ? vec3(s,0.7,a_voie.y) : vec3(a_voie.y,0.7,s);
  v_rouge=step(a_voie.w,0.0);
  vec4 mv=viewMatrix*vec4(p,1.0);
  v_brume=brouillard(-mv.z);
  gl_PointSize=u_px*(v_rouge>0.5?0.8:1.0)*(330.0/max(-mv.z,1.0));
  gl_Position=projectionMatrix*mv;
}`;
  const FS_AUTOS=COMMUN+`
varying float v_rouge; varying float v_brume;
void main(){
  float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d); a*=a;
  vec3 c=v_rouge>0.5?vec3(1.0,0.12,0.08)*1.6:vec3(1.0,0.95,0.85)*1.8;
  a=sqrt(a)*(1.0-v_brume)*(v_rouge>0.5?0.85:1.0);
  gl_FragColor=vec4(c*a,a);
}`;
  const VS_BALISES=COMMUN+`
attribute float a_phase; uniform float u_temps,u_px;
varying float v_a;
void main(){
  vec4 mv=viewMatrix*vec4(position,1.0);
  float cl=step(0.55,fract(u_temps*0.5+a_phase));                  // clignote toutes les 2 s
  v_a=cl*(1.0-brouillard(-mv.z));
  gl_PointSize=u_px*(320.0/max(-mv.z,1.0));
  gl_Position=projectionMatrix*mv;
}`;
  const FS_BALISES=`
varying float v_a;
void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d); a=a*a*v_a; gl_FragColor=vec4(vec3(1.0,0.1,0.05)*a,a); }`;

  UI.fondsReels.ville3d=async function(canvas,o){
    o=o||{};
    const THREE=await UI.three();
    const rendu=new THREE.WebGLRenderer({canvas,alpha:false,antialias:false,powerPreference:'low-power'});
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(58,1,1,2600);
    let g0=20261011; const rnd=()=>{ g0=(g0*1664525+1013904223)>>>0; return g0/4294967296; };
    const brume=new THREE.Color(), ciel=new THREE.Color(), theme=new THREE.Color();
    const UC={u_brume:{value:brume},u_densite:{value:1/850},u_temps:{value:0},u_theme:{value:theme},u_ciel:{value:ciel}};

    // ── immeubles : plus hauts vers le centre (quartier d'affaires) ──
    const lots=[];
    for(let i=-DEMI;i<=DEMI;i++) for(let j=-DEMI;j<=DEMI;j++){
      const cx=i*PAS, cz=j*PAS, dc=Math.hypot(cx,cz)/(TAILLE*.5);
      if(rnd()<.05+.25*Math.max(0,dc-.7)) continue;                      // un parc de temps en temps, plus d'espace en périphérie
      const n=1+Math.floor(rnd()*2.6), m=1+Math.floor(rnd()*2.6), w=ILOT/n, l=ILOT/m;
      for(let a=0;a<n;a++) for(let b=0;b<m;b++){
        const centre=Math.exp(-dc*dc*6);
        const haut=(8+rnd()*24)*(1+centre*(1.4+rnd()*4))*(rnd()<.05?1.7:1);
        lots.push({x:cx-ILOT/2+w*(a+.5),z:cz-ILOT/2+l*(b+.5),w:w*(.62+rnd()*.3),l:l*(.62+rnd()*.3),h:haut,s:rnd()});
      }
    }
    lots.sort((a,b)=>a.s-b.s);                                           // ordre aléatoire : réduire le nombre garde une ville homogène
    const nbImm=lots.length;
    const geoBoite=new THREE.BoxGeometry(1,1,1); geoBoite.translate(0,.5,0);
    const matImm=new THREE.ShaderMaterial({uniforms:UC,vertexShader:VS_IMM,fragmentShader:FS_IMM});
    const immeubles=new THREE.InstancedMesh(geoBoite,matImm,nbImm);
    const seeds=new Float32Array(nbImm), m4=new THREE.Matrix4();
    lots.forEach((x,i)=>{ m4.makeScale(x.w,x.h,x.l).setPosition(x.x,0,x.z); immeubles.setMatrixAt(i,m4); seeds[i]=x.s; });
    geoBoite.setAttribute('a_seed',new THREE.InstancedBufferAttribute(seeds,1));
    immeubles.frustumCulled=false;
    scene.add(immeubles);

    // ── sol et ciel ──
    const sol=new THREE.Mesh(new THREE.PlaneGeometry(TAILLE*3,TAILLE*3),new THREE.ShaderMaterial({uniforms:Object.assign({u_pas:{value:PAS},u_ilot:{value:ILOT}},UC),vertexShader:VS_SOL,fragmentShader:FS_SOL}));
    sol.rotation.x=-Math.PI/2; sol.position.set(PAS/2,0,PAS/2); scene.add(sol);
    const voute=new THREE.Mesh(new THREE.SphereGeometry(2400,32,16),new THREE.ShaderMaterial({uniforms:UC,vertexShader:VS_CIEL,fragmentShader:FS_CIEL,side:THREE.BackSide,depthWrite:false}));
    scene.add(voute);

    // ── circulation : phares blancs dans un sens, feux arrière rouges dans l'autre ──
    const nbAutos=9000, voies=new Float32Array(nbAutos*4), pAutos=new Float32Array(nbAutos*3);
    for(let k=0;k<nbAutos;k++){
      const axe=rnd()<.5?0:1, rue=Math.floor(rnd()*(2*DEMI+1))-DEMI, sens=rnd()<.5?1:-1;
      voies[k*4]=axe; voies[k*4+1]=rue*PAS+PAS/2+(sens>0?-3:3);   // milieu de la rue (entre deux îlots), une voie par sens
      voies[k*4+2]=rnd()*TAILLE*3; voies[k*4+3]=sens*(9+rnd()*9);
    }
    const gA=new THREE.BufferGeometry(); gA.setAttribute('position',new THREE.BufferAttribute(pAutos,3)); gA.setAttribute('a_voie',new THREE.BufferAttribute(voies,4));
    const UA=Object.assign({u_long:{value:TAILLE},u_px:{value:4.5}},UC);
    const autos=new THREE.Points(gA,new THREE.ShaderMaterial({uniforms:UA,vertexShader:VS_AUTOS,fragmentShader:FS_AUTOS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
    autos.frustumCulled=false; scene.add(autos);

    // ── balises rouges en haut des tours ──
    const tours=lots.filter(x=>x.h>95), pb=new Float32Array(tours.length*3), ph=new Float32Array(tours.length);
    tours.forEach((x,i)=>{ pb[i*3]=x.x; pb[i*3+1]=x.h+1.5; pb[i*3+2]=x.z; ph[i]=rnd(); });
    const gB=new THREE.BufferGeometry(); gB.setAttribute('position',new THREE.BufferAttribute(pb,3)); gB.setAttribute('a_phase',new THREE.BufferAttribute(ph,1));
    const UB=Object.assign({u_px:{value:3}},UC);
    const balises=new THREE.Points(gB,new THREE.ShaderMaterial({uniforms:UB,vertexShader:VS_BALISES,fragmentShader:FS_BALISES,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
    balises.frustumCulled=false; scene.add(balises);

    let q=Math.max(0,Math.min(2,o.q|0)), W=1, H=1, t=rnd()*500;
    const cible=new THREE.Vector3();
    function appliquerQualite(){
      const pr=[Math.min(window.devicePixelRatio||1,1.5),.85,.6][q];
      rendu.setPixelRatio(pr);
      immeubles.count=Math.round(nbImm*[1,.7,.45][q]);
      gA.setDrawRange(0,Math.round(nbAutos*[1,.6,.3][q]));
      UA.u_px.value=4.5*pr; UB.u_px.value=3*pr;
      if(W>1) rendu.setSize(W,H,false);
    }
    // trajectoire du drone : un grand huit lent au-dessus du centre, avec de légères variations d'altitude
    function position(tt,v){
      const w=.012;
      v.set(Math.sin(tt*w)*TAILLE*.28, 290+35*Math.sin(tt*w*1.7+1), Math.sin(tt*w*2)*TAILLE*.16);
      return v;
    }
    return {
      taille(){
        W=Math.round(innerWidth*1.06); H=Math.round(innerHeight*1.06);
        camera.aspect=W/H; camera.fov=W/H<1?72:58; camera.updateProjectionMatrix();
        appliquerQualite();
      },
      qualite(n){ q=Math.max(0,Math.min(2,n|0)); appliquerQualite(); },
      image(now,dt){
        const c=UI.couleurs();
        theme.setRGB(c[0][0]/255,c[0][1]/255,c[0][2]/255);
        ciel.setRGB(c[1][0]/255*.35+.05,c[1][1]/255*.35+.04,c[1][2]/255*.35+.05);
        brume.setRGB(c[3][0]/255*.10+.035,c[3][1]/255*.10+.03,c[3][2]/255*.10+.045);
        t+=dt; UC.u_temps.value=t;
        position(t,camera.position);
        position(t+2,cible); cible.sub(camera.position).setY(0).normalize().multiplyScalar(420).add(camera.position); cible.y=15;   // regarde 420 m devant, en plongée douce
        camera.lookAt(cible);
        rendu.render(scene,camera);
      },
      detruire(){
        scene.traverse(x=>{ if(x.geometry) x.geometry.dispose(); if(x.material) x.material.dispose(); });
        rendu.dispose(); try{ rendu.forceContextLoss(); }catch(e){}
      }
    };
  };
})();
