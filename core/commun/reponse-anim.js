"use strict";
  /* ═════════════ RÉPONSES ANIMÉES (v8, phase 3) : style Jarvis ═════════════
     Pendant que Rayle parle : le texte s'écrit au rythme de la voix, les chiffres clés apparaissent en grandes étiquettes animées (prix, distance à la MA200, niveau clé…),
     et — pour les questions de culture — un panneau d'images (ImagesHolo/MediasHolo) s'ouvre à côté. Animations légères (transform/opacity), désactivées si « réduire les animations ».
     API : ReponseAnim.montrer({ titre, texte, etiquettes:[{label,val,sous,ton}], images }) ; ReponseAnim.fermer(). Événements écoutés : rayle:parole (durée en secondes), rayle:parole-fin. */
  const ReponseAnim=(function(){
    let el=null, tFin=null, anim=0, dureeVoix=null, texteCourant='', debut=0;
    const reduit=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
    const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    function racine(){
      if(el&&el.isConnected) return el;
      el=document.createElement('section'); el.id='ra-panneau'; el.setAttribute('role','status'); el.setAttribute('aria-live','polite'); el.hidden=true;
      el.innerHTML='<header><span class="ra-titre"></span><button type="button" class="ra-x" aria-label="Fermer la réponse animée" title="Fermer">×</button></header><div class="ra-etiq"></div><p class="ra-texte"></p>';
      document.body.appendChild(el); el.querySelector('.ra-x').addEventListener('click',fermer); return el;
    }
    /* compte jusqu'à la valeur (si numérique) : fluide, 600 ms */
    function compter(noeud,val){
      const m=/^([+−-]?)\s*([\d\s.,]+)(.*)$/.exec(String(val)); if(!m||reduit()){ noeud.textContent=val; return; }
      const brut=parseFloat(m[2].replace(/[\s ]/g,'').replace(',','.')); if(!isFinite(brut)){ noeud.textContent=val; return; }
      const dec=(m[2].split(/[,.]/)[1]||'').replace(/\s/g,'').length, t0=performance.now(), D=650;
      const f=t=>{ const k=Math.min(1,(t-t0)/D), e=1-Math.pow(1-k,3), v=brut*e; noeud.textContent=m[1]+v.toLocaleString('fr-FR',{minimumFractionDigits:dec,maximumFractionDigits:dec})+m[3]; if(k<1&&noeud.isConnected) requestAnimationFrame(f); else noeud.textContent=val; };
      requestAnimationFrame(f);
    }
    function ecrire(texte,ms){
      const p=racine().querySelector('.ra-texte'); texteCourant=texte; const n=texte.length; cancelAnimationFrame(anim);
      if(reduit()||!n){ p.textContent=texte; return; }
      const t0=performance.now(); p.textContent='';
      const f=t=>{ const total=dureeVoix!=null?dureeVoix*1000:ms, k=Math.min(1,(t-t0)/Math.max(800,total*0.94)); p.textContent=texte.slice(0,Math.ceil(n*k)); if(k<1&&el&&!el.hidden) anim=requestAnimationFrame(f); else p.textContent=texte; };
      anim=requestAnimationFrame(f);
    }
    function montrer(o){
      o=o||{}; const r=racine(); clearTimeout(tFin); dureeVoix=null; debut=performance.now();
      r.querySelector('.ra-titre').textContent=o.titre||'Rayle';
      const E=r.querySelector('.ra-etiq'); E.innerHTML=(o.etiquettes||[]).map((x,i)=>'<div class="ra-chip'+(x.ton?' ra-'+esc(x.ton):'')+'" style="--i:'+i+'"><small>'+esc(x.label)+'</small><b data-v="'+esc(x.val)+'"></b><em>'+esc(x.sous||'')+'</em></div>').join('');
      E.querySelectorAll('b[data-v]').forEach((b,i)=>setTimeout(()=>compter(b,b.getAttribute('data-v')),reduit()?0:180+i*160));
      r.hidden=false; r.classList.remove('ra-sort'); void r.offsetWidth; r.classList.add('ra-entre');
      const texte=String(o.texte||'').trim(); ecrire(texte,Math.max(2500,texte.length*55));
      /* sans voix (panne, muet) : le texte reste lisible, puis la carte se range */
      tFin=setTimeout(()=>{ if(dureeVoix==null) planifierFin(6000+texte.length*40); },2500);
    }
    function planifierFin(ms){ clearTimeout(tFin); tFin=setTimeout(fermer,ms); }
    function fermer(){ clearTimeout(tFin); cancelAnimationFrame(anim); if(!el) return; el.classList.remove('ra-entre'); el.classList.add('ra-sort'); setTimeout(()=>{ if(el&&el.classList.contains('ra-sort')) el.hidden=true; },320); }
    window.addEventListener('rayle:parole',e=>{ if(!el||el.hidden) return; dureeVoix=Math.max(1,(e.detail&&e.detail.duree)||0)||null; if(dureeVoix&&texteCourant) ecrire(texteCourant,dureeVoix*1000); });
    window.addEventListener('rayle:parole-fin',()=>{ if(el&&!el.hidden){ const p=el.querySelector('.ra-texte'); p.textContent=texteCourant; planifierFin(7000); } });
    return {montrer,fermer,etat:()=>({visible:!!(el&&!el.hidden),texte:texteCourant,etiquettes:el?el.querySelectorAll('.ra-chip').length:0})};
  })();
  window.ReponseAnim=ReponseAnim;
