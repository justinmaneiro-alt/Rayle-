"use strict";
/* ═════════════ ENTITÉ « NUÉE » : sphère de particules vivante ═════════════
   WebGL natif (aucune bibliothèque), repli en canvas 2D si WebGL manque ou si la page rame.
   Une seule instance : son canvas se déplace entre l'écran principal et la petite Raylé du terminal.

   API (window.Entite) :
     monter(conteneur)   place le canvas dans l'élément (le déplace s'il est déjà monté ailleurs)
     etat(nom)           'idle' | 'veille' | 'listening' | 'thinking' | 'speaking' (états de setState)
     verrou(bool)        verrouillé : Worker non configuré ou code refusé
     alerte(ms)          état alerte temporaire (rouge-orangé, agité)
     amplitude(fn|null)  fn() → 0..1 : niveau audio réel, ou null si rien à mesurer (amplitude simulée selon l'état)
     qualite(q)          'auto' | 0 | 1 | 2 | 3 (3 = canvas 2D) ; mémorisé
     info()              {niveau, points, moteur, fps} */
window.Entite=(function(){
  const NIVEAUX=[
    {pts:2800,moteur:'gl',dpr:1.5,fps:60},
    {pts:1500,moteur:'gl',dpr:1.25,fps:60},
    {pts:800,moteur:'gl',dpr:1,fps:30},
    {pts:380,moteur:'2d',dpr:1,fps:30}
  ];
  const CLE_Q='rayle_entite_qualite', CLE_N='rayle_entite_niveau';
  const lire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const ecrire=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };

  // Paramètres visuels de chaque état (interpolés en douceur)
  const ETATS={
    idle:     {c:[.42,.40,.95],d:[.25,.45,1.0], respire:1.0,agite:.12,tour:.10,rayon:0.78,lum:.50,vitesse:.7,gain:0},
    veille:   {c:[.45,.42,1.0],d:[.30,.55,1.0], respire:1.0,agite:.18,tour:.14,rayon:0.81,lum:.75,vitesse:.8,gain:0},
    listening:{c:[.30,.85,1.0],d:[.55,.60,1.0], respire:1.4,agite:.35,tour:.28,rayon:0.70,lum:1.05,vitesse:1.2,gain:1.5},
    thinking: {c:[.78,.42,1.0],d:[1.0,.45,.80], respire:.6, agite:.55,tour:1.35,rayon:0.75,lum:.95,vitesse:2.4,gain:0},
    speaking: {c:[1.0,.25,.65],d:[.75,.35,1.0], respire:.8, agite:.30,tour:.22,rayon:0.78,lum:1.15,vitesse:1.5,gain:1.8},
    alerte:   {c:[1.0,.40,.08],d:[1.0,.15,.20], respire:2.4,agite:.95,tour:.55,rayon:0.81,lum:1.30,vitesse:3.2,gain:.8},
    verrouille:{c:[.50,.50,.58],d:[.35,.35,.45],respire:.4, agite:0,  tour:.04,rayon:0.60,lum:.32,vitesse:.4,gain:0}
  };
  const CLES=['respire','agite','tour','rayon','lum','vitesse','gain'];

  let hote=null, canvas=null, gl=null, ctx2=null, prog=null, tampon=null, loc={};
  let niveau=0, points=[], moteur='gl', cote=0, dpr=1;
  let etatNom='idle', verrouille=false, alerteJusqua=0, fournisseur=null;
  let courant=JSON.parse(JSON.stringify(ETATS.idle)), amp=0, ampBrute=0;
  let tPrec=0, tDebut=0, angle=0, rafId=0, dernierDessin=0, ema=16, mesures=0, derniereEval=0, fpsAff=60, ro=null;

  /* ───── points : spirale de Fibonacci sur la sphère ───── */
  function genererPoints(n){
    const a=[]; const phi=Math.PI*(3-Math.sqrt(5));
    for(let i=0;i<n;i++){
      const y=1-(i/(n-1))*2, r=Math.sqrt(1-y*y), th=phi*i;
      a.push({x:Math.cos(th)*r,y:y,z:Math.sin(th)*r,s:Math.random()});
    }
    return a;
  }

  /* ───── WebGL ───── */
  const VS=`
attribute vec3 a_p; attribute float a_s;
uniform float u_t,u_ang,u_amp,u_resp,u_agi,u_ray,u_vit,u_px;
varying float v_a; varying float v_m;
void main(){
  float n=sin(a_s*37.7+u_t*1.3*u_vit)*cos(a_s*19.1-u_t*0.9*u_vit);
  float w=sin(dot(a_p,vec3(3.1,2.3,4.7))+u_t*2.0*u_vit);
  float r=u_ray*(1.0+u_resp*0.035*sin(u_t*1.1)+u_agi*0.07*n+u_amp*(0.16*w+0.14*(0.5+0.5*n)));
  vec3 p=a_p*r;
  float c=cos(u_ang),s=sin(u_ang);
  p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);
  float ct=0.96,st=0.28;
  p=vec3(p.x,ct*p.y-st*p.z,st*p.y+ct*p.z);
  float persp=1.0/(1.0-p.z*0.30);
  gl_Position=vec4(p.xy*persp,0.0,1.0);
  float prof=0.5+0.5*p.z/max(u_ray,0.2);
  v_a=0.30+0.70*prof;
  v_m=a_s;
  gl_PointSize=u_px*(0.65+0.9*prof)*(0.8+0.5*a_s)*(1.0+u_amp*0.5);
}`;
  const FS=`
precision mediump float;
uniform vec3 u_c1,u_c2; uniform float u_lum;
varying float v_a; varying float v_m;
void main(){
  float d=length(gl_PointCoord-0.5);
  float a=smoothstep(0.5,0.0,d);
  a=pow(a,1.3);
  vec3 col=mix(u_c1,u_c2,v_m);
  float k=a*v_a*u_lum*1.7;
  gl_FragColor=vec4(col*k,k);
}`;
  function compiler(type,src){
    const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)||'shader');
    return s;
  }
  function initGL(){
    gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,powerPreference:'low-power'});
    if(!gl) throw new Error('WebGL indisponible');
    prog=gl.createProgram();
    gl.attachShader(prog,compiler(gl.VERTEX_SHADER,VS)); gl.attachShader(prog,compiler(gl.FRAGMENT_SHADER,FS));
    gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog,gl.LINK_STATUS)) throw new Error('liaison shader');
    gl.useProgram(prog);
    ['u_t','u_ang','u_amp','u_resp','u_agi','u_ray','u_vit','u_px','u_c1','u_c2','u_lum'].forEach(n=>loc[n]=gl.getUniformLocation(prog,n));
    loc.p=gl.getAttribLocation(prog,'a_p'); loc.s=gl.getAttribLocation(prog,'a_s');
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE);
  }
  function chargerPointsGL(){
    const d=new Float32Array(points.length*4);
    points.forEach((p,i)=>{ d[i*4]=p.x; d[i*4+1]=p.y; d[i*4+2]=p.z; d[i*4+3]=p.s; });
    if(tampon) gl.deleteBuffer(tampon);
    tampon=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,tampon); gl.bufferData(gl.ARRAY_BUFFER,d,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p,3,gl.FLOAT,false,16,0);
    gl.enableVertexAttribArray(loc.s); gl.vertexAttribPointer(loc.s,1,gl.FLOAT,false,16,12);
  }

  /* ───── mise en place d'un niveau (nombre de points + moteur) ───── */
  function nouveauCanvas(){
    const c=document.createElement('canvas'); c.className='entite-canvas'; c.setAttribute('aria-hidden','true');
    c.addEventListener('webglcontextlost',e=>{ e.preventDefault(); if(niveau<NIVEAUX.length-1) appliquerNiveau(NIVEAUX.length-1); },false);
    return c;
  }
  function appliquerNiveau(n){
    niveau=Math.max(0,Math.min(NIVEAUX.length-1,n));
    const cfg=NIVEAUX[niveau];
    points=genererPoints(cfg.pts);
    // un canvas ne peut pas changer de type de contexte : on en refait un
    const parent=canvas&&canvas.parentNode;
    if(canvas&&canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas=nouveauCanvas(); gl=null; ctx2=null; prog=null; tampon=null;
    moteur=cfg.moteur;
    if(moteur==='gl'){
      try{ initGL(); chargerPointsGL(); }
      catch(e){ console.warn('[entite] repli canvas 2D :',e.message); gl=null; moteur='2d'; canvas=nouveauCanvas(); points=genererPoints(NIVEAUX[3].pts); niveau=3; }
    }
    if(moteur==='2d') ctx2=canvas.getContext('2d');
    if(parent) parent.appendChild(canvas);
    dpr=Math.min(window.devicePixelRatio||1,cfg.dpr);
    redimensionner(true);
    ema=16; mesures=0; derniereEval=performance.now();
  }
  function redimensionner(force){
    if(!hote||!canvas) return;
    const w=Math.max(1,Math.round(hote.clientWidth)), h=Math.max(1,Math.round(hote.clientHeight));
    const c=Math.max(1,Math.min(w,h));
    if(!force && c===cote) return;
    cote=c;
    canvas.width=Math.round(c*dpr); canvas.height=Math.round(c*dpr);
    canvas.style.width=c+'px'; canvas.style.height=c+'px';
    if(gl) gl.viewport(0,0,canvas.width,canvas.height);
  }

  /* ───── boucle d'animation ───── */
  function cible(){
    if(verrouille) return ETATS.verrouille;
    if(performance.now()<alerteJusqua) return ETATS.alerte;
    return ETATS[etatNom]||ETATS.idle;
  }
  function ampSimulee(t){
    const e=(performance.now()<alerteJusqua)?'alerte':etatNom;
    if(e==='speaking') return .30+.40*Math.abs(Math.sin(t*7.3)*Math.sin(t*2.9+1))+.1*Math.sin(t*17);
    if(e==='listening') return .10+.12*Math.abs(Math.sin(t*3.1)*Math.sin(t*1.3));
    if(e==='alerte') return .35+.35*Math.abs(Math.sin(t*9));
    return 0;
  }
  function majParametres(dt,t){
    const k=1-Math.exp(-dt*3.5), b=cible();
    CLES.forEach(c=>{ courant[c]+=(b[c]-courant[c])*k; });
    for(let i=0;i<3;i++){ courant.c[i]+=(b.c[i]-courant.c[i])*k; courant.d[i]+=(b.d[i]-courant.d[i])*k; }
    let brute=null;
    if(fournisseur){ try{ const v=fournisseur(); if(v!=null && isFinite(v)) brute=Math.max(0,Math.min(1,+v)); }catch(e){} }
    if(brute==null) brute=ampSimulee(t);   // pas d'audio mesurable (voix du navigateur, écoute) : amplitude simulée
    ampBrute=brute*Math.max(.4,courant.gain);
    const kk=ampBrute>amp ? 1-Math.exp(-dt*28) : 1-Math.exp(-dt*7);   // attaque vive, retombée douce
    amp+=(ampBrute-amp)*kk;
    angle+=dt*courant.tour*(1+amp*1.2);
  }
  function dessinerGL(t){
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(loc.u_t,t); gl.uniform1f(loc.u_ang,angle); gl.uniform1f(loc.u_amp,amp);
    gl.uniform1f(loc.u_resp,courant.respire); gl.uniform1f(loc.u_agi,courant.agite);
    gl.uniform1f(loc.u_ray,courant.rayon); gl.uniform1f(loc.u_vit,courant.vitesse);
    gl.uniform1f(loc.u_px,Math.max(2,canvas.width/(niveau===0?72:niveau===1?62:54)));
    gl.uniform3fv(loc.u_c1,courant.c); gl.uniform3fv(loc.u_c2,courant.d); gl.uniform1f(loc.u_lum,courant.lum*(niveau>=2?1.35:1));
    gl.drawArrays(gl.POINTS,0,points.length);
  }
  function dessiner2D(t){
    const W=canvas.width, H=canvas.height, R=W/2;
    ctx2.clearRect(0,0,W,H); ctx2.globalCompositeOperation='lighter';
    const ca=Math.cos(angle), sa=Math.sin(angle);
    const c1=courant.c, c2=courant.d;
    for(let i=0;i<points.length;i++){
      const p=points[i];
      const n=Math.sin(p.s*37.7+t*1.3*courant.vitesse)*Math.cos(p.s*19.1-t*.9*courant.vitesse);
      const w=Math.sin(p.x*3.1+p.y*2.3+p.z*4.7+t*2*courant.vitesse);
      const r=courant.rayon*(1+courant.respire*.035*Math.sin(t*1.1)+courant.agite*.07*n+amp*(.16*w+.14*(.5+.5*n)));
      let x=p.x*r, y=p.y*r, z=p.z*r;
      let x2=ca*x+sa*z, z2=-sa*x+ca*z; x=x2; z=z2;
      const y2=.96*y-.28*z; z=.28*y+.96*z; y=y2;
      const persp=1/(1-z*.30), prof=.5+.5*z/Math.max(courant.rayon,.2);
      const al=Math.min(1,(.30+.70*prof)*courant.lum*1.3);
      const m=p.s;
      const cr=Math.round(255*(c1[0]+(c2[0]-c1[0])*m)), cg=Math.round(255*(c1[1]+(c2[1]-c1[1])*m)), cb=Math.round(255*(c1[2]+(c2[2]-c1[2])*m));
      const rad=Math.max(1.2,W/70*(.65+.9*prof)*(.8+.5*p.s)*(1+amp*.5));
      ctx2.fillStyle='rgba('+cr+','+cg+','+cb+','+al.toFixed(2)+')';
      ctx2.beginPath(); ctx2.arc(R+x*persp*R,R-y*persp*R,rad,0,6.2832); ctx2.fill();
    }
  }
  function evaluerPerf(now){
    if(mesures<40 || now-derniereEval<2500) return;
    derniereEval=now;
    fpsAff=Math.round(1000/ema);
    const q=lire(CLE_Q);
    if(q!=null && q!=='auto') return;                 // qualité imposée dans les réglages
    const limite=NIVEAUX[niveau].fps===30 ? 42 : 33;  // ms par image : sous 30 i/s on allège (le plafond à 30 i/s donne déjà ~33 ms)
    if(ema>limite && niveau<NIVEAUX.length-1){ appliquerNiveau(niveau+1); ecrire(CLE_N,String(niveau)); }
  }
  function boucle(now){
    rafId=requestAnimationFrame(boucle);
    if(!canvas||document.hidden) { tPrec=now; return; }
    if(!hote||!hote.offsetParent && getComputedStyle(hote).position!=='fixed'){ tPrec=now; return; }   // caché (vue terminal, etc.)
    const cfg=NIVEAUX[niveau];
    if(now-dernierDessin<1000/cfg.fps-3) return;
    dernierDessin=now;
    const dtMs=Math.min(100,now-(tPrec||now)); tPrec=now;
    const dt=dtMs/1000;
    if(dtMs>0){ ema+=(dtMs-ema)*.08; mesures++; }
    const t=(now-tDebut)/1000;
    majParametres(dt,t);
    if(gl) dessinerGL(t); else if(ctx2) dessiner2D(t);
    evaluerPerf(now);
  }

  /* ───── API ───── */
  function monter(el){
    if(!el) return;
    hote=el;
    if(!canvas){
      const q=lire(CLE_Q), n=lire(CLE_N);
      let depart;
      if(q!=null && q!=='auto' && !isNaN(+q)) depart=+q;
      else if(n!=null && !isNaN(+n)) depart=+n;
      else{
        const mobile=(window.matchMedia&&matchMedia('(pointer:coarse)').matches)||window.innerWidth<820;
        const faible=(navigator.hardwareConcurrency||4)<=4;
        depart=mobile?1:(faible?1:0);
      }
      tDebut=performance.now();
      appliquerNiveau(depart);
    }
    hote.insertBefore(canvas,hote.firstChild);
    if(ro) ro.disconnect();
    if('ResizeObserver' in window){ ro=new ResizeObserver(()=>redimensionner(false)); ro.observe(hote); }
    redimensionner(true);
    if(!rafId) rafId=requestAnimationFrame(boucle);
  }
  window.addEventListener('resize',()=>redimensionner(false));
  return {
    monter,
    etat(nom){ etatNom=ETATS[nom]?nom:'idle'; },
    verrou(b){ verrouille=!!b; },
    fixer(){ const b=cible(); CLES.forEach(c=>{ courant[c]=b[c]; }); courant.c=b.c.slice(); courant.d=b.d.slice(); },   // saute directement à l'état voulu (tests)
    alerte(ms){ alerteJusqua=performance.now()+(ms||6000); },
    amplitude(fn){ fournisseur=typeof fn==='function'?fn:null; },
    qualite(q){
      if(q==='auto'||q==null){ ecrire(CLE_Q,'auto'); try{ localStorage.removeItem(CLE_N); }catch(e){} return; }
      ecrire(CLE_Q,String(q)); if(canvas) appliquerNiveau(+q);
    },
    info(){ return {niveau:niveau,points:points.length,moteur:moteur,fps:fpsAff,amp:+amp.toFixed(2),etat:etatNom}; }
  };
})();
