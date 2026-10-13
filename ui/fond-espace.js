"use strict";
/* ═════════════ FOND « ESPACE » : un écosystème spatial centré sur la Terre (three.js, monté par ui/fond-globe.js avec {espace:true}) ═════════════
   Repère du monde : la Terre est à l'origine, y = pôle nord céleste, ascension droite α → (cos δ cos α, sin δ, −cos δ sin α) (comme dir() du Globe).
   Tout est à sa VRAIE direction du jour (ui/astro.js) ; distances et tailles sont composées pour que ce soit beau et crédible :
     Soleil à 70 (disque granuleux animé, couronne, éruptions, lens-flare ; jamais aveuglant) · planètes à 40 (tailles apparentes agrandies, photos réelles,
     pôle de rotation réel, vitesses relatives réelles ×60, lumière du Soleil vue de CETTE planète : vraies phases) · Lune à 3,6 rayons terrestres (taille réelle ×1,
     vraie phase, libration, lueur cendrée) · ceinture d'astéroïdes à 18–34 dans le plan de l'écliptique · satellites près de la Terre.
   Shaders et textures : ui/espace-astres.js (fichiers ui/assets/espace/, 1k par défaut, 2k pour l'astre visité au palier 0 sur appareil capable).
   La Terre, elle, tourne au rythme réel (temps sidéral) : le jour et la nuit sont ceux de maintenant.
   Cadrage : la Terre est centrée DERRIÈRE l'entité (placement « centre » de ui/cadrage.js) ; la caméra reste en orbite autour d'elle et change de vue
   lentement (choix de ui/espace.js : Terre bien éclairée, Lune et planètes dans le champ). « Montre-moi Mars » : vol cinématique en arc vers l'astre, dérive douce autour de lui, puis retour seul sur la Terre (ou « reviens sur la Terre »).
   Qualité q : 0 textures complètes + relief + atmosphères + lens-flare · 1 textures 1k sans relief, sans lens-flare, moins d'astéroïdes ·
     2 couleurs simples sans aucune texture (planètes et Lune en sphères de couleur, Soleil en noyau lumineux). En Auto, c'est le fond qui baisse le premier (ui/background.js).
   Ambiance (ui/ambiance.js) : nuages de la Terre selon la météo réelle (couverture, vitesse du vent) ; aurores polaires sur la face nuit.
   API (en plus de taille/image/qualite/detruire) : vers(nom) · retour() · etat() */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  const RAD=Math.PI/180;
  const clamp=(x,a,b)=>x<a?a:x>b?b:x;
  const lisse=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
  const DIST_PLANETES=40, DIST_SOLEIL=70, DIST_LUNE=3.6, R_LUNE=.2727, R_SOLEIL=3.6, DIST_CIEL=230;

  // ───── shaders ─────  (corps, anneaux, Soleil, Terre : ui/espace-astres.js)
  const AST=UI.espaceAstres;
  const VS_PTS=`
attribute float a_size; attribute float a_phase; attribute vec3 a_col;
uniform float u_t, u_px, u_tw, u_att; varying vec3 v_c; varying float v_a;
void main(){
  vec4 mv=modelViewMatrix*vec4(position,1.0);
  gl_Position=projectionMatrix*mv;
  float tw=1.0-u_tw*(0.5+0.5*sin(u_t*(1.4+a_phase*3.2)+a_phase*57.0));
  float s=a_size*u_px*tw; if(u_att>0.0) s*=clamp(u_att/max(-mv.z,0.5),0.35,6.0);
  gl_PointSize=clamp(s,1.4*u_px,26.0*u_px); v_c=a_col; v_a=tw;
}`;
  const FS_PTS=`
varying vec3 v_c; varying float v_a;
void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.04,d); a*=a; gl_FragColor=vec4(v_c*1.7,a*v_a); }`;
  const FS_QUEUE=`
uniform float u_k; varying vec3 v_c; varying float v_a;
void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d); gl_FragColor=vec4(v_c*a*v_a*u_k,a*v_a*u_k); }`;
  const VS_CIEL=`varying vec3 v_d; void main(){ v_d=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const FS_CIEL=`
uniform sampler2D u_ciel; uniform mat3 u_gal; uniform vec3 u_c0,u_c1,u_c2; uniform float u_fade,u_neb,u_mw; varying vec3 v_d;
void main(){
  vec3 g=u_gal*normalize(v_d);
  vec2 uv=vec2(atan(g.y,g.x)/6.2831853+0.5,asin(clamp(g.z,-1.0,1.0))/3.14159265+0.5);
  vec4 t=texture2D(u_ciel,uv);
  vec3 p=normalize(v_d)*900.0, cell=floor(p), fr=p-cell-0.5;
  float h=fract(sin(dot(cell,vec3(12.9898,78.233,37.719)))*43758.5453), h2=fract(h*91.7);
  float poussiere=step(0.90,h)*smoothstep(0.5,0.12,length(fr))*(0.3+0.7*h2)*t.a*2.0;      // poussière d'étoiles dans la Voie lactée
  vec3 c=vec3(1.0,0.94,0.86)*(pow(t.a,1.5)*0.30+poussiere*0.85)*u_mw+(u_c0*t.r+u_c1*t.g+u_c2*t.b)*0.42*u_neb;
  gl_FragColor=vec4(c*u_fade,1.0);
}`;
  const VS_AURORE=`
varying vec3 v_n; varying vec3 v_loc; varying vec3 v_vue;
void main(){ v_loc=normalize(position); vec4 wp=modelMatrix*vec4(position,1.0); v_n=normalize(mat3(modelMatrix)*normal); v_vue=normalize(cameraPosition-wp.xyz); gl_Position=projectionMatrix*viewMatrix*wp; }`;
  const FS_AURORE=`
