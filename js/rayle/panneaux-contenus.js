"use strict";
  /* ═════════════ CONTENUS DES PANNEAUX HOLOGRAPHIQUES ═════════════
     Chaque fonction reçoit les données déjà lues par Raylé (météo, actus, Wikipédia, marché…) et ouvre un panneau.
     Aucune requête réseau ici, sauf ctxRecherche / ctxPage (recherche web et pages, via le Worker). */
  const pn=(f,...a)=>{ try{ f(...a); }catch(e){ console.warn('[panneau]',e); } };   // un panneau raté ne doit jamais casser une réponse
  const pnH=Panneaux.esc;
  const pnLien=u=>/^https?:\/\//i.test(String(u||'')) ? String(u) : '';
  const pnSite=u=>{ try{ return new URL(u).hostname.replace(/^www\./,''); }catch(e){ return ''; } };
  const pnCourt=(t,n)=>{ t=String(t||'').replace(/\s+/g,' ').trim(); return t.length>n ? t.slice(0,n).replace(/\s+\S*$/,'')+'…' : t; };
  const pnLigne=(a,b)=>'<div class="pn-l"><span>'+pnH(a)+'</span><b>'+b+'</b></div>';
  const pnOuvrir=o=>{ try{ Panneaux.ouvrir(o); }catch(e){ console.warn('[panneau]',e); } };

  /* ───── Météo ───── */
  function montrerMeteo(d){
    const a=d.actuel||{};
    let h='<div class="pn-gros">'+pnH(rnd(a.temp))+'<small> °C</small></div><div class="pn-sous">'+pnH(a.ciel||'')+' · ressenti '+pnH(rnd(a.ressenti))+' °C</div>';
    h+=pnLigne('Humidité',pnH(rnd(a.humidite))+' %')+pnLigne('Vent',pnH(rnd(a.vent))+' km/h (rafales '+pnH(rnd(a.rafales))+')');
    if(a.pluie>0) h+=pnLigne('Pluie (1 h)',pnH(a.pluie)+' mm');
    if(d.air && d.air.qualite) h+=pnLigne('Qualité de l\'air',pnH(d.air.qualite));
    if((d.jours||[]).length){
      h+='<div class="pn-sep"></div>'+(d.jours||[]).slice(0,5).map(j=>'<div class="pn-l"><span>'+pnH(jourLabel(j.date))+'</span><b>'+pnH(rnd(j.tmin))+' → '+pnH(rnd(j.tmax))+' °C <small>'+pnH(j.ciel||'')+(j.proba_pluie>=30?' · pluie '+pnH(j.proba_pluie)+' %':'')+'</small></b></div>').join('');
    }
    pnOuvrir({id:'meteo:'+(d.ville||''),type:'meteo',icone:'⛅',titre:'Météo · '+(d.ville||''),corps:{html:h}});
  }

  /* ───── Actualités ───── */
  function montrerActus(titre,d){
    const items=(d.items||[]).slice(0,6);
    if(!items.length) return;
    const h=items.map(x=>{
      const u=pnLien(x.url||x.lien);
      const t=u?'<a href="'+pnH(u)+'" target="_blank" rel="noopener noreferrer">'+pnH(x.titre)+'</a>':pnH(x.titre);
      return '<div class="pn-item"><h3>'+t+'</h3><small>'+pnH(x.source||'')+(x.t?' · '+pnH(agoTxt(x.t)):'')+'</small></div>';
    }).join('');
    pnOuvrir({id:'actus:'+titre,type:'actus',icone:'📰',titre:'Actualités · '+titre,corps:{html:h}});
  }

  /* ───── Article résumé (Wikipédia) ───── */
  function montrerWiki(q,r){
    if(!r||!r.length) return;
    const x=r[0];
    let h='<h3>'+pnH(x.titre)+'</h3>'+(x.description?'<small>'+pnH(x.description)+(x.langue==='en'?' · en anglais':'')+'</small>':'')+'<p>'+pnH(pnCourt(x.extrait,900))+'</p>';
    if(r[1]) h+='<div class="pn-sep"></div><small>Voir aussi : '+pnH(r.slice(1,3).map(y=>y.titre).join(' · '))+'</small>';
    pnOuvrir({id:'wiki',type:'article',icone:'📖',titre:'Article · '+pnCourt(q,28),corps:{html:h},pied:pnLien(x.url)?[{texte:'Lire sur Wikipédia',url:x.url}]:[]});
  }
  function montrerEtudes(q,r){
    if(!r||!r.length) return;
    const h=r.slice(0,4).map(x=>'<div class="pn-item"><h3>'+pnH(pnCourt(x.titre,150))+'</h3><small>'+pnH((x.revue||'revue inconnue')+(x.annee?' · '+x.annee:'')+(x.citations?' · citée '+x.citations+' fois':''))+'</small></div>').join('');
    pnOuvrir({id:'etudes',type:'etudes',icone:'🔬',titre:'Études · '+pnCourt(q,24),corps:{html:h+'<small class="pn-vide">Littérature scientifique, pas un avis médical.</small>'}});
  }
  function montrerMedicament(r,source){
    if(!r) return;
    const bloc=(t,v)=>v?'<div class="pn-item"><h3>'+pnH(t)+'</h3><small>'+pnH(pnCourt(v,320))+'</small></div>':'';
    pnOuvrir({id:'medicament',type:'medicament',icone:'💊',titre:'Médicament · '+pnCourt(r.nom,24),
      corps:{html:bloc('Indications',r.indications)+bloc('Contre-indications',r.contre_indications)+bloc('Effets indésirables',r.effets_indesirables)+'<small class="pn-vide">Notice '+pnH(source||'officielle')+' · information générale, pas un avis médical.</small>'}});
  }

  /* ───── Chiffres de marché ───── */
  function montrerMarche(sn){
    if(!sn || sn.prix==null) return;
    const haus=sn.tendance==='haussière';
    let h='<div class="pn-gros">'+pnH(fmt(sn.prix))+'</div><div class="pn-sous"><span class="pn-tag '+(haus?'hausse':'baisse')+'">'+pnH(sn.tendance)+'</span> score '+pnH(sn.score)+' / 100</div>';
    h+=(sn.cols||[]).map(c=>'<div class="pn-l"><span>'+pnH(c.lab)+'</span><b>'+(c.bull==null?'—':'<i class="'+(c.bull?'hausse':'baisse')+'">'+(c.bull?'▲':'▼')+'</i>')+' RSI '+pnH(c.r!=null?c.r.toFixed(0):'—')+' <small>S '+pnH(fmt(c.sup))+' · R '+pnH(fmt(c.res))+'</small></b></div>').join('');
    pnOuvrir({id:'marche:'+sn.nom,type:'marche',icone:'📈',titre:'Marché · '+sn.nom,corps:{html:h}});
  }
  function montrerSentiment(d){
    const a=d.actions_peur_avidite||{}, c=d.crypto_peur_avidite||{}, g=d.crypto_global||{};
    const jauge=(t,x)=>x.score==null?'':'<div class="pn-l"><span>'+pnH(t)+'</span><b>'+pnH(x.score)+' / 100 <small>'+pnH(x.etat||'')+'</small></b></div><div class="pn-jauge"><i style="width:'+Math.max(2,Math.min(100,+x.score))+'%"></i></div>';
    let h=jauge('Actions',a)+jauge('Crypto',c);
    if(g.dominance_btc!=null) h+=pnLigne('Dominance Bitcoin',pnH(fmtNum(g.dominance_btc,1))+' %');
    pnOuvrir({id:'sentiment',type:'sentiment',icone:'🌡',titre:'Peur et avidité',corps:{html:h}});
  }

  /* ───── Image envoyée par Justin ───── */
  function montrerImage(dataUrl,legende){
    pnOuvrir({id:'image',type:'image',icone:'🖼',titre:'Image · '+pnCourt(legende||'envoyée',24),
      corps:(el)=>{ const i=document.createElement('img'); i.src=dataUrl; i.alt=legende||'image envoyée'; i.className='pn-img'; el.appendChild(i); }});
  }

  /* ───── Recherche web (Tavily via le Worker) ───── */
  const WEB_RE=/\b(?:cherche|recherche|regarde|trouve)\w*(?: moi)? (?:sur |dans |a propos de )?(?:internet|le web|google|en ligne)\b|\bsur (?:internet|google|le web)\b|\brecherche web\b|^(?:google|googler)\b|\bfais (?:moi )?une recherche\b|\bqui a gagne\b|\bresultats? du match\b|\bcombien coute\b/;
  function requeteWeb(text){
    let q=String(text||'').replace(/[?!]/g,' ').replace(/\s+/g,' ').trim();
    q=q.replace(/^(?:hey |dis |ok )?rayl[ée][\s,]*/i,'')
       .replace(/^(?:s'il (?:te|vous) pla[iî]t[\s,]*)?(?:peux[- ]tu|pouvez[- ]vous|tu peux|vous pouvez)?\s*/i,'')
       .replace(/\b(?:fais|fait|faire)(?: moi)? une recherche(?: web)?(?: (?:sur|a propos de|au sujet de))?\s*/i,'')
       .replace(/\b(?:cherche|recherche|regarde|trouve|googl\w*)(?:[- ]moi)?\s+(?:(?:sur|dans)\s+)?(?:internet|le web|google|en ligne)?\s*(?:(?:sur|a propos de|au sujet de|pour)\s+)?/i,'')
       .replace(/\b(?:sur|dans) (?:internet|google|le web)\b/ig,' ')
       .replace(/\b(?:s'il (?:te|vous) pla[iî]t|stp|svp)\b/ig,' ').replace(/\s+/g,' ').trim();
    return q.length>=2 ? q.slice(0,160) : String(text).trim().slice(0,160);
  }
  async function ctxRecherche(q,live,stamp){
    addLine('sys','Recherche web : « '+q+' »…');
    try{
      const d=await wjson('/recherche?q='+encodeURIComponent(q),25000);
      if(stamp!==epoch) return '';
      const h=(d.reponse?'<p>'+pnH(pnCourt(d.reponse,420))+'</p><div class="pn-sep"></div>':'')
        +(d.resultats||[]).slice(0,6).map(r=>{
          const u=pnLien(r.url);
          return '<div class="pn-item"><h3>'+(u?'<a href="'+pnH(u)+'" target="_blank" rel="noopener noreferrer">'+pnH(r.titre||u)+'</a>':pnH(r.titre))+'</h3><small>'+pnH(pnSite(u))+'</small><p>'+pnH(pnCourt(r.extrait,170))+'</p></div>';
        }).join('');
      pnOuvrir({id:'recherche',type:'recherche',icone:'🔎',titre:'Recherche · '+pnCourt(q,26),corps:{html:h||'<p class="pn-vide">Aucun résultat.</p>'},
        pied:[{texte:'Ouvrir dans Google',url:'https://www.google.com/search?q='+encodeURIComponent(q)}]});
      return d.contexte||'';
    }catch(e){
      if(stamp!==epoch) return '';
      addLine('sys','Recherche web : '+errMsg(e));
      pnOuvrir({id:'recherche',type:'recherche',icone:'🔎',titre:'Recherche · '+pnCourt(q,26),corps:{html:'<p class="pn-vide">Recherche indisponible : '+pnH(errMsg(e))+'</p>'},
        pied:[{texte:'Ouvrir dans Google',url:'https://www.google.com/search?q='+encodeURIComponent(q)}]});
      return 'RECHERCHE WEB « '+q+' » indisponible ('+errMsg(e)+"). Ne l'invente pas ; dis à Justin que tu n'as pas pu chercher.";
    }
  }

  /* ───── Page web à partir d'un lien ───── */
  async function ctxPage(lien,live,stamp){
    addLine('sys','Page web : lecture de '+pnSite(lien)+'…');
    try{
      const d=await wjson('/page?url='+encodeURIComponent(lien),40000);
      if(stamp!==epoch) return '';
      const h='<h3>'+pnH(d.titre)+'</h3><small>'+pnH(d.site||pnSite(lien))+' · lu via '+pnH(d.via||'le Worker')+'</small>'
        +(d.description?'<p>'+pnH(pnCourt(d.description,260))+'</p>':'')+'<p>'+pnH(pnCourt(d.texte,700))+'</p>';
      const iframeHtml='<iframe class="pn-iframe" src="'+pnH(lien)+'" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" loading="lazy"></iframe><small class="pn-vide">Si la page reste vide, le site refuse d’être affiché ici : utilise « Ouvrir la page ».</small>';
      pnOuvrir({id:'page',type:'page',icone:'🌐',titre:'Page · '+(d.site||pnSite(lien)),taille:'large',
        corps:{html:h+'<div class="pn-zone"></div>'},
        pied:[{texte:'Ouvrir la page',url:lien},{texte:'Afficher ici',clic:()=>{ const z=document.querySelector('.pn[data-id="page"] .pn-zone'); if(z&&!z.firstChild) z.innerHTML=iframeHtml; }}]});
      return d.contexte||'';
    }catch(e){
      if(stamp!==epoch) return '';
      addLine('sys','Page web : '+errMsg(e));
      pnOuvrir({id:'page',type:'page',icone:'🌐',titre:'Page · '+pnSite(lien),corps:{html:'<p class="pn-vide">Page illisible : '+pnH(errMsg(e))+'</p>'},pied:[{texte:'Ouvrir la page',url:lien}]});
      return 'PAGE WEB illisible ('+errMsg(e)+"). Dis-le à Justin sans inventer son contenu.";
    }
  }
