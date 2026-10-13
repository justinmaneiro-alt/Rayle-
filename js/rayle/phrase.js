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
    // Répertoire, messages et appels préparés (js/rayle/repertoire.js) : avant les autres appareils, pour « … sur le téléphone »
    const cmdR=typeof commandeMessages==='function' ? await commandeMessages(text) : null;
    if(my!==epoch) return;
    if(cmdR){ diagAction('répertoire, message ou appel'); addLine('ray',cmdR); await speak(cmdR); return; }
    // Relais (js/rayle/relais.js) : « ouvre XTB sur le PC », « allume la lampe du téléphone », « regarde mon écran PC »…
    const cmdX=typeof commandeRelais==='function' ? await commandeRelais(text) : null;
    if(my!==epoch) return;
    if(cmdX && cmdX.fait) return;                                   // capture d'écran : l'analyse de l'image a déjà répondu
    if(cmdX){ diagAction('commande vers un relais'); addLine('ray',cmdX); await speak(cmdX); return; }
    // Autre appareil : « affiche l'or en H4 sur la tablette », « fais sonner le téléphone »… (js/rayle/appareils.js)
    const cmdA=typeof commandeAppareils==='function' ? await commandeAppareils(text) : null;
    if(my!==epoch) return;
    if(cmdA && typeof cmdA==='object') text=cmdA.texte;            // c'était cet appareil : on continue avec la phrase sans son nom
    else if(cmdA){ diagAction('commande vers un autre appareil'); addLine('ray',cmdA); await speak(cmdA); return; }
    const cmdD=typeof commandeDrive==='function' ? await commandeDrive(text) : null;   // documents du Drive (js/rayle/commandes-drive.js) : « ouvre le cours d'anatomie », « lis la suite »…
    if(my!==epoch) return;
    if(cmdD){ diagAction('documents Drive'); addLine('ray',cmdD); await speak(cmdD); return; }
    const cmdM=typeof commandeMonde==='function' ? await commandeMonde(text) : null;   // page Monde : « montre-moi le Japon », « affiche l'inflation sur la carte »…
    if(my!==epoch) return;
    if(cmdM){ diagAction('commande de la page Monde'); addLine('ray',cmdM); await speak(cmdM); return; }
    const cmdE=typeof commandeEspaceSavoir==='function' ? commandeEspaceSavoir(text) : null;   // questions de savoir sur l'espace (fiches sourcées), sans IA
    if(cmdE){ diagAction('savoir espace (fiches sourcées)'); addLine('ray',cmdE); await speak(cmdE); return; }
    const cmdAn=typeof commandeAnatomie==='function' ? await commandeAnatomie(text) : null;   // anatomie et orthopédie : pop-up 3D, fenêtre, pathologies, appareillages
    if(my!==epoch) return;
    if(cmdAn){ diagAction('commande anatomie'); addLine('ray',cmdAn); await speak(cmdAn); return; }
    const cmdT=await commandeTerminal(text);
    if(my!==epoch) return;
    if(cmdT){ diagAction('commande du terminal'); addLine('ray',cmdT); await speak(cmdT); return; }
    const cmdC=await commandeCarte(text);      // « montre-moi Toulouse », « itinéraire de A à B »
    if(my!==epoch) return;
    if(cmdC!==null){ diagAction('commande carte'); if(cmdC){ addLine('ray',cmdC); await speak(cmdC); } return; }
    const quick=quickAnswer(text);
    if(quick){ diagAction('réponse rapide'); addLine('ray',quick); try{ montrerReponse(text,quick); }catch(e){} await speak(quick); return; }

    if(typeof RayleRepertoire!=='undefined') text=RayleRepertoire.masquer(text);   // jamais un numéro ni une adresse vers l'IA
    diagAction("envoyé à l'IA");
    setState('thinking');
    let reply='', engine='', actions=[], viaAgent=false;
    // Cours de Justin (onglet « Cours » de la fenêtre Anatomie) : extraits utiles à une question d'anatomie, de clinique ou d'appareillage
    let coursCtx=''; try{ coursCtx=typeof contexteCours==='function' ? await contexteCours(text) : ''; }catch(e){}
    if(my!==epoch) return;
    if(coursCtx) liveCtx=coursCtx;
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
      liveCtx=(coursCtx ? coursCtx+'\n' : '')+ctx;
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
      if(typeof echecsActions!=='undefined' && echecsActions.length){ reply=echecsActions.join(' '); echecsActions.length=0; }   // une action a échoué : on le dit, on ne prétend pas l'avoir faite
      else if(plus) reply+=plus;
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
