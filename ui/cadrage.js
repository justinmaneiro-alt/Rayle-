"use strict";
/* ═════════════ CADRAGE RESPONSIVE COMMUN DES FONDS ANIMÉS (RayleUI.cadrage) ═════════════
   But : l'objet principal d'un fond 3D (la planète du Globe, et demain un vaisseau, un immeuble…) est TOUJOURS entier à l'écran,
   sur un côté dégagé, quel que soit l'appareil : téléphone, tablette (portrait/paysage, rotation en direct), PC 16:9, 16:10, 21:9, 32:9,
   fenêtre redimensionnée à la souris, plein écran, zoom du navigateur. Aucun nombre magique de placement : on projette VRAIMENT
   l'objet avec la caméra (silhouette exacte d'une sphère en perspective) et on cherche la plus grande échelle qui tient dans la zone libre.

   Zone libre = écran moins : l'entité centrale (sphère + halo), la bande du titre en haut, la barre de boutons en bas, et les panneaux
   HUD ouverts (colonnes gauche/droite). Disposition :
     • écran large (ratio ≥ 1,15)      → « côté » : à droite de l'entité (ou à gauche si les panneaux l'occupent), entier ;
     • tablette verticale / presque carré → « vertical » : sous (ou au-dessus de) l'entité, entier ;
     • téléphone vertical               → « horizon » : la planète se lève en bas de l'écran, juste sous le texte de l'entité (le rendu
       d'origine, volontairement conservé : seul le haut de la planète est visible, le reste dépasse en bas et sur les côtés).

   API (tout en pixels CSS ; repère du canvas : le canvas déborde de l'écran de 3 % de chaque côté pour la parallaxe, cf. ui/ui.css) :
     silhouette(cam, W, H, centre{x,y,z}, rayon)       boîte englobante (px) d'une sphère vue par la caméra {fov, aspect, dist}, ou null
     ajuster(cam, W, H, zone{x0,y0,x1,y1}, rayonBase, {echelleMax, marge})   → {x, y, z, scale, boite}  (objet entier dans la zone)
     horizon(cam, W, H, {haut, largeur, rayonBase, echelleMax})              → {x, y, z, scale, boite}  (planète qui se lève)
     disposer({W, H, entite, haut, bas, texteBas, texte, reserves, marge})          → {mode, zone, haut, cote}  (écran, sans DOM : testable)
     mesurer()                                          lit le DOM (entité, titre, barre, panneaux) → entrées de disposer()
     cadrer({cam, rayonBase, echelleMax, canvasW, canvasH, parallaxe})        → {x, y, z, scale, mode, zone}  (tout-en-un pour un fond)
     ecouter(fn) → désabonnement   appelle fn (au plus une fois par image) quand l'écran, l'orientation, le zoom, le visualViewport,
                                   les panneaux ou la taille de l'entité changent
   Utilisation par un nouveau fond :
     taille(){ const c=UI.cadrage.cadrer({cam:{fov:35,dist:3.4},rayonBase:1.09,echelleMax:.8,canvasW:W,canvasH:H});
               cible={x:c.x,y:c.y,scale:c.scale}; }       // puis rapprocher doucement la position actuelle de la cible (pas de saut)
   background.js appelle déjà scene.taille() à chaque changement (voir ecouter). */
