"use strict";
  /* ═════════════ TRAITEMENT D'UNE PHRASE ═════════════ */
  let engineLast='';
  async function respond(text){
    if(text && typeof text==='object') return respondMedia(text);
    // Question de suivi sur l'image envoyée juste avant : on la renvoie à Gemini avec la question
    if(lastImage && Date.now()-lastImage.t<30*60000 && IMG_SUIVI_RE.test(norm(text))) return respondMedia({image:lastImage.dataUrl,nom:lastImage.nom,q:text,suivi:true});
    const my=epoch;
    // Commandes du terminal (« ouvre le terminal », « passe sur le Bitcoin »…) : exécutées tout de suite, sans IA
    const cmdS=await commandeSecurite(text);    // « déverrouille », « verrouille », « journal de sécurité »…
    if(my!==epoch) return;
    if(cmdS){ diagAction('commande de sécurité'); addLine('ray',cmdS); await speak(cmdS); return; }
    const cmdT=await commandeTerminal(text);
    if(my!==epoch) return;
    if(cmdT){ diagAction('commande du terminal'); addLine('ray',cmdT); await speak(cmdT); return; }
    const cmdC=await commandeCarte(text);      // « montre-moi Toulouse », « itinéraire de A à B »
    if(my!==epoch) return;
    if(cmdC!==null){ diagAction('commande carte'); if(cmdC){ addLine('ray',cmdC); await speak(cmdC); } return; }
    const quick=quickAnswer(text);
    if(quick){ diagAction('réponse rapide'); addLine('ray',quick); try{ montrerReponse(text,quick); }catch(e){} await speak(quick); return; }

    diagAction("envoyé à l'IA");
    setState('thinking');
    let reply='', engine='', actions=[], viaAgent=false;
    // 1) Agent : le Worker choisit et enchaîne ses outils (données, alertes, mémoire…) et renvoie les actions de la page
    if(workerReady()){
      try{
        const d=await askAgent(text);
        if(my!==epoch) return;             // coupé pendant que l'IA travaillait
        reply=d.reply; engine=d.engine+(d.model?' · '+d.model:''); actions=d.actions||[]; viaAgent=true;
        if(d.outils && d.outils.length) addLine('sys','Outils : '+d.outils.map(o=>o.nom+(o.ok?'':' ✘')).join(' → '));
        diagAction('agent : '+(d.outils&&d.outils.length?d.outils.map(o=>o.nom).join(', '):'sans outil'));
      }catch(e){ if(my!==epoch) return; addLine('sys','Agent indisponible ('+errMsg(e)+') : chemin classique.'); }
    }
    // 2) Chemin classique : lecture des données par mots-clés, puis une réponse de l'IA
    if(!viaAgent){
      let ctx='';
      try{ ctx=await buildLiveContext(text); }catch(e){ if(my===epoch) addLine('sys','Lecture des données : '+errMsg(e)); }
      if(my!==epoch) return;                 // coupé pendant la lecture des données
      liveCtx=ctx;
      const long=/ANALYSE BOUGIE PAR BOUGIE|VIDÉO YOUTUBE/.test(ctx);
      if(!speaking) setState('thinking');
      if(workerReady()){
        try{
          const d=await askWorker(text,long);
          if(my!==epoch) return;             // coupé pendant que l'IA répondait
          reply=d.reply; engine=d.engine+(d.model?' · '+d.model:''); actions=d.actions||[];
        }catch(e){ if(my!==epoch) return; addLine('sys','Cerveau : '+errMsg(e)); }
      }
    }
    if(!valid(reply)){
      reply=localBrain(text);
      addLine('sys', workerReady() ? 'Mode secours local' : 'Mode secours local — configurez le Worker via ⚙ Réglages');
    }else{
      if(engine!==engineLast){ addLine('sys','Moteur IA : '+engine); engineLast=engine; }
      historiqueChat.push({role:'user',content:text},{role:'assistant',content:reply});
      saveHistory();
      noterEchange();                        // compte pour le résumé de conversation
    }
    liveCtx='';
    if(actions.length){                      // terminal, panneaux, cartes : exécutés pendant qu'elle parle
      const plus=await executerActions(actions,my);
      if(my!==epoch) return;
      if(plus) reply+=plus;
    }
    addLine('ray',reply);
    try{ montrerReponse(text,reply); }catch(e){}   // fenêtre HUD des points clés
    await speak(reply);
  }

  const queue=[]; let processing=false, drainId=0;
  async function drain(){
    const id=++drainId;
    processing=true;
    while(queue.length && id===drainId){ const t=queue.shift(); try{ await respond(t); }catch(e){ if(id===drainId) addLine('sys','Erreur interne : '+e.message); } }
    if(id!==drainId) return;               // coupé : une nouvelle boucle a pris le relais
    processing=false; lastAct=Date.now();
    if(!speaking){ restState(); if(modeToucher()) apresReponse(); }
  }
