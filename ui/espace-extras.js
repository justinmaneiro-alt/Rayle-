"use strict";
/* ═════════════ FOND ESPACE : ISS détaillée, rovers martiens, trou noir à lentille gravitationnelle, lieux de la Terre ═════════════
   RayleUI.espaceExtras.monter(X) est appelé par ui/fond-espace.js, qui lui confie sa scène. Rien ne se construit avant qu'on le demande.
   Cibles gérées (poseCible de fond-espace) : 'trounoir' · 'perseverance' / 'curiosity' (sur Mars) · 'lieu:<id>' (pays, capitale, monument) · 'geo:lat,lon,nom'.
   Modèles : formes procédurales par défaut ; si ui/assets/espace/modeles/manifest.json existe (ex. { "iss": "iss.glb", "perseverance": "perseverance.glb" }),
   le GLB correspondant les remplace (mis à l'échelle automatiquement). Les modèles 3D de la NASA (ISS, Curiosity, Perseverance) sont du domaine public.
   Éclairage : les corps du fond ont leurs propres shaders ; ces objets-ci sont éclairés par une lumière directionnelle placée vers le Soleil du jour. */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  const RAD=Math.PI/180;
  const clamp=(x,a,b)=>x<a?a:x>b?b:x;

  const VS_TN=`varying vec2 v_p; uniform float u_ext;
void main(){ v_p=position.xy*u_ext; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  /* Trou noir : coordonnées en rayons de l'ombre. Ombre noire, disque d'accrétion vu presque de profil (côté proche devant l'ombre),
     image secondaire du disque courbée au-dessus et au-dessous (lentille gravitationnelle), anneau de photons, étoiles du fond déviées. */
  const FS_TN=`precision highp float; varying vec2 v_p; uniform float u_t;
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),f.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),f.x),f.y); }
float fbm(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
vec3 chaud(float k){ return mix(vec3(0.95,0.24,0.05),vec3(1.0,0.93,0.76),pow(clamp(k,0.0,1.0),1.3)); }
void main(){
  vec2 p=v_p; float r=length(p);
  if(r<1.0 && p.y>=0.0){ gl_FragColor=vec4(0.0); return; }           // derrière l'ombre : rien
  vec3 col=vec3(0.0);
  float k=0.21;                                                       // inclinaison du plan du disque (sinus)
  vec2 e=vec2(p.x,p.y/k); float rd=length(e), ang=atan(e.y,e.x);
  float bande=smoothstep(1.5,1.85,rd)*(1.0-smoothstep(4.4,5.4,rd));
  float tour=ang*2.0+u_t*(3.2/pow(max(rd,1.0),1.5));
  float tur=0.5+0.95*fbm(vec2(tour,rd*3.1-u_t*0.12));
  float dop=1.0+0.8*clamp(p.x/max(rd,1.0),-1.0,1.0);                  // le côté qui s'approche est plus lumineux
  col+=chaud(1.8/rd)*pow(1.55/max(rd,1.0),2.3)*tur*dop*bande*1.9;
  if(r>=1.0){
    float arche=exp(-pow((r-1.5)/0.55,2.0))*smoothstep(0.0,0.7,abs(p.y)/r);   // face cachée du disque, courbée autour de l'ombre
    float t2=0.55+0.85*fbm(vec2(atan(p.y,p.x)*3.0+u_t*0.35,r*5.0));
    col+=chaud(0.8)*arche*t2*(1.0+0.45*sign(p.x)*smoothstep(0.0,1.0,abs(p.x)))*1.15;
    float ph=exp(-pow((r-1.04)/0.02,2.0));                              // anneau de photons
    col+=vec3(1.0,0.95,0.85)*ph*(1.2+0.5*dop);
    col+=vec3(0.45,0.55,1.0)*exp(-(r-1.0)*1.5)*0.07;                    // halo
    vec2 q=p*(1.0+1.5/(r*r)); vec2 g=floor(q*16.0); vec2 f=fract(q*16.0)-0.5;   // étoiles déviées par la gravité
    float etoile=step(0.965,h21(g))*smoothstep(0.24,0.0,length(f));
    col+=vec3(0.8,0.9,1.0)*etoile*smoothstep(1.0,1.5,r)*(1.0-smoothstep(3.6,5.6,r))*0.85;
  }
  col*=1.0-smoothstep(4.6,5.9,r);
  gl_FragColor=vec4(col,1.0);
}`;

  function monter(X){
    const {THREE,scene,camera,terre,ESP,A,vec}=X, V3=(x,y,z)=>new THREE.Vector3(x,y,z), Y=V3(0,1,0), L=()=>UI.espaceLieux||{LIEUX:[],ROVERS:{},TROU_NOIR:{}};
    const planetes=X.planetes, sunDir=X.sunDir, nearBase=camera.near;
    const racine=new THREE.Group(); racine.name='extras'; scene.add(racine);
    const lum=new THREE.DirectionalLight(0xfff2dc,2.6), amb=new THREE.AmbientLight(0x8a96c8,.55); racine.add(lum,amb,lum.target);
    const mats=[], geos=[];
    const mat=(couleur,o)=>{ const m=new THREE.MeshStandardMaterial(Object.assign({color:couleur,roughness:.55,metalness:.35},o||{})); mats.push(m); return m; };
    const mesh=(g,m)=>{ geos.push(g); return new THREE.Mesh(g,m); };
    const dir=(lat,lon,r)=>{ const a=lat*RAD,b=lon*RAD; r=r||1; return V3(r*Math.cos(a)*Math.cos(b),r*Math.sin(a),-r*Math.cos(a)*Math.sin(b)); };
    let temps=0, arrivee=0, cibleCourante=null;

    /* ───── modèles GLB facultatifs ───── */
    let manifeste;
    async function lireManifeste(){
      if(manifeste!==undefined) return manifeste;
      try{ const r=await fetch(new URL('ui/assets/espace/modeles/manifest.json',document.baseURI),{cache:'no-cache'}); manifeste=r.ok?await r.json():null; }catch(e){ manifeste=null; }
      return manifeste;
    }
    async function essayerGLB(nom,taille,groupe,viderAvant){
      const m=await lireManifeste(); if(!m||!m[nom]) return false;
      try{
        const { GLTFLoader }=await import('three/addons/loaders/GLTFLoader.js');
        const g=await new GLTFLoader().loadAsync(new URL('ui/assets/espace/modeles/'+m[nom],document.baseURI).href);
        const o=g.scene, b=new THREE.Box3().setFromObject(o), c=b.getCenter(V3(0,0,0)), t=b.getSize(V3(0,0,0)), k=taille/Math.max(t.x,t.y,t.z,1e-6);
        const w=new THREE.Group(); o.position.sub(c); w.add(o); w.scale.setScalar(k);
        if(viderAvant) while(groupe.children.length) groupe.remove(groupe.children[0]);
        groupe.add(w); return true;
      }catch(e){ console.warn('[espace] modèle '+nom+' : '+(e&&e.message||e)); return false; }
    }

    /* ───── Station spatiale internationale ───── */
    // unités : mètres ; l'ISS fait ≈ 109 m de large (poutre le long de x) et avance vers +z
    function construireISS(){
      const g=new THREE.Group();
      const blanc=mat(0xe9e9e4,{roughness:.5,metalness:.3}), gris=mat(0xa9afb8,{metalness:.6,roughness:.4}), or=mat(0xc89a3c,{metalness:.7,roughness:.35}), noir=mat(0x2a2d33,{roughness:.7}),
            rad=mat(0xf4f4f2,{roughness:.6,metalness:.1,side:THREE.DoubleSide});
      // panneau solaire : toile bleue à grille (texture dessinée)
      const cv=document.createElement('canvas'); cv.width=64; cv.height=128; const cx=cv.getContext('2d'); cx.fillStyle='#16306e'; cx.fillRect(0,0,64,128); cx.strokeStyle='#4f79c9'; cx.lineWidth=1;
      for(let i=0;i<=8;i++){ cx.beginPath(); cx.moveTo(i*8,0); cx.lineTo(i*8,128); cx.stroke(); } for(let j=0;j<=32;j++){ cx.beginPath(); cx.moveTo(0,j*4); cx.lineTo(64,j*4); cx.stroke(); }
      const tex=new THREE.CanvasTexture(cv); tex.anisotropy=4; const solaire=mat(0xffffff,{map:tex,metalness:.5,roughness:.35,emissive:0x0a1633,emissiveIntensity:.6,side:THREE.DoubleSide}); mats.push({dispose(){ tex.dispose(); }});
      const box=(w,h,d,m,x,y,z)=>{ const o=mesh(new THREE.BoxGeometry(w,h,d),m); o.position.set(x,y,z); g.add(o); return o; };
      const cyl=(r,l,m,x,y,z,axe)=>{ const o=mesh(new THREE.CylinderGeometry(r,r,l,16),m); o.position.set(x,y,z); if(axe==='x') o.rotation.z=Math.PI/2; else if(axe==='z') o.rotation.x=Math.PI/2; g.add(o); return o; };
      box(94,1.6,1.6,gris,0,0,0);                                   // poutre intégrée
      for(let i=-4;i<=4;i++) box(.5,2.2,2.2,blanc,i*10.5,0,0);      // nervures
      // 8 ailes de panneaux solaires : 2 paires à chaque extrémité de la poutre, 35 m de long le long de ±z, 12 m de large le long de x
      for(const sx of [-1,1]) for(const xp of [44,30]){
        for(const sz of [-1,1]){ const w=mesh(new THREE.PlaneGeometry(11.5,34),solaire); w.rotation.x=-Math.PI/2; w.position.set(sx*xp,0,sz*18.5); g.add(w); }
        cyl(.35,3,or,sx*xp,0,0,'z');
      }
      // radiateurs thermiques
      for(const sx of [-1,1]) for(const z of [-1,1]){ const r=mesh(new THREE.PlaneGeometry(11,3.6),rad); r.rotation.x=-Math.PI/2; r.position.set(sx*20,0,z*5.4); g.add(r); }
      // fuselage pressurisé : axe z
      cyl(2.1,12.6,or,0,-2.4,-13,'z');                              // Zarya
      cyl(2.3,5.5,blanc,0,-2.4,-5,'z');                             // Unity
      cyl(2.2,8.5,blanc,0,-2.4,3.4,'z');                            // Destiny
      cyl(2.3,7,blanc,0,-2.4,10.5,'z');                             // Harmony
      cyl(2.1,13,blanc,0,-2.4,-26,'z');                             // Zvezda
      cyl(2.2,7,blanc,-7.5,-2.4,10.5,'x'); cyl(2.2,11,blanc,7.5,-2.4,10.5,'x');   // Columbus, Kibo
      box(5.5,2.5,4,gris,10.5,-2.4,10.5);                           // plateforme exposée de Kibo
      const dome=mesh(new THREE.SphereGeometry(1.5,12,8,0,Math.PI*2,0,Math.PI/2),blanc); dome.position.set(0,-4.8,5); dome.rotation.x=Math.PI; g.add(dome);   // Cupola
      cyl(1.1,7,noir,0,-2.4,-33,'z'); cyl(1.2,6,blanc,3.4,-2.4,-5,'x'); cyl(1.2,6,blanc,-3.4,-2.4,-5,'x');       // Soyouz / Progress, nœud latéral
      // lien entre poutre et fuselage
      box(2.6,2.6,2.6,blanc,0,-1.2,-1);
      g.userData.taille=109;
      return g;
    }
    async function ameliorerISS(issGroupe){
      if(!issGroupe||issGroupe.userData.detaille) return; issGroupe.userData.detaille=true;
      const ancien=issGroupe.children.slice(); ancien.forEach(c=>issGroupe.remove(c));
      const taille=.08, modele=construireISS(); modele.scale.setScalar(taille/109);
      issGroupe.add(modele); issGroupe.scale.setScalar(1.15);
      essayerGLB('iss',taille,modele.parent,false).then(ok=>{ if(ok) issGroupe.remove(modele); });
    }

    /* ───── rovers sur Mars ───── */
    const rovers={}; let balise=null, roversAttaches=false;
    function construireRover(type){
      const g=new THREE.Group(), alu=mat(0xcfcfca,{roughness:.5,metalness:.55}), roue=mat(0x3a3a3c,{roughness:.8,metalness:.3}), or=mat(0xc79a3e,{metalness:.7,roughness:.35}), noir=mat(0x202225,{roughness:.6}), blanc=mat(0xf2f2ee,{roughness:.55,metalness:.1});
      const add=(o,x,y,z)=>{ o.position.set(x,y,z); g.add(o); return o; };
      add(mesh(new THREE.BoxGeometry(.62,.2,.95),alu),0,.46,0);                          // châssis
      add(mesh(new THREE.BoxGeometry(.7,.05,1.05),or),0,.58,0);                         // pont supérieur
      for(const sx of [-1,1]){ for(const z of [-.4,0,.4]){ const w=mesh(new THREE.CylinderGeometry(.14,.14,.12,16),roue); w.rotation.z=Math.PI/2; add(w,sx*.42,.14,z); }
        add(mesh(new THREE.BoxGeometry(.04,.04,.9),alu),sx*.35,.32,0); add(mesh(new THREE.BoxGeometry(.04,.3,.04),alu),sx*.35,.3,.4); }
      add(mesh(new THREE.CylinderGeometry(.025,.025,.55,8),alu),-.22,.9,.3);             // mât
      add(mesh(new THREE.BoxGeometry(.2,.11,.1),type==='curiosity'?alu:blanc),-.22,1.2,.3);   // tête (caméras)
      add(mesh(new THREE.BoxGeometry(.05,.05,.5),alu),.2,.66,.62);                       // bras robotique
      add(mesh(new THREE.BoxGeometry(.12,.12,.12),noir),.2,.62,.92);
      const rtg=mesh(new THREE.CylinderGeometry(.07,.07,.34,10),blanc); rtg.rotation.x=Math.PI/2; rtg.rotation.z=.25; add(rtg,0,.66,-.62);    // générateur nucléaire
      const hga=mesh(new THREE.CylinderGeometry(.09,.09,.015,16),alu); add(hga,.22,.7,-.28); hga.rotation.x=.5;                             // antenne
      if(type==='perseverance'){ add(mesh(new THREE.CylinderGeometry(.09,.09,.28,12),blanc),0,.4,-.05).rotation.z=Math.PI/2; }          // « tour » d'échantillons
      g.userData.taille=1.7; return g;
    }
    function texBalise(){
      const cv=document.createElement('canvas'); cv.width=cv.height=128; const c=cv.getContext('2d'), gr=c.createRadialGradient(64,64,0,64,64,64);
      gr.addColorStop(0,'rgba(255,255,255,.95)'); gr.addColorStop(.18,'rgba(120,230,255,.7)'); gr.addColorStop(.5,'rgba(60,170,255,.2)'); gr.addColorStop(1,'rgba(60,170,255,0)'); c.fillStyle=gr; c.fillRect(0,0,128,128);
      const t=new THREE.CanvasTexture(cv); mats.push({dispose(){ t.dispose(); }}); return t;
    }
    function attacherRovers(){
      const o=planetes()&&planetes().mars; if(roversAttaches||!o||!o.m) return;
      roversAttaches=true;
      const echelle=o.R*.05/1.7;
      for(const id of Object.keys(L().ROVERS)){
        const R=L().ROVERS[id], g=new THREE.Group(), modele=construireRover(id); g.add(modele);
        g.position.copy(dir(R.lat,R.lon,o.R*1.0005)); g.quaternion.setFromUnitVectors(Y,g.position.clone().normalize()); g.scale.setScalar(echelle);
        o.m.add(g); rovers[id]=g; g.visible=false;
        essayerGLB(id,1.7,g,true);
      }
      balise=new THREE.Sprite(new THREE.SpriteMaterial({map:texBalise(),transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,opacity:.9}));
      balise.renderOrder=20; balise.visible=false; scene.add(balise);
    }

    /* ───── trou noir ───── */
    let tn=null;
    function construireTrouNoir(){
      if(tn) return tn;
      const T=L().TROU_NOIR||{}, Rs=T.rayonOmbre||2.6, g=new THREE.Group(), ext=6;
      const ombre=mesh(new THREE.CircleGeometry(1,64),new THREE.MeshBasicMaterial({color:0x000000,depthWrite:false})); ombre.scale.setScalar(Rs*1.0); ombre.renderOrder=1; g.add(ombre);
      const um={u_t:{value:0},u_ext:{value:ext}};
      const m=new THREE.ShaderMaterial({uniforms:um,vertexShader:VS_TN,fragmentShader:FS_TN,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}); mats.push(m);
      const q=mesh(new THREE.PlaneGeometry(2,2),m); q.scale.setScalar(Rs*ext); q.renderOrder=2; g.add(q);
      const c=vec(A.direction(T.ra||266.417,T.dec||-29.008),T.dist||110); g.position.copy(c);
      g.visible=false; racine.add(g); tn={g,um,Rs,centre:c.clone()}; return tn;
    }

    /* ───── lieux sur la Terre ───── */
    let marq=null;
    function construireMarqueur(){
      if(marq) return marq;
      const g=new THREE.Group(), rose=new THREE.MeshBasicMaterial({color:0xff3d8b,transparent:true,opacity:.95}), cyan=new THREE.MeshBasicMaterial({color:0x7be7ff,transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false});
      mats.push(rose,cyan);
      const tete=mesh(new THREE.SphereGeometry(.011,12,8),rose); tete.position.y=.058; g.add(tete);
      const pointe=mesh(new THREE.ConeGeometry(.0085,.05,10),rose); pointe.position.y=.027; pointe.rotation.x=Math.PI; g.add(pointe);
      const anneau=mesh(new THREE.RingGeometry(.85,1,48),cyan); anneau.rotation.x=-Math.PI/2; anneau.position.y=.002; g.add(anneau);
      g.visible=false; terre.add(g); marq={g,anneau,rose,cyan}; return marq;
    }
    function donneesLieu(cible){
      if(!cible) return null;
      if(cible.startsWith('lieu:')){ const l=ESP.lieuDe(cible.slice(5)); return l?{lat:l.lat,lon:l.lon,zoom:l.zoom||1.5,type:l.type}:null; }
      const g=ESP.geoDe(cible); return g?{lat:g.lat,lon:g.lon,zoom:g.zoom||1.5,type:'point'}:null;
    }

    /* ───── interface avec fond-espace ───── */
    const reconnait=nom=>!!nom&&(nom==='trounoir'||!!(L().ROVERS||{})[nom]||nom.startsWith('lieu:')||nom.startsWith('geo:'));
    function preparer(nom){
      if(nom==='trounoir') construireTrouNoir();
      else if(L().ROVERS[nom]){ try{ ESP.regler('planetes',true); }catch(e){} attacherRovers(); }
      else if(donneesLieu(nom)){ construireMarqueur(); }
    }
    /** pose de la caméra pour une cible gérée ; null si elle n'est pas prête (fond-espace prend alors la vue d'orbite) */
    function pose(nom,arr){
      arrivee=arr||0;
      if(nom==='trounoir'){
        const b=construireTrouNoir(), u=b.centre.clone().normalize(), perp=new THREE.Vector3().crossVectors(u,Y).normalize(), d=b.Rs*11.5, dr=.55*Math.sin(arrivee*.17);
        const pos=b.centre.clone().addScaledVector(u,-d*Math.cos(dr)).addScaledVector(perp,d*Math.sin(dr)).addScaledVector(Y,b.Rs*1.1);
        camera.near=nearBase; return {pos,look:b.centre.clone()};
      }
      const R=L().ROVERS[nom];
      if(R){
        const o=planetes()&&planetes().mars, r=rovers[nom]; if(!o||!r) return null;
        o.m.updateWorldMatrix(true,false);
        const P=r.getWorldPosition(V3(0,0,0)), n=P.clone().sub(o.g.position).normalize(); let t=new THREE.Vector3().crossVectors(n,Y); if(t.lengthSq()<1e-4) t.set(1,0,0); t.normalize();
        const b=new THREE.Vector3().crossVectors(n,t), dr=.9*Math.sin(arrivee*.2);
        const pos=P.clone().addScaledVector(n,o.R*.07).addScaledVector(t,o.R*.15*Math.cos(dr)).addScaledVector(b,o.R*.15*Math.sin(dr));
        camera.near=Math.max(o.R*.002,.0005); return {pos,look:P.clone().addScaledVector(n,o.R*.012)};
      }
      const d=donneesLieu(nom);
      if(d){
        const m=construireMarqueur(); terre.updateWorldMatrix(true,false);
        const P=terre.localToWorld(dir(d.lat,d.lon,1)), n=P.clone().normalize(); let e=new THREE.Vector3().crossVectors(Y,n); if(e.lengthSq()<1e-4) e.set(1,0,0); e.normalize();
        const nord=new THREE.Vector3().crossVectors(n,e), dist=d.zoom, glisse=.06*Math.sin(arrivee*.15);
        const pos=n.clone().multiplyScalar(dist).addScaledVector(nord,-(dist-1)*.3).addScaledVector(e,(dist-1)*.3*glisse*10);
        camera.near=nearBase; return {pos,look:P.clone().multiplyScalar(.97)};
      }
      return null;
    }
    /** à appeler à chaque image */
    function maj(dt,cible){
      temps+=dt; cibleCourante=cible;
      lum.position.copy(sunDir()).multiplyScalar(100);
      if(!reconnait(cible)&&camera.near!==nearBase&&!/^(mars)$/.test(cible||'')){ camera.near=nearBase; }
      if(tn){ tn.g.visible=cible==='trounoir'; if(tn.g.visible){ tn.um.u_t.value=temps; tn.g.quaternion.copy(camera.quaternion); } }
      if(!roversAttaches&&(cible==='mars'||estRover(cible))) attacherRovers();
      const surMars=cible==='mars'||estRover(cible);
      for(const id in rovers) rovers[id].visible=surMars;
      if(balise){
        const o=planetes()&&planetes().mars; balise.visible=!!(surMars&&o);
        if(balise.visible){
          const cibleR=estRover(cible)?cible:null, ids=cibleR?[cibleR]:Object.keys(rovers);
          const r=rovers[ids[0]]; if(r){ r.getWorldPosition(balise.position); const p=1+.18*Math.sin(temps*3); balise.scale.setScalar(o.R*(cibleR?.28:.45)*p); }
        }
      }
      if(marq){
        const d=donneesLieu(cible); marq.g.visible=!!d;
        if(d){ const p=dir(d.lat,d.lon,1.0); marq.g.position.copy(p); marq.g.quaternion.setFromUnitVectors(Y,p.clone().normalize());
          const k=d.type==='pays'?3.2:d.type==='capitale'?1.7:1, pulse=(temps%2)/2; marq.g.scale.setScalar(k); marq.anneau.scale.setScalar(.035+.07*pulse); marq.cyan.opacity=.9*(1-pulse); }
      }
    }
    const estRover=c=>!!(L().ROVERS||{})[c];
    function liberer(){
      scene.remove(racine); geos.forEach(g=>{ try{ g.dispose(); }catch(e){} }); mats.forEach(m=>{ try{ m.dispose(); }catch(e){} });
      if(balise){ scene.remove(balise); try{ balise.material.dispose(); }catch(e){} } if(marq) terre.remove(marq.g); camera.near=nearBase;
    }
    return {reconnait,preparer,pose,maj,ameliorerISS,liberer,construireISS,construireRover};
  }
  UI.espaceExtras={monter,FS_TN};
})();
