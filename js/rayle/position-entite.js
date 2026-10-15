"use strict";
/* ═════════════ POSITION DE L'ENTITÉ RAYLÉ : petite dans un coin, grande au centre, grande sur le côté ═════════════
   Trois modes, valables dans TOUTES les vues (accueil, Univers : système solaire, Terre, Mars…) :
     coin    petite, ancrée dans un angle (hg · hd · bg · bd), toujours animée et à l'écoute, sans gêner la scène
     centre  grande, au centre : mode conversation
     cote    grande, collée à gauche ou à droite ; en Univers la scène est décalée pour occuper le reste de l'écran
   • Réglage (Apparence / Réglages / barre de l'Univers), voix (« mets-toi dans le coin », « au centre », « sur le côté gauche »), ou glisser l'entité : elle se cale sur la zone la plus proche.
   • Position générale + une position MÉMORISÉE PAR VUE (chaque planète a la sienne si on le demande). Sauvegardé entre les sessions (localStorage), en fractions de l'écran : tablette, téléphone, PC.
   • Jamais sous les boutons ni les panneaux : les marges sont MESURÉES (barre du bas, titre, barre de l'Univers, cartes), et quand un panneau (carte, actus, terminal…) s'ouvre l'entité se met
     petite dans un angle libre, puis revient à sa position quand il se ferme.
   • Transitions fluides (FLIP : l'élément glisse de l'ancienne position à la nouvelle sans recalculer sa taille à chaque image).
   API : window.RayleEntitePosition { definir(pos), coin(c), centre(), cote(c), definirValeur(v), valeur(), options(), memoriserVue(oui), reinitialiser(), etat(), vueCle() } · bus 'entite:position'.
   Les fonctions pures (plusProche, placement, resoudre, coinLibre) sont dans ._ pour les tests. */
