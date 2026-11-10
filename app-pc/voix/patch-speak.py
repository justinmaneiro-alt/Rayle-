# -*- coding: utf-8 -*-
# Remplace speak(), testerVoix() et le choix de la voix du système dans core/voice/voix.js (outil d'édition à usage unique, gardé pour mémoire)
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()

a = s.index("  async function speak(text){")
b = s.index("  function cancelSpeech(){")
NOUVEAU = r'''  let synthCtrl=null;   // annule les synthèses en cours dès qu'on coupe ou qu'une nouvelle phrase arrive
  async function speak(text,opts){
    opts=opts||{};
    const t=clean(text); if(!t) return;
    const token=++speakToken;
    stopAudioOnly();                       // une nouvelle phrase remplace la précédente
    speaking=true; lastSpoken=norm(t).slice(0,4000); lastSpokenRaw=t.slice(0,4000);
    if(!bargeActive()) muteRec(); else startRec();   // le micro est coupé net pendant qu'elle parle
    setState('speaking');
    // Texte parlé : nombres, prix, sigles, heures et dates écrits en toutes lettres ; plus de markdown ni d'émoji (normalisation-fr.js)
    let parts=window.NormFr?NormFr.phrases(NormFr.normaliser(text)):regroup(t,260);
    if(!parts.length) parts=regroup(t,260);
    const choisiId=opts.moteur||VoixMoteurs.choisi();
    const moteurId=opts.moteur||VoixMoteurs.actif();   // « systeme » tant que le modèle local n'est pas prêt : Raylé n'est jamais muette
    if(!opts.moteur&&moteurId==='systeme'&&choisiId!=='systeme'){
      const m='Voix « '+(VoixMoteurs.NOMS[choisiId]||{nom:choisiId}).nom+' » pas encore prête : voix du système en attendant';
      if(m!==lastVoiceInfo){ addLine('sys',m); lastVoiceInfo=m; }
    }
    const vit=Math.max(0.5,Math.min(2,1+vitesseCourante()/100));
    const ctrl=new AbortController(); synthCtrl=ctrl;
    const taches=[];
    const lancer=i=>{ if(i<parts.length&&!taches[i]){ taches[i]=VoixMoteurs.synth(moteurId,parts[i],{vitesse:vit,signal:ctrl.signal}); taches[i].catch(()=>{}); } };
    let enLigne=moteurId!=='systeme';
    if(enLigne){ lancer(0); lancer(1); }   // synthèse phrase par phrase : la première part vite, la suite se prépare pendant la lecture
    for(let i=0;i<parts.length;i++){
      if(token!==speakToken) return;
      if(enLigne){
        try{
          const a=await taches[i];
          lancer(i+2);
          if(token!==speakToken) return;
          await playAudio(a,token); lastVoiceInfo='';
          continue;
        }catch(e){
          if(token!==speakToken) return;
          enLigne=false; try{ ctrl.abort(); }catch(x){}
          const m='Voix « '+(VoixMoteurs.NOMS[moteurId]||{nom:moteurId}).nom+' » indisponible ('+errMsg(e)+') : voix du système';
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
'''
s = s[:a] + NOUVEAU + s[b:]

# annulation des synthèses
s = s.replace("  function stopAudioOnly(){\n", "  function stopAudioOnly(){\n    if(synthCtrl){ try{ synthCtrl.abort(); }catch(e){} synthCtrl=null; }\n", 1)

# lecture : hauteur sans changer le rythme
ancien = "        el.src=url;\n        el.onended=fin"
if ancien not in s:
    ancien = "        el.onplaying=()=>{ demarre=true; };"
s = s.replace("        el.onplaying=()=>{ demarre=true; };", "        el.onplaying=()=>{ demarre=true; };\n        try{ el.preservesPitch=false; el.mozPreservesPitch=false; el.webkitPreservesPitch=false; el.playbackRate=a.vitesseLecture||1; }catch(e){}", 1)

# voix du système : meilleure voix française classée automatiquement, ou celle choisie dans le panneau ; hauteur réglable
a = s.index("  function pickVoice(){")
b = s.index("  function loadVoices(){")
s = s[:a] + r'''  function pickVoice(){
    const choisie=window.VoixMoteurs?VoixMoteurs.voixSystemeChoisie():'';
    if(choisie){ const v=voices.find(x=>x.voiceURI===choisie||x.name===choisie); if(v) return v; }
    const rang=window.VoixCalcul?VoixCalcul.classerVoixSysteme(voices,persona.feminin):[];
    if(rang.length) return rang[0].voix;
    return voices.find(v=>/^fr/i.test(v.lang))||null;
  }
''' + s[b:]
s = s.replace("u.pitch=persona.feminin?1:0.78; u.rate=rate;", "u.pitch=Math.max(0,Math.min(2,(persona.feminin?1:0.78)*(1+(window.VoixMoteurs?VoixMoteurs.hauteur():0)/100))); u.rate=rate;", 1)

# ancienne synthèse par le Worker : remplacée par VoixMoteurs.synth (moteur « edge »)
a = s.index("  async function fetchAudio(t){")
b = s.index("  const audioEl=new Audio();")
s = s[:a] + s[b:]
s = s.replace("/* ═════════════ VOIX : Worker (Azure → Edge) puis voix du navigateur ═════════════ */", "/* ═════════════ VOIX : moteur choisi (Kokoro / Piper locaux, Edge par le Worker, voix du système) ═════════════ */", 1)
open(p, 'w', encoding='utf-8').write(s)
print('ok')
