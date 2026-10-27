"use strict";
  /* ═════════════ RÉGLAGES ═════════════ */
  const cfgEl=$('cfg'), kUrl=$('kUrl'), kTok=$('kTok'), cfgMsg=$('cfgMsg'),
        kVit=$('kVit'), kVitVal=$('kVitVal'), kReveil=$('kReveil'), kBarge=$('kBarge'), kNoms=$('kNoms');
  function majVitesseUI(){
    const v=vitesseCourante();
    kVit.value=String(v);
    kVitVal.textContent=(v>0?'+':'')+v+' %'+(prefs.vitesse()==null?' (réglage du Worker)':'');
  }
  $('gear').addEventListener('click',()=>{
    cfgEl.classList.toggle('open');
    kUrl.value=store.get(KEY_WURL); kTok.value=store.get(KEY_WTOK); kTok.type='password'; cfgMsg.textContent='';
    kReveil.checked=prefs.reveil(); kBarge.checked=prefs.barge(); kNoms.value=store.get(KEY_NOMS);
    kMode.value=prefs.mode(); kSuite.checked=prefs.suite();
    majVitesseUI();
  });
  kVit.addEventListener('input',()=>{ store.set(KEY_VIT,kVit.value); majVitesseUI(); });
  kVit.addEventListener('change',()=>{ const t='Voici ma nouvelle vitesse de lecture, Justin.'; addLine('ray',t); speak(t); });
  kReveil.addEventListener('change',()=>{
    store.set(KEY_REVEIL,kReveil.checked?'':'0');
    if(micOn) mode=kReveil.checked?'veille':'conversation';
    majBouton(); restState();
    addLine('sys',kReveil.checked?"Mot d'activation activé : dites « Raylé » pour lui parler.":"Mot d'activation désactivé : elle répond à tout ce qu'elle entend.");
  });
  const kMode=$('kMode'), kSuite=$('kSuite');
  kMode.addEventListener('change',()=>{
    if(micOn) stopListening();
    store.set(KEY_MODE,kMode.value==='auto'?'':kMode.value);
    majBouton(); restState();
    addLine('sys','Façon de parler : '+(modeToucher()?'toucher pour parler':'mains libres')+(kMode.value==='auto'?' (choisi automatiquement pour cet appareil)':''));
  });
  kSuite.addEventListener('change',()=>{ store.set(KEY_SUITE,kSuite.checked?'':'0'); });
  $('cfgClose').addEventListener('click',()=>cfgEl.classList.remove('open'));
  kBarge.addEventListener('change',()=>{ store.set(KEY_BARGE,kBarge.checked?'1':''); addLine('sys',kBarge.checked?'Interruption à la voix activée (le micro reste ouvert pendant qu\'elle parle).':'Interruption à la voix désactivée.'); });
  kNoms.addEventListener('change',()=>{ store.set(KEY_NOMS,kNoms.value.trim()); buildFixName(); addLine('sys','Variantes du nom enregistrées.'); });

  function saveCfg(){
    let u=kUrl.value.trim();
    if(u && !/^https?:\/\//i.test(u)) u='https://'+u;
    kUrl.value=u;
    store.set(KEY_WURL,u.replace(/\/+$/,'')); store.set(KEY_WTOK,kTok.value.trim());
  }
  $('cfgSave').addEventListener('click',async()=>{
    saveCfg(); cfgMsg.textContent='Enregistré. Vérification…';
    const p=await pingWorker(true);
    cfgMsg.textContent=p ? '✔ '+p.info : '✖ Le Worker ne répond pas correctement (voir le journal).';
  });
  $('cfgGen').addEventListener('click',()=>{
    const a=new Uint8Array(24); crypto.getRandomValues(a);
    const t=Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
    kTok.type='text'; kTok.value=t;
    const done=ok=>{ cfgMsg.textContent=(ok?'Code généré et copié. ':'Code généré (copiez-le à la main). ')+"Collez-le dans le secret RAYLE_TOKEN du Worker, puis touchez Enregistrer ici."; };
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(()=>done(true),()=>done(false)); else done(false);
  });
  $('cfgTest').addEventListener('click',async()=>{
    saveCfg();
    if(!workerReady()){ cfgMsg.textContent="✖ Renseignez l'adresse du Worker et le code d'accès."; return; }
    cfgMsg.textContent='Test du Worker…';
    const p=await pingWorker(true);
    if(!p){ cfgMsg.textContent='✖ Le Worker ne répond pas correctement (voir le journal).'; return; }
    cfgMsg.textContent='✔ '+p.info+'\nTest de l\'IA…';
    try{
      const r=await wfetch('/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Présente-toi en une seule courte phrase.',context:'',history:[]})},40000);
      if(!r.ok) throw await workerError(r);
      const d=await r.json();
      cfgMsg.textContent='✔ '+p.info+'\n✔ IA '+d.engine+' ('+d.model+') répond : '+String(d.reply).slice(0,140);
      addLine('sys','Test IA réussi : '+d.engine+' · '+d.model);
    }catch(e){ cfgMsg.textContent='✔ '+p.info+'\n✖ IA : '+errMsg(e); }
  });
  $('cfgTestVoix').addEventListener('click',()=>{
    saveCfg();
    const t='Test de la voix. Raylé à '+fx('votre','ton')+' écoute, Justin. Voici ma vitesse de lecture actuelle.';
    cfgMsg.textContent='Lecture du test…';
    addLine('ray',t);
    speak(t).then(()=>{ cfgMsg.textContent='Test terminé. La source de la voix est indiquée dans le journal et en haut à droite.'; });
  });
  $('cfgClean').addEventListener('click',()=>{
    OLD_KEYS.forEach(k=>store.set(k,''));
    cfgMsg.textContent='✔ Anciennes clés Groq, OpenRouter et Twelve Data effacées de ce navigateur.';
    addLine('sys','Anciennes clés effacées de ce navigateur');
  });
  $('cfgTestMkt').addEventListener('click',async()=>{
    saveCfg();
    if(!workerReady()){ cfgMsg.textContent="✖ Renseignez d'abord l'adresse du Worker et le code d'accès."; return; }
    const out=[]; const codes=['NDX','XAU','BTC','SOL','EUR'];
    for(let i=0;i<codes.length;i++){
      const m=MKT[codes[i]];
      cfgMsg.textContent='Test marché '+(i+1)+'/'+codes.length+' ('+m.nom+')…';
      try{
        const d=await marcheSeries(codes[i],'1h');
        out.push('✔ '+cap(m.nom)+' '+Number(d.bougies.at(-1).c).toLocaleString('fr-FR',{maximumFractionDigits:m.dec})+' ['+d.source+(d.secours?', secours':'')+(d.differe?', différé':'')+']');
      }catch(e){ out.push('✖ '+cap(m.nom)+' : '+errMsg(e)); }
    }
    cfgMsg.textContent=out.join('  ·  ')+'  ·  test des bougies…';
    try{ const d=await wjson('/bougies?actif=BTC&intervalle=15min&n=5',25000); out.push('✔ Bougies BTC M15 : '+d.bougies.length+' bougies annotées ('+d.resume.structure+')'); }
    catch(e){ out.push('✖ Bougies : '+errMsg(e)); }
    try{ const ev=await fetchCalendar(true); out.push('✔ Calendrier : '+ev.length+' annonces ('+calVia+')'); }
    catch(e){ out.push('✖ Calendrier : '+errMsg(e)); }
    cfgMsg.textContent=out.join('  ·  ');
    addLine('sys','Test marché : '+out.join(' | '));
  });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') cutAll('Coupé (Échap)'); });

  function actionBouton(){
    if(modeToucher()){
      if(speaking || processing || queue.length){ cutAll(); ouvrirEcoute(); return; }   // on l'interrompt et on parle
      if(micOn){ fermerMicro(); return; }
      ouvrirEcoute(); return;
    }
    micOn ? stopListening() : startListening();
  }
  btn.addEventListener('click',actionBouton);
  // Toucher le réacteur : couper la parole, ou réveiller Raylé sans dire son nom
  reactor.addEventListener('click',()=>{
    if(modeToucher()){ actionBouton(); return; }
    if(speaking || processing){ cutAll('Coupé (toucher)'); return; }
    if(!micOn){ startListening(); return; }
    if(mode==='veille' && reveilActif()){ enterConversation(); ack(); }
  });
  form.addEventListener('submit',e=>{ e.preventDefault(); const v=txt.value; txt.value=''; if(IS_MOBILE) txt.blur(); onUser(v,false); });
