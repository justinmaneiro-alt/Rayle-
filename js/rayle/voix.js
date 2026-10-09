"use strict";
  /* ═════════════ VOIX : Worker (Azure → Edge) puis voix du navigateur ═════════════ */
  let voices=[], chosenVoice=null, speaking=false, speakToken=0, lastSpoken='', lastSpokenRaw='', speechEndT=0;
  function pickVoice(){
    const fr=voices.filter(v=>/^fr/i.test(v.lang));
    const re=persona.feminin
      ? /denise|julie|amelie|amélie|hortense|audrey|marie|celine|céline|virginie|aurelie|aurélie|female|femme/i
      : /paul|henri|thomas|claude|antoine|mathieu|nicolas|male|homme/i;
    return fr.find(v=>re.test(v.name)) || fr.find(v=>/fr-FR/i.test(v.lang)) || fr[0] || null;
  }
  function loadVoices(){
    if(!('speechSynthesis' in window)) return;
    voices=speechSynthesis.getVoices();
    chosenVoice=pickVoice();
    if(!workerReady()) voiceEl.textContent='voix : '+(chosenVoice ? chosenVoice.name.replace(/Microsoft |Google /,'') : 'système');
  }
  if('speechSynthesis' in window){ speechSynthesis.onvoiceschanged=loadVoices; loadVoices(); }

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

  // Voix du navigateur (dernier filet : Raylé n'est jamais muette)
  function browserSpeak(t,token){
    return new Promise(resolve=>{
      if(!('speechSynthesis' in window)){ resolve(); return; }
      speechSynthesis.cancel();
      const chunks=splitChunks(t); let i=0;
      const rate=Math.max(0.5,Math.min(1.3,1+vitesseCourante()/100));
      const next=()=>{
        if(token!==speakToken || i>=chunks.length){ resolve(); return; }
        const piece=chunks[i++];
        const u=new SpeechSynthesisUtterance(piece);
        if(chosenVoice){ u.voice=chosenVoice; u.lang=chosenVoice.lang; } else u.lang='fr-FR';
        u.pitch=persona.feminin?1:0.78; u.rate=rate; u.volume=1;
        let fired=false;
        const go=()=>{ if(fired) return; fired=true; clearTimeout(tm); next(); };
        const tm=setTimeout(go, 4000+piece.length*130);   // garde-fou si « onend » n'arrive pas
        u.onend=go; u.onerror=go;
        speechSynthesis.speak(u);
      };
      setTimeout(next,60);
    });
  }

  // Voix en ligne (Azure ou Edge, choisie par le Worker)
  let curAudio=null, audioStop=null, lastVoiceSrc='', lastVoiceInfo='';
  function voiceLabel(src){
    const [moteur,nom]=String(src||'').split('/');
    return (nom||persona.voix||'?')+' ('+(moteur==='azure'?'Azure':moteur==='edge'?'Edge':moteur)+')';
  }
  async function fetchAudio(t){
    const body={text:t}; const v=prefs.vitesse();
    if(v!=null && isFinite(v)) body.vitesse=v;
    const res=await wfetch('/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},25000);
    if(!res.ok) throw await workerError(res);
    return {src:res.headers.get('X-Rayle-Voix')||'', blob:await res.blob()};
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
    try{ if('speechSynthesis' in window){ const u=new SpeechSynthesisUtterance(' '); u.volume=0; speechSynthesis.speak(u); } }catch(e){}
  }
  ['pointerdown','touchend','click','keydown'].forEach(ev=>document.addEventListener(ev,debloquerAudio,{passive:true}));

  async function playAudio(a,token){
    if(token!==speakToken) return;
    if(a.src && a.src!==lastVoiceSrc){ lastVoiceSrc=a.src; voiceEl.textContent='voix : '+voiceLabel(a.src); addLine('sys','Voix : '+voiceLabel(a.src)); }
    const url=URL.createObjectURL(a.blob);
    try{
      await new Promise((resolve,reject)=>{
        const el=audioEl; curAudio=el; audioStop=resolve;
        el.src=url;
        el.onended=resolve;
        el.onerror=()=>reject(new Error('lecture audio impossible'));
        const p=el.play(); if(p && p.catch) p.catch(reject);
      });
    }finally{ curAudio=null; audioStop=null; URL.revokeObjectURL(url); }
  }
  function stopAudioOnly(){
    if('speechSynthesis' in window) speechSynthesis.cancel();
    if(curAudio){ try{ curAudio.pause(); }catch(e){} }
    if(audioStop){ const f=audioStop; audioStop=null; f(); }
  }

  async function speak(text){
    const t=clean(text); if(!t) return;
    const token=++speakToken;
    stopAudioOnly();                       // une nouvelle phrase remplace la précédente
    speaking=true; lastSpoken=norm(t).slice(0,4000); lastSpokenRaw=t.slice(0,4000);
    if(!bargeActive()) muteRec(); else startRec();   // le micro est coupé net pendant qu'elle parle
    setState('speaking');
    // Premier morceau court pour démarrer vite, la suite est préparée pendant la lecture
    let parts=regroup(t,900);
    if(parts[0].length>320) parts=regroup(parts[0],260).concat(parts.slice(1));
    let online=workerReady();
    let next=online?fetchAudio(parts[0]):null;
    if(next) next.catch(()=>{});
    for(let i=0;i<parts.length;i++){
      if(token!==speakToken) return;
      if(online){
        try{
          const a=await next;
          next=(i+1<parts.length)?fetchAudio(parts[i+1]):null;
          if(next) next.catch(()=>{});
          if(token!==speakToken) return;
          await playAudio(a,token);
          continue;
        }catch(e){
          if(token!==speakToken) return;
          online=false; next=null;
          const m='Voix en ligne indisponible ('+errMsg(e)+') : voix du navigateur';
          if(m!==lastVoiceInfo){ addLine('sys',m); lastVoiceInfo=m; }
        }
      }
      await browserSpeak(parts[i],token);
    }
    if(token!==speakToken) return;
    speaking=false; speechEndT=Date.now(); lastAct=Date.now();
    restState();
    if(modeToucher()){ if(!processing && !queue.length) apresReponse(); }
    else if(micOn) setTimeout(startRec,700);  // petit délai : la fin de sa voix ne doit pas être captée
  }
  function cancelSpeech(){
    speakToken++;
    stopAudioOnly();
    speaking=false; speechEndT=Date.now();
  }
