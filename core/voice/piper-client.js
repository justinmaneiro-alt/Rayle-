"use strict";
/* ═════════════ PIPER LOCAL (v9) : voix neuronale gratuite, illimitée, hors ligne, dans le navigateur ═════════════
   Le moteur (onnxruntime-web + analyseur de phonèmes espeak-ng, WebAssembly) vit dans le dépôt (core/voice/piper/) ; le modèle de voix (63 à 77 Mo) est téléchargé UNE fois
   depuis le dépôt officiel Piper (Hugging Face, rhasspy/piper-voices), puis gardé dans le Cache Storage : ensuite, plus aucun réseau. Tout tourne dans un Web Worker.
   Voix : fr_FR-siwis-medium (féminine), fr_FR-upmc-medium (Jessica, féminine, et Pierre, masculin), fr_FR-tom-medium (masculine). Licences : NOTICE.md. */
const PiperLocal=(function(){
  const SCRIPT=(document.currentScript&&document.currentScript.src)||location.href;
  const BASE=new URL('piper/',SCRIPT).href;
  const HF='https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/';
  const VOIX={
    'piper-siwis':{nom:'Siwis',detail:'Piper : voix féminine naturelle, claire (locale, hors ligne)',genre:'f',modele:'siwis/medium/fr_FR-siwis-medium',locuteur:0,mo:63},
    'piper-jessica':{nom:'Jessica',detail:'Piper : voix féminine douce (locale, hors ligne)',genre:'f',modele:'upmc/medium/fr_FR-upmc-medium',locuteur:0,mo:77},
    'piper-pierre':{nom:'Pierre',detail:'Piper : voix masculine posée (locale, hors ligne)',genre:'h',modele:'upmc/medium/fr_FR-upmc-medium',locuteur:1,mo:77},
    'piper-tom':{nom:'Tom',detail:'Piper : voix masculine grave (locale, hors ligne)',genre:'h',modele:'tom/medium/fr_FR-tom-medium',locuteur:0,mo:64}
  };
  const CACHE='rayle-piper-v1';
  const ecouteurs=[], prevenir=()=>ecouteurs.forEach(f=>{ try{ f(); }catch(e){} });
  const etats={};            // id → {etat:'absente'|'telechargement'|'chargement'|'prete'|'erreur', pct, raison}
  const mem=new Map();       // repli quand le Cache Storage n'existe pas
  let ouvrirCache=null, worker=null, moteurPret=null, compteur=0; const attentes=new Map(); const chargements={};
  const cacheStorage=()=>{ if(!ouvrirCache) ouvrirCache=('caches' in self)?caches.open(CACHE).catch(()=>null):Promise.resolve(null); return ouvrirCache; };
  function majEtat(id,o){ const av=etats[id]||{}; etats[id]=Object.assign({},av,o); if(av.etat!==etats[id].etat||av.pct!==etats[id].pct||av.raison!==etats[id].raison) prevenir(); }

  /* lecture « cache d'abord » : Cache Storage, sinon réseau (avec progression), puis mise en cache */
  async function lire(url,progres){
    if(mem.has(url)) return mem.get(url);
    const c=await cacheStorage();
    if(c){ try{ const hit=await c.match(url); if(hit){ const b=await hit.arrayBuffer(); return b; } }catch(e){} }
    const r=await fetch(url); if(!r.ok) throw new Error('téléchargement impossible : HTTP '+r.status+' '+url.split('/').pop());
    const total=Number(r.headers.get('content-length'))||0; let buf;
    if(progres&&r.body&&r.body.getReader&&total){
      const lecteur=r.body.getReader(), morceaux=[]; let recu=0;
      for(;;){ const {done,value}=await lecteur.read(); if(done) break; morceaux.push(value); recu+=value.length; progres(recu/total); }
      const u=new Uint8Array(recu); let o=0; for(const m of morceaux){ u.set(m,o); o+=m.length; } buf=u.buffer;
    } else buf=await r.arrayBuffer();
    if(c){ try{ await c.put(url,new Response(buf.slice(0),{headers:{'Content-Type':'application/octet-stream'}})); }catch(e){ mem.set(url,buf); } } else mem.set(url,buf);
    return buf;
  }
  const blobUrl=(buf,type)=>URL.createObjectURL(new Blob([buf],{type}));

  function envoyer(msg,transfert){
    return new Promise((ok,ko)=>{ const id=++compteur; attentes.set(id,{ok,ko}); worker.postMessage(Object.assign({id},msg),transfert||[]); });
  }
  function demarrerMoteur(){
    if(moteurPret) return moteurPret;
    moteurPret=(async()=>{
      const [ortJs,ortWasm,phJs,phWasm,phData]=await Promise.all(['ort.wasm.min.js','ort-wasm-simd.wasm','piper_phonemize.js','piper_phonemize.wasm','piper_phonemize.data'].map(f=>lire(BASE+f)));
      worker=new Worker(BASE+'piper-worker.js');
      worker.onmessage=e=>{ const m=e.data, a=attentes.get(m.id); if(!a) return; attentes.delete(m.id); if(m.type==='erreur') a.ko(new Error(m.message)); else a.ok(m); };
      worker.onerror=e=>{ const err=new Error('Piper : le moteur ne démarre pas ('+(e.message||'erreur du worker')+')'); attentes.forEach(a=>a.ko(err)); attentes.clear(); };
      await envoyer({type:'init',urls:{ort:blobUrl(ortJs,'text/javascript'),phonemize:blobUrl(phJs,'text/javascript'),ortWasm:blobUrl(ortWasm,'application/wasm')},wasmPhonemize:phWasm,donneesPhonemize:phData});
    })().catch(e=>{ moteurPret=null; throw e; });
    return moteurPret;
  }

  /* télécharge (une fois) et charge une voix ; plusieurs appels simultanés = un seul chargement */
  function charger(id){
    const v=VOIX[id]; if(!v) return Promise.reject(new Error('voix Piper inconnue : '+id));
    if(chargements[id]) return chargements[id];
    chargements[id]=(async()=>{
      try{
        majEtat(id,{etat:'telechargement',pct:0,raison:''});
        try{ if(navigator.storage&&navigator.storage.persist) navigator.storage.persist(); }catch(e){}
        await demarrerMoteur();
        const config=JSON.parse(new TextDecoder().decode(await lire(HF+v.modele+'.onnx.json')));
        const modele=await lire(HF+v.modele+'.onnx',p=>majEtat(id,{etat:'telechargement',pct:Math.round(p*100)}));
        majEtat(id,{etat:'chargement',pct:100});
        await envoyer({type:'voix',voix:v.modele,modele,config},[]);
        majEtat(id,{etat:'prete',pct:100,raison:''});
      }catch(e){ delete chargements[id]; majEtat(id,{etat:'erreur',raison:String((e&&e.message)||e)}); throw e; }
    })();
    return chargements[id];
  }
  const dejaTelechargee=async id=>{ const v=VOIX[id]; if(!v) return false; const c=await cacheStorage(); if(mem.has(HF+v.modele+'.onnx')) return true; try{ return !!(c&&await c.match(HF+v.modele+'.onnx')); }catch(e){ return false; } };

  /* synthèse d'une phrase : { blob, vitesseLecture, src } — même forme que les autres moteurs */
  async function synth(id,texte,opts){
    opts=opts||{}; const v=VOIX[id]; if(!v) throw new Error('voix Piper inconnue : '+id);
    const e=etats[id]; if(!e||e.etat!=='prete'){
      if(e&&e.etat==='telechargement') throw new Error('Piper « '+v.nom+' » : premier téléchargement de la voix en cours ('+(e.pct||0)+' % de '+v.mo+' Mo)');
      await charger(id);
    }
    if(opts.signal&&opts.signal.aborted) throw new DOMException('abandon','AbortError');
    const t0=performance.now();
    const m=await envoyer({type:'dire',voix:v.modele,locuteur:v.locuteur,texte:String(texte),vitesse:opts.vitesse||1});
    if(opts.signal&&opts.signal.aborted) throw new DOMException('abandon','AbortError');
    return {blob:new Blob([m.buffer],{type:'audio/wav'}),vitesseLecture:opts.vitesseLecture||1,src:'piper/'+id,chrono:m.chrono,ms:Math.round(performance.now()-t0)};
  }
  const pret=id=>!!(etats[id]&&etats[id].etat==='prete');
  /* préchargement de fond : la voix de secours par défaut, quelques secondes après l'ouverture, sans gêner l'interface */
  function precharger(id){ const lancer=()=>{ try{ if(navigator.connection&&navigator.connection.saveData) return dejaTelechargee(id).then(d=>{ if(d) charger(id).catch(()=>{}); }); }catch(e){} charger(id).catch(()=>{}); }; if('requestIdleCallback' in self) requestIdleCallback(lancer,{timeout:6000}); else setTimeout(lancer,3000); }
  return {VOIX,etat:id=>etats[id]||{etat:'absente'},etats:()=>etats,pret,charger,synth,precharger,dejaTelechargee,surChangement:f=>ecouteurs.push(f)};
})();
window.PiperLocal=PiperLocal;
