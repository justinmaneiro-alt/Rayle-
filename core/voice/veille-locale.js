"use strict";
/* ═════════════ VEILLE LOCALE : le micro est ouvert, RIEN ne quitte le PC ═════════════
   En VEILLE, Raylé écoute seulement ses déclencheurs, par analyse locale du son :
   · claquement de mains / de doigts : analyse du signal (core/voice/declencheurs-calcul.js) ;
   · mot « Raylé » : reconnaissance Vosk (WebAssembly, modèle français de 41 Mo, grammaire de quelques mots) qui tourne DANS le navigateur ;
   aucune transcription n'est conservée ni envoyée, aucun son n'est enregistré ; seul le déclencheur sort de ce module (surDeclencheur).
   La reconnaissance du navigateur (qui envoie la voix à un service distant) ne démarre qu'une fois ACTIF (core/voice/activation.js).
   Solidité : une seule instance (verrou navigator.locks), relance si le flux s'arrête, si le contexte audio se suspend ou après une mise en veille du PC.
   Interface : window.VeilleLocale { demarrer, arreter, pause, regler, etat, journal }. Modèle absent : seuls les claquements marchent (dit clairement dans etat()). */
(function(){
  const C=window.Declencheurs; if(!C) return;
  const URL_VOSK='core/voice/vendor/vosk.js', URL_MODELE='core/voice/vendor/modele-fr.tar.gz', FREQ=16000;
  let reglages={sensibilite:5,main:true,doigts:true,double:false,motCle:true,mots:C.MOTS_RAYLE.slice()};
  let rappel=null, flux=null, ctx=null, source=null, noeud=null, detecteur=null, rec=null, surveillance=0, actif=false, enPause=false, lockLibere=null;
  let niveau=0, derniereTrame=0, dernierTic=0, redemarrages=0, essais=0, erreur='', verrou='libre', dernierSon=0, declenchements=[], dernierMot='';
  let promesseVosk=null, modele=null, motCle='inactif';     // inactif | chargement | pret | absent | erreur
  const t=()=>Date.now();

  /* ── Vosk, chargé une seule fois, à la demande ── */
  function chargerVosk(){
    if(promesseVosk) return promesseVosk;
    promesseVosk=(async()=>{
      motCle='chargement';
      try{
        const tete=await fetch(URL_MODELE,{method:'HEAD',cache:'no-store'}); if(!tete.ok) throw Object.assign(new Error('modèle absent'),{absent:true});
        if(!window.Vosk) await new Promise((ok,ko)=>{ const s=document.createElement('script'); s.src=URL_VOSK; s.onload=ok; s.onerror=()=>ko(new Error('bibliothèque Vosk introuvable')); document.head.appendChild(s); });
        modele=await Vosk.createModel(new URL(URL_MODELE,document.baseURI).href);
        motCle='pret'; return modele;
      }catch(e){ motCle=e&&e.absent?'absent':'erreur'; if(motCle==='erreur') erreur='mot « Raylé » local : '+String((e&&e.message)||e).slice(0,100); promesseVosk=null; throw e; }
    })();
    return promesseVosk;
  }
  function construireReconnaisseur(){
    if(!modele||!reglages.motCle) return;
    try{ if(rec){ rec.remove(); } }catch(e){}
    rec=new modele.KaldiRecognizer(FREQ,C.grammaireMotCle(reglages.mots));
    const verifier=txt=>{
      if(enPause||!txt) return; dernierMot=String(txt).slice(0,60);
      if(C.motCleDansTexte(txt,reglages.mots)) sortie({source:'mot',texte:dernierMot});
    };
    rec.on('partialresult',m=>verifier(m&&m.result&&m.result.partial));
    rec.on('result',m=>verifier(m&&m.result&&m.result.text));
  }
  function sortie(d){
    const maint=t(); if(maint-(declenchements.length?declenchements[declenchements.length-1].t:0)<1200) return;   // un seul déclenchement à la fois, même si le mot et le claquement arrivent ensemble
    declenchements.push({t:maint,source:d.source}); if(declenchements.length>20) declenchements.shift();
    if(rappel){ try{ rappel(d); }catch(e){} }
  }

  /* ── audio ── */
  async function prendreVerrou(){
    if(!navigator.locks||!navigator.locks.request) return true;
    return new Promise(res=>{ navigator.locks.request('rayle-veille-locale',{ifAvailable:true},lock=>{ if(!lock){ res(false); return; } res(true); return new Promise(l=>{ lockLibere=l; }); }).catch(()=>res(true)); });
  }
  async function ouvrir(){
    if(!await prendreVerrou()){ verrou='autre-fenetre'; erreur='une autre fenêtre de Raylé écoute déjà'; actif=false; return false; }
    verrou='ok';
    try{
      flux=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1}});   // sans traitement : le filtre de bruit effacerait les claquements
      ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:FREQ});
      if(ctx.state==='suspended') await ctx.resume().catch(()=>{});
      source=ctx.createMediaStreamSource(flux); noeud=ctx.createScriptProcessor(2048,1,1);
      detecteur=C.creerDetecteur({sampleRate:ctx.sampleRate,...reglages,surEvenement:ev=>sortie({source:ev.type,double:ev.double,pic:ev.pic})});
      let finVoix=0;
      noeud.onaudioprocess=e=>{
        const x=e.inputBuffer.getChannelData(0); derniereTrame=t(); let s=0; for(let i=0;i<x.length;i++) s+=x[i]*x[i]; const r=Math.sqrt(s/x.length); niveau=niveau*0.6+r*0.4; if(r>0.01) dernierSon=derniereTrame;
        if(enPause) return;
        if(reglages.main||reglages.doigts) detecteur.traiter(x);
        if(rec&&reglages.motCle){ if(r>0.004) finVoix=derniereTrame+900; if(derniereTrame<finVoix){ try{ rec.acceptWaveformFloat(new Float32Array(x),ctx.sampleRate); }catch(err){} } }
      };
      source.connect(noeud); noeud.connect(ctx.destination);                       // le nœud doit être relié pour tourner ; il ne produit aucun son (sortie vide)
      flux.getAudioTracks().forEach(p=>{ p.onended=()=>{ if(actif) planifierRedemarrage('flux audio interrompu'); }; });
      erreur=''; essais=0; return true;
    }catch(e){
      const refus=e&&(e.name==='NotAllowedError'||e.name==='SecurityError');
      erreur=refus?'micro refusé : autorise-le dans le navigateur (cadenas de l’adresse)':'micro indisponible : '+String((e&&e.message)||e).slice(0,80);
      await fermerAudio(); return false;
    }
  }
  async function fermerAudio(){
    try{ if(noeud){ noeud.onaudioprocess=null; noeud.disconnect(); } }catch(e){}
    try{ if(source) source.disconnect(); }catch(e){}
    try{ if(flux) flux.getTracks().forEach(p=>{ p.onended=null; p.stop(); }); }catch(e){}
    try{ if(ctx&&ctx.state!=='closed') await ctx.close(); }catch(e){}
    try{ if(rec){ rec.remove(); rec=null; } }catch(e){}
    noeud=source=flux=ctx=null; niveau=0;
    if(lockLibere){ lockLibere(); lockLibere=null; }
  }

  /* ── solidité ── */
  let attente=0;
  function planifierRedemarrage(raison){
    if(!actif||attente) return; redemarrages++; essais++; erreur='relance : '+raison;
    const delai=Math.min(30000,800*Math.pow(2,Math.min(essais,6)-1));   // 0,8 s, 1,6 s, 3,2 s … jamais de boucle serrée
    attente=setTimeout(async()=>{ attente=0; if(!actif) return; await fermerAudio(); await ouvrir(); if(actif&&!flux) planifierRedemarrage('micro toujours indisponible'); else if(actif) construireReconnaisseur(); },delai);
  }
  function veiller(){
    if(!actif) return; const maint=t(), saut=dernierTic&&maint-dernierTic>20000; dernierTic=maint;
    if(saut) return planifierRedemarrage('reprise après mise en veille du PC');
    if(!flux||!ctx) return planifierRedemarrage('flux absent');
    if(ctx.state==='suspended') ctx.resume().catch(()=>{});
    if(ctx.state==='closed') return planifierRedemarrage('contexte audio fermé');
    if(flux.getAudioTracks().every(p=>p.readyState==='ended')) return planifierRedemarrage('piste audio terminée');
    if(derniereTrame&&maint-derniereTrame>6000&&ctx.state==='running') return planifierRedemarrage('plus de son reçu depuis 6 s');
  }
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&actif){ if(ctx&&ctx.state==='suspended') ctx.resume().catch(()=>{}); dernierTic=t(); } });
  if(navigator.mediaDevices&&navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange',()=>{ if(actif&&(!flux||flux.getAudioTracks().every(p=>p.readyState==='ended'))) planifierRedemarrage('périphérique audio changé'); });

  const API={
    /* opts : { surDeclencheur(d) : d = {source:'mot'|'main'|'doigts', double?, texte?}, reglages } */
    async demarrer(opts={}){
      if(actif) return {ok:true,deja:true};
      rappel=opts.surDeclencheur||null; if(opts.reglages) API.regler(opts.reglages);
      actif=true; enPause=false; dernierTic=t(); derniereTrame=0;
      const ok=await ouvrir();
      if(!ok&&verrou==='autre-fenetre'){ actif=false; return {ok:false,erreur}; }
      if(!actif){ await fermerAudio(); return {ok:false,erreur:'arrêtée'}; }
      if(!ok){ planifierRedemarrage('ouverture du micro impossible'); return {ok:false,erreur}; }
      if(reglages.motCle){ chargerVosk().then(()=>{ if(actif) construireReconnaisseur(); }).catch(()=>{}); }
      clearInterval(surveillance); surveillance=setInterval(veiller,3000);
      return {ok:true};
    },
    async arreter(){ actif=false; clearInterval(surveillance); surveillance=0; clearTimeout(attente); attente=0; await fermerAudio(); verrou='libre'; },
    pause(b){ enPause=!!b; if(enPause&&detecteur) detecteur.reinitialiser(); },
    regler(o){
      for(const k of ['sensibilite','main','doigts','double','motCle']) if(o[k]!=null) reglages[k]=o[k];
      if(Array.isArray(o.mots)&&o.mots.length) reglages.mots=o.mots.slice(0,12);
      if(detecteur) detecteur.regler(reglages);
      if(actif&&modele&&(o.mots||o.motCle!=null)){ if(reglages.motCle) construireReconnaisseur(); else { try{ rec&&rec.remove(); }catch(e){} rec=null; } }
      if(actif&&reglages.motCle&&!modele&&motCle!=='chargement') chargerVosk().then(()=>{ if(actif) construireReconnaisseur(); }).catch(()=>{});
    },
    etat:()=>({actif,pause:enPause,micro:flux?'ouvert':'fermé',contexte:ctx?ctx.state:'aucun',niveau:+Math.min(1,niveau*6).toFixed(3),motCle:reglages.motCle?motCle:'inactif',derniereEcoute:dernierMot,claquements:detecteur?detecteur.journal().slice(-5):[],
      declenchements:declenchements.slice(-5),redemarrages,verrou,erreur,reglages:{...reglages,mots:reglages.mots.slice()},envoiReseau:false}),
    journal:()=>detecteur?detecteur.journal():[]
  };
  window.VeilleLocale=API;
})();
