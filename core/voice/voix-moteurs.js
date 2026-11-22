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
      /* v9 : voix principale Microsoft Azure Speech (offre gratuite F0, par le Worker rayle-voix) ; secours Piper local (illimité, hors ligne) ; Gemini reste un choix des réglages */
      'azure-vivienne':{nom:'Vivienne Multilingual',detail:'Microsoft Azure : voix féminine très naturelle, chaleureuse',type:'worker',famille:'azure',genre:'f'},
      'azure-denise':{nom:'Denise',detail:'Microsoft Azure : voix féminine claire et posée',type:'worker',famille:'azure',genre:'f'},
      'azure-remy':{nom:'Rémy Multilingual',detail:'Microsoft Azure : voix masculine naturelle, expressive',type:'worker',famille:'azure',genre:'h'},
      'azure-henri':{nom:'Henri',detail:'Microsoft Azure : voix masculine claire et sérieuse',type:'worker',famille:'azure',genre:'h'},
      'piper-siwis':{nom:'Siwis',detail:'Piper : voix féminine naturelle, claire (locale, hors ligne)',type:'piper',famille:'piper',genre:'f'},
      'piper-jessica':{nom:'Jessica',detail:'Piper : voix féminine douce (locale, hors ligne)',type:'piper',famille:'piper',genre:'f'},
      'piper-pierre':{nom:'Pierre',detail:'Piper : voix masculine posée (locale, hors ligne)',type:'piper',famille:'piper',genre:'h'},
      'piper-tom':{nom:'Tom',detail:'Piper : voix masculine grave (locale, hors ligne)',type:'piper',famille:'piper',genre:'h'},
      /* v7 : voix Gemini TTS (Google, offre gratuite), appelées par le Worker (la clé reste secrète) ; 3 féminines + 3 masculines « majordome IA » ; voix prédéfinies originales */
      'gemini-f1':{nom:'Sulafat · féminine chaleureuse',detail:'Gemini TTS : voix féminine chaleureuse, posée, souriante',type:'worker',famille:'gemini',genre:'f'},
      'gemini-f2':{nom:'Vindemiatrix · féminine douce',detail:'Gemini TTS : voix féminine douce, élégante, posée',type:'worker',famille:'gemini',genre:'f'},
      'gemini-f3':{nom:'Achernar · féminine veloutée',detail:'Gemini TTS : voix féminine veloutée, calme, souriante',type:'worker',famille:'gemini',genre:'f'},
      'gemini-h1':{nom:'Algieba · majordome raffiné',detail:'Gemini TTS : voix masculine calme et raffinée, style assistant dévoué',type:'worker',famille:'gemini',genre:'h'},
      'gemini-h2':{nom:'Charon · majordome posé',detail:'Gemini TTS : voix masculine grave, précise, rassurante',type:'worker',famille:'gemini',genre:'h'},
      'gemini-h3':{nom:'Iapetus · majordome clair',detail:'Gemini TTS : voix masculine claire, mesurée, distinguée',type:'worker',famille:'gemini',genre:'h'},
    };
    /* ── Gemini : réglages (ton, vitesse), cache audio de l'appareil, plafond du jour, pause après un quota ── */
    const TONS_GEM={naturel:'Naturel',chaleureux:'Chaleureux',pose:'Posé',dynamique:'Dynamique'};
    /* La clé synchronisée rayle_voix_gemini_v1 porte désormais le choix de voix de TOUS les moteurs (azure-*, piper-*, gemini-*) avec la vitesse et le ton. */
    function gemini(){ try{ const o=JSON.parse(lire(CLE_GEM)||'{}'); return {ton:TONS_GEM[o.ton]?o.ton:'naturel',vitesse:Math.max(-20,Math.min(20,Number(o.vitesse)||0)),moteur:(o.moteur&&NOMS[o.moteur])?o.moteur:'',maj:o.maj||0}; }catch(e){ return {ton:'naturel',vitesse:0,moteur:'',maj:0}; } }
    function definirGemini(o){ const g=Object.assign(gemini(),o||{}); ecrire(CLE_GEM,JSON.stringify({ton:g.ton,vitesse:g.vitesse,moteur:g.moteur,maj:Date.now()})); prevenir(); }
    const jourGem=()=>new Date().toISOString().slice(0,10), cleJourGem=()=>'rayle_voix_gemini_n_'+jourGem();
    const nGemJour=()=>Number(lire(cleJourGem()))||0;
    function pauseGem(){ return Number(lire(CLE_GEM_PAUSE))||0; }
    async function empreinte(t){ try{ const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)); return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,'0')).join(''); }catch(e){ let h=5381; for(let i=0;i<t.length;i++) h=((h<<5)+h+t.charCodeAt(i))|0; return 'h'+(h>>>0).toString(16); } }
    const cacheGem=async()=>{ try{ return ('caches' in window)?await caches.open('rayle-voix-gemini-v1'):null; }catch(e){ return null; } };
    const memGem=new Map();   // repli quand le Cache Storage n'existe pas (page en http hors localhost) : copie en mémoire pour la session
    let limiteurGem=C.creerLimiteur({max:3,fenetre:62000});
    const dormir=(ms,signal)=>new Promise((ok,ko)=>{ const t=setTimeout(ok,ms); if(signal) signal.addEventListener('abort',()=>{ clearTimeout(t); ko(new DOMException('abandon','AbortError')); },{once:true}); });
    async function attendreCreneauGem(signal){ for(;;){ const d=limiteurGem.creneau(); if(!d) return; await dormir(Math.min(d,5000),signal); } }
    async function synthGemini(id,texte,opts){
      const g=gemini(), vit=Math.round(((opts.vitesse!=null?opts.vitesse:1)-1)*100)+g.vitesse, cle='https://rayle.local/tts-gemini/'+await empreinte([id,g.ton,vit,texte].join('\u0001'));
      const cache=await cacheGem(); if(memGem.has(cle)){ noterUtilise('gemini (copie sur l’appareil)'); return {blob:memGem.get(cle),vitesseLecture:1,src:'gemini/'+id+' (cache)'}; }
      if(cache){ try{ const hit=await cache.match(cle); if(hit){ noterUtilise('gemini (copie sur l’appareil)'); return {blob:await hit.blob(),vitesseLecture:1,src:'gemini/'+id+' (cache)'}; } }catch(e){} }
      if(Date.now()<pauseGem()) throw new Error('Gemini en pause (quota atteint) : moteur de secours');
      await attendreCreneauGem(opts.signal);   // v7 : au plus 3 requêtes par minute : on espace les départs au lieu de basculer sur la voix du système
      if(nGemJour()>=LIMITE_JOUR_GEM) throw new Error('quota Gemini du jour atteint ('+LIMITE_JOUR_GEM+' phrases nouvelles) : moteur de secours');
      if(!W.token()) throw new Error('aucun code d’accès enregistré dans Rayle (Réglages)');
      /* Worker séparé « rayle-voix » (Gemini TTS seulement) : même jeton que le Worker principal, qui le vérifie */
      const base=(lire('rayle_voix_url')||'https://rayle-voix.justinmaneiro.workers.dev').replace(/\/+$/,'');
      let res=await fetchT(base+'/tts',{method:'POST',headers:{'Content-Type':'application/json','X-Rayle-Token':W.token()||'','X-Rayle-Worker':W.url()||''},body:JSON.stringify({text:texte,id,ton:g.ton,vitesse:vit}),signal:opts.signal},30000).catch(e=>{ throw new Error('rayle-voix injoignable ('+(e&&e.name==='AbortError'?'délai dépassé':((e&&e.message)||e))+') : '+base+'/tts — réseau ou CORS'); });
      if(res.status===429&&!opts.relance){ let jj={}; try{ jj=await res.clone().json(); }catch(e){} if(!jj.jour){ await dormir(22000,opts.signal); return synthGemini(id,texte,Object.assign({},opts,{relance:true})); } }
      if(res.status===429){ let j={}; try{ j=await res.json(); }catch(e){} const jour=!!j.jour; ecrire(CLE_GEM_PAUSE,String(Date.now()+(jour?3*3600e3:2*60e3))); throw new Error('HTTP 429 · '+(j.error||'quota Gemini atteint')+' — moteur de secours '+(jour?'pendant 3 heures (limite du jour)':'pendant 2 minutes (limite par minute)')); }
      if(!res.ok) throw await workerError(res);
      const blob=await res.blob(), etat=res.headers.get('X-Rayle-Cache'); memGem.set(cle,blob); if(memGem.size>60) memGem.delete(memGem.keys().next().value);
      if(etat!=='hit') ecrire(cleJourGem(),String(nGemJour()+1));
      if(cache){ try{ await cache.put(cle,new Response(blob,{headers:{'Content-Type':'audio/wav'}})); const ks=await cache.keys(); if(ks.length>400) for(const k of ks.slice(0,100)) await cache.delete(k); }catch(e){} }
      return {blob,vitesseLecture:1,src:res.headers.get('X-Rayle-Voix')||('gemini/'+id)};
    }
    /* ── v9 Azure Speech (voix principale) : une réponse = une requête ; phrases déjà dites en copie sur l'appareil ; compteur du mois ; pause si quota ou clé refusée ── */
    const CLE_AZ_ETAT='rayle_voix_azure_etat', CLE_AZ_PAUSE='rayle_voix_azure_pause', CLE_AZ_QUOTA='rayle_voix_azure_quota';
    const jsonLu=k=>{ try{ return JSON.parse(lire(k)||'null'); }catch(e){ return null; } };
    const baseWorker=()=>(lire('rayle_voix_url')||'https://rayle-voix.justinmaneiro.workers.dev').replace(/\/+$/,'');
    const azureEtat=()=>jsonLu(CLE_AZ_ETAT)||{cle:null,t:0}, pauseAzure=()=>Number(lire(CLE_AZ_PAUSE))||0;
    const azureDispo=()=>azureEtat().cle===true&&Date.now()>=pauseAzure();
    const quotaAzure=()=>jsonLu(CLE_AZ_QUOTA);
    function noterQuotaAzure(n,limite){ const mois=new Date().toISOString().slice(0,7), l=Number(limite)||490000; ecrire(CLE_AZ_QUOTA,JSON.stringify({mois,n:Number(n)||0,limite:l,pct:Math.round((Number(n)||0)/500000*1000)/10,t:Date.now()}));
      /* alerte à 80 % du quota gratuit (une fois par mois) : visible dans la conversation, dans Réglages → Voix et dans État des données */
      try{ if((Number(n)||0)>=400000&&lire('rayle_voix_azure_alerte')!==mois){ ecrire('rayle_voix_azure_alerte',mois); if(typeof addLine==='function') addLine('sys','⚠ Voix Azure : plus de 80 % des 500 000 caractères gratuits du mois sont utilisés. À la limite le service se bloque sans facturer, et la voix locale Piper prend le relais.'); } }catch(e){}
      prevenir(); }
    const cacheAz=async()=>{ try{ return ('caches' in window)?await caches.open('rayle-voix-azure-v1'):null; }catch(e){ return null; } };
    const memAz=new Map();
    async function synthAzure(id,texte,opts){
      const g=gemini(), vit=Math.round(((opts.vitesse!=null?opts.vitesse:1)-1)*100)+g.vitesse, cle='https://rayle.local/tts-azure/'+await empreinte([id,g.ton,vit,texte].join('\u0001'));
      const cache=await cacheAz(); if(memAz.has(cle)) return {blob:memAz.get(cle),vitesseLecture:1,src:'azure/'+id+' (cache)'};
      if(cache){ try{ const hit=await cache.match(cle); if(hit) return {blob:await hit.blob(),vitesseLecture:1,src:'azure/'+id+' (cache)'}; }catch(e){} }
      if(Date.now()<pauseAzure()) throw new Error('Azure en pause (quota du mois ou clé refusée) : voix Piper');
      if(!W.token()) throw new Error('aucun code d’accès enregistré dans Rayle (Réglages)');
      const res=await fetchT(baseWorker()+'/azure',{method:'POST',headers:{'Content-Type':'application/json','X-Rayle-Token':W.token()||'','X-Rayle-Worker':W.url()||''},body:JSON.stringify({text:texte,voix:id,ton:g.ton,vitesse:vit}),signal:opts.signal},14000).catch(e=>{ { ecrire(CLE_AZ_PAUSE,String(Date.now()+60e3)); throw new Error('rayle-voix injoignable ('+(e&&e.name==='AbortError'?'délai dépassé':((e&&e.message)||e))+')'); } });
      if(!res.ok){ let j={}; try{ j=await res.json(); }catch(e){}
        if(j.mois||res.status===429){ ecrire(CLE_AZ_PAUSE,String(Date.now()+6*3600e3)); if(j.n!=null) noterQuotaAzure(j.n,j.limite); }
        else if(j.cleRefusee||j.nonConfigure){ ecrire(CLE_AZ_PAUSE,String(Date.now()+30*60e3)); }
        else ecrire(CLE_AZ_PAUSE,String(Date.now()+60e3));   // disjoncteur : après une panne, une minute de Piper sans réessayer Azure (pas d'attente à chaque réponse)
        throw new Error('Azure : '+(j.error||('HTTP '+res.status))); }
      const blob=await res.blob(); memAz.set(cle,blob); if(memAz.size>60) memAz.delete(memAz.keys().next().value);
      const n=res.headers.get('X-Rayle-Chars'); if(n!=null&&res.headers.get('X-Rayle-Cache')!=='hit') noterQuotaAzure(n,res.headers.get('X-Rayle-Chars-Limite'));
      if(cache){ try{ await cache.put(cle,new Response(blob,{headers:{'Content-Type':'audio/mpeg'}})); const ks=await cache.keys(); if(ks.length>600) for(const k of ks.slice(0,150)) await cache.delete(k); }catch(e){} }
      return {blob,vitesseLecture:1,src:'azure/'+id};
    }
    /* l'état d'Azure (clé en place ?) et le compteur du mois, demandés au Worker */
    async function rafraichirAzure(){
      try{ const r=await fetchT(baseWorker()+'/sante',{},10000), j=await r.json(); ecrire(CLE_AZ_ETAT,JSON.stringify({cle:!!(j.azure&&j.azure.cle&&j.azure.region),t:Date.now()})); }catch(e){ return azureEtat(); }
      if(azureEtat().cle&&W.token()){ try{ const r=await fetchT(baseWorker()+'/azure/quota',{headers:{'X-Rayle-Token':W.token()||'','X-Rayle-Worker':W.url()||''}},10000); if(r.ok){ const q=await r.json(); noterQuotaAzure(q.n,q.limite); } }catch(e){} }
      prevenir(); return azureEtat();
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
    const voixSysteme=()=>[];   // v8 : voix du système supprimée
    function pret(id){
      const n=NOMS[id]; if(!n) return false;
      if(n.type==='piper') return !!window.PiperLocal&&PiperLocal.pret(id);
      if(n.famille==='azure') return typeof workerReady==='function'&&!!workerReady()&&azureDispo();
      if(n.type==='worker') return typeof workerReady==='function'&&!!workerReady();
      return false;
    }
    function candidats(){
      return Object.keys(NOMS).map(id=>{
        const n=NOMS[id], t=resultats[id]; let etat='indisponible', raison='';
        if(n.type==='piper'){
          const e=window.PiperLocal?PiperLocal.etat(id):{etat:'absente'};
          if(e.etat==='prete') etat='prête';
          else if(e.etat==='telechargement'){ etat='chargement'; raison='téléchargement de la voix ('+(e.pct||0)+' %), une seule fois'; }
          else if(e.etat==='chargement'){ etat='chargement'; raison='préparation de la voix…'; }
          else if(e.etat==='erreur'){ etat='indisponible'; raison=e.raison||''; }
          else { etat='à télécharger'; raison='téléchargée au premier usage ('+(PiperLocal.VOIX[id]||{}).mo+' Mo, une seule fois)'; }
        } else if(n.famille==='azure'){
          if(typeof workerReady!=='function'||!workerReady()) raison='code d’accès non saisi';
          else if(azureEtat().cle===false) raison='clé Azure pas encore posée dans rayle-voix';
          else if(azureEtat().cle===null) raison='état d’Azure en cours de lecture…';
          else if(Date.now()<pauseAzure()) raison='en pause (quota du mois ou clé refusée) : Piper parle à la place';
          else etat='prête';
        } else if(n.type==='worker'){ etat=pret(id)?'prête':'indisponible'; if(etat!=='prête') raison='Worker non configuré'; }
        if(t&&!t.ok&&etat==='prête'){ etat='en échec'; raison=t.raison||'test échoué'; }
        return {id,nom:n.nom,detail:n.detail,type:n.type,famille:n.famille,genre:n.genre,etat,raison,test:t||null};
      });
    }
    /* Voix par défaut (tant que tu n'as pas choisi) : Vivienne Multilingual si Azure marche, sinon la meilleure Piper féminine. Le choix est synchronisé entre les appareils (clé rayle_voix_gemini_v1). */
    function defaut(){ return azureDispo()?'azure-vivienne':'piper-siwis'; }
    function choisi(){ const gm=gemini().moteur; if(gm&&NOMS[gm]) return gm; return defaut(); }
    /* Piper de secours : la même sensibilité (féminine/masculine) que la voix choisie, de préférence déjà téléchargée */
    function piperSecours(id){ const genre=(NOMS[id]&&NOMS[id].genre)||'f', L=Object.keys(NOMS).filter(k=>NOMS[k].famille==='piper'&&NOMS[k].genre===genre); return L.find(k=>window.PiperLocal&&PiperLocal.pret(k))||L[0]||'piper-siwis'; }
    /* Chaîne des moteurs d'UNE réponse : la voix choisie, puis Piper. Une fois la première phrase lue, la réponse se termine avec la même voix. */
    function chaine(id){ return NOMS[id]&&NOMS[id].famille==='piper'?[id]:[id,piperSecours(id)]; }
    function actif(){ return choisi(); }
    function choisir(id){ ecrire(CLE_MOTEUR,''); definirGemini({moteur:(id&&id!=='auto'&&NOMS[id])?id:''}); }
    const hauteur=()=>{ const h=Number(lire(CLE_HAUTEUR)); return isFinite(h)?h:0; };
    function definirHauteur(h){ ecrire(CLE_HAUTEUR,Number(h)===0?'':String(h)); prevenir(); }

    /* ── synthèse : retourne un Blob audio ── */
    async function synth(id,texte,opts){
      opts=opts||{};
      const n=NOMS[id]; if(!n) throw new Error('moteur inconnu : '+id);
      const vit=opts.vitesse!=null?opts.vitesse:1;
      const f=C.facteursLecture(vit,opts.hauteur!=null?opts.hauteur:hauteur());
      if(n.type==='piper'){ const g=gemini(), vm=Math.max(0.5,Math.min(2,f.vitesseMoteur*(1+g.vitesse/100))); return PiperLocal.synth(id,texte,{vitesse:vm,vitesseLecture:f.vitesseLecture,signal:opts.signal}); }
      if(n.famille==='azure') return synthAzure(id,texte,opts);
      if(n.famille==='gemini') return synthGemini(id,texte,opts);
      if(n.type==='worker'){
        const body={text:texte}; body.vitesse=Math.round((f.vitesseMoteur-1)*100);
        const res=await wfetch('/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:opts.signal},25000);
        if(!res.ok) throw await workerError(res);
        return {blob:await res.blob(),vitesseLecture:f.vitesseLecture,src:res.headers.get('X-Rayle-Voix')||'edge'};
      }
      throw new Error('moteur sans synthèse : '+id);
    }

    /* ── test automatique ── */
    async function tester(id){
      const t0=performance.now();
      try{
        const a=await synth(id,"Bonjour, je suis Rayle.",{vitesse:1,hauteur:0});
        const ms=Math.round(performance.now()-t0);
        if(NOMS[id].type==='piper'){ const an=C.analyserWav(new Uint8Array(await a.blob.arrayBuffer())); return Object.assign({ms},an); }
        return {ok:a.blob.size>1500,ms,duree:null,raison:a.blob.size>1500?'':'audio vide',src:a.src};
      }catch(e){ return {ok:false,ms:Math.round(performance.now()-t0),raison:String(e&&e.message||e).slice(0,160)}; }
    }
    async function testerAuto(){
      if(enCours) return enCours;
      enCours=(async()=>{
        await rafraichirLocal();
        const res={};
        for(const id of Object.keys(NOMS)){ if(NOMS[id].type==='piper'&&pret(id)) res[id]=await tester(id); }   /* pas de test automatique d'Azure ni de Gemini : il consommerait le quota gratuit */
        resultats=res;
        prevenir(); return res;
      })().finally(()=>{ enCours=null; });
      return enCours;
    }
    /* À l'ouverture : on lit l'état d'Azure et, en tâche de fond, on précharge la voix Piper de secours (téléchargée une seule fois, puis hors ligne). */
    async function demarrer(){
      try{ const g=gemini().moteur, id=(g&&NOMS[g]&&NOMS[g].famille==='piper')?g:'piper-siwis'; if(window.PiperLocal&&lire('rayle_piper_precharge')!=='0') PiperLocal.precharger(id); }catch(e){}
      await rafraichirAzure();
    }
    const dico=()=>{ try{ return JSON.parse(lire(CLE_DICO)||'{}'); }catch(e){ return {}; } };
    function definirDico(o){ ecrire(CLE_DICO,o&&Object.keys(o).length?JSON.stringify(o):''); if(window.NormFr) NormFr.definirDictionnaire(o||{}); prevenir(); }
    if(window.NormFr) NormFr.definirDictionnaire(dico());
    const voixSystemeChoisie=()=>lire(CLE_SYS);
    function choisirVoixSysteme(uri){ ecrire(CLE_SYS,uri); prevenir(); }

    /* v9 : Gemini (Sulafat) n'est plus la voix par défaut : une seule fois par appareil, le choix automatique de la v7 est effacé (un autre choix que tu aurais fait est conservé) */
    setTimeout(()=>{ try{ if(!lire('rayle_voix_v9')){ ecrire('rayle_voix_v9','1'); if(gemini().moteur==='gemini-f1') definirGemini({moteur:''}); } }catch(e){} },0);
    return {NOMS,azureDispo,azureEtat,pauseAzure,quotaAzure,rafraichirAzure,defaut,chaine,piperSecours,razLimiteurGem:()=>{ limiteurGem=C.creerLimiteur({max:3,fenetre:62000}); },noterEchec,echec,diagnostic,gemini,definirGemini,TONS_GEM,nGemJour,LIMITE_JOUR_GEM,pauseGem,noterUtilise,dernier,candidats,choisi,actif,choisir,hauteur,definirHauteur,synth,tester,testerAuto,demarrer,rafraichirLocal,pret,dico,definirDico,voixSystemeChoisie,choisirVoixSysteme,
      resultats:()=>resultats,local:()=>local,surChangement:f=>ecouteurs.push(f),peutLocal};
  })();

  window.VoixMoteurs=VoixMoteurs;
  setTimeout(()=>{ VoixMoteurs.demarrer().catch(()=>{}); },1500);   // réveille la voix locale et teste les moteurs en arrière-plan
