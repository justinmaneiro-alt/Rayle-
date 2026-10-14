"use strict";
/* ═════════════ RANGER RAYLÉ : une petite bulle déplaçable, pour avoir toute la scène sous les doigts ═════════════
   Bouton « Ranger » (barre du bas) ou voix (« réduis-toi », « range-toi ») : l'interface se vide, Raylé devient une bulle sur un côté de l'écran.
   • La bulle se déplace au doigt ou à la souris (elle s'accroche au bord le plus proche) ; sa place est mémorisée (localStorage).
   • Un clic / un toucher la rouvre (« rouvre-toi », « reviens », ou Échap). Un glissement la déplace sans la rouvrir.
   • Raylé reste à l'écoute : la bulle est le même élément #reactor, l'écoute, la voix et les commandes ne sont pas touchées.
   • body.rayle-rangee : masque titre, barre, panneaux ; l'Univers (js/univers) passe en plein écran et garde ses gestes (tourner, pincer).
   API : window.RayleRangement { ranger(), rouvrir(), basculer(), estRange(), position() } · bus 'rayle:rangee' {actif}. */
(function(){
  const CLE='rayle_bulle_pos', CLE_ETAT='rayle_rangee';
  const TAILLE=76, MARGE=10;
  const lire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const ecrire=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
  const reactor=document.getElementById('reactor');
  if(!reactor) return;
  let range=false, pos=null, drag=null, aBouge=false;

  // Position mémorisée : fraction (0..1) du centre de la bulle dans l'écran, pour survivre à une rotation de tablette
  function lirePos(){
    try{ const p=JSON.parse(lire(CLE)||'null'); if(p && isFinite(p.fx) && isFinite(p.fy)) return {fx:Math.min(1,Math.max(0,p.fx)),fy:Math.min(1,Math.max(0,p.fy))}; }catch(e){}
    return {fx:1,fy:.18};                     // par défaut : bord droit, en haut
  }
  const dims=()=>({w:window.innerWidth||1024,h:window.innerHeight||768});
  // fraction → pixels (haut-gauche), en gardant la bulle entièrement visible
  function versPixels(p){
    const {w,h}=dims(), r=TAILLE/2;
    const cx=Math.min(w-r-MARGE,Math.max(r+MARGE,p.fx*w)), cy=Math.min(h-r-MARGE,Math.max(r+MARGE,p.fy*h));
    return {x:Math.round(cx-r),y:Math.round(cy-r)};
  }
  // s'accroche au bord gauche ou droit le plus proche (la bulle ne reste pas au milieu de la scène)
  function accrocher(fx,fy){ return {fx:fx<.5?0:1,fy:Math.min(.94,Math.max(.06,fy))}; }
  function appliquer(){
    if(!range){ reactor.style.removeProperty('left'); reactor.style.removeProperty('top'); reactor.style.removeProperty('right'); reactor.style.removeProperty('bottom'); return; }
    pos=pos||lirePos();
    const px=versPixels(pos);
    reactor.style.left=px.x+'px'; reactor.style.top=px.y+'px'; reactor.style.right='auto'; reactor.style.bottom='auto';
  }

  function definir(oui,{memoriser=true}={}){
    oui=!!oui;
    if(oui===range) return;
    range=oui;
    document.body.classList.toggle('rayle-rangee',range);
    if(memoriser) ecrire(CLE_ETAT,range?'1':'0');   // dernier état connu (diagnostic) : Raylé redémarre toujours ouverte
    if(range){ pos=lirePos(); reactor.setAttribute('role','button'); reactor.setAttribute('aria-label','Rouvrir Raylé (elle reste à l’écoute)'); reactor.title='Toucher : rouvrir Raylé · glisser : déplacer la bulle'; }
    else{ reactor.removeAttribute('role'); reactor.removeAttribute('aria-label'); reactor.title='Toucher : réveiller Raylé ou la couper'; }
    appliquer();
    majBouton();
    try{ RayleBus.emit('rayle:rangee',{actif:range}); RayleBus.fusion('rangement',{actif:range}); }catch(e){}
  }
  const ranger=()=>definir(true), rouvrir=()=>definir(false), basculer=()=>definir(!range);

  /* ───── la bulle : glisser = déplacer, toucher = rouvrir (écoute en capture pour passer avant le « toucher pour parler ») ───── */
  reactor.addEventListener('pointerdown',e=>{
    if(!range || (e.pointerType==='mouse' && e.button!==0)) return;
    const r=reactor.getBoundingClientRect();
    drag={id:e.pointerId,dx:e.clientX-r.left,dy:e.clientY-r.top,x0:e.clientX,y0:e.clientY};
    aBouge=false;
    try{ reactor.setPointerCapture(e.pointerId); }catch(er){}
  },true);
  reactor.addEventListener('pointermove',e=>{
    if(!drag || e.pointerId!==drag.id) return;
    if(!aBouge && Math.hypot(e.clientX-drag.x0,e.clientY-drag.y0)<7) return;
    aBouge=true;
    const {w,h}=dims();
    pos={fx:Math.min(1,Math.max(0,(e.clientX-drag.dx+TAILLE/2)/w)),fy:Math.min(1,Math.max(0,(e.clientY-drag.dy+TAILLE/2)/h))};
    appliquer();
    e.preventDefault();
  },true);
  function fin(e){
    if(!drag || e.pointerId!==drag.id) return;
    try{ reactor.releasePointerCapture(drag.id); }catch(er){}
    drag=null;
    if(aBouge){ pos=accrocher(pos.fx,pos.fy); ecrire(CLE,JSON.stringify(pos)); appliquer(); }
  }
  reactor.addEventListener('pointerup',fin,true);
  reactor.addEventListener('pointercancel',fin,true);
  reactor.addEventListener('click',e=>{
    if(!range) return;
    e.stopImmediatePropagation(); e.preventDefault();         // dans cet état, le toucher rouvre : il ne coupe pas le micro
    if(aBouge){ aBouge=false; return; }
    rouvrir();
  },true);
  reactor.addEventListener('keydown',e=>{ if(range && (e.key==='Enter'||e.key===' ')){ e.preventDefault(); rouvrir(); } });
  document.addEventListener('keydown',e=>{ if(range && e.key==='Escape') rouvrir(); });
  window.addEventListener('resize',()=>{ if(range) appliquer(); });

  /* ───── bouton « Ranger » dans la barre du bas ───── */
  let bouton=document.getElementById('btnRanger');
  function majBouton(){ if(bouton) bouton.setAttribute('aria-pressed',String(range)); }
  const barre=document.getElementById('barre');
  if(!bouton && barre){
    bouton=document.createElement('button'); bouton.type='button'; bouton.className='gros'; bouton.id='btnRanger';
    bouton.title='Réduire Raylé en petite bulle : elle reste à l’écoute'; bouton.innerHTML='<i>🫧</i><span>Ranger</span>';
    const gear=document.getElementById('gear'); barre.insertBefore(bouton,gear||null);
  }
  if(bouton) bouton.addEventListener('click',ranger);
  RayleBus.fournir('rangement:etat',()=>({actif:range,pos:pos&&Object.assign({},pos)}));
  RayleBus.on('rayle:ranger',d=>{ definir(d&&d.actif!==false); });

  window.RayleRangement={ranger,rouvrir,basculer,estRange:()=>range,position:()=>pos&&Object.assign({},pos),definir};
})();
