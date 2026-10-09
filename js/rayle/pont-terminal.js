"use strict";
  /* ═════════════ PONT AVEC LE TERMINAL ═════════════ */
  function readBridge(){
    try{
      const raw=localStorage.getItem(BRIDGE_KEY); if(!raw) return null;
      const o=JSON.parse(raw);
      return (o && typeof o==='object') ? o : null;
    }catch(e){ return null; }
  }
  function fmtNum(v,dec){ const n=Number(v); return isFinite(n) ? n.toLocaleString('fr-FR',{maximumFractionDigits:dec==null?2:dec}) : String(v); }
  function fmtAge(iso){
    const ms=Date.now()-new Date(iso).getTime(); if(!isFinite(ms)) return '';
    const m=Math.round(ms/60000);
    return m<1 ? "à l'instant" : m<60 ? 'il y a '+m+' min' : 'il y a '+Math.round(m/60)+' h';
  }
  const pairs=o=>Object.entries(o).map(([k,v])=>k+' '+v).join(', ');
  // Chrome ralentit les onglets en arrière-plan : le signal de présence du terminal peut arriver avec du retard
  const VU_MAX_S=150;
  const terminalOuvert=b=>!!(b && b.vu && (Date.now()-new Date(b.vu).getTime())/1000<VU_MAX_S);

  // Ligne qui dit à l'IA si elle est reliée au terminal (évite « je ne suis pas connectée »)
  function terminalLink(b){
    if(!b) return "Liaison terminal : aucune donnée reçue pour l'instant (le terminal n'a pas été ouvert dans ce navigateur).";
    if(b.vu){
      return terminalOuvert(b)
        ? 'Liaison terminal : ACTIVE, le terminal est ouvert dans ce navigateur et transmet ses données.'
        : 'Liaison terminal : établie, mais le terminal est fermé ou en veille (dernier signe de vie '+fmtAge(b.vu)+') : les chiffres du terminal peuvent être anciens.';
    }
    return 'Liaison terminal : des données du terminal sont présentes.';
  }

  // Résumé envoyé comme contexte à l'IA
  function bridgeSummary(b){
    if(!b) return '';
    const p=[];
    if(b.actif) p.push('actif affiché : '+b.actif+(b.unite_graphique?' en '+b.unite_graphique:''));
    if(b.prix!=null) p.push('prix '+fmtNum(b.prix));
    if(b.tendance_globale) p.push('tendance globale '+b.tendance_globale);
    if(b.score_global!=null) p.push('score global '+b.score_global+' sur 100');
    if(b.tendances && typeof b.tendances==='object') p.push('tendance par unité de temps : '+pairs(b.tendances));
    if(b.rsi && typeof b.rsi==='object') p.push('RSI : '+pairs(b.rsi));
    if(b.volume_net && typeof b.volume_net==='object') p.push('volume net en dollars (positif = acheteurs) : '+pairs(b.volume_net));
    if(b.support!=null) p.push('support '+fmtNum(b.support));
    if(b.resistance!=null) p.push('résistance '+fmtNum(b.resistance));
    if(b.ma200 && typeof b.ma200==='object') p.push('EMA 200 par unité de temps : '+pairs(b.ma200)+(b.distance_ma200_pct && typeof b.distance_ma200_pct==='object' ? ' ; écart du prix à cette EMA 200 en pourcent : '+pairs(b.distance_ma200_pct) : ''));
    if(b.derniere_bougie && typeof b.derniere_bougie==='object'){ const c=b.derniere_bougie; p.push('dernière bougie '+(c.unite||'')+' : ouverture '+c.ouverture+', haut '+c.haut+', bas '+c.bas+', clôture '+c.cloture+' ('+c.sens+')'); }
    if(b.extremes_recents && typeof b.extremes_recents==='object'){ const x=b.extremes_recents; p.push(x.sur+' : plus haut '+x.plus_haut+', plus bas '+x.plus_bas); }
    if(Array.isArray(b.rsi_recent) && b.rsi_recent.length) p.push("derniers RSI sur l'unité de temps affichée (du plus ancien au plus récent) : "+b.rsi_recent.join(', '));
    if(b.structure && b.structure.lecture){ const st=b.structure; p.push('structure de marché en '+(st.unite||'')+' : '+st.lecture+' ; dernier sommet '+st.dernier_sommet+', dernier creux '+st.dernier_creux+(st.alerte?' ; attention : '+st.alerte:'')); }
    if(b.instrument_donnees) p.push('ces chiffres sont calculés sur '+b.instrument_donnees);
    if(b.source_donnees && typeof b.source_donnees==='object'){ const sd=b.source_donnees; p.push('source des données du terminal : '+sd.source+(sd.secours?' (relais de secours)':'')+(sd.differe?' (données différées)':'')+(sd.ancienne_copie?' (ancienne copie, la source ne répond plus)':'')); }
    if(b.contexte_marche && typeof b.contexte_marche==='object'){
      const cm=Object.entries(b.contexte_marche).map(([k,v])=>k+' '+fmtNum(v.prix)+(v.variation_pct!=null?' ('+(v.variation_pct>=0?'+':'')+v.variation_pct+' %)':'')).join(', ');
      if(cm) p.push('contexte de marché affiché au terminal : '+cm);
    }
    if(b.analyse_en_cours) p.push("l'analyse du nouvel actif est en cours de calcul, les chiffres arrivent dans quelques instants");
    if(b.notes && String(b.notes).trim()) p.push('notes stratégiques de Justin : « '+String(b.notes).trim().slice(0,600)+' »');
    if(b.maj) p.push('données mises à jour '+fmtAge(b.maj));
    return p.join(' ; ');
  }

  function updateBridgeStatus(){
    const b=readBridge();
    if(!b){ bridgeEl.textContent='PONT TERMINAL · aucune donnée'; bridgeEl.className='bridge off'; return; }
    const bits=[];
    if(b.vu) bits.push(terminalOuvert(b)?'● terminal ouvert':'○ terminal fermé');
    if(b.actif) bits.push(b.actif);
    if(b.tendance_globale) bits.push(b.tendance_globale);
    if(b.score_global!=null) bits.push(b.score_global+'/100');
    if(b.maj) bits.push(fmtAge(b.maj));
    bridgeEl.textContent='PONT TERMINAL · '+(bits.join(' · ')||'notes uniquement');
    bridgeEl.className='bridge on';
  }
  setInterval(updateBridgeStatus,3000);
  window.addEventListener('storage',e=>{ if(e.key===BRIDGE_KEY) updateBridgeStatus(); });
