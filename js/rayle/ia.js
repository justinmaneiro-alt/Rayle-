"use strict";
  /* ═════════════ INTELLIGENCE : le Worker ═════════════ */
  const historiqueChat=[];
  const HIST_KEY='rayle_historique';
  try{ const h=JSON.parse(localStorage.getItem(HIST_KEY)||'null'); if(h && Date.now()-h.t<6*3600e3 && Array.isArray(h.m)) historiqueChat.push(...h.m.slice(-12)); }catch(e){}
  function saveHistory(){ while(historiqueChat.length>12) historiqueChat.shift(); try{ localStorage.setItem(HIST_KEY,JSON.stringify({t:Date.now(),m:historiqueChat})); }catch(e){} }
  let liveCtx='';   // données lues en direct pour la question en cours

  function contextText(){
    let s='';
    if(liveCtx) s+=liveCtx+'\n';
    const b=readBridge();
    s+=terminalLink(b)+'\n';
    if(b){ const sm=bridgeSummary(b); if(sm) s+="Ce que Justin a actuellement à l'écran sur son terminal, et ses notes : "+sm+".\n"; }
    s+='Date et heure : '+new Date().toLocaleString('fr-FR',{timeZone:'Europe/Paris'})+' (heure de Paris).';
    return s;
  }

  async function askWorker(text,long){
    const res=await wfetch('/chat',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:text, context:contextText(), history:historiqueChat.slice(-8)})
    },long?90000:40000);
    if(!res.ok) throw await workerError(res);
    const d=await res.json();
    if(!valid(d.reply)) throw new Error('réponse vide');
    return d;
  }

  async function pingWorker(verbose){
    if(!workerReady()){ addLine('sys','Cerveau : Worker non configuré — ouvrez ⚙ Réglages'); return null; }
    try{
      const res=await wfetch('/ping',{method:'GET'},10000);
      if(!res.ok) throw await workerError(res);
      const p=await res.json();
      persona.adresse=p.adresse||'vous'; persona.voix=p.voix||'';
      if(typeof p.feminin==='boolean') persona.feminin=p.feminin;
      if(isFinite(p.vitesse)) persona.vitesse=p.vitesse;
      try{ localStorage.setItem('rayle_persona',JSON.stringify(persona)); }catch(e){}
      loadVoices(); majVitesseUI();
      voiceEl.textContent='voix : '+p.voix+(p.azure?' (Azure)':' (Edge)');
      const info='Worker connecté ('+(p.version||'ancienne version')+') · IA : '+((p.ia||[]).join(' → ')||'aucune clé')
        +' · voix '+p.voix+(p.azure?' Azure'+(p.azureMois!=null?' ('+p.azureMois.toLocaleString('fr-FR')+' / '+p.azureLimite.toLocaleString('fr-FR')+' car. ce mois)':''):' Edge')
        +' · Twelve Data '+(p.twelvedata?'ok'+(p.tdJour!=null?' ('+p.tdJour+' req. aujourd\'hui)':''):'absente')
        +' · Gemini '+(p.gemini?'ok':'absente')
        +' · base D1 '+(p.d1?'ok':'absente')
        +(Array.isArray(p.savoirs)?' · savoirs : '+p.savoirs.join(', ')+(p.ville?' (météo par défaut : '+p.ville+')':''):'');
      if(verbose!==false) addLine('sys',info);
      if(!/^phase2/.test(p.version||'')) addLine('sys',"⚠ Le Worker n'est pas encore à jour : colle le nouveau code dans Cloudflare pour activer les nouveautés.");
      return Object.assign(p,{info:info});
    }catch(e){ addLine('sys','Worker : '+errMsg(e)); return null; }
  }

  /* ═════════════ RÉPONSES SANS IA (économie de quota) ═════════════ */
  function heureTexte(){ return new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}).replace(':',' heures '); }
  function dateTexte(){ return new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}); }
  function quickAnswer(text){
    const n=cmdNorm(norm(text));
    if(n.length>45) return null;
    if(/^(quelle heure (est[- ]il|il est)?|il est quelle heure|l'?heure)( stp| s'?il (te|vous) plait)?$/.test(n)) return 'Il est '+heureTexte()+', Justin.';
    if(/^(quel jour (sommes[- ]nous|on est|est[- ]on|est[- ]ce)?|on est quel jour|quelle (est la )?date)( aujourd'?hui)?$/.test(n)) return 'Nous sommes le '+dateTexte()+', Justin.';
    return null;
  }

  /* ═════════════ CERVEAU DE SECOURS LOCAL ═════════════ */
  const DECISION=()=>"Simple lecture des données, Justin : la décision "+fx('vous appartient.',"t'appartient.");
  function marketAnswer(b,wantNotes){
    if(!b) return "Je ne perçois aucune donnée du terminal, Justin. "+fx('Ouvrez-le','Ouvre-le')+" dans ce même navigateur et "+fx('laissez','laisse')+"-le charger quelques instants.";
    const notes=(b.notes && String(b.notes).trim()) ? String(b.notes).trim() : '';
    if(wantNotes){
      return notes ? "Voici "+fx('vos','tes')+" notes, Justin : "+notes.slice(0,400) : fx('Vos','Tes')+" notes sont vides pour le moment, Justin.";
    }
    const p=[];
    if(b.actif){
      let s='Sur '+b.actif;
      if(b.tendance_globale) s+=', la tendance globale est '+String(b.tendance_globale).toLowerCase();
      if(b.score_global!=null) s+=', avec un score de '+b.score_global+' sur 100';
      p.push(s+'.');
    }
    if(b.rsi && b.rsi.H1!=null) p.push('Le RSI en H1 est à '+b.rsi.H1+'.');
    if(b.structure && b.structure.lecture) p.push('Côté structure, '+b.structure.lecture+(b.structure.alerte?' ; '+b.structure.alerte:'')+'.');
    if(b.support!=null && b.resistance!=null) p.push('Le support le plus proche se situe à '+fmtNum(b.support)+' et la résistance à '+fmtNum(b.resistance)+'.');
    if(!p.length) return "Le terminal ne m'a pas encore transmis ses analyses, Justin."+(notes?" Je vois toutefois des notes en cours.":'');
    p.push(DECISION());
    return p.join(' ');
  }

  function localBrain(text){
    const n=norm(text); const h=new Date().getHours();
    if(/\b(bonjour|salut|coucou|hello|bonsoir)\b/.test(n)) return (h>=18||h<5?'Bonsoir':'Bonjour')+", Justin. Les circuits sont chauds, les marchés aussi.";
    if(/quelle heure|l'heure|\bheure\b/.test(n)) return "Il est "+heureTexte()+", Justin.";
    if(/quel jour|la date|\bdate\b|aujourd/.test(n)) return "Nous sommes le "+dateTexte()+", Justin.";
    if(/\bmerci\b/.test(n)) return 'Avec plaisir, Justin.';
    if(/qui es[- ]?tu|ton nom|comment tu t'?appelles|presente[- ]?toi|que sais[- ]tu faire/.test(n)) return "Je suis Raylé, "+fx('votre','ton')+" copilote, Justin. Je lis "+fx('vos','tes')+" graphiques bougie par bougie, je suis l'actualité, la météo, la médecine et l'anatomie, je calcule, je regarde des vidéos YouTube, et je "+fx('vous','te')+" réponds à la voix. Le café, en revanche, reste hors de mon périmètre.";
    if(/ca va|comment vas[- ]?tu|tu vas bien/.test(n)) return "Aucune panne à signaler, Justin. Les circuits ronronnent.";
    if(liveData.snaps.length || liveData.cal || liveData.extra.length){
      const sp=liveData.snaps.map(x=>x.speech).concat(liveData.cal?[liveData.cal.speech]:[],liveData.extra);
      return sp.join(' ')+(liveData.snaps.length?' '+DECISION():'');
    }
    if(/\bnotes?\b/.test(n)) return marketAnswer(readBridge(),true);
    if(/march|terminal|nasdaq|bitcoin|btc|solana|\bsol\b|\bor\b|gold|eur|dollar|petrole|analys|tendance|rsi|score|support|resistance|niveau|situation|graphique|ecran/.test(n)) return marketAnswer(readBridge(),false);
    const short=String(text).trim().slice(0,90);
    return "Je "+fx("vous ai","t'ai")+" "+fem('bien entendu','bien entendu')+", Justin : « "+short+" ». Mon cerveau en ligne ne répond pas pour l'instant, mais je reste disponible pour l'état du terminal, "+fx('vos','tes')+" notes, l'heure ou la date.";
  }
