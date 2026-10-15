"use strict";
/* ═════════════ ENTITÉ « NEURONES » : un cerveau-sphère holographique en pleine activité ═════════════
   Deuxième façon de dessiner l'entité, au choix dans Apparence (la Sphère reste celle par défaut).
   Elle se branche par Entite.moteur() : les états, la voix, le micro, les couleurs de sécurité, la pause et la qualité
   automatique restent gérés par js/commun/entite.js, qui lui passe à chaque image l'état déjà lissé.
   - Réseau généré UNE fois par niveau de qualité : nœuds dans une sphère irrégulière (bruit), plus denses en surface,
     couches internes ; filaments courbes entre voisins ; quelques « axones » entre couches.
   - Cascades : distance en sauts calculée une fois depuis 8 neurones de départ ; le shader fait avancer les fronts
     avec un simple uniform de temps (aucun recalcul CPU par image).
   - Lueur : points doux en mélange additif, sprites pour le cœur. Pas de post-traitement.
   - Repli : si three.js ou WebGL échoue, on revient à la Sphère. */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  if(!window.Entite || !Entite.moteur || !UI.three) return;

  // nœuds / filaments / segments par filament, selon le niveau de l'entité (0 élevé … 3 très léger)
  const NIVEAUX=[{n:6000,e:9000,s:3,pr:1.5},{n:3500,e:5000,s:3,pr:1.25},{n:1500,e:2000,s:2,pr:1},{n:1000,e:1200,s:2,pr:1}];
  // activité par état : act (flashs spontanés), casc (intensité des cascades), cv (vitesse des cascades, sauts/s),
  // onde (vagues du centre vers l'extérieur), coeur, ech (taille), fil (luminosité des filaments)
  const ETATS={
    idle:      {act:.38,casc:.45,cv:5, onde:0,coeur:.50,ech:1.00,fil:.95},
    veille:    {act:.18,casc:.28,cv:3.5,onde:0,coeur:.50,ech:1.02,fil:.7},
    listening: {act:.25,casc:.35,cv:8, onde:0,coeur:.60,ech:.97, fil:.9},
    thinking:  {act:.85,casc:1.25,cv:17,onde:0,coeur:1.15,ech:.90,fil:1.1},
    speaking:  {act:.30,casc:.30,cv:6, onde:1,coeur:.85,ech:1.00,fil:1},
    alerte:    {act:.80,casc:1.0,cv:14,onde:0,coeur:.90,ech:1.00,fil:1},
    verrouille:{act:.04,casc:.06,cv:2, onde:0,coeur:.20,ech:.90, fil:.5}
  };

  let moteur=null, chargement=null, gen=0;
  function journal(t){ try{ if(typeof addLine==='function') addLine('sys',t); }catch(e){} }
  function repli(err){
    const m=(err&&err.message)||String(err||'erreur');
    console.warn('[neurones]',err);
    journal('Entité Neurones indisponible ('+m+') : retour à la Sphère.');
  }
  function appliquer(choix){
    if(choix==='neurones'){
      if(moteur || chargement) return;
      const g=++gen;
      chargement=creer().then(m=>{
        chargement=null;
        if(g!==gen){ m.quitter(); return; }
        moteur=m; Entite.moteur(m);
      }).catch(err=>{ chargement=null; if(g===gen) repli(err); });
    }else{
      gen++;
      if(moteur){ const m=moteur; moteur=null; if(Entite.info().moteur==='neurones') Entite.moteur(null); else m.quitter(); }
    }
  }

  /* ───── génération du réseau (une fois par niveau) ───── */
  function generer(cfg){
    let graine=20261010;
    const rnd=()=>{ graine=(graine*1664525+1013904223)>>>0; return graine/4294967296; };
    const N=cfg.n;
    const pos=new Float32Array(N*3), seed=new Float32Array(N), rad=new Float32Array(N), teinte=new Float32Array(N);
    const bruit=(x,y,z)=>.6*Math.sin(2.3*x+1.1)*Math.sin(2.9*y+.3)*Math.sin(2.1*z+2.2)+.4*Math.sin(5.1*x+3.3*y+.7)*Math.sin(4.7*z-2.9*x+1.9);
    for(let i=0;i<N;i++){
      const z=rnd()*2-1, th=rnd()*6.2832, s=Math.sqrt(1-z*z), dx=s*Math.cos(th), dy=z, dz=s*Math.sin(th);
      const q=rnd(); let r;
      if(q<.60) r=.80+.20*Math.pow(rnd(),.6);          // surface : la plus dense
      else if(q<.78) r=.58+(rnd()-.5)*.07;              // couche interne
      else if(q<.91) r=.37+(rnd()-.5)*.07;              // couche profonde
      else r=.10+.62*rnd();                             // neurones épars entre les couches
      r*=1+.14*bruit(dx*1.7,dy*1.7,dz*1.7);
      pos[i*3]=dx*r; pos[i*3+1]=dy*r; pos[i*3+2]=dz*r;
      rad[i]=Math.min(1,r/1.12); seed[i]=rnd();
      teinte[i]=((Math.atan2(dz,dx)/6.2832+.5)+dy*.35+1)%1;
    }
    // grille de voisinage
    const d=1.35*Math.cbrt(8/N), D2=d*d, G=Math.ceil(2.6/d)+1;
    const cle=(x,y,z)=>x+G*(y+G*z), cell=v=>Math.max(0,Math.min(G-1,Math.floor((v+1.3)/d)));
    const grille=new Map();
    for(let i=0;i<N;i++){ const k=cle(cell(pos[i*3]),cell(pos[i*3+1]),cell(pos[i*3+2])); let l=grille.get(k); if(!l) grille.set(k,l=[]); l.push(i); }
    const dist2=(i,j)=>{ const a=pos[i*3]-pos[j*3], b=pos[i*3+1]-pos[j*3+1], c=pos[i*3+2]-pos[j*3+2]; return a*a+b*b+c*c; };
    const aretes=[], vu=new Set(), voisins=Array.from({length:N},()=>[]);
    const ajouter=(i,j)=>{ const a=Math.min(i,j), b=Math.max(i,j), k=a*N+b; if(a===b||vu.has(k)) return; vu.add(k); aretes.push(a,b); voisins[a].push(b); voisins[b].push(a); };
    const kVoisins=Math.max(1,Math.round(cfg.e/N*1.25));
    for(let i=0;i<N;i++){
      const cx=cell(pos[i*3]), cy=cell(pos[i*3+1]), cz=cell(pos[i*3+2]), cand=[];
      for(let x=cx-1;x<=cx+1;x++) for(let y=cy-1;y<=cy+1;y++) for(let z=cz-1;z<=cz+1;z++){
        const l=grille.get(cle(x,y,z)); if(!l) continue;
        for(const j of l){ if(j===i) continue; const dd=dist2(i,j); if(dd<D2) cand.push([dd,j]); }
      }
      cand.sort((a,b)=>a[0]-b[0]);
      for(let k=0;k<Math.min(kVoisins,cand.length);k++) ajouter(i,cand[k][1]);
    }
    // axones : quelques liaisons plus longues entre les couches, pour que l'activité traverse le cerveau
    const portee=Math.ceil(.32/d);
    for(let n=0;n<N*.04;n++){
      const i=Math.floor(rnd()*N), cx=cell(pos[i*3]), cy=cell(pos[i*3+1]), cz=cell(pos[i*3+2]);
      let meilleur=-1, md=1e9;
      for(let t=0;t<40;t++){
        const l=grille.get(cle(cx+Math.round((rnd()*2-1)*portee),cy+Math.round((rnd()*2-1)*portee),cz+Math.round((rnd()*2-1)*portee)));
        if(!l) continue;
        const j=l[Math.floor(rnd()*l.length)], dd=dist2(i,j);
        if(Math.abs(rad[i]-rad[j])>.12 && dd<.1 && dd<md){ md=dd; meilleur=j; }
      }
      if(meilleur>=0) ajouter(i,meilleur);
    }
    // on garde au plus cfg.e filaments (tirés au hasard)
    let E=aretes.length/2;
    const garde=new Uint8Array(E).fill(1);
    for(let k=E;k>cfg.e;){ const x=Math.floor(rnd()*E); if(garde[x]){ garde[x]=0; k--; } }
    // distances en sauts depuis 8 neurones de départ (sur le réseau complet)
    const H=new Float32Array(N*8).fill(99), maxH=[];
    for(let c=0;c<8;c++){
      const src=Math.floor(rnd()*N); H[src*8+c]=0;
      let file=[src], h=0, max=0;
      while(file.length && h<60){
        h++; const suite=[];
        for(const i of file) for(const j of voisins[i]) if(H[j*8+c]===99){ H[j*8+c]=h; max=h; suite.push(j); }
        file=suite;
      }
      maxH.push(max);
    }
    return {N,pos,seed,rad,teinte,aretes,garde,E,H,maxH,rnd};
  }

  /* ───── shaders ───── */
  const COMMUN=`
uniform float u_t,u_casc,u_act,u_cascA,u_onde,u_ondeA,u_ech,u_agi,u_lum,u_neb,u_cam;
uniform vec4 u_perA,u_perB;
uniform vec3 u_c1,u_c2,u_c3;
float front(float h,float per,float k){ float f=mod(u_casc*(0.8+0.09*k)+k*7.31,per); float d=h-f; return exp(-d*d*1.2); }
float cascades(vec4 a,vec4 b){
  return front(a.x,u_perA.x,0.0)+front(a.y,u_perA.y,1.0)+front(a.z,u_perA.z,2.0)+front(a.w,u_perA.w,3.0)
        +front(b.x,u_perB.x,4.0)+front(b.y,u_perB.y,5.0)+front(b.z,u_perB.z,6.0)+front(b.w,u_perB.w,7.0);
}
vec3 tourne(float k){ k=fract(k)*3.0; return k<1.0?mix(u_c1,u_c2,k):(k<2.0?mix(u_c2,u_c3,k-1.0):mix(u_c3,u_c1,k-2.0)); }
`;
  const VS_NOEUDS=COMMUN+`
uniform float u_px;
attribute float a_seed,a_r,a_teinte; attribute vec4 a_hA,a_hB;
varying vec3 v_col; varying float v_a;
void main(){
  vec3 p=position*u_ech*(1.0+u_agi*0.03*sin(a_seed*37.0+u_t*1.7));
  float spont=pow(max(0.0,sin(u_t*(0.5+a_seed*1.9)+a_seed*61.0)),28.0)*u_act*2.2;
  float o=exp(-pow((a_r-fract(u_onde))*7.0,2.0))*u_ondeA*(0.35+0.65*a_r);   // vague : discrète au centre, forte en surface
  float f=clamp(spont+cascades(a_hA,a_hB)*u_cascA+o,0.0,1.5);
  vec3 base=mix(mix(u_c1,u_c2,0.2*a_teinte),tourne(a_teinte+u_t*0.035),u_neb);
  vec3 acc=mix(u_c3,vec3(1.0),0.45*min(f,1.0));
  v_col=mix(base,acc,min(f,1.0));
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  float avant=clamp((u_cam+1.0+mv.z)*0.5,0.0,1.0);       // 1 devant, 0 derrière
  v_a=(0.22+0.78*avant)*(0.45+f*1.0)*u_lum*(0.55+0.45*a_r);   // le cœur dense ne sature pas
  gl_PointSize=u_px*(0.55+0.7*a_seed)*(1.0+f*1.4)*(u_cam/-mv.z);
  gl_Position=projectionMatrix*mv;
}`;
  const FS_NOEUDS=`
varying vec3 v_col; varying float v_a;
void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d); a*=a*v_a; gl_FragColor=vec4(v_col*a,a); }`;
  const VS_FIL=COMMUN+`
attribute float a_s,a_seed,a_r; attribute vec4 a_hA,a_hB;
varying float v_s,v_seed,v_c,v_avant;
void main(){
  vec3 p=position*u_ech;
  v_c=clamp(cascades(a_hA,a_hB)*u_cascA+exp(-pow((a_r-fract(u_onde))*7.0,2.0))*u_ondeA,0.0,1.5);
  v_s=a_s; v_seed=a_seed;
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  v_avant=clamp((u_cam+1.0+mv.z)*0.5,0.0,1.0);
  gl_Position=projectionMatrix*mv;
}`;
  const FS_FIL=COMMUN+`
uniform float u_fil;
varying float v_s,v_seed,v_c,v_avant;
void main(){
  float p=fract(u_t*(0.16+v_seed*0.34)+v_seed*11.0);
  float imp=exp(-pow((v_s-p)*14.0,2.0))*u_act*1.6*step(0.45,fract(v_seed*7.3));
  float f=clamp(imp+v_c*0.9,0.0,1.5);
  vec3 base=mix(u_c2,tourne(v_seed+u_t*0.035),u_neb);
  vec3 col=mix(base,mix(u_c3,vec3(1.0),0.5*min(f,1.0)),min(f,1.0));
  float a=(0.13+0.85*f)*(0.3+0.7*v_avant)*u_lum*u_fil;
  gl_FragColor=vec4(col*a,a);
}`;

  /* ───── création du moteur ───── */
  async function creer(){
    const THREE=await UI.three();
    const canvas=document.createElement('canvas'); canvas.className='entite-neurones'; canvas.setAttribute('aria-hidden','true');
    const rendu=new THREE.WebGLRenderer({canvas,alpha:true,antialias:false,premultipliedAlpha:true,powerPreference:'low-power'});
    rendu.setClearColor(0x000000,0);
    let erreurShader=null;
    rendu.debug.onShaderError=(gl,prog,vs,fs)=>{ erreurShader=(gl.getShaderInfoLog(vs)||'')+(gl.getShaderInfoLog(fs)||'')||'shader'; };
    const scene=new THREE.Scene();
    const CAM=5.4, camera=new THREE.PerspectiveCamera(31,1,.1,20); camera.position.set(0,0,CAM);
    const groupe=new THREE.Group(); groupe.rotation.x=.28; groupe.scale.setScalar(1.16); scene.add(groupe);   // 1,16 (au lieu de 0,85) : ≈ +35 % à l'écran
    const pivot=new THREE.Group(); groupe.add(pivot);

    const U={u_t:{value:0},u_casc:{value:0},u_act:{value:.3},u_cascA:{value:.4},u_onde:{value:0},u_ondeA:{value:0},u_ech:{value:1},
      u_agi:{value:.1},u_lum:{value:1},u_neb:{value:0},u_cam:{value:CAM},u_px:{value:3},u_fil:{value:.8},
      u_perA:{value:new THREE.Vector4(40,40,40,40)},u_perB:{value:new THREE.Vector4(40,40,40,40)},
      u_c1:{value:new THREE.Color()},u_c2:{value:new THREE.Color()},u_c3:{value:new THREE.Color()}};
    const melange={transparent:true,depthWrite:false,depthTest:false,blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor};
    const matNoeuds=new THREE.ShaderMaterial(Object.assign({uniforms:U,vertexShader:VS_NOEUDS,fragmentShader:FS_NOEUDS},melange));
    const matFil=new THREE.ShaderMaterial(Object.assign({uniforms:U,vertexShader:VS_FIL,fragmentShader:FS_FIL},melange));

    // cœur : deux sprites (noyau et lueur), texture dégradée dessinée une fois
    const tc=document.createElement('canvas'); tc.width=tc.height=128;
    const g2=tc.getContext('2d'), grad=g2.createRadialGradient(64,64,0,64,64,64);
    grad.addColorStop(0,'rgba(255,255,255,1)'); grad.addColorStop(.25,'rgba(255,255,255,.55)'); grad.addColorStop(.6,'rgba(255,255,255,.12)'); grad.addColorStop(1,'rgba(255,255,255,0)');
    g2.fillStyle=grad; g2.fillRect(0,0,128,128);
    const tex=new THREE.CanvasTexture(tc);
    const sprite=(op)=>{ const m=new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,opacity:op}); const s=new THREE.Sprite(m); groupe.add(s); return s; };
    const noyau=sprite(.9), lueur=sprite(.35);

    let noeuds=null, fils=null, niveauActuel=-1, cote=0, ratio=1, fini=false, pxBase=3;
    function construire(n){
      n=Math.max(0,Math.min(NIVEAUX.length-1,n|0));
      if(n===niveauActuel) return;
      niveauActuel=n;
      const cfg=NIVEAUX[n], r=generer(cfg);
      if(noeuds){ pivot.remove(noeuds); noeuds.geometry.dispose(); }
      if(fils){ pivot.remove(fils); fils.geometry.dispose(); }
      // nœuds
      const gN=new THREE.BufferGeometry(), hA=new Float32Array(r.N*4), hB=new Float32Array(r.N*4);
      for(let i=0;i<r.N;i++) for(let c=0;c<4;c++){ hA[i*4+c]=r.H[i*8+c]; hB[i*4+c]=r.H[i*8+4+c]; }
      gN.setAttribute('position',new THREE.BufferAttribute(r.pos,3));
      gN.setAttribute('a_seed',new THREE.BufferAttribute(r.seed,1));
      gN.setAttribute('a_r',new THREE.BufferAttribute(r.rad,1));
      gN.setAttribute('a_teinte',new THREE.BufferAttribute(r.teinte,1));
      gN.setAttribute('a_hA',new THREE.BufferAttribute(hA,4));
      gN.setAttribute('a_hB',new THREE.BufferAttribute(hB,4));
      noeuds=new THREE.Points(gN,matNoeuds); noeuds.frustumCulled=false; noeuds.renderOrder=1;
      // filaments courbes : S segments par filament (courbe de Bézier quadratique)
      const S=cfg.s, nb=r.garde.reduce((a,b)=>a+b,0), V=nb*S*2;
      const fp=new Float32Array(V*3), fs=new Float32Array(V), fsd=new Float32Array(V), fr=new Float32Array(V), fa=new Float32Array(V*4), fb=new Float32Array(V*4);
      let v=0;
      const pt=(a,b,m,t,o)=>{ const u=1-t; for(let k=0;k<3;k++) o[k]=u*u*a[k]+2*u*t*m[k]+t*t*b[k]; };
      const A=[0,0,0], B=[0,0,0], M=[0,0,0], P=[0,0,0];
      for(let e=0;e<r.E;e++){
        if(!r.garde[e]) continue;
        const i=r.aretes[e*2], j=r.aretes[e*2+1];
        for(let k=0;k<3;k++){ A[k]=r.pos[i*3+k]; B[k]=r.pos[j*3+k]; M[k]=(A[k]+B[k])/2; }
        const len=Math.hypot(B[0]-A[0],B[1]-A[1],B[2]-A[2]), lm=Math.hypot(M[0],M[1],M[2])||1, bom=(r.rnd()-.35)*.35*len;
        for(let k=0;k<3;k++) M[k]+=M[k]/lm*bom+(r.rnd()-.5)*.25*len;
        const sd=r.rnd();
        for(let sgm=0;sgm<S;sgm++) for(let w=0;w<2;w++){
          const t=(sgm+w)/S;
          pt(A,B,M,t,P);
          fp[v*3]=P[0]; fp[v*3+1]=P[1]; fp[v*3+2]=P[2];
          fs[v]=t; fsd[v]=sd; fr[v]=r.rad[i]+(r.rad[j]-r.rad[i])*t;
          for(let c=0;c<4;c++){
            const hi=r.H[i*8+c], hj=r.H[j*8+c], hi2=r.H[i*8+4+c], hj2=r.H[j*8+4+c];
            fa[v*4+c]=hi>=99||hj>=99?99:hi+(hj-hi)*t;
            fb[v*4+c]=hi2>=99||hj2>=99?99:hi2+(hj2-hi2)*t;
          }
          v++;
        }
      }
      const gF=new THREE.BufferGeometry();
      gF.setAttribute('position',new THREE.BufferAttribute(fp,3));
      gF.setAttribute('a_s',new THREE.BufferAttribute(fs,1));
      gF.setAttribute('a_seed',new THREE.BufferAttribute(fsd,1));
      gF.setAttribute('a_r',new THREE.BufferAttribute(fr,1));
      gF.setAttribute('a_hA',new THREE.BufferAttribute(fa,4));
      gF.setAttribute('a_hB',new THREE.BufferAttribute(fb,4));
      fils=new THREE.LineSegments(gF,matFil); fils.frustumCulled=false;
      pivot.add(fils); pivot.add(noeuds);
      U.u_perA.value.set(r.maxH[0]+10,r.maxH[1]+10,r.maxH[2]+10,r.maxH[3]+10);
      U.u_perB.value.set(r.maxH[4]+10,r.maxH[5]+10,r.maxH[6]+10,r.maxH[7]+10);
      cote=0;   // force le redimensionnement (densité de pixels propre au niveau)
    }

    // état lissé
    const cur=Object.assign({},ETATS.idle);
    const col=[[1,1,1],[1,1,1],[1,1,1]];
    let couleursPretes=false, neb=0, casc=0, onde=0, tLoc=0, premier=true;
    const BLANC=[255,255,255];
    const lerp=(a,b,k)=>a+(b-a)*k;

    function dessiner(e,dt){
      if(fini) return;
      if(e.cote!==cote){
        cote=e.cote; ratio=Math.min(window.devicePixelRatio||1,NIVEAUX[niveauActuel].pr);
        rendu.setPixelRatio(ratio); rendu.setSize(cote,cote,false);
        canvas.style.width=canvas.style.height=cote+'px';
        pxBase=Math.max(1.6,cote*ratio/[150,130,105,95][niveauActuel]);
      }
      dt=Math.min(dt||0,.1);
      const b=ETATS[e.vis]||ETATS[e.etat]||ETATS.idle, k=1-Math.exp(-dt*3);
      for(const c in b) cur[c]+=(b[c]-cur[c])*k;
      const amp=Math.min(1.1,e.amp||0);
      // écoute : l'activité suit le volume ; parole : vagues au rythme de la voix
      const act=cur.act+(e.vis==='listening'?amp*1.2:e.vis==='speaking'?amp*.5:0);
      tLoc+=dt; casc+=dt*cur.cv*(1+amp*.6); onde+=dt*cur.onde*(.35+amp*1.4);
      U.u_t.value=tLoc; U.u_casc.value=casc; U.u_act.value=act;
      U.u_cascA.value=cur.casc+(e.vis==='listening'?amp*.8:0);
      U.u_onde.value=onde; U.u_ondeA.value=cur.onde*(.25+amp*1.3);
      U.u_ech.value=cur.ech*(e.courant.rayon/.69)*(1+e.courant.respire*.03*Math.sin(e.phase*1.1)+amp*.04);
      U.u_agi.value=e.courant.agite; const acc=e.accent||0;
      U.u_lum.value=Math.min(1.4,e.courant.lum/.9)*[1,1.12,1.4,1.55][niveauActuel]*(1+acc*.6);   // moins de nœuds : chacun plus lumineux ; fond actif : plus lumineux
      U.u_fil.value=cur.fil*(1+acc*.9);
      U.u_px.value=pxBase*(1+acc*.35);
      // couleurs : le thème (nœuds = principale, filaments = secondaire, accent), ou celles de sécurité de l'entité
      const th=UI.couleurs(), sec=e.securite;
      const cible=sec ? [e.courant.c.map(x=>x*255),e.courant.d.map(x=>x*255),e.courant.c.map(x=>x*255*.6+102)] : [th[0],th[1],th[2]];
      const kc=premier?1:1-Math.exp(-dt*3.5); premier=false;
      for(let i=0;i<3;i++) for(let j=0;j<3;j++) col[i][j]=lerp(col[i][j],cible[i][j]/255,kc);
      neb=lerp(neb,!sec && UI.THEMES[UI.theme()] && UI.THEMES[UI.theme()].tourne && !document.documentElement.classList.contains('ui-eco')?1:0,kc);
      U.u_neb.value=neb;
      U.u_c1.value.setRGB(col[0][0],col[0][1],col[0][2]); U.u_c2.value.setRGB(col[1][0],col[1][1],col[1][2]); U.u_c3.value.setRGB(col[2][0],col[2][1],col[2][2]);
      // cœur qui pulse doucement
      const co=cur.coeur*(1+.12*Math.sin(tLoc*1.6))+amp*.25;
      noyau.scale.setScalar(.34*(.8+co*.4)); lueur.scale.setScalar(1.2*(.85+co*.3));
      const cc=[lerp(col[0][0],1,.45),lerp(col[0][1],1,.45),lerp(col[0][2],1,.45)];
      noyau.material.color.setRGB(cc[0],cc[1],cc[2]); noyau.material.opacity=Math.min(.85,.25+co*.4)*Math.min(1,U.u_lum.value);
      lueur.material.color.setRGB(col[1][0],col[1][1],col[1][2]); lueur.material.opacity=Math.min(.6,.12+co*.25)*Math.min(1,U.u_lum.value);
      // rotation : celle de l'entité (lente au repos, plus rapide en réflexion)
      pivot.rotation.y=e.angle;
      rendu.render(scene,camera);
      if(!couleursPretes){ couleursPretes=true; requestAnimationFrame(()=>canvas.classList.add('vu')); }
    }
    function detruire(){
      if(fini) return; fini=true;
      if(noeuds) noeuds.geometry.dispose(); if(fils) fils.geometry.dispose();
      matNoeuds.dispose(); matFil.dispose(); tex.dispose(); noyau.material.dispose(); lueur.material.dispose();
      rendu.dispose(); try{ rendu.forceContextLoss(); }catch(e){}
      if(canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
    canvas.addEventListener('webglcontextlost',ev=>{
      ev.preventDefault();
      if(Entite.info().moteur==='neurones' && moteur){ moteur=null; Entite.moteur(null); repli(new Error('contexte WebGL perdu')); }
    },false);

    // premier rendu tout de suite : une erreur de shader se voit ici, avant de remplacer la Sphère
    construire(Entite.info().niveau);
    rendu.compile(scene,camera);
    if(erreurShader){ rendu.dispose(); throw new Error('shader : '+String(erreurShader).slice(0,160)); }
    const gl=rendu.getContext();
    if(gl.isContextLost && gl.isContextLost()) throw new Error('WebGL indisponible');

    return {
      nom:'neurones',
      monter(h){ if(canvas.parentNode!==h) h.appendChild(canvas); cote=0; },
      niveau(n){ construire(n); },
      dessiner,
      quitter(erreur){
        canvas.classList.remove('vu');
        if(erreur && moteur){ moteur=null; repli(erreur); }
        setTimeout(detruire,900);
      }
    };
  }

  RayleBus.on('ui:reglages',r=>appliquer(r.entite));
  try{ appliquer(UI.reglages().entite); }catch(e){}
})();