(function(){
  const CLE='rayle_entite_pos', CLE_VUES='rayle_entite_pos_vues';
  const MARGE=10, SEUIL_GLISSE=8, DUREE=520;
  const COINS=['hg','hd','bg','bd'];
  const NOM_COIN={hg:'en haut à gauche',hd:'en haut à droite',bg:'en bas à gauche',bd:'en bas à droite',hc:'en haut au centre',bc:'en bas au centre'};
  const NOM_COTE={gauche:'sur le côté gauche',droite:'sur le côté droit'};
  const DEFAUT_ACCUEIL={mode:'centre',coin:'bd',cote:'droite'};
  const DEFAUT_UNIVERS={mode:'coin',coin:'hd',cote:'droite'};       // comme avant : petite bulle en haut à droite quand une scène occupe l'écran
  const DEFAUT_UNIVERS_ETROIT={mode:'coin',coin:'bd',cote:'droite'};  // téléphone : la barre du haut de l'Univers occupe toute la moitié haute, la bulle va en bas à droite
  const lire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const ecrire=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const DOM=typeof document!=='undefined' && !!document.getElementById;
  const reactor=DOM?document.getElementById('reactor'):null;

  /* ───── position : validation, valeur texte (« coin:bd », « centre », « cote:gauche »), libellés ───── */
  function valider(p){
    if(!p || typeof p!=='object') return null;
    const mode=['coin','centre','cote'].includes(p.mode)?p.mode:null; if(!mode) return null;
    return {mode,coin:COINS.includes(p.coin)?p.coin:'bd',cote:p.cote==='gauche'?'gauche':'droite'};
  }
  const valeurDe=p=>p.mode==='coin'?'coin:'+p.coin:p.mode==='cote'?'cote:'+p.cote:'centre';
  function depuisValeur(v){
    const m=/^(coin|cote):(\w+)$/.exec(String(v||'')); if(m) return valider(m[1]==='coin'?{mode:'coin',coin:m[2]}:{mode:'cote',cote:m[2]});
    return v==='centre'?valider({mode:'centre'}):null;
  }
  const LIBELLES={'coin:hg':'Petite · en haut à gauche','coin:hd':'Petite · en haut à droite','coin:bg':'Petite · en bas à gauche','coin:bd':'Petite · en bas à droite','centre':'Grande · au centre','cote:gauche':'Grande · sur le côté gauche','cote:droite':'Grande · sur le côté droit'};
  const COURTS={'coin:hg':'Petite ↖','coin:hd':'Petite ↗','coin:bg':'Petite ↙','coin:bd':'Petite ↘','centre':'Grande · centre','cote:gauche':'Grande · gauche','cote:droite':'Grande · droite'};   // barre de l'Univers : peu de place sur téléphone
  const options=()=>Object.keys(LIBELLES).map(v=>({valeur:v,libelle:LIBELLES[v],court:COURTS[v]}));
  const phrase=p=>p.mode==='coin'?'dans le coin '+NOM_COIN[p.coin]:p.mode==='cote'?NOM_COTE[p.cote]:'au centre';

  /* ───── résolution : position de la vue > position générale > défaut (accueil : centre ; Univers : petite en haut à droite) ───── */
  function resoudre(S,cle,etroit){
    const v=S.vues&&valider(S.vues[cle]); if(v) return {pos:v,source:'vue'};
    const g=valider(S.global); if(g) return {pos:g,source:'global'};
    return {pos:Object.assign({},cle==='accueil'?DEFAUT_ACCUEIL:etroit?DEFAUT_UNIVERS_ETROIT:DEFAUT_UNIVERS),source:'defaut'};
  }

  /* ───── la zone la plus proche d'un point de l'écran (fractions 0..1) : centre, côté ou angle ───── */
  function plusProche(fx,fy){
    const dx=Math.abs(fx-.5), dy=Math.abs(fy-.5);
    if(dx<.2 && dy<.2) return {mode:'centre'};
    if(dy<.2) return {mode:'cote',cote:fx<.5?'gauche':'droite'};
    return {mode:'coin',coin:(fy<.5?'h':'b')+(fx<.5?'g':'d')};
  }

  /* ───── placement : {x, y, w} en pixels (carré), d'après l'écran et les marges libres mesurées ─────
     vp = {w,h} · z = {haut:{g,d}, bas, gauche, droite, bloc:{x0,x1,haut}|null} (marges réservées : barre, titre, cartes…) · o = {k (taille 0.7–1.5)} */
  function tailleCoin(vp){ return Math.round(clamp(Math.min(vp.w,vp.h)*.12,68,96)); }
  function rectCoin(coin,vp,z){
    const w=tailleCoin(vp), g=coin.includes('g'), d=coin.includes('d'), h=coin.startsWith('h');
    let x=g?MARGE+z.gauche:d?vp.w-w-MARGE-z.droite:Math.round((vp.w-w)/2);
    let y=h?(g?z.haut.g:d?z.haut.d:Math.max(z.haut.g,z.haut.d))+4:vp.h-z.bas-w-4;
    if(!h && z.bloc && x<z.bloc.x1 && x+w>z.bloc.x0) y=Math.min(y,z.bloc.haut-w-6);        // au-dessus d'une carte ou d'une légende de l'Univers
    return {x:Math.round(x),y:Math.round(Math.max(0,y)),w};
  }
  function placement(pos,vp,z,o){
    const k=clamp((o&&o.k)||1,.7,1.5);
    if(pos.mode==='coin') return rectCoin(pos.coin,vp,z);
    const etroit=vp.w<700, hautMax=Math.max(z.haut.g,z.haut.d);
    let w=0,x=0,y=0,bas=z.bas;
    for(let passe=0;passe<2;passe++){
      const libreH=Math.max(120,vp.h-hautMax-bas);
      if(pos.mode==='centre') w=Math.min(vp.w*.78,libreH*.86,560);
      else w=Math.min(vp.w*(etroit?.62:.44),libreH*(etroit?.7:.96),520);
      w=Math.round(clamp(w*k,120,Math.max(120,Math.min(vp.w-2*MARGE,libreH))));
      x=pos.mode==='centre'?(vp.w-w)/2:pos.cote==='gauche'?MARGE+z.gauche:vp.w-w-MARGE-z.droite;
      if(z.bloc && x<z.bloc.x1 && x+w>z.bloc.x0) bas=Math.max(z.bas,vp.h-z.bloc.haut+6);
    }
    y=hautMax+(Math.max(120,vp.h-hautMax-bas)-w)/2;
    return {x:Math.round(x),y:Math.round(Math.max(0,y)),w};
  }
  // entre ce qui est mesuré à l'écran et ce qui est libre : l'ordre d'essai des angles quand un panneau est ouvert
  function ordreCoins(pos){
    const base=pos.mode==='coin'?[pos.coin]:pos.mode==='cote'?(pos.cote==='gauche'?['hg','bg']:['hd','bd']):['hd','hg','bd','bg'];
    return base.concat(COINS.filter(c=>!base.includes(c)),['hc','bc']);
  }
  const inter=(a,b,m)=>a.x<b.x+b.w+m && a.x+a.w+m>b.x && a.y<b.y+b.h+m && a.y+a.h+m>b.y;
  // premier angle qui ne recouvre aucun panneau ; si tous sont pris, l'angle préféré (les panneaux restent au-dessus de l'entité)
  function coinLibre(pos,vp,z,panneaux){
    const ordre=ordreCoins(pos);
    for(const c of ordre){
      const r=rectCoin(c,vp,z), boite={x:r.x,y:r.y,w:r.w,h:r.w};
      if(!(panneaux||[]).some(p=>inter(boite,p,6))) return c;
    }
    return ordre[0];
  }

  /* ───── état : général + par vue, sauvegardé ───── */
  const lireJSON=k=>{ try{ return JSON.parse(lire(k)||'null'); }catch(e){ return null; } };       // stockage vide, refusé ou corrompu : on repart des défauts
  const S={global:valider(lireJSON(CLE)),vues:{}};
  { const v=lireJSON(CLE_VUES); if(v && typeof v==='object') for(const k of Object.keys(v)){ const p=valider(v[k]); if(p) S.vues[k]=p; } }
  const sauver=()=>{ if(S.global) ecrire(CLE,JSON.stringify(S.global)); ecrire(CLE_VUES,JSON.stringify(S.vues)); };

  function vueCle(){
    try{
      const u=RayleBus.etat('univers'); if(!u || !u.ouvert) return 'accueil';
      const p=RayleBus.etat('planete'); return p && p.interieur ? p.interieur : 'systeme';
    }catch(e){ return 'accueil'; }
  }
  let panneauxOuverts=false, glisse=null, derniere=null;
  const etroit=()=>{ try{ return DOM && (window.innerWidth||1024)<=760; }catch(e){ return false; } };
  const actuelle=()=>resoudre(S,vueCle(),etroit());

  function emettre(){
    const r=actuelle(), d={mode:r.pos.mode,coin:r.pos.coin,cote:r.pos.cote,valeur:valeurDe(r.pos),vue:vueCle(),memorisee:r.source==='vue',source:r.source};
    try{ RayleBus.emit('entite:position',d); RayleBus.fusion('entite',d); }catch(e){}
  }
  // Modifie la position : si la vue en a une mémorisée, c'est elle qui change ; sinon la position générale change (valable partout où rien n'est mémorisé)
  function definir(p,opt){
    const v=valider(Object.assign({},actuelle().pos,p)); if(!v) return false;
    const cle=vueCle();
    if(S.vues[cle] || (opt&&opt.vue)) S.vues[cle]=v; else S.global=v;
    sauver(); emettre(); maj({anime:true}); return true;
  }
  const coin=c=>definir({mode:'coin',coin:c});
  const centre=()=>definir({mode:'centre'});
  const cote=c=>definir({mode:'cote',cote:c});
  function definirValeur(v,opt){ const p=depuisValeur(v); return p?definir(p,opt):false; }
  // « épingle cette position pour cette vue » / « oublie la position de cette vue »
  function memoriserVue(oui){
    const cle=vueCle();
    if(oui) S.vues[cle]=Object.assign({},actuelle().pos); else delete S.vues[cle];
    sauver(); emettre(); maj({anime:true}); return !!oui;
  }
  function reinitialiser(){ S.global=null; S.vues={}; try{ localStorage.removeItem(CLE); localStorage.removeItem(CLE_VUES); }catch(e){} emettre(); maj({anime:true}); }

  /* ───── mesure de l'écran ───── */
  const vis=el=>!!el && (el.offsetParent!==null || (typeof getComputedStyle==='function' && getComputedStyle(el).position==='fixed')) && !el.hidden;
  const rect=el=>el.getBoundingClientRect();
  function viewport(){ const vv=window.visualViewport; return {w:Math.round((vv&&vv.width)||window.innerWidth||1024),h:Math.round((vv&&vv.height)||window.innerHeight||768)}; }
  function zones(vp){
    const z={haut:{g:MARGE,d:MARGE},bas:MARGE,gauche:0,droite:0,bloc:null};
    const univers=document.body.classList.contains('univers-actif');
    const barre=document.getElementById('barre');
    if(vis(barre)) z.bas=Math.max(MARGE,Math.round(vp.h-rect(barre).top+6));
    if(univers){
      const haut=document.querySelector('.univ-haut'), gauche=haut&&haut.children[0], droite=haut&&haut.children[1];
      if(vis(haut)){
        const bg=gauche?rect(gauche).bottom:rect(haut).bottom, bd=droite?rect(droite).bottom:rect(haut).bottom, b=rect(haut).bottom;
        if(vp.w<=760){ z.haut.g=z.haut.d=Math.round(b+8); } else { z.haut.g=Math.round(bg+8); z.haut.d=Math.round(bd+8); }
      }
      const elements=[document.querySelector('.univ-carte'),document.querySelector('.univ-legende.vu')].filter(e=>e && vis(e) && e.offsetHeight>0);
      if(elements.length){ const rs=elements.map(rect); z.bloc={x0:Math.min(...rs.map(r=>r.left)),x1:Math.max(...rs.map(r=>r.right)),haut:Math.min(...rs.map(r=>r.top))}; }
    }else{
      const bas=['.titre','.bridge','.ui-bouton'].map(sel=>document.querySelector(sel)).filter(vis).map(e=>rect(e).bottom);
      const m=Math.round(Math.max(MARGE,...bas)+6); z.haut.g=z.haut.d=m;
    }
    return z;
  }
  // rectangles (écran) des panneaux ouverts : tailles de mise en page, donc stables pendant leur animation d'ouverture
  function rectsPanneaux(){
    if(!panneauxOuverts) return [];
    const out=[];
    document.querySelectorAll('#panneaux .pn:not(.hud-out)').forEach(el=>{
      const op=el.offsetParent; if(!op || !el.offsetWidth) return;
      const r=rect(op); out.push({x:r.left+el.offsetLeft-(op.scrollLeft||0),y:r.top+el.offsetTop-(op.scrollTop||0),w:el.offsetWidth,h:el.offsetHeight});
    });
    return out;
  }
  const tailleReglee=()=>{ try{ return (window.RayleUI&&RayleUI.reglages&&RayleUI.reglages().taille||100)/100; }catch(e){ return 1; } };

  /* ───── application à l'écran ───── */
  let enCours=0, anim=null;
  const inactif=()=>!reactor || document.body.classList.contains('rayle-rangee') || document.body.classList.contains('rayle-discrete') || (()=>{ try{ const v=RayleBus.demander('vue'); return v!=null && v!=='rayle'; }catch(e){ return false; } })();
  function calculer(){
    const vp=viewport(), z=zones(vp), base=actuelle().pos, univers=document.body.classList.contains('univers-actif');
    let pos=base, temporaire=false;
    if(panneauxOuverts){ pos={mode:'coin',coin:coinLibre(base,vp,z,rectsPanneaux())}; temporaire=true; }
    const naturel=pos.mode==='centre' && !univers;                    // accueil, au centre : la mise en page normale (aucun style ajouté)
    let r=null;
    if(!naturel) r=placement(pos,vp,z,{k:tailleReglee()});
    return {pos,temporaire,naturel,r,vp,z,base};
  }
  // L'entité garde `aspect-ratio:1` en mise en page normale : avec une hauteur imposée, la taille minimale « automatique » d'une boîte à rapport d'aspect est celle de son contenu
  // (le canvas, encore à l'ancienne taille pendant un cycle de rendu) et la largeur lue restait 434 px au lieu de 84 px, ce qui faussait l'échelle de la transition.
  // Hors mise en page, on supprime donc le rapport d'aspect et les minimums automatiques : la taille posée est la taille effective, tout de suite.
  const PROPS=['position','left','top','right','bottom','width','height','margin','min-width','min-height','aspect-ratio'];
  function poser(x,y,w){
    const s=reactor.style, f=(k,v)=>s.setProperty(k,v,'important');
    s.setProperty('--ent-x',x+'px'); s.setProperty('--ent-y',y+'px'); s.setProperty('--ent-w',w+'px');
    f('position','fixed'); f('left',x+'px'); f('top',y+'px'); f('right','auto'); f('bottom','auto'); f('width',w+'px'); f('height',w+'px'); f('margin','0'); f('min-width','0'); f('min-height','0'); f('aspect-ratio','auto');
  }
  function defaire(){ const s=reactor.style; ['--ent-x','--ent-y','--ent-w'].concat(PROPS).forEach(p=>s.removeProperty(p)); }
  function retirer(){
    document.body.classList.remove('ent-fixe','ent-coin','ent-centre','ent-cote');
    defaire(); decaler(0);
  }
  // décale la scène 3D de l'Univers pour qu'elle occupe l'espace laissé par l'entité (mode « sur le côté »)
  function decaler(px){ try{ window.RayleUnivers && RayleUnivers.decaler && RayleUnivers.decaler(px); }catch(e){} }

  function maj(opt){
    if(!reactor) return;
    if(glisse && glisse.actif) return;                               // le doigt tient l'entité : on ne la déplace pas dessous
    const n=++enCours;
    if(inactif()){ if(glisse) return; retirer(); derniere=null; return; }
    const c=calculer(), anime=!!(opt&&opt.anime);
    const avant=reactor.getBoundingClientRect();                      // inclut la translation d'une animation encore en cours : la nouvelle part de là où l'entité est vraiment
    if(anim){ try{ anim.cancel(); }catch(e){} anim=null; }              // et la nouvelle place se mesure sans elle
    // Aucune transition de largeur pendant le changement (hud.css en a une) : coupée EN LIGNE et appliquée AVANT de changer la taille, sinon Blink garde l'ancienne largeur un cycle de plus
    reactor.style.transition='none'; void reactor.offsetWidth;
    document.body.classList.add('ent-sans-transition');
    const classes=document.body.classList;
    ['ent-coin','ent-centre','ent-cote'].forEach(k=>classes.remove(k));
    classes.add('ent-'+c.pos.mode);
    if(c.naturel){ classes.remove('ent-fixe'); defaire(); }
    else{ classes.add('ent-fixe'); poser(c.r.x,c.r.y,c.r.w); }
    const apres=reactor.getBoundingClientRect();
    flip(avant,apres,anime && !!derniere);
    derniere={naturel:c.naturel,pos:c.pos,r:c.r};
    // scène décalée : seulement en Univers et en mode côté (pas pour un angle temporaire dû à un panneau)
    const univers=classes.contains('univers-actif');
    decaler(univers && c.pos.mode==='cote' && !c.temporaire ? Math.round((c.pos.cote==='gauche'?1:-1)*(c.r.w+2*MARGE)/2) : 0);
    setTimeout(()=>{ if(n===enCours){ classes.remove('ent-sans-transition'); reactor.style.removeProperty('transition'); } },60);
  }
  // FLIP : l'élément est déjà à sa nouvelle place ; on le fait partir de l'ancienne (translation + échelle) et glisser jusqu'à zéro
  function flip(a,b,oui){
    if(!oui || !reactor.animate || !a.width || !b.width) return;
    try{ if(matchMedia('(prefers-reduced-motion: reduce)').matches) return; }catch(e){}
    const dx=a.left-b.left, dy=a.top-b.top, s=a.width/b.width;
    if(Math.abs(dx)<1 && Math.abs(dy)<1 && Math.abs(s-1)<.01) return;
    anim=reactor.animate([{transform:'translate('+dx+'px,'+dy+'px) scale('+s+')',transformOrigin:'0 0'},{transform:'none',transformOrigin:'0 0'}],{duration:DUREE,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  let planifie=0;
  const planifier=opt=>{ if(planifie) return; planifie=requestAnimationFrame(()=>{ planifie=0; maj(opt); }); };

  /* ───── glisser l'entité : elle suit le doigt, puis se cale sur la zone la plus proche ───── */
  let cliqueAvale=false;
  if(reactor){
    reactor.addEventListener('pointerdown',e=>{
      if(inactif() || (e.pointerType==='mouse' && e.button!==0)) return;
      if(anim){ try{ anim.cancel(); }catch(er){} anim=null; }          // une transition encore en cours : on saisit l'entité à sa place d'arrivée
      const r=reactor.getBoundingClientRect();
      glisse={id:e.pointerId,dx:e.clientX-r.left,dy:e.clientY-r.top,x0:e.clientX,y0:e.clientY,w:r.width,actif:false};
      try{ reactor.setPointerCapture(e.pointerId); }catch(er){}          // dès l'appui : un geste de souris rapide sort de l'entité avant le premier déplacement (le doigt, lui, est déjà capturé)
    },true);
    reactor.addEventListener('pointermove',e=>{
      if(!glisse || e.pointerId!==glisse.id) return;
      if(!glisse.actif){
        if(Math.hypot(e.clientX-glisse.x0,e.clientY-glisse.y0)<SEUIL_GLISSE) return;
        glisse.actif=true;
        reactor.style.transition='none'; void reactor.offsetWidth;
        document.body.classList.add('ent-sans-transition','ent-fixe','ent-glisse');
        poser(parseFloat(reactor.style.getPropertyValue('--ent-x'))||glisse.x0-glisse.dx,parseFloat(reactor.style.getPropertyValue('--ent-y'))||glisse.y0-glisse.dy,glisse.w);
      }
      const vp=viewport();
      poser(Math.round(clamp(e.clientX-glisse.dx,0,vp.w-glisse.w)),Math.round(clamp(e.clientY-glisse.dy,0,vp.h-glisse.w)),glisse.w);
      e.preventDefault();
    },true);
    const fin=e=>{
      if(!glisse || e.pointerId!==glisse.id) return;
      const g=glisse; glisse=null;
      try{ reactor.releasePointerCapture(g.id); }catch(er){}
      if(!g.actif) return;
      cliqueAvale=true; setTimeout(()=>{ cliqueAvale=false; },400);
      document.body.classList.remove('ent-glisse');
      const r=reactor.getBoundingClientRect(), vp=viewport();
      const cible=plusProche((r.left+r.width/2)/vp.w,(r.top+r.height/2)/vp.h);
      derniere=derniere||{naturel:false};                      // la transition part de l'endroit où l'entité a été lâchée
      if(!definir(cible)) maj({anime:true});
    };
    reactor.addEventListener('pointerup',fin,true);
    reactor.addEventListener('pointercancel',fin,true);
    reactor.addEventListener('click',e=>{ if(cliqueAvale){ e.stopImmediatePropagation(); e.preventDefault(); cliqueAvale=false; } },true);   // un glissement n'est pas un « toucher pour parler »

    /* ───── abonnements : tout changement d'écran ou de contenu replace l'entité ───── */
    const bus=(n,f)=>{ try{ RayleBus.on(n,f); }catch(e){} };
    bus('etat:panneaux',d=>{ const o=!!(d&&d.n>0); if(o===panneauxOuverts) return; panneauxOuverts=o; planifier({anime:true}); if(o){ setTimeout(()=>planifier({anime:true}),800); } });
    ['etat:univers','etat:planete','vue:changee','univers:theme','rayle:rangee','rayle:discrete','ui:reglages'].forEach(n=>bus(n,()=>{ emettre(); planifier({anime:true}); }));
    window.addEventListener('resize',()=>planifier());
    window.addEventListener('orientationchange',()=>setTimeout(()=>planifier(),250));
    if(window.visualViewport) window.visualViewport.addEventListener('resize',()=>planifier());
    if('ResizeObserver' in window){
      const ro=new ResizeObserver(()=>planifier());
      const suivre=()=>{ ['.univ-haut','.univ-bas','#barre','.titre'].forEach(s=>{ const el=document.querySelector(s); if(el && !el.__entObs){ el.__entObs=1; ro.observe(el); } }); };
      suivre(); bus('etat:univers',suivre);
    }
    // les cartes de l'Univers apparaissent et disparaissent : on suit leur affichage
    if('MutationObserver' in window){
      const mo=new MutationObserver(()=>planifier());
      const brancher=()=>{ const b=document.querySelector('.univ-bas'); if(b && !b.__entMo){ b.__entMo=1; mo.observe(b,{attributes:true,subtree:true,attributeFilter:['hidden','class']}); } };
      brancher(); bus('etat:univers',brancher);
    }
    document.addEventListener('DOMContentLoaded',()=>planifier());
    planifier();
  }

  window.RayleEntitePosition={
    definir,coin,centre,cote,definirValeur,memoriserVue,reinitialiser,options,
    valeur:()=>valeurDe(actuelle().pos),
    vueCle,
    etat:()=>{ const r=actuelle(); return {mode:r.pos.mode,coin:r.pos.coin,cote:r.pos.cote,valeur:valeurDe(r.pos),vue:vueCle(),memorisee:r.source==='vue',source:r.source,panneaux:panneauxOuverts,libelle:LIBELLES[valeurDe(r.pos)],vuesMemorisees:Object.keys(S.vues)}; },
    phrase:()=>phrase(actuelle().pos),
    maj:()=>maj({anime:false}),
    rect:()=>derniere&&derniere.r?Object.assign({},derniere.r):null,         // place calculée (px), null au centre de l'accueil (mise en page normale)
    _:{valider,valeurDe,depuisValeur,resoudre,plusProche,placement,rectCoin,coinLibre,ordreCoins,tailleCoin,LIBELLES,DEFAUT_ACCUEIL,DEFAUT_UNIVERS,etatInterne:S,phraseDe:phrase,definirPanneaux:o=>{ panneauxOuverts=!!o; }}
  };
  emettre();
})();
