"use strict";
  /* ═════════════ COUPURE : arrêter Raylé à tout moment ═════════════ */
  function cutAll(why){
    const busy = speaking || processing || queue.length>0;
    epoch++;                                // la réponse en cours (calcul ou voix) est abandonnée
    queue.length=0; drainId++; processing=false;
    try{ cutAbort.abort(); }catch(e){}
    cutAbort=new AbortController();
    cancelSpeech();                         // coupe la voix immédiatement
    liveCtx='';
    resetPending();
    interimEl.textContent='';
    restState();
    if(busy && why) addLine('sys',why);
    if(micOn) setTimeout(startRec,300);     // l'écoute continue
  }
  function coupureTotale(){
    stopListening();
    const bye='Silence radio, Justin.';
    addLine('ray',bye); speak(bye);
  }

  const STOP_RE=/^(tais[- ]?toi|taisez[- ]vous|silence|stop|ca suffit|chut|arrete|arrete[- ]toi)$/;
  const COUPURE_RE=/^(?:(?:ok|oui|bon|alors)\s+)?(?:coupure|coupures|coupe|coupez|coupe tout|eteins[- ]toi|desactive[- ]toi)(?:\s+(?:merci|svp|stp|s'?il (?:te|vous) plait))?$/;
  const END_RE=/^(?:(?:ok|okay|bon|super|parfait|top|genial|nickel|d'accord|daccord|tres bien|cool|bah|eh bien)\s+)*(?:merci(?:\s+(?:beaucoup|bien|infiniment|pour tout|mille fois))?|c'est tout|ce sera tout|c'est bon|ca ira|a plus tard|a plus|a tout a l'heure|bonne nuit|repos|fin de (?:la )?conversation)(?:\s+(?:justin|c'est tout|ca ira|a plus tard|pour tout|beaucoup))*$/;

  // Commandes vocales courtes (valables en conversation et au clavier)
  function command(text){
    const c=cmdNorm(norm(text));
    // Mémoire : « note que… », « oublie la dernière note », « efface ta mémoire »
    const note=noteDepuis(text);
    if(note){ memoireAjouter(note); return true; }
    if(/^(?:oublie|efface|supprime|retire)(?:[- ]?(?:la|ta|ma))? derniere (?:note|chose|entree|info)$/.test(c)){ memoireOublierDerniere(); return true; }
    if(/^(?:oublie tout|efface (?:toute )?ta memoire|vide ta memoire|efface toutes tes notes)$/.test(c)){
      viderDemande=Date.now();
      const r=fx('Vous êtes sûr ? Dites « oui, efface tout » pour confirmer.','Tu es sûr ? Dis « oui, efface tout » pour confirmer.');
      addLine('ray',r); speak(r); return true;
    }
    if(/^oui efface tout$/.test(c) && Date.now()-viderDemande<30000){ viderDemande=0; memoireVider(); return true; }
    if(STOP_RE.test(c)){ cutAll('Parole interrompue'); return true; }
    if(COUPURE_RE.test(c)){ coupureTotale(); return true; }
    if(/(arrete|coupe|desactive).{0,12}(ecoute|micro)/.test(c)){ coupureTotale(); return true; }
    if(/^mets[- ]?toi en veille$|^(en )?veille$|^dors$/.test(c)){
      if(reveilActif() && micOn){ const r='Je passe en veille, Justin.'; addLine('ray',r); speak(r); enterVeille(); }
      else { addLine('ray',"Mise en veille. Je ne bouge plus."); stopListening(); }
      return true;
    }
    if(/^(?:parle[sz]?\s+)?(?:plus lentement|moins vite|plus doucement)(?:\s+(?:stp|svp|s'?il (?:te|vous) plait))?$|^ralenti[sz]?(?: un peu)?$/.test(c)){ changeVitesse(-6); return true; }
    if(/^(?:parle[sz]?\s+)?(?:plus vite|moins lentement)(?:\s+(?:stp|svp|s'?il (?:te|vous) plait))?$|^accelere[sz]?(?: un peu)?$/.test(c)){ changeVitesse(6); return true; }
    if(/^(?:vitesse normale|parle[sz]? normalement|remets? la vitesse normale)$/.test(c)){ store.set(KEY_VIT,''); majVitesseUI(); const r='Vitesse normale rétablie.'; addLine('ray',r); speak(r); return true; }
    return false;
  }
  function changeVitesse(d){
    const v=Math.max(-40,Math.min(20,vitesseCourante()+d));
    store.set(KEY_VIT,String(v)); majVitesseUI();
    const r=d<0?(v<=-40?'Je suis déjà au plus lent, Justin.':"C'est noté, je ralentis."):(v>=20?'Je suis déjà au plus rapide.':"C'est noté, j'accélère.");
    addLine('ray',r+' ('+(v>0?'+':'')+v+' %)'); speak(r);
  }

  /* ═════════════ NOM DE RAYLÉ MAL ENTENDU ═════════════ */
  // La reconnaissance vocale écrit parfois « Riley », « Rallye »… pour « Raylé »
  const NOMS_BASE='riley,rayley,railey,reilly,rayleigh,raylet,rayler,rayle,raylee,rallye,ralé,rallé,réalé,reylé,reilé,railé,raïlé,raillé,rayé';
  let FIX_NAME=null;
  function buildFixName(){
    const extra=store.get(KEY_NOMS).split(',').map(s=>s.trim().toLowerCase()).filter(s=>s.length>=3);
    const all=NOMS_BASE.split(',').concat(extra).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).sort((a,b)=>b.length-a.length);
    FIX_NAME=new RegExp('(^|[^\\p{L}])('+all.join('|')+')(?![\\p{L}])','giu');
  }
  buildFixName();
  const fixName=t=>String(t||'').normalize('NFC').replace(FIX_NAME,'$1Raylé');

  // Trouve « Raylé » dans la phrase : renvoie ce qui est dit avant et après
  function wakeSplit(text){
    const t=String(text).normalize('NFC'); const n=norm(t);
    const m=n.match(/(^|[^a-z])((?:(?:hey|he|eh|ok|okay|dis[- ]moi|dis|salut|bonjour|bonsoir|coucou|allo|yo)[\s,]+)?rayle)(?![a-z])/);
    if(!m) return null;
    const start=m.index+m[1].length, end=start+m[2].length;
    const avant=t.slice(0,start).replace(/[\s,.!?:;…-]+$/,'').trim();
    const apres=t.slice(end).replace(/^[\s,.!?:;…-]+/,'').trim();
    return {avant,apres};
  }
  let veilleTimer=null;
  function veilleEcho(text){
    interimEl.textContent='zz veille · entendu : « '+String(text).slice(0,70)+' » (dites « Raylé »)';
    clearTimeout(veilleTimer); veilleTimer=setTimeout(()=>{ if(interimEl.textContent.startsWith('zz')) interimEl.textContent=''; },3500);
  }
  // Pendant/juste après sa propre voix : on ignore ce qui ressemble à ce qu'elle vient de dire
  // (comparaison mot à mot : la dictée déforme souvent les chiffres et quelques mots)
  const motsEcho=t=>norm(t).replace(/(\d)[\s.,\u202f\u00a0](?=\d)/g,'$1').replace(/[^a-z0-9' ]/g,' ').split(/\s+/).filter(w=>w.length>2);
  function echoTail(n){
    if(!lastSpokenRaw || (!speaking && Date.now()-speechEndT>10000)) return false;
    const s=n.replace(/[?!.,;:]/g,'').replace(/\s+/g,' ').trim();
    if(s.length>5 && lastSpoken.includes(s)) return true;
    const w=motsEcho(n); if(w.length<3) return false;
    const ref=new Set(motsEcho(lastSpokenRaw));
    return w.filter(x=>ref.has(x)).length/w.length>=0.6;
  }

  function onUser(text,voix){
    text=fixName(text).trim(); if(!text) return;
    const n=norm(text), c=cmdNorm(n);

    // « coupure » est prioritaire, dans tous les modes
    if(voix && COUPURE_RE.test(c)){ addLine('user',text); coupureTotale(); return; }
    // Raylé qui s'entend elle-même : on ignore
    if(voix && echoTail(n)){ addLine('sys','(écho de ma propre voix ignoré)'); return; }

    if(voix && micOn && mode==='veille' && reveilActif()){
      const w=wakeSplit(text);
      if(!w){ veilleEcho(text); return; }
      addLine('user',text);
      enterConversation();
      let q=w.apres || (w.avant.split(/\s+/).length>=2 ? w.avant : '');
      if(!q || norm(q).replace(/[^a-z0-9]/g,'').length<3){ ack(); return; }
      if(END_RE.test(cmdNorm(norm(q)))){ finConversation(); return; }
      text=q;
    }else{
      addLine('user',text);
      // « Raylé, … » en début de phrase : on garde seulement la question
      const w=wakeSplit(text);
      if(w && !w.avant && w.apres && norm(w.apres).replace(/[^a-z0-9]/g,'').length>=3) text=w.apres;
    }
    lastAct=Date.now();
    // Mode toucher : micro en pause pendant qu'elle réfléchit et répond
    if(voix && modeToucher()) muteRec();
    if(voix && (reveilActif()||modeToucher()) && micOn && END_RE.test(c)){ finConversation(); return; }
    if(command(text)) return;
    queue.push(text);
    if(!processing) drain();
  }
