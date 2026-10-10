"use strict";
  /* ═════════════ PANNEAU DE DONNÉES (macro, crypto, savoirs, réseaux, actualités…) ═════════════
     Le Worker décrit le panneau (voir worker/src/outils/panneaux.js), cette fonction le dessine : jauges qui se remplissent,
     chiffres qui défilent jusqu'à leur valeur, lignes qui apparaissent l'une après l'autre. Texte toujours échappé ; liens http(s) seulement.
     Format : { id, icone, titre, jauges:[{label,score,etat}], chiffres:[{label,valeur,dec,unite,delta,deltaUnite}], lignes:[{label,valeur,sens}],
                texte, items:[{titre,sous,texte,lien}], apercu (aperçu Drive en iframe), note, pied:[{texte,url}] } */
  const pdH=Panneaux.esc;
  const pdNum=(v,dec)=>Number(v).toLocaleString('fr-FR',{minimumFractionDigits:dec||0,maximumFractionDigits:dec||0});
  const pdSens=s=>s==='hausse'||s==='baisse' ? ' '+s : '';
  const pdLien=u=>/^https?:\/\//i.test(String(u||'')) ? String(u) : '';
  const pdApercu=u=>/^https:\/\/drive\.google\.com\/file\/d\/[\w-]{10,80}\/preview$/.test(String(u||''));

  function pdHtml(p){
    let h='';
    (p.jauges||[]).forEach(j=>{
      const s=Math.max(0,Math.min(100,+j.score||0));
      h+='<div class="pn-l"><span>'+pdH(j.label)+'</span><b>'+pdH(Math.round(s))+' / 100 <small>'+pdH(j.etat||'')+'</small></b></div><div class="pn-jauge pn-anim"><i data-w="'+s+'" style="width:0"></i></div>';
    });
    if((p.chiffres||[]).length){
      h+='<div class="pn-chiffres">'+p.chiffres.map((c,i)=>{
        const d=c.delta;
        const dh=(d!=null && isFinite(d)) ? '<small class="pn-delta'+(d>0?' hausse':d<0?' baisse':'')+'">'+(d>0?'▲ +':d<0?'▼ ':'= ')+pdH(pdNum(d,Math.max(c.dec||0,(String(d).split('.')[1]||'').length)))+pdH(c.deltaUnite||'')+'</small>' : '';
        return '<div class="pn-chiffre" style="--i:'+i+'"><small>'+pdH(c.label)+'</small><b><span class="pn-cpt" data-v="'+pdH(c.valeur)+'" data-dec="'+pdH(c.dec||0)+'">'+pdH(pdNum(c.valeur,c.dec))+'</span>'+pdH(c.unite||'')+'</b>'+dh+'</div>';
      }).join('')+'</div>';
    }
    (p.lignes||[]).forEach((l,i)=>{ h+='<div class="pn-l pn-anim-l" style="--i:'+i+'"><span>'+pdH(l.label)+'</span><b class="pn-v'+pdSens(l.sens)+'">'+pdH(l.valeur)+'</b></div>'; });
    if(p.texte) h+=(h?'<div class="pn-sep"></div>':'')+'<p>'+pdH(p.texte)+'</p>';
    if((p.items||[]).length){
      h+=(h?'<div class="pn-sep"></div>':'')+p.items.map((x,i)=>{
        const u=pdLien(x.lien);
        const t=u?'<a href="'+pdH(u)+'" target="_blank" rel="noopener noreferrer">'+pdH(x.titre)+'</a>':pdH(x.titre);
        return '<div class="pn-item pn-anim-l" style="--i:'+i+'"><h3>'+t+'</h3>'+(x.sous?'<small>'+pdH(x.sous)+'</small>':'')+(x.texte?'<p>'+pdH(x.texte)+'</p>':'')+'</div>';
      }).join('');
    }
    // Aperçu d'un document du Drive (cours, devoir) : seulement une adresse drive.google.com/file/d/…/preview
    if(pdApercu(p.apercu)) h+='<iframe class="pn-iframe" src="'+pdH(p.apercu)+'" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" loading="lazy" title="Aperçu du document"></iframe>'
      +'<small class="pn-vide">Si l’aperçu reste vide (Google non connecté dans ce navigateur), utilise « Ouvrir dans Drive ».</small>';
    if(p.note) h+='<small class="pn-vide">'+pdH(p.note)+'</small>';
    return h;
  }

  // Les chiffres défilent de 0 à leur valeur (≈ 0,9 s) ; les jauges se remplissent. Respecte « réduire les animations ».
  function pdAnimer(el){
    const reduit=window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.querySelectorAll('.pn-jauge i[data-w]').forEach(i=>{ const w=i.dataset.w+'%'; if(reduit) i.style.width=w; else requestAnimationFrame(()=>requestAnimationFrame(()=>{ i.style.width=w; })); });
    if(reduit) return;
    el.querySelectorAll('.pn-cpt').forEach(s=>{
      const v=parseFloat(s.dataset.v), dec=parseInt(s.dataset.dec,10)||0;
      if(!isFinite(v)) return;
      const t0=performance.now(), d=900;
      (function pas(t){ const k=Math.min(1,(t-t0)/d), e=1-Math.pow(1-k,3); s.textContent=pdNum(v*e,dec); if(k<1) requestAnimationFrame(pas); else s.textContent=pdNum(v,dec); })(t0);
    });
  }

  function montrerDonnees(p){
    if(!p || !p.titre) return;
    Panneaux.ouvrir({id:'donnees:'+(p.id||p.titre),type:'donnees',icone:p.icone||'◈',titre:p.titre,taille:pdApercu(p.apercu)?'large':undefined,
      corps:(el)=>{ el.innerHTML=pdHtml(p); pdAnimer(el); },
      pied:(p.pied||[]).filter(b=>pdLien(b.url))});
  }
