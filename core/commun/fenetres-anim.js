"use strict";
/* ═════════════ ANIMATIONS DES FENÊTRES HOLOGRAPHIQUES (fenêtres de réponse, images, sécurité… : tout ce que Panneaux ouvre) ═════════════
   Observe #panneaux (aucune modification de Panneaux) et ajoute, selon le mode (body[data-hud]) :
   · ouverture en plusieurs temps : le cadre se TRACE (4 traits lumineux), le fond se déploie (hud-in), puis le contenu se RÉVÈLE ; le texte s'ÉCRIT lettre par lettre ;
   · glitch très bref à l'ouverture et à la fermeture ; scintillement (jarvis.css) ; lignes de scan ;
   · légère inclinaison 3D au survol (souris) ;
   · flottement lent ;
   · réorganisation ANIMÉE (technique FLIP) quand une fenêtre arrive ou part : les autres glissent vers leur nouvelle place ;
   · fermeture en fondu avec PARTICULES ;
   · petits sons si Justin les a activés (sons.js).
   Complet : tout ; normal ≈ 70 % (moins de particules, pas d'inclinaison forte) ; léger : cadre tracé et contenu révélé, sans glitch, particules, flottement ni inclinaison ;
   « réduire les animations » : simple fondu (jarvis.css) ; rien d'ici ne s'exécute.
   Dans un navigateur piloté par un test, les effets de texte, particules et réorganisation sont absents (comme la séquence de démarrage), sauf avec ?anim=1. */
