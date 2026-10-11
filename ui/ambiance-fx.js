"use strict";
/* ═════════════ EFFETS D'AMBIANCE SUR L'INTERFACE 2D (voile jour/nuit, pluie, neige, brouillard, éclairs, vent) ═════════════
   Se branche sur RayleUI.ambiance (ui/ambiance.js) : à chaque image on lit les valeurs LISSÉES (transitions de plusieurs secondes).
   - Voile : nuit bleutée, lueur chaude à l'aube et au crépuscule, léger voile gris sous les nuages, lumière douce le jour (variables CSS, ui.css).
   - Pluie, neige, brouillard : un seul canvas 2D, derrière l'entité et les panneaux (jamais devant le texte), aux couleurs du thème.
     Le vent incline la pluie, fait dériver la neige et le brouillard ; l'entité fait dériver ses poussières (ui/entity.js).
   - Éclairs d'orage : discrets (halo bref à l'écran, jamais plus d'un toutes les 6 s, jamais avec « réduire les animations »).
   Paliers (RayleUI.reglages().palier) : 0 complet (30 images/s) · 1 allégé (moitié moins de gouttes, 20 images/s, canvas réduit)
     · 2 éco (image fixe : le voile et une image figée de pluie/neige/brouillard, redessinée au plus 2 fois par seconde pendant un fondu).
   Respect : « réduire les animations » du système ou batterie faible sur mobile → palier 2 ; pause quand l'onglet est caché, le terminal
   ou les Réglages sont ouverts. Intensité réglable (Réglages → Ambiance). Pour que votre fond ou skin réagisse aussi :
   RayleBus.on('ambiance', …) ou RayleUI.ambiance.lisse() (voir l'en-tête de ui/ambiance.js). */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  const A=UI.ambiance;
  if(!A || !document.body) return;

  const wrap=document.createElement('div'); wrap.className='ui-amb'; wrap.setAttribute('aria-hidden','true');
  const voile=document.createElement('div'); voile.className='ui-amb-voile';
  const cv=document.createElement('canvas'); cv.className='ui-amb-cv';
  const flash=document.createElement('div'); flash.className='ui-amb-flash';
  wrap.append(voile,cv,flash);
  const apres=document.querySelector('.ui-voile');
  if(apres) apres.after(wrap); else document.body.prepend(wrap);
  const ctx=cv.getContext('2d');

  let palier=1, mobile=false, batterieFaible=false;
  const reduit=()=>{ try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } };
  RayleBus.on('ui:reglages',r=>{ palier=r.palier; mobile=r.mobile; });
  try{ const r=UI.reglages(); palier=r.palier; mobile=r.mobile; }catch(e){}
  try{ if(navigator.getBattery) navigator.getBattery().then(b=>{ const m=()=>{ batterieFaible=!b.charging && b.level<.2; }; m(); b.addEventListener('levelchange',m); b.addEventListener('chargingchange',m); }).catch(()=>{}); }catch(e){}

  const masque=()=>document.hidden || RayleBus.demander('vue')==='terminal' || document.getElementById('cfg').classList.contains('open');
  // niveau d'effet : 0 complet · 1 allégé · 2 image fixe
  function niveau(){
    const rg=A.reglages();
    let p=palier;
    if(reduit()) p=rg.respectReduit?2:Math.min(p,1);        // sinon : au plus allégé
    if(mobile && batterieFaible) p=Math.max(p,2);
    return Math.max(0,Math.min(2,p));
  }

  /* ───── particules (tableaux fixes, aucune allocation par image) ───── */
  let g=7; const rnd=()=>{ g=(g*1664525+1013904223)>>>0; return g/4294967296; };
  const MAX_PLUIE=340, MAX_NEIGE=300, MAX_BRUME=6;
  const pluie=[], neige=[], brume=[];
  for(let i=0;i<MAX_PLUIE;i++) pluie.push({x:rnd(),y:rnd(),v:.8+rnd()*.6,l:.6+rnd()*.7,a:.5+rnd()*.5});
  for(let i=0;i<MAX_NEIGE;i++) neige.push({x:rnd(),y:rnd(),v:.5+rnd()*.9,r:.55+rnd()*1.25,ph:rnd()*6.28});
  for(let i=0;i<MAX_BRUME;i++) brume.push({x:rnd(),y:.15+rnd()*.7,r:.35+rnd()*.35,v:.4+rnd()*.8});

  let W=1,H=1,echelle=1,niv=0;
  function taille(){
    niv=niveau(); echelle=niv===0?1:.6;
    W=Math.max(2,Math.round(innerWidth*echelle)); H=Math.max(2,Math.round(innerHeight*echelle));
    if(cv.width!==W||cv.height!==H){ cv.width=W; cv.height=H; }
    sale=true;
  }
  if(UI.cadrage) UI.cadrage.ecouter(taille); else addEventListener('resize',taille);

  /* ───── dessin ───── */
  let sale=true, vide=false, dernierDessin=0, tPrec=0, tTemps=0, derniereVoile='', ventEcrit=-1;
  function majVoile(L,k){
    const nuit=(1-L.jour), s=[nuit.toFixed(3),L.chaud.toFixed(3),L.jour.toFixed(3),(L.nuages*(1-L.jour*.4)).toFixed(3),k.toFixed(2)].join('|');
    if(s===derniereVoile) return; derniereVoile=s;
    const st=wrap.style;
    st.setProperty('--amb-nuit',nuit.toFixed(3)); st.setProperty('--amb-chaud',L.chaud.toFixed(3)); st.setProperty('--amb-jour',L.jour.toFixed(3));
    st.setProperty('--amb-gris',(L.nuages).toFixed(3)); st.setProperty('--amb-k',k.toFixed(2));
    voile.classList.toggle('vu',k>0.01);
  }
  function dessiner(L,k,dt,statique){
    const c=UI.couleurs?UI.couleurs():[[255,255,255],[200,200,255],[230,230,255],[150,150,255]];
    const c2=c[2], clair=[c2[0]*.4+215*.6,c2[1]*.4+225*.6,c2[2]*.4+250*.6], vx=-Math.sin(L.ventDir*Math.PI/180)*L.vent;       // vent : -1 (vers la gauche) … +1 (vers la droite)
    const nPluie=Math.round(MAX_PLUIE*Math.min(1,L.pluie*k*1.1)*(niv===0?1:.5));
    const nNeige=Math.round(MAX_NEIGE*Math.min(1,L.neige*k*1.3)*(niv===0?1:.55));
    const fog=L.brouillard*k;
    if(nPluie<1 && nNeige<1 && fog<.01){ if(!vide){ ctx.clearRect(0,0,W,H); vide=true; } return; }
    vide=false; ctx.clearRect(0,0,W,H);
    // brouillard : grandes nappes qui dérivent (dégradés radiaux), teintées par le thème
    if(fog>=.01){
      const n=niv===0?MAX_BRUME:3;
      for(let i=0;i<n;i++){
        const b=brume[i];
        if(!statique){ b.x+=dt*(.012+.05*L.vent)*b.v*(vx>=0?1:-1); if(b.x>1.5) b.x=-.5; if(b.x<-.5) b.x=1.5; }
        const r=b.r*Math.max(W,H)*1.1, x=b.x*W, y=b.y*H;
        const gr=ctx.createRadialGradient(x,y,0,x,y,r);
        gr.addColorStop(0,UI.rgba?UI.rgba(clair,.16*fog):'rgba(220,220,255,'+(.16*fog)+')'); gr.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=gr; ctx.fillRect(x-r,y-r,2*r,2*r);
      }
    }
    // pluie : traits fins inclinés par le vent
    if(nPluie>=1){
      const vit=H*1.15, tl=.028+.01*L.pluie;
      ctx.lineWidth=Math.max(1,echelle*(1+L.pluie*.4)); ctx.lineCap='round';
      const alpha=(.16+.22*L.pluie)*(.6+.4*k);
      for(let i=0;i<nPluie;i++){
        const p=pluie[i];
        if(!statique){ p.y+=dt*p.v*vit/H; p.x+=dt*vx*.35*p.v; if(p.y>1.05){ p.y=-.05-rnd()*.1; p.x=rnd()*1.3-.15; } if(p.x>1.1) p.x-=1.2; if(p.x<-.1) p.x+=1.2; }
        const x=p.x*W, y=p.y*H, dx=vx*.35*p.v*W*tl, dy=p.v*vit*tl*p.l;
        ctx.strokeStyle=UI.rgba?UI.rgba(clair,alpha*p.a):'rgba(200,210,255,'+(alpha*p.a)+')';
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-dx*p.l,y-dy); ctx.stroke();
      }
    }
    // neige : flocons qui se balancent, portés par le vent
    if(nNeige>=1){
      const base=UI.rgba?UI.rgba([255,255,255],1):'';
      for(let i=0;i<nNeige;i++){
        const f=neige[i];
        if(!statique){ f.y+=dt*f.v*.07; f.x+=dt*(Math.sin(tTemps*.7+f.ph)*.012+vx*.05*f.v); if(f.y>1.03){ f.y=-.03; f.x=rnd(); } if(f.x>1.03) f.x-=1.06; if(f.x<-.03) f.x+=1.06; }
        const a=(.35+.35*L.neige)*(.55+.45*k), r=f.r*echelle;
        ctx.fillStyle='rgba(245,245,255,'+(a*(.5+.5*f.v/1.4)).toFixed(3)+')';
        if(r<1.6) ctx.fillRect(f.x*W,f.y*H,r*1.6,r*1.6); else{ ctx.beginPath(); ctx.arc(f.x*W,f.y*H,r,0,6.2832); ctx.fill(); }
      }
    }
  }

  /* ───── éclairs ───── */
  let prochainEclair=0, tFlash=[];
  function eclair(k){
    flash.style.opacity=String(.2*k);
    tFlash.forEach(clearTimeout); tFlash=[
      setTimeout(()=>{ flash.style.opacity='0.02'; },70),
      setTimeout(()=>{ flash.style.opacity=String(.13*k); },150),
      setTimeout(()=>{ flash.style.opacity='0'; },260)];
  }

  /* ───── boucle ───── */
  let visible=false;
  function boucle(now){
    requestAnimationFrame(boucle);
    const rg=A.reglages();
    if(masque() || rg.mode==='off'){
      tPrec=0;
      if(visible){ wrap.classList.remove('vu'); visible=false; ctx.clearRect(0,0,W,H); vide=true; derniereVoile=''; }
      return;
    }
    if(!visible){ wrap.classList.add('vu'); visible=true; sale=true; }
    const n=niveau(); if(n!==niv){ taille(); }
    const dt=tPrec?Math.min(.1,(now-tPrec)/1000):0; tPrec=now; tTemps+=dt;
    const L=A.avancer(dt), k=rg.fx/100;
    majVoile(L,k);
    const vv=Math.round(L.vent*20); if(vv!==ventEcrit){ ventEcrit=vv; document.documentElement.style.setProperty('--amb-vent',(L.vent).toFixed(2)); }
    if(niv===2){                                                     // image fixe : redessinée seulement pendant un fondu (au plus 2 fois par seconde)
      if(sale || now-dernierDessin>500 && (Math.abs(L.pluie-lp)+Math.abs(L.neige-ln)+Math.abs(L.brouillard-lb)>.02)){ dessiner(L,k,0,true); dernierDessin=now; sale=false; lp=L.pluie; ln=L.neige; lb=L.brouillard; }
    }else{
      const fps=niv===0?30:20;
      if(now-dernierDessin>=1000/fps-2){ const d=Math.min(.1,(now-dernierDessin)/1000); dernierDessin=now; dessiner(L,k,d,false); }
    }
    if(niv<2 && L.orage>.3 && k>.05 && !reduit()){
      if(!prochainEclair) prochainEclair=now+4000+rnd()*6000;
      if(now>=prochainEclair){ eclair(k); prochainEclair=now+(6500+rnd()*9000)/(.5+L.orage); }
    }else prochainEclair=0;
  }
  let lp=0,ln=0,lb=0;
  taille();
  requestAnimationFrame(boucle);
  UI.ambianceFx={niveau:()=>niv,compte:()=>({pluie:Math.round(MAX_PLUIE*A.lisse().pluie),neige:Math.round(MAX_NEIGE*A.lisse().neige)}),eclair:()=>eclair(A.reglages().fx/100)};
})();
