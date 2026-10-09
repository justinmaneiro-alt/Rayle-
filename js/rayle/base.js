"use strict";

  const $=id=>document.getElementById(id);
  const reactor=$('reactor'), logEl=$('log'), stateEl=$('state'), interimEl=$('interim'),
        btn=$('btn'), btnTxt=$('btnTxt'), btnSub=$('btnSub'), form=$('form'), txt=$('txt'),
        bridgeEl=$('bridgeStatus'), voiceEl=$('voiceName'),
        miniReactor=$('miniReactor'), miniEtat=$('miniEtat'), miniDit=$('miniDit');   // petite Raylé du terminal

  // L'entité (sphère de particules) vit dans le réacteur ; dans la vue terminal, elle passe dans la petite Raylé
  Entite.monter(reactor);
  RayleBus.on('vue:changee',d=>Entite.monter(d&&d.vue==='terminal'?miniReactor:reactor));

  /* ═════════════ STOCKAGE LOCAL (adresse du Worker, code et réglages uniquement) ═════════════ */
  const store={
    get:k=>{ try{ return (localStorage.getItem(k)||'').trim(); }catch(e){ return ''; } },
    set:(k,v)=>{ try{ if(v!=='' && v!=null) localStorage.setItem(k,v); else localStorage.removeItem(k); }catch(e){} }
  };
  const KEY_WURL='rayle_worker_url', KEY_WTOK='rayle_worker_token';
  const KEY_VIT='rayle_vitesse', KEY_REVEIL='rayle_reveil', KEY_BARGE='rayle_interruption', KEY_NOMS='rayle_noms', KEY_MODE='rayle_mode_ecoute', KEY_SUITE='rayle_suite';
  const OLD_KEYS=['rayle_key_groq','rayle_key_openrouter','rayle_key_twelvedata'];   // anciennes clés des versions précédentes

  const prefs={
    vitesse:()=>{ const v=store.get(KEY_VIT); return v==='' ? null : Number(v); },
    reveil:()=>store.get(KEY_REVEIL)!=='0',     // mot d'activation demandé (oui par défaut)
    barge:()=>store.get(KEY_BARGE)==='1',
    mode:()=>store.get(KEY_MODE)||'auto',
    suite:()=>store.get(KEY_SUITE)!=='0'
  };

  /* ═════════════ PERSONNALITÉ CÔTÉ INTERFACE (reçue du Worker) ═════════════ */
  let persona={adresse:'vous',voix:'',feminin:true,vitesse:-8};
  try{ const p=JSON.parse(localStorage.getItem('rayle_persona')||'null'); if(p) persona=Object.assign(persona,p); }catch(e){}
  const fx=(vous,tu)=>persona.adresse==='tu'?tu:vous;
  const fem=(m,f)=>persona.feminin?f:m;
  const vitesseCourante=()=>{ const v=prefs.vitesse(); return (v!=null && isFinite(v)) ? v : (isFinite(persona.vitesse)?persona.vitesse:-8); };
  const pick=a=>a[Math.floor(Math.random()*a.length)];

  /* ═════════════ ÉTAT & JOURNAL ═════════════ */
  const STATES={idle:'MICRO COUPÉ',veille:'VEILLE · DITES « RAYLÉ »',listening:'CONVERSATION',thinking:'ANALYSE',speaking:'TRANSMISSION'};
  function setState(s){ reactor.className='reactor '+s; miniReactor.className='reactor '+s; try{ Entite.etat(s); }catch(e){} let t=STATES[s]||''; try{ if(modeToucher()){ if(s==='idle') t='PRÊTE'; else if(s==='listening') t="J'ÉCOUTE"; } majBouton(); }catch(e){} try{ if(!workerReady()) t="VERROUILLÉ · CODE D'ACCÈS REQUIS (⚙)"; }catch(e){} stateEl.textContent=t; miniEtat.textContent=t; }
  function stamp(){ return new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
  function addLine(kind,text){
    const d=document.createElement('div'); d.className='line '+kind;
    const prefix = kind==='sys' ? '['+stamp()+'] ' : kind==='user' ? 'VOUS › ' : 'RAYLÉ › ';
    d.textContent=prefix+String(text);
    if(kind==='ray'||kind==='user') montrerDansLeCoin(kind,text);
    logEl.appendChild(d); logEl.scrollTop=logEl.scrollHeight;
    while(logEl.children.length>250) logEl.removeChild(logEl.firstChild);
  }
  // Dans la vue terminal, le journal est caché : la dernière phrase s'affiche à côté de la petite Raylé
  let coinTimer=null;
  function montrerDansLeCoin(kind,text){
    try{ sousTitre(kind,text); }catch(e){}
    miniDit.textContent=(kind==='user'?'VOUS › ':'')+String(text).slice(0,220);
    clearTimeout(coinTimer); coinTimer=setTimeout(()=>{ miniDit.textContent=''; },15000);
  }
  const norm=t=>String(t||'').normalize('NFC').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  // Version « commande » : sans ponctuation ni nom de Raylé
  const cmdNorm=n=>String(n||'').replace(/[?!.,;:…«»"]/g,' ').replace(/(?:^|\s)(?:(?:hey|he|eh|ok|okay|dis)\s+)?rayle(?=\s|$)/g,' ').replace(/\s+/g,' ').trim();
