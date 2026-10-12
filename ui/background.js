"use strict";
/* ═════════════ FOND ANIMÉ : chef d'orchestre ═════════════
   Fonds (Réglages → Fond) : Aucun · Espace (ui/fond-globe.js + ui/fond-espace.js, l'ancien Globe) · Jarvis (ui/fond-jarvis.js : interface holographique) · Ville réelle (ui/fond-video.js).
   - Rendu : 3D (three.js, chargé à la demande) ; en Éco, Espace et Jarvis deviennent une IMAGE FIXE pré-rendue (three.js n'est même
     pas chargé) ; la Ville réelle reste une vidéo, en 720p en Éco et sur téléphone/tablette.
   - Qualité automatique (niveau Auto) : si les images/s chutent avec un fond 3D, c'est le FOND qui baisse d'abord (qualité 0 → 1 → 2),
     et l'entité (Sphère ou Neurones) est retenue pendant ce temps (Entite.geler) ; quand le fond est au minimum, l'entité peut s'alléger.
   - Lisibilité : vignette sombre au centre et sur les bords (.ui-voile), teinte du thème sur l'image fixe et la vidéo (.ui-teinte).
   - Cadrage : chaque fond 3D place son objet principal avec ui/cadrage.js (toujours entier, sur un côté dégagé), recalculé à chaque changement
     d'écran (resize, rotation, zoom, panneaux) via UI.cadrage.ecouter.
   - Pause quand l'onglet est caché, le terminal ou les Réglages ouverts. Légère parallaxe à la souris (translation CSS, rien à redessiner). */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  let cv=document.getElementById('uiFond');
  if(!cv) return;
  const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';
  UI.three=()=>import(THREE_URL);     // three.js, chargé une seule fois et seulement si besoin (fonds 3D, entité Neurones)
  const BASE=(()=>{ try{ return new URL('ui/assets/',document.baseURI).href; }catch(e){ return 'ui/assets/'; } })();
  // images fixes du mode Éco : la ville est une image ; l'Espace est un ciel pré-rendu (étoiles, Voie lactée, Soleil, Lune ; une image en portrait, une en paysage)
  // + la Terre pré-rendue (sprite), posée par le même cadrage que la 3D (ui/cadrage.js, placement « centre ») : toujours entière, quel que soit l'écran.
  // La Terre pré-rendue occupe SPRITE_PLANETE de la largeur de son image (atmosphère comprise).
  const FIXES={espace:()=>'fond-espace-'+(innerHeight>innerWidth?'portrait':'paysage')+'.webp',jarvis:()=>'fond-jarvis-'+(innerHeight>innerWidth?'portrait':'paysage')+'.webp'};
  const PLANETE='fond-globe-planete.webp', SPRITE_PLANETE=.92, COEUR='fond-jarvis-coeur.webp';   // sprites posés au centre : la Terre (Espace) ou le cœur holographique (Jarvis)
  let planete=null;
  const mobile=()=>{ try{ return !!UI.reglages().mobile; }catch(e){ return false; } };

  const fixe=document.createElement('div'); fixe.className='ui-fond-fixe'; fixe.setAttribute('aria-hidden','true');
  const boiteVideo=document.createElement('div'); boiteVideo.className='ui-fond-video'; boiteVideo.setAttribute('aria-hidden','true');
  const teinte=document.createElement('div'); teinte.className='ui-teinte'; teinte.setAttribute('aria-hidden','true');
  const voile=document.createElement('div'); voile.className='ui-voile'; voile.setAttribute('aria-hidden','true');
  cv.after(fixe,boiteVideo,teinte,voile);

  let fond='aucun', palier=1, anim='auto', cle='', scene=null, rendu='aucun', q=1, gen=0;
  let tPrec=0, dernier=0, aRedessiner=true, px=0, py=0, cx=0, cy=0, transfo='', videoEnPause=false;
  let ema=16.7, nMes=0, tMes=0, tEval=0;

  function nouveauCanvas(){   // un canvas ne change pas de type de contexte : on le remplace à chaque fond 3D
    const c=document.createElement('canvas'); c.id='uiFond'; c.className='ui-fond'; c.setAttribute('aria-hidden','true');
    cv.replaceWith(c); cv=c; transfo='';
    return c;
  }
  const masque=()=>document.hidden || ['terminal','anatomie'].includes(RayleBus.demander('vue')) || document.getElementById('cfg').classList.contains('open');
  const fpsMax=()=>q===0?30:24;
  const actif=()=>rendu==='3d'?cv:rendu==='fixe'?fixe:rendu==='video'?boiteVideo:null;

  function boucle(now){
    requestAnimationFrame(boucle);
    const cache=masque();
    if(rendu==='video' && scene && cache!==videoEnPause){ videoEnPause=cache; scene.pause(cache); }
    if(cache || rendu==='aucun'){ tPrec=0; tMes=0; return; }
    // parallaxe
    cx+=(px-cx)*.06; cy+=(py-cy)*.06;
    const t='translate3d('+(-cx*16).toFixed(1)+'px,'+(-cy*11).toFixed(1)+'px,0)';
    const el=actif();
    if(el && t!==transfo){ el.style.transform=t; transfo=t; }
    if(rendu!=='3d' || !scene) return;
    mesurer(now);
    if(now-dernier<1000/fpsMax()-2 && !aRedessiner) return;
    dernier=now;
    const dt=tPrec?Math.min(.1,(now-tPrec)/1000):0; tPrec=now;
    aRedessiner=false;
    try{ scene.image(now,dt); }catch(e){ console.warn('[fond]',e); arreter(); }
  }
  // Auto : le fond s'allège d'abord, l'entité attend son tour
  function mesurer(now){
    if(tMes){ const d=Math.min(250,now-tMes); ema+=(d-ema)*.05; nMes++; }
    tMes=now;
    if(anim!=='auto' || nMes<20 || now-tEval<2500) return;
    tEval=now; nMes=0;
    if(ema>40 && q<2){
      q++; ema=16.7;
      try{ scene.qualite(q); }catch(e){}
      try{ Entite.geler && Entite.geler(9000); }catch(e){}
    }
  }
  function arreter(){
    if(scene){ try{ scene.detruire(); }catch(e){} scene=null; }
    cv.classList.remove('vu'); fixe.classList.remove('vu'); boiteVideo.classList.remove('vu'); teinte.classList.remove('vu');
    videoEnPause=false;
  }
  function placerPlanete(){
    if(!planete) return;
    if(fond==='jarvis'){                                                // cœur pré-rendu : même calcul que le fond 3D (UI.fondsReels.jarvisNoyau)
      try{
        const n=UI.fondsReels.jarvisNoyau(), d=2*n.R*.99/SPRITE_PLANETE, dx=(Math.round(innerWidth*1.06)-innerWidth)/2, dy=(Math.round(innerHeight*1.06)-innerHeight)/2;
        planete.style.cssText='left:'+(n.cx+dx-d/2).toFixed(1)+'px;top:'+(n.cy+dy-d/2).toFixed(1)+'px;width:'+d.toFixed(1)+'px;height:'+d.toFixed(1)+'px;background-image:url("'+BASE+COEUR+'")';
      }catch(e){}
      return;
    }
    const g=UI.fondsReels&&UI.fondsReels.espaceCadrage; if(!g||!UI.cadrage) return;
    try{
      const W=Math.round(innerWidth*1.06), H=Math.round(innerHeight*1.06);
      const c=UI.cadrage.cadrer({cam:{fov:g.fov,dist:g.dist},rayonBase:g.rayon,echelleMax:g.echelleMax,canvasW:W,canvasH:H,parallaxe:16,placement:g.placement}), b=c.boite;
      const d=(b.x1-b.x0)/SPRITE_PLANETE, cx=(b.x0+b.x1)/2, cy=(b.y0+b.y1)/2;
      planete.style.cssText='left:'+(cx-d/2).toFixed(1)+'px;top:'+(cy-d/2).toFixed(1)+'px;width:'+d.toFixed(1)+'px;height:'+d.toFixed(1)+'px;background-image:url("'+BASE+PLANETE+'")';
    }catch(e){}
  }
  function montrerFixe(nom){
    fixe.style.backgroundImage='url("'+BASE+FIXES[nom]()+'")';
    if(nom==='espace'||nom==='jarvis'){ if(!planete){ planete=document.createElement('div'); planete.className='ui-fond-planete'; fixe.appendChild(planete); } placerPlanete(); }
    else if(planete){ planete.remove(); planete=null; }
    rendu='fixe'; transfo='';
    requestAnimationFrame(()=>{ fixe.classList.add('vu'); teinte.classList.add('vu'); });
  }
  let videoSignalee=false;
  async function appliquer(){
    const r=fond==='aucun'?'aucun' : fond==='video'?'video' : palier>=2?'fixe':'3d';
    const hd=anim==='max';
    const k=fond+':'+r+(fond==='espace'&&r==='3d'&&hd?':hd':'')+(fond==='video'?(innerHeight>innerWidth?':portrait':':paysage'):'');   // vidéo : version selon l'orientation de l'écran
    if(k===cle) return;
    cle=k; arreter(); rendu='aucun';
    const g=++gen;
    if(r==='aucun') return;
    if(r==='fixe'){ montrerFixe(fond); return; }
    try{
      if(r==='video'){
        const s=await UI.fondsReels.video(boiteVideo,{leger:palier>=2||mobile()});
        if(g!==gen){ s.detruire(); return; }
        scene=s; rendu='video'; transfo='';
        requestAnimationFrame(()=>{ boiteVideo.classList.add('vu'); teinte.classList.add('vu'); });
        return;
      }
      q=palier===0?0:1; ema=16.7; nMes=0; tEval=performance.now();
      if(anim==='auto'){ try{ Entite.geler && Entite.geler(15000); }catch(e){} }   // pendant le chargement et les premières mesures, l'entité attend
      const c=nouveauCanvas();
      const s=await UI.fondsReels[fond](c,{q,hd});
      if(g!==gen){ s.detruire(); return; }
      scene=s; rendu='3d'; s.taille(); aRedessiner=true;
      requestAnimationFrame(()=>c.classList.add('vu'));
    }catch(e){
      if(g!==gen) return;
      console.warn('[fond] '+fond+' indisponible :',e&&e.message||e);
      if(fond==='video'){
        if(!videoSignalee){ videoSignalee=true; try{ addLine('sys','Fond « Ville réelle » : '+(e&&e.message||e)+'. En attendant, image fixe de la ville.'); }catch(_){} }
        montrerFixe('jarvis');
      }else montrerFixe(fond);            // three.js ou WebGL indisponible : l'image fixe prend le relais
    }
  }

  // écran, rotation, zoom, visualViewport, panneaux, taille de l'entité : une seule écoute (ui/cadrage.js), les fonds se recadrent en douceur
  const recadrer=()=>{ if(scene && rendu==='3d'){ scene.taille(); aRedessiner=true; } if(rendu==='fixe' && (fond==='espace'||fond==='jarvis')) montrerFixe(fond); if(fond==='video') appliquer(); };
  if(UI.cadrage) UI.cadrage.ecouter(recadrer); else window.addEventListener('resize',recadrer);
  window.addEventListener('pointermove',e=>{ if(e.pointerType==='mouse'){ px=e.clientX/innerWidth-.5; py=e.clientY/innerHeight-.5; } },{passive:true});
  RayleBus.on('ui:reglages',r=>{
    const avant=palier;
    fond=r.fond; palier=r.palier; anim=r.anim;
    if(avant!==palier && rendu==='3d' && scene && palier<2){ q=palier===0?0:Math.max(q,1); try{ scene.qualite(q); }catch(e){} }
    aRedessiner=true;
    appliquer();
  });
  RayleBus.on('vue:changee',()=>{ aRedessiner=true; });
  UI.fondEtat=()=>({fond,rendu,q,fps:Math.round(1000/ema)});   // diagnostic (console, tests)
  UI.fondScene=()=>scene;                                         // diagnostic : le fond actif (images fixes, tests)

  requestAnimationFrame(boucle);
  try{ const r=UI.reglages&&UI.reglages(); if(r){ fond=r.fond; palier=r.palier; anim=r.anim; appliquer(); } }catch(e){}
})();
