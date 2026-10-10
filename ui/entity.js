"use strict";
/* ═════════════ ENTITÉ : profondeur autour de la sphère de particules ═════════════
   Ajouté autour de l'entité existante (js/commun/entite.js), sans toucher à ses particules :
   - halo (un simple div en dégradé : seuls son opacité et son échelle changent, travail du compositeur),
   - anneaux orbitaux en 3D légère, coupés en deux canvas (moitié arrière derrière les particules, moitié avant devant),
   - par état : veille (respiration, poussières qui flottent) · écoute (anneaux resserrés qui pulsent avec le volume du micro, ondes)
     · réflexion (orbites rapides, nœuds qui tournent, éclats) · parole (onde qui ondule avec la voix, ondes à chaque syllabe forte).
   - micro : sur ordinateur seulement (réglage), le vrai volume du micro pendant l'écoute ; sur téléphone et tablette, l'entité simule.
   Palier 2 (éco) : halo fixe, pas d'anneaux animés. Pause quand l'onglet est caché, le terminal ou les Réglages ouverts. */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  const hote=document.getElementById('reactor');
  if(!hote || !window.Entite) return;

  const halo=document.createElement('div'); halo.className='ui-halo'; halo.setAttribute('aria-hidden','true');
  const arr=document.createElement('canvas'); arr.className='ui-anneaux arriere'; arr.setAttribute('aria-hidden','true');
  const av=document.createElement('canvas'); av.className='ui-anneaux avant'; av.setAttribute('aria-hidden','true');
  // disque sombre et flou derrière l'entité, quand un fond est actif (intensité : curseur « Contraste de l'entité », ui.css)
  const disque=document.createElement('div'); disque.className='ui-disque'; disque.setAttribute('aria-hidden','true');
  hote.append(disque,halo,arr,av);
  const ca=arr.getContext('2d'), cb=av.getContext('2d');

  let palier=1, micro=false, mobile=false;
  RayleBus.on('ui:reglages',r=>{ palier=r.palier; micro=r.micro; mobile=r.mobile; taille(true); });
  try{ const r=UI.reglages(); palier=r.palier; micro=r.micro; mobile=r.mobile; }catch(e){}

  /* ───── paramètres par état, lissés ───── */
  const P={
    idle:      {ring:.16,vit:.12,ech:1.00,halo:.30,haloS:1.00,noeuds:0,eclats:0,onde:0,pouss:.5,resp:.4},
    veille:    {ring:.26,vit:.18,ech:1.03,halo:.42,haloS:1.04,noeuds:0,eclats:0,onde:0,pouss:1, resp:1},
    listening: {ring:.55,vit:.45,ech:.88, halo:.58,haloS:.94, noeuds:0,eclats:0,onde:0,pouss:.3,resp:.2},
    thinking:  {ring:.50,vit:1.6,ech:1.00,halo:.52,haloS:1.00,noeuds:1,eclats:1,onde:0,pouss:.2,resp:.2},
    speaking:  {ring:.42,vit:.55,ech:1.02,halo:.70,haloS:1.05,noeuds:0,eclats:0,onde:1,pouss:.2,resp:.2},
    alerte:    {ring:.40,vit:1.1,ech:1.00,halo:.60,haloS:1.06,noeuds:1,eclats:0,onde:0,pouss:0, resp:0},
    verrouille:{ring:.06,vit:.05,ech:.86, halo:.10,haloS:.90, noeuds:0,eclats:0,onde:0,pouss:0, resp:0}
  };
  const cur=Object.assign({},P.idle);
  const ALERTE=[[255,120,40],[255,50,60],[255,190,90],[160,20,30]], GRIS=[[130,130,150],[100,100,120],[160,160,175],[70,70,85]];

  const ANNEAUX=[
    {r:1.30,tx:1.18,tz:.30, sens:1,  c:0,w:1.2},
    {r:1.50,tx:1.38,tz:-.55,sens:-1.3,c:1,w:1},
    {r:1.70,tx:.92, tz:.95, sens:.7, c:2,w:.8,pointille:true}
  ];
  ANNEAUX.forEach(a=>{ a.cx=Math.cos(a.tx); a.sx=Math.sin(a.tx); a.cz=Math.cos(a.tz); a.sz=Math.sin(a.tz); a.phase=Math.random()*6.28; });
  const poussieres=[]; for(let i=0;i<22;i++) poussieres.push({a:Math.random()*6.28,r:1.2+Math.random()*.9,y:(Math.random()-.5)*1.6,v:(.05+Math.random()*.12)*(Math.random()<.5?-1:1),s:.5+Math.random()});
  const ondes=[], eclats=[];

  /* ───── taille : canvas 1,6 × l'entité, centrés sur elle ───── */
  let S=0, D=0, U=0, dpr=1;
  function taille(force){
    const s=Math.max(1,Math.round(Math.min(hote.clientWidth,hote.clientHeight)));
    const d=palier===0?Math.min(window.devicePixelRatio||1,1.5):1;
    if(!force && s===S && d===dpr) return;
    S=s; dpr=d; D=Math.round(S*1.6*dpr); U=S/2*dpr;
    [arr,av].forEach(c=>{ c.width=D; c.height=D; });   // taille affichée : 160 % de l'entité, en CSS
  }
  if('ResizeObserver' in window) new ResizeObserver(()=>taille(false)).observe(hote);
  window.addEventListener('resize',()=>taille(false));

  /* ───── volume du micro (ordinateur seulement) ───── */
  let flux=null, actx=null, an=null, buf=null, demande=false, refus=false, horsEcoute=0, niveau=0;
  function niveauMicro(){
    if(!an) return null;
    an.getByteTimeDomainData(buf);
    let s=0; for(let i=0;i<buf.length;i++){ const v=(buf[i]-128)/128; s+=v*v; }
    const rms=Math.sqrt(s/buf.length);
    niveau=Math.max(0,Math.min(1,(rms-.012)*7));
    return niveau;
  }
  async function ouvrirMicro(){
    if(flux || demande || refus) return;
    demande=true;
    try{
      // flux brut (sans traitement « appel ») : on ne fait que mesurer le niveau, rien n'est enregistré ni envoyé
      const f=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
      const AC=window.AudioContext||window.webkitAudioContext;
      const c=new AC(); if(c.state==='suspended') await c.resume().catch(()=>{});
      const a=c.createAnalyser(); a.fftSize=256; a.smoothingTimeConstant=.6;
      c.createMediaStreamSource(f).connect(a);
      flux=f; actx=c; an=a; buf=new Uint8Array(a.fftSize);
      Entite.micro(niveauMicro);
    }catch(e){ refus=true; console.warn('[ui] volume du micro indisponible :',e&&e.message||e); }
    finally{ demande=false; }
  }
  function fermerMicro(){
    Entite.micro(null);
    if(flux){ flux.getTracks().forEach(t=>t.stop()); flux=null; }
    if(actx){ actx.close().catch(()=>{}); actx=null; }
    an=null; niveau=0;
  }
  setInterval(()=>{
    const veut=micro && !mobile && !document.hidden && navigator.mediaDevices && Entite.info().etat==='listening';
    if(veut){ horsEcoute=0; ouvrirMicro(); }
    else if(flux && ++horsEcoute>=3) fermerMicro();     // ~1,5 s hors écoute : on rend le micro
  },500);
  RayleBus.on('ui:reglages',r=>{ if(!r.micro) refus=false; });

  /* ───── dessin ───── */
  const masque=()=>document.hidden || RayleBus.demander('vue')==='terminal' || document.getElementById('cfg').classList.contains('open');
  let tPrec=0, dernier=0, t=0, rot=0, ampPrec=0, prochaineOnde=0, haloO=-1, haloE=-1, visible=true;
  const lisse=(k,dt,v)=>1-Math.exp(-dt*v);

  function projeter(a,th,spin,ech,out){
    // point de l'anneau (cercle couché), incliné, puis tourné avec la scène, perspective légère
    let x=Math.cos(th+spin)*a.r*ech, y=0, z=Math.sin(th+spin)*a.r*ech;
    let y2=y*a.cx-z*a.sx, z2=y*a.sx+z*a.cx; y=y2; z=z2;
    let x2=x*a.cz-y*a.sz; y2=x*a.sz+y*a.cz; x=x2; y=y2;
    const cr=Math.cos(rot), sr=Math.sin(rot);
    x2=x*cr+z*sr; z2=-x*sr+z*cr; x=x2; z=z2;
    const p=1/(1-z*.10);
    out[0]=D/2+x*p*U*.69; out[1]=D/2-y*p*U*.69; out[2]=z;
  }
  const pt=[0,0,0], pt2=[0,0,0];

  function boucle(now){
    requestAnimationFrame(boucle);
    const montrer=palier<2 && !masque();
    if(!montrer){ if(visible){ visible=false; arr.style.visibility=av.style.visibility='hidden'; } tPrec=0; return; }
    if(now-dernier<1000/(palier===0?60:30)-3) return;
    dernier=now;
    const dt=tPrec?Math.min(.1,(now-tPrec)/1000):.016; tPrec=now; t+=dt;
    if(!S) taille(true);

    const inf=Entite.info(), vis=inf.vis, amp=Math.min(1.1,inf.amp||0);
    const b=P[vis]||P[inf.etat]||P.idle;
    const k=lisse(0,dt,3);
    for(const c in b) cur[c]+=(b[c]-cur[c])*k;
    const col=vis==='alerte'?ALERTE:vis==='verrouille'?GRIS:UI.couleurs();
    rot+=dt*(.08+cur.vit*.25);

    // halo : respiration lente en veille, suit la voix en parole
    const resp=1+cur.resp*.06*Math.sin(t*1.1);
    const o=Math.min(1,cur.halo*(1+amp*.6)), e=cur.haloS*resp*(1+amp*.08);
    if(Math.abs(o-haloO)>.01){ halo.style.opacity=o.toFixed(2); haloO=o; }
    if(Math.abs(e-haloE)>.004){ halo.style.transform='translate(-50%,-50%) scale('+e.toFixed(3)+')'; haloE=e; }

    // entité Neurones : le halo seulement, sans anneaux ni ondes
    const anneaux=inf.moteur!=='neurones';
    if(anneaux!==visible){ visible=anneaux; arr.style.visibility=av.style.visibility=anneaux?'':'hidden'; }
    if(!anneaux) return;
    ca.clearRect(0,0,D,D); cb.clearRect(0,0,D,D);
    ca.globalCompositeOperation=cb.globalCompositeOperation='lighter';
    ca.lineCap=cb.lineCap='round';

    // anneaux orbitaux
    const ecoute=vis==='listening';
    const ech=cur.ech*(ecoute?1+amp*.10:1);
    ANNEAUX.forEach((a,i)=>{
      a.phase+=dt*cur.vit*a.sens;
      const al=cur.ring*(.65+.35*Math.min(1,amp*1.4))*(i===2?.7:1);
      const w=(a.w+(ecoute?amp*1.8:0))*dpr;
      ca.strokeStyle=UI.rgba(col[a.c],al*.55); cb.strokeStyle=UI.rgba(col[a.c],al);
      ca.lineWidth=cb.lineWidth=w;
      ca.beginPath(); cb.beginPath();
      const n=72;
      for(let s=0;s<n;s++){
        if(a.pointille && (s%4)>1) continue;
        projeter(a,s/n*6.2832,a.phase,ech,pt); projeter(a,(s+1)/n*6.2832,a.phase,ech,pt2);
        const c=(pt[2]+pt2[2])>0?cb:ca;
        c.moveTo(pt[0],pt[1]); c.lineTo(pt2[0],pt2[1]);
      }
      ca.stroke(); cb.stroke();
      // nœuds qui filent sur les orbites (réflexion, alerte)
      if(cur.noeuds>.05){
        for(let q=0;q<2;q++){
          projeter(a,a.phase*3+q*3.1416,0,ech,pt);
          const c=pt[2]>0?cb:ca, r=(2.2+i*.4)*dpr*(pt[2]>0?1.2:.8);
          c.fillStyle=UI.rgba(col[2],cur.noeuds*(pt[2]>0?.95:.45));
          c.beginPath(); c.arc(pt[0],pt[1],r,0,6.2832); c.fill();
        }
      }
    });

    // onde de parole : un cercle qui ondule avec la voix
    if(cur.onde>.05){
      for(let j=0;j<2;j++){
        ca.strokeStyle=UI.rgba(col[j?2:0],cur.onde*(.35+amp*.5)); ca.lineWidth=(1.2+amp*1.5)*dpr;
        ca.beginPath();
        for(let s=0;s<=96;s++){
          const th=s/96*6.2832;
          const r=U*.69*(1.16+j*.06)*(1+amp*(.07*Math.sin(5*th+t*6+j*2)+.04*Math.sin(9*th-t*9)));
          const x=D/2+Math.cos(th)*r, y=D/2+Math.sin(th)*r;
          s?ca.lineTo(x,y):ca.moveTo(x,y);
        }
        ca.stroke();
      }
    }

    // ondes : à chaque syllabe forte (parole) ou à chaque pic de volume (écoute), et une pulsation régulière en écoute
    if((vis==='speaking'||ecoute) && amp-ampPrec>.10 && amp>.30 && now>prochaineOnde){ ondes.push({age:0,c:ecoute?1:0}); prochaineOnde=now+260; }
    if(ecoute && now>prochaineOnde+1400){ ondes.push({age:0,c:1}); prochaineOnde=now; }
    ampPrec=ampPrec+(amp-ampPrec)*.5;
    for(let i=ondes.length-1;i>=0;i--){
      const w=ondes[i]; w.age+=dt;
      const k2=w.age/1.2; if(k2>=1){ ondes.splice(i,1); continue; }
      ca.strokeStyle=UI.rgba(col[w.c],(1-k2)*.5); ca.lineWidth=(2-k2*1.4)*dpr;
      ca.beginPath(); ca.arc(D/2,D/2,U*.69*(1.05+k2*1.15),0,6.2832); ca.stroke();
    }

    // éclats (réflexion) : petites étincelles qui jaillissent de la sphère
    if(cur.eclats>.3 && eclats.length<(palier===0?40:20) && Math.random()<dt*22){
      const u=Math.random()*2-1, th=Math.random()*6.2832, r=Math.sqrt(1-u*u);
      eclats.push({x:r*Math.cos(th),y:u,z:r*Math.sin(th),age:0,v:.7+Math.random()*.8});
    }
    for(let i=eclats.length-1;i>=0;i--){
      const s=eclats[i]; s.age+=dt;
      if(s.age>.55){ eclats.splice(i,1); continue; }
      const d0=.72+s.age*s.v, d1=d0+.10;
      const c=s.z>0?cb:ca;
      c.strokeStyle=UI.rgba(col[2],(1-s.age/.55)*.9); c.lineWidth=1.3*dpr;
      c.beginPath(); c.moveTo(D/2+s.x*d0*U,D/2-s.y*d0*U); c.lineTo(D/2+s.x*d1*U,D/2-s.y*d1*U); c.stroke();
    }

    // poussières qui flottent (veille surtout)
    if(cur.pouss>.05){
      ca.fillStyle=UI.rgba(col[2],cur.pouss*.45);
      poussieres.forEach(p=>{
        p.a+=dt*p.v; const y=p.y+Math.sin(t*.4+p.a*2)*.08;
        const x=Math.cos(p.a+rot*.3)*p.r, z=Math.sin(p.a+rot*.3)*p.r, q=1/(1-z*.1);
        const sz=p.s*dpr*(z>0?1.4:.9);
        ca.fillRect(D/2+x*q*U*.69-sz/2,D/2-y*q*U*.69-sz/2,sz,sz);
      });
    }
  }
  taille(true);
  requestAnimationFrame(boucle);
})();
