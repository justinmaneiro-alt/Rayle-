"use strict";
/* ═════════════ FOND « GLOBE » RÉALISTE (three.js, chargé à la demande) ═════════════
   - Terre NASA : texture jour (Blue Marble) et nuit (Black Marble), mélangées par un shader selon la VRAIE position du soleil
     (point subsolaire calculé à l'heure actuelle) : la limite jour/nuit est géographiquement juste, avec un crépuscule doux.
   - Nuages semi-transparents (éclairés par le même soleil) qui tournent un peu plus vite que la Terre ; atmosphère en fresnel.
   - Arcs lumineux entre les grandes places boursières : plus vifs quand l'une des deux places est ouverte (heures locales, jours ouvrés).
   - La Terre garde ses vraies couleurs ; seuls l'atmosphère, les arcs et les villes prennent les couleurs du thème.
   Qualité q : 0 complète · 1 allégée · 2 minimale (sans nuages, moins de pixels). Textures 4096 px seulement en niveau Max.
   RayleUI.fondsReels.globe(canvas, {q, hd}) → {taille(), image(now, dt), qualite(q), detruire()}
   Mode interactif (page Monde du terminal) : {interactif:true} → la Terre est centrée dans son cadre et pilotée de l'extérieur :
     vue(lat, lon, dist) · pick(x, y) → {lat, lon} · projeter(lat, lon) → {x, y, face} · ajouter(objet3D) · places(bool)
     calque(canvas|null) : carte équirectangulaire posée sur la Terre (contours, indicateur) · THREE, vec(lat, lon, r) */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  UI.fondsReels=UI.fondsReels||{};
  const BASE=(()=>{ try{ return new URL('ui/assets/',document.baseURI).href; }catch(e){ return 'ui/assets/'; } })();

  // places boursières : [nom, latitude, longitude, fuseau, ouverture, clôture]
  const PLACES={
    ny:['New York',40.71,-74.01,'America/New_York',[9,30],[16,0]],
    lon:['Londres',51.51,-0.13,'Europe/London',[8,0],[16,30]],
    par:['Paris',48.86,2.35,'Europe/Paris',[9,0],[17,30]],
    fra:['Francfort',50.11,8.68,'Europe/Berlin',[9,0],[17,30]],
    tok:['Tokyo',35.68,139.69,'Asia/Tokyo',[9,0],[15,0]],
    hk:['Hong Kong',22.32,114.17,'Asia/Hong_Kong',[9,30],[16,0]],
    syd:['Sydney',-33.87,151.21,'Australia/Sydney',[10,0],[16,0]]
  };
  const ARCS=[['ny','lon'],['lon','fra'],['par','lon'],['par','ny'],['fra','hk'],['hk','tok'],['tok','ny'],['hk','syd'],['syd','tok'],['lon','tok']];
  const fmt={};
  function ouverte(code,ts){
    const p=PLACES[code], tz=p[3];
    const f=fmt[tz]||(fmt[tz]=new Intl.DateTimeFormat('en-GB',{timeZone:tz,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
    const o={}; for(const x of f.formatToParts(new Date(ts))) o[x.type]=x.value;
    if(o.weekday==='Sat'||o.weekday==='Sun') return 0;
    const m=(+o.hour%24)*60+ +o.minute;
    return m>=p[4][0]*60+p[4][1] && m<p[5][0]*60+p[5][1] ? 1 : 0;
  }
  // point subsolaire (approximation de l'almanach, précise à quelques dixièmes de degré)
  function soleil(ts){
    const d=(ts-946728000000)/864e5, rad=Math.PI/180;
    const g=(357.529+.98560028*d)*rad, q=280.459+.98564736*d;
    const L=(q+1.915*Math.sin(g)+.020*Math.sin(2*g))*rad, e=(23.439-.00000036*d)*rad;
    const ra=Math.atan2(Math.cos(e)*Math.sin(L),Math.cos(L))/rad, dec=Math.asin(Math.sin(e)*Math.sin(L))/rad;
    let eqt=((q-ra)%360+540)%360-180;                      // équation du temps, en degrés
    const heuresUTC=(ts%864e5)/36e5;
    let lon=-15*(heuresUTC-12)-eqt; lon=((lon+540)%360)-180;
    return {lat:dec,lon};
  }
  // direction (repère de la Terre, comme SphereGeometry de three.js : Greenwich vers +x)
  const dir=(lat,lon,r)=>{ const a=lat*Math.PI/180, b=lon*Math.PI/180; r=r||1; return [r*Math.cos(a)*Math.cos(b),r*Math.sin(a),-r*Math.cos(a)*Math.sin(b)]; };

  const VS_TERRE=`
varying vec2 v_uv; varying vec3 v_n; varying vec3 v_vue;
void main(){
  v_uv=uv;
  vec4 wp=modelMatrix*vec4(position,1.0);
  v_n=normalize(mat3(modelMatrix)*normal);
  v_vue=normalize(cameraPosition-wp.xyz);
  gl_Position=projectionMatrix*viewMatrix*wp;
}`;
  const FS_TERRE=`
uniform sampler2D u_jour,u_nuit; uniform vec3 u_soleil,u_atmo; uniform float u_nuitForce;
varying vec2 v_uv; varying vec3 v_n; varying vec3 v_vue;
void main(){
  vec3 n=normalize(v_n);
  float s=dot(n,u_soleil);
  float jourK=smoothstep(-0.10,0.22,s);                       // crépuscule doux
  vec3 jour=texture2D(u_jour,v_uv).rgb*(0.30+0.85*clamp(s*1.2+0.15,0.0,1.0));
  vec3 nuit=texture2D(u_nuit,v_uv).rgb;
  nuit=nuit*nuit*u_nuitForce+nuit*0.25;                      // les villes ressortent, le reste reste sombre
  vec3 c=mix(nuit,jour,jourK);
  // lueur orangée sur la ligne du crépuscule
  c+=vec3(1.0,0.45,0.15)*0.10*exp(-pow(s*7.0,2.0));
  // reflet du soleil sur les océans (les zones sombres et bleues du jour)
  vec3 h=normalize(u_soleil+v_vue);
  vec3 tj=texture2D(u_jour,v_uv).rgb;
  float ocean=smoothstep(0.12,0.0,tj.r+tj.g*0.3-tj.b*0.4);
  c+=vec3(0.9,0.85,0.75)*pow(max(dot(n,h),0.0),60.0)*ocean*jourK*0.5;
  // bord de l'atmosphère (couleur du thème)
  float f=pow(1.0-max(dot(n,v_vue),0.0),3.0);
  c+=u_atmo*f*(0.35+0.65*jourK);
  gl_FragColor=vec4(c,1.0);
}`;
  const FS_NUAGES=`
uniform sampler2D u_nuages; uniform vec3 u_soleil; uniform float u_dec;
varying vec2 v_uv; varying vec3 v_n; varying vec3 v_vue;
void main(){
  float a=texture2D(u_nuages,vec2(fract(v_uv.x+u_dec),v_uv.y)).r;
  a=smoothstep(0.15,0.85,a);
  float s=dot(normalize(v_n),u_soleil);
  float l=smoothstep(-0.12,0.25,s);
  gl_FragColor=vec4(vec3(0.95)*(0.06+0.94*l),a*(0.25+0.6*l));
}`;
  const FS_ATMO=`
uniform vec3 u_atmo; uniform vec3 u_soleil;
varying vec2 v_uv; varying vec3 v_n; varying vec3 v_vue;
void main(){
  float f=pow(max(0.0,0.72+dot(normalize(v_n),v_vue)),4.0);     // face arrière : halo autour du limbe
  float jour=0.4+0.6*smoothstep(-0.3,0.4,dot(normalize(v_n),u_soleil));
  gl_FragColor=vec4(u_atmo*f*jour*1.4,f*jour);
}`;
  const VS_ARC=`
attribute float a_t; attribute float a_arc;
uniform float u_temps; uniform float u_ouv[10];
varying float v_t; varying float v_arc; varying float v_ouv;
void main(){
  v_t=a_t; v_arc=a_arc;
  int i=int(a_arc+0.5); float o=0.0;
  for(int k=0;k<10;k++){ if(k==i) o=u_ouv[k]; }
  v_ouv=o;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;
  const FS_ARC=`
uniform float u_temps; uniform vec3 u_c1,u_c3;
varying float v_t; varying float v_arc; varying float v_ouv;
void main(){
  float p=fract(u_temps*(0.12+0.05*fract(v_arc*0.37))+v_arc*0.31);
  float d=v_t-p; d=d-floor(d+0.5);
  float impulsion=exp(-d*d*900.0);
  float base=0.12+0.38*v_ouv;
  float a=base+impulsion*(0.55+0.45*v_ouv);
  a*=smoothstep(0.0,0.04,v_t)*smoothstep(1.0,0.96,v_t);
  vec3 c=mix(u_c1,mix(u_c3,vec3(1.0),0.4),impulsion);
  gl_FragColor=vec4(c*a,a);
}`;
  const VS_PTS=`
attribute float a_taille; attribute float a_ouv;
uniform float u_px; varying float v_ouv;
void main(){
  v_ouv=a_ouv;
  vec4 mv=modelViewMatrix*vec4(position,1.0);
  gl_PointSize=u_px*a_taille*(3.2/-mv.z);
  gl_Position=projectionMatrix*mv;
}`;
  const FS_PTS=`
uniform vec3 u_c; uniform float u_temps; varying float v_ouv;
void main(){
  float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d); a*=a;
  float k=0.35+0.65*v_ouv*(0.75+0.25*sin(u_temps*3.0));
  gl_FragColor=vec4(mix(u_c,vec3(1.0),0.5*a)*a*k,a*k);
}`;
  const FS_ETOILES=`
varying float v_ouv;
void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.1,d)*v_ouv; gl_FragColor=vec4(vec3(a),a); }`;

  UI.fondsReels.globe=async function(canvas,o){
    o=o||{};
    const THREE=await UI.three();
    const rendu=new THREE.WebGLRenderer({canvas,alpha:true,antialias:false,powerPreference:'low-power'});
    rendu.setClearColor(0x000000,0);
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(35,1,.1,200); camera.position.set(0,0,3.4);
    const chargeur=new THREE.TextureLoader();
    const tex=nom=>new Promise((ok,ko)=>chargeur.load(BASE+nom,t=>{ t.anisotropy=2; ok(t); },undefined,()=>ko(new Error('texture '+nom))));
    const taillePx=o.hd?4096:2048;
    const [jour,nuit,nuages]=await Promise.all([tex('terre-jour-'+taillePx+'.jpg'),tex('terre-nuit-'+taillePx+'.jpg'),tex('nuages-2048.jpg')]);

    const inter=!!o.interactif;
    const groupe=new THREE.Group(); if(!inter) groupe.rotation.z=23.44*Math.PI/180*.6; scene.add(groupe);   // axe légèrement incliné (fond)
    const terre=new THREE.Group(); groupe.add(terre);
    const U={u_soleil:{value:new THREE.Vector3(1,0,0)},u_atmo:{value:new THREE.Color(.4,.6,1)},u_nuitForce:{value:2.2}};
    const segs=[128,96,64];
    let q=Math.max(0,Math.min(2,o.q|0));
    const matTerre=new THREE.ShaderMaterial({uniforms:Object.assign({u_jour:{value:jour},u_nuit:{value:nuit}},U),vertexShader:VS_TERRE,fragmentShader:FS_TERRE});
    const sphere=new THREE.Mesh(new THREE.SphereGeometry(1,segs[q],segs[q]/2),matTerre); terre.add(sphere);
    const matNuages=new THREE.ShaderMaterial({uniforms:Object.assign({u_nuages:{value:nuages},u_dec:{value:0}},U),vertexShader:VS_TERRE,fragmentShader:FS_NUAGES,transparent:true,depthWrite:false});
    const couche=new THREE.Mesh(new THREE.SphereGeometry(1.008,96,48),matNuages); terre.add(couche);
    const matAtmo=new THREE.ShaderMaterial({uniforms:U,vertexShader:VS_TERRE,fragmentShader:FS_ATMO,side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
    groupe.add(new THREE.Mesh(new THREE.SphereGeometry(1.09,64,32),matAtmo));

    // arcs : rubans fins fusionnés en une seule géométrie (un seul appel de dessin)
    const codesArc=ARCS, N=72, R=.0045, pos=[], at=[], aa=[], idx=[];
    codesArc.forEach(([a,b],k)=>{
      const A=new THREE.Vector3(...dir(PLACES[a][1],PLACES[a][2])), B=new THREE.Vector3(...dir(PLACES[b][1],PLACES[b][2]));
      const ang=A.angleTo(B), haut=.06+.32*ang/Math.PI, pts=[];
      for(let i=0;i<=N;i++){
        const t=i/N, s=Math.sin(ang);
        const p=A.clone().multiplyScalar(Math.sin((1-t)*ang)/s).add(B.clone().multiplyScalar(Math.sin(t*ang)/s)).normalize();
        pts.push(p.multiplyScalar(1.01+haut*Math.sin(Math.PI*t)));
      }
      const base=pos.length/3;
      for(let i=0;i<=N;i++){
        const p=pts[i], tg=pts[Math.min(N,i+1)].clone().sub(pts[Math.max(0,i-1)]).normalize();
        const n1=new THREE.Vector3().crossVectors(tg,p).normalize(), n2=new THREE.Vector3().crossVectors(tg,n1).normalize();
        for(const [u,v] of [[1,0],[0,1],[-1,0],[0,-1]]){ const q2=p.clone().addScaledVector(n1,u*R).addScaledVector(n2,v*R); pos.push(q2.x,q2.y,q2.z); at.push(i/N); aa.push(k); }
      }
      for(let i=0;i<N;i++) for(let j=0;j<4;j++){
        const a1=base+i*4+j, a2=base+i*4+(j+1)%4, b1=a1+4, b2=a2+4;
        idx.push(a1,b1,a2, a2,b1,b2);
      }
    });
    const gArc=new THREE.BufferGeometry();
    gArc.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    gArc.setAttribute('a_t',new THREE.Float32BufferAttribute(at,1));
    gArc.setAttribute('a_arc',new THREE.Float32BufferAttribute(aa,1));
    gArc.setIndex(idx);
    const UA={u_temps:{value:0},u_ouv:{value:new Array(10).fill(0)},u_c1:{value:new THREE.Color()},u_c3:{value:new THREE.Color()}};
    const matArc=new THREE.ShaderMaterial({uniforms:UA,vertexShader:VS_ARC,fragmentShader:FS_ARC,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
    const arcsMesh=new THREE.Mesh(gArc,matArc); terre.add(arcsMesh);
    // places boursières (points lumineux)
    const codes=Object.keys(PLACES), gP=new THREE.BufferGeometry(), pp=[], tl=[], ov=new Float32Array(codes.length);
    codes.forEach(c=>{ pp.push(...dir(PLACES[c][1],PLACES[c][2],1.012)); tl.push(1); });
    gP.setAttribute('position',new THREE.Float32BufferAttribute(pp,3));
    gP.setAttribute('a_taille',new THREE.Float32BufferAttribute(tl,1));
    gP.setAttribute('a_ouv',new THREE.BufferAttribute(ov,1));
    const UP={u_px:{value:22},u_c:{value:new THREE.Color()},u_temps:UA.u_temps};
    const placesPts=new THREE.Points(gP,new THREE.ShaderMaterial({uniforms:UP,vertexShader:VS_PTS,fragmentShader:FS_PTS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})); terre.add(placesPts);
    // étoiles
    const nbE=1400, ge=new THREE.BufferGeometry(), pe=[], te=[], oe=[];
    let g0=11; const rnd=()=>{ g0=(g0*1664525+1013904223)>>>0; return g0/4294967296; };
    for(let i=0;i<nbE;i++){ const z=rnd()*2-1, th=rnd()*6.283, s=Math.sqrt(1-z*z); pe.push(60*s*Math.cos(th),60*z,60*s*Math.sin(th)); te.push(.5+rnd()*1.3); oe.push(.25+.75*Math.pow(rnd(),3)); }
    ge.setAttribute('position',new THREE.Float32BufferAttribute(pe,3));
    ge.setAttribute('a_taille',new THREE.Float32BufferAttribute(te,1));
    ge.setAttribute('a_ouv',new THREE.Float32BufferAttribute(oe,1));
    const etoiles=new THREE.Points(ge,new THREE.ShaderMaterial({uniforms:{u_px:{value:1.6}},vertexShader:VS_PTS.replace('(3.2/-mv.z)','1.0'),fragmentShader:FS_ETOILES,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
    scene.add(etoiles);

    let W=1, H=1, rot=-.6, nuagesDec=0, dernierCalcul=0;
    const VUE={lat:20,lon:10,dist:3.4};                       // mode interactif : où regarde la caméra
    let calqueMesh=null, calqueTex=null;
    const lanceur=new THREE.Raycaster(), souris=new THREE.Vector2(), qTmp=new THREE.Quaternion();
    const v3=new THREE.Vector3();
    function appliquerQualite(){
      const pr=[Math.min(window.devicePixelRatio||1,1.5),.9,.65][q];
      rendu.setPixelRatio(pr);
      couche.visible=q<2;
      etoiles.geometry.setDrawRange(0,[nbE,1000,500][q]);
      if(W>1) rendu.setSize(W,H,false);
    }
    function soleilEtMarches(now){
      const s=soleil(Date.now());
      U.u_soleil.value.set(...dir(s.lat,s.lon));                // repère de la Terre…
      v3.copy(U.u_soleil.value).applyQuaternion(terre.getWorldQuaternion(new THREE.Quaternion()));
      U.u_soleil.value.copy(v3.normalize());                     // …puis repère du monde (la Terre tourne sur l'écran)
      const o2={}; codes.forEach((c,i)=>{ o2[c]=ouverte(c,Date.now()); ov[i]=o2[c]; });
      gP.attributes.a_ouv.needsUpdate=true;
      codesArc.forEach(([a,b],k)=>{ UA.u_ouv.value[k]=Math.max(o2[a],o2[b])*(o2[a]&&o2[b]?1:.7); });
    }
    return {
      taille(){
        if(inter){
          const p=canvas.parentNode; W=Math.max(2,Math.round(p.clientWidth)); H=Math.max(2,Math.round(p.clientHeight));
          camera.aspect=W/H; camera.fov=W/H<1?48:35; camera.updateProjectionMatrix();
          groupe.position.set(0,0,0); groupe.scale.setScalar(1); appliquerQualite(); return;
        }
        W=Math.round(innerWidth*1.06); H=Math.round(innerHeight*1.06);
        camera.aspect=W/H; camera.updateProjectionMatrix();
        const large=W/H>1.15;
        // la Terre se place à droite (écran large) ou en bas (écran étroit) : l'entité reste au centre
        groupe.position.set(large?1.3*Math.min(1.8,W/H)/1.5:0,large?-.1:-1.0,0);
        groupe.scale.setScalar(large?.8:.78);
        appliquerQualite();
      },
      qualite(n){ q=Math.max(0,Math.min(2,n|0)); appliquerQualite(); },
      image(now,dt){
        const c=UI.couleurs();
        U.u_atmo.value.setRGB(c[1][0]/255*.85+.10,c[1][1]/255*.85+.12,c[1][2]/255*.85+.18);
        UA.u_c1.value.setRGB(c[0][0]/255,c[0][1]/255,c[0][2]/255); UA.u_c3.value.setRGB(c[2][0]/255,c[2][1]/255,c[2][2]/255);
        UP.u_c.value.setRGB(c[2][0]/255,c[2][1]/255,c[2][2]/255);
        if(inter){ rot+=dt*.035; groupe.rotation.x=VUE.lat*Math.PI/180; terre.rotation.y=-Math.PI/2-VUE.lon*Math.PI/180; camera.position.set(0,0,VUE.dist); }
        else{ rot+=dt*.035; terre.rotation.y=rot; }
        nuagesDec+=dt*.0018; matNuages.uniforms.u_dec.value=nuagesDec%1;   // les nuages vont un peu plus vite que la Terre
        UA.u_temps.value+=dt;
        etoiles.rotation.y=rot*.05;
        if(now-dernierCalcul>2000 || dt===0){ dernierCalcul=now; terre.updateMatrixWorld(true); soleilEtMarches(now); }
        else{ terre.updateMatrixWorld(true); const s=soleil(Date.now()); U.u_soleil.value.set(...dir(s.lat,s.lon)).applyQuaternion(terre.getWorldQuaternion(new THREE.Quaternion())).normalize(); }
        rendu.render(scene,camera);
      },
      // ── mode interactif ──
      THREE, terre,
      vec:(lat,lon,r)=>new THREE.Vector3(...dir(lat,lon,r||1)),
      vue(lat,lon,dist){ if(lat!=null) VUE.lat=Math.max(-85,Math.min(85,lat)); if(lon!=null) VUE.lon=((lon+540)%360)-180; if(dist!=null) VUE.dist=Math.max(1.35,Math.min(5,dist)); return Object.assign({},VUE); },
      pick(x,y){                                                  // coordonnées dans le canvas (px CSS) → latitude, longitude
        const r=canvas.getBoundingClientRect();
        souris.set((x/r.width)*2-1,-(y/r.height)*2+1);
        lanceur.setFromCamera(souris,camera);
        const h=lanceur.intersectObject(sphere,false)[0]; if(!h) return null;
        const p=terre.worldToLocal(h.point.clone()).normalize();
        return {lat:Math.asin(p.y)*180/Math.PI,lon:Math.atan2(-p.z,p.x)*180/Math.PI};
      },
      projeter(lat,lon){                                          // position à l'écran (px CSS) et face visible ?
        const v=new THREE.Vector3(...dir(lat,lon,1.01)); terre.localToWorld(v);
        const face=v.clone().normalize().dot(camera.position.clone().normalize());
        v.project(camera);
        return {x:(v.x+1)/2*W,y:(1-v.y)/2*H,face};
      },
      ajouter(obj){ terre.add(obj); },
      places(oui){ arcsMesh.visible=placesPts.visible=!!oui; },
      calque(toile){
        if(!toile){ if(calqueMesh) calqueMesh.visible=false; return; }
        if(!calqueMesh){
          calqueTex=new THREE.CanvasTexture(toile);
          calqueMesh=new THREE.Mesh(new THREE.SphereGeometry(1.003,96,48),new THREE.MeshBasicMaterial({map:calqueTex,transparent:true,depthWrite:false}));
          terre.add(calqueMesh);
        }else if(calqueTex.image!==toile){ calqueTex.image=toile; }
        calqueTex.needsUpdate=true; calqueMesh.visible=true;
      },
      detruire(){
        scene.traverse(x=>{ if(x.geometry) x.geometry.dispose(); if(x.material) x.material.dispose(); });
        [jour,nuit,nuages].forEach(t=>t.dispose()); if(calqueTex) calqueTex.dispose();
        rendu.dispose(); try{ rendu.forceContextLoss(); }catch(e){}
      }
    };
  };
  UI.fondsReels._soleil=soleil; UI.fondsReels._ouverte=ouverte;   // pour les tests
})();
