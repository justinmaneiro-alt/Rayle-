"use strict";
/* ═════════════ APPLICATION RAYLÉ : carrousel de fenêtres ═════════════
   Cinq fenêtres, dans l'ordre : Rayle (l'accueil) · Terminal · Anatomie · Terre (actualité) · Développement 3D.
   On passe de l'une à l'autre en balayant (souris, doigt), avec les flèches du clavier, la molette horizontale ou la voix.
   On n'ENTRE dans une fenêtre qu'en cliquant dessus ; la croix en haut à droite la ferme et ramène au carrousel.
   Chaque fenêtre est chargée à la demande (rien n'est chargé avant le premier clic).
   API : window.Application = { aller(i|id), suivant(), precedent(), ouvrir(id), fermer(), etat(), fenetres } ; événements du bus : app:carrousel, app:ouvert, app:ferme. */
(function(){
  const FENETRES=[
    {id:'rayle',nom:'Rayle',alias:['rayle','accueil','maison','l accueil'],sous:'Accueil',desc:'Ton assistante, la météo et l’actualité du jour.',icone:''},
    {id:'terminal',nom:'Terminal',alias:['terminal','trading','le terminal','marche','marches','bourse'],sous:'Terminal de trading',desc:'Graphiques, niveaux, alertes et carnet d’ordres.',icone:'<svg viewBox="0 0 64 64"><path class="ac-tr" d="M6 52h52M8 44l14-16 12 9 22-24"/><path class="ac-tr" d="M44 13h12v12" /></svg>'},
    {id:'anatomie',nom:'Anatomie',alias:['anatomie','squelette','le corps','corps humain','muscles'],sous:'Anatomie 3D',desc:'Squelette, muscles, ligaments, mouvements.',icone:'<svg viewBox="0 0 64 64"><circle class="ac-tr" cx="32" cy="12" r="7"/><path class="ac-tr" d="M32 19v26M20 26h24M24 26l-4 18M40 26l4 18M32 45l-8 14M32 45l8 14"/></svg>'},
    {id:'terre',nom:'Terre',alias:['terre','actualite','actualites','la terre','globe','planete','monde','news'],sous:'Terre · actualité',desc:'Globe 3D, événements en direct, recherche.',icone:'<svg viewBox="0 0 64 64"><circle class="ac-tr" cx="32" cy="32" r="24"/><ellipse class="ac-tr" cx="32" cy="32" rx="10" ry="24"/><path class="ac-tr" d="M8 32h48M12 20h40M12 44h40"/></svg>'},
    {id:'dev3d',nom:'Développement 3D',alias:['developpement','developpement 3d','atelier','maquette','maquettes','neptune','3d','bim'],sous:'Développement 3D',desc:'Atelier de maquettes et de mondes 3D.',icone:'<svg viewBox="0 0 64 64"><path class="ac-tr" d="M32 6l22 12v28L32 58 10 46V18z"/><path class="ac-tr" d="M10 18l22 12 22-12M32 30v28"/></svg>'}
  ];
  const PLANETE={anatomie:'saturne',terre:'terre',dev3d:'neptune'};
  const corps=document.body, bus=()=>window.RayleBus;
  let index=0, ouvert=null, dx=0, x0=null, y0=null, glisse=false, bloqueClic=false, racine=null, piste=null, croix=null;
  const attendre=ms=>new Promise(r=>setTimeout(r,ms));
  const largeur=()=>window.innerWidth||document.documentElement.clientWidth||1;

  /* ───── construction ───── */
  function construire(){
    racine=document.createElement('div'); racine.id='app-car'; racine.setAttribute('role','region'); racine.setAttribute('aria-label','Fenêtres de Raylé');
    racine.innerHTML='<div class="ac-piste">'+FENETRES.map((f,i)=>i===0
      ?'<section class="ac-vue ac-accueil" data-id="rayle" aria-label="Accueil"></section>'
      :'<section class="ac-vue" data-id="'+f.id+'" aria-label="'+f.nom+'"><button type="button" class="ac-carte" data-ouvrir="'+f.id+'" aria-label="Ouvrir '+f.nom+'"><span class="ac-icone">'+f.icone+'</span><b>'+f.sous+'</b><small>'+f.desc+'</small><em>Toucher pour entrer</em></button></section>').join('')+'</div>'
      +'<button type="button" class="ac-fleche ac-g" aria-label="Fenêtre précédente">‹</button><button type="button" class="ac-fleche ac-d" aria-label="Fenêtre suivante">›</button>'
      +'<nav class="ac-points" aria-label="Choisir une fenêtre">'+FENETRES.map((f,i)=>'<button type="button" data-i="'+i+'" aria-label="'+f.nom+'" title="'+f.nom+'"></button>').join('')+'</nav>'
      +'<div class="ac-nom" aria-live="polite"></div>';
    document.body.appendChild(racine); piste=racine.querySelector('.ac-piste');
    croix=document.createElement('button'); croix.type='button'; croix.id='app-croix'; croix.hidden=true; croix.setAttribute('aria-label','Fermer la fenêtre et revenir au carrousel'); croix.title='Fermer (Échap)'; croix.innerHTML='<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg>';
    document.body.appendChild(croix);
    racine.addEventListener('click',e=>{
      if(bloqueClic){ e.preventDefault(); return; }
      const o=e.target.closest('[data-ouvrir]'); if(o){ ouvrir(o.dataset.ouvrir); return; }
      if(e.target.closest('.ac-g')) precedent(); else if(e.target.closest('.ac-d')) suivant();
      const p=e.target.closest('.ac-points [data-i]'); if(p) aller(+p.dataset.i);
    });
    croix.addEventListener('click',()=>fermer());
  }

  /* ───── position ───── */
  function appliquer(anime){
    const pos=Math.max(0,Math.min(FENETRES.length-1,index-dx/largeur()));
    piste.style.transition=anime?'transform .42s cubic-bezier(.2,.8,.2,1)':'none';
    piste.style.transform='translate3d('+(-pos*100)+'vw,0,0)';
    corps.style.setProperty('--app-p',Math.min(1,pos).toFixed(3));
    corps.dataset.appI=String(index);
    corps.classList.toggle('app-accueil',index===0);
    racine.querySelectorAll('.ac-points button').forEach((b,i)=>{ b.classList.toggle('on',i===index); b.setAttribute('aria-current',i===index?'true':'false'); });
    racine.querySelector('.ac-g').hidden=index===0; racine.querySelector('.ac-d').hidden=index===FENETRES.length-1;
    racine.querySelector('.ac-nom').textContent=index===0?'':FENETRES[index].nom;
    racine.querySelectorAll('.ac-vue').forEach((s,i)=>{ s.setAttribute('aria-hidden',i===index?'false':'true'); const b=s.querySelector('button'); if(b) b.tabIndex=i===index?0:-1; });
  }
  function aller(cible,opts){
    if(ouvert&&!(opts&&opts.force)) return false;
    let i=typeof cible==='number'?cible:FENETRES.findIndex(f=>f.id===cible); if(i<0) return false;
    index=Math.max(0,Math.min(FENETRES.length-1,i)); dx=0; appliquer(true);
    try{ bus().emit('app:carrousel',{index,id:FENETRES[index].id}); bus().fusion('app',{vue:FENETRES[index].id,ouvert:null}); }catch(e){}
    return true;
  }
  const suivant=()=>aller(index+1), precedent=()=>aller(index-1);

  /* ───── balayage (souris et doigt) ───── */
  const IGNORE='input,textarea,select,[contenteditable="true"],.cfg,#cfg,.pn,#panneaux,#tb-reglages,.ar-fen,#vueTerminal,#vueGalaxie';
  function bas(e){
    if(ouvert||(e.pointerType==='mouse'&&e.button!==0)||e.target.closest(IGNORE)) return;
    x0=e.clientX; y0=e.clientY; dx=0; glisse=false;
  }
  function deplace(e){
    if(x0==null) return; const mx=e.clientX-x0, my=e.clientY-y0;
    if(!glisse){ if(Math.abs(my)>14&&Math.abs(my)>Math.abs(mx)){ x0=null; return; } if(Math.abs(mx)>10&&Math.abs(mx)>Math.abs(my)*1.2){ glisse=true; corps.classList.add('app-glisse'); } }
    if(glisse){ dx=mx; if((index===0&&dx>0)||(index===FENETRES.length-1&&dx<0)) dx*=0.3; appliquer(false); }
  }
  function haut(){
    if(x0==null) return; const seuil=Math.min(90,largeur()*0.16), d=dx, etaitGlisse=glisse;
    x0=null; glisse=false; corps.classList.remove('app-glisse'); dx=0;
    if(etaitGlisse){ bloqueClic=true; setTimeout(()=>{ bloqueClic=false; },60); if(d<-seuil) suivant(); else if(d>seuil) precedent(); else appliquer(true); }
  }
  let rouleau=0;
  function molette(e){
    if(ouvert||e.target.closest(IGNORE)) return; if(Math.abs(e.deltaX)<=Math.abs(e.deltaY)||Math.abs(e.deltaX)<30) return;
    const n=performance.now(); if(n-rouleau<450) return; rouleau=n; e.deltaX>0?suivant():precedent();
  }
  function touche(e){
    if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test((e.target&&e.target.tagName)||'')||(e.target&&e.target.isContentEditable)) return;
    if(ouvert){ if(ouvert==='anatomie'&&(e.key==='m'||e.key==='M')){ e.preventDefault(); e.stopImmediatePropagation(); return; } if(e.key==='Escape'){ e.preventDefault(); e.stopImmediatePropagation(); fermer(); } return; }
    if(corps.classList.contains('cfg-ouvert')||document.getElementById('cfg')&&document.getElementById('cfg').classList.contains('open')) return;
    if(e.key==='ArrowRight'){ e.preventDefault(); suivant(); } else if(e.key==='ArrowLeft'){ e.preventDefault(); precedent(); }
    else if(e.key==='Enter'&&index>0&&document.activeElement===document.body){ ouvrir(FENETRES[index].id); }
    else if(e.key==='Home'){ aller(0); }
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
    if(ouvert===id) return true; if(ouvert) await fermer({silencieux:true});
    ouvert=id; const i=FENETRES.indexOf(f); index=i; appliquer(false);
    corps.classList.add('app-ouvert'); croix.hidden=false; corps.dataset.appOuvert=id;
    try{
      if(id==='terminal') await bus().demander('vue:ouvrir','terminal'); else await ouvrirPlanete(id,opts);
    }catch(e){
      console.error('[app] ouverture de '+id+' :',e); try{ bus().emit('vue:erreur',{message:f.nom+' n’a pas pu s’ouvrir : '+(e&&e.message||e)}); }catch(x){}
      await fermer({silencieux:true}); return false;
    }
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
    appliquer(true);
    try{ bus().emit('app:ferme',{id}); bus().fusion('app',{vue:FENETRES[index].id,ouvert:null}); }catch(e){}
    return true;
  }
  /* une fenêtre qui se ferme toute seule (Échap dans le module, bouton retour du terminal) : le carrousel reprend la main */
  function surVue(d){ if(d&&d.vue==='rayle'&&ouvert==='terminal'){ ouvert=null; corps.classList.remove('app-ouvert','app-direct'); croix.hidden=true; appliquer(true); try{ bus().emit('app:ferme',{id:'terminal'}); }catch(e){} } }
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
      if(ouvert) return fermer().then(()=> 'Fermé.'); if(index>0){ aller(0); return 'Retour à l’accueil.'; } return null; }
    if(/^(suivant|suivante|a droite|va a droite|fenetre suivante|ecran suivant|glisse a droite|balaie a droite)$/.test(n)){ if(ouvert) return null; if(index>=FENETRES.length-1) return 'C’est la dernière fenêtre.'; suivant(); return FENETRES[index].nom+'.'; }
    if(/^(precedent|precedente|a gauche|va a gauche|fenetre precedente|ecran precedent|glisse a gauche|balaie a gauche)$/.test(n)){ if(ouvert) return null; if(index<=0) return 'Tu es déjà à l’accueil.'; precedent(); return FENETRES[index].nom+'.'; }
    const m=/^(ouvre|ouvrir|affiche|montre|va|vas|aller|lance|emmene moi|amene moi|passe|passe sur|mets|met)( moi)?( (a|au|aux|sur|dans|vers|le|la|les|l|un|une))*( |$)(.*)$/.exec(n);
    if(m){ const f=trouver(m[6]||''); if(f&&f.id!=='rayle'){ ouvrir(f.id); return f.id==='terre'?'J’ouvre la Terre.':'J’ouvre '+(f.id==='terminal'?'le terminal':f.id==='anatomie'?'l’anatomie':'le développement 3D')+'.'; } if(f&&f.id==='rayle'){ aller(0,{force:true}); return 'Retour à l’accueil.'; } }
    if(/^(montre|affiche|donne)( moi)? (l |les )?(actualite|actualites|infos|news)( du jour)?$/.test(n)||/^(quoi de neuf|que se passe t il dans le monde)$/.test(n)){ ouvrir('terre'); return 'Je monte sur la Terre pour l’actualité.'; }
    return null;
  }

  function demarrer(){
    construire(); appliquer(false);
    window.addEventListener('pointerdown',bas,{passive:true}); window.addEventListener('pointermove',deplace,{passive:true}); window.addEventListener('pointerup',haut,{passive:true}); window.addEventListener('pointercancel',haut,{passive:true});
    window.addEventListener('wheel',molette,{passive:true}); window.addEventListener('keydown',touche,true);
    window.addEventListener('galaxie:sortie',surSortiePlanete);
    window.addEventListener('resize',()=>appliquer(false));
    try{ bus().on('vue:changee',surVue); }catch(e){}
    corps.classList.add('app');
  }
  window.Application={fenetres:FENETRES.map(f=>({id:f.id,nom:f.nom,sous:f.sous})),aller,suivant,precedent,ouvrir,fermer,commande,etat:()=>({index,id:FENETRES[index].id,ouvert}),_norm:norm,_trouver:id=>trouver(norm(id))};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',demarrer); else demarrer();
})();
