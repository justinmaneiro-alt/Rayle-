"use strict";
/* ═════════════ TEXTURES DESSINÉES DU FOND « ESPACE » (aucun fichier à télécharger) ═════════════
   Les vraies textures des planètes et de la Lune sont des fichiers (ui/assets/espace/, chargés par ui/espace-astres.js) ; celles-ci servent de
   SECOURS (hors ligne, fichier absent) et dessinent ce qui n'a pas de photo : petites lunes, astéroïdes, Voie lactée, nébuleuses, halo du Soleil.
   Tout est dessiné au démarrage, à la demande, avec un bruit pseudo-aléatoire fixe (toujours les mêmes astres) :
   lune(w)       {albedo, hauteur} : mers sombres à leurs vraies places, milliers de cratères avec bord éclairé, rayons de Tycho
   planete(nom,w) canvas équirectangulaire : Mercure (cratères), Vénus (nuages), Mars (rouille, calottes), Jupiter (bandes, Grande Tache),
                  Saturne, Uranus, Neptune
   satellite(nom,w) canvas équirectangulaire d'une petite lune : Io, Europe, Ganymède, Callisto, Titan (vraies couleurs)
   roche(w)      {albedo, hauteur} : petit astéroïde
   anneaux(w)    Uint8Array RGBA (w × 1) : anneaux de Saturne (division de Cassini)
   ciel(w,h)     générateur progressif {etape(ms), fait(), donnees} : Voie lactée (alpha) + 3 masques de nébuleuses (R, G, B) en coordonnées
                 galactiques, cuit par petits morceaux pour ne jamais bloquer l'affichage
   disque(), anneauFlare(), hexagone(), rayons() : petites images pour le halo du Soleil et le lens-flare
   Tailles réduites en palier q1 (voir fond-espace.js). */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  const PI=Math.PI, TAU=2*Math.PI;
  const clamp=(x,a,b)=>x<a?a:x>b?b:x;
  const mixc=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
  const lisse=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
  function rng(seed){ let s=seed>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }

  // bruit de valeur 2D, périodique en x (la texture se raccorde à son bord) ; fbm : plusieurs octaves
  function bruit(seed){
    const R=rng(seed), T=new Float32Array(256*256); for(let i=0;i<T.length;i++) T[i]=R();
    function v(x,y,px){
      const xi=Math.floor(x), yi=Math.floor(y), fx=x-xi, fy=y-yi, sx=fx*fx*(3-2*fx), sy=fy*fy*(3-2*fy);
      const x0=((xi%px)+px)%px, x1=(x0+1)%px, y0=yi&255, y1=(yi+1)&255;
      const a=T[(y0<<8)|x0], b=T[(y0<<8)|x1], c=T[(y1<<8)|x0], d=T[(y1<<8)|x1];
      return a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy;
    }
    // u, v dans [0,1) ; fx = nombre de motifs en largeur (entier ≤ 16)
    return (u,w,fx,fy,oct)=>{ let s=0,amp=.5,tot=0,px=fx,f=1; for(let o=0;o<oct;o++){ s+=amp*v(u*fx*f,w*fy*f,px*f); tot+=amp; amp*=.5; f*=2; } return s/tot; };
  }
  const toile=(w,h)=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; };
  // peint chaque pixel avec f(u,v) → [r,g,b] (0..255)
  function peindre(w,h,f){
    const c=toile(w,h), g=c.getContext('2d'), im=g.createImageData(w,h), d=im.data;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const p=f((x+.5)/w,(y+.5)/h), i=(y*w+x)*4; d[i]=p[0]; d[i+1]=p[1]; d[i+2]=p[2]; d[i+3]=255; }
    g.putImageData(im,0,0); return c;
  }
  // cratères : disque creux, bord éclairé (hauteur) ; n cratères de rayon (px) log-uniforme
  function cratereHauteur(g,w,h,n,rmin,rmax,R,f){
    f=f==null?.6:f;
    for(let i=0;i<n;i++){
      const x=R()*w, y=R()*h, r=rmin*Math.pow(rmax/rmin,Math.pow(R(),2.2)), cos=Math.max(.25,Math.cos((y/h-.5)*PI));
      const rx=r/cos;                                            // l'équirectangulaire étire les cratères près des pôles : on compense
      g.save(); g.translate(x,y); g.scale(rx/r,1);
      const gr=g.createRadialGradient(0,0,0,0,0,r);
      gr.addColorStop(0,'rgba(0,0,0,'+.55*f+')'); gr.addColorStop(.62,'rgba(0,0,0,'+.30*f+')'); gr.addColorStop(.80,'rgba(255,255,255,'+.55*f+')'); gr.addColorStop(.93,'rgba(255,255,255,'+.18*f+')'); gr.addColorStop(1,'rgba(128,128,128,0)');
      g.fillStyle=gr; g.beginPath(); g.arc(0,0,r,0,TAU); g.fill(); g.restore();
    }
  }

  /* ───── Lune ───── */
  // mers (latitude, longitude, rayon en degrés) : Imbrium, Serenitatis, Tranquillitatis, Crisium, Nubium, Humorum, Frigoris, Procellarum…
  const MERS=[[33,-17,16],[28,18,11],[8,31,13],[17,59,8],[-21,-16,11],[-24,-39,6],[58,-2,9],[18,-55,22],[3,-5,6],[-1,8,5],[-34,-2,3],[43,28,6]];
  function lune(w){
    const h=w/2, N=bruit(7), R=rng(99);
    const albedo=peindre(w,h,(u,v)=>{
      const lon=(u-.5)*360, lat=(.5-v)*180;
      let mer=0; for(const m of MERS){ const dl=Math.min(Math.abs(lon-m[1]),360-Math.abs(lon-m[1]))*Math.cos(lat*PI/180), d=Math.hypot(dl,lat-m[0])/(m[2]*1.3); mer=Math.max(mer,Math.exp(-d*d*1.5)); }
      const f=N(u,v,6,6,5), f2=N(u+.31,v,12,12,3);
      mer*=lisse(.28,.62,f+.25*mer);                              // bord irrégulier
      const base=.60+.32*(f-.5)+.10*(f2-.5);
      const g=base*(1-.55*mer);
      return [g*255*1.0,g*255*.985,g*255*.95-mer*10];
    });
    const ga=albedo.getContext('2d');
    // rayons de Tycho (pôle sud) et quelques cratères jeunes plus clairs
    ga.strokeStyle='rgba(255,255,255,.07)'; ga.lineWidth=Math.max(1,w/900);
    const tx=(-11/360+.5)*w, ty=(.5+43/180)*h; for(let i=0;i<46;i++){ const a=R()*TAU, l=w*(.03+R()*.09); ga.beginPath(); ga.moveTo(tx,ty); ga.lineTo(tx+Math.cos(a)*l,ty+Math.sin(a)*l*.7); ga.stroke(); }
    const hauteur=toile(w,h), gh=hauteur.getContext('2d'); gh.fillStyle='rgb(128,128,128)'; gh.fillRect(0,0,w,h);
    cratereHauteur(gh,w,h,Math.round(w*.45),w/330,w/18,rng(5),.5);
    cratereHauteur(gh,w,h,Math.round(w*.14),w/170,w/45,rng(6),.55);
    return {albedo,hauteur};
  }
  function roche(w){
    const h=w/2, N=bruit(23), R=rng(41);
    const albedo=peindre(w,h,(u,v)=>{ const f=N(u,v,4,4,5), g=.30+.32*f+.10*N(u,v,12,12,2); return [g*255*1.04,g*255*.95,g*255*.86]; });
    const hauteur=toile(w,h), gh=hauteur.getContext('2d'); gh.fillStyle='rgb(128,128,128)'; gh.fillRect(0,0,w,h);
    cratereHauteur(gh,w,h,Math.round(w*.25),w/36,w/6,R);
    return {albedo,hauteur};
  }

  /* ───── planètes ───── */
  const FOND={
    mercure:(u,v,N)=>{ const f=N(u,v,6,6,5), g=.42+.30*(f-.4)+.06*N(u,v,12,12,3); return [g*255*1.0,g*255*.96,g*255*.92]; },
    venus:(u,v,N)=>{
      const lat=(v-.5)*PI, t=N(u+.15*Math.sin(lat*5),v,3,6,5), s=.5+.5*Math.sin(lat*7+4*N(u,v,4,4,4));
      return mixc([226,196,130],[250,232,190],clamp(.35+.5*t+.25*s,0,1));
    },
    mars:(u,v,N)=>{
      const lat=(v-.5)*180, f=N(u,v,5,5,5), f2=N(u,v,10,10,3);
      let c=mixc([196,108,66],[150,74,46],clamp((f-.38)*2.4,0,1));                       // plaines claires, terrains sombres
      c=mixc(c,[218,160,110],clamp((f2-.62)*3,0,1)*.7);
      const pol=lisse(76,84,Math.abs(lat)+8*(N(u,v,8,8,3)-.5));                           // calottes polaires
      return mixc(c,[244,244,248],pol);
    },
    jupiter:(u,v,N)=>{
      const lat=(.5-v)*PI, turb=N(u,v,3,10,5), bande=.5+.5*Math.sin(lat*11.5+2.3*(turb-.5)+1.4*(N(u,v,2,5,3)-.5));
      let c=mixc([150,98,66],[236,218,186],clamp(bande*1.15,0,1));
      c=mixc(c,[196,140,92],clamp(.5+.5*Math.sin(lat*23+6*turb),0,1)*.22);
      // Grande Tache rouge (≈ 22° S), avec son tourbillon
      const dx=Math.min(Math.abs(u-.31),1-Math.abs(u-.31))/.045, dy=(lat+22*PI/180)/.075, d=dx*dx+dy*dy;
      if(d<1.7){ const k=Math.exp(-d*1.4); c=mixc(c,[188,82,58],clamp(k*1.05,0,1)); }
      return c;
    },
    saturne:(u,v,N)=>{ const lat=(.5-v)*PI, b=.5+.5*Math.sin(lat*13+1.6*(N(u,v,3,8,4)-.5)); return mixc([204,178,128],[232,214,168],clamp(.25+.6*b,0,1)); },
    uranus:(u,v,N)=>{ const lat=(.5-v)*PI, b=.5+.5*Math.sin(lat*9); return mixc([140,205,214],[168,226,230],clamp(.4*b+.35*N(u,v,3,4,3),0,1)); },
    neptune:(u,v,N)=>{
      const lat=(.5-v)*PI, b=.5+.5*Math.sin(lat*10+2*(N(u,v,3,6,4)-.5));
      let c=mixc([44,82,196],[92,138,236],clamp(.25+.45*b+.3*N(u,v,5,5,4),0,1));
      const dx=Math.min(Math.abs(u-.62),1-Math.abs(u-.62))/.07, dy=(lat+18*PI/180)/.06, d=dx*dx+dy*dy;
      if(d<1.6) c=mixc(c,[24,40,120],Math.exp(-d*1.5)*.85);                                 // Grande Tache sombre
      return c;
    }
  };
  function planete(nom,w){
    const f=FOND[nom]; if(!f) return null;
    const N=bruit(nom.length*131+nom.charCodeAt(0)), c=peindre(w,w/2,(u,v)=>f(u,v,N));
    if(nom==='mercure'){ const g=c.getContext('2d'), R=rng(8); cratereHauteur(g,w,w/2,Math.round(w*.3),w/200,w/24,R,.34); }   // mêmes cratères, teintés par le dégradé gris
    return c;
  }

  /* ───── petites lunes de Jupiter et Saturne : couleur réelle + détails ───── */
  const SAT={
    Io:{base:[240,214,112],haut:[255,236,170],bas:[206,150,70],taches:[[70,36,26],.55],grain:7},
    'Europe':{base:[226,216,196],haut:[240,236,222],bas:[196,184,166],fissures:[[150,98,62],.8],grain:6},
    'Ganymède':{base:[150,138,122],haut:[184,176,160],bas:[104,94,84],craters:.5,grain:8},
    Callisto:{base:[82,74,68],haut:[120,112,102],bas:[56,50,46],craters:.9,grain:12},
    Titan:{base:[224,158,70],haut:[236,184,104],bas:[196,128,52],grain:3},
    Phobos:{base:[112,100,90],haut:[140,128,116],bas:[78,70,64],craters:1.1,grain:9},
    Deimos:{base:[128,112,98],haut:[152,138,124],bas:[92,82,72],craters:.6,grain:5},
    Encelade:{base:[238,242,246],haut:[252,252,255],bas:[214,222,230],fissures:[[150,190,220],.55],grain:4},
    'Téthys':{base:[206,204,198],haut:[226,224,218],bas:[170,168,162],craters:.7,grain:6},
    'Dioné':{base:[196,192,186],haut:[222,218,212],bas:[150,146,140],fissures:[[236,236,236],.45],craters:.5,grain:6},
    'Rhéa':{base:[190,186,178],haut:[216,212,204],bas:[146,142,134],craters:.9,grain:8},
    Miranda:{base:[170,168,164],haut:[196,194,190],bas:[124,122,118],fissures:[[110,108,104],.7],craters:.5,grain:9},
    Ariel:{base:[176,172,166],haut:[204,200,194],bas:[132,128,122],fissures:[[120,116,110],.5],craters:.5,grain:7},
    Titania:{base:[150,138,128],haut:[182,170,160],bas:[108,98,90],craters:.7,grain:8},
    'Obéron':{base:[130,118,108],haut:[164,152,142],bas:[92,84,76],craters:.9,grain:9},
    Triton:{base:[222,206,196],haut:[240,226,216],bas:[190,172,162],taches:[[120,96,92],.4],grain:6}
  };
  function satellite(nom,w){
    const d=SAT[nom]||SAT.Callisto, N=bruit(nom.length*53+nom.charCodeAt(0)), R=rng(nom.charCodeAt(1)*7);
    const c=peindre(w,w/2,(u,v)=>{
      const f=N(u,v,d.grain,d.grain,4), f2=N(u+.3,v,d.grain*2,d.grain*2,3), t=clamp(.5+(f-.5)*1.6,0,1);
      let col=t<.5?mixc(d.bas,d.base,t*2):mixc(d.base,d.haut,(t-.5)*2);
      if(d.taches){ const k=lisse(.62,.78,f2)*d.taches[1]; col=mixc(col,d.taches[0],k); }
      if(d.fissures){ const l=Math.abs(Math.sin((u*9+f*2.4)*PI)*Math.sin((v*7-f2*1.7)*PI)); col=mixc(col,d.fissures[0],lisse(.88,1,l)*d.fissures[1]); }
      return col;
    });
    if(d.craters){ const g=c.getContext('2d'); for(let i=0;i<Math.round(w*.22*d.craters);i++){ const x=R()*w, y=R()*w/2, r=w/260+Math.pow(R(),3)*w/38; const k=g.createRadialGradient(x,y,0,x,y,r); k.addColorStop(0,'rgba(0,0,0,.38)'); k.addColorStop(.7,'rgba(0,0,0,.18)'); k.addColorStop(.86,'rgba(255,255,255,.25)'); k.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=k; g.beginPath(); g.arc(x,y,r,0,TAU); g.fill(); } }
    return c;
  }

  /* ───── anneaux de Saturne : profil radial (interne → externe) en RGBA ───── */
  function anneaux(w){
    const d=new Uint8Array(w*4), N=bruit(77);
    for(let i=0;i<w;i++){
      const t=(i+.5)/w, r=1.17+t*(2.36-1.17);                      // rayon en rayons de Saturne (mêmes bornes que la vraie texture : AST.RING) : C 1,24–1,53 · B 1,53–1,95 · Cassini 1,95–2,03 · A 2,03–2,27
      let a=0;
      if(r<1.52) a=.16+.10*N(t,.5,16,1,3);                          // anneau C, faible
      else if(r<1.95) a=.72+.25*N(t*3,.3,16,1,4);                   // anneau B, dense
      else if(r<2.03) a=.04;                                        // division de Cassini
      else if(r<2.27) a=.50+.22*N(t*5,.7,16,1,3);                   // anneau A
      else a=.06;
      if(r>2.21&&r<2.225) a*=.25;                                   // division d'Encke
      a*=lisse(0,.025,t)*lisse(1,.96,t);
      const g=clamp(.62+.30*N(t*7,.9,16,1,3),0,1);
      d[i*4]=Math.round(232*g+14); d[i*4+1]=Math.round(214*g+12); d[i*4+2]=Math.round(178*g+10); d[i*4+3]=Math.round(clamp(a,0,1)*255);
    }
    return d;
  }

  /* ───── ciel profond, cuit progressivement : Voie lactée (A) + trois nébuleuses (R, V, B), en coordonnées galactiques ───── */
  function ciel(w,h){
    const donnees=new Uint8Array(w*h*4), N=bruit(1234), M=bruit(4321), C=bruit(5678);
    const NEB=[[78,8,15],[212,-14,12],[302,15,17]];                // (longitude, latitude, rayon en degrés) des trois nébuleuses
    let y=0;
    function ligne(y){
      const v=(y+.5)/h, b=(.5-v)*180;
      for(let x=0;x<w;x++){
        const u=(x+.5)/w, l=(u-.5)*360, i=(y*w+x)*4;
        const bulbe=.55+.75*Math.exp(-Math.pow(Math.min(Math.abs(l),360-Math.abs(l))/48,2));
        const bande=Math.exp(-Math.pow(b/(13+6*bulbe*.5),2));
        const grain=.55+.9*(N(u,v,6,6,5)-.35);
        let mw=bande*bulbe*clamp(grain,0,1.6);
        const rift=lisse(.50,.70,M(u,v,5,12,4))*Math.exp(-Math.pow(b/7,2));          // bandes de poussière sombres
        mw*=(1-.65*rift);
        mw+=.10*Math.exp(-Math.pow(b/36,2))*(.4+C(u,v,4,4,3));                        // halo diffus
        const out=[0,0,0];
        for(let k=0;k<3;k++){
          const dl=Math.min(Math.abs(l-NEB[k][0]),360-Math.abs(l-NEB[k][0]))*Math.cos(b*PI/180), d=Math.hypot(dl,b-NEB[k][1])/NEB[k][2];
          const f=lisse(.36,.66,1.15*C(u+k*.21,v,7,7,5)+.42*(1-d)-.08);
          out[k]=Math.exp(-d*d*1.8)*f;
        }
        donnees[i]=Math.round(clamp(out[0],0,1)*255); donnees[i+1]=Math.round(clamp(out[1],0,1)*255); donnees[i+2]=Math.round(clamp(out[2],0,1)*255);
        donnees[i+3]=Math.round(clamp(mw,0,1)*255);
      }
    }
    return {donnees,w,h,
      fait:()=>y>=h,
      etape(ms){ const t0=performance.now(); while(y<h && performance.now()-t0<ms){ ligne(y); y++; } return y/h; }};
  }

  /* ───── petites images : halo du Soleil, lens-flare, étoiles, lueurs ───── */
  function dessin(n,fn){ const c=toile(n,n), g=c.getContext('2d'); fn(g,n); return c; }
  const disque=(n=256)=>dessin(n,(g,n)=>{ const r=n/2, gr=g.createRadialGradient(r,r,0,r,r,r); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.12,'rgba(255,255,255,.55)'); gr.addColorStop(.35,'rgba(255,255,255,.16)'); gr.addColorStop(.7,'rgba(255,255,255,.04)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,n,n); });
  const noyau=(n=128)=>dessin(n,(g,n)=>{ const r=n/2, gr=g.createRadialGradient(r,r,0,r,r,r); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.35,'rgba(255,255,255,.95)'); gr.addColorStop(.55,'rgba(255,246,225,.45)'); gr.addColorStop(1,'rgba(255,240,210,0)'); g.fillStyle=gr; g.fillRect(0,0,n,n); });
  const anneauFlare=(n=256)=>dessin(n,(g,n)=>{ const r=n/2, gr=g.createRadialGradient(r,r,r*.62,r,r,r*.98); gr.addColorStop(0,'rgba(255,255,255,0)'); gr.addColorStop(.55,'rgba(255,255,255,.55)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,n,n); });
  const hexagone=(n=128)=>dessin(n,(g,n)=>{ const r=n*.42; g.translate(n/2,n/2); g.beginPath(); for(let i=0;i<6;i++){ const a=i*PI/3+PI/6; g.lineTo(Math.cos(a)*r,Math.sin(a)*r); } g.closePath(); const gr=g.createRadialGradient(0,0,0,0,0,r); gr.addColorStop(0,'rgba(255,255,255,.10)'); gr.addColorStop(.8,'rgba(255,255,255,.28)'); gr.addColorStop(1,'rgba(255,255,255,.04)'); g.fillStyle=gr; g.fill(); });
  const rayons=(n=256)=>dessin(n,(g,n)=>{ g.translate(n/2,n/2); for(let i=0;i<12;i++){ g.rotate(PI/6); const gr=g.createLinearGradient(0,0,n/2,0); gr.addColorStop(0,'rgba(255,255,255,.55)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.beginPath(); g.moveTo(0,-1.5-(i%2)*1.5); g.lineTo(n/2*(i%3===0?1:.65),0); g.lineTo(0,1.5+(i%2)*1.5); g.fill(); } });
  const streak=(w=256,h=16)=>{ const c=toile(w,h), g=c.getContext('2d'), gr=g.createLinearGradient(0,0,w,0); gr.addColorStop(0,'rgba(180,200,255,0)'); gr.addColorStop(.5,'rgba(255,255,255,.9)'); gr.addColorStop(1,'rgba(180,200,255,0)'); g.fillStyle=gr; g.fillRect(0,h*.4,w,h*.2); const v=g.createLinearGradient(0,0,0,h); v.addColorStop(0,'rgba(0,0,0,1)'); v.addColorStop(.5,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(0,0,0,1)'); g.globalCompositeOperation='destination-out'; g.fillStyle=v; g.fillRect(0,0,w,h); return c; };

  UI.espaceTex={lune,roche,planete,satellite,anneaux,ciel,disque,noyau,anneauFlare,hexagone,rayons,streak,bruit,rng};
})();
