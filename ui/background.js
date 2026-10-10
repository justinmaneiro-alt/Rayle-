"use strict";
/* ═════════════ FOND ANIMÉ : Ville (canvas 2D) · Globe (three.js, chargé à la demande) · Aucun ═════════════
   Toujours sombre, en faible opacité, aux couleurs du thème. Le flou vient d'une résolution réduite agrandie par le CSS
   (aucun filtre CSS, trop coûteux sur un petit processeur). Légère parallaxe à la souris (CSS transform, sans redessiner).
   En pause quand l'onglet est caché, le terminal ouvert ou les Réglages ouverts. Palier 2 (éco) : une seule image figée. */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  let cv=document.getElementById('uiFond');
  if(!cv) return;
  const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';
  let mode='aucun', palier=1, scene=null, raf=0, tPrec=0, dernier=0, aRedessiner=true, generation=0;
  let px=0, py=0, cx=0, cy=0, transfo='';

  const voile=document.createElement('div'); voile.className='ui-voile'; voile.setAttribute('aria-hidden','true');
  cv.after(voile);

  function nouveauCanvas(){   // un canvas ne change pas de type de contexte (2D ↔ WebGL) : on le remplace
    const c=document.createElement('canvas'); c.id='uiFond'; c.className=cv.className; c.setAttribute('aria-hidden','true');
    cv.replaceWith(c); cv=c; transfo='';
    return c;
  }
  const masque=()=>document.hidden || RayleBus.demander('vue')==='terminal' || document.getElementById('cfg').classList.contains('open');
  const fpsMax=()=>palier===0?30:24;

  function boucle(now){
    raf=requestAnimationFrame(boucle);
    if(!scene || masque()){ tPrec=0; return; }
    // parallaxe : on suit la souris en douceur, par une simple translation CSS
    cx+=(px-cx)*.06; cy+=(py-cy)*.06;
    const t='translate3d('+(-cx*16).toFixed(1)+'px,'+(-cy*11).toFixed(1)+'px,0)';
    if(t!==transfo){ cv.style.transform=t; transfo=t; }
    if(palier>=2 && !aRedessiner) return;                // éco : image figée
    if(now-dernier<1000/fpsMax()-2) return;
    dernier=now;
    const dt=tPrec?Math.min(.1,(now-tPrec)/1000):0; tPrec=now;
    aRedessiner=false;
    try{ scene.image(now,palier>=2?0:dt); }catch(e){ console.warn('[fond]',e); arreter(); }
  }
  function arreter(){ if(scene){ try{ scene.detruire(); }catch(e){} scene=null; } cv.classList.remove('vu'); }

  async function choisir(m){
    if(m===mode && scene) return;
    mode=m; arreter();
    const gen=++generation;
    if(m==='aucun') return;
    const c=nouveauCanvas();
    try{
      const s=m==='globe' ? await Globe(c) : Ville(c);
      if(gen!==generation){ s.detruire(); return; }   // l'utilisateur a changé d'avis pendant le chargement
      scene=s; s.taille(); aRedessiner=true;
      requestAnimationFrame(()=>c.classList.add('vu'));
    }catch(e){ console.warn('[fond] '+m+' indisponible :',e&&e.message||e); }
  }

  window.addEventListener('resize',()=>{ if(scene){ scene.taille(); aRedessiner=true; } });
  window.addEventListener('pointermove',e=>{ if(e.pointerType==='mouse'){ px=e.clientX/innerWidth-.5; py=e.clientY/innerHeight-.5; } },{passive:true});
  RayleBus.on('ui:reglages',r=>{
    const avant=palier; palier=r.palier;
    if(scene && avant!==palier){ scene.taille(); aRedessiner=true; }
    if(scene && scene.theme) scene.theme();
    aRedessiner=true;
    setTimeout(()=>{ aRedessiner=true; },1100);     // éco : une image de plus quand le fondu de thème est fini
    choisir(r.fond);
  });
  RayleBus.on('vue:changee',()=>{ aRedessiner=true; });

  /* ════════ VILLE : grille de rues vue du dessus, trafic lumineux, fenêtres qui s'allument ════════ */
  function Ville(c){
    const ctx=c.getContext('2d');
    const T=600;                                        // tuile de ville (unités du monde), répétée à l'infini
    let alea=7;
    const rnd=()=>{ alea=(alea*1664525+1013904223)>>>0; return alea/4294967296; };   // pseudo-hasard stable : la même ville à chaque fois
    function rues(){ const a=[0]; let x=0; while(true){ x+=46+rnd()*58; if(x>T-40) break; a.push(Math.round(x)); } return a; }
    const xs=rues(), ys=rues();
    const majeure=(i)=>i%3===0;
    // immeubles et fenêtres fixes
    const immeubles=[], fenetres=[], clignotantes=[];
    for(let i=0;i<xs.length;i++) for(let j=0;j<ys.length;j++){
      const x0=xs[i]+(majeure(i)?5:3), x1=(i+1<xs.length?xs[i+1]:T)-(majeure(i+1)?5:3);
      const y0=ys[j]+(majeure(j)?5:3), y1=(j+1<ys.length?ys[j+1]:T)-(majeure(j+1)?5:3);
      const nx=1+Math.floor(rnd()*3), ny=1+Math.floor(rnd()*3), w=(x1-x0)/nx, h=(y1-y0)/ny;
      for(let a=0;a<nx;a++) for(let b=0;b<ny;b++){
        if(rnd()<.08) continue;                          // une place, un parc
        const bx=x0+a*w+1.5, by=y0+b*h+1.5, bw=w-3, bh=h-3;
        immeubles.push({x:bx,y:by,w:bw,h:bh,l:.025+rnd()*.05});
        for(let k=0,n=Math.floor(bw*bh/38);k<n;k++){
          const f={x:bx+2+rnd()*(bw-4),y:by+2+rnd()*(bh-4),c:rnd()<.7?2:1,a:.25+rnd()*.45};
          const r=rnd();
          if(r<.10) fenetres.push(f);
          else if(r<.106 && clignotantes.length<60) clignotantes.push(Object.assign(f,{on:rnd()<.5,suite:rnd()*8000}));
        }
      }
    }
    // trafic : des particules qui suivent les rues
    const N=[150,80,40], vehicules=[];
    for(let k=0;k<N[0];k++){
      const vert=rnd()<.5, liste=vert?xs:ys, i=Math.floor(rnd()*liste.length);
      const maj=majeure(i);
      vehicules.push({vert,s:liste[i]+(rnd()<.5?-1:1)*(maj?2:.8),p:rnd()*T,dir:rnd()<.5?-1:1,v:(maj?34:18)+rnd()*30,c:Math.floor(rnd()*3),l:5+rnd()*9});
    }
    let tuile=null, tuileK=0, W=0, H=0, k=1, ox=0, oy=0, themeT=0, derniereTuile=0;
    const ANGLE=-.38;

    function dessinerTuile(){
      const col=UI.couleurs();
      const n=Math.max(64,Math.round(T*k));
      if(!tuile || tuile.width!==n){ tuile=document.createElement('canvas'); tuile.width=tuile.height=n; }
      const t=tuile.getContext('2d'); t.setTransform(n/T,0,0,n/T,0,0); t.clearRect(0,0,T,T);
      immeubles.forEach(b=>{ t.fillStyle='rgba(150,140,190,'+b.l.toFixed(3)+')'; t.fillRect(b.x,b.y,b.w,b.h); });
      t.lineWidth=.8;
      t.strokeStyle=UI.rgba(col[1],.10);
      t.beginPath(); xs.forEach((x,i)=>{ if(!majeure(i)){ t.moveTo(x,0); t.lineTo(x,T); } }); ys.forEach((y,i)=>{ if(!majeure(i)){ t.moveTo(0,y); t.lineTo(T,y); } }); t.stroke();
      t.lineWidth=2.2; t.strokeStyle=UI.rgba(col[1],.16);
      t.beginPath(); xs.forEach((x,i)=>{ if(majeure(i)){ t.moveTo(x,0); t.lineTo(x,T); } }); ys.forEach((y,i)=>{ if(majeure(i)){ t.moveTo(0,y); t.lineTo(T,y); } }); t.stroke();
      [col[2],col[1]].forEach((cc,ci)=>{
        t.fillStyle=UI.rgba(cc,.55);
        fenetres.forEach(f=>{ if((f.c===2)===(ci===0)){ t.globalAlpha=f.a; t.fillRect(f.x,f.y,2,2); } });
      });
      t.globalAlpha=1;
      tuileK=k; derniereTuile=performance.now();
    }
    function vue(){                                       // boîte du monde visible (la vue est tournée)
      const d=Math.hypot(W,H)/k/2+20;
      return d;
    }
    return {
      taille(){
        const r=palier===0?.6:palier===1?.45:.4;
        k=r; W=Math.round(innerWidth*1.06*r); H=Math.round(innerHeight*1.06*r);
        c.width=W; c.height=H;
        dessinerTuile();
      },
      theme(){ themeT=performance.now(); },
      image(now,dt){
        // couleurs : la tuile fixe est refaite pendant un fondu de thème, et toutes les 3 s pour la Nébuleuse
        const neb=UI.THEMES[UI.theme()]&&UI.THEMES[UI.theme()].tourne && palier<2;
        if(now-themeT<1300 ? now-derniereTuile>300 : (neb && now-derniereTuile>3000) || tuileK!==k) dessinerTuile();
        const col=UI.couleurs();
        ox=(ox+dt*5)%T; oy=(oy+dt*2.5)%T;
        ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,W,H);
        ctx.setTransform(k,0,0,k,W/2,H/2); ctx.rotate(ANGLE); ctx.translate(-ox,-oy);
        const d=vue(), x0=Math.floor((ox-d)/T)*T, x1=ox+d, y0=Math.floor((oy-d)/T)*T, y1=oy+d;
        const tuiles=[];
        for(let x=x0;x<x1;x+=T) for(let y=y0;y<y1;y+=T) tuiles.push(x,y);
        for(let i=0;i<tuiles.length;i+=2) ctx.drawImage(tuile,tuiles[i],tuiles[i+1],T,T);
        // fenêtres qui s'allument et s'éteignent
        if(palier<2){
          ctx.fillStyle=UI.rgba(col[2],.7);
          clignotantes.forEach(f=>{
            f.suite-=dt*1000;
            if(f.suite<=0){ f.on=!f.on; f.suite=(f.on?3000:1500)+Math.random()*9000; }
            if(!f.on) return;
            for(let i=0;i<tuiles.length;i+=2) ctx.fillRect(tuiles[i]+f.x-.5,tuiles[i+1]+f.y-.5,2.4,2.4);
          });
        }
        // trafic
        const n=N[palier];
        ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
        for(let cc=0;cc<3;cc++){
          ctx.strokeStyle=UI.rgba(col[cc],cc===2?.75:.6); ctx.lineWidth=cc===0?2.2:1.6;
          ctx.beginPath();
          for(let q=cc;q<n;q+=3){
            const v=vehicules[q];
            v.p=(v.p+v.dir*v.v*dt+T)%T;
            const a=v.p, b=v.p-v.dir*v.l;
            for(let i=0;i<tuiles.length;i+=2){
              const X=tuiles[i], Y=tuiles[i+1];
              if(v.vert){ ctx.moveTo(X+v.s,Y+a); ctx.lineTo(X+v.s,Y+b); }
              else{ ctx.moveTo(X+a,Y+v.s); ctx.lineTo(X+b,Y+v.s); }
            }
          }
          ctx.stroke();
        }
        ctx.globalCompositeOperation='source-over';
      },
      detruire(){ tuile=null; }
    };
  }

  /* ════════ GLOBE : points sur les continents, arcs de données entre des villes (three.js) ════════ */
  // Contours très simplifiés des continents (latitude, longitude) : juste de quoi dessiner un globe reconnaissable.
  const TERRES=[
    [[71,-156],[70,-140],[69,-115],[73,-95],[68,-82],[62,-75],[58,-62],[52,-56],[47,-53],[44,-66],[41,-70],[35,-75],[30,-81],[25,-80],[30,-84],[29,-89],[29,-95],[26,-97],[21,-97],[18,-95],[21,-87],[16,-88],[15,-84],[11,-84],[8,-77],[8,-80],[15,-92],[20,-105],[23,-110],[31,-114],[32,-117],[38,-123],[43,-124],[48,-125],[55,-131],[59,-139],[60,-147],[58,-153],[55,-162],[60,-165],[65,-168]],
    [[83,-35],[82,-60],[78,-72],[76,-68],[70,-54],[64,-51],[60,-44],[65,-38],[70,-22],[77,-18],[81,-12]],
    [[12,-72],[11,-64],[8,-60],[5,-52],[0,-50],[-5,-35],[-8,-35],[-13,-38],[-23,-41],[-25,-48],[-33,-52],[-38,-57],[-41,-63],[-47,-66],[-52,-69],[-55,-67],[-54,-72],[-47,-75],[-38,-73],[-30,-71],[-18,-70],[-14,-76],[-6,-81],[-1,-80],[2,-79],[7,-77],[9,-76]],
    [[37,-9],[43,-9],[44,-1],[48,-5],[51,2],[54,8],[57,8],[59,5],[62,5],[66,13],[70,20],[71,28],[69,33],[67,41],[69,55],[70,66],[73,70],[73,80],[76,100],[77,105],[73,113],[72,130],[71,140],[70,160],[69,170],[66,180],[62,180],[60,170],[55,162],[51,157],[59,150],[54,140],[47,139],[43,132],[39,128],[35,129],[34,126],[38,125],[40,121],[37,122],[31,122],[25,119],[22,114],[21,108],[17,107],[10,107],[9,105],[13,100],[7,100],[1,104],[3,101],[8,98],[16,98],[16,95],[22,92],[22,89],[20,86],[15,80],[8,77],[13,75],[19,73],[22,69],[25,66],[25,57],[27,56],[30,48],[24,51],[24,54],[22,59],[17,55],[13,45],[17,42],[21,39],[28,35],[31,32],[33,35],[36,36],[36,30],[37,27],[40,26],[38,23],[40,20],[45,13],[44,12],[41,15],[38,16],[40,18],[44,9],[43,4],[41,2],[38,0],[36,-5]],
    [[50,-5],[51,1],[53,0],[55,-2],[58,-3],[58,-6],[55,-6],[53,-4],[51,-5]],
    [[35,-6],[37,10],[33,11],[32,20],[31,30],[30,33],[22,37],[15,40],[12,43],[11,51],[2,46],[-4,40],[-10,40],[-15,41],[-20,35],[-25,33],[-34,26],[-35,20],[-29,16],[-17,12],[-12,14],[-5,12],[0,9],[4,9],[6,4],[5,-3],[5,-8],[8,-13],[12,-17],[15,-17],[21,-17],[27,-13],[31,-10]],
    [[-12,49],[-16,50],[-25,47],[-25,44],[-16,44]],
    [[-11,132],[-12,137],[-17,141],[-11,142],[-19,147],[-25,153],[-33,152],[-38,148],[-39,146],[-38,141],[-35,138],[-32,134],[-35,117],[-31,115],[-22,114],[-20,119],[-14,127]],
    [[31,130],[34,131],[36,136],[41,140],[45,142],[43,145],[40,142],[35,140],[34,135]],
    [[7,117],[1,119],[-4,116],[-3,110],[1,109]],
    [[5,95],[-6,105],[-4,102]],
    [[-1,131],[-3,141],[-10,150],[-8,143],[-6,138]]
  ];
  const VILLES=[[48.86,2.35],[43.6,1.44],[51.5,-.13],[40.71,-74.0],[34.05,-118.24],[35.68,139.69],[22.3,114.17],[1.35,103.82],[25.2,55.27],[-33.87,151.21],[-23.55,-46.63],[19.08,72.88],[55.75,37.62],[-26.2,28.05],[41.9,12.5],[37.77,-122.42]];
  function dansPoly(lat,lon,poly){
    let dedans=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const [ai,bi]=poly[i], [aj,bj]=poly[j];
      if(((ai>lat)!==(aj>lat)) && lon<(bj-bi)*(lat-ai)/(aj-ai)+bi) dedans=!dedans;
    }
    return dedans;
  }
  const terre=(lat,lon)=>lat<-72 || TERRES.some(p=>dansPoly(lat,lon,p));

  async function Globe(c){
    const THREE=await import(THREE_URL);
    const rendu=new THREE.WebGLRenderer({canvas:c,alpha:true,antialias:false,powerPreference:'low-power'});
    rendu.setClearColor(0x000000,0);
    const scene3=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(40,1,.1,100); camera.position.set(0,0,3.6);
    const groupe=new THREE.Group(); groupe.rotation.x=.38; scene3.add(groupe);
    const pivot=new THREE.Group(); groupe.add(pivot);
    const vec=(lat,lon,r)=>{ const la=lat*Math.PI/180, lo=lon*Math.PI/180; return new THREE.Vector3(r*Math.cos(la)*Math.sin(lo),r*Math.sin(la),r*Math.cos(la)*Math.cos(lo)); };

    // points : spirale de Fibonacci, triés terre / mer
    const N=palier===0?9000:5200, terreP=[], merP=[];
    const phi=Math.PI*(3-Math.sqrt(5));
    for(let i=0;i<N;i++){
      const y=1-(i/(N-1))*2, lat=Math.asin(y)*180/Math.PI, lon=((phi*i*180/Math.PI)%360+540)%360-180;
      if(terre(lat,lon)){ const v=vec(lat,lon,1); terreP.push(v.x,v.y,v.z); }
      else if(i%5===0){ const v=vec(lat,lon,1); merP.push(v.x,v.y,v.z); }
    }
    const nuage=(pos,taille,op)=>{
      const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
      const m=new THREE.PointsMaterial({size:taille,transparent:true,opacity:op,depthWrite:false,blending:THREE.AdditiveBlending});
      const p=new THREE.Points(g,m); pivot.add(p); return p;
    };
    const pTerre=nuage(terreP,.016,1), pMer=nuage(merP,.007,.18);
    const villesPos=[]; VILLES.forEach(([la,lo])=>{ const v=vec(la,lo,1.005); villesPos.push(v.x,v.y,v.z); });
    const pVilles=nuage(villesPos,.035,1);
    // halo de l'atmosphère
    const atmo=new THREE.Mesh(new THREE.SphereGeometry(1.06,32,24),new THREE.MeshBasicMaterial({transparent:true,opacity:.07,side:THREE.BackSide,blending:THREE.AdditiveBlending,depthWrite:false}));
    groupe.add(atmo);
    // masque : cache les points de la face arrière
    const masqueG=new THREE.Mesh(new THREE.SphereGeometry(.985,32,24),new THREE.MeshBasicMaterial({color:0x05030a}));   // opaque : dessiné d'abord, il cache la face arrière
    pivot.add(masqueG);

    // arcs de données
    const SEG=60, arcs=[];
    function nouvelArc(){
      const a=Math.floor(Math.random()*VILLES.length); let b=Math.floor(Math.random()*VILLES.length); if(b===a) b=(a+1)%VILLES.length;
      const A=vec(VILLES[a][0],VILLES[a][1],1).normalize(), B=vec(VILLES[b][0],VILLES[b][1],1).normalize();
      const ang=A.angleTo(B), pos=new Float32Array((SEG+1)*3);
      for(let i=0;i<=SEG;i++){
        const t=i/SEG, s=Math.sin(ang);
        const p=A.clone().multiplyScalar(Math.sin((1-t)*ang)/s).add(B.clone().multiplyScalar(Math.sin(t*ang)/s));
        p.multiplyScalar(1.005+.32*(ang/Math.PI)*Math.sin(Math.PI*t));
        pos[i*3]=p.x; pos[i*3+1]=p.y; pos[i*3+2]=p.z;
      }
      const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setDrawRange(0,0);
      const m=new THREE.LineBasicMaterial({transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false});
      const l=new THREE.Line(g,m); pivot.add(l);
      arcs.push({l,g,m,age:0,c:Math.random()<.5?0:2});
    }
    let prochain=0, W=0, H=0;
    const couleur=new THREE.Color();
    const teinte=(mat,c,k)=>{ mat.color.setRGB(c[0]/255*k,c[1]/255*k,c[2]/255*k); };
    return {
      taille(){
        const r=palier===0?.75:palier===1?.55:.5;
        W=Math.round(innerWidth*1.06); H=Math.round(innerHeight*1.06);
        rendu.setPixelRatio(r); rendu.setSize(W,H,false);
        camera.aspect=W/H; camera.updateProjectionMatrix();
        // le globe se range à droite (écran large) ou en bas (écran étroit) : l'entité reste au centre, bien visible
        const large=W/H>1.15;
        groupe.position.set(large?1.05*Math.min(1.7,W/H):0,large?-.05:-.9,0);
        groupe.scale.setScalar(large?.78:.72);
      },
      image(now,dt){
        const col=UI.couleurs();
        teinte(pTerre.material,col[1],1); teinte(pMer.material,col[3],1); teinte(pVilles.material,col[2],1); teinte(atmo.material,col[0],1);
        pivot.rotation.y+=dt*.06;
        if(dt>0){
          prochain-=dt;
          if(prochain<=0 && arcs.length<(palier===0?7:4)){ nouvelArc(); prochain=.7+Math.random()*1.2; }
        }else if(!arcs.length){ for(let i=0;i<4;i++){ nouvelArc(); arcs[i].age=.9; } }
        for(let i=arcs.length-1;i>=0;i--){
          const a=arcs[i]; a.age+=dt;
          const monte=Math.min(1,a.age/1.3), descend=Math.max(0,(a.age-2.1)/1.1);
          const debut=Math.floor(descend*SEG), fin=Math.floor(monte*SEG)+1;
          a.g.setDrawRange(debut,Math.max(0,fin-debut));
          teinte(a.m,col[a.c],1);
          if(descend>=1){ pivot.remove(a.l); a.g.dispose(); a.m.dispose(); arcs.splice(i,1); }
        }
        rendu.render(scene3,camera);
      },
      detruire(){
        arcs.forEach(a=>{ a.g.dispose(); a.m.dispose(); });
        scene3.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); });
        rendu.dispose(); try{ rendu.forceContextLoss(); }catch(e){}
      }
    };
  }

  raf=requestAnimationFrame(boucle);
  try{ const r=UI.reglages&&UI.reglages(); if(r){ palier=r.palier; choisir(r.fond); } }catch(e){}
})();