uniform vec3 u_sun, u_c1, u_c2; uniform float u_t, u_k;
varying vec3 v_n; varying vec3 v_loc; varying vec3 v_vue;
void main(){
  float lat=asin(clamp(v_loc.y,-1.0,1.0))*57.29578, lon=atan(-v_loc.z,v_loc.x);
  float ov=exp(-pow((abs(lat)-67.0)/4.6,2.0));
  float rid=0.5+0.5*sin(lon*14.0+u_t*0.55+2.2*sin(lon*5.0-u_t*0.33)+1.3*sin(lon*31.0+u_t*0.9));
  rid=pow(rid,2.2); float mel=0.55+0.45*sin(lon*3.0+u_t*0.21);
  float nuit=smoothstep(0.18,-0.30,dot(normalize(v_n),u_sun));
  float bord=0.45+0.9*pow(1.0-max(dot(normalize(v_n),v_vue),0.0),1.4);
  float a=ov*(0.18+0.82*rid)*mel*nuit*bord*u_k;
  vec3 c=mix(u_c1,u_c2,clamp((abs(lat)-64.0)/9.0,0.0,1.0));
  gl_FragColor=vec4(c*a*1.6,a);
}`;

  // cadrage de la Terre pour l'image fixe du mode Éco (ui/background.js) : même réglage que la 3D
  UI.fondsReels=UI.fondsReels||{};
  UI.fondsReels.espaceCadrage={fov:35,dist:6.4,rayon:1.09,echelleMax:1.12,placement:'centre'};

  UI.espaceMonter=function(X){
    const {THREE,canvas,rendu,scene,camera,groupe,terre,U,matNuages,couche,matAtmo,arcsMesh,placesPts,UA,UP}=X, sphereTerre=X.sphere;
    const TEX=UI.espaceTex, ESP=UI.espace, A=UI.astro;
    let q=X.q|0, W=1, H=1;
    const vec=(a,k)=>new THREE.Vector3(a[0]*(k||1),a[1]*(k||1),a[2]*(k||1));
    const abonnements=[], minuteries=[];
    const elements=()=>ESP.elements();

    camera.far=700; camera.fov=35; camera.updateProjectionMatrix();
    rendu.autoClear=false;
    groupe.rotation.set(0,0,0); groupe.position.set(0,0,0); groupe.scale.setScalar(1);
    const SUNPOS={value:new THREE.Vector3(0,0,DIST_SOLEIL)};          // position du Soleil dans le monde (éclaire les corps lointains)
    const POLE_ECL=vec(A.direction(270,66.56));                       // pôle nord de l'écliptique
    const pxr=()=>rendu.getPixelRatio();

    /* ───── étoiles (plusieurs couches qui scintillent) ───── */
    const UT={u_t:{value:0}};                                        // temps partagé
    function mat(vs,fs,uni,opt){ return new THREE.ShaderMaterial(Object.assign({uniforms:uni,vertexShader:vs,fragmentShader:fs,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending},opt||{})); }
    function nuagePoints(n,rayon,fnPos,fnTaille,fnCol,seed){
      const R=TEX.rng(seed), pos=new Float32Array(n*3), sz=new Float32Array(n), ph=new Float32Array(n), col=new Float32Array(n*3);
      for(let i=0;i<n;i++){ const p=fnPos(R,i); pos[i*3]=p[0]; pos[i*3+1]=p[1]; pos[i*3+2]=p[2]; sz[i]=fnTaille(R,i); ph[i]=R(); const c=fnCol(R,i); col[i*3]=c[0]; col[i*3+1]=c[1]; col[i*3+2]=c[2]; }
      const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('a_size',new THREE.BufferAttribute(sz,1)); g.setAttribute('a_phase',new THREE.BufferAttribute(ph,1)); g.setAttribute('a_col',new THREE.BufferAttribute(col,3));
      return g;
    }
    const sphere=(R,r)=>{ const z=R()*2-1, t=R()*6.2832, s=Math.sqrt(1-z*z); return [r*s*Math.cos(t),r*z,r*s*Math.sin(t)]; };
    const couleurEtoile=R=>{ const k=R(); return k<.12?[.62,.74,1]:k<.30?[.85,.9,1]:k<.78?[1,.97,.92]:k<.92?[1,.86,.62]:[1,.7,.5]; };
    const NB=[14000,7000,3000], NB2=[260,150,70];
    const etoiles=new THREE.Points(nuagePoints(NB[0],DIST_CIEL*.9,R=>sphere(R,DIST_CIEL*.9),R=>.6+1.9*Math.pow(R(),6),R=>couleurEtoile(R).map(x=>x*(.35+.65*R())),11),mat(VS_PTS,FS_PTS,{u_t:UT.u_t,u_px:{value:1.5},u_tw:{value:.55},u_att:{value:0}}));
    const brillantes=new THREE.Points(nuagePoints(NB2[0],DIST_CIEL*.88,R=>sphere(R,DIST_CIEL*.88),R=>3+4.5*Math.pow(R(),2),R=>couleurEtoile(R),12),mat(VS_PTS,FS_PTS,{u_t:UT.u_t,u_px:{value:1.5},u_tw:{value:.35},u_att:{value:0}}));
    etoiles.frustumCulled=brillantes.frustumCulled=false; scene.add(etoiles,brillantes);

    /* ───── Soleil : disque, halo, rayons (sprites additifs) ───── */
    const texHalo=new THREE.CanvasTexture(TEX.disque(256)), texNoyau=new THREE.CanvasTexture(TEX.noyau(128)), texRayons=new THREE.CanvasTexture(TEX.rayons(256));
    const spr=(tex,taille,couleur,op)=>{ const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color:couleur,transparent:true,opacity:op,blending:THREE.AdditiveBlending,depthWrite:false})); s.scale.setScalar(taille); return s; };
    const soleil=new THREE.Group();
    const sHalo=spr(texHalo,46,0xffe2b0,.20), sHalo2=spr(texHalo,130,0xffc080,.07), sNoyau=spr(texNoyau,R_SOLEIL*2.6,0xfffbf0,1), sRayons=spr(texRayons,26,0xffeacc,.09);
    // disque granuleux animé + couronne + éruptions (shader ui/espace-astres.js) ; en palier 2, le simple noyau lumineux d'avant
    const EXT_SOLEIL=3.4;
    const matSoleil=new THREE.ShaderMaterial({uniforms:{u_t:UT.u_t,u_taille:{value:2*R_SOLEIL*EXT_SOLEIL},u_ext:{value:EXT_SOLEIL},u_det:{value:1},u_k:{value:1}},vertexShader:AST.VS_SOLEIL,fragmentShader:AST.FS_SOLEIL,
      transparent:true,depthWrite:false,blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor});
    const sDisque=new THREE.Mesh(new THREE.PlaneGeometry(1,1),matSoleil); sDisque.frustumCulled=false;
    sDisque.renderOrder=2; soleil.add(sHalo2,sHalo,sRayons,sNoyau,sDisque); scene.add(soleil);

    /* ───── Terre : shader enrichi (relief, reflet sur les océans, ombre des nuages, atmosphère au limbe) ; relief et masque des océans chargés au palier 0 seulement ───── */
    const CH=AST.chargeur(THREE);
    const plat=new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1,THREE.RGBAFormat), noir=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat); plat.needsUpdate=noir.needsUpdate=true;
    const matTerre2=new THREE.ShaderMaterial({uniforms:Object.assign({u_jour:{value:X.jour},u_nuit:{value:X.nuit},u_nuages:{value:X.nuages},u_relief:{value:plat},u_ocean:{value:noir},u_texel:{value:new THREE.Vector2(1/2048,1/1024)},
      u_det:{value:q===0?1:0},u_relK:{value:.8},u_hasOcean:{value:0},u_dec:matNuages.uniforms.u_dec,u_couv:matNuages.uniforms.u_couv},U),vertexShader:AST.VS_TERRE,fragmentShader:AST.FS_TERRE});
    sphereTerre.material=matTerre2;
    matNuages.vertexShader=AST.VS_TERRE; matNuages.fragmentShader=AST.FS_NUAGES; matNuages.needsUpdate=true;     // nuages plus fins
    matAtmo.vertexShader=AST.VS_TERRE; matAtmo.fragmentShader=AST.FS_ATMO; matAtmo.needsUpdate=true;              // atmosphère : liseré, teinte orangée au crépuscule
    const terreRes={rel:false,oc:false};
    function appliquerTerre(){
      const u=matTerre2.uniforms; u.u_det.value=q===0?1:0;
      const charge=(cle,nom,res,pose,vide,ok)=>{
        if(q===0){ if(terreRes[cle]) return; terreRes[cle]=true; CH.tex(nom,res).then(t=>{ if(q!==0){ CH.liberer(nom,res); terreRes[cle]=false; return; } pose(t); },()=>{ terreRes[cle]=false; }); }
        else if(terreRes[cle]){ vide(); CH.liberer(nom,res); terreRes[cle]=false; }
      };
      charge('rel','terre-relief','2k',t=>{ u.u_relief.value=t; },()=>{ u.u_relief.value=plat; });
      charge('oc','terre-ocean','1k',t=>{ u.u_ocean.value=t; u.u_hasOcean.value=1; },()=>{ u.u_ocean.value=noir; u.u_hasOcean.value=0; });
    }

    /* ───── corps célestes : matériau commun (ui/espace-astres.js), textures réelles chargées à la demande ───── */
    const mobile=(()=>{ try{ return !!UI.reglages().mobile; }catch(e){ return false; } })();
    const capable2k=()=>q===0&&!mobile&&(X.hd||(navigator.deviceMemory||0)>=8)&&rendu.capabilities.maxTextureSize>=4096;   // 2k : palier 0 sur appareil capable, pour l'astre visité seulement
    const V3=(x,y,z)=>new THREE.Vector3(x,y,z);
    const corps=o=>new THREE.ShaderMaterial({uniforms:{
      u_map:{value:null},u_ring:{value:null},u_sunPos:o.sun||SUNPOS,u_gain:{value:o.gain||1},u_col:{value:new THREE.Color(...(o.couleur||[.55,.55,.55]))},u_atmo:{value:new THREE.Color(...(o.atmo||[0,0,0]))},
      u_shine:{value:new THREE.Color(0,0,0)},u_earthDir:{value:V3(0,0,1)},u_ringN:{value:V3(0,1,0)},u_ringC:{value:V3(0,0,0)},
      u_texel:{value:new THREE.Vector2(1/1024,1/512)},u_term:{value:new THREE.Vector2(...(o.term||[-.03,.30]))},u_ringR:{value:new THREE.Vector2(0,1)},
      u_hasMap:{value:0},u_amb:{value:o.amb==null?.04:o.amb},u_atmoK:{value:0},u_bump:{value:0},u_limb:{value:o.limb||0},u_anim:{value:o.anim||0},u_t:UT.u_t,u_flat:{value:o.flat||0},
      u_ringOn:{value:0},u_rimP:{value:3}},vertexShader:AST.VS_CORPS,fragmentShader:AST.FS_CORPS});
    const sunLune={value:new THREE.Vector3(0,0,1000)};              // direction réelle du Soleil depuis la Lune (très loin : rayons parallèles)
    const lune=new THREE.Mesh(new THREE.SphereGeometry(R_LUNE,q===0?96:48,q===0?48:24),corps({couleur:AST.COULEUR_LUNE,term:[-.02,.12],amb:.025,gain:AST.GAIN_LUNE,sun:sunLune})); scene.add(lune);

    /* ───── tout le reste, construit par étapes (la Terre s'affiche d'abord) ───── */
    const bati={}; let fini=false;
    const planetes={};                          // nom → {mesh, groupe, lueur, R, ...}
    let EXT=null;                                                          // ui/espace-extras.js : trou noir, rovers, lieux de la Terre, ISS détaillée (construit à la demande)
    const ext=()=>EXT||(UI.espaceExtras?(EXT=UI.espaceExtras.monter({THREE,scene,camera,terre,ESP,A,vec,planetes:()=>planetes,sunDir:()=>sunDir})):null);
    let ceinture=null, debris=null, rochers=[], satGroupe=null, issGroupe=null, issTrace=null, train=null, geos=null, issPts=null;
    let aurore=null, ciel=null, cielBake=null, cielTex=null;
    let cible=null;                             // astre visité (null = on regarde la Terre)
    const textures=[];                          // à libérer
    const texCanvas=c=>{ const t=new THREE.CanvasTexture(c); t.anisotropy=2; textures.push(t); return t; };
    const pause=()=>new Promise(r=>{ const id=setTimeout(r,16); minuteries.push(id); });
    const PL=AST.PLANETES;
    // lunes principales : [nom, distance (en rayons de la planète, resserrée pour rester dans l'image), rayon (× planète), couleur réelle, période (jours), phase initiale (°)]
    const LUNES={
      jupiter:[['Io',5.9,.06,[.96,.84,.45],1.769138,106.07],['Europe',9.4,.052,[.92,.88,.78],3.551181,175.73],['Ganymède',15,.085,[.60,.55,.48],7.154553,120.56],['Callisto',26.4,.078,[.32,.29,.27],16.689018,84.44]],
      saturne:[['Titan',7.4,.05,[.88,.62,.28],15.945421,60]]
    };

    /* textures des corps : 1k par défaut, 2k pour l'astre visité (palier 0 capable), rien au palier 2 ; en cas d'échec (hors ligne), textures dessinées par le code */
    const corpsListe=[];
    const resCible=c=>(capable2k()&&c.nom===cible)?'2k':'1k';
    function majBump(c){
      const u=c.mat.uniforms, w=u.u_map.value&&u.u_map.value.image?u.u_map.value.image.width:1024;
      u.u_bump.value=(q===0&&c.bumpK&&u.u_hasMap.value>.5)?c.bumpK*w/2048:0;
    }
    function poserTexture(c,t,res){
      const u=c.mat.uniforms, w=t.image&&t.image.width||1024, h=t.image&&t.image.height||512;
      u.u_map.value=t; u.u_hasMap.value=1; u.u_texel.value.set(1/w,1/h);
      if(c.res&&c.res!==res&&c.res!=='secours') CH.liberer(c.nom,c.res);
      c.res=res; majBump(c);
    }
    async function texturer(c,res){
      if(q>=2||c.demande===res||c.res===res) return;
      c.demande=res;
      let t=null; try{ t=await CH.tex(c.nom,res); }catch(e){ t=null; }
      if(c.demande!==res||q>=2){ if(t&&c.res!==res) CH.liberer(c.nom,res); return; }
      if(t){ poserTexture(c,t,res); return; }
      if(!c.res){                                                   // hors ligne : la texture dessinée par le code (plus grossière) prend le relais
        const cv=c.nom==='lune'?TEX.lune(q===0?768:384).albedo:TEX.planete(c.nom,q===0?512:256);
        if(cv){ poserTexture(c,texCanvas(cv),'secours'); }
      }
    }
    function videCorps(c){
      const u=c.mat.uniforms; if(c.res&&c.res!=='secours') CH.liberer(c.nom,c.res);
      u.u_map.value=null; u.u_hasMap.value=0; u.u_bump.value=0; c.res=null; c.demande=null;
    }
    function appliquerCorps(){                                      // selon le palier : q0 complet · q1 1k sans relief · q2 couleurs simples
      for(const c of corpsListe){
        if(q>=2){ videCorps(c); continue; }
        if(c.nom==='lune'&&!lune.visible&&!bati.lune) continue;
        texturer(c,resCible(c)); majBump(c);
      }
    }
    const nouveauCorps=(nom,mesh,bumpK)=>{ const c={nom,mesh,mat:mesh.material,bumpK:bumpK||0,res:null,demande:null}; corpsListe.push(c); return c; };
    nouveauCorps('lune',lune,2.2);

    async function etapeLune(){
      if(bati.lune) return; bati.lune=true;
      appliquerCorps();
    }
    async function etapePlanetes(){
      if(bati.planetes) return; bati.planetes=true;
      const seg=q===0?[64,32]:[32,16], bandeau=AST.RING;
      for(const nom of Object.keys(PL)){
        const d=PL[nom], R=DIST_PLANETES*Math.tan(d.ang*RAD/2);
        const g=new THREE.Group(), incl=new THREE.Group();                   // g : position ; incl : axe de rotation réel (pôle IAU)
        const sun={value:new THREE.Vector3(0,0,1000)};                  // Soleil vu de CETTE planète (direction héliocentrique réelle : phases justes, Jupiter presque pleine)
        const m=new THREE.Mesh(new THREE.SphereGeometry(R,seg[0],seg[1]),corps({couleur:d.couleur,atmo:d.atmo,term:d.term,flat:d.flat,limb:d.limb,anim:d.anim,gain:d.gain,amb:.05,sun}));
        const p0=vec(A.direction(d.pole[0],d.pole[1])).normalize();
        incl.quaternion.setFromUnitVectors(V3(0,1,0),p0); incl.add(m); g.add(incl);
        const c=nouveauCorps(nom,m,d.bump);
        let lueur=null;
        if(d.atmo){ lueur=new THREE.Mesh(new THREE.SphereGeometry(R*1.1,32,16),mat(AST.VS_CORPS,AST.FS_LUEUR,{u_c:{value:new THREE.Color(...d.atmo)},u_sunPos:sun,u_k:{value:(d.k||.5)*1.3}},{side:THREE.BackSide})); g.add(lueur); }
        const o={nom,g,m,incl,lueur,R,d,c,sun,spinRad:d.spin*RAD*AST.TEMPS_ACCELERE/86400};
        if(d.anneaux){
          const rd=TEX.anneaux(512), tx=new THREE.DataTexture(rd,512,1,THREE.RGBAFormat); tx.needsUpdate=true; tx.minFilter=tx.magFilter=THREE.LinearFilter; tx.generateMipmaps=false; textures.push(tx);
          const ring=new THREE.Mesh(new THREE.RingGeometry(R*bandeau.in,R*bandeau.out,q===0?160:80,1),new THREE.ShaderMaterial({uniforms:{u_ring:{value:tx},u_sunPos:sun,u_ctr:{value:new THREE.Vector3()},u_R:{value:R},u_in:{value:R*bandeau.in},u_out:{value:R*bandeau.out},u_flat:{value:0}},
            vertexShader:AST.VS_CORPS,fragmentShader:AST.FS_ANNEAU,transparent:true,side:THREE.DoubleSide,depthWrite:false}));
          ring.rotation.x=-Math.PI/2; o.ring=ring; o.ringGroup=new THREE.Group(); o.ringGroup.add(ring); g.add(o.ringGroup);
          m.material.uniforms.u_ring.value=tx; m.material.uniforms.u_ringR.value.set(R*bandeau.in,R*bandeau.out);
          o.axe=p0.clone();
          CH.tex('saturne-anneaux','',{lineaire:true}).then(t=>{ if(q>=2){ CH.liberer('saturne-anneaux',''); return; } ring.material.uniforms.u_ring.value=t; m.material.uniforms.u_ring.value=t; },()=>{});
        }
        if(LUNES[nom]){
          o.lunes=LUNES[nom].map(([n,r,rr,col,P,L0])=>{
            const mm=new THREE.Mesh(new THREE.SphereGeometry(R*rr,q===0?24:14,q===0?12:8),corps({couleur:col,amb:.06,sun}));
            if(q<2){ const w=q===0?256:128; mm.material.uniforms.u_map.value=texCanvas(TEX.satellite(n,w)); mm.material.uniforms.u_hasMap.value=1; mm.material.uniforms.u_texel.value.set(1/w,2/w); }
            g.add(mm); return {nom:n,m:mm,r:r*R,P,L0,col};
          });
        }
        { const p=A.planete(nom,Date.now()), d0=vec(A.direction(p.ra,p.dec),DIST_PLANETES); g.position.copy(d0); o.dir=d0.clone().normalize(); o.dist=p.dist; }
        g.visible=false;                                              // invisible tant que tout n'est pas en place (jamais une planète au centre de la Terre)
        planetes[nom]=o; scene.add(g);
        await pause();
      }
      majAstres(true); appliquerElements(); appliquerCorps();
    }
    // roche : géométrie déformée par un bruit (quelques gros rochers qui roulent doucement)
    function geoRoche(seed){
      const g=new THREE.IcosahedronGeometry(1,q===0?3:2), p=g.attributes.position, R=TEX.rng(seed), N=TEX.bruit(seed), a=[R()*9,R()*9,R()*9];
      for(let i=0;i<p.count;i++){ const x=p.getX(i),y=p.getY(i),z=p.getZ(i), n=1+.34*(N((x+1)*.5+a[0],(y+1)*.5+a[1],4,4,3)-.5)+.22*Math.sin(x*3.1+a[2])*Math.cos(y*2.7+a[0])*.5; p.setXYZ(i,x*n*(.8+.45*Math.abs(Math.sin(a[1]))),y*n,z*n*(.85+.3*Math.abs(Math.cos(a[2])))); }
      g.computeVertexNormals();
      { const n=g.attributes.normal, acc=new Map(), key=i=>Math.round(p.getX(i)*1e3)+','+Math.round(p.getY(i)*1e3)+','+Math.round(p.getZ(i)*1e3);   // la géométrie n'est pas indexée : on moyenne les normales des sommets confondus
        for(let i=0;i<p.count;i++){ const k=key(i), a=acc.get(k)||[0,0,0]; a[0]+=n.getX(i); a[1]+=n.getY(i); a[2]+=n.getZ(i); acc.set(k,a); }
        for(let i=0;i<p.count;i++){ const a=acc.get(key(i)), l=Math.hypot(a[0],a[1],a[2])||1; n.setXYZ(i,a[0]/l,a[1]/l,a[2]/l); } }
      return g;
    }
    function planEcliptique(R,rMin,rMax,epais){                      // point au hasard dans l'anneau de l'écliptique
      const a=R()*6.2832, r=rMin+(rMax-rMin)*Math.pow(R(),.8), h=(R()+R()+R()-1.5)*epais;
      return [r*Math.cos(a),h,r*Math.sin(a),a,r];
    }
    const rotEcl=(()=>{ const m=new THREE.Matrix4(); const y=new THREE.Vector3(0,1,0), n=POLE_ECL.clone().normalize(); return new THREE.Quaternion().setFromUnitVectors(y,n); })();
    async function etapeAsteroides(){
      if(bati.asteroides) return; bati.asteroides=true;
      const n=q===0?2600:1000, ceintureG=new THREE.Group();
      const g=nuagePoints(n,0,R=>{ const p=planEcliptique(R,18,34,1.8); return [p[0],p[1],p[2]]; },R=>.9+2.6*Math.pow(R(),4),R=>{ const k=.35+.5*R(); return [k*1.0,k*.88,k*.74]; },31);
      ceinture=new THREE.Points(g,mat(VS_PTS,FS_PTS,{u_t:UT.u_t,u_px:{value:1.5},u_tw:{value:.25},u_att:{value:26}})); ceinture.frustumCulled=false;
      ceintureG.add(ceinture);
      const nd=q===0?520:220;
      debris=new THREE.Points(nuagePoints(nd,0,R=>{ const v=sphere(R,2.6+R()*3.2); return [v[0],v[1]*.6,v[2]]; },R=>.8+1.6*Math.pow(R(),3),R=>{ const k=.45+.45*R(); return [k,k*.92,k*.8]; },32),
        mat(VS_PTS,FS_PTS,{u_t:UT.u_t,u_px:{value:1.5},u_tw:{value:.7},u_att:{value:7}})); debris.frustumCulled=false;
      ceintureG.add(debris);
      const rc=TEX.roche(q===0?256:128), mapR=texCanvas(rc.albedo), nr=q===0?9:4, R=TEX.rng(33);
      for(let i=0;i<nr;i++){
        const p=planEcliptique(R,19,33,1.2), m=new THREE.Mesh(geoRoche(100+i),corps({couleur:[.4,.37,.33],amb:.04,term:[-.03,.2],gain:1.15}));
        m.material.uniforms.u_map.value=mapR; m.material.uniforms.u_hasMap.value=1; m.material.uniforms.u_texel.value.set(1/mapR.image.width,1/mapR.image.height); m.material.uniforms.u_bump.value=q===0?2.6:0;
        const e=.35+.7*R(); m.scale.setScalar(e); m.position.set(p[0],p[1],p[2]); m.userData={e,w:new THREE.Vector3(R()-.5,R()-.5,R()-.5).multiplyScalar(.5)};
        ceintureG.add(m); rochers.push(m);
      }
      ceintureG.quaternion.copy(rotEcl); ceintureG.userData.ecl=true; scene.add(ceintureG); bati.ceintureG=ceintureG;
      await pause();
    }
    // orbite inertielle (inclinaison i, nœud Ω, argument u en radians) → direction dans le monde
    function orb(i,om,u,r){ const lat=Math.asin(Math.sin(i)*Math.sin(u))*180/Math.PI, ra=om+Math.atan2(Math.cos(i)*Math.sin(u),Math.cos(u))*180/Math.PI; const d=A.direction(ra,lat); return [d[0]*r,d[1]*r,d[2]*r]; }
    function pointsFixes(n,tailleBase,att,fnCol,tw){
      const g=nuagePoints(n,0,()=>[0,0,0],()=>tailleBase,fnCol||(()=>[1,.97,.9]),n+tailleBase);
      const p=new THREE.Points(g,mat(VS_PTS,FS_PTS,{u_t:UT.u_t,u_px:{value:1.5},u_tw:{value:tw==null?.3:tw},u_att:{value:att||0}})); p.frustumCulled=false; return p;
    }
    async function etapeSatellites(){
      if(bati.satellites) return; bati.satellites=true;
      satGroupe=new THREE.Group(); scene.add(satGroupe);
      // ISS : point lumineux + petit modèle (agrandi) + traînée de son orbite
      issPts=pointsFixes(1,9,0,()=>[1,.95,.8],.15); satGroupe.add(issPts);
      issGroupe=new THREE.Group(); const dore=new THREE.MeshBasicMaterial({color:0xd8b45a}), gris=new THREE.MeshBasicMaterial({color:0xbfc6d0}), bleu=new THREE.MeshBasicMaterial({color:0x2c4a8c});
      issGroupe.add(new THREE.Mesh(new THREE.BoxGeometry(.075,.004,.004),gris));
      for(const s of [-1,1]){ for(const z of [-1,1]){ const pan=new THREE.Mesh(new THREE.BoxGeometry(.034,.0012,.016),bleu); pan.position.set(s*.045,0,z*.011); issGroupe.add(pan); } }
      const mod=new THREE.Mesh(new THREE.CylinderGeometry(.0035,.0035,.028,8),dore); mod.rotation.z=Math.PI/2; mod.position.set(0,0,.0); issGroupe.add(mod);
      const mod2=new THREE.Mesh(new THREE.CylinderGeometry(.0028,.0028,.02,8),gris); mod2.position.set(0,.0,.012); mod2.rotation.x=Math.PI/2; issGroupe.add(mod2);
      issGroupe.scale.setScalar(1.15); satGroupe.add(issGroupe);
      try{ const e=ext(); if(e) e.ameliorerISS(issGroupe); }catch(err){}                // modèle détaillé (poutre, panneaux, modules), GLB facultatif
      const NT=64, gt=new THREE.BufferGeometry(); gt.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NT*3),3)); gt.setAttribute('color',new THREE.BufferAttribute(new Float32Array(NT*3),3));
      issTrace=new THREE.Line(gt,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})); issTrace.frustumCulled=false; satGroupe.add(issTrace);
      // train de petits satellites (53°, 550 km) : 16 points alignés
      train=pointsFixes(16,3.2,0,()=>[.85,.92,1],.2); satGroupe.add(train);
      // satellites fixes (géostationnaires, rapprochés pour rester dans l'image) : fixes par rapport au sol, ils clignotent doucement
      geos=pointsFixes(8,4.2,0,()=>[1,.9,.7],.9); terre.add(geos);
      const gp=geos.geometry.attributes.position; for(let i=0;i<8;i++){ const lon=i*45+11, r=2.15+.12*(i%3), a=lon*RAD; gp.setXYZ(i,r*Math.cos(a),0,-r*Math.sin(a)); } gp.needsUpdate=true;
      const chargerISS=()=>{ try{ ESP.iss.charger(); }catch(e){} };
      chargerISS(); minuteries.push(setInterval(chargerISS,ESP.TTL_ISS+5000));
    }
    async function etapeAurores(){
      if(bati.aurores) return; bati.aurores=true;
      aurore=new THREE.Mesh(new THREE.SphereGeometry(1.016,q===0?96:64,q===0?48:32),new THREE.ShaderMaterial({uniforms:{u_sun:U.u_soleil,u_t:UT.u_t,u_k:{value:1},u_c1:{value:new THREE.Color(.15,1,.55)},u_c2:{value:new THREE.Color(.7,.35,1)}},
        vertexShader:VS_AURORE,fragmentShader:FS_AURORE,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
      terre.add(aurore);
    }
    async function etapeCiel(){
      if(bati.ciel) return; bati.ciel=true;
      cielBake=TEX.ciel(q===0?768:384,q===0?384:192);
      const gc=vec(A.direction(266.405,-28.936)), ngp=vec(A.direction(192.859,27.128)), yg=new THREE.Vector3().crossVectors(ngp,gc).normalize();
      const gal=new THREE.Matrix3(); gal.set(gc.x,gc.y,gc.z, yg.x,yg.y,yg.z, ngp.x,ngp.y,ngp.z);
      cielTex=new THREE.DataTexture(cielBake.donnees,cielBake.w,cielBake.h,THREE.RGBAFormat); cielTex.wrapS=THREE.RepeatWrapping; cielTex.wrapT=THREE.ClampToEdgeWrapping; cielTex.minFilter=cielTex.magFilter=THREE.LinearFilter; cielTex.generateMipmaps=false; textures.push(cielTex);
      ciel=new THREE.Mesh(new THREE.SphereGeometry(DIST_CIEL*1.05,32,16),new THREE.ShaderMaterial({uniforms:{u_ciel:{value:cielTex},u_gal:{value:gal},u_c0:{value:new THREE.Color()},u_c1:{value:new THREE.Color()},u_c2:{value:new THREE.Color()},u_fade:{value:0},u_neb:{value:1},u_mw:{value:1}},
        vertexShader:VS_CIEL,fragmentShader:FS_CIEL,side:THREE.BackSide,depthWrite:false,depthTest:false}));
      ciel.renderOrder=-10; ciel.visible=false; ciel.frustumCulled=false; scene.add(ciel);
    }
    // comètes (rares) et étoiles filantes
    const COM=64; let comete=null, prochaineComete=0, filantes=[], prochaineFilante=0;
    function initComete(){
      const g=nuagePoints(COM,0,()=>[0,0,0],()=>1,()=>[.75,.9,1],55);
      const pts=new THREE.Points(g,mat(VS_PTS,FS_QUEUE,{u_t:UT.u_t,u_px:{value:1.5},u_tw:{value:0},u_att:{value:60},u_k:{value:0}})); pts.frustumCulled=false;
      const tete=spr(texNoyau,1.6,0xdff0ff,1); tete.visible=false; scene.add(pts,tete);
      comete={pts,tete,actif:false,t:0,vie:36,pos:new THREE.Vector3(),vel:new THREE.Vector3()};
    }
    function lancerComete(){
      if(!comete) initComete(); const c=comete;
      const nx=(Math.random()*1.3-.65), ny=(Math.random()*1.0-.5), r=34+Math.random()*26, dirCam=new THREE.Vector3(); camera.getWorldDirection(dirCam);
      const d=new THREE.Vector3(nx,ny,.5).unproject(camera).sub(camera.position).normalize();
      c.pos.copy(camera.position).addScaledVector(d,r);
      const droite=new THREE.Vector3().crossVectors(dirCam,camera.up).normalize(), haut=new THREE.Vector3().crossVectors(droite,dirCam).normalize();
      const ang=Math.random()*6.283; c.vel.copy(droite).multiplyScalar(Math.cos(ang)).addScaledVector(haut,Math.sin(ang)*.45).multiplyScalar(.9+Math.random()*.8);
      c.t=0; c.actif=true; c.tete.visible=true;
    }
    function majComete(dt,on){
      if(!comete||!comete.actif){ return; }
      const c=comete; c.t+=dt; c.pos.addScaledVector(c.vel,dt);
      const k=lisse(0,3,c.t)*(1-lisse(c.vie-6,c.vie,c.t))*(on?1:0);
      c.tete.position.copy(c.pos); c.tete.material.opacity=k; c.pts.material.uniforms.u_k.value=k;
      const away=c.pos.clone().sub(SUNPOS.value).normalize(), p=c.pts.geometry.attributes.position, s=c.pts.geometry.attributes.a_size, col=c.pts.geometry.attributes.a_col, ph=c.pts.geometry.attributes.a_phase, L=13+3*Math.sin(c.t);
      for(let i=0;i<COM;i++){
        const f=i/(COM-1), wob=Math.sin(c.t*2+ph.array[i]*30)*f*.5;
        p.setXYZ(i,c.pos.x+away.x*f*L+wob,c.pos.y+away.y*f*L+wob*.6,c.pos.z+away.z*f*L-wob);
        s.setX(i,(1-f*.72)*(7+4*(1-f))); const b=Math.pow(1-f,1.5); col.setXYZ(i,.55+.45*b,.78+.2*b,1);
      }
      p.needsUpdate=true; s.needsUpdate=true; col.needsUpdate=true;
      if(c.t>c.vie){ c.actif=false; c.tete.visible=false; c.pts.material.uniforms.u_k.value=0; }
    }
    function lancerFilante(){
      let f=filantes.find(x=>!x.actif);
      if(!f && filantes.length<2){ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3)); const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xcfe2ff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false})); l.frustumCulled=false; camera.add(l); f={l,actif:false}; filantes.push(f); }
      if(!f) return;
      const hy=Math.tan(camera.fov*RAD/2)*30, hx=hy*camera.aspect, sens=Math.random()<.5?-1:1;
      f.x=(Math.random()*1.4-.7)*hx; f.y=(Math.random()*.6+.1)*hy; f.vx=sens*(28+Math.random()*16); f.vy=-(14+Math.random()*10); f.t=0; f.vie=.55+Math.random()*.35; f.actif=true;
    }
    function majFilantes(dt,on){
      for(const f of filantes){ if(!f.actif) continue; f.t+=dt; f.x+=f.vx*dt; f.y+=f.vy*dt; const k=Math.sin(Math.min(1,f.t/f.vie)*Math.PI)*(on?1:0);
        const p=f.l.geometry.attributes.position, len=.11; p.setXYZ(0,f.x,f.y,-30); p.setXYZ(1,f.x-f.vx*len,f.y-f.vy*len,-30); p.needsUpdate=true; f.l.material.opacity=k*.9; if(f.t>f.vie){ f.actif=false; f.l.material.opacity=0; } }
    }
    if(camera.parent!==scene) scene.add(camera);

    /* ───── lens-flare (palier 0) : passe 2D par-dessus la scène ───── */
    const scene2=new THREE.Scene(), cam2=new THREE.OrthographicCamera(-1,1,1,-1,-10,10);
    const flare={groupe:new THREE.Group(),items:[]};
    (function(){
      const tex={disque:texHalo,anneau:new THREE.CanvasTexture(TEX.anneauFlare(256)),hex:new THREE.CanvasTexture(TEX.hexagone(128)),streak:new THREE.CanvasTexture(TEX.streak(256,16)),noyau:texNoyau};
      textures.push(tex.anneau,tex.hex,tex.streak);
      const def=[['streak',0,1.0,[.78,.86,1],.10,.9],['disque',0,.75,[1,.88,.7],.28,0],['hex',.32,.07,[.7,.9,1],.45,0],['anneau',.62,.13,[1,.8,.6],.40,0],['hex',1.0,.05,[1,.85,.7],.45,0],['disque',1.45,.16,[.6,.8,1],.25,0],['anneau',1.9,.25,[.8,.9,1],.20,0]];
      for(const [t,g,s,c,o,aniso] of def){ const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex[t],color:new THREE.Color(...c),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false})); flare.groupe.add(sp); flare.items.push({sp,g,s,o,aniso}); }
      scene2.add(flare.groupe);
    })();
    function majFlare(k){
      const v=SUNPOS.value.clone().project(camera);
      const dir=new THREE.Vector3(); camera.getWorldDirection(dir);
      const devant=SUNPOS.value.clone().sub(camera.position).dot(dir)>0;
      let vis=devant?1-lisse(.85,1.4,Math.max(Math.abs(v.x),Math.abs(v.y))):0;
      // la Terre cache le Soleil : rayon caméra → Soleil contre la sphère terrestre
      const toS=SUNPOS.value.clone().sub(camera.position), L=toS.length(); toS.divideScalar(L);
      const t=-camera.position.dot(toS);                           // abscisse du point le plus proche de la Terre sur le rayon
      if(t>0&&t<L){ const d=camera.position.clone().addScaledVector(toS,t).length(); vis*=lisse(.98,1.22,d); }
      const sx=v.x*W/2, sy=v.y*H/2;
      for(const it of flare.items){
        const p=-it.g; it.sp.position.set(sx*(it.g===0?1:p),sy*(it.g===0?1:p),0);
        const taille=it.s*H*(it.aniso?1:1); it.sp.scale.set(it.aniso?W*.9:taille,it.aniso?H*.05:taille,1);
        it.sp.material.opacity=it.o*vis*k*(it.g===0?1:.55+.45*Math.min(1,Math.hypot(v.x,v.y)));
      }
      flare.groupe.visible=vis*k>.01;
    }

    /* ───── astres : positions du jour ───── */
    const sunDir=new THREE.Vector3(1,0,0), moonDir=new THREE.Vector3(0,0,1);
    let tAstres=-1e9;
    function majAstres(force){
      const now=Date.now(); if(!force && now-tAstres<2000) return; tAstres=now;
      const s=A.soleilEq(now), m=A.luneEq(now);
      sunDir.set(...A.direction(s.ra,s.dec)); moonDir.set(...A.direction(m.ra,m.dec));
      U.u_soleil.value.copy(sunDir); SUNPOS.value.copy(sunDir).multiplyScalar(DIST_SOLEIL); soleil.position.copy(SUNPOS.value);
      lune.position.copy(moonDir).multiplyScalar(DIST_LUNE); sunLune.value.copy(lune.position).addScaledVector(sunDir,1000);
      const X=moonDir.clone().negate(), Y=POLE_ECL.clone().sub(X.clone().multiplyScalar(POLE_ECL.dot(X))).normalize(), Z=new THREE.Vector3().crossVectors(X,Y);
      lune.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X,Y,Z));
      const jj=(now-946728000000)/864e5;                             // libération : la Lune se balance un peu (≈ 8° en longitude, 6,7° en latitude), on voit un peu plus que la moitié
      lune.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,7.9*RAD*Math.sin(2*Math.PI*jj/27.5546+.8),6.7*RAD*Math.sin(2*Math.PI*jj/27.2122+2.1),'XYZ')));
      { const u=lune.material.uniforms, ecl=A.lune(now).eclairee; u.u_earthDir.value.copy(moonDir).negate(); u.u_shine.value.setRGB(.085,.12,.2).multiplyScalar(.2+.8*(1-ecl)); }   // la Terre éclaire la face nuit : fort à la nouvelle Lune
      for(const nom in planetes){
        const o=planetes[nom], p=A.planete(nom,now), d=vec(A.direction(p.ra,p.dec),DIST_PLANETES); o.g.position.copy(d); o.dir=d.clone().normalize(); o.dist=p.dist;
        { const Lr=sunDir.clone().multiplyScalar(s.dist).addScaledVector(o.dir,-p.dist).normalize(); o.sun.value.copy(d).addScaledVector(Lr,1000); }   // Soleil − planète, en unités astronomiques
        if(o.ringGroup){                                             // anneaux : plan réel de Saturne (pôle ≈ α 40,6° δ 83,5°), ouverture un peu accentuée
          const n=vec(A.direction(40.59,83.54)).normalize(), v=o.dir, nv=n.dot(v);
          if(Math.abs(nv)<.27){ n.addScaledVector(v,(nv<0?-1:1)*(.27-Math.abs(nv))*1.3).normalize(); }
          o.ringGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),n); o.incl.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),n);
          o.ring.material.uniforms.u_ctr.value.copy(d); o.axe=n;
          const um=o.m.material.uniforms; um.u_ringN.value.copy(n); um.u_ringC.value.copy(d);
        }
      }
    }
    function majLunes(){                                              // lunes de Jupiter (plan de l'écliptique ≈ équateur de Jupiter) et Titan (plan des anneaux), vraies périodes
      const j=(Date.now()-946728000000)/864e5;
      for(const nom in planetes){
        const o=planetes[nom]; if(!o.lunes) continue; const n=(o.axe||POLE_ECL).clone().normalize();
        const u=new THREE.Vector3(1,0,0).sub(n.clone().multiplyScalar(n.x)).normalize(), v=new THREE.Vector3().crossVectors(n,u);
        for(const l of o.lunes){ const a=(l.L0+360/l.P*j)*RAD; l.m.position.copy(u).multiplyScalar(Math.cos(a)*l.r).addScaledVector(v,Math.sin(a)*l.r); }
      }
    }

    /* ───── caméra : orbite lente, changement de vue, vol vers un astre ───── */
    const cad={dist:6.4,ox:0,oy:0,tdist:6.4,tox:0,toy:0,vx:0,vy:0};          // ox/oy : où la Terre se place (derrière l'entité) ; vx/vy : où se place l'astre visité (zone dégagée)
    const base={yaw:200,pitch:14,tyaw:200,tpitch:14};
    let figee=false, figDist=0, solo=false, tOrbite=0, offMix=1, vol=null, arrivee=0, retexture=false, prochainChangement=150, posCam=new THREE.Vector3(0,0,6.4), regard=new THREE.Vector3(), initialise=false;
    const vueVec=(yaw,pitch)=>new THREE.Vector3(...ESP.vueVecteur(yaw,pitch));
    function contexteVue(){
      const el=elements(), pl=[];
      if(el.planetes&&q<2) for(const n in planetes){ const o=planetes[n]; if(o.dir) pl.push({nom:n,dir:[o.dir.x,o.dir.y,o.dir.z],poids:{venus:1.2,jupiter:1.5,saturne:1.3,mars:1.1,mercure:.6,uranus:.4,neptune:.3}[n]||.5}); }
      return {soleil:[sunDir.x,sunDir.y,sunDir.z],lune:el.lune?[moonDir.x,moonDir.y,moonDir.z]:null,planetes:pl,aspect:camera.aspect};
    }
    function choisirBase(initial){
      const v=ESP.choisirVue(contexteVue(),initial?{}:{loinDe:base.tyaw,ecartMin:50});
      if(v){ base.tyaw=v.yaw; base.tpitch=v.pitch; if(initial){ base.yaw=v.yaw; base.pitch=v.pitch; } }
    }
    const ease=t=>t*t*(3-2*t), douce=t=>t*t*t*(t*(t*6-15)+10);          // douce : départ et arrivée très progressifs (vol cinématique)
    let DUREE_VISITE=24;                                                     // secondes passées près d'un astre avant de revenir seul sur la Terre
    function poseOrbite(){
      const t=tOrbite, yaw=figee?base.yaw:base.yaw+26*Math.sin(t*.0299)+8*Math.sin(t*.071+1.3), pitch=figee?base.pitch:base.pitch+5*Math.sin(t*.043+.6);
      const c=vueVec(yaw,pitch);
      return {pos:c.multiplyScalar(cad.dist),look:new THREE.Vector3(0,0,0)};
    }
    function poseCible(nom){
      { const e=nom&&ext(); if(e&&e.reconnait(nom)){ const p=e.pose(nom,arrivee); return p||poseOrbite(); } }
      const up=new THREE.Vector3(0,1,0);
      if(nom==='soleil'){ const S=SUNPOS.value, perp=new THREE.Vector3().crossVectors(sunDir,up).normalize(); return {pos:S.clone().addScaledVector(sunDir,-R_SOLEIL*7.5).addScaledVector(perp,R_SOLEIL*1.6).addScaledVector(up,R_SOLEIL*1.1),look:S.clone()}; }
      if(nom==='lune'){ const M=lune.position, perp=new THREE.Vector3().crossVectors(moonDir,up).normalize(); return {pos:M.clone().addScaledVector(moonDir,-.55).addScaledVector(perp,1.95).addScaledVector(up,.4),look:M.clone()}; }
      if(nom==='iss'){ const e=ESP.iss.position(Date.now()), d=vec(A.direction(e.ra,e.dec)), P=d.clone().multiplyScalar(e.r), e2=ESP.iss.position(Date.now()+30000), P2=vec(A.direction(e2.ra,e2.dec)).multiplyScalar(e2.r), av=P2.clone().sub(P).normalize();
        return {pos:P.clone().addScaledVector(d,.17).addScaledVector(av,-.2).addScaledVector(new THREE.Vector3().crossVectors(d,av),.2),look:P}; }
      const o=planetes[nom]; if(!o||!o.dir) return poseOrbite();
      const tanH=Math.tan(camera.fov*RAD/2)*camera.aspect, etendue=o.R*(o.d.anneaux?2.5:1.12);
      const P=o.g.position, dF=Math.max(o.R*o.d.cadre,etendue/(.6*tanH)), perp=new THREE.Vector3().crossVectors(o.dir,up).normalize();   // écran étroit (téléphone vertical) : on recule pour que l'astre (et les anneaux) restent entiers
      const dec=new THREE.Vector3().addScaledVector(o.dir,-dF).addScaledVector(perp,dF*.32).addScaledVector(up,dF*.14);
      dec.applyAxisAngle(up,.42*Math.sin(arrivee*.16));                          // une fois arrivé, la caméra dérive doucement autour de l'astre (on voit son relief et sa rotation)
      return {pos:P.clone().add(dec),look:P.clone()};
    }
    function demarrerVol(nomCible){
      cible=nomCible; arrivee=0; try{ const e=nomCible&&ext(); if(e&&e.reconnait(nomCible)) e.preparer(nomCible); ESP.publier&&ESP.publier(nomCible); }catch(err){}
      vol={t:0,from:camera.position.clone(),fromLook:regard.clone(),dur:3.4,sens:Math.random()<.5?-1:1};
      const dest=(nomCible?poseCible(nomCible):poseOrbite()).pos; vol.dur=clamp(3.6+dest.distanceTo(camera.position)/14,3.6,7.5);
      if(nomCible) appliquerCorps(); else retexture=true;                      // astre visité : texture 2k (palier 0 capable) ; au retour, on repasse en 1k une fois parti
    }
    function vers(nom){
      if(!nom||nom==='terre') return retour(true);
      const el=elements();
      if(nom in PL&&!el.planetes) ESP.regler('planetes',true);
      if(nom==='lune'&&!el.lune) ESP.regler('lune',true);
      if(nom==='iss'&&!el.satellites) ESP.regler('satellites',true);
      assurer();
      if(cible===nom) return; demarrerVol(nom);
    }
    function retour(explicite){
      const h=explicite?null:(ESP.accueil&&ESP.accueil());                    // vue par défaut (« garde Mars comme vue par défaut ») : on y revient au lieu de la Terre
      if(h){ if(cible===h&&!vol) return; return vers(h); }
      if(cible===null&&!vol) return; demarrerVol(null);
    }
    function majCamera(dt){
      tOrbite+=dt;
      // cadrage de la Terre (derrière l'entité) : distance et décalage de l'image, glissés doucement
      const k=1-Math.exp(-dt*4);
      cad.dist+=(cad.tdist-cad.dist)*k; cad.ox+=(cad.tox-cad.ox)*k; cad.oy+=(cad.toy-cad.oy)*k;
      cad.vx+=(cad.tvx-cad.vx)*k; cad.vy+=(cad.tvy-cad.vy)*k;
      let dy=((base.tyaw-base.yaw+540)%360)-180; base.yaw=(base.yaw+dy*(1-Math.exp(-dt*.25))+360)%360; base.pitch+=(base.tpitch-base.pitch)*(1-Math.exp(-dt*.25));
      prochainChangement-=dt; if(prochainChangement<=0&&!cible&&!vol){ prochainChangement=150; choisirBase(false); }
      const cib=cible?poseCible(cible):poseOrbite();
      if(vol){
        vol.t+=dt; const f=clamp(vol.t/vol.dur,0,1), e=douce(f);
        posCam.lerpVectors(vol.from,cib.pos,e);
        const seg=cib.pos.clone().sub(vol.from), lat=new THREE.Vector3().crossVectors(seg,camera.up).normalize();
        posCam.addScaledVector(lat,Math.sin(Math.PI*e)*seg.length()*.14*vol.sens);   // trajectoire en arc, pas en ligne droite
        regard.lerpVectors(vol.fromLook,cib.look,douce(Math.min(1,f*1.18)));          // le regard devance un peu le déplacement
        if(vol.t>=vol.dur){ vol=null; if(retexture&&!cible){ retexture=false; appliquerCorps(); } }
      }
      else{
        posCam.copy(cib.pos); regard.copy(cib.look);
        if(cible){ arrivee+=dt; if(arrivee>DUREE_VISITE&&cible!==(ESP.accueil&&ESP.accueil())) retour(); }                  // après un moment près de l'astre, retour doux sur la Terre
      }
      camera.position.copy(posCam); camera.up.set(0,1,0); camera.lookAt(regard);
      // décalage de l'image : Terre centrée sur l'entité, sauf pendant qu'on regarde autre chose
      const visee=cible?0:1; offMix+=(visee-offMix)*(1-Math.exp(-dt*(cible?3.2:1.8)));
      const m=offMix*offMix*(3-2*offMix), ox=cad.vx+(cad.ox-cad.vx)*m, oy=cad.vy+(cad.oy-cad.vy)*m;
      if(Math.abs(ox)+Math.abs(oy)>.5) camera.setViewOffset(W,H,-ox,-oy,W,H); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    }

    /* ───── dimensions, qualité, éléments ───── */
    function recadrer(){
      if(figDist) return;                                            // image fixe en préparation : cadrage imposé
      try{
        const c=UI.cadrage.cadrer({cam:{fov:camera.fov,dist:ESP.DIST_CAM},rayonBase:1.09,echelleMax:1.12,canvasW:W,canvasH:H,parallaxe:16,placement:'centre'});
        cad.tdist=ESP.DIST_CAM/Math.max(.2,c.scale); const b=c.boite;
        cad.tox=(b.x0+b.x1)/2-W/2; cad.toy=(b.y0+b.y1)/2-H/2;
        // l'astre visité (« montre-moi Mars ») se place dans la zone dégagée : à droite de l'entité, ou en dessous sur un écran étroit
        const m=UI.cadrage.mesurer(), dz=UI.cadrage.disposer(Object.assign({},m,{marge:Math.round(Math.min(m.W,m.H)*.03)})), z=dz.zone, dx=(W-m.W)/2, dy=(H-m.H)/2;
        const cx=(clamp(z.x0,0,m.W)+clamp(z.x1,0,m.W))/2, cy=(clamp(z.y0,0,m.H)+Math.min(z.y1,m.bas))/2;
        cad.tvx=cx+dx-W/2; cad.tvy=Math.min(cy,m.bas-40)+dy-H/2;
        if(!initialise){ cad.dist=cad.tdist; cad.ox=cad.tox; cad.oy=cad.toy; cad.vx=cad.tvx; cad.vy=cad.tvy; }
      }catch(e){ cad.tdist=6.4; cad.tox=cad.toy=cad.tvx=cad.tvy=0; }
    }
    function appliquerQualite(){
      rendu.setPixelRatio([Math.min(window.devicePixelRatio||1,1.5),.9,.65][q]);
      if(W>1) rendu.setSize(W,H,false);
      const px=pxr(); for(const m of [etoiles.material,brillantes.material]) m.uniforms.u_px.value=px*1.0;
      for(const o of [ceinture,debris,issPts,train,geos,comete&&comete.pts]) if(o&&o.material.uniforms.u_px) o.material.uniforms.u_px.value=px;
      etoiles.geometry.setDrawRange(0,NB[q]); brillantes.geometry.setDrawRange(0,NB2[q]);
      couche.visible=q<2;
    }
    function assurer(){                                              // construit ce qui manque (une fois), selon le palier et les éléments activés
      const el=elements(); let p=Promise.resolve();
      const etape=(cond,nom,f)=>{ if(cond&&!bati[nom]) p=p.then(()=>f()).then(pause); };
      etape(el.lune,'lune',etapeLune);
      etape(el.planetes,'planetes',etapePlanetes);                    // au palier 2 : sphères aux couleurs simples (sans texture)
      etape(q<2&&el.asteroides,'asteroides',etapeAsteroides);
      etape(q<2&&el.satellites,'satellites',etapeSatellites);
      etape(q<2&&el.aurores,'aurores',etapeAurores);
      etape(q<2&&el.voielactee,'ciel',etapeCiel);
      p.catch(e=>console.warn('[espace]',e&&e.message||e));
    }
    function appliquerElements(){
      const el=elements(), plein=q<2;
      lune.visible=!!el.lune;
      for(const n in planetes){ const o=planetes[n]; o.g.visible=!!el.planetes; if(o.lueur) o.lueur.visible=q===0; o.m.material.uniforms.u_atmoK.value=(q<2&&o.d.atmo)?(o.d.k||.5)*.8:0;   // q1 : sans lueur autour ; q2 : couleurs simples, sans atmosphère
        if(o.ring){ o.ring.material.uniforms.u_flat.value=q>=2?1:0; o.m.material.uniforms.u_ringOn.value=q<2?1:0; }
        if(o.lunes) for(const l of o.lunes){ const u=l.m.material.uniforms; if(q>=2){ u.u_hasMap.value=0; } else if(u.u_map.value) u.u_hasMap.value=1; } }
      if(bati.ceintureG) bati.ceintureG.visible=plein&&!!el.asteroides;
      if(satGroupe) satGroupe.visible=plein&&!!el.satellites; if(geos) geos.visible=plein&&!!el.satellites;
      if(aurore) aurore.visible=plein&&!!el.aurores;
      brillantes.visible=true;
      const dm=ciel&&ciel.visible; void dm;
    }
    abonnements.push(RayleBus.on('espace:elements',()=>{ appliquerElements(); assurer(); }));

    /* ───── image ───── */
    let derniereMarches=0, tPlus=0, nuagesDec=0; const tmpV=new THREE.Vector3();
    function image(now,dt){
      const c=UI.couleurs?UI.couleurs():[[255,255,255],[200,200,255],[230,230,255],[150,150,255]];
      UT.u_t.value+=dt; tPlus+=dt;
      majAstres(false); majLunes();
      const gm=A.gmst(Date.now()); terre.rotation.y=gm*RAD;
      let L=null; try{ L=UI.ambiance&&UI.ambiance.lisse(); }catch(e){}
      const nuages=L?L.nuages:.35, vent=L?L.vent:.1, jourAmb=L?L.jour:1;
      // Terre : couleurs du thème, nuages selon la météo réelle, vent
      U.u_atmo.value.setRGB(c[1][0]/255*.85+.10,c[1][1]/255*.85+.12,c[1][2]/255*.85+.18);
      UA.u_c1.value.setRGB(c[0][0]/255,c[0][1]/255,c[0][2]/255); UA.u_c3.value.setRGB(c[2][0]/255,c[2][1]/255,c[2][2]/255); UP.u_c.value.setRGB(c[2][0]/255,c[2][1]/255,c[2][2]/255);
      UA.u_temps.value+=dt;
      matNuages.uniforms.u_couv.value+=((.52+.78*clamp(nuages,0,1))-matNuages.uniforms.u_couv.value)*Math.min(1,dt*1.5);
      nuagesDec+=dt*(.0016+.011*vent); matNuages.uniforms.u_dec.value=nuagesDec%1;
      if(now-derniereMarches>2000){ derniereMarches=now; try{ X.marches(); }catch(e){} }
      // soleil : rotation lente des rayons, éclat légèrement vivant
      sRayons.material.rotation=tPlus*.015; sHalo.material.opacity=.5+.05*Math.sin(tPlus*.7);
      sRayons.visible=sHalo2.visible=q<2; sDisque.visible=q<2; sNoyau.visible=q>=2; sNoyau.scale.setScalar(R_SOLEIL*2.2); matSoleil.uniforms.u_det.value=q===0?1:0;
      // planètes
      if(q<2) for(const n in planetes){ const o=planetes[n]; o.m.rotation.y+=dt*o.spinRad; }   // vraies vitesses relatives (Jupiter ≈ 10 h, Mars 24,6 h, Vénus rétrograde…), jouées ×60
      if(ceinture&&bati.ceintureG.visible){
        bati.ceintureG.rotation.y+=dt*.0035;
        for(const r of rochers){ r.rotation.x+=dt*r.userData.w.x; r.rotation.y+=dt*r.userData.w.y; r.rotation.z+=dt*r.userData.w.z;
          r.getWorldPosition(tmpV); r.scale.setScalar(Math.max(.001,r.userData.e*lisse(2,6,tmpV.distanceTo(camera.position)))); }   // un rocher qui passe tout près de la caméra s'efface au lieu de la boucher
      }
      // satellites
      if(satGroupe&&satGroupe.visible){
        const e=ESP.iss.position(Date.now()), d=A.direction(e.ra,e.dec), P=[d[0]*e.r,d[1]*e.r,d[2]*e.r], pa=issPts.geometry.attributes.position;
        pa.setXYZ(0,P[0],P[1],P[2]); pa.needsUpdate=true; issGroupe.position.set(P[0],P[1],P[2]);
        const e2=ESP.iss.position(Date.now()+20000), d2=A.direction(e2.ra,e2.dec), av=new THREE.Vector3(d2[0]*e2.r-P[0],d2[1]*e2.r-P[1],d2[2]*e2.r-P[2]).normalize(), rad=new THREE.Vector3(d[0],d[1],d[2]);
        issGroupe.matrixAutoUpdate=true; issGroupe.up.copy(rad); issGroupe.lookAt(issGroupe.position.clone().add(av));
        if(tPlus-(majISS.t||0)>1.5){ majISS.t=tPlus; majISS(); }
        const u=((Date.now()/1000)*2*Math.PI/5740)%(2*Math.PI), tp=train.geometry.attributes.position;
        for(let i=0;i<16;i++){ const p=orb(53*RAD,(Date.now()/864e5*7.3+40)%360,u-i*.0075,1.086); tp.setXYZ(i,p[0],p[1],p[2]); } tp.needsUpdate=true;
        issPts.material.uniforms.u_px.value=pxr();
      }
      if(aurore&&aurore.visible){ aurore.material.uniforms.u_k.value=.55+.75*(1-jourAmb); aurore.material.uniforms.u_c1.value.setRGB(.15+.25*c[2][0]/255*0,1,.55); }
      // ciel : cuisson progressive puis fondu
      if(cielBake&&!cielBake.fait()){ cielBake.etape(q===0?7:6); if(cielBake.fait()){ cielTex.needsUpdate=true; ciel.visible=true; } }
      if(ciel&&ciel.visible){
        const u=ciel.material.uniforms; u.u_fade.value=Math.min(1,u.u_fade.value+dt*.45);
        const f=(a,k)=>[a[0]/255*k,a[1]/255*k,a[2]/255*k];
        u.u_c0.value.setRGB(...f(c[0],1)); u.u_c1.value.setRGB(...f(c[1],1)); u.u_c2.value.setRGB(...f(c[2],1));
        ciel.visible=q<2&&elements().voielactee; if(!ciel.visible) u.u_fade.value=0;
      }
      if(ciel&&cielBake.fait()&&q<2&&elements().voielactee&&!ciel.visible) ciel.visible=true;
      // comètes et étoiles filantes
      const el=elements(), aste=q<2&&el.asteroides;
      if(aste){
        prochaineComete-=dt; if(prochaineComete<=0&&!(comete&&comete.actif)){ prochaineComete=(q===0?100:180)+Math.random()*(q===0?160:240); if(tPlus>20) lancerComete(); }
        prochaineFilante-=dt; if(prochaineFilante<=0){ prochaineFilante=(q===0?7:16)+Math.random()*(q===0?14:24); if(tPlus>6) lancerFilante(); }
      }
      majComete(dt,aste); majFilantes(dt,aste);
      if(EXT) EXT.maj(dt,cible);
      majCamera(dt);
      if(solo) for(const c of scene.children) if(c!==camera&&c!==groupe) c.visible=false;      // outil des images fixes : la Terre seule
      // rendu
      rendu.clear();
      rendu.render(scene,camera);
      if(q===0&&el.flare){ majFlare(1); if(flare.groupe.visible){ rendu.clearDepth(); rendu.render(scene2,cam2); } }
    }
    // traînée de l'ISS (positions passées → futures, plus vive près de la station)
    function majISS(){
      const tr=ESP.iss.trace(Date.now(),50,6,50/63*1.0), pa=issTrace.geometry.attributes.position, ca=issTrace.geometry.attributes.color, n=Math.min(64,tr.length);
      for(let i=0;i<64;i++){ const p=tr[Math.min(i,n-1)], d=A.direction(p.ra,p.dec); pa.setXYZ(i,d[0]*p.r,d[1]*p.r,d[2]*p.r); const f=i/63, b=f<.9?Math.pow(f/.9,1.6)*.8:.35; ca.setXYZ(i,.9*b,.95*b,1*b); }
      pa.needsUpdate=true; ca.needsUpdate=true;
    }
    majISS.t=0;

    function taille(){
      W=Math.max(2,Math.round(innerWidth*1.06)); H=Math.max(2,Math.round(innerHeight*1.06));
      camera.aspect=W/H; camera.updateProjectionMatrix();
      cam2.left=-W/2; cam2.right=W/2; cam2.top=H/2; cam2.bottom=-H/2; cam2.updateProjectionMatrix();
      appliquerQualite(); recadrer();
    }
    function qualite(n){ q=Math.max(0,Math.min(2,n|0)); appliquerQualite(); appliquerElements(); appliquerCorps(); appliquerTerre(); assurer(); }
    function detruire(){
      try{ EXT&&EXT.liberer(); }catch(e){}
      abonnements.forEach(f=>{ try{ f(); }catch(e){} }); minuteries.forEach(id=>{ clearTimeout(id); clearInterval(id); });
      scene.traverse(x=>{ if(x.geometry) x.geometry.dispose(); if(x.material){ (Array.isArray(x.material)?x.material:[x.material]).forEach(m=>m.dispose&&m.dispose()); } });
      scene2.traverse(x=>{ if(x.material) x.material.dispose(); });
      [texHalo,texNoyau,texRayons].concat(textures).forEach(t=>{ try{ t.dispose(); }catch(e){} });
      [X.jour,X.nuit,X.nuages,plat,noir].forEach(t=>{ try{ t&&t.dispose(); }catch(e){} }); try{ CH.toutLiberer(); }catch(e){}
      rendu.autoClear=true; rendu.dispose(); try{ rendu.forceContextLoss(); }catch(e){}
    }
    const etat=()=>({cible,vol:!!vol,yaw:base.yaw,pitch:base.pitch,dist:cad.dist,q,planetes:Object.keys(planetes).length,asteroides:!!ceinture,satellites:!!satGroupe,aurores:!!aurore,ciel:!!(ciel&&ciel.visible),
      cadre:{ox:cad.ox,oy:cad.oy},lune:moonDir.toArray(),soleil:sunDir.toArray(),camera:camera.position.toArray(),
      comete:!!(comete&&comete.actif),filantes:filantes.filter(f=>f.actif).length,arrivee,textures:corpsListe.map(c=>c.nom+':'+(c.res||'-')).join(' '),terreRelief:terreRes.rel,terreOcean:terreRes.oc});

    // démarrage : positions du jour, vue de départ, puis le reste par étapes
    majAstres(true); recadrer(); choisirBase(true); initialise=true; appliquerQualite(); appliquerElements(); appliquerTerre();
    camera.position.copy(poseOrbite().pos); regard.set(0,0,0); posCam.copy(camera.position);
    minuteries.push(setTimeout(()=>{ assurer(); RayleBus.emit('espace:pret',{}); },30));
    { const h=ESP.accueil&&ESP.accueil(); if(h) minuteries.push(setTimeout(()=>vers(h),1400)); }          // la vue par défaut mémorisée (planète, ISS, lieu…) : pas de retour forcé sur la Terre au rechargement
    prochaineComete=45+Math.random()*30; prochaineFilante=8+Math.random()*8;
    return {taille,image,qualite,detruire,vers,retour,etat,THREE,planetes,test:{figer:(oui,dist)=>{ figee=!!oui; figDist=oui&&dist?dist:0; if(figDist){ cad.dist=cad.tdist=dist; cad.ox=cad.tox=cad.oy=cad.toy=0; offMix=1; } },dureeVisite:t=>{ DUREE_VISITE=t; },objets:()=>({couche,sphereTerre,matTerre2,matAtmo,aurore,terre,scene,arcsMesh,placesPts}),saut:(nom,t)=>{ vers(nom); vol=null; arrivee=t||0; },sansTerre:b=>{ groupe.visible=!b; },soloTerre:b=>{ solo=!!b; },fixerTemps:t=>{ UT.u_t.value=t; },comete:lancerComete,filante:lancerFilante,vue:(y,p)=>{ base.yaw=base.tyaw=y; base.pitch=base.tpitch=p; }}};
  };
})();
