"use strict";
  /* ═════════════ PANNEAU D'IMAGES ANIMÉ (v8, phase 4) ═════════════
     1 image principale + 2 à 4 secondaires, nom, dates clés, légende, SOURCE ET LICENCE en petit. S'ouvre pendant que Rayle parle ; se ferme seul (45 s) ou avec la croix.
     Données : ImagesWiki.chercher() (Wikipédia / Wikimedia Commons, licences libres). Pas d'image libre → aucun panneau. Animations légères (opacity/transform), sans effet si « réduire les animations ». */
  const GalerieAnim=(function(){
    let el=null, tFin=null, courant=null;
    const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const reduit=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
    function racine(){
      if(el&&el.isConnected) return el;
      el=document.createElement('section'); el.id='ra-galerie'; el.setAttribute('role','region'); el.setAttribute('aria-label','Images de la réponse'); el.hidden=true; document.body.appendChild(el);
      el.addEventListener('click',e=>{
        if(e.target.closest('.rg-x')){ fermer(); return; }
        const t=e.target.closest('[data-rg-i]'); if(t&&courant){ afficher(+t.getAttribute('data-rg-i')); clearTimeout(tFin); tFin=setTimeout(fermer,45000); }
      });
      return el;
    }
    const toutes=r=>[r.principale].concat(r.secondaires||[]).filter(Boolean);
    function afficher(i){
      const im=toutes(courant)[i]; if(!im) return;
      const g=el.querySelector('.rg-grande'); g.classList.remove('rg-in'); void g.offsetWidth;
      g.innerHTML='<img alt="'+esc(im.legende)+'" src="'+esc(im.url)+'" referrerpolicy="no-referrer" decoding="async">'; g.classList.add('rg-in');
      el.querySelector('.rg-leg').innerHTML=esc(im.legende)+'<small>'+esc(im.licence)+(im.auteur?' · '+esc(im.auteur):'')+(im.page?' · <a href="'+esc(im.page)+'" target="_blank" rel="noopener noreferrer">fiche</a>':'')+'</small>';
      el.querySelectorAll('[data-rg-i]').forEach(b=>b.setAttribute('aria-pressed',String(+b.getAttribute('data-rg-i')===i)));
    }
    /* r : résultat d'ImagesWiki.chercher ; ne montre rien (et rend false) s'il n'y a pas d'image libre */
    function montrer(r){
      if(!r||!r.principale) return false;
      courant=r; const e=racine(); clearTimeout(tFin);
      const T=toutes(r);
      e.innerHTML='<header><span class="rg-titre">'+esc(r.titre)+'</span><button type="button" class="rg-x" aria-label="Fermer les images" title="Fermer">×</button></header>'
        +'<div class="rg-grande"></div><p class="rg-leg"></p>'
        +(T.length>1?'<div class="rg-mini" role="group" aria-label="Autres images">'+T.map((im,i)=>'<button type="button" data-rg-i="'+i+'" aria-pressed="'+(i===0)+'" aria-label="Image '+(i+1)+'"><img alt="" loading="lazy" src="'+esc(im.url)+'" referrerpolicy="no-referrer"></button>').join('')+'</div>':'')
        +(r.description?'<p class="rg-desc">'+esc(r.description)+'</p>':'')
        +((r.dates||[]).length?'<ul class="rg-dates">'+r.dates.map(d=>'<li><small>'+esc(d.label)+'</small><b>'+esc(d.val)+'</b></li>').join('')+'</ul>':'')
        +'<p class="rg-src">Source : '+esc(r.source||'Wikipédia')+' · <a href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer">article</a> · licences libres indiquées sous chaque image</p>';
      e.hidden=false; e.classList.remove('rg-sort'); void e.offsetWidth; e.classList.add('rg-entre'); afficher(0);
      tFin=setTimeout(fermer,45000); return true;
    }
    function fermer(){ clearTimeout(tFin); if(!el||el.hidden) return; el.classList.remove('rg-entre'); el.classList.add('rg-sort'); setTimeout(()=>{ if(el&&el.classList.contains('rg-sort')) el.hidden=true; },300); }
    return {montrer,fermer,etat:()=>({visible:!!(el&&!el.hidden),titre:courant&&courant.titre||'',images:courant?toutes(courant).length:0,dates:courant?(courant.dates||[]).length:0})};
  })();
  window.GalerieAnim=GalerieAnim;
