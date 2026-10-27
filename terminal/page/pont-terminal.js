"use strict";
  /* ═════════════ PONT AVEC LE TERMINAL ═════════════ */
  // L'état du terminal vit en mémoire, dans le bus d'événements (plus de localStorage entre Raylé et le terminal).
  // Les notes sont la seule donnée gardée dans le navigateur : on les republie au démarrage.
  (function(){
    let notes='';
    try{
      notes=localStorage.getItem('rayle_terminal_notes')||'';
      if(!notes){ const ancien=JSON.parse(localStorage.getItem('rayle_terminal_bridge')||'null'); notes=(ancien&&ancien.notes)||''; }   // ancienne version
      localStorage.removeItem('rayle_terminal_bridge'); localStorage.removeItem('rayle_terminal_cmd');
    }catch(e){}
    RayleBus.fusion('terminal',{ouvert:false,notes:notes});
  })();
  function readBridge(){
    const o=RayleBus.etat('terminal');
    return (o && typeof o==='object' && (o.maj||o.actif||String(o.notes||'').trim())) ? o : null;
  }
  function fmtNum(v,dec){ const n=Number(v); return isFinite(n) ? n.toLocaleString('fr-FR',{maximumFractionDigits:dec==null?2:dec}) : String(v); }
  function fmtAge(iso){
    const ms=Date.now()-new Date(iso).getTime(); if(!isFinite(ms)) return '';
    const m=Math.round(ms/60000);
    return m<1 ? "à l'instant" : m<60 ? 'il y a '+m+' min' : 'il y a '+Math.round(m/60)+' h';
  }
  const pairs=o=>Object.entries(o).map(([k,v])=>k+' '+v).join(', ');
  const terminalOuvert=b=>!!(b && b.ouvert);

  // Ligne qui dit à l'IA si elle est reliée au terminal (évite « je ne suis pas connectée »)
  function terminalLink(b){
    if(!b) return "Liaison terminal : aucune donnée pour l'instant (le terminal n'a pas encore été ouvert depuis le lancement de la page). Il fait partie de cette même page : Justin peut te demander de l'ouvrir.";
    if(terminalOuvert(b)) return 'Liaison terminal : ACTIVE, le terminal est ouvert dans cette page et tu peux le piloter (actif, unité de temps, panneaux).';
    if(b.maj) return 'Liaison terminal : le terminal est fermé (dernières données '+fmtAge(b.maj)+') : les chiffres du terminal peuvent être anciens.';
    return 'Liaison terminal : seules des notes sont présentes, le terminal est fermé.';
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
    if(b.page_terminal) p.push('page affichée au terminal : '+b.page_terminal);
    if(b.mode_affichage) p.push("mode d'affichage du terminal : "+b.mode_affichage);
    if(b.source_graphique) p.push('graphique utilisé : '+b.source_graphique+(String(b.source_graphique).includes('TradingView')?" (tu ne peux pas lire ce widget : tes chiffres viennent des données du Worker)":''));
    if(b.graphique_rayle && typeof b.graphique_rayle==='object'){
      const g=b.graphique_rayle, f=a=>(a||[]).map(x=>fmtNum(x)).join(', ');
      p.push('graphique Raylé : '+g.actif+' en '+g.unite+', RSI '+(g.rsi?'affiché'+(g.rsi_dernier!=null?' (valeur '+g.rsi_dernier+')':''):'caché')+', EMA 200 '+(g.ma200?(g.ema200!=null?'affichée à '+fmtNum(g.ema200):'affichée'):'cachée')
        +(g.supports_traces?' ; supports tracés '+(f(g.supports)||'aucun')+' ; résistances tracées '+(f(g.resistances)||'aucune'):' ; supports non tracés')
        +(g.annotations&&g.annotations.length?' ; annotations de Justin ou de toi : '+g.annotations.map(a=>fmtNum(a.prix)+(a.texte?' ('+a.texte+')':'')).join(', '):'')
        +(g.bougies_numerotees?' ; '+g.bougies_numerotees+' bougies numérotées sur le graphique':''));
    }
    if(b.page_marches && typeof b.page_marches==='object'){ const m=b.page_marches;
      p.push('page Marchés (rendements en pourcent) : '+pairs(m.rendements||{})+' ; écarts en points de base : '+pairs(m.ecarts_pb||{})+' ; variation des indices en pourcent : '+pairs(m.indices||{})); }
    if(b.page_cot && typeof b.page_cot==='object'){ const c=b.page_cot;
      p.push('page COT affichée : '+c.contrat+', positions du '+c.date_positions+', position nette des spéculateurs '+fmtNum(c.net,0)+' (variation sur la semaine '+fmtNum(c.variation_semaine,0)+'), '+c.centile_1an+'e centile de l’année ; '+c.lecture); }
    if(b.page_analyse && typeof b.page_analyse==='object'){ const a=b.page_analyse;
      p.push('page Analyse affichée ('+a.actif+') : biais '+a.biais+', confiance '+a.confiance+' sur 5 ; '+a.synthese); }
    if(b.analyse_en_cours) p.push("l'analyse du nouvel actif est en cours de calcul, les chiffres arrivent dans quelques instants");
    if(b.notes && String(b.notes).trim()) p.push('notes stratégiques de Justin : « '+String(b.notes).trim().slice(0,600)+' »');
    if(b.maj) p.push('données mises à jour '+fmtAge(b.maj));
    return p.join(' ; ');
  }

  function updateBridgeStatus(){
    const b=readBridge();
    if(!b){ bridgeEl.textContent='TERMINAL · fermé'; bridgeEl.className='bridge off'; return; }
    const bits=[terminalOuvert(b)?'● ouvert':'○ fermé'];
    if(b.actif) bits.push(b.actif);
    if(b.tendance_globale) bits.push(b.tendance_globale);
    if(b.score_global!=null) bits.push(b.score_global+'/100');
    if(b.maj) bits.push(fmtAge(b.maj));
    bridgeEl.textContent='TERMINAL · '+bits.join(' · ');
    bridgeEl.className='bridge '+(terminalOuvert(b)?'on':'off');
  }
  setInterval(updateBridgeStatus,3000);
  RayleBus.on('etat:terminal',updateBridgeStatus);
