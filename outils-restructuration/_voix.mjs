import fs from 'node:fs';
let t = fs.readFileSync('core/voice/voix.js', 'utf8'); const crlf = t.includes('
'); t = t.replace(/
/g, '
'); const n0 = t.length;
const rep = (a, b) => { if (!t.includes(a)) throw new Error('ancre introuvable : ' + a.slice(0, 60)); t = t.replace(a, b); };
// 1. découpe prosodique
rep("    let parts=window.NormFr?NormFr.phrases(NormFr.normaliser(text)):regroup(t,260);\n    if(!parts.length) parts=regroup(t,260);",
"    let segs=null; try{ if(window.Prosodie&&window.NormFr&&localStorage.getItem('rayle_prosodie')!=='0') segs=Prosodie.depuisTexte(text,NormFr.normaliser); }catch(e){ segs=null; }\n    let parts=segs&&segs.length?segs.map(s=>s.texte):(window.NormFr?NormFr.phrases(NormFr.normaliser(text)):regroup(t,260));\n    if(!parts.length){ parts=regroup(t,260); segs=null; }\n    const reglage=i=>segs&&segs[i]?segs[i]:{vitesse:1,hauteur:0,pause:0};\n    const baseHauteur=window.VoixMoteurs?VoixMoteurs.hauteur():0;");
// 2. synthèse segment par segment avec débit et hauteur propres
rep("taches[i]=VoixMoteurs.synth(moteurId,parts[i],{vitesse:vit,signal:ctrl.signal});", "taches[i]=VoixMoteurs.synth(moteurId,parts[i],{vitesse:Math.max(0.5,Math.min(2,vit*reglage(i).vitesse)),hauteur:baseHauteur+reglage(i).hauteur,signal:ctrl.signal});");
// 3. pause après chaque segment (annulable)
rep("          await playAudio(a,token); lastVoiceInfo='';\n          continue;", "          await playAudio(a,token); lastVoiceInfo='';\n          if(i<parts.length-1) await pauseParole(reglage(i).pause,token);\n          continue;");
rep("      await browserSpeak(parts[i],token);\n    }", "      await browserSpeak(parts[i],token,reglage(i));\n      if(i<parts.length-1) await pauseParole(reglage(i).pause,token);\n    }");
// 4. voix du navigateur : débit et hauteur du segment
rep("  function browserSpeak(t,token){", "  /* Silence entre deux phrases : coupé net si une nouvelle réponse arrive ou si on coupe Raylé. */\n  function pauseParole(ms,token){ return new Promise(res=>{ if(!ms||ms<=0){ res(); return; } const t0=Date.now(), v=()=>{ if(token!==speakToken||Date.now()-t0>=ms) res(); else setTimeout(v,40); }; v(); }); }\n  function browserSpeak(t,token,seg){\n    seg=seg||{vitesse:1,hauteur:0};");
rep("u.rate=rate; u.volume=1;", "u.rate=Math.max(0.5,Math.min(1.5,rate*(seg.vitesse||1))); u.pitch=Math.max(0,Math.min(2,u.pitch*(1+(seg.hauteur||0)/100))); u.volume=1;");
fs.writeFileSync('core/voice/voix.js', crlf ? t.replace(/
/g, '
') : t); console.log('ok', n0, '->', t.length);