(function(){
  const racine=document.getElementById('panneaux'); if(!racine) return;
  const corps=document.body, reduit=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):null;
  const pilote=navigator.webdriver===true&&!/[?&]anim=1/.test(location.search);
  const mode=()=>corps.dataset.hud||'normal';
  const niveau=()=>{ if(reduit&&reduit.matches||pilote) return 0; return mode()==='complet'?1:mode()==='normal'?0.7:0.3; };
  const souris=!!(window.matchMedia&&matchMedia('(hover:hover) and (pointer:fine)').matches);
  const traites=new WeakSet(), enSortie=new WeakSet();
  const rects=new Map();
  let compteurEffets=0;
  const son=n=>{ try{ window.Sons&&Sons.jouer(n); }catch(e){} };

  /* ───── cadre qui se trace ───── */
  function ajouterTrace(el){
    const t=document.createElement('i'); t.className='pn-trace'; t.setAttribute('aria-hidden','true'); t.innerHTML='<b></b><b></b><b></b><b></b>'; el.appendChild(t);
    setTimeout(()=>t.remove(),1100);
  }
  /* ───── texte qui s'écrit lettre par lettre ───── */
  function feuilles(el){
    const l=[];
    el.querySelectorAll('.pn-tete h2,.pn-corps p,.pn-corps li,.pn-corps h3,.pn-corps .pn-sous,.holo-def,.img-vide b,.img-vide small').forEach(n=>{
      if(n.children.length||n.dataset.ecrit==='non') return;
      const t=n.textContent; if(t&&t.trim().length>=3) l.push({el:n,texte:t});
    });
    return l;
  }
  function ecrire(el,debutMs){
    const liste=feuilles(el); let total=0; const retenus=[];
    for(const f of liste){ if(total+f.texte.length>520) break; retenus.push(f); total+=f.texte.length; }
    if(!retenus.length) return;
    const duree=Math.max(320,Math.min(950,total*5)), t0=performance.now()+debutMs;
    retenus.forEach(f=>{ f.el.textContent=''; f.el.setAttribute('data-ecrit-en-cours','1'); });
    let k=0; const cur='▌';
    const pas=now=>{
      if(!el.isConnected) return;
      const p=Math.max(0,Math.min(1,(now-t0)/duree)), n=Math.floor(p*total); let reste=n;
      for(const f of retenus){ const m=Math.max(0,Math.min(f.texte.length,reste)); reste-=f.texte.length; const txt=f.texte.slice(0,m); f.el.textContent=p<1&&m>0&&m<f.texte.length?txt+cur:(m>=f.texte.length?f.texte:txt); }
      if(p<1) requestAnimationFrame(pas); else retenus.forEach(f=>{ f.el.textContent=f.texte; f.el.removeAttribute('data-ecrit-en-cours'); });
    };
    requestAnimationFrame(pas);
  }
  /* ───── glitch très bref (translation + découpe : n'entre pas en conflit avec les animations d'ouverture et de fermeture) ───── */
  function glitch(el,ms){
    if(!el.animate) return;
    el.animate([{translate:'0 0',clipPath:'inset(0)'},{translate:'-3px 0',clipPath:'inset(18% 0 52% 0)',offset:.2},{translate:'4px 1px',clipPath:'inset(58% 0 12% 0)',offset:.45},{translate:'-2px -1px',clipPath:'inset(30% 0 30% 0)',offset:.7},{translate:'0 0',clipPath:'inset(0)'}],{duration:ms||140,easing:'steps(5,end)'});
  }
  /* ───── inclinaison 3D au survol ───── */
  function incliner(el){
    if(el.dataset&&/^mars-/.test(el.dataset.type||'')) return;     // V2 : les fenêtres de Mars (terminal, agent) ne s'inclinent jamais : texte droit et lisible
    if(!souris) return;
    el.addEventListener('pointermove',e=>{
      if(niveau()<0.6) return;
      const r=el.getBoundingClientRect(), x=((e.clientX-r.left)/r.width-0.5)*2, y=((e.clientY-r.top)/r.height-0.5)*2, max=niveau()>0.9?5:3;
      const tx=x*max, ty=y*max, ang=Math.hypot(tx,ty);
      el.style.rotate=ang<0.05?'none':(-ty).toFixed(2)+' '+tx.toFixed(2)+' 0 '+ang.toFixed(2)+'deg';
    });
    el.addEventListener('pointerleave',()=>{ el.style.rotate='none'; });
  }
  /* ───── particules à la fermeture ───── */
  function eclater(el){
    const n=niveau()>0.9?16:(niveau()>0.6?8:0); if(!n||!el.animate) return;
    const r=el.getBoundingClientRect(); if(r.width<30) return;
    const frag=document.createDocumentFragment(), parts=[];
    for(let i=0;i<n;i++){
      const p=document.createElement('i'); p.className='pn-part';
      const bord=Math.random()<0.5, x=r.left+Math.random()*r.width, y=bord?(Math.random()<0.5?r.top:r.bottom):r.top+Math.random()*r.height;
      p.style.left=x+'px'; p.style.top=y+'px'; frag.appendChild(p); parts.push(p);
    }
    racine.appendChild(frag);
    parts.forEach(p=>{
      const a=Math.random()*Math.PI*2, d=30+Math.random()*90, dur=480+Math.random()*420;
      const anim=p.animate([{translate:'0 0',opacity:1,scale:1},{translate:Math.cos(a)*d+'px '+(Math.sin(a)*d-20)+'px',opacity:0,scale:.2}],{duration:dur,easing:'cubic-bezier(.2,.7,.3,1)',fill:'forwards'});
      anim.onfinish=()=>p.remove();
    });
    compteurEffets+=n;
  }
  /* ───── réorganisation animée (FLIP) ───── */
  function noter(){ rects.clear(); racine.querySelectorAll('.pn:not(.hud-out)').forEach(e=>rects.set(e,e.getBoundingClientRect())); }
  function glisser(){
    if(pilote||niveau()<=0){ noter(); return; }
    racine.querySelectorAll('.pn:not(.hud-out)').forEach(e=>{
      const a=rects.get(e); if(!a||!e.animate) return;
      const b=e.getBoundingClientRect(), dx=a.left-b.left, dy=a.top-b.top;
      if(Math.abs(dx)+Math.abs(dy)>2){ e.animate([{translate:dx+'px '+dy+'px'},{translate:'0 0'}],{duration:380,easing:'cubic-bezier(.2,.8,.2,1)',composite:'add'}); compteurEffets++; }
    });
    noter();
  }
  /* ───── une fenêtre vient d'apparaître / de commencer à se fermer ───── */
  function arrivee(el){
    if(traites.has(el)) return; traites.add(el);
    son('ouverture');
    incliner(el);
    const nv=niveau(); if(nv<=0) return;
    corps.classList.add('anim-fen');
    ajouterTrace(el);
    if(nv>0.6) ecrire(el,520);
    if(nv>0.6) setTimeout(()=>{ if(el.isConnected&&!el.classList.contains('hud-out')) glitch(el,140); },640);
  }
  function sortie(el){
    if(enSortie.has(el)) return; enSortie.add(el);
    son('fermeture');
    if(niveau()>0.6){ glitch(el,120); eclater(el); }
  }
  const obs=new MutationObserver(muts=>{
    let structure=false;
    for(const m of muts){
      if(m.type==='childList'){
        const t=m.target; if(t.classList&&(t.classList.contains('pn-col')||t.classList.contains('pn-centre')||t.classList.contains('pn-wrap'))) structure=true;   // une fenêtre arrive ou part (pas le texte qui s'écrit)
        m.addedNodes.forEach(n=>{ if(n.nodeType===1&&n.classList&&n.classList.contains('pn')) arrivee(n); });
      }else if(m.type==='attributes'&&m.target.classList&&m.target.classList.contains('pn')&&m.target.classList.contains('hud-out')) sortie(m.target);
    }
    if(structure) glisser();
  });
  obs.observe(racine,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',noter);
  noter();
  window.FenetresAnim={niveau,effets:()=>compteurEffets,actif:()=>niveau()>0};
})();
