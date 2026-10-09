"use strict";
  /* ═════════════ MODES : micro coupé · veille · conversation ═════════════ */
  let micOn=false, mode='veille', lastAct=0;
  const RETOUR_VEILLE_MS=90000;          // en conversation, retour en veille après 90 s de silence
  // « toucher » : on touche le bouton, on parle, elle répond (le plus fiable sur téléphone et tablette)
  function modeEcoute(){ const m=prefs.mode(); return m==='auto' ? (IS_MOBILE?'toucher':'mainslibres') : m; }
  const modeToucher=()=>modeEcoute()==='toucher';
  const reveilActif=()=>prefs.reveil() && !modeToucher();
  let ecouteDepuis=0, dernierSon=0, fermerApresParole=false;
  const SILENCE_MS=8000;
  // Après une réponse en mode toucher : on réécoute un moment pour la suite, ou on ferme le micro
  function apresReponse(){
    if(!micOn) return;
    if(fermerApresParole || !prefs.suite()){ fermerApresParole=false; fermerMicro(); return; }
    ecouteDepuis=Date.now();
    majBouton();
    setTimeout(startRec,700);
  }
  function ouvrirEcoute(){
    if(!SR){ addLine('sys','Reconnaissance vocale indisponible sur ce navigateur : utilisez Chrome (ou Safari sur iPhone).'); return; }
    debloquerAudio();
    micOn=true; mode='conversation'; fermerApresParole=false;
    ecouteDepuis=Date.now(); dernierSon=0;
    majBouton(); restState();
    interimEl.textContent='… '+fx('je vous écoute','je t\'écoute');
    startRec();
  }
  function fermerMicro(){
    if(pendingTxt) flushPending();
    micOn=false;
    try{ rec && rec.abort(); }catch(e){}
    interimEl.textContent='';
    majBouton(); restState();
  }
  setInterval(()=>{
    if(micOn && modeToucher() && !speaking && !processing && !queue.length && !pendingTxt
       && Date.now()-Math.max(ecouteDepuis,dernierSon)>SILENCE_MS) fermerMicro();
  },1000);
  function restState(){
    if(speaking) return;
    if(processing){ setState('thinking'); return; }
    setState(!micOn ? 'idle' : (mode==='veille' && reveilActif() ? 'veille' : 'listening'));
  }
  function majBouton(){
    if(modeToucher()){
      if(speaking){ btn.className='mic on'; btnTxt.textContent='⏹ Toucher pour l\'interrompre'; btnSub.textContent='puis parlez directement'; }
      else if(processing){ btn.className='mic on'; btnTxt.textContent='… Réflexion'; btnSub.textContent='toucher pour annuler'; }
      else if(micOn){ btn.className='mic on'; btnTxt.textContent='🎤 J\'écoute…'; btnSub.textContent='parlez · toucher pour arrêter · « coupure » pour tout couper'; }
      else{ btn.className='mic'; btnTxt.textContent='🎤 Toucher pour parler'; btnSub.textContent='touchez, parlez, elle répond'; }
      return;
    }
    if(!micOn){
      btn.className='mic'; btnTxt.textContent='Activer Raylé';
      btnSub.textContent=reveilActif()?'puis dites « Raylé » pour lui parler':'elle répondra à tout ce que vous dites';
    }else if(mode==='veille' && reveilActif()){
      btn.className='mic veille'; btnTxt.textContent='En veille · dites « Raylé »';
      btnSub.textContent='« coupure » ou toucher ici pour tout couper';
    }else{
      btn.className='mic on'; btnTxt.textContent='Conversation en cours';
      btnSub.textContent=reveilActif()?'« merci » pour la remettre en veille · « coupure » pour tout couper':'« coupure » ou toucher ici pour couper';
    }
  }
  function enterConversation(){ mode='conversation'; lastAct=Date.now(); majBouton(); restState(); }
  function enterVeille(why){
    mode='veille'; majBouton(); restState();
    if(why) addLine('sys',why);
  }
  setInterval(()=>{
    if(micOn && mode==='conversation' && reveilActif() && !speaking && !processing && Date.now()-lastAct>RETOUR_VEILLE_MS){
      enterVeille('Retour en veille (aucune parole depuis 90 secondes). Dites « Raylé » pour reprendre.');
    }
  },5000);

  function ack(){
    const r=pick([
      'Oui, Justin ?',
      fx('Je vous écoute, Justin.',"Je t'écoute, Justin."),
      fem('Présent','Présente')+', Justin.',
      fx('Dites-moi tout.','Dis-moi tout.')
    ]);
    addLine('ray',r); speak(r);
  }
  function finConversation(){
    const r=modeToucher() ? pick(['Avec plaisir, Justin.','De rien, Justin. Je suis là quand '+fx('vous voulez','tu veux')+'.','Quand '+fx('vous voulez','tu veux')+', Justin.']) : pick([
      'Avec plaisir, Justin. Je reste en veille.',
      'De rien, Justin. Je reste dans un coin, il suffit de dire mon nom.',
      'Quand '+fx('vous voulez','tu veux')+', Justin. Je repasse en veille.'
    ]);
    if(modeToucher()) fermerApresParole=true;
    addLine('ray',r); speak(r);
    enterVeille();
  }
