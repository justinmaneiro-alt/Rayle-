"use strict";
/* ═════════════ APPLICATION RAYLÉ : carrousel 3D de panneaux holographiques ═════════════
   Cinq panneaux, dans l'ordre : Rayle (accueil) · Terminal · Anatomie · Terre (actualité) · Développement 3D.
   Le fond animé (noyau doré, anneaux, éclats, vague) reste affiché EN PERMANENCE ; balayer ne change jamais de thème ni de fond.
   Le panneau du centre est grand, ses voisins sont inclinés et plus petits ; le mouvement a de l'inertie (ressort amorti) et le noyau glisse en parallaxe.
   Chaque panneau montre une MINIATURE VIVANTE de sa fenêtre (core/commun/miniatures.js), dessinée seulement quand il est visible.
   On passe de l'un à l'autre en balayant (souris, doigt), avec les flèches, la molette horizontale, le dock ou la voix.
   Un clic sur le panneau du centre l'agrandit jusqu'à devenir la fenêtre ; la croix ou Échap fait l'inverse. Chaque fenêtre est chargée à la demande.
   API : window.Application = { aller(i|id), suivant(), precedent(), ouvrir(id), fermer(), commande(texte), etat(), fenetres } ; événements du bus : app:carrousel, app:ouvert, app:ferme. */
