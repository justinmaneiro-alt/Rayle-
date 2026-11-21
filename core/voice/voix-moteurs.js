"use strict";
  /* ═════════════ VOIX DE RAYLÉ : MOTEURS (page) ═════════════
     Candidates, par ordre de préférence :
       · kokoro-siwis, piper-siwis, piper-jessica : voix LOCALES et gratuites, service du PC (app-pc/voix-locale.mjs → /__voix/…), hors ligne, aucun cloud ;
       · edge : voix en ligne gratuite par le Worker (route /tts : Edge d'abord, Azure seulement en tout dernier recours) ;
       · systeme : meilleure voix française du navigateur ou du téléphone (Edge « Natural », Google français, Samsung/Android…).
     Le choix est mémorisé (rayle_voix_moteur ; vide = automatique : la première qui réussit le test). Raylé n'est jamais muette : tant qu'un moteur n'est pas prêt, la voix du système parle.
     Calculs purs : voix-moteurs-calcul.js. */
  const VoixMoteurs=(function(){
    const CLE_GEM='rayle_voix_gemini_v1', CLE_GEM_PAUSE='rayle_voix_gemini_pause', LIMITE_JOUR_GEM=85;
    const CLE_MOTEUR='rayle_voix_moteur', CLE_HAUTEUR='rayle_voix_hauteur', CLE_SYS='rayle_voix_systeme', CLE_DICO='rayle_voix_dico', CLE_AUTO='rayle_voix_auto';
    const C=window.VoixCalcul;
    const lire=k=>{ try{ return localStorage.getItem(k)||''; }catch(e){ return ''; } };
    const ecrire=(k,v)=>{ try{ if(v===''||v==null) localStorage.removeItem(k); else localStorage.setItem(k,String(v)); }catch(e){} };
    const NOMS={
      'kokoro-siwis':{nom:'Kokoro · Siwis',detail:'voix neuronale française, locale (PC)',type:'local',moteur:'kokoro'},
      'piper-siwis':{nom:'Piper · Siwis',detail:'voix neuronale française, locale et très rapide (PC)',type:'local',moteur:'piper'},
      'piper-jessica':{nom:'Piper · Jessica',detail:'voix neuronale française, locale (PC)',type:'local',moteur:'piper'},
      'edge':{nom:'Vivienne · Edge (en ligne, gratuit)',detail:'par le Worker, sans clé ; nécessite le réseau',type:'worker'},
      /* v7 : voix Gemini TTS (Google, offre gratuite), appelées par le Worker (la clé reste secrète) ; 3 féminines + 3 masculines « majordome IA » ; voix prédéfinies originales */
      'gemini-f1':{nom:'Sulafat · féminine chaleureuse',detail:'Gemini TTS : voix féminine chaleureuse, posée, souriante',type:'worker',famille:'gemini',genre:'f'},
      'gemini-f2':{nom:'Vindemiatrix · féminine douce',detail:'Gemini TTS : voix féminine douce, élégante, posée',type:'worker',famille:'gemini',genre:'f'},
      'gemini-f3':{nom:'Achernar · féminine veloutée',detail:'Gemini TTS : voix féminine veloutée, calme, souriante',type:'worker',famille:'gemini',genre:'f'},
      'gemini-h1':{nom:'Algieba · majordome raffiné',detail:'Gemini TTS : voix masculine calme et raffinée, style assistant dévoué',type:'worker',famille:'gemini',genre:'h'},
      'gemini-h2':{nom:'Charon · majordome posé',detail:'Gemini TTS : voix masculine grave, précise, rassurante',type:'worker',famille:'gemini',genre:'h'},
      'gemini-h3':{nom:'Iapetus · majordome clair',detail:'Gemini TTS : voix masculine claire, mesurée, distinguée',type:'worker',famille:'gemini',genre:'h'},
      'systeme':{nom:'Voix du système',detail:'meilleure voix française de ton appareil',type:'systeme'}
    };
    /* ── Gemini : réglages (ton, vitesse), cache audio de l'appareil, plafond du jour, pause après un quota ── */
    const TONS_GEM={naturel:'Naturel',chaleureux:'Chaleureux',pose:'Posé',dynamique:'Dynamique'};
    function gemini(){ try{ const o=JSON.parse(lire(CLE_GEM)||'{}'); return {ton:TONS_GEM[o.ton]?o.ton:'naturel',vitesse:Math.max(-20,Math.min(20,Number(o.vitesse)||0)),moteur:/^gemini-/.test(o.moteur||'')?o.moteur:'',maj:o.maj||0}; }catch(e){ return {ton:'naturel',vitesse:0,moteur:'',maj:0}; } }
    function definirGemini(o){ const g=Object.assign(gemini(),o||{}); ecrire(CLE_GEM,JSON.stringify({ton:g.ton,vitesse:g.vitesse,moteur:g.moteur,maj:Date.now()})); prevenir(); }
    const jourGem=()=>new Date().toISOString().slice(0,10), cleJourGem=()=>'rayle_voix_gemini_n_'+jourGem();
    const nGemJour=()=>Number(lire(cleJourGem()))||0;
    function pauseGem(){ return Number(lire(CLE_GEM_PAUSE))||0; }
    async function empreinte(t){ try{ const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)); return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,'0')).join(''); }catch(e){ let h=5381; for(let i=0;i<t.length;i++) h=((h<<5)+h+t.charCodeAt(i))|0; return 'h'+(h>>>0).toString(16); } }
    const cacheGem=async()=>{ try{ return ('caches' in window)?await caches.open('rayle-voix-gemini-v1'):null; }catch(e){ return null; } };
    const memGem=new Map();   // repli quand le Cache Storage n'existe pas (page en http hors localhost) : copie en mémoire pour la session
    async function synthGemini(id,texte,opts){
      const g=gemini(), vit=Math.round(((opts.vitesse!=null?opts.vitesse:1)-1)*100)+g.vitesse, cle='https://rayle.local/tts-gemini/'+await empreinte([id,g.ton,vit,texte].join('\u0001'));
      const cache=await cacheGem(); if(memGem.has(cle)){ noterUtilise('gemini (copie sur l’appareil)'); return {blob:memGem.get(cle),vitesseLecture:1,src:'gemini/'+id+' (cache)'}; }
      if(cache){ try{ const hit=await cache.match(cle); if(hit){ noterUtilise('gemini (copie sur l’appareil)'); return {blob:await hit.blob(),vitesseLecture:1,src:'gemini/'+id+' (cache)'}; } }catch(e){} }
      if(Date.now()<pauseGem()) throw new Error('Gemini en pause (quota atteint) : moteur de secours');
      if(nGemJour()>=LIMITE_JOUR_GEM) throw new Error('quota Gemini du jour atteint ('+LIMITE_JOUR_GEM+' phrases nouvelles) : moteur de secours');
      if(!W.token()) throw new Error('aucun code d’accès enregistré dans Rayle (Réglages)');
      /* Worker séparé « rayle-voix » (Gemini TTS seulement) : même jeton que le Worker principal, qui le vérifie */
      const base=(lire('rayle_voix_url')||'https://rayle-voix.justinmaneiro.workers.dev').replace(/\/+$/,'');
      const res=await fetchT(base+'/tts',{method:'POST',headers:{'Content-Type':'application/json','X-Rayle-Token':W.token()||'','X-Rayle-Worker':W.url()||''},body:JSON.stringify({text:texte,id,ton:g.ton,vitesse:vit}),signal:opts.signal},30000).catch(e=>{ throw new Error('rayle-voix injoignable ('+(e&&e.name==='AbortError'?'délai dépassé':((e&&e.message)||e))+') : '+base+'/tts — réseau ou CORS'); });
      if(res.status===429){ let j={}; try{ j=await res.json(); }catch(e){} const jour=!!j.jour; ecrire(CLE_GEM_PAUSE,String(Date.now()+(jour?3*3600e3:2*60e3))); throw new Error('HTTP 429 · '+(j.error||'quota Gemini atteint')+' — moteur de secours '+(jour?'pendant 3 heures (limite du jour)':'pendant 2 minutes (limite par minute)')); }
      if(!res.ok) throw await workerError(res);
      const blob=await res.blob(), etat=res.headers.get('X-Rayle-Cache'); memGem.set(cle,blob); if(memGem.size>60) memGem.delete(memGem.keys().next().value);
      if(etat!=='hit') ecrire(cleJourGem(),String(nGemJour()+1));
      if(cache){ try{ await cache.put(cle,new Response(blob,{headers:{'Content-Type':'audio/wav'}})); const ks=await cache.keys(); if(ks.length>400) for(const k of ks.slice(0,100)) await cache.delete(k); }catch(e){} }
      return {blob,vitesseLecture:1,src:res.headers.get('X-Rayle-Voix')||('gemini/'+id)};
    }
    let dernierUtilise='';
    function noterUtilise(s){ if(s&&s!==dernierUtilise){ dernierUtilise=s; prevenir(); } }
    const dernier=()=>dernierUtilise;
    /* v7 : l'échec d'une voix Gemini n'est plus silencieux : dernière erreur exacte + diagnostic pas à pas de rayle-voix */
    let dernierEchec=null;
    function noterEchec(id,msg){ dernierEchec={id,msg:String(msg||''),t:Date.now()}; prevenir(); }
    const echec=()=>dernierEchec;
    const baseGem=()=>(lire('rayle_voix_url')||'https://rayle-voix.justinmaneiro.workers.dev').replace(/\/+$/,'');
    async function diagnostic(){
      const base=baseGem(), tok=W.token()||'', L=[]; L.push('Adresse rayle-voix : '+base+(lire('rayle_voix_url')?' (réglage manuel)':' (par défaut)'));
      L.push('Code d’accès enregistré dans Rayle : '+(tok?'oui ('+tok.length+' caractères, même code que pour le Worker principal)':'NON — à saisir dans Réglages'));
      try{ const r=await fetchT(base+'/sante',{},10000); const j=await r.json().catch(()=>({})); L.push('GET /sante : HTTP '+r.status+' · clé Gemini '+(j.cle?'présente':'ABSENTE')); }catch(e){ L.push('GET /sante : ÉCHEC réseau ou CORS — '+((e&&e.message)||e)); return L; }
      try{ const t0=Date.now(), r=await fetchT(base+'/tts',{method:'POST',headers:{'Content-Type':'application/json','X-Rayle-Token':tok,'X-Rayle-Worker':W.url()||''},body:JSON.stringify({text:'Essai.',id:'gemini-h1',ton:'naturel',vitesse:0})},30000);
        if(r.ok){ const b=await r.blob(); L.push('POST /tts : HTTP 200 · '+b.size+' octets · '+(r.headers.get('X-Rayle-Voix')||'?')+' · '+(Date.now()-t0)+' ms'); }
        else { const e=await workerError(r); L.push('POST /tts : '+e.message); } }catch(e){ L.push('POST /tts : ÉCHEC réseau ou CORS — '+((e&&e.message)||e)); }
      return L;
    }
    let local={installe:null,demarre:false,moteurs:{},voix:[],raison:''};
    let resultats={};          // test automatique : id → {ok, duree, ms, raison}
    let enCours=null;
    const ecouteurs=[];
    const prevenir=()=>ecouteurs.forEach(f=>{ try{ f(); }catch(e){} });

    const peutLocal=()=>/^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);

    async function rafraichirLocal(){
      if(!peutLocal()){ local={installe:false,demarre:false,moteurs:{},voix:[],raison:'voix locale seulement dans l’application PC (127.0.0.1)'}; prevenir(); return local; }
      try{
        const r=await fetch('/__voix/etat',{cache:'no-store'});
        local=r.ok?await r.json():{installe:false,demarre:false,moteurs:{},voix:[],raison:'service de voix locale indisponible (HTTP '+r.status+')'};
      }catch(e){ local={installe:false,demarre:false,moteurs:{},voix:[],raison:'service de voix locale injoignable'}; }
      prevenir(); return local;
    }
    function pretLocal(id){
      const n=NOMS[id]; if(!n||n.type!=='local') return false;
      const m=local.moteurs&&local.moteurs[n.moteur];
      return !!(local.installe&&m&&m.pret&&(local.voix||[]).some(v=>v.id===id));
    }
    const voixSysteme=()=>('speechSynthesis' in window)?speechSynthesis.getVoices():[];
    function pret(id){
      const n=NOMS[id]; if(!n) return false;
      if(n.type==='local') return pretLocal(id);
      if(n.type==='worker') return typeof workerReady==='function'&&!!workerReady();
      return ('speechSynthesis' in window);
    }
    function candidats(){
      return Object.keys(NOMS).map(id=>{
        const n=NOMS[id], t=resultats[id];
        let etat='indisponible', raison='';
        if(n.type==='local'){
          if(!local.installe) raison=local.raison||'non installée';
          else if(!pretLocal(id)){ const m=local.moteurs&&local.moteurs[n.moteur]; etat='chargement'; raison=(m&&m.erreur)||'chargement du modèle…'; if(m&&m.erreur) etat='indisponible'; }
          else etat='prête';
        } else if(n.type==='worker'){ etat=pret(id)?'prête':'indisponible'; if(etat!=='prête') raison='Worker non configuré'; }
        else { etat=pret(id)?'prête':'indisponible'; }
        if(t&&!t.ok&&etat==='prête'){ etat='en échec'; raison=t.raison||'test échoué'; }
        return {id,nom:n.nom,detail:n.detail,type:n.type,etat,raison,test:t||null};
      });
    }
    function choisi(){
      const gm=gemini().moteur; if(gm&&NOMS[gm]) return gm;   // le choix d'une voix Gemini est synchronisé entre les appareils (clé rayle_voix_gemini_v1)
      const m=lire(CLE_MOTEUR);
      if(m&&NOMS[m]) return m;
      return 'gemini-f1';   // voix choisie par l'utilisateur (Sulafat) : par défaut ; si Gemini échoue, la voix du système prend le relais

    }
    function auto(){
      const a=C.choisirParDefaut(resultats,C.ORDRE_DEFAUT);
      if(a!=='systeme') return a;
      // pas encore de test : première voix prête dans l'ordre de préférence
      for(const id of C.ORDRE_DEFAUT) if(id!=='systeme'&&pretLocal(id)&&!(resultats[id]&&!resultats[id].ok)) return id;
      return 'systeme';
    }
    function actif(){   // moteur réellement utilisé maintenant (le choix, ou la voix du système tant qu'il n'est pas prêt)
      const id=choisi();
      if(id==='systeme') return 'systeme';
      if(!pret(id)) return 'systeme';
      if(resultats[id]&&!resultats[id].ok) return 'systeme';
      return id;
    }
    function choisir(id){ ecrire(CLE_MOTEUR,id==='auto'?'':id); const g=gemini(), est=/^gemini-/.test(id); if(est||g.moteur) definirGemini({moteur:est?id:''}); else prevenir(); }
    const hauteur=()=>{ const h=Number(lire(CLE_HAUTEUR)); return isFinite(h)?h:0; };
    function definirHauteur(h){ ecrire(CLE_HAUTEUR,Number(h)===0?'':String(h)); prevenir(); }

    /* ── synthèse : retourne un Blob audio ── */
    async function synth(id,texte,opts){
      opts=opts||{};
      const n=NOMS[id]; if(!n) throw new Error('moteur inconnu : '+id);
      const vit=opts.vitesse!=null?opts.vitesse:1;
      const f=C.facteursLecture(vit,opts.hauteur!=null?opts.hauteur:hauteur());
      if(n.type==='local'){
        const r=await fetch('/__voix/synth',{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({voix:id,texte,vitesse:f.vitesseMoteur}),signal:opts.signal});
        if(!r.ok){ let d=''; try{ d=(await r.json()).erreur||''; }catch(e){} throw new Error('voix locale : HTTP '+r.status+(d?' · '+d:'')); }
        return {blob:await r.blob(),vitesseLecture:f.vitesseLecture,src:'local/'+id};
      }
      if(n.famille==='gemini') return synthGemini(id,texte,opts);
      if(n.type==='worker'){
        const body={text:texte}; body.vitesse=Math.round((f.vitesseMoteur-1)*100);
        const res=await wfetch('/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:opts.signal},25000);
        if(!res.ok) throw await workerError(res);
        return {blob:await res.blob(),vitesseLecture:f.vitesseLecture,src:res.headers.get('X-Rayle-Voix')||'edge'};
      }
      throw new Error('la voix du système ne produit pas de fichier audio');
    }

    /* ── test automatique ── */
    async function tester(id){
      const t0=performance.now();
      try{
        if(id==='systeme') return {ok:voixSysteme().some(v=>/^fr/i.test(v.lang)),ms:0,raison:voixSysteme().length?'':'aucune voix française'};
        const a=await synth(id,"Bonjour, je suis Rayle.",{vitesse:1,hauteur:0});
        const ms=Math.round(performance.now()-t0);
        if(NOMS[id].type==='local'){ const an=C.analyserWav(new Uint8Array(await a.blob.arrayBuffer())); return Object.assign({ms},an); }
        return {ok:a.blob.size>1500,ms,duree:null,raison:a.blob.size>1500?'':'audio vide',src:a.src};
      }catch(e){ return {ok:false,ms:Math.round(performance.now()-t0),raison:String(e&&e.message||e).slice(0,160)}; }
    }
    async function testerAuto(){
      if(enCours) return enCours;
      enCours=(async()=>{
        await rafraichirLocal();
        const res={};
        for(const id of Object.keys(NOMS)){ if(NOMS[id].famille==='gemini') continue;   /* pas de test automatique des voix Gemini : il consommerait le quota gratuit */
          if(id==='systeme'||pret(id)) res[id]=await tester(id); }
        resultats=res; ecrire(CLE_AUTO,JSON.stringify({date:Date.now(),defaut:C.choisirParDefaut(res,C.ORDRE_DEFAUT)}));
        prevenir(); return res;
      })().finally(()=>{ enCours=null; });
      return enCours;
    }
    /* À l'ouverture : on réveille le service local (le modèle se charge), puis on teste sans bruit. Tant que ce n'est pas prêt, la voix du système parle. */
    async function demarrer(){
      await rafraichirLocal();
      if(!local.installe) return;
      for(let i=0;i<40&&!(pretLocal('kokoro-siwis')||pretLocal('piper-siwis'));i++){ await new Promise(r=>setTimeout(r,1000)); await rafraichirLocal(); }
      await testerAuto();
    }
    const dico=()=>{ try{ return JSON.parse(lire(CLE_DICO)||'{}'); }catch(e){ return {}; } };
    function definirDico(o){ ecrire(CLE_DICO,o&&Object.keys(o).length?JSON.stringify(o):''); if(window.NormFr) NormFr.definirDictionnaire(o||{}); prevenir(); }
    if(window.NormFr) NormFr.definirDictionnaire(dico());
    const voixSystemeChoisie=()=>lire(CLE_SYS);
    function choisirVoixSysteme(uri){ ecrire(CLE_SYS,uri); prevenir(); }

    /* v7 : Sulafat devient la voix de tous les appareils (une seule fois par appareil ; la clé rayle_voix_gemini_v1 est synchronisée) */
    setTimeout(()=>{ try{ if(!lire('rayle_voix_v7_sulafat')){ ecrire('rayle_voix_v7_sulafat','1'); if(lire(CLE_MOTEUR)) ecrire(CLE_MOTEUR,''); if(gemini().moteur!=='gemini-f1') definirGemini({moteur:'gemini-f1'}); } }catch(e){} },0);
    return {NOMS,noterEchec,echec,diagnostic,gemini,definirGemini,TONS_GEM,nGemJour,LIMITE_JOUR_GEM,pauseGem,noterUtilise,dernier,candidats,choisi,actif,auto,choisir,hauteur,definirHauteur,synth,tester,testerAuto,demarrer,rafraichirLocal,pret,dico,definirDico,voixSystemeChoisie,choisirVoixSysteme,
      resultats:()=>resultats,local:()=>local,surChangement:f=>ecouteurs.push(f),peutLocal};
  })();

  window.VoixMoteurs=VoixMoteurs;
  setTimeout(()=>{ VoixMoteurs.demarrer().catch(()=>{}); },1500);   // réveille la voix locale et teste les moteurs en arrière-plan
