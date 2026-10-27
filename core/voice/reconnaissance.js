"use strict";
  /* ═════════════ RECONNAISSANCE VOCALE ═════════════ */
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  let rec=null, lastStart=0, recActif=false, recDepuis=0;

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

  let erreursReseau=0, derniereErreurReseau=0, dernierMessageReseau=0;
  function buildRec(){
    const r=new SR();
    r.lang='fr-FR'; r.continuous=!IS_MOBILE; r.interimResults=true; r.maxAlternatives=1;
    r.onresult=e=>{
      dernierSon=Date.now(); erreursReseau=0;
      let interim='', fin='';
      for(let i=e.resultIndex;i<e.results.length;i++){
        const t=e.results[i][0].transcript;
        if(e.results[i].isFinal) fin+=t; else interim+=t;
      }
      // Pendant qu'elle parle, et juste après : seules les commandes d'arrêt comptent
      if(speaking || Date.now()-speechEndT<900){
        if(fin.trim()){
          const c=cmdNorm(norm(fixName(fin)));
          if(COUPURE_RE.test(c)){ diagEntree(fin.trim(),true,'coupure totale (pendant ma parole)'); addLine('user',fin.trim()); coupureTotale(); }
          else if(STOP_RE.test(c)){ diagEntree(fin.trim(),true,'parole interrompue'); cutAll('Parole interrompue'); }
          else if(RayleBus.demander('vue')==='terminal' && estFermetureTerminal(fin)) onUser(fin.trim(),true);   // fermeture du terminal pendant qu'elle parle
          else diagEntree(fin.trim(),true,'ignoré : pendant que je parle');
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
    r.onstart=()=>{ recActif=true; recDepuis=Date.now(); };
    r.onerror=e=>{
      if(e.error==='not-allowed' || e.error==='service-not-allowed'){
        const t="Micro refusé : autorisez-le dans Chrome (cadenas à gauche de l'adresse), puis réessayez.";
        addLine('sys',t); ligneGalaxie(t,20000);
        stopListening();
      }else if(e.error==='network'){
        // Le service de reconnaissance de Chrome échoue parfois une fois, puis repart tout seul : le message n'apparaît que si le problème est
        // réel (hors connexion, ou au moins 3 échecs de suite sans aucune phrase reconnue entre-temps), et au plus une fois par minute.
        const maintenant=Date.now();
        erreursReseau=(maintenant-derniereErreurReseau>20000?0:erreursReseau)+1; derniereErreurReseau=maintenant;
        const horsLigne=navigator.onLine===false;
        if((horsLigne || erreursReseau>=3) && maintenant-dernierMessageReseau>60000){
          dernierMessageReseau=maintenant;
          const t=horsLigne?'Reconnaissance vocale : pas de connexion internet.':'Reconnaissance vocale : le service de Chrome ne répond pas, nouvel essai en cours.';
          addLine('sys',t); ligneGalaxie(t);
        }
      }
    };
    r.onend=()=>{
      recActif=false;
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
    if(window.Activation && Activation.veilleLocale()) return;     // en VEILLE locale la reconnaissance du navigateur reste éteinte (rien n'est envoyé)
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
  // Le micro doit rester actif terminal ouvert ou non : si la reconnaissance s'est arrêtée toute seule (Chrome/Edge le font),
  // on la relance, sauf quand elle parle (le micro est alors volontairement coupé) ou en mode « toucher pour parler ».
  function veillerMicro(){
    if(!micOn || modeToucher() || speaking || document.hidden || recActif) return;
    if(Date.now()-lastStart<2500) return;
    startRec();
  }
  setInterval(veillerMicro,4000);
  RayleBus.on('vue:changee',()=>{ setTimeout(veillerMicro,600); });
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
    if(window.Activation){ if(mode==='veille') Activation.apresVeille(); else Activation.apresConversation(); }
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
    if(window.Activation) Activation.apresCoupe();
    addLine('sys','Écoute vocale désactivée');
  }