(function(){
  const FENETRES=[
    {id:'rayle',nom:'Rayle',alias:['rayle','accueil','maison','l accueil'],sous:'Accueil'},
    {id:'terminal',nom:'Terminal',alias:['terminal','trading','le terminal','marche','marches','bourse'],sous:'Terminal de trading'},
    {id:'anatomie',nom:'Anatomie',alias:['anatomie','squelette','le corps','corps humain','muscles'],sous:'Anatomie 3D'},
    {id:'terre',nom:'Terre',alias:['terre','actualite','actualites','la terre','globe','planete','monde','news'],sous:'Terre · actualité'},
    {id:'dev3d',nom:'Développement 3D',alias:['developpement','developpement 3d','atelier','maquette','maquettes','neptune','3d','bim'],sous:'Développement 3D'}
  ];
  const PLANETE={anatomie:'saturne',terre:'terre',dev3d:'neptune'};
  const N=FENETRES.length, corps=document.body, bus=()=>window.RayleBus;
  let cible=0, pos=0, vel=0, ouvert=null, racine=null, scene=null, croix=null, panneaux=[], boucleActive=false, dernierT=0;
  let x0=null, y0=null, glisse=false, bloqueClic=false, posDebut=0, xPrec=0, tPrec=0, vPointeur=0;
  const attendre=ms=>new Promise(r=>setTimeout(r,ms));
  const largeur=()=>window.innerWidth||document.documentElement.clientWidth||1;
  const reduit=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ───── construction ───── */
  function construire(){
    racine=document.createElement('div'); racine.id='app-car'; racine.setAttribute('role','region'); racine.setAttribute('aria-label','Fenêtres de Raylé');
    racine.innerHTML='<div class="ac-scene">'+FENETRES.map(f=>'<div class="ac-p" data-id="'+f.id+'" role="button" tabindex="0" aria-label="'+f.nom+'"><div class="ac-cadre"><header><b>'+f.nom+'</b><small>'+f.sous+'</small></header><div class="ac-mini"><canvas aria-hidden="true"></canvas></div><footer><span></span><em>Cliquer pour entrer</em></footer></div></div>').join('')+'</div>'
      +'<button type="button" class="ac-fleche ac-g" aria-label="Fenêtre précédente">‹</button><button type="button" class="ac-fleche ac-d" aria-label="Fenêtre suivante">›</button>'
      +'<nav class="ac-points" aria-label="Choisir une fenêtre">'+FENETRES.map((f,i)=>'<button type="button" data-i="'+i+'" aria-label="'+f.nom+'" title="'+f.nom+'"></button>').join('')+'</nav><div class="ac-nom" aria-live="polite"></div>';
    document.body.appendChild(racine); scene=racine.querySelector('.ac-scene'); panneaux=[...racine.querySelectorAll('.ac-p')];
    croix=document.createElement('button'); croix.type='button'; croix.id='app-croix'; croix.hidden=true; croix.setAttribute('aria-label','Fermer la fenêtre et revenir au carrousel'); croix.title='Fermer (Échap)'; croix.innerHTML='<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg>';
    document.body.appendChild(croix);
    racine.addEventListener('click',e=>{
      if(bloqueClic){ e.preventDefault(); return; }
      if(e.target.closest('.ac-g')){ precedent(); return; } if(e.target.closest('.ac-d')){ suivant(); return; }
      const pt=e.target.closest('.ac-points [data-i]'); if(pt){ aller(+pt.dataset.i); return; }
      const p=e.target.closest('.ac-p'); if(!p||p.classList.contains('ac-cache')) return;
      const i=FENETRES.findIndex(f=>f.id===p.dataset.id);
      if(i===cible&&i>0) ouvrir(p.dataset.id); else aller(i);
    });
    racine.addEventListener('keydown',e=>{ if((e.key==='Enter'||e.key===' ')&&e.target.classList&&e.target.classList.contains('ac-p')){ e.preventDefault(); e.target.click(); } });
    croix.addEventListener('click',()=>fermer());
  }

  /* ───── mise en page 3D : le panneau du centre est grand, les voisins inclinés et plus petits ───── */
  function placer(){
    const L=largeur(), etroit=L<=820, decal=(etroit?0.62:0.5)*L;
    const ids=[];
    panneaux.forEach((p,i)=>{
      const d=i-pos, a=Math.abs(d), s=Math.sign(d)||1;
      const x=s*(a<=1?a*decal:decal+(a-1)*decal*0.55), rot=-s*Math.min(a,1.6)*(etroit?34:40), ech=Math.max(0.35,1-Math.min(a,1.6)*0.36), z=-Math.min(a,2)*170;
      let op=a<=1?1-a*0.18:Math.max(0,0.82-(a-1)*0.9);
      if(i===0) op*=Math.min(1,a*1.6);        // Rayle : au centre, le panneau s'efface, c'est l'accueil lui-même qui est là
      if(i===0&&a<0.3) op=0;
      // à l'accueil, les voisins restent discrets pour ne pas gêner les blocs de l'accueil
      if(i!==0&&pos<0.6&&Math.abs(i-pos)>0.5) op*=0.55+0.45*Math.min(1,pos/0.6);
      const y=(i>0&&pos<0.8)?(1-pos/0.8)*(1-Math.min(1,Math.abs(i-1)))*110:0;
      p.style.transform='translate3d('+x.toFixed(1)+'px,'+y.toFixed(0)+'px,'+z.toFixed(0)+'px) rotateY('+rot.toFixed(1)+'deg) scale('+ech.toFixed(3)+')';
      p.style.opacity=op.toFixed(3); p.style.zIndex=String(100-Math.round(a*10)); p.classList.toggle('ac-centre',a<0.5); p.classList.toggle('ac-cache',op<0.05||(i===0&&a<0.3));
      p.setAttribute('aria-hidden',op<0.05?'true':'false'); p.tabIndex=(a<0.5&&op>0.05)?0:-1;
      if(a<1.7&&op>0.04) ids.push(FENETRES[i].id);
    });
    corps.style.setProperty('--app-home',String(Math.max(0,Math.min(1,1-pos*1.7)).toFixed(3)));
    corps.style.setProperty('--app-dx',(-pos*30).toFixed(1)+'px');
    corps.dataset.appI=String(cible); corps.classList.toggle('app-accueil',cible===0&&pos<0.35);
    racine.querySelectorAll('.ac-points button').forEach((b,i)=>{ b.classList.toggle('on',i===cible); b.setAttribute('aria-current',i===cible?'true':'false'); });
    racine.querySelector('.ac-g').hidden=cible===0; racine.querySelector('.ac-d').hidden=cible===N-1;
    if(!ouvert){
      for(const id of ids){ const p=panneaux[FENETRES.findIndex(f=>f.id===id)], c=p&&p.querySelector('canvas'); if(c&&!c.dataset.m&&window.Miniatures){ c.dataset.m='1'; window.Miniatures.creer(id,c); } }
      if(window.Miniatures) window.Miniatures.visibles(ids);
    } else if(window.Miniatures) window.Miniatures.visibles([]);
  }

  /* ───── mouvement : ressort amorti (inertie) ───── */
  function boucle(t){
    const dt=Math.min(0.05,(t-dernierT)/1000||0.016); dernierT=t;
    if(glisse){ placer(); boucleActive=false; return; }
    const k=reduit()?400:95, c=2*Math.sqrt(k);
    const acc=k*(cible-pos)-c*vel; vel+=acc*dt; pos+=vel*dt;
    if(Math.abs(cible-pos)<0.0006&&Math.abs(vel)<0.004){ pos=cible; vel=0; placer(); boucleActive=false; return; }
    placer(); requestAnimationFrame(boucle);
  }
  function lancer(){ if(boucleActive) return; boucleActive=true; dernierT=performance.now(); requestAnimationFrame(boucle); }
  function aller(c,opts){
    if(ouvert&&!(opts&&opts.force)) return false;
    const i=typeof c==='number'?c:FENETRES.findIndex(f=>f.id===c); if(i<0) return false;
    cible=Math.max(0,Math.min(N-1,i)); lancer();
    try{ bus().emit('app:carrousel',{index:cible,id:FENETRES[cible].id}); bus().fusion('app',{vue:FENETRES[cible].id,ouvert:null}); }catch(e){}
    return true;
  }
  const suivant=()=>aller(cible+1), precedent=()=>aller(cible-1);

  /* ───── balayage (souris et doigt) : le panneau suit le doigt, puis l'élan décide ───── */
  const IGNORE='input,textarea,select,[contenteditable="true"],.cfg,#cfg,.pn,#panneaux,#tb-reglages,.ar-fen,#vueTerminal,#vueGalaxie,.g1-dock,.ac-fleche,.ac-points';
  function bas(e){
    if(ouvert||(e.pointerType==='mouse'&&e.button!==0)||e.target.closest(IGNORE)) return;
    x0=e.clientX; y0=e.clientY; glisse=false; posDebut=pos; xPrec=x0; tPrec=performance.now(); vPointeur=0;
  }
  function deplace(e){
    if(x0==null) return; const mx=e.clientX-x0, my=e.clientY-y0;
    if(!glisse){ if(Math.abs(my)>14&&Math.abs(my)>Math.abs(mx)){ x0=null; return; } if(Math.abs(mx)>9&&Math.abs(mx)>Math.abs(my)*1.15){ glisse=true; vel=0; corps.classList.add('app-glisse'); } }
    if(glisse){
      const unite=(largeur()<=820?0.62:0.5)*largeur(); let p=posDebut-mx/unite; if(p<0) p*=0.35; if(p>N-1) p=N-1+(p-(N-1))*0.35; pos=p;
      const n=performance.now(), dtp=Math.max(1,n-tPrec); vPointeur=0.8*vPointeur+0.2*(-(e.clientX-xPrec)/unite/(dtp/1000)); xPrec=e.clientX; tPrec=n; placer();
    }
  }
  function haut(){
    if(x0==null) return; const etait=glisse; x0=null; glisse=false; corps.classList.remove('app-glisse');
    if(etait){
      bloqueClic=true; setTimeout(()=>{ bloqueClic=false; },70);
      const v=(performance.now()-tPrec>90)?0:Math.max(-4,Math.min(4,vPointeur)); vel=v*0.6; cible=Math.max(0,Math.min(N-1,Math.round(pos+v*0.14)));
      try{ bus().emit('app:carrousel',{index:cible,id:FENETRES[cible].id}); bus().fusion('app',{vue:FENETRES[cible].id,ouvert:null}); }catch(e){}
      lancer();
    }
  }
  let rouleau=0;
  function molette(e){
    if(ouvert||e.target.closest(IGNORE)) return; if(Math.abs(e.deltaX)<=Math.abs(e.deltaY)||Math.abs(e.deltaX)<30) return;
    const n=performance.now(); if(n-rouleau<450) return; rouleau=n; e.deltaX>0?suivant():precedent();
  }
  function touche(e){
    if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test((e.target&&e.target.tagName)||'')||(e.target&&e.target.isContentEditable)) return;
    if(ouvert){ if(ouvert==='anatomie'&&(e.key==='m'||e.key==='M')){ e.preventDefault(); e.stopImmediatePropagation(); return; } if(e.key==='Escape'){ e.preventDefault(); e.stopImmediatePropagation(); fermer(); } return; }
    if(corps.classList.contains('cfg-ouvert')||(document.getElementById('cfg')&&document.getElementById('cfg').classList.contains('open'))) return;
    if(e.key==='ArrowRight'){ e.preventDefault(); suivant(); } else if(e.key==='ArrowLeft'){ e.preventDefault(); precedent(); }
    else if(e.key==='Enter'&&cible>0&&(document.activeElement===document.body)){ ouvrir(FENETRES[cible].id); }
    else if(e.key==='Home'){ aller(0); }
  }

  /* ───── agrandissement : le panneau grandit jusqu'à devenir la fenêtre (et inversement) ───── */
  function rectPanneau(id){ const p=panneaux[FENETRES.findIndex(f=>f.id===id)]; return p?p.querySelector('.ac-cadre').getBoundingClientRect():null; }
  function grandir(id){
    const r=rectPanneau(id); if(!r||reduit()) return null;
    const g=document.createElement('div'); g.className='ac-grow'; let img=null; try{ img=window.Miniatures&&window.Miniatures.instantane(id); }catch(e){}
    if(img) g.style.backgroundImage='url('+img+')';
    g.style.left=r.left+'px'; g.style.top=r.top+'px'; g.style.width=r.width+'px'; g.style.height=r.height+'px'; document.body.appendChild(g);
    void g.offsetWidth; g.style.left='0px'; g.style.top='0px'; g.style.width='100vw'; g.style.height='100vh'; return g;
  }
  async function rentrer(id){
    if(reduit()) return;
    const r=rectPanneau(id); if(!r) return;
    const g=document.createElement('div'); g.className='ac-grow'; g.style.left='0px'; g.style.top='0px'; g.style.width='100vw'; g.style.height='100vh'; document.body.appendChild(g);
    void g.offsetWidth; g.style.left=r.left+'px'; g.style.top=r.top+'px'; g.style.width=r.width+'px'; g.style.height=r.height+'px'; await attendre(470); g.classList.add('ac-fond'); await attendre(420); g.remove();
  }

  /* ───── ouvrir et fermer ───── */
  const vueOuverte=()=>{ try{ return bus().demander('vue'); }catch(e){ return 'rayle'; } };
  async function ouvrirPlanete(id,opts){
    corps.classList.add('app-direct'); corps.dataset.appDirect=id;
    await bus().demander('vue:ouvrir','galaxie');
    let n=0; while(!window.Galaxie&&n++<80) await attendre(50);
    if(!window.Galaxie) throw new Error('le moteur 3D n’a pas démarré');
    window.Galaxie.entrerPlanete(PLANETE[id]);
    if(id==='terre'&&!(opts&&opts.sansActu)){ n=0; while(!(window.Terre&&window.Terre.etat&&window.Terre.etat().actif&&window.Terre.etat().entree)&&n++<150) await attendre(100); try{ if(window.Terre&&window.Terre.afficherFil) window.Terre.afficherFil({portee:'france'}).catch(e=>console.warn('[app] actualité :',e&&e.message)); }catch(e){ console.warn('[app] actualité :',e); } }
    if(id==='anatomie'){ n=0; const pret=()=>{ const s=window.Saturne&&window.Saturne.etat&&window.Saturne.etat(); return !!(s&&s.actif&&s.entree&&!s.transition); }; while(!pret()&&n++<200) await attendre(80); try{ await window.Saturne.salleMedicale(); }catch(e){ console.warn('[app] salle médicale :',e); } }
  }
  async function ouvrir(id,opts){
    const f=FENETRES.find(x=>x.id===id); if(!f||id==='rayle') return aller(0,{force:true});
    if(ouvert===id) return true; if(ouvert) await fermer({silencieux:true,sansAnim:true});
    const i=FENETRES.indexOf(f); if(Math.abs(pos-i)>0.5){ cible=i; pos=i; vel=0; placer(); }
    const g=grandir(id);
    ouvert=id; corps.classList.add('app-ouvert'); croix.hidden=false; corps.dataset.appOuvert=id; placer();
    try{
      if(id==='terminal') await bus().demander('vue:ouvrir','terminal'); else await ouvrirPlanete(id,opts);
    }catch(e){
      console.error('[app] ouverture de '+id+' :',e); try{ bus().emit('vue:erreur',{message:f.nom+' n’a pas pu s’ouvrir : '+(e&&e.message||e)}); }catch(x){}
      if(g) g.remove(); await fermer({silencieux:true,sansAnim:true}); return false;
    }
    if(g){ await attendre(220); g.classList.add('ac-fond'); setTimeout(()=>g.remove(),450); }
    try{ bus().emit('app:ouvert',{id}); bus().fusion('app',{vue:id,ouvert:id}); }catch(e){}
    return true;
  }
  async function fermer(opts){
    if(!ouvert) return false; const id=ouvert; ouvert=null;
    try{
      if(id==='terminal'){ if(vueOuverte()==='terminal') await bus().demander('vue:fermer'); }
      else{
        window.dispatchEvent(new CustomEvent('galaxie:sortie',{detail:{app:true}}));
        try{ if(window.Galaxie&&window.Galaxie.nav) window.Galaxie.nav.fermerSas(); }catch(e){}
        await attendre(900);
        if(window.Galaxie) window.Galaxie.modeDirect(false);
        if(vueOuverte()==='galaxie') await bus().demander('vue:fermer');
      }
    }catch(e){ console.warn('[app] fermeture :',e); }
    corps.classList.remove('app-ouvert','app-direct'); delete corps.dataset.appOuvert; delete corps.dataset.appDirect; croix.hidden=true;
    placer(); lancer();
    if(!(opts&&opts.sansAnim)) rentrer(id);
    try{ bus().emit('app:ferme',{id}); bus().fusion('app',{vue:FENETRES[cible].id,ouvert:null}); }catch(e){}
    return true;
  }
  /* une fenêtre qui se ferme toute seule (Échap dans le module, bouton retour du terminal) : le carrousel reprend la main */
  function surVue(d){ if(d&&d.vue==='rayle'&&ouvert==='terminal'){ const id=ouvert; ouvert=null; corps.classList.remove('app-ouvert','app-direct'); croix.hidden=true; placer(); lancer(); rentrer(id); try{ bus().emit('app:ferme',{id}); }catch(e){} } }
  function surSortiePlanete(e){ if(ouvert&&ouvert!=='terminal'&&!(e.detail&&e.detail.app)){ fermer(); } }

  /* ───── voix et texte : « ouvre le terminal », « suivant », « ferme » ───── */
  const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’']/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  function trouver(n){
    let best=null,len=0; for(const f of FENETRES) for(const a of f.alias){ if(a.length>len&&new RegExp('(^| )'+a+'( |$)').test(n)){ best=f; len=a.length; } }
    return best;
  }
  function commande(texte){
    const n=norm(texte).replace(/^(hey |dis moi |dis )?rayle /,'');
    if(/^(ferme|fermer|quitte|quitter|reviens|retour|retourne)( (la |cette )?(fenetre|ecran|page))?( au carrousel| a l accueil| au menu)?$/.test(n)||/^(ferme (tout|la fenetre|cette fenetre|l ecran)|retour au carrousel|retour a l accueil|va a l accueil|accueil)$/.test(n)){
      if(ouvert) return fermer().then(()=> 'Fermé.'); if(cible>0){ aller(0); return 'Retour à l’accueil.'; } return null; }
    if(/^(suivant|suivante|a droite|va a droite|fenetre suivante|ecran suivant|glisse a droite|balaie a droite)$/.test(n)){ if(ouvert) return null; if(cible>=N-1) return 'C’est la dernière fenêtre.'; suivant(); return FENETRES[cible].nom+'.'; }
    if(/^(precedent|precedente|a gauche|va a gauche|fenetre precedente|ecran precedent|glisse a gauche|balaie a gauche)$/.test(n)){ if(ouvert) return null; if(cible<=0) return 'Tu es déjà à l’accueil.'; precedent(); return FENETRES[cible].nom+'.'; }
    const m=/^(ouvre|ouvrir|affiche|montre|va|vas|aller|lance|emmene moi|amene moi|passe|passe sur|mets|met)( moi)?( (a|au|aux|sur|dans|vers|le|la|les|l|un|une))*( |$)(.*)$/.exec(n);
    if(m){ const f=trouver(m[6]||''); if(f&&f.id!=='rayle'){ ouvrir(f.id); return f.id==='terre'?'J’ouvre la Terre.':'J’ouvre '+(f.id==='terminal'?'le terminal':f.id==='anatomie'?'l’anatomie':'le développement 3D')+'.'; } if(f&&f.id==='rayle'){ aller(0,{force:true}); return 'Retour à l’accueil.'; } }
    if(/^(montre|affiche|donne)( moi)? (l |les )?(actualite|actualites|infos|news)( du jour)?$/.test(n)||/^(quoi de neuf|que se passe t il dans le monde)$/.test(n)){ ouvrir('terre'); return 'Je monte sur la Terre pour l’actualité.'; }
    return null;
  }

  function demarrer(){
    construire(); placer();
    window.addEventListener('pointerdown',bas,{passive:true}); window.addEventListener('pointermove',deplace,{passive:true}); window.addEventListener('pointerup',haut,{passive:true}); window.addEventListener('pointercancel',haut,{passive:true});
    window.addEventListener('wheel',molette,{passive:true}); window.addEventListener('keydown',touche,true);
    window.addEventListener('galaxie:sortie',surSortiePlanete);
    window.addEventListener('resize',()=>placer());
    document.addEventListener('visibilitychange',()=>{ if(document.hidden&&window.Miniatures) window.Miniatures.visibles([]); else placer(); });
    try{ bus().on('vue:changee',surVue); }catch(e){}
    corps.classList.add('app');
  }
  window.Application={fenetres:FENETRES.map(f=>({id:f.id,nom:f.nom,sous:f.sous})),aller,suivant,precedent,ouvrir,fermer,commande,etat:()=>({index:cible,id:FENETRES[cible].id,ouvert,position:+pos.toFixed(3)}),_norm:norm,_trouver:id=>trouver(norm(id))};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',demarrer); else demarrer();
})();
