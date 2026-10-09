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
  $('cfgTestInfo').addEventListener('click',async()=>{
    saveCfg();
    if(!workerReady()){ cfgMsg.textContent="✖ Renseignez d'abord l'adresse du Worker et le code d'accès."; return; }
    const nb=d=>d.items.length+' articles ('+d.sources.slice(0,4).join(', ')+')';
    const tests=[
      ['Météo',async()=>{ const d=await wjson('/meteo',18000); return d.ville+' '+rnd(d.actuel.temp)+' °C, '+d.actuel.ciel+(d.air?', air '+d.air.qualite:''); }],
      ['Actus France',async()=>nb(await wjson('/actus?cat=fr',25000))],
      ['Actus monde',async()=>nb(await wjson('/actus?cat=monde',25000))],
      ['Actus économie',async()=>nb(await wjson('/actus?cat=eco',25000))],
      ['Actus tech',async()=>nb(await wjson('/actus?cat=tech',25000))],
      ['Actus crypto',async()=>nb(await wjson('/actus?cat=crypto',25000))],
      ['Recherche actus',async()=>nb(await wjson('/actus?q=Nvidia',20000))],
      ['Wikipédia',async()=>{ const d=await wjson('/wiki?q=genou&long=1',18000); return d.resultats.length+' résultat(s) : '+(d.resultats[0]?d.resultats[0].titre+' ('+d.resultats[0].extrait.length+' car.)':'aucun'); }],
      ['MDN',async()=>{ const d=await wjson('/mdn?q=flexbox',15000); return d.resultats.length+' résultat(s) : '+(d.resultats[0]?d.resultats[0].titre:'aucun'); }],
      ['Études',async()=>{ const d=await wjson('/sante?q='+encodeURIComponent('ligament croisé antérieur'),20000); return d.resultats.length+' étude(s)'; }],
      ['Médicament',async()=>{ const d=await wjson('/medicament?q='+encodeURIComponent('ibuprofène'),15000); return d.resultats[0]?d.resultats[0].nom:'aucune notice'; }],
      ['Calcul',async()=>{ const d=await wjson('/calcul?expr='+encodeURIComponent('15%*3200'),10000); return '15 % de 3200 = '+d.resultat; }],
      ['Conversion',async()=>{ const d=await wjson('/calcul?expr='+encodeURIComponent('10 mile to km'),10000); return '10 miles = '+d.resultat; }],
      ['Devises',async()=>{ const d=await wjson('/change?de=EUR&vers=USD&montant=100',12000); return '100 EUR = '+fmtNum(d.resultat,2)+' USD ('+d.source+')'; }],
      ['Mémoire',async()=>{ const d=await wjson('/memoire',10000); return d.notes.length+' élément(s) retenu(s)'; }],
      ['Sentiment',async()=>{ const d=await wjson('/sentiment',15000); const a=d.actions_peur_avidite, c=d.crypto_peur_avidite; return 'actions '+(a.score!=null?a.score:'✖')+' · crypto '+(c.score!=null?c.score:'✖'); }]
    ];
    const out=[];
    for(let i=0;i<tests.length;i++){
      cfgMsg.textContent='Test '+(i+1)+'/'+tests.length+' ('+tests[i][0]+')…\n'+out.join('\n');
      try{ out.push('✔ '+tests[i][0]+' : '+await tests[i][1]()); }
      catch(e){ out.push('✖ '+tests[i][0]+' : '+errMsg(e)); }
    }
    cfgMsg.textContent=out.join('\n')+'\n(YouTube : colle un lien dans le champ de texte pour le tester.)';
    addLine('sys','Test savoirs : '+out.join(' | '));
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
  const fichierEl=$('fichier');
  $('clip').addEventListener('click',()=>fichierEl.click());
  fichierEl.addEventListener('change',()=>{ const f=fichierEl.files&&fichierEl.files[0]; const q=txt.value; txt.value=''; fichierEl.value=''; envoyerFichier(f,q); });
  // Coller une capture (Ctrl+V) dans la page
  document.addEventListener('paste',e=>{
    const items=(e.clipboardData&&e.clipboardData.files)||[];
    if(items.length && /^(image|video)\//.test(items[0].type)){ e.preventDefault(); const q=txt.value; txt.value=''; envoyerFichier(items[0],q); }
  });
  // Glisser-déposer une image ou une vidéo sur le terminal
  const termEl=document.body;
  if(termEl){
    termEl.addEventListener('dragover',e=>{ e.preventDefault(); termEl.classList.add('depot'); });
    termEl.addEventListener('dragleave',()=>termEl.classList.remove('depot'));
    termEl.addEventListener('drop',e=>{ e.preventDefault(); termEl.classList.remove('depot'); const f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; const q=txt.value; txt.value=''; envoyerFichier(f,q); });
  }