(function(){
  const GLOBAL=typeof window!=='undefined'?window:globalThis;
  const UI=GLOBAL.RayleUI=GLOBAL.RayleUI||{};
  const RAD=Math.PI/180;
  const RAYON_ENTITE=.30;      // rayon de la sphère de particules, en fraction de la largeur du cadre de l'entité (mesuré sur le rendu)
  const DEGAGEMENT=1.25;       // l'objet reste à 1,25 rayon de l'entité (halo compris) tant qu'il y a la place
  const RECOUVREMENT_MIN=.4;   // s'il manque de la place, il peut mordre sur le halo jusqu'à 0,4 rayon de l'entité du centre
  const FOND_DEBORD=.03;       // le canvas déborde de 3 % de chaque côté (ui.css : left:-3vw, width:106vw)

  /* ───── projection ───── */
  const tanDemi=cam=>Math.tan(cam.fov*RAD/2);
  function projeter(cam,W,H,p){                          // p : repère de la caméra (elle regarde vers -z)
    const z=-p.z; if(z<=1e-6) return null;
    const t=tanDemi(cam);
    return {x:(p.x/(z*t*cam.aspect)+1)/2*W,y:(1-p.y/(z*t))/2*H};
  }
  // silhouette exacte d'une sphère : le cône des rayons tangents, échantillonné, projeté sur l'écran
  function silhouette(cam,W,H,c,rayon){
    const px=c.x, py=c.y, pz=c.z-cam.dist, d=Math.hypot(px,py,pz);
    if(!(rayon>0) || rayon>=d*.999) return null;
    const alpha=Math.asin(rayon/d), ca=Math.cos(alpha), sa=Math.sin(alpha);
    const a=[px/d,py/d,pz/d], h=Math.abs(a[1])<.9?[0,1,0]:[1,0,0];
    let u=[a[1]*h[2]-a[2]*h[1],a[2]*h[0]-a[0]*h[2],a[0]*h[1]-a[1]*h[0]]; const nu=Math.hypot(u[0],u[1],u[2]); u=u.map(x=>x/nu);
    const v=[a[1]*u[2]-a[2]*u[1],a[2]*u[0]-a[0]*u[2],a[0]*u[1]-a[1]*u[0]];
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    const N=96;
    for(let k=0;k<N;k++){
      const t=2*Math.PI*k/N, ct=Math.cos(t), st=Math.sin(t);
      const q=projeter(cam,W,H,{x:a[0]*ca+(u[0]*ct+v[0]*st)*sa,y:a[1]*ca+(u[1]*ct+v[1]*st)*sa,z:a[2]*ca+(u[2]*ct+v[2]*st)*sa});
      if(!q) return null;                                 // la sphère passe derrière le plan de la caméra
      if(q.x<x0)x0=q.x; if(q.x>x1)x1=q.x; if(q.y<y0)y0=q.y; if(q.y>y1)y1=q.y;
    }
    return {x0,y0,x1,y1};
  }
  // un point de l'écran (px) → le point du plan z = 0 qu'il regarde
  function versMonde(cam,W,H,sx,sy){
    const t=tanDemi(cam);
    return {x:((sx/W)*2-1)*cam.dist*t*cam.aspect,y:(1-(sy/H)*2)*cam.dist*t};
  }
  const pxParUnite=(cam,W,H)=>({x:W/(2*cam.dist*tanDemi(cam)*cam.aspect),y:H/(2*cam.dist*tanDemi(cam))});   // px par unité du monde, dans le plan z = 0
  const dedans=(b,z)=>!!b && b.x0>=z.x0-.5 && b.x1<=z.x1+.5 && b.y0>=z.y0-.5 && b.y1<=z.y1+.5;
  const complete=cam=>Object.assign({},cam,{aspect:cam.aspect});

  // plus grande valeur de s dans (0, max] pour laquelle ok(s) est vrai (ok est monotone : vrai pour les petites valeurs)
  function chercher(ok,max){
    if(ok(max)) return max;
    let lo=0,hi=max;
    for(let i=0;i<42;i++){ const mi=(lo+hi)/2; if(ok(mi)) lo=mi; else hi=mi; }
    return lo;
  }

  /* ───── placement entier dans une zone ───── */
  function ajuster(cam,W,H,zone,rayonBase,opt){
    opt=opt||{};
    cam=complete(cam);
    const max=opt.echelleMax||1, m=opt.marge||0;
    let z={x0:zone.x0+m,y0:zone.y0+m,x1:zone.x1-m,y1:zone.y1-m};
    if(z.x1-z.x0<4 || z.y1-z.y0<4){                       // zone absurde : on prend le centre de ce qui reste, très petit
      const cx=(zone.x0+zone.x1)/2, cy=(zone.y0+zone.y1)/2; z={x0:cx-2,x1:cx+2,y0:cy-2,y1:cy+2};
    }
    const k=pxParUnite(cam,W,H);
    let cx=(z.x0+z.x1)/2, cy=(z.y0+z.y1)/2, w=versMonde(cam,W,H,cx,cy), s=max, boite=null;
    for(let tour=0;tour<4;tour++){
      s=chercher(e=>dedans(silhouette(cam,W,H,{x:w.x,y:w.y,z:0},rayonBase*e),z),max);
      boite=silhouette(cam,W,H,{x:w.x,y:w.y,z:0},rayonBase*s);
      if(!boite) break;
      // la perspective décentre un peu la silhouette : on recentre sur la zone
      const dx=cx-(boite.x0+boite.x1)/2, dy=cy-(boite.y0+boite.y1)/2;
      if(Math.abs(dx)<.5 && Math.abs(dy)<.5) break;
      w={x:w.x+dx/k.x,y:w.y-dy/k.y};
    }
    s=chercher(e=>dedans(silhouette(cam,W,H,{x:w.x,y:w.y,z:0},rayonBase*e),z),max);
    return {x:w.x,y:w.y,z:0,scale:s,boite:silhouette(cam,W,H,{x:w.x,y:w.y,z:0},rayonBase*s)};
  }

  /* ───── « horizon » : une planète qui se lève sous l'entité (téléphone vertical) ───── */
  function horizon(cam,W,H,o){
    cam=complete(cam);
    const max=o.echelleMax||1, R=o.rayonBase, cible=o.largeur;     // largeur voulue de la silhouette (px, plus large que l'écran)
    let w={x:0,y:0}, s=max;
    const larg=(e,y)=>{ const b=silhouette(cam,W,H,{x:0,y,z:0},R*e); return b?b.x1-b.x0:Infinity; };
    for(let tour=0;tour<4;tour++){
      // échelle : la silhouette atteint la largeur voulue (sans dépasser echelleMax)
      let lo=0,hi=max; if(larg(max,w.y)<=cible) s=max; else{ for(let i=0;i<40;i++){ const mi=(lo+hi)/2; if(larg(mi,w.y)<=cible) lo=mi; else hi=mi; } s=lo; }
      // hauteur : le sommet de la silhouette est juste sous le texte de l'entité
      let ya=-6,yb=6;                                                // y du monde ; le sommet descend à l'écran quand y diminue
      for(let i=0;i<46;i++){ const ym=(ya+yb)/2, b=silhouette(cam,W,H,{x:0,y:ym,z:0},R*s); if(b && b.y0<o.haut) yb=ym; else ya=ym; }
      w={x:0,y:(ya+yb)/2};
    }
    return {x:0,y:w.y,z:0,scale:s,boite:silhouette(cam,W,H,{x:0,y:w.y,z:0},R*s)};
  }

  /* ───── disposition à l'écran (pur calcul : testable sans navigateur) ───── */
  function disposer(o){
    const W=o.W, H=o.H, ratio=W/H;
    const m=o.marge!=null?o.marge:Math.round(Math.min(W,H)*.03);
    const e=o.entite||{cx:W/2,cy:H*.42,r:Math.min(W,H)*.15};
    const haut=o.haut!=null?o.haut:56, bas=o.bas!=null?o.bas:H-170;
    const texteBas=o.texteBas!=null?o.texteBas:e.cy+e.r*1.7;
    const reserves=o.reserves||[], ecart=14;
    const hauteurLibre=Math.max(60,bas-haut);

    if(ratio>=1.15){                                                 // « côté »
      const minD=.5*hauteurLibre;
      const essai=sens=>{
        let xa,xb;
        if(sens>0){ xa=e.cx+e.r*DEGAGEMENT; xb=W-m; } else { xa=m; xb=e.cx-e.r*DEGAGEMENT; }
        for(const r of reserves){
          if(sens>0 && r.x0>=e.cx) xb=Math.min(xb,r.x0-ecart);
          if(sens<0 && r.x1<=e.cx) xa=Math.max(xa,r.x1+ecart);
        }
        // le texte d'état de l'entité (« MICRO COUPÉ »…) reste lisible : l'objet s'en écarte tant qu'il garde de la place (au moins 1,2 × la taille minimale)
        const tx=o.texte;
        if(tx){
          if(sens>0 && tx.x1+ecart>xa){ const na=tx.x1+ecart; xa=(xb-na>=minD*1.2)?na:Math.max(xa,xb-minD*1.2); }
          if(sens<0 && tx.x0-ecart<xb){ const nb=tx.x0-ecart; xb=(nb-xa>=minD*1.2)?nb:Math.min(xb,xa+minD*1.2); }
        }
        let l=xb-xa;
        if(l<minD){                                                  // pas assez de place : on mord un peu sur le halo de l'entité
          const recul=Math.min(minD-l,Math.max(0,e.r*(DEGAGEMENT-RECOUVREMENT_MIN)));
          if(sens>0) xa-=recul; else xb+=recul;
          l=xb-xa;
        }
        if(l<20){ const c=(xa+xb)/2; xa=c-10; xb=c+10; l=20; }
        return {cote:sens>0?'droite':'gauche',zone:{x0:xa,x1:xb,y0:haut,y1:bas},score:Math.min(l,hauteurLibre)};
      };
      const d=essai(1), g=essai(-1);
      const c=(g.score>d.score*1.08)?g:d;                             // à droite, sauf si la gauche est nettement plus dégagée
      return {mode:'cote',cote:c.cote,zone:c.zone,haut,bas};
    }
    if(Math.min(W,H)<=520){                                          // téléphone vertical : l'horizon
      return {mode:'horizon',cote:'bas',zone:{x0:-W,x1:2*W,y0:texteBas+10,y1:H*1.6},haut:texteBas+10,bas};
    }
    // tablette verticale / presque carré : au-dessus ou au-dessous de l'entité, entier (le côté où il y a le plus de place ; dessous si égalité)
    const hMin=Math.max(140,.2*H), yT=texteBas+8, yE=e.cy+e.r*DEGAGEMENT;
    const y0=(bas-yT>=hMin)?yT:Math.min(yT,Math.max(yE,bas-hMin));
    const dessous={cote:'bas',zone:{x0:m,x1:W-m,y0,y1:Math.max(bas,y0+hMin)}};
    const yH=e.cy-e.r*DEGAGEMENT;
    const dessus={cote:'haut',zone:{x0:m,x1:W-m,y0:haut,y1:Math.max(haut+hMin,yH)}};
    const score=c=>Math.min(c.zone.x1-c.zone.x0,c.zone.y1-c.zone.y0);
    const c=(score(dessus)>score(dessous)*1.2 && dessus.zone.y1<=yH+1)?dessus:dessous;
    return {mode:'vertical',cote:c.cote,zone:c.zone,haut:c.zone.y0,bas};
  }

  /* ───── lecture du DOM ───── */
  const rect=el=>{ try{ if(!el) return null; const r=el.getBoundingClientRect(); return (r.width>0||r.height>0)?r:null; }catch(e){ return null; } };
  function mesurer(){
    const W=Math.max(1,GLOBAL.innerWidth||document.documentElement.clientWidth), H=Math.max(1,GLOBAL.innerHeight||document.documentElement.clientHeight);
    const doc=GLOBAL.document;
    const re=rect(doc.getElementById('reactor'));
    const entite=re?{cx:re.left+re.width/2,cy:re.top+re.height/2,r:Math.min(re.width,re.height)*RAYON_ENTITE}:null;
    const tt=rect(doc.querySelector('.titre')), br=rect(doc.getElementById('bridgeStatus')), bt=rect(doc.getElementById('uiBouton'));
    const haut=Math.max(56,tt?tt.bottom+8:0,br&&br.top<80?br.bottom+8:0,bt&&bt.top<80?bt.bottom+8:0);
    const ba=rect(doc.getElementById('barre'));
    const bas=ba?Math.max(haut+120,ba.top-8):H-170;
    const so=rect(doc.getElementById('soustitre')), st=rect(doc.getElementById('state'));
    const texteBas=Math.max(st?st.bottom:0,so&&so.height>2?so.bottom:0,entite?entite.cy+entite.r:0);
    const reserves=[];
    doc.querySelectorAll('.pn-col .pn').forEach(p=>{ const r=rect(p); if(r && r.width>40) reserves.push({x0:r.left,x1:r.right,y0:r.top,y1:r.bottom}); });
    // étendue réelle du texte (et non du bloc, qui occupe toute la largeur)
    const reel=el=>{ try{ if(!el||!el.textContent.trim()) return null; const g=doc.createRange(); g.selectNodeContents(el); const r=g.getBoundingClientRect(); return r.width>0?r:null; }catch(e){ return null; } };
    const lignes=[reel(doc.getElementById('state')),reel(doc.getElementById('soustitre'))].filter(Boolean);
    const texte=lignes.length?{x0:Math.min(...lignes.map(r=>r.left)),x1:Math.max(...lignes.map(r=>r.right)),y0:Math.min(...lignes.map(r=>r.top)),y1:Math.max(...lignes.map(r=>r.bottom))}:null;
    return {W,H,entite,haut,bas,texteBas,reserves,texte};
  }

  /* ───── tout-en-un pour un fond (canvas qui déborde de 3 %, parallaxe incluse dans la marge) ───── */
  function cadrer(o){
    const d=o.mesure||mesurer();
    const W=o.canvasW, H=o.canvasH, dx=(W-d.W)/2, dy=(H-d.H)/2;     // le canvas commence à (-dx, -dy) de l'écran
    const cam={fov:o.cam.fov,dist:o.cam.dist,aspect:W/H};
    const parallaxe=o.parallaxe!=null?o.parallaxe:16;
    const disp=disposer(Object.assign({},d,{marge:Math.max(parallaxe+6,Math.round(Math.min(d.W,d.H)*.03))}));
    const zone={x0:disp.zone.x0+dx,x1:disp.zone.x1+dx,y0:disp.zone.y0+dy,y1:disp.zone.y1+dy};
    let r;
    if(disp.mode==='horizon') r=horizon(cam,W,H,{haut:disp.haut+dy,largeur:(o.largeurHorizon||1.8)*d.W,rayonBase:o.rayonBase,echelleMax:o.echelleMax});
    else r=ajuster(cam,W,H,zone,o.rayonBase,{echelleMax:o.echelleMax,marge:0});
    return {x:r.x,y:r.y,z:0,scale:r.scale,mode:disp.mode,cote:disp.cote,zone,boite:r.boite};
  }

  /* ───── changements d'écran : une seule écoute pour tous les fonds ───── */
  const abonnes=new Set(); let prevu=false, installe=false;
  function declencher(){
    if(prevu) return; prevu=true;
    const raf=GLOBAL.requestAnimationFrame||(f=>setTimeout(f,16));
    raf(()=>{ prevu=false; abonnes.forEach(f=>{ try{ f(); }catch(e){ console.warn('[cadrage]',e); } }); });
  }
  function installer(){
    if(installe || typeof GLOBAL.addEventListener!=='function' || !GLOBAL.document) return; installe=true;
    const apresRotation=()=>{ declencher(); setTimeout(declencher,250); setTimeout(declencher,700); };   // Android met à jour innerWidth avec retard
    GLOBAL.addEventListener('resize',declencher);
    GLOBAL.addEventListener('orientationchange',apresRotation);
    try{ GLOBAL.screen.orientation.addEventListener('change',apresRotation); }catch(e){}
    try{ GLOBAL.visualViewport.addEventListener('resize',declencher); }catch(e){}
    try{ GLOBAL.document.addEventListener('fullscreenchange',apresRotation); }catch(e){}
    const surDpr=()=>{ try{ const mq=GLOBAL.matchMedia('(resolution: '+(GLOBAL.devicePixelRatio||1)+'dppx)'); mq.addEventListener('change',()=>{ declencher(); surDpr(); },{once:true}); }catch(e){} };
    surDpr();                                                         // zoom du navigateur : le ratio de pixels change
    try{ const ro=new ResizeObserver(declencher); ['scene','reactor','soustitre','barre'].forEach(id=>{ const el=GLOBAL.document.getElementById(id); if(el) ro.observe(el); }); }catch(e){}
    try{ RayleBus.on('etat:panneaux',()=>{ setTimeout(declencher,60); setTimeout(declencher,520); }); RayleBus.on('vue:changee',()=>setTimeout(declencher,60)); }catch(e){}
  }
  function ecouter(fn){ installer(); abonnes.add(fn); return ()=>abonnes.delete(fn); }

  UI.cadrage={silhouette,ajuster,horizon,disposer,mesurer,cadrer,ecouter,projeter,versMonde,FOND_DEBORD};
})();
