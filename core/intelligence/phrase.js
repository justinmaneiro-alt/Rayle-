"use strict";
  /* ═════════════ TRAITEMENT D'UNE PHRASE ═════════════ */
  let engineLast='';
  async function respond(text){
    const my=epoch;
    if(window.MultiEcrans) MultiEcrans.diffuserVoix(text);    // mode multi-écrans : les fenêtres des autres écrans reçoivent aussi la demande (actualités…)
    // Commandes du terminal (« ouvre le terminal », « passe sur le Bitcoin »…) : exécutées tout de suite, sans IA
    const cmdS=await commandeSecurite(text);    // « déverrouille », « verrouille », « journal de sécurité »…
    if(my!==epoch) return;
    if(cmdS){ diagAction('commande de sécurité'); addLine('ray',cmdS); await speak(cmdS); return; }
    const cmdMo=window.MobileVoix?await MobileVoix.commande(text):null;    // V8 : téléphone et tablette (coque mobile) : « l'actualité en France », « affiche le terminal », « ouvre l'agent », « mode galaxie » → équivalent Jarvis
    if(my!==epoch) return;
    if(cmdMo){ diagAction('commande mobile'); addLine('ray',cmdMo); await speak(cmdMo); return; }
    const cmdV=window.VeilleurPage?await VeilleurPage.commande(text):null;    // « active le veilleur », « montre-moi les alertes » : alertes de l'agent Bitcoin
    if(my!==epoch) return;
    if(cmdV){ diagAction('veilleur d alertes'); addLine('ray',cmdV); await speak(cmdV); return; }
    const cmdD=window.DirectPage?await DirectPage.commande(text):null;    // sources en direct : « montre-moi les séismes », « mets France 24 en direct », « que dit l'OMS ? »
    if(my!==epoch) return;
    if(cmdD){ diagAction('sources en direct'); addLine('ray',cmdD); await speak(cmdD); return; }
    const cmdL=window.LiquiditeVoix?await LiquiditeVoix.commande(text):null;    // « ouvre la carte de liquidité », « où va le marché ? » : carnet d'ordres enregistré par Kepler (V4)
    if(my!==epoch) return;
    if(cmdL){ diagAction('carte de liquidité'); addLine('ray',cmdL); await speak(cmdL); return; }
    const cmdM=await commandeMars(text);    // terminal de la base Mars (seulement quand Mars est ouverte) : « montre-moi l'or en H1 »
    if(my!==epoch) return;
    if(cmdM){ diagAction('terminal de Mars'); addLine('ray',cmdM); await speak(cmdM); return; }
    const cmdT=await commandeTerminal(text);
    if(my!==epoch) return;
    if(cmdT){ diagAction('commande du terminal'); addLine('ray',cmdT); await speak(cmdT); return; }
    const cmdG=await commandeGalaxie(text);    // « va sur Mars », « retour à la galaxie », « mode jeu »…
    if(my!==epoch) return;
    if(cmdG){ diagAction('commande de la galaxie'); addLine('ray',cmdG); await speak(cmdG); return; }
    const cmdA=window.ActusAccueil?await ActusAccueil.commande(text):null;    // « les actualités », « actus sport », « ferme les actualités » : fenêtres de l'accueil
    if(my!==epoch) return;
    if(cmdA){ diagAction('actualités (accueil)'); addLine('ray',cmdA); await speak(cmdA); return; }
    const cmdF=window.G1&&G1.commande?await G1.commande(text):null;    // « ouvre la fenêtre météo », « mes tâches », « ferme la fenêtre » : grande fenêtre de l'accueil Aurore
    if(my!==epoch) return;
    if(cmdF){ diagAction('fenêtre de l accueil'); addLine('ray',cmdF); await speak(cmdF); return; }
    const quick=quickAnswer(text);
    if(quick){ diagAction('réponse rapide'); addLine('ray',quick); await speak(quick); return; }
    // Questions visuelles (« montre-moi… », « à quoi ressemble… », « photo de… ») : des images libres dans une fenêtre holographique, sans IA ; « qui est… » : l'IA répond, les images arrivent en même temps
    if(window.ImagesHolo){
      const phraseImages=await ImagesHolo.demandeExplicite(text);
      if(my!==epoch) return;
      if(phraseImages){ diagAction('images libres'); addLine('ray',phraseImages); await speak(phraseImages); return; }
      ImagesHolo.lancerParallele(text);
    }
    if(window.MediasHolo) MediasHolo.lancer(text);    // question de recherche ou d'actualité : images et vidéo cherchées en parallèle, affichées APRÈS la réponse écrite (jamais pour une commande)

    diagAction("envoyé à l'IA");
    setState('thinking');
    let reply='', engine='', actions=[], viaAgent=false;
    // 0) IA locale (LM Studio) pour les tâches courantes ; null = le Worker répond comme avant. Le modèle non censuré (sur demande explicite) ne déclenche aucune action et n'entre pas dans l'historique.
    let sansHistorique=false;
    if(window.IaLocale){
      try{ const L=await IaLocale.essayer(text,{historique:historiqueChat.slice(-8),contexte:contextText()}); if(my!==epoch) return; if(L&&valid(L.reply)){ reply=L.reply; engine=L.engine+(L.model?' · '+L.model:''); actions=[]; viaAgent=true; sansHistorique=!!L.sansHistorique; diagAction('IA locale'); } }catch(e){ /* le Worker prend le relais */ }
    }
    // 1) Agent : le Worker choisit et enchaîne ses outils (données, alertes, mémoire…) et renvoie les actions de la page
    if(!reply&&workerReady()){
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
      const long=/ANALYSE BOUGIE PAR BOUGIE/.test(ctx);
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
      if(!sansHistorique){ historiqueChat.push({role:'user',content:text},{role:'assistant',content:reply}); saveHistory(); }
      noterEchange();                        // compte pour le résumé de conversation
    }
    liveCtx='';
    if(actions.length){                      // terminal, panneaux : exécutés pendant qu'elle parle
      const plus=await executerActions(actions,my);
      if(my!==epoch) return;
      if(plus) reply+=plus;
    }
    if(window.ImagesHolo){ const suiteImages=await ImagesHolo.finParallele(1500); if(my!==epoch) return; if(suiteImages) reply+=' '+suiteImages; }   // « Voici les images de l'article Wikipédia « … » »
    if(window.TerreVoix && TerreVoix.enAttente()){      // présentation sur la Terre : la caméra suit chaque sujet pendant qu'elle parle ([1], [2]… jamais prononcés)
      addLine('ray',TerreVoix.propre(reply));
      if(window.MediasHolo) MediasHolo.montrer();
      await TerreVoix.dire(reply,speak,()=>my!==epoch);
    }else{
      if(window.TerreVoix) reply=TerreVoix.propre(reply);
      addLine('ray',reply);
      if(window.MediasHolo) MediasHolo.montrer();    // le texte est la réponse : les médias s'ouvrent seulement maintenant, sans retarder la voix
      await speak(reply);
    }
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
