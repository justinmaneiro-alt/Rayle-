"use strict";
  /* ═════════════ RECONNAISSANCE VOCALE ═════════════ */
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  let rec=null, lastStart=0;

  // Tablette / téléphone : Chrome y découpe la voix en morceaux et répète parfois les résultats.
  const IS_MOBILE=(function(){
    try{
      const force=new URLSearchParams(location.search).get('tablette');
      if(force==='1') return true;
      if(force==='0') return false;
    }catch(e){}
    try{
      const ua=(navigator.userAgent||'');
      if(/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
      if(/Macintosh/.test(ua) && navigator.maxTouchPoints>1) return true;
      if(window.matchMedia && window.matchMedia('(pointer:coarse)').matches) return true;
    }catch(e){}
    return false;
  })();
  const bargeActive=()=>prefs.barge() && micOn;

  // Sur tablette : on rassemble les morceaux et on n'envoie la phrase qu'après une courte pause.
  const FLUSH_MS=1500;
  let pendingTxt='', flushTimer=null, lastSent='', lastSentT=0;
  function resetPending(){ pendingTxt=''; clearTimeout(flushTimer); flushTimer=null; }
  function flushPending(){
    const t=pendingTxt.trim(); resetPending();
    if(!interimEl.textContent.startsWith('zz')) interimEl.textContent='';
    if(!t) return;
    if(norm(t)===lastSent && Date.now()-lastSentT<4000) return;
    lastSent=norm(t); lastSentT=Date.now();
    onUser(t,true);
  }
  function deliver(txt){
    txt=String(txt||'').trim(); if(!txt) return;
    if(!IS_MOBILE){ onUser(txt,true); return; }
    const n=norm(txt), cur=norm(pendingTxt);
    if(cur && cur.includes(n)) { /* répétition d'un morceau déjà reçu */ }
    else if(cur && n.startsWith(cur)) pendingTxt=txt;
    else pendingTxt=(pendingTxt?pendingTxt+' ':'')+txt;
    interimEl.textContent='… '+pendingTxt;
    clearTimeout(flushTimer);
    const c=cmdNorm(norm(fixName(pendingTxt)));
    if(COUPURE_RE.test(c) || STOP_RE.test(c)){ flushPending(); return; }
    flushTimer=setTimeout(flushPending,FLUSH_MS);
  }

  function buildRec(){
    const r=new SR();
    r.lang='fr-FR'; r.continuous=!IS_MOBILE; r.interimResults=true; r.maxAlternatives=1;
    r.onresult=e=>{
      dernierSon=Date.now();
      let interim='', fin='';
      for(let i=e.resultIndex;i<e.results.length;i++){
        const t=e.results[i][0].transcript;
        if(e.results[i].isFinal) fin+=t; else interim+=t;
      }
      // Pendant qu'elle parle, et juste après : seules les commandes d'arrêt comptent
      if(speaking || Date.now()-speechEndT<900){
        if(fin.trim()){
          const c=cmdNorm(norm(fixName(fin)));
          if(COUPURE_RE.test(c)){ addLine('user',fin.trim()); coupureTotale(); }
          else if(STOP_RE.test(c)) cutAll('Parole interrompue');
        }
        return;
      }
      if(mode==='veille' && reveilActif()){
        if(interim) interimEl.textContent='zz … '+interim;
      }else{
        interimEl.textContent=interim ? '… '+(pendingTxt?pendingTxt+' ':'')+interim : (pendingTxt?'… '+pendingTxt:'');
      }
      if(fin.trim()){ if(!interimEl.textContent.startsWith('zz')) interimEl.textContent=''; deliver(fin); }
    };
    r.onerror=e=>{
      if(e.error==='not-allowed' || e.error==='service-not-allowed'){
        addLine('sys',"Micro refusé : autorisez-le dans Chrome (cadenas à gauche de l'adresse), puis réessayez.");
        stopListening();
      }else if(e.error==='network'){
        addLine('sys','Reconnaissance vocale : réseau indisponible.');
      }
    };
    r.onend=()=>{
      if(!interimEl.textContent.startsWith('zz')) interimEl.textContent=pendingTxt?('… '+pendingTxt):'';
      if(micOn && (!speaking || bargeActive()) && !(modeToucher() && (processing || queue.length))){
        const wait=(Date.now()-lastStart<800)?1000:250;
        setTimeout(startRec,wait);
      }
    };
    return r;
  }
  function startRec(){
    if(!SR || !micOn || (speaking && !bargeActive())) return;
    if(modeToucher() && (processing || queue.length || speaking)) return;
    try{
      if(!rec) rec=buildRec();
      lastStart=Date.now();
      rec.start();
    }catch(e){
      if(e && e.name==='InvalidStateError') return;
      try{ rec=buildRec(); lastStart=Date.now(); rec.start(); }catch(_){}
    }
  }
  function stopRecSoft(){ try{ rec && rec.stop(); }catch(e){} }
  // Coupe le micro net et jette ce qu'il était en train d'écouter (évite qu'elle s'entende)
  function muteRec(){ try{ rec && rec.abort(); }catch(e){} resetPending(); }

  let wakeLock=null;
  async function garderEcranAllume(on){
    try{
      if(on && 'wakeLock' in navigator && document.visibilityState==='visible'){ if(!wakeLock) wakeLock=await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release',()=>{ wakeLock=null; }); }
      else if(!on && wakeLock){ await wakeLock.release(); wakeLock=null; }
    }catch(e){ wakeLock=null; }
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible') return;
    if(micOn && !modeToucher()){ garderEcranAllume(true); if(!speaking) setTimeout(startRec,400); }
  });

  let greeted=false;
  function startListening(){
    if(!SR) return;
    if(modeToucher()){ ouvrirEcoute(); return; }
    debloquerAudio();
    garderEcranAllume(true);
    micOn=true;
    mode=reveilActif()?'veille':'conversation';
    majBouton(); restState();
    addLine('sys','Écoute vocale activée (fr-FR, '+(IS_MOBILE?'mode tablette':'mode continu')+(reveilActif()?', mot d\'activation « Raylé »':', réponse à tout')+')');
    startRec();
    if(!greeted){
      greeted=true;
      const g=reveilActif()
        ? 'Raylé en ligne. '+fx('Dites','Dis')+' mon nom quand '+fx('vous avez','tu as')+' besoin de moi.'
        : 'Raylé en ligne. '+fx('Je vous écoute, Justin.',"Je t'écoute, Justin.");
      addLine('ray',g); speak(g);
    }
  }
  function stopListening(){
    garderEcranAllume(false);
    micOn=false;
    try{ rec && rec.abort(); }catch(e){}
    cutAll();
    interimEl.textContent='';
    majBouton(); restState();
    addLine('sys','Écoute vocale désactivée');
  }
