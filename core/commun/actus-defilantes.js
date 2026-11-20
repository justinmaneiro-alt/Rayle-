"use strict";
/* ═════════════ ACTUALITÉ DÉFILANTE DE L'ACCUEIL (v4) : France · Monde · Marchés ═════════════
   Remplace les 3 sujets fixes du panneau « À la une » par une liste qui défile (molette, doigt) de 30 à 60 articles récents, sans doublon, avec image, source et âge.
   Même emplacement et même taille que l'ancien panneau (hauteur fixe de la liste ; voir accueil-rayle.css).
   Données : snapshots « actus-accueil-<onglet>.json » publiés toutes les 5 minutes par le robot GitHub (sources RSS publiques) : indépendant du PC. Dernière copie gardée sur l'appareil.
   Rafraîchissement automatique sans faire sauter la lecture : si la liste n'est pas en haut, les nouveaux articles attendent derrière un bouton « N nouveaux ».
   Toucher un article : fenêtre de lecture de Rayle (titre, image, extrait du flux) + « Ouvrir l'article » + « Rayle me le résume ».
   Fonctions pures exposées pour les tests : window.ActusDefilantes.pur. */
(function(){
  const BASE_DEFAUT='https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/';
  const ONGLETS=[['france','France'],['monde','Monde'],['marches','Marchés']];
  const CLE_ONGLET='rayle_ad_onglet', CLE_COPIE='rayle_ad_copie_', RAFRAICHIR=5*60*1000;

  /* ───── fonctions pures ───── */
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cle=a=>String(a&&a.titre||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim().slice(0,60);
  function age(t,now){ if(!Number.isFinite(t)) return ''; const m=Math.max(0,Math.round(((now||Date.now())-t)/60000)); if(m<1) return 'à l’instant'; if(m<60) return 'il y a '+m+' min'; const h=Math.round(m/60); if(h<48) return 'il y a '+h+' h'; return 'il y a '+Math.round(h/24)+' j'; }
  /* fusion sans doublon (même lien ou même début de titre), du plus récent au plus ancien */
  function fusionner(anciens,nouveaux,max){
    const vus=new Set(), liens=new Set(), out=[];
    for(const a of [].concat(nouveaux||[],anciens||[]).sort((x,y)=>(y.date||0)-(x.date||0))){ if(!a||!a.titre) continue; const k=cle(a); if(vus.has(k)||(a.lien&&liens.has(a.lien))) continue; vus.add(k); if(a.lien) liens.add(a.lien); out.push(a); if(out.length>=(max||80)) break; }
    return out;
  }
  /* parmi `recus`, ceux qu'on n'a pas encore (clés de titre) */
  function nouveautes(connus,recus){ const k=new Set((connus||[]).map(cle)); const vus=new Set(); return (recus||[]).filter(a=>{ const c=cle(a); if(!c||k.has(c)||vus.has(c)) return false; vus.add(c); return true; }); }
  const pur={esc,cle,age,fusionner,nouveautes,ONGLETS};

  /* ───── interface ───── */
  const lsLire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const lsEcrire=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
  const base=()=>{ const b=lsLire('rayle_donnees_base')||BASE_DEFAUT; return b.replace(/\/*$/,'/'); };
  const E={ zone:null, onglet:'france', par:{}, liste:null, badge:null, pied:null, tabs:null, article:null, ouvert:null };
  const donnees=o=>E.par[o]||(E.par[o]={items:[],t:null,erreur:null});
  const initiale=a=>(String(a.source||a.titre||'R').trim().charAt(0)||'R').toUpperCase();

  function ligne(a){
    const img=a.image?'<img loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="" src="'+esc(a.image)+'" onerror="this.remove()">':'';
    return '<a class="ad-art" role="listitem" href="'+esc(a.lien||'#')+'" target="_blank" rel="noopener noreferrer" data-k="'+esc(cle(a))+'"><span class="ad-img"><b>'+esc(initiale(a))+'</b>'+img+'</span><span class="ad-txt"><b>'+esc(a.titre)+'</b><small>'+esc(a.source||'')+' · <time data-t="'+(a.date||'')+'">'+esc(age(a.date))+'</time></small></span></a>';
  }
  function dessiner(){
    const D=donnees(E.onglet), L=E.liste; if(!L) return;
    if(!D.items.length){ L.innerHTML='<p class="ar-vide'+(D.erreur?' ar-ko':'')+'">'+esc(D.erreur?'INDISPONIBLE : '+D.erreur:'Chargement des actualités…')+'</p>'; E.badge.hidden=true; majPied(); return; }
    L.innerHTML=D.items.map(ligne).join(''); L.scrollTop=0; D.attente=[]; E.badge.hidden=true; majPied();
  }
  function majPied(){
    const D=donnees(E.onglet); if(!E.pied) return;
    E.pied.textContent=D.items.length?D.items.length+' articles · '+(D.t?'à jour '+age(D.t).replace('il y a ','il y a '):'copie locale')+(D.erreur?' · '+D.erreur:''):'';
  }
  function majAges(){ if(!E.liste) return; const now=Date.now(); E.liste.querySelectorAll('time[data-t]').forEach(t=>{ const v=+t.dataset.t; if(v) t.textContent=age(v,now); }); majPied(); }
  function majBadge(){ const D=donnees(E.onglet), n=(D.attente||[]).length; E.badge.hidden=!n; if(n) E.badge.textContent=n+(n>1?' nouveaux':' nouveau')+' ↑'; }

  /* applique une réponse : en haut de liste → on insère tout de suite ; sinon → derrière le bouton, la position de lecture ne bouge pas */
  function appliquer(o,res,source){
    const D=donnees(o), recus=(res&&res.items||[]).filter(a=>a&&a.titre&&a.lien), premier=!D.items.length;
    D.t=res&&res.t||Date.now(); D.erreur=null; D.source=source||'';
    const neufs=nouveautes(D.items,recus);
    if(premier){ D.items=fusionner([],recus,80); if(o===E.onglet) dessiner(); return; }
    if(!neufs.length){ majPied(); return; }
    if(o!==E.onglet||!E.liste||E.liste.scrollTop<8){ D.items=fusionner(D.items,neufs,80); D.attente=[]; if(o===E.onglet) insererEnHaut(neufs); }
    else { D.attente=fusionner(D.attente||[],neufs,60); majBadge(); }
  }
  function insererEnHaut(neufs){
    const L=E.liste; if(!L) return; const h0=L.scrollHeight, t0=L.scrollTop;
    const frag=document.createElement('div'); frag.innerHTML=neufs.map(ligne).join(''); const premier=L.firstChild; while(frag.firstChild) L.insertBefore(frag.firstChild,premier);
    L.scrollTop=t0+(L.scrollHeight-h0)*(t0>=8?1:0);          // en haut : on reste en haut ; ailleurs : la lecture ne bouge pas
    L.querySelectorAll('.ad-art').forEach((n,i)=>{ if(i>=80) n.remove(); }); majPied();
  }
  function afficherAttente(){
    const D=donnees(E.onglet), neufs=D.attente||[]; if(!neufs.length) return;
    D.items=fusionner(D.items,neufs,80); D.attente=[]; insererEnHaut(neufs); E.badge.hidden=true; E.liste.scrollTo({top:0,behavior:'smooth'});
  }

  async function charger(o,force){
    const D=donnees(o);
    if(!D.items.length){ try{ const c=JSON.parse(lsLire(CLE_COPIE+o)||'null'); if(c&&c.items&&c.items.length){ D.items=fusionner([],c.items,80); D.t=null; D.copieDe=c.t; if(o===E.onglet) dessiner(); } }catch(e){} }
    try{
      const r=await fetch(base()+'actus-accueil-'+o+'.json?'+(Date.now()/60000|0),{cache:'no-cache'}); if(!r.ok) throw new Error('HTTP '+r.status);
      const j=await r.json(); if(!j||!Array.isArray(j.items)||!j.items.length) throw new Error('liste vide');
      appliquer(o,j,'robot GitHub'); lsEcrire(CLE_COPIE+o,JSON.stringify({t:j.t,items:j.items.slice(0,40).map(a=>({titre:a.titre,lien:a.lien,date:a.date,source:a.source,image:a.image,resume:(a.resume||'').slice(0,200)}))}));
    }catch(e){ D.erreur=D.items.length?'copie locale (réseau indisponible)':String(e&&e.message||e).slice(0,80); if(o===E.onglet){ if(!D.items.length) dessiner(); else majPied(); } }
  }

  /* ───── fenêtre de lecture + résumé par Rayle ───── */
  function ouvrirLecture(a){
    const html='<article class="ad-lecture">'+(a.image?'<img class="ad-lec-img" referrerpolicy="no-referrer" alt="" src="'+esc(a.image)+'" onerror="this.remove()">':'')
      +'<h3>'+esc(a.titre)+'</h3><p class="ad-lec-meta">'+esc(a.source||'')+' · '+esc(age(a.date))+'</p><p class="ad-lec-ext">'+(a.resume?esc(a.resume):'<i>Le flux de ce média ne donne pas d’extrait : « Ouvrir l’article » affiche le texte complet.</i>')+'</p>'
      +'<div class="ad-lec-resume" data-ad-resume aria-live="polite"></div></article>';
    const id='actu-lecture';
    if(window.Panneaux){
      Panneaux.ouvrir({id,type:'holo-actus',icone:'◈',titre:a.source||'Actualité',duree:20*60*1000,corps:{html},pied:[
        {texte:'Rayle me le résume',clic:()=>resumer(a,id)},{texte:'Ouvrir l’article',clic:()=>{ try{ window.open(a.lien,'_blank','noopener'); }catch(e){} }}]});
    } else { try{ window.open(a.lien,'_blank','noopener'); }catch(e){} }
  }
  async function resumer(a,id){
    const zone=()=>document.querySelector('#panneaux .pn[data-id="'+id+'"] [data-ad-resume]'); const ecrire=t=>{ const z=zone(); if(z) z.textContent=t; };
    ecrire('Rayle lit l’article…');
    const base='Titre : '+a.titre+'\nMédia : '+(a.source||'inconnu')+'\nExtrait du flux : '+(a.resume||'(aucun extrait)');
    let texte=null, note='';
    try{
      const m=await import(new URL('trader-pro/commun/ia.js',document.baseURI).href);
      const r=await m.demanderIA('Résume cette actualité en 3 phrases courtes, en français, sans rien inventer au-delà de ce qui est donné. Si l’extrait est trop court pour résumer, dis-le simplement.\n\n'+base,{contexte:'résumé d’une actualité'});
      texte=r.texte; note='Résumé fait à partir du titre et de l’extrait du flux (pas du texte complet de l’article).';
    }catch(e){ texte=a.titre+'. '+(a.resume||''); note='Le résumé par l’IA n’est pas disponible ('+String(e&&e.message||e).slice(0,70)+') : voici le titre et l’extrait du flux.'; }
    ecrire(texte+'\n\n'+note); try{ if(typeof window.speak==='function') window.speak(texte); }catch(e){}
  }

  /* ───── montage ───── */
  function monter(article){
    if(!article||E.zone) return; E.zone=article;
    const tete=article.querySelector('header'), corps=article.querySelector('.ar-corps');
    try{ E.onglet=ONGLETS.some(o=>o[0]===lsLire(CLE_ONGLET))?lsLire(CLE_ONGLET):'france'; }catch(e){}
    const bouton=tete.querySelector('.ar-btn'); tete.innerHTML='<nav class="ad-onglets" role="tablist" aria-label="Rubrique d’actualité">'+ONGLETS.map(o=>'<button type="button" role="tab" data-o="'+o[0]+'" aria-selected="'+(o[0]===E.onglet)+'">'+o[1]+'</button>').join('')+'</nav>'; if(bouton) tete.appendChild(bouton);
    corps.className='ar-corps ad-corps'; corps.innerHTML='<div class="ad-liste" role="list" tabindex="0" aria-label="Actualités"></div><button type="button" class="ad-nouveaux" hidden></button><small class="ar-src ad-pied"></small>';
    E.liste=corps.querySelector('.ad-liste'); E.badge=corps.querySelector('.ad-nouveaux'); E.pied=corps.querySelector('.ad-pied'); E.tabs=tete.querySelector('.ad-onglets');
    E.tabs.addEventListener('click',e=>{ const b=e.target.closest('[data-o]'); if(!b||b.dataset.o===E.onglet) return; E.onglet=b.dataset.o; lsEcrire(CLE_ONGLET,E.onglet); E.tabs.querySelectorAll('[data-o]').forEach(x=>x.setAttribute('aria-selected',String(x===b))); dessiner(); majBadge(); charger(E.onglet); });
    E.badge.addEventListener('click',afficherAttente);
    E.liste.addEventListener('click',e=>{ const a=e.target.closest('.ad-art'); if(!a||e.ctrlKey||e.metaKey||e.shiftKey||e.button!==0) return; e.preventDefault(); const k=a.dataset.k, it=donnees(E.onglet).items.find(x=>cle(x)===k); if(it) ouvrirLecture(it); });
    E.liste.addEventListener('scroll',()=>{ if(E.liste.scrollTop<8&&(donnees(E.onglet).attente||[]).length) afficherAttente(); },{passive:true});
    dessiner(); charger(E.onglet);
    setInterval(()=>{ if(!document.hidden&&document.body.classList.contains('app-accueil')){ charger(E.onglet); } majAges(); },RAFRAICHIR);
    setInterval(()=>{ if(!document.hidden) majAges(); },60*1000);
  }
  window.ActusDefilantes={ monter, recharger:()=>E.zone&&charger(E.onglet,true), pur, etat:()=>({onglet:E.onglet,articles:donnees(E.onglet).items.length,attente:(donnees(E.onglet).attente||[]).length,erreur:donnees(E.onglet).erreur}) };
})();
