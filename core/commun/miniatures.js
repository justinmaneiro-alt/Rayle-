"use strict";
/* ═════════════ MINIATURES VIVANTES DES PANNEAUX DU CARROUSEL ═════════════
   Chaque panneau montre un aperçu réel de sa fenêtre, en lecture seule et en basse résolution :
   · terminal  : mini graphique H1 réel (bougies Kraken, MA200, flèches MA200 du terminal, prix), rafraîchi toutes les 8 s
   · anatomie  : le squelette 3D (os-1.glb) qui tourne lentement
   · terre     : globe qui tourne, points d'actualité de France (lieux réels des sujets du Worker)
   · dev3d     : petit engrenage 3D qui tourne
   · rayle     : anneaux et noyau, discrets
   Règles : une miniature ne dessine QUE si son panneau est visible (Miniatures.visibles) ; un seul moteur WebGL partagé ; ~20 images/s pour la 3D ;
   si l'appareil est lent (images de plus de 24 ms en moyenne) ou si les animations sont réduites : une image fixe, puis plus rien.
   Rien d'inventé : sans données, la miniature le dit (« données indisponibles »). */
(function(){
  let W=480, H=300;                         // résolution interne des miniatures (basse : 260 px de haut, largeur au format du panneau)
  const reduit=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  const OR='#ffae3d', OR2='#ffe08a';
  const minis=new Map(), visibles=new Set(); let centreId=null;
  let THREE=null, rendu=null, tempsMoyen=0, nMesures=0, lent=false, rafId=0, dernierTour=0;

  /* ───── moteur 3D partagé ───── */
  async function moteur(){
    if(rendu) return rendu;
    THREE=await import('three');
    const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
    const r=new THREE.WebGLRenderer({canvas:cv,antialias:false,alpha:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
    r.setPixelRatio(1); r.setSize(W,H,false); r.setClearColor(0x000000,0); r.outputColorSpace=THREE.SRGBColorSpace;
    rendu=r; return r;
  }
  function peindre3D(m){
    const t0=performance.now();
    rendu.render(m.scene,m.camera);
    m.ctx.clearRect(0,0,W,H); m.ctx.drawImage(rendu.domElement,0,0,W,H);
    const d=performance.now()-t0; nMesures++; if(nMesures>12) tempsMoyen=tempsMoyen?tempsMoyen*0.92+d*0.08:d;   // les premières images compilent les nuanceurs : ignorées
  }

  /* ───── terminal : mini graphique réel ───── */
  async function creerTerminal(m){
    let barres=null, prix=null, erreur=null, mod=null, ma=null, fleches=[], dernierChargement=0, charge=false;
    const base=u=>new URL(u,document.baseURI).href;
    async function charger(){
      if(charge) return; charge=true;
      try{
        mod=mod||await import(base('agent-trading/front/or/sources-or.js'));
        const fl=await import(base('agent-trading/front/or/fleches-terminal-v1.js')).catch(()=>null);
        const b=await mod.bougiesKraken('H1',{n:700});
        if(!Array.isArray(b)||b.length<30) throw new Error('moins de 30 bougies reçues');
        barres=b; erreur=null;
        try{ const t=await mod.tickerKraken(); prix=t&&Number.isFinite(+t.last)?+t.last:null; }catch(e){ prix=null; }
        // MA200 sur tout l'historique reçu (SMA, causale)
        ma=new Array(b.length).fill(null); let s=0; for(let i=0;i<b.length;i++){ s+=b[i].c; if(i>=200) s-=b[i-200].c; if(i>=199) ma[i]=s/200; }
        fleches=fl&&b.length>=220?(()=>{ try{ return fl.flechesMa(b,{mode:'h1'}); }catch(e){ return []; } })():[];
      }catch(e){ erreur=String((e&&e.message)||e).slice(0,70); }
      dernierChargement=Date.now(); charge=false; dessiner();
    }
    function dessiner(){
      const c=m.ctx; c.clearRect(0,0,W,H);
      c.fillStyle='rgba(6,9,14,.55)'; c.fillRect(0,0,W,H);
      c.font='600 13px "Segoe UI",system-ui,sans-serif'; c.textBaseline='top';
      c.fillStyle=OR2; c.fillText('OR · H1 · lecture seule',12,8);
      if(!barres){ c.fillStyle='#9db0bb'; c.font='14px "Segoe UI",system-ui,sans-serif'; c.fillText(erreur?'Données indisponibles : '+erreur:'Chargement du marché…',12,H/2-8); return; }
      const N=Math.min(90,barres.length), i0=barres.length-N, vis=barres.slice(i0);
      let hi=-Infinity, lo=Infinity; for(let k=0;k<N;k++){ hi=Math.max(hi,vis[k].h); lo=Math.min(lo,vis[k].l); if(ma[i0+k]!=null){ hi=Math.max(hi,ma[i0+k]); lo=Math.min(lo,ma[i0+k]); } }
      const marge=(hi-lo)*0.08||1; hi+=marge; lo-=marge;
      const gx=10, gy=34, gw=W-70, gh=H-52, X=k=>gx+(k+0.5)*gw/N, Y=v=>gy+(hi-v)/(hi-lo)*gh, bw=Math.max(2,gw/N*0.62);
      c.strokeStyle='rgba(255,174,61,.10)'; c.lineWidth=1; for(let g=0;g<=4;g++){ const y=gy+g*gh/4; c.beginPath(); c.moveTo(gx,y); c.lineTo(gx+gw,y); c.stroke(); }
      for(let k=0;k<N;k++){ const b=vis[k], haus=b.c>=b.o; c.strokeStyle=c.fillStyle=haus?'#37d39a':'#ff5d6e'; c.beginPath(); c.moveTo(X(k),Y(b.h)); c.lineTo(X(k),Y(b.l)); c.stroke(); const y1=Y(Math.max(b.o,b.c)), y2=Y(Math.min(b.o,b.c)); c.fillRect(X(k)-bw/2,y1,bw,Math.max(1,y2-y1)); }
      c.strokeStyle=OR; c.lineWidth=1.6; c.beginPath(); let debut=true; for(let k=0;k<N;k++){ const v=ma[i0+k]; if(v==null) continue; if(debut){ c.moveTo(X(k),Y(v)); debut=false; } else c.lineTo(X(k),Y(v)); } c.stroke();
      // flèches du terminal (MA200) : seulement celles de la fenêtre affichée
      for(const f of fleches){ const k=f.i-i0; if(k<0||k>=N) continue; const haut=f.dir>0, x=X(k), y=haut?Y(vis[k].l)+12:Y(vis[k].h)-12; c.fillStyle=haut?'#37d39a':'#ff5d6e'; c.beginPath(); if(haut){ c.moveTo(x,y-9); c.lineTo(x-6,y+2); c.lineTo(x+6,y+2); } else { c.moveTo(x,y+9); c.lineTo(x-6,y-2); c.lineTo(x+6,y-2); } c.closePath(); c.fill(); }
      const dernier=prix!=null?prix:vis[N-1].c, y=Y(dernier);
      c.strokeStyle='rgba(255,224,138,.55)'; c.setLineDash([4,4]); c.beginPath(); c.moveTo(gx,y); c.lineTo(gx+gw,y); c.stroke(); c.setLineDash([]);
      c.fillStyle=OR; c.fillRect(gx+gw+2,y-9,56,18); c.fillStyle='#1a1206'; c.font='700 12px "Segoe UI",system-ui,sans-serif'; c.fillText(dernier.toLocaleString('fr-FR',{maximumFractionDigits:1}),gx+gw+6,y-6);
      const age=Math.round((Date.now()-barres[barres.length-1].t)/60000);
      c.fillStyle='#8fa6b0'; c.font='11px "Segoe UI",system-ui,sans-serif'; c.fillText('MA200 · flèches MA200 · '+(age>180?'marché fermé ? dernière bougie il y a '+Math.round(age/60)+' h':'à jour'),12,H-16);
    }
    return { dessiner, tic(now){ if(!barres&&!charge) charger(); else if(now-dernierChargement>8000&&!charge) charger(); }, intervalle:1000, statique:false };
  }

  /* ───── anatomie : le squelette COMPLET de la grande fenêtre (os-1 + os-2), même matériau or chaud (anatomie-or.js), éclairage à trois points, contours ───── */
  async function creerAnatomie(m){
    await moteur(); const T=THREE, base=u=>new URL(u,document.baseURI).href;
    const OR=await import(base('planetes/saturne/pc/anatomie-or.js'));
    m.scene=new T.Scene(); m.camera=new T.PerspectiveCamera(30,W/H,0.1,100); m.camera.position.set(0,0.05,7.0);
    OR.eclairageTroisPoints(m.scene,T);
    const pivot=new T.Group(); m.scene.add(pivot); m.pivot=pivot;
    try{
      const [{GLTFLoader},{MeshoptDecoder}]=await Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('three/addons/libs/meshopt_decoder.module.js')]);
      const L=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), parties=await Promise.all(['os-1','os-2'].map(f=>L.loadAsync(base('assets-lourds/anatomie/'+f+'.glb'))));
      const corps=new T.Group(); for(const g of parties) corps.add(g.scene);
      OR.teinterOr(corps,T);
      const boite=new T.Box3().setFromObject(corps), taille=boite.getSize(new T.Vector3()), centre=boite.getCenter(new T.Vector3());
      const s=3.6/Math.max(taille.y,0.001); corps.scale.setScalar(s); corps.position.sub(centre.multiplyScalar(s)); pivot.add(corps);
      m.nbOs=OR.contours(corps,T);
    }catch(e){ m.erreur='squelette indisponible : '+String((e&&e.message)||e).slice(0,50); }
    return { tic(now,dt){ pivot.rotation.y+=dt*0.45; peindre3D(m); }, intervalle:50, statique:true };
  }

  /* ───── terre : LE composant de la grande fenêtre (globe.js : sphère de base jour / nuit, atmosphère, nuages, ciel étoilé, éclairage du soleil réel),
     seulement en basse résolution : textures réduites, pas de tuiles (chargeur muet), pas de bâtiments ni de relief. Globe entier, centré, rotation lente. ───── */
  async function creerTerre(m){
    await moteur(); const T=THREE, base=u=>new URL(u,document.baseURI).href;
    const [{creerGlobe},CO,REG,GEO,{creerCiel}]=await Promise.all([import(base('planetes/terre/pc/globe.js')),import(base('planetes/terre/pc/camera-orbite.js')),import(base('planetes/terre/pc/reglages-terre.js')),import(base('planetes/terre/pc/geo.js')),import(base('galaxie/ciel.js'))]);
    const charger=async(fichier,w,h,couleur)=>{ const r=await fetch(base(fichier)); if(!r.ok) throw new Error('texture introuvable : '+fichier); const bm=await createImageBitmap(await r.blob(),{resizeWidth:w,resizeHeight:h,resizeQuality:'medium'}); const t=new T.CanvasTexture(bm); t.colorSpace=couleur; t.anisotropy=1; t.generateMipmaps=true; t.minFilter=T.LinearMipmapLinearFilter; t.needsUpdate=true; return t; };
    // les mêmes images que la grande Terre (8k jour, nuit, nuages, Voie lactée), réduites
    const [jour,nuit,nuages,voie]=await Promise.all([charger('galaxie/textures/8k_earth_daymap.jpg',1024,512,T.SRGBColorSpace),charger('galaxie/textures/2k_earth_nightmap.jpg',1024,512,T.SRGBColorSpace),charger('galaxie/textures/2k_earth_clouds.jpg',1024,512,T.NoColorSpace),charger('galaxie/textures/8k_stars_milky_way.jpg',1024,512,T.SRGBColorSpace)]);
    const ciel=creerCiel({textureCiel:voie,anisotropie:()=>1}); ciel.nombreEtoiles(1500); ciel.riche(false); ciel.echelle(1);
    const cfg={...REG.normaliser(null),profil:'basse',jeu:true,noms:false,batiments:false,radar:false,meteoAnim:false,ombres:false,nuages:true,nuagesReels:false,jourImagerie:null};
    const chargeurMuet={demander:()=>{ const p=new Promise(()=>{}); p.annuler=()=>{}; return p; },etat:()=>({enFile:0,actives:0})};   // aucune tuile : le globe de base suffit à cette distance
    const globe=creerGlobe({renderer:rendu,textures:{jour,nuit,nuages},ciel,chargeur:chargeurMuet,lire:()=>cfg,modeleVecteur:()=>null});
    globe.scene.add(ciel.groupe);
    const [{EffectComposer},{RenderPass},{OutputPass}]=await Promise.all([import('three/addons/postprocessing/EffectComposer.js'),import('three/addons/postprocessing/RenderPass.js'),import('three/addons/postprocessing/OutputPass.js')]);
    const cible=new T.WebGLRenderTarget(W,H,{type:T.HalfFloatType}); const composer=new EffectComposer(rendu,cible); composer.setPixelRatio(1); composer.setSize(W,H); composer.addPass(new RenderPass(globe.scene,globe.camera)); composer.addPass(new OutputPass());
    // points d'actualité : lieux réels des sujets de France (Worker) ; aucun point sans données
    const pts=new T.Group(); globe.scene.add(pts); const lieux=[];
    const etiquette=t=>{ try{ const s=m.canvas.closest('.ac-p').querySelector('footer span'); if(s) s.textContent=t; }catch(e){} };
    (async()=>{ try{
      const [fil,suj]=await Promise.all([import(base('planetes/terre/pc/fil-actus.js')),import(base('planetes/terre/pc/actus-sujets.js'))]);
      const brut=await fil.chargerFil('france','',{}), mod=suj.modelesFil(brut,{max:40});
      for(const x of mod.sujets){ const l=x.lieu; if(!l||!Number.isFinite(l.lat)||!Number.isFinite(l.lon)) continue; const p=new T.Mesh(new T.SphereGeometry(1,10,8),new T.MeshBasicMaterial({color:0xffd27a,depthTest:true})); const h=new T.Mesh(new T.SphereGeometry(1,10,8),new T.MeshBasicMaterial({color:0xffa83c,transparent:true,opacity:0.3,blending:T.AdditiveBlending,depthWrite:false})); pts.add(p,h); lieux.push({p,h,v:GEO.vers(l.lon,l.lat,25)}); }
      etiquette(lieux.length?lieux.length+' lieux d’actualité de France':'actualité chargée, aucun lieu repéré');
    }catch(e){ etiquette('actualité non chargée'); } })();
    const E=CO.etatInitial({lon:0,lat:18,dist:GEO.R*2.7,cap:0,incl:0}); E.lon=(Date.now()/240000)%360-180;   // même altitude d'orbite que la grande Terre ; longitude de départ qui bouge avec l'heure
    m.terreEtat=()=>({lon:E.lon,lat:E.lat});
    let aff=null;
    return { tic(now,dt){
      E.lon+=dt*4; if(E.lon>180) E.lon-=360;   // rotation lente (≈ 4° par seconde)
      const pose=CO.pose(E,0); globe.maj(dt,pose,{largeur:W,hauteur:H},{date:new Date()});
      for(const q of lieux){ q.p.position.set(q.v[0]-pose.cam[0],q.v[1]-pose.cam[1],q.v[2]-pose.cam[2]); q.p.scale.setScalar(55); q.h.position.copy(q.p.position); q.h.scale.setScalar(130); }
      ciel.maj(dt);
      const tm=rendu.toneMapping, ex=rendu.toneMappingExposure; rendu.toneMapping=T.ACESFilmicToneMapping; rendu.toneMappingExposure=1.05;
      const t0=performance.now(); composer.render(dt); rendu.toneMapping=tm; rendu.toneMappingExposure=ex;
      m.ctx.clearRect(0,0,W,H); m.ctx.drawImage(rendu.domElement,0,0,W,H);
      const d=performance.now()-t0; nMesures++; if(nMesures>12) tempsMoyen=tempsMoyen?tempsMoyen*0.92+d*0.08:d;
    }, intervalle:50, statique:true };
  }

  /* ───── développement 3D : engrenage ───── */
  async function creerDev3d(m){
    await moteur(); const T=THREE;
    m.scene=new T.Scene(); m.camera=new T.PerspectiveCamera(32,W/H,0.1,100); m.camera.position.set(0,0,6);
    m.scene.add(new T.AmbientLight(0xffe0b0,0.7)); const l=new T.DirectionalLight(0xffc880,2.4); l.position.set(2,3,4); m.scene.add(l);
    const dents=14, R=1.45, r=1.15, sh=new T.Shape();
    for(let i=0;i<dents;i++){ const a=i/dents*Math.PI*2, b=(i+0.5)/dents*Math.PI*2, p=Math.PI*2/dents*0.22; const pt=(rr,t)=>[Math.cos(t)*rr,Math.sin(t)*rr]; const q=[pt(r,a-p*1.4),pt(R,a-p*0.7),pt(R,a+p*0.7),pt(r,a+p*1.4)]; if(i===0) sh.moveTo(...q[0]); else sh.lineTo(...q[0]); sh.lineTo(...q[1]); sh.lineTo(...q[2]); sh.lineTo(...q[3]); }
    sh.closePath(); const trou=new T.Path(); trou.absarc(0,0,0.45,0,Math.PI*2,true); sh.holes.push(trou);
    const geo=new T.ExtrudeGeometry(sh,{depth:0.5,bevelEnabled:true,bevelSize:0.04,bevelThickness:0.04,bevelSegments:1,curveSegments:10}); geo.center();
    const g=new T.Mesh(geo,new T.MeshStandardMaterial({color:0xd9a441,metalness:0.85,roughness:0.32}));
    const fil=new T.LineSegments(new T.EdgesGeometry(geo,35),new T.LineBasicMaterial({color:0xffe08a,transparent:true,opacity:0.55}));
    const pivot=new T.Group(); pivot.add(g,fil); m.scene.add(pivot); pivot.rotation.x=0.5;
    return { tic(now,dt){ pivot.rotation.y+=dt*0.7; pivot.rotation.z+=dt*0.2; peindre3D(m); }, intervalle:50, statique:true };
  }

  /* ───── accueil : anneaux discrets ───── */
  function creerRayle(m){
    function dessiner(t){ const c=m.ctx; c.clearRect(0,0,W,H); c.strokeStyle='rgba(255,174,61,.55)'; c.lineWidth=1.5; const cx=W/2, cy=H/2;
      for(let k=0;k<3;k++){ c.beginPath(); c.arc(cx,cy,40+k*26,t*0.0006*(k%2?-1:1),t*0.0006*(k%2?-1:1)+4.2); c.stroke(); }
      const g=c.createRadialGradient(cx,cy,2,cx,cy,34); g.addColorStop(0,'rgba(255,224,138,.95)'); g.addColorStop(1,'rgba(255,174,61,0)'); c.fillStyle=g; c.beginPath(); c.arc(cx,cy,34,0,7); c.fill(); }
    return { dessiner, tic(now){ dessiner(now); }, intervalle:90, statique:true };
  }

  /* ───── cycle de vie ───── */
  const LIBELLES={terminal:'Or · H1 · Kraken · lecture seule',anatomie:'Squelette 3D complet',terre:'',dev3d:'Atelier de maquettes 3D',rayle:''};
  const FABRIQUES={terminal:creerTerminal,anatomie:creerAnatomie,terre:creerTerre,dev3d:creerDev3d,rayle:creerRayle};
  async function creer(id,canvas){
    if(minis.has(id)) return minis.get(id);
    if(!minis.size&&canvas.parentElement){ const bw=canvas.parentElement.offsetWidth, bh=canvas.parentElement.offsetHeight; if(bw>50&&bh>50){ H=260; W=Math.max(320,Math.min(720,Math.round(260*bw/bh))); } }
    canvas.width=W; canvas.height=H;
    const m={id,canvas,ctx:canvas.getContext('2d'),pret:false,dernier:0,fige:false,ctrl:null};
    minis.set(id,m);
    try{ m.ctrl=await FABRIQUES[id](m); m.pret=true; const s=canvas.closest('.ac-p'), pied=s&&s.querySelector('footer span'); if(pied&&!pied.textContent) pied.textContent=LIBELLES[id]||''; }catch(e){ m.ctx.fillStyle='#9db0bb'; m.ctx.font='13px "Segoe UI",system-ui,sans-serif'; m.ctx.fillText('Aperçu indisponible : '+String((e&&e.message)||e).slice(0,60),12,24); m.erreurFatale=true; }
    demarrerBoucle(); return m;
  }
  function boucle(now){
    rafId=requestAnimationFrame(boucle);
    if(document.hidden||!visibles.size) return;
    const dt=Math.min(0.1,(now-dernierTour)/1000||0.016); dernierTour=now;
    for(const id of visibles){
      const m=minis.get(id); if(!m||!m.pret||!m.ctrl) continue;
      if(m.fige) continue;
      if(id!==centreId&&m.dernier>0&&(m.ctrl.statique||id==='terminal')) continue;   // panneau voisin : une image suffit, le rendu vivant n'est fait que pour le panneau du centre
      if(now-m.dernier<m.ctrl.intervalle) continue; m.dernier=now;
      try{ m.ctrl.tic(now,(m.ctrl.intervalle?Math.max(dt,m.ctrl.intervalle/1000):dt)); }catch(e){ m.fige=true; }
    }
    // appareil lent : les miniatures 3D se figent sur leur dernière image
    if(nMesures>60&&tempsMoyen>24&&!lent){ lent=true; for(const m of minis.values()) if(m.ctrl&&m.ctrl.statique) m.fige=true; }
  }
  function demarrerBoucle(){ if(!rafId) rafId=requestAnimationFrame(boucle); }
  function definirVisibles(ids,centre){ centreId=centre||null; visibles.clear(); for(const i of ids) visibles.add(i); if(reduit()) for(const m of minis.values()) if(m.ctrl&&m.ctrl.statique&&m.dernier) m.fige=true; }
  window.Miniatures={terreEtat:()=>{ const m=minis.get('terre'); try{ return m&&m.terreEtat?m.terreEtat():null; }catch(e){ return null; } },creer,visibles:definirVisibles,etat:()=>({lent,tempsMoyenMs:+tempsMoyen.toFixed(1),minis:[...minis.values()].map(m=>({id:m.id,pret:m.pret,fige:m.fige,erreur:m.erreur||null}))}),
    instantane:id=>{ const m=minis.get(id); try{ return m?m.canvas.toDataURL('image/jpeg',0.7):null; }catch(e){ return null; } }};
})();
