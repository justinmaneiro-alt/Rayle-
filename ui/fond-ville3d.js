"use strict";
/* ═════════════ FOND « VILLE 3D » : Manhattan de nuit, survolée en drone (three.js, chargé à la demande) ═════════════
   Tout est généré au chargement, aucune image à télécharger. Inspiré de New York, sans le copier :
   - une île en long, quadrillée d'avenues (nord-sud) et de rues ; un grand parc sombre au milieu ; deux fleuves ; les rives d'en face ;
   - gratte-ciel variés : tours de verre (étages de bureaux éclairés), tours à gradins art déco avec flèche et couronne illuminée,
     tours crayon très fines, immeubles plus bas ; trois tours emblématiques ; un pont suspendu éclairé sur le fleuve de l'est ;
   - animations : survol en boucle (une avenue, puis un virage au-dessus du parc et du fleuve), phares blancs et feux arrière rouges,
     fenêtres qui s'allument et s'éteignent, feux rouges clignotants au sommet des tours, avions et hélicoptère, reflets qui ondulent.
   Appels de dessin : ciel, eau, sol, immeubles (1 InstancedMesh), flèches (1 InstancedMesh), voitures (points), lumières (points) = 7.
   Lumières d'ambiance (ciel, brume, couronnes) aux couleurs du thème ; fenêtres et voitures en couleurs réalistes.
   Qualité q : 0 complète · 1 allégée · 2 minimale (moins de pixels, d'immeubles bas et de voitures ; les tours restent).
   RayleUI.fondsReels.ville3d(canvas, {q}) → {taille(), image(now, dt), qualite(q), detruire()} */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  UI.fondsReels=UI.fondsReels||{};

  // ── plan de la ville (mètres) ──
  const ILE={x0:-470,x1:470,z0:-2600,z1:1750};             // l'île ; le nord est vers -z
  const AV={pas:140,larg:22,depart:-455};                    // avenues nord-sud
  const RUE={pas:62,larg:12,depart:-2600};                   // rues est-ouest
  const PARC={x0:-175,x1:127,z0:-1750,z1:-1000};
  const OUEST={x0:-3200,x1:-1250}, EST={x0:1300,x1:3600}, RIVES={z0:-3500,z1:3000};
  const PONT={z:-200,x0:470,x1:1300,haut:38,tours:[720,1050],hTour:130};

  const COMMUN=`
uniform vec3 u_brume; uniform float u_densite;
float brouillard(float d){ return 1.0-exp(-pow(d*u_densite,1.5)); }
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
`;
  /* ───── immeubles : fenêtres calculées en coordonnées du monde (étages = hauteur réelle) ───── */
  const VS_IMM=`
attribute vec4 a_info;      // graine, type (0 bas, 1 verre, 2 crayon, 3 art déco, 4 structure), hauteur totale, -
varying vec3 v_wp; varying vec3 v_n; varying vec4 v_info;
void main(){
  vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0);
  v_wp=wp.xyz; v_info=a_info;
  v_n=normalize(mat3(instanceMatrix)*normal);
  gl_Position=projectionMatrix*viewMatrix*wp;
}`;
  const FS_IMM=COMMUN+`
uniform float u_temps; uniform vec3 u_theme,u_ciel;
varying vec3 v_wp; varying vec3 v_n; varying vec4 v_info;
vec3 lumiereFenetre(float h){
  return h<0.45?vec3(1.0,0.78,0.48):h<0.75?vec3(1.0,0.88,0.66):h<0.93?vec3(0.82,0.88,1.0):vec3(1.0,0.66,0.35);
}
float allumee(vec2 id,float taux){
  float r=hash(id);
  float creneau=floor(u_temps/(16.0+40.0*hash(id+3.1))+hash(id+7.7)*10.0);
  float bascule=step(0.94,hash(id+creneau));                 // quelques fenêtres changent d'état avec le temps
  return abs(step(r,taux)-bascule);
}
void main(){
  vec3 n=normalize(v_n);
  float graine=v_info.x, type=v_info.y, sommet=v_info.z;
  vec3 V=normalize(cameraPosition-v_wp);
  float y=v_wp.y;
  vec3 c;
  if(n.y>0.5){
    c=vec3(0.016,0.018,0.024);                                  // toits
  }else{
    float u=abs(n.x)>0.5 ? v_wp.z : v_wp.x;
    float face=n.x>0.5?1.0:n.x<-0.5?2.0:n.z>0.5?3.0:4.0;
    if(type>3.5){
      c=vec3(0.05,0.05,0.055)+vec3(0.6,0.7,0.9)*0.05;            // pont, structures
    }else if(type>0.5 && type<1.5){
      // tour de verre : reflet du ciel, étages de bureaux éclairés, meneaux
      float etage=floor(y/3.6), fy=fract(y/3.6);
      float aa=clamp(max(fwidth(u/1.5),fwidth(y/3.6))*1.5,0.0,1.0);
      float bande=mix(step(0.14,fy)*step(fy,0.86)*step(0.07,fract(u/1.5)),0.66,aa);
      float lit=step(hash(vec2(etage,graine*91.0+face)),0.22+0.35*fract(graine*3.7));
      lit*=step(0.25,hash(vec2(floor(u/9.0),etage+graine)));     // étages parfois éclairés à moitié
      vec3 lc=mix(vec3(0.78,0.86,1.0),vec3(1.0,0.93,0.8),hash(vec2(etage,graine)));
      c=vec3(0.018,0.03,0.05)+u_ciel*0.55*pow(1.0-abs(dot(n,V)),3.0);
      c+=bande*lit*lc*0.85;
    }else if(type>1.5 && type<2.5){
      // tour crayon : arêtes lumineuses et fenêtres rares
      vec2 id=vec2(floor(u/2.6),floor(y/3.4))+vec2(face*13.0,graine*41.0);
      vec2 f=fract(vec2(u/2.6,y/3.4));
      float fen=step(0.2,f.x)*step(f.x,0.8)*step(0.25,f.y)*step(f.y,0.75);
      c=vec3(0.03,0.032,0.04)+step(0.9,fract(u/6.0))*vec3(0.85,0.9,1.0)*0.18;
      c+=fen*allumee(id,0.18)*lumiereFenetre(hash(id+1.3))*0.8;
    }else{
      // immeubles en brique / art déco : grille de fenêtres chaudes
      float cw=type>2.5?2.2:2.5;
      vec2 id=vec2(floor(u/cw),floor(y/3.3))+vec2(face*31.7+graine*97.0,graine*53.0);
      vec2 f=fract(vec2(u/cw,y/3.3));
      float aa=clamp(max(fwidth(u/cw),fwidth(y/3.3))*1.5,0.0,1.0);
      float fen=mix(step(0.18,f.x)*step(f.x,0.82)*step(0.24,f.y)*step(f.y,0.76),0.33,aa)*step(3.3,y);
      float taux=0.2+0.45*fract(graine*7.13);
      c=type>2.5?vec3(0.045,0.04,0.036):vec3(0.04,0.032,0.03);
      c+=fen*allumee(id,taux)*lumiereFenetre(hash(id+1.3))*(0.55+0.45*hash(id+2.9));
      c+=(1.0-step(3.3,y))*step(0.35,hash(id+5.0))*vec3(1.0,0.75,0.5)*0.4;      // vitrines
      if(type>2.5) c+=mix(vec3(1.0,0.82,0.55),u_theme,0.3)*smoothstep(sommet-45.0,sommet,y)*0.32;   // couronne illuminée
    }
    c+=vec3(1.0,0.62,0.32)*0.14*exp(-y*0.07);                   // lumière de la rue sur le bas des façades
  }
  c=mix(c,u_brume,brouillard(length(v_wp-cameraPosition)));
  gl_FragColor=vec4(c,1.0);
}`;
  const VS_FLECHE=`
varying vec3 v_wp; varying float v_k;
void main(){ vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0); v_wp=wp.xyz; v_k=position.y; gl_Position=projectionMatrix*viewMatrix*wp; }`;
  const FS_FLECHE=COMMUN+`
uniform vec3 u_theme;
varying vec3 v_wp; varying float v_k;
void main(){
  vec3 c=vec3(0.06,0.06,0.07)+mix(vec3(0.9,0.85,0.75),u_theme,0.35)*(0.35*(1.0-v_k)+0.25*step(0.92,v_k));   // éclairée par en dessous
  c=mix(c,u_brume,brouillard(length(v_wp-cameraPosition)));
  gl_FragColor=vec4(c,1.0);
}`;
  /* ───── sol : avenues, rues, lampadaires, parc ───── */
  const VS_SOL=`
varying vec3 v_wp;
void main(){ vec4 wp=modelMatrix*vec4(position,1.0); v_wp=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`;
  const FS_SOL=COMMUN+`
uniform vec4 u_parc; uniform vec3 u_ciel;
varying vec3 v_wp;
void main(){
  vec2 p=v_wp.xz;
  float av=step(mod(p.x-(${AV.depart.toFixed(1)}),${AV.pas.toFixed(1)}),${AV.larg.toFixed(1)});
  float rue=step(mod(p.y-(${RUE.depart.toFixed(1)}),${RUE.pas.toFixed(1)}),${RUE.larg.toFixed(1)});
  float route=max(av,rue);
  vec3 c=mix(vec3(0.014,0.014,0.018),vec3(0.032,0.03,0.032),route);
  // lampadaires : halos orangés le long des avenues et des rues
  vec2 q=mod(p,24.0)-12.0;
  c+=route*vec3(1.0,0.62,0.3)*0.16*exp(-dot(q,q)*0.016);
  c+=av*vec3(1.0,0.9,0.7)*0.03;
  // parc : sombre, quelques allées éclairées
  float parc=step(u_parc.x,p.x)*step(p.x,u_parc.y)*step(u_parc.z,p.y)*step(p.y,u_parc.w);
  vec2 g=mod(p,90.0)-45.0;
  float allee=exp(-abs(g.x+sin(p.y*0.02)*20.0)*0.4)+exp(-abs(g.y+sin(p.x*0.03)*15.0)*0.4);
  vec3 cp=vec3(0.006,0.012,0.008)+vec3(1.0,0.8,0.5)*0.05*allee*step(0.6,hash(floor(p/30.0)));
  c=mix(c,cp,parc);
  // chaussée mouillée : reflet du ciel en rasant
  vec3 v=normalize(cameraPosition-v_wp);
  c+=u_ciel*0.35*pow(1.0-max(v.y,0.0),5.0)*route;
  c=mix(c,u_brume,brouillard(length(v_wp-cameraPosition)));
  gl_FragColor=vec4(c,1.0);
}`;
  /* ───── eau : reflets des rives et du pont qui ondulent ───── */
  const FS_EAU=COMMUN+`
uniform float u_temps; uniform vec3 u_ciel;
varying vec3 v_wp;
float rive(float s){                       // lumières le long d'une rive (coordonnée le long du bord) : traînées fines et espacées
  float i=floor(s/5.0), f=fract(s/5.0);
  return step(0.72,hash(vec2(i,3.0)))*(0.4+0.6*hash(vec2(i,9.0)))*smoothstep(0.5,0.1,abs(f-0.5));
}
void main(){
  vec2 p=v_wp.xz;
  float ondes=sin(p.x*0.045+u_temps*1.3)*2.5+sin(p.x*0.11-u_temps*2.1)*1.2+sin(p.y*0.09+u_temps*1.7)*1.5;
  float d1=p.y<${ILE.z1.toFixed(1)} ? abs(abs(p.x)-${ILE.x1.toFixed(1)}) : 1e5;
  float d2=abs(p.x-(${OUEST.x1.toFixed(1)})), d3=abs(p.x-${EST.x0.toFixed(1)});
  float d4=p.y>${ILE.z1.toFixed(1)} && abs(p.x)<${ILE.x1.toFixed(1)} ? p.y-${ILE.z1.toFixed(1)} : 1e5;
  float d=min(min(d1,d2),min(d3,d4));
  float le=d4<min(min(d1,d2),d3) ? p.x : p.y;                 // coordonnée le long de la rive la plus proche
  float loin=exp(-length(v_wp-cameraPosition)/2200.0);
  float trainee=rive(le+ondes)*exp(-d/170.0)*loin;
  vec3 c=vec3(0.004,0.007,0.014)+vec3(1.0,0.78,0.5)*trainee*0.42;
  // le pont se reflète
  float pont=step(${PONT.x0.toFixed(1)},p.x)*step(p.x,${PONT.x1.toFixed(1)});
  c+=pont*vec3(0.75,0.85,1.0)*0.45*exp(-abs(p.y-(${PONT.z.toFixed(1)})+ondes*1.5)/9.0);
  vec3 v=normalize(cameraPosition-v_wp);
  c+=u_ciel*0.6*pow(1.0-max(v.y,0.0),4.0);
  c=mix(c,u_brume,brouillard(length(v_wp-cameraPosition)));
  gl_FragColor=vec4(c,1.0);
}`;
  /* ───── ciel : dégradé, lueur de la ville, étoiles ───── */
  const VS_CIEL=`
varying vec3 v_d;
void main(){ v_d=normalize(position); gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }`;
  const FS_CIEL=`
uniform vec3 u_ciel,u_brume; uniform float u_temps;
varying vec3 v_d;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
void main(){
  float y=v_d.y;
  vec3 c=mix(u_brume*1.3+u_ciel*0.18,vec3(0.004,0.006,0.016),smoothstep(-0.02,0.4,y));
  c+=u_ciel*0.5*exp(-max(y,0.0)*8.0);                        // halo lumineux au-dessus de la ville
  vec2 cel=floor(vec2(atan(v_d.z,v_d.x)*260.0,y*260.0));
  float h=hash(cel);
  float etoile=step(0.9975,h)*smoothstep(0.08,0.35,y)*(0.55+0.45*sin(u_temps*2.0+h*60.0));
  c+=vec3(0.85,0.9,1.0)*etoile*0.7;
  gl_FragColor=vec4(c,1.0);
}`;
  /* ───── voitures ───── */
  const VS_AUTOS=COMMUN+`
attribute vec4 a_voie;    // axe (0 : le long de x, 1 : le long de z), position de la voie, départ, vitesse (signée)
attribute vec3 a_seg;     // début, fin, hauteur
uniform float u_temps,u_px;
varying float v_rouge; varying float v_brume;
void main(){
  float L=a_seg.y-a_seg.x;
  float s=a_seg.x+mod(a_voie.z+u_temps*a_voie.w,L);
  vec3 p=a_voie.x<0.5 ? vec3(s,a_seg.z,a_voie.y) : vec3(a_voie.y,a_seg.z,s);
  v_rouge=step(a_voie.w,0.0);
  vec4 mv=viewMatrix*vec4(p,1.0);
  v_brume=brouillard(-mv.z);
  gl_PointSize=clamp(u_px*(v_rouge>0.5?0.85:1.0)*(260.0/max(-mv.z,1.0)),0.0,14.0);
  gl_Position=projectionMatrix*mv;
}`;
  const FS_AUTOS=`
varying float v_rouge; varying float v_brume;
void main(){
  float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d);
  vec3 c=v_rouge>0.5?vec3(1.0,0.1,0.06)*1.6:vec3(1.0,0.95,0.85)*1.8;
  a*=(1.0-v_brume)*(v_rouge>0.5?0.85:1.0);
  gl_FragColor=vec4(c*a,a);
}`;
  /* ───── lumières : pont (fixes), balises (clignotent), avions et hélicoptère (traversent le ciel) ───── */
  const VS_LUM=COMMUN+`
attribute vec4 a_param;   // type (0 fixe, 1 balise, 2 flash blanc, 3 feu de navigation, 4 hélico), phase, vitesse, période
attribute vec3 a_dir; attribute vec3 a_coul; attribute float a_long;
uniform float u_temps,u_px;
varying vec3 v_c; varying float v_a;
void main(){
  float type=a_param.x;
  vec3 p=position; float vis=1.0, k=1.0;
  if(type>1.5){
    float s=mod(u_temps+a_param.y,a_param.w), dist=s*a_param.z;
    vis=step(dist,a_long); p+=a_dir*dist;
  }
  if(type>0.5 && type<1.5) k=step(0.55,fract(u_temps*0.5+a_param.y));            // balise : toutes les 2 s
  if(type>1.5 && type<2.5) k=step(fract(u_temps*0.95+a_param.y),0.07);            // flash blanc d'avion
  if(type>3.5) k=step(0.5,fract(u_temps*0.8+a_param.y));
  vec4 mv=viewMatrix*vec4(p,1.0);
  v_c=a_coul; v_a=vis*k*(1.0-brouillard(-mv.z)*0.85);
  float taille=type<0.5?1.7:type<1.5?2.4:type<2.5?3.2:2.0;
  gl_PointSize=clamp(u_px*taille*(320.0/max(-mv.z,1.0)),2.0,26.0);
  gl_Position=projectionMatrix*mv;
}`;
  const FS_LUM=`
varying vec3 v_c; varying float v_a;
void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d); a=a*sqrt(a)*v_a; gl_FragColor=vec4(v_c*a*2.2,a); }`;

  UI.fondsReels.ville3d=async function(canvas,o){
    o=o||{};
    const THREE=await UI.three();
    const rendu=new THREE.WebGLRenderer({canvas,alpha:false,antialias:false,powerPreference:'low-power'});
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(56,1,2,9000);
    let g0=20261011; const rnd=()=>{ g0=(g0*1664525+1013904223)>>>0; return g0/4294967296; };
    const brume=new THREE.Color(), ciel=new THREE.Color(), theme=new THREE.Color();
    const UC={u_brume:{value:brume},u_densite:{value:1/1500},u_temps:{value:0},u_theme:{value:theme},u_ciel:{value:ciel},
      u_parc:{value:new THREE.Vector4(PARC.x0,PARC.x1,PARC.z0,PARC.z1)}};

    /* ── immeubles : liste de blocs (x, z, largeur, profondeur, bas, haut, type, graine, sommet, priorité) ── */
    const blocs=[], fleches=[], balises=[];
    const ajouter=(x,z,w,l,y0,y1,type,graine,sommet,prio)=>blocs.push({x,z,w,l,y0,y1,type,graine,sommet,prio});
    const fleche=(x,z,r,y0,h)=>{ fleches.push({x,z,r,y0,h}); balises.push([x,y0+h+1,z]); };
    function tour(x,z,w,l,H,type,graine){
      if(type===3){                                   // art déco : gradins + flèche
        const a=H*.5, b=H*.78;
        ajouter(x,z,w,l,0,a,3,graine,H,3); ajouter(x,z,w*.72,l*.72,a,b,3,graine,H,3); ajouter(x,z,w*.5,l*.5,b,H,3,graine,H,3);
        fleche(x,z,Math.min(w,l)*.16,H,H*.2);
      }else if(type===1 && rnd()<.35){                // verre avec couronne en retrait
        ajouter(x,z,w,l,0,H*.85,1,graine,H,3); ajouter(x,z,w*.7,l*.7,H*.85,H,1,graine,H,3);
        if(rnd()<.5) fleche(x,z,Math.min(w,l)*.06,H,H*.15); else balises.push([x,H+1,z]);
      }else{
        ajouter(x,z,w,l,0,H,type,graine,H,type===0?1:3);
        if(H>170) balises.push([x,H+1.5,z]);
      }
    }
    const dansParc=(x,z,m)=>x>PARC.x0-m && x<PARC.x1+m && z>PARC.z0-m && z<PARC.z1+m;
    // Manhattan : bas de l'île (sud) et centre-ville très hauts, ailleurs des immeubles plus bas
    const nbAv=Math.ceil((ILE.x1-AV.depart)/AV.pas);
    for(let i=0;i<nbAv;i++) for(let zr=RUE.depart;zr<ILE.z1;zr+=RUE.pas){
      const bx0=AV.depart+i*AV.pas+AV.larg, bx1=Math.min(ILE.x1-4,AV.depart+(i+1)*AV.pas), bz0=zr+RUE.larg, bz1=Math.min(ILE.z1-4,zr+RUE.pas);
      if(bx1-bx0<20 || bz1-bz0<20) continue;
      const cx=(bx0+bx1)/2, cz=(bz0+bz1)/2;
      if(dansParc(cx,cz,0)) continue;
      const bas=Math.exp(-Math.pow((cz-1380)/320,2)), mid=Math.exp(-Math.pow((cz+330)/420,2));
      const grand=Math.max(bas,mid), bordParc=dansParc(cx,cz,90)?1:0;
      if(grand>.3 && rnd()<.35*grand){                // une tour occupe tout le bloc
        const r=rnd(), type=r<.45?1:r<.72?3:0;
        tour(cx,cz,(bx1-bx0)*.9,(bz1-bz0)*.88,(type===0?70:130)+grand*(140+rnd()*220),type,rnd());
        continue;
      }
      const n=1+Math.floor(rnd()*3), m=1+Math.floor(rnd()*2), w=(bx1-bx0)/n, l=(bz1-bz0)/m;
      for(let a=0;a<n;a++) for(let b=0;b<m;b++){
        const x=bx0+w*(a+.5), z=bz0+l*(b+.5), r=rnd(), gr=rnd();
        if(grand>.25 && r<grand*.55){
          const t=rnd(), type=t<.4?1:t<.62?3:t<.8?2:0;
          if(type===2) tour(x,z,Math.min(w,l)*.42,Math.min(w,l)*.42,260+rnd()*200,2,gr);
          else tour(x,z,w*.86,l*.86,(type===0?60:110)+grand*(120+rnd()*200),type,gr);
        }else{
          ajouter(x,z,w*(.78+rnd()*.16),l*(.78+rnd()*.16),0,12+rnd()*34+bordParc*(30+rnd()*50)+grand*rnd()*40,0,gr,0,1);
        }
      }
    }
    // trois tours emblématiques (inspirées, pas copiées) : gradins avec antenne, couronne pointue, tour de verre et grande antenne
    ajouter(-234,-238,104,44,0,90,3,.31,381,4); ajouter(-234,-238,58,34,90,320,3,.31,381,4); ajouter(-234,-238,32,24,320,366,3,.31,381,4); ajouter(-234,-238,16,16,366,381,3,.31,381,4);
    fleche(-234,-238,5,381,62);
    ajouter(46,-422,60,40,0,150,3,.57,282,4); ajouter(46,-422,40,30,150,240,3,.57,282,4); ajouter(46,-422,24,20,240,282,3,.57,282,4);
    fleche(46,-422,9,282,78);
    ajouter(-234,1500,58,44,0,417,1,.83,417,4); fleche(-234,1500,2.5,417,118);
    // pont suspendu : tablier, tours, traverses
    ajouter((PONT.x0+PONT.x1)/2,PONT.z,PONT.x1-PONT.x0,24,PONT.haut-3,PONT.haut,4,.1,0,4);
    for(const tx of PONT.tours){ for(const dz of [-11,11]) ajouter(tx,PONT.z+dz,6,6,0,PONT.hTour,4,.2,0,4); ajouter(tx,PONT.z,6,28,PONT.hTour-10,PONT.hTour-4,4,.2,0,4); balises.push([tx,PONT.hTour+2,PONT.z]); }
    // rives d'en face : villes plus basses, quelques tours près du pont
    for(const R of [OUEST,EST]) for(let x=R.x0+40;x<R.x1;x+=115) for(let z=RIVES.z0;z<RIVES.z1;z+=85){
      if(rnd()<.18) continue;
      const pres=R===EST?Math.exp(-Math.pow((z-PONT.z)/500,2))*Math.exp(-Math.pow((x-EST.x0)/500,2)):0;
      const H=pres>.3&&rnd()<pres*.6 ? 80+rnd()*150 : 8+rnd()*30;
      ajouter(x+(rnd()-.5)*20,z+(rnd()-.5)*15,40+rnd()*45,30+rnd()*35,0,H,H>70?1:0,rnd(),H,H>70?2:0);
    }
    blocs.sort((a,b)=>b.prio-a.prio || a.graine-b.graine);       // tours d'abord : réduire le nombre retire les petits immeubles lointains
    const nbImm=blocs.length;
    const geoBoite=new THREE.BoxGeometry(1,1,1); geoBoite.translate(0,.5,0);
    const infos=new Float32Array(nbImm*4), m4=new THREE.Matrix4();
    const immeubles=new THREE.InstancedMesh(geoBoite,new THREE.ShaderMaterial({uniforms:UC,vertexShader:VS_IMM,fragmentShader:FS_IMM}),nbImm);
    blocs.forEach((b,i)=>{ m4.makeScale(b.w,b.y1-b.y0,b.l).setPosition(b.x,b.y0,b.z); immeubles.setMatrixAt(i,m4); infos.set([b.graine,b.type,b.sommet||b.y1,0],i*4); });
    geoBoite.setAttribute('a_info',new THREE.InstancedBufferAttribute(infos,4));
    immeubles.frustumCulled=false; scene.add(immeubles);
    const geoCone=new THREE.ConeGeometry(.5,1,4,1); geoCone.translate(0,.5,0);
    const cones=new THREE.InstancedMesh(geoCone,new THREE.ShaderMaterial({uniforms:UC,vertexShader:VS_FLECHE,fragmentShader:FS_FLECHE}),Math.max(1,fleches.length));
    fleches.forEach((f,i)=>{ m4.makeScale(f.r*2,f.h,f.r*2).setPosition(f.x,f.y0,f.z); cones.setMatrixAt(i,m4); });
    cones.count=fleches.length; cones.frustumCulled=false; scene.add(cones);

    /* ── sol (île + rives, une seule géométrie), eau, ciel ── */
    const rect=(x0,x1,z0,z1)=>[x0,0,z0, x0,0,z1, x1,0,z0, x1,0,z0, x0,0,z1, x1,0,z1];
    const gSol=new THREE.BufferGeometry();
    gSol.setAttribute('position',new THREE.Float32BufferAttribute([...rect(ILE.x0,ILE.x1,ILE.z0,ILE.z1),...rect(OUEST.x0,OUEST.x1,RIVES.z0,RIVES.z1),...rect(EST.x0,EST.x1,RIVES.z0,RIVES.z1)],3));
    scene.add(new THREE.Mesh(gSol,new THREE.ShaderMaterial({uniforms:UC,vertexShader:VS_SOL,fragmentShader:FS_SOL,side:THREE.DoubleSide})));
    const eau=new THREE.Mesh(new THREE.PlaneGeometry(16000,16000),new THREE.ShaderMaterial({uniforms:UC,vertexShader:VS_SOL,fragmentShader:FS_EAU}));
    eau.rotation.x=-Math.PI/2; eau.position.y=-1.5; scene.add(eau);
    const voute=new THREE.Mesh(new THREE.SphereGeometry(8000,32,16),new THREE.ShaderMaterial({uniforms:UC,vertexShader:VS_CIEL,fragmentShader:FS_CIEL,side:THREE.BackSide,depthWrite:false}));
    voute.frustumCulled=false; scene.add(voute);   // le ciel suit la caméra (sinon il sort du champ de vision lointain)

    /* ── voitures : avenues (nord-sud), rues (est-ouest), pont ── */
    const nbAutos=9000, voies=new Float32Array(nbAutos*4), segs=new Float32Array(nbAutos*3);
    const nbRues=Math.floor((ILE.z1-RUE.depart)/RUE.pas);
    for(let k=0;k<nbAutos;k++){
      const r=rnd(), sens=rnd()<.5?1:-1;
      let axe, coord, a0, a1, y=.8;
      if(r<.58){ axe=1; coord=AV.depart+Math.floor(rnd()*nbAv)*AV.pas+AV.larg/2+(sens>0?-5:5); a0=ILE.z0; a1=ILE.z1; }
      else{
        axe=0; coord=RUE.depart+Math.floor(rnd()*nbRues)*RUE.pas+RUE.larg/2+(sens>0?-2.5:2.5); a0=ILE.x0; a1=ILE.x1;
        if(r>.94 || (coord>PARC.z0 && coord<PARC.z1)){ coord=PONT.z+(sens>0?-4:4); a0=PONT.x0; a1=PONT.x1; y=PONT.haut+.8; }   // le pont (et pas de rue dans le parc)
      }
      voies.set([axe,coord,rnd()*5000,sens*(10+rnd()*9)],k*4); segs.set([a0,a1,y],k*3);
    }
    const gA=new THREE.BufferGeometry();
    gA.setAttribute('position',new THREE.BufferAttribute(new Float32Array(nbAutos*3),3));
    gA.setAttribute('a_voie',new THREE.BufferAttribute(voies,4)); gA.setAttribute('a_seg',new THREE.BufferAttribute(segs,3));
    const UA=Object.assign({u_px:{value:4}},UC);
    const autos=new THREE.Points(gA,new THREE.ShaderMaterial({uniforms:UA,vertexShader:VS_AUTOS,fragmentShader:FS_AUTOS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
    autos.frustumCulled=false; scene.add(autos);

    /* ── lumières : pont (câbles en perles), balises, avions, hélicoptère ── */
    const L={pos:[],param:[],dir:[],coul:[],long:[]};
    const lumiere=(p,param,dir,coul,lg)=>{ L.pos.push(...p); L.param.push(...param); L.dir.push(...(dir||[0,0,0])); L.coul.push(...coul); L.long.push(lg||0); };
    const [t1,t2]=PONT.tours, H=PONT.hTour;
    const cable=x=>{                                       // hauteur du câble (chaînette approchée par des paraboles)
      if(x<t1) return PONT.haut+(H-PONT.haut)*Math.pow((x-PONT.x0)/(t1-PONT.x0),1.6);
      if(x>t2) return PONT.haut+(H-PONT.haut)*Math.pow((PONT.x1-x)/(PONT.x1-t2),1.6);
      const m=(t1+t2)/2, k=(x-m)/((t2-t1)/2); return PONT.haut+12+(H-PONT.haut-12)*k*k;
    };
    for(let x=PONT.x0;x<=PONT.x1;x+=9) for(const dz of [-12,12]) lumiere([x,cable(x),PONT.z+dz],[0,0,0,1],null,[.75,.85,1.0]);
    for(let x=PONT.x0;x<=PONT.x1;x+=18) for(const dz of [-13,13]) lumiere([x,PONT.haut+1,PONT.z+dz],[0,0,0,1],null,[1.0,.8,.5]);
    balises.forEach((b,i)=>lumiere(b,[1,(i*.37)%1,0,1],null,[1.0,.08,.04]));
    const avion=(p,dir,v,per,lg,ph)=>{                     // flash blanc + feux rouge et vert
      const d=new THREE.Vector3(...dir).normalize(), cote=new THREE.Vector3(-d.z,0,d.x).multiplyScalar(14);
      lumiere(p,[2,ph,v,per],[d.x,d.y,d.z],[1,1,1],lg);
      lumiere([p[0]+cote.x,p[1],p[2]+cote.z],[3,ph,v,per],[d.x,d.y,d.z],[1,.1,.08],lg);
      lumiere([p[0]-cote.x,p[1],p[2]-cote.z],[3,ph,v,per],[d.x,d.y,d.z],[.1,1,.3],lg);
    };
    avion([-6000,900,-2600],[1,0,.32],130,150,12000,0);
    avion([5500,1150,1800],[-1,0,-.18],150,190,11500,70);
    const heli=new THREE.Vector3(.35,0,-1).normalize();
    lumiere([-900,240,1900],[4,0,26,210],[heli.x,0,heli.z],[1,.12,.06],4200);
    lumiere([-900,236,1900],[3,0,26,210],[heli.x,0,heli.z],[1,1,.95],4200);
    const gL=new THREE.BufferGeometry();
    gL.setAttribute('position',new THREE.Float32BufferAttribute(L.pos,3));
    gL.setAttribute('a_param',new THREE.Float32BufferAttribute(L.param,4));
    gL.setAttribute('a_dir',new THREE.Float32BufferAttribute(L.dir,3));
    gL.setAttribute('a_coul',new THREE.Float32BufferAttribute(L.coul,3));
    gL.setAttribute('a_long',new THREE.Float32BufferAttribute(L.long,1));
    const UL=Object.assign({u_px:{value:3}},UC);
    const lumieres=new THREE.Points(gL,new THREE.ShaderMaterial({uniforms:UL,vertexShader:VS_LUM,fragmentShader:FS_LUM,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
    lumieres.frustumCulled=false; scene.add(lumieres);

    /* ── trajet du drone : une avenue vers le nord, virage au-dessus du parc et du fleuve, retour par le sud (boucle) ── */
    const avX=AV.depart+2*AV.pas+AV.larg/2;
    const trajet=new THREE.CatmullRomCurve3([
      [avX,150,2350],[avX,200,1500],[avX,250,650],[avX,320,-260],[avX+40,260,-850],[260,230,-1300],
      [880,220,-950],[885,215,250],[760,180,1250],[260,155,2150]
    ].map(p=>new THREE.Vector3(...p)),true,'centripetal');
    const longueur=trajet.getLength();
    const cible=new THREE.Vector3();
    let q=Math.max(0,Math.min(2,o.q|0)), W=1, Hh=1, u=rnd(), t=0, vueFixe=null;
    function appliquerQualite(){
      const pr=[Math.min(window.devicePixelRatio||1,1.5),.85,.6][q];
      rendu.setPixelRatio(pr);
      immeubles.count=Math.round(nbImm*[1,.75,.5][q]);
      gA.setDrawRange(0,Math.round(nbAutos*[1,.6,.3][q]));
      UA.u_px.value=4*pr; UL.u_px.value=3*pr;
      if(W>1) rendu.setSize(W,Hh,false);
    }
    return {
      taille(){
        W=Math.round(innerWidth*1.06); Hh=Math.round(innerHeight*1.06);
        camera.aspect=W/Hh; camera.fov=W/Hh<1?74:56; camera.updateProjectionMatrix();
        appliquerQualite();
      },
      qualite(n){ q=Math.max(0,Math.min(2,n|0)); appliquerQualite(); },
      image(now,dt){
        const c=UI.couleurs();
        theme.setRGB(c[0][0]/255,c[0][1]/255,c[0][2]/255);
        ciel.setRGB(c[1][0]/255*.32+.06,c[1][1]/255*.32+.045,c[1][2]/255*.32+.05);
        brume.setRGB(c[3][0]/255*.08+.03,c[3][1]/255*.08+.028,c[3][2]/255*.08+.04);
        t+=dt; UC.u_temps.value=t;
        u=(u+dt*26/longueur)%1;                                     // ≈ 26 m/s : un tour en quatre à cinq minutes
        if(vueFixe){ camera.position.set(...vueFixe[0]); cible.set(...vueFixe[1]); }
        else{
          trajet.getPointAt(u,camera.position);
          trajet.getPointAt((u+260/longueur)%1,cible); cible.y-=48;   // regarde 260 m devant, légèrement vers le bas : horizon visible
        }
        camera.lookAt(cible);
        voute.position.copy(camera.position);
        rendu.render(scene,camera);
      },
      // pour les images fixes et les tests : place le drone à un point du trajet (0..1)
      placer(x){ u=((+x%1)+1)%1; vueFixe=null; },
      vue(depuis,vers){ vueFixe=[depuis,vers]; },     // caméra immobile (image fixe du mode Éco)
      detruire(){
        scene.traverse(x=>{ if(x.geometry) x.geometry.dispose(); if(x.material) x.material.dispose(); });
        rendu.dispose(); try{ rendu.forceContextLoss(); }catch(e){}
      }
    };
  };
})();
