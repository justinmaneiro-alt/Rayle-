"use strict";
  /* ═════════════ VOIX : moteur choisi (Kokoro / Piper locaux, Edge par le Worker, voix du système) ═════════════ */
  /* v8 : UNE SEULE voix, Gemini (Sulafat par défaut). La voix du système est supprimée : en cas d'échec, la réponse reste affichée et un indicateur discret le dit. Aucun appel à speechSynthesis dans tout le code. */
  let speaking=false, speakToken=0, lastSpoken='', lastSpokenRaw='', speechEndT=0, derniereCle='', derniereT=0;

  function splitChunks(t){
    const sents=t.match(/[^.!?;:]+[.!?;:]*/g)||[t];
    const parts=[];
    sents.forEach(s=>{
      if(s.length>200){ s.split(/,\s*/).forEach((p,i,a)=>parts.push(p+(i<a.length-1?',':''))); }
      else parts.push(s);
    });
    const out=[]; let cur='';
    parts.forEach(s=>{
      if((cur+s).length>170 && cur){ out.push(cur.trim()); cur=s; } else cur+=s;
    });
    if(cur.trim()) out.push(cur.trim());
    return out;
  }
  function regroup(t,max){
    if(t.length<=max) return [t];
    const out=[]; let cur='';
    for(const s of splitChunks(t)){
      if((cur+' '+s).length>max && cur){ out.push(cur.trim()); cur=s; } else cur+=(cur?' ':'')+s;
    }
    if(cur.trim()) out.push(cur.trim());
    return out;
  }

  /* Silence entre deux phrases : coupé net si une nouvelle réponse arrive ou si on coupe Raylé. */
  function pauseParole(ms,token){ return new Promise(res=>{ if(!ms||ms<=0){ res(); return; } const t0=Date.now(), v=()=>{ if(token!==speakToken||Date.now()-t0>=ms) res(); else setTimeout(v,40); }; v(); }); }

  // Voix en ligne (Azure ou Edge, choisie par le Worker)
  let curAudio=null, audioStop=null, lastVoiceSrc='', lastVoiceInfo='';
  function voiceLabel(src){
    const [moteur,nom]=String(src||'').split('/');
    if(moteur==='local'&&window.VoixMoteurs&&VoixMoteurs.NOMS[nom]) return VoixMoteurs.NOMS[nom].nom+' (locale, gratuite)';
    if(moteur==='gemini'){ const id=String(nom||'').split(' ')[0]; return (window.VoixMoteurs&&VoixMoteurs.NOMS[id]?VoixMoteurs.NOMS[id].nom:nom)+' (Gemini TTS)'; }
    return (nom||persona.voix||'?')+' ('+(moteur==='azure'?'Azure':moteur==='edge'?'Edge':moteur)+')';
  }
  const audioEl=new Audio(); audioEl.preload='auto'; try{ audioEl.setAttribute('playsinline',''); }catch(e){}
  let audioDebloque=false, silenceUrl='';
  function wavSilence(){
    const n=2205, b=new ArrayBuffer(44+n*2), v=new DataView(b);
    const w=(o,t)=>{ for(let i=0;i<t.length;i++) v.setUint8(o+i,t.charCodeAt(i)); };
    w(0,'RIFF'); v.setUint32(4,36+n*2,true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
    v.setUint32(24,22050,true); v.setUint32(28,44100,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*2,true);
    return URL.createObjectURL(new Blob([b],{type:'audio/wav'}));
  }
  // Les téléphones n'autorisent le son qu'après un geste : on « réveille » le lecteur au premier toucher
  function debloquerAudio(){
    if(audioDebloque) return;
    audioDebloque=true;
    try{ if(!silenceUrl) silenceUrl=wavSilence(); audioEl.src=silenceUrl; const p=audioEl.play(); if(p&&p.catch) p.catch(()=>{ audioDebloque=false; }); }catch(e){ audioDebloque=false; }
  }
  // Niveau sonore de la voix en ligne (Azure/Edge) → l'entité vibre en temps réel.
  // La source audio n'est branchée qu'une fois le contexte réellement actif, pour ne jamais rendre Raylé muette.
  let audioCtx=null, analyseur=null, tamponAudio=null;
  function brancherAnalyseur(){
    if(analyseur) { if(audioCtx.state==='suspended') audioCtx.resume().catch(()=>{}); return; }
    try{
      const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
      const ctx=new AC();
      if(ctx.state==='suspended') ctx.resume().catch(()=>{});
      const src=ctx.createMediaElementSource(audioEl);
      const an=ctx.createAnalyser(); an.fftSize=512; an.smoothingTimeConstant=.75;
      src.connect(an); an.connect(ctx.destination);
      audioCtx=ctx; analyseur=an; tamponAudio=new Uint8Array(an.fftSize);
    }catch(e){ analyseur=null; }
  }
  function niveauVoix(){
    if(!analyseur || !curAudio || curAudio.paused || audioCtx.state!=='running') return null;
    analyseur.getByteTimeDomainData(tamponAudio);
    let s=0; for(let i=0;i<tamponAudio.length;i++){ const v=(tamponAudio[i]-128)/128; s+=v*v; }
    return Math.min(1,Math.sqrt(s/tamponAudio.length)*2.4);
  }
  try{ Entite.amplitude(niveauVoix); }catch(e){}
  ['pointerdown','touchend','click','keydown'].forEach(ev=>document.addEventListener(ev,()=>{ debloquerAudio(); brancherAnalyseur(); },{passive:true}));

  async function playAudio(a,token){
    if(token!==speakToken) return;
    if(a.src && a.src!==lastVoiceSrc){ lastVoiceSrc=a.src; voiceEl.textContent='voix : '+voiceLabel(a.src); addLine('sys','Voix : '+voiceLabel(a.src)); }
    const url=URL.createObjectURL(a.blob);
    try{
      if(audioCtx && audioCtx.state!=='running'){ try{ await Promise.race([audioCtx.resume(),new Promise(r=>setTimeout(r,800))]); }catch(e){} }
      await new Promise((resolve,reject)=>{
        const el=audioEl; curAudio=el; audioStop=resolve;
        let demarre=false, fini=false;
        const fin=(ok,err)=>{ if(fini) return; fini=true; clearTimeout(gardeDemarrage); clearInterval(gardeBlocage); ok?resolve():reject(err); };
        const gardeDemarrage=setTimeout(()=>fin(false,new Error('la lecture audio ne démarre pas (son bloqué par le navigateur ?)')),7000);
        let dernier=-1, figes=0;
        const gardeBlocage=setInterval(()=>{ if(!demarre) return; if(el.currentTime===dernier && !el.paused) figes++; else figes=0; dernier=el.currentTime; if(figes>=6){ if(isFinite(el.duration)&&el.duration>0&&el.currentTime>=el.duration-0.6) fin(true); else fin(false,new Error('lecture audio bloquée')); } else if(isFinite(el.duration)&&el.duration>0&&el.ended) fin(true); },500);
        el.onplaying=()=>{ demarre=true; };
        el.onloadedmetadata=()=>{ try{ window.dispatchEvent(new CustomEvent('rayle:parole',{detail:{duree:(el.duration||0)/(el.playbackRate||1)}})); }catch(e){} };   // la réponse animée écrit son texte au rythme de la voix
        el.onended=()=>fin(true);
        el.onerror=()=>fin(false,new Error('lecture audio impossible'));
        el.src=url;
        try{ el.preservesPitch=false; el.mozPreservesPitch=false; el.webkitPreservesPitch=false; el.defaultPlaybackRate=a.vitesseLecture||1; el.playbackRate=a.vitesseLecture||1; }catch(e){}   // hauteur : lecture plus rapide, le moteur parle plus lentement d'autant
        const p=el.play(); if(p && p.catch) p.catch(e=>fin(false,e));
      });
    }finally{ curAudio=null; audioStop=null; URL.revokeObjectURL(url); }
  }
  function stopAudioOnly(){
    if(synthCtrl){ try{ synthCtrl.abort(); }catch(e){} synthCtrl=null; }
    if(curAudio){ try{ curAudio.pause(); }catch(e){} }
    if(audioStop){ const f=audioStop; audioStop=null; f(); }
  }

  let synthCtrl=null;   // annule les synthèses en cours dès qu'on coupe ou qu'une nouvelle phrase arrive
  async function speak(text,opts){
    opts=opts||{};
    const t=clean(text); if(!t) return;
    /* v8 : une phrase n'est jamais lue deux fois : la même réponse redemandée moins de 4 s après est ignorée (sauf écoute explicite d'une voix) */
    const cleDed=norm(t).slice(0,300); if(!opts.moteur&&cleDed===derniereCle&&Date.now()-derniereT<4000) return; derniereCle=cleDed; derniereT=Date.now();
    const token=++speakToken;
    stopAudioOnly();                       // une nouvelle phrase remplace la précédente
    speaking=true; lastSpoken=norm(t).slice(0,4000); lastSpokenRaw=t.slice(0,4000);
    if(!bargeActive()) muteRec(); else startRec();   // le micro est coupé net pendant qu'elle parle
    setState('speaking');
    // Texte parlé : nombres, prix, sigles, heures et dates écrits en toutes lettres ; plus de markdown ni d'émoji (normalisation-fr.js)
    let segs=null; try{ if(window.Prosodie&&window.NormFr&&localStorage.getItem('rayle_prosodie')!=='0') segs=Prosodie.depuisTexte(text,NormFr.normaliser); }catch(e){ segs=null; }
    let parts=segs&&segs.length?segs.map(s=>s.texte):(window.NormFr?NormFr.phrases(NormFr.normaliser(text)):regroup(t,260));
    if(!parts.length){ parts=regroup(t,260); segs=null; }
    const reglage=i=>segs&&segs[i]?segs[i]:{vitesse:1,hauteur:0,pause:0};
    try{ parts=VoixCalcul.regrouperPourGemini(parts,550); segs=null; }catch(e){}   // v7 : une seule requête Gemini par réponse (quota gratuit d'environ 3 par minute)
    const baseHauteur=0;
    const moteurId=/^gemini-/.test(opts.moteur||'')?opts.moteur:VoixMoteurs.choisi();   // toujours une voix Gemini
    const vit=Math.max(0.5,Math.min(2,1+vitesseCourante()/100));
    const ctrl=new AbortController(); synthCtrl=ctrl;
    const taches=[];
    const lancer=i=>{ if(i<parts.length&&!taches[i]){ taches[i]=VoixMoteurs.synth(moteurId,parts[i],{vitesse:Math.max(0.5,Math.min(2,vit*reglage(i).vitesse)),hauteur:baseHauteur+reglage(i).hauteur,signal:ctrl.signal}); taches[i].catch(()=>{}); } };
    lancer(0); lancer(1);   // synthèse phrase par phrase : la première part vite, la suite se prépare pendant la lecture
    for(let i=0;i<parts.length;i++){
      if(token!==speakToken) return;
      try{
        const a=await taches[i];
        lancer(i+2);
        if(token!==speakToken) return;
        await playAudio(a,token); lastVoiceInfo=''; indicateurVoix(true); try{ VoixMoteurs.noterUtilise(voiceLabel(a.src)); }catch(e){}
        if(i<parts.length-1) await pauseParole(reglage(i).pause,token);
        continue;
      }catch(e){
        if(token!==speakToken) return;
        try{ ctrl.abort(); }catch(x){}
        const msg=(e&&e.message)||errMsg(e); try{ VoixMoteurs.noterEchec(moteurId,msg); }catch(x){}
        try{ VoixMoteurs.noterUtilise('voix momentanément indisponible'); }catch(x){} indicateurVoix(false,msg);   // la réponse reste affichée ; pas de voix de remplacement ; les alertes partent sur Telegram
        break;
      }
    }
    if(token!==speakToken) return;
    try{ window.dispatchEvent(new CustomEvent('rayle:parole-fin')); }catch(e){}
    speaking=false; speechEndT=Date.now(); lastAct=Date.now();
    restState();
    if(modeToucher()){ if(!processing && !queue.length) apresReponse(); }
    else if(micOn) setTimeout(startRec,700);  // petit délai : la fin de sa voix ne doit pas être captée
  }
  // Test de la voix : résultat de chaque voix candidate, puis lecture avec la voix retenue
  async function testerVoix(signaler){
    const dire=m=>{ try{ if(signaler) signaler(m); }catch(e){} };
    dire('Test des voix en cours…');
    let lignes=[];
    try{
      await VoixMoteurs.testerAuto();
      lignes=VoixMoteurs.candidats().map(c=>'· '+c.nom+' : '+c.etat+(c.test&&c.test.ms?' ('+(c.test.ms/1000).toFixed(1).replace('.',',')+' s)':'')+(c.raison?' — '+c.raison:''));
    }catch(e){ lignes=['Test impossible : '+errMsg(e)]; }
    const utilisee=VoixMoteurs.actif();
    const resume='Voix utilisée : '+(VoixMoteurs.NOMS[utilisee]||{nom:utilisee}).nom;
    addLine('sys','Test des voix — '+lignes.join(' | ')+' → '+resume); dire(lignes.join('\n')+'\n'+resume+'\nLecture du test…');
    const v=vitesseCourante();
    const t='Test de la voix. Raylé à '+fx('votre','ton')+' écoute, Justin. Voici ma vitesse de lecture actuelle : '+(v===0?'normale':(v>0?'plus':'moins')+' '+Math.abs(v)+' pour cent')+'.';
    addLine('ray',t);
    lastVoiceInfo='';
    await speak(t);
    const fin=lastVoiceInfo?lastVoiceInfo:resume;
    dire(lignes.join('\n')+'\n'+fin); return fin;
  }
  /* indicateur discret : « voix momentanément indisponible » quand Gemini ne répond pas (quota, réseau) */
  function indicateurVoix(ok,detail){ try{ if(ok){ if(voiceEl.dataset.indispo){ delete voiceEl.dataset.indispo; voiceEl.textContent='voix : '+(lastVoiceSrc?voiceLabel(lastVoiceSrc):'Gemini'); voiceEl.title=''; } } else { const deja=voiceEl.dataset.indispo; voiceEl.dataset.indispo='1'; voiceEl.textContent='voix momentanément indisponible'; voiceEl.title=detail||''; if(!deja) addLine('sys','🔇 voix momentanément indisponible : la réponse reste affichée.'); } }catch(e){} }
  function cancelSpeech(){
    speakToken++;
    stopAudioOnly();
    speaking=false; speechEndT=Date.now();
  }
