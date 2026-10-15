"use strict";
/* ═════════════ ÉCOUTE NATURELLE ═════════════
   - Fenêtre de suite : après une réponse, elle écoute encore quelques secondes sans qu'on redise « Raylé » (réglable 0 à 20 s, 8 par défaut),
     avec un arc discret autour de l'entité qui se vide. Ensuite, retour en veille (js/rayle/modes.js lit RayleEcoute.fenetreMs()).
   - Lui couper la parole : sur ordinateur, un second flux micro AVEC annulation d'écho repère qu'on parle par-dessus elle
     (voix soutenue ≥ 0,3 s) : sa voix baisse, et la phrase reconnue (si ce n'est pas l'écho de la sienne) l'interrompt.
     Partout : « stop », « coupure » ou « Raylé » pendant qu'elle parle (reconnaissance ouverte pendant sa voix).
   - Dans la fenêtre de suite, on ignore les bruits courts (« euh », « hein », un mot isolé de la télé). Hors fenêtre, son nom reste obligatoire.
   - Double clap (js/rayle/clap.js) : réveille Raylé. Ordinateur : activé par défaut, sur le même flux que l'interruption.
     Téléphone et tablette : option expérimentale, désactivée par défaut ; le flux n'est ouvert QUE quand la reconnaissance vocale
     ne tourne pas (mode « toucher pour parler » au repos), et il se coupe tout seul si la reconnaissance se met en erreur. */
window.RayleEcoute=(function(){
  const lireLS=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const ecrireLS=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
  const CLE={suite:'rayle_ecoute_suite',clap:'rayle_clap',clapSens:'rayle_clap_sensibilite',clapMobile:'rayle_clap_mobile'};
  const mobile=()=>{ try{ return !!IS_MOBILE; }catch(e){ return false; } };

  const R={
    suite:(v=>isFinite(v)&&v>=2&&v<=20?v:8)(parseInt(lireLS(CLE.suite),10)),
    clap:lireLS(CLE.clap)==null ? true : lireLS(CLE.clap)==='1',          // ordinateur
    clapSens:['faible','moyenne','forte'].includes(lireLS(CLE.clapSens)) ? lireLS(CLE.clapSens) : 'moyenne',
    clapMobile:lireLS(CLE.clapMobile)==='1'                                // téléphone, tablette : expérimental
  };
  const fenetreMs=()=>R.suite*1000;
  const clapVoulu=()=>mobile() ? R.clapMobile : R.clap;

  /* ───── fenêtre de suite : est-on dedans, combien de temps reste-t-il ───── */
  function resteFenetre(){
    try{
      if(!micOn || mode!=='conversation' || !reveilActif() || speaking || processing || queue.length) return -1;
      return fenetreMs()-(Date.now()-Math.max(lastAct,dernierSon||0));
    }catch(e){ return -1; }
  }
  // l'arc autour de l'entité (Sphère et Neurones)
  const arc=document.createElement('div'); arc.className='ecoute-suite'; arc.setAttribute('aria-hidden','true');
  const reacteur=document.getElementById('reactor'); if(reacteur) reacteur.appendChild(arc);
  let arcVu=false;
  setInterval(()=>{
    const r=resteFenetre(), voir=r>0 && R.suite>0;
    if(voir){ arc.style.setProperty('--suite',Math.max(0,Math.min(1,r/fenetreMs())).toFixed(3)); }
    if(voir!==arcVu){ arcVu=voir; arc.classList.toggle('vu',voir); }
  },120);

  /* ───── bruits courts dans la fenêtre de suite ───── */
  const BRUITS=/^(?:euh+|heu+|hum+|hm+|mm+|mh+|ah+|oh+|eh+|bah|ben|hein|bon|ouais ouais|la la|hop|tiens|quoi|allo)$/;
  function ignorer(texte){
    // seulement dans la fenêtre de suite (hors fenêtre, le nom « Raylé » fait déjà le tri)
    try{ if(!(micOn && mode==='conversation' && reveilActif())) return false; }catch(e){ return false; }
    const n=cmdNorm(norm(texte)).replace(/[^a-z0-9' ]/g,' ').replace(/\s+/g,' ').trim();
    if(n.replace(/[^a-z0-9]/g,'').length<2) return true;
    return BRUITS.test(n);
  }

  /* ───── flux micro avec annulation d'écho : interruption à la voix (ordinateur) et double clap ───── */
  let flux=null, actx=null, proc=null, analyseVoix=null, tamponVoix=null, ouverture=null, refus=false, ouvertA=0;
  let detecteur=window.RayleClap ? RayleClap.creer({sensibilite:R.clapSens}) : null;
  let echo=.004, compteur=0, voixJusqua=0, volumeBaisse=false, retablir=0;
  async function ouvrir(){
    if(flux || ouverture || refus) return;
    ouverture=(async()=>{
      try{
        const f=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:false,autoGainControl:false}});
        const AC=window.AudioContext||window.webkitAudioContext;
        const c=new AC(); if(c.state==='suspended') await c.resume().catch(()=>{});
        const src=c.createMediaStreamSource(f);
        // chemin « clap » : passe-haut, analyse bloc par bloc
        const hp=c.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1200;
        const p=c.createScriptProcessor(512,1,1);
        // chemin « voix » : bande de la parole
        const bp1=c.createBiquadFilter(); bp1.type='highpass'; bp1.frequency.value=250;
        const bp2=c.createBiquadFilter(); bp2.type='lowpass'; bp2.frequency.value=3400;
        const an=c.createAnalyser(); an.fftSize=512;
        const muet=c.createGain(); muet.gain.value=0;
        src.connect(hp); hp.connect(p); p.connect(muet); muet.connect(c.destination);
        src.connect(bp1); bp1.connect(bp2); bp2.connect(an);
        p.onaudioprocess=e=>traiter(e.inputBuffer.getChannelData(0),c.currentTime*1000);
        flux=f; actx=c; proc=p; analyseVoix=an; tamponVoix=new Float32Array(an.fftSize); ouvertA=Date.now();
      }catch(e){ refus=true; console.warn('[écoute] micro supplémentaire indisponible :',e&&e.message||e); }
      finally{ ouverture=null; }
    })();
    return ouverture;
  }
  function fermer(){
    if(proc){ try{ proc.onaudioprocess=null; proc.disconnect(); }catch(e){} proc=null; }
    if(flux){ flux.getTracks().forEach(t=>t.stop()); flux=null; }
    if(actx){ actx.close().catch(()=>{}); actx=null; }
    analyseVoix=null; compteur=0; retablirVolume();
  }
  function traiter(bloc,t){
    // double clap (jamais pendant qu'elle parle : sa propre voix peut faire des pics)
    let parle=false; try{ parle=speaking; }catch(e){}
    if(detecteur && clapVoulu() && !parle && detecteur.bloc(bloc,t)) setTimeout(doubleClap,0);
    // voix par-dessus la sienne (ordinateur)
    if(!parle || mobile() || !analyseVoix){ compteur=0; return; }
    analyseVoix.getFloatTimeDomainData(tamponVoix);
    let s=0; for(let i=0;i<tamponVoix.length;i++) s+=tamponVoix[i]*tamponVoix[i];
    const rms=Math.sqrt(s/tamponVoix.length);
    // reste d'écho après annulation : on le suit quand il est bas, il ne monte pas avec la voix de Justin
    if(rms<echo*1.5) echo+=(rms-echo)*.05; else echo+=(rms-echo)*.002;
    if(echo<.002) echo=.002;
    if(rms>Math.max(.012,echo*2.4)) compteur++; else compteur=Math.max(0,compteur-1);
    if(compteur>=28){                                    // ≈ 0,3 s de voix soutenue
      compteur=0; voixJusqua=Date.now()+2500;
      baisserVolume();
    }
  }
  function baisserVolume(){
    try{ if(!volumeBaisse){ volumeBaisse=true; audioEl.volume=.3; } }catch(e){}
    clearTimeout(retablir); retablir=setTimeout(retablirVolume,2500);
  }
  function retablirVolume(){ clearTimeout(retablir); try{ if(volumeBaisse){ volumeBaisse=false; audioEl.volume=1; } }catch(e){} }

  // Phrase reconnue pendant qu'elle parle : est-ce Justin qui lui coupe la parole ? (appelée par reconnaissance.js)
  function peutInterrompre(fin){
    if(mobile() || Date.now()>voixJusqua) return false;
    const n=norm(fin);
    if(echoTail(n)) return false;                                     // c'est l'écho de sa propre phrase
    return cmdNorm(n).split(' ').filter(w=>w.length>1).length>=2;
  }

  // Quand faut-il le flux ? Ordinateur : micro actif (clap, interruption). Mobile expérimental : seulement quand la reconnaissance dort.
  let erreursRec=0;
  setInterval(()=>{
    let veut=false;
    try{
      if(document.hidden || !navigator.mediaDevices){ veut=false; }
      else if(!mobile()) veut=micOn && (R.clap || bargeActive());
      else veut=R.clapMobile && modeToucher() && !micOn && !recActif;
    }catch(e){ veut=false; }
    if(veut) ouvrir(); else if(flux) fermer();
  },400);
  // Sécurité mobile : si la reconnaissance se met en erreur peu après l'ouverture du flux, on désactive le clap
  RayleBus.on('rec:erreur',err=>{
    if(!mobile() || !R.clapMobile) return;
    if(!/audio-capture|not-allowed|aborted/.test(String(err))) return;
    if(Date.now()-ouvertA>60000 && ++erreursRec<2) return;
    fermer(); changer('clapMobile',false);
    try{ addLine('sys','Double clap désactivé : il gênait la reconnaissance vocale sur cet appareil.'); }catch(e){}
  });

  function doubleClap(){
    try{
      if(speaking || processing) return;
      addLine('sys','Double clap détecté');
      if(mobile()){ if(modeToucher() && !micOn){ fermer(); setTimeout(ouvrirEcoute,250); } return; }
      if(!micOn) return;                                   // micro coupé : le clap ne réveille pas (il faut le micro actif)
      if(mode==='veille' && reveilActif()){ enterConversation(); ack(); }
      else{ lastAct=Date.now(); }
    }catch(e){ console.warn('[clap]',e); }
  }

  /* ───── réglages (section « Écoute naturelle » des Réglages) ───── */
  function changer(k,v){
    R[k]=v;
    ecrireLS(CLE[k],typeof v==='boolean'?(v?'1':'0'):String(v));
    if(k==='clapSens' && detecteur) detecteur.sensibilite(v);
    if(k==='clapMobile' && v) refus=false;
    if(k==='clap' && v) refus=false;
    majUI();
  }
  let ui=null;
  function monterUI(){
    const cfg=document.getElementById('cfg'); if(!cfg) return;
    const tests=Array.from(cfg.querySelectorAll('h3')).find(h=>/^Tests/.test(h.textContent));
    const h=document.createElement('h3'); h.textContent='Écoute naturelle';
    ui=document.createElement('div'); ui.className='ecoute-reglages';
    ui.innerHTML=
      '<label for="kSuite2">Écoute après sa réponse, sans redire « Raylé » : <b id="kSuiteVal"></b></label>'
      +'<input id="kSuite2" type="range" min="2" max="20" step="1">'
      +'<label class="chk"><input type="checkbox" id="kClap"> <span id="kClapTxt"></span></label>'
      +'<label for="kClapSens">Sensibilité du double clap</label>'
      +'<select id="kClapSens"><option value="faible">Faible (claps francs seulement)</option><option value="moyenne">Moyenne</option><option value="forte">Forte (pièce calme)</option></select>'
      +'<div class="hint" id="kClapInfo"></div>';
    (tests?tests:cfg.lastElementChild).before(h,ui);
    const s=ui.querySelector('#kSuite2'), c=ui.querySelector('#kClap'), se=ui.querySelector('#kClapSens');
    s.addEventListener('input',()=>changer('suite',parseInt(s.value,10)||0));
    c.addEventListener('change',()=>changer(mobile()?'clapMobile':'clap',c.checked));
    se.addEventListener('change',()=>changer('clapSens',se.value));
    document.getElementById('gear').addEventListener('click',majUI);
    majUI();
  }
  function majUI(){
    if(!ui) return;
    ui.querySelector('#kSuite2').value=String(R.suite);
    ui.querySelector('#kSuiteVal').textContent=R.suite? R.suite+' s' : 'désactivée';
    ui.querySelector('#kClap').checked=mobile()?R.clapMobile:R.clap;
    ui.querySelector('#kClapTxt').textContent=mobile()
      ? 'Double clap pour la réveiller (EXPÉRIMENTAL sur téléphone et tablette)'
      : 'Double clap pour la réveiller (micro actif)';
    ui.querySelector('#kClapSens').value=R.clapSens;
    ui.querySelector('#kClapInfo').textContent=mobile()
      ? 'Sur téléphone, le clap ne marche qu’en mode « toucher pour parler », quand elle n’écoute pas encore : deux claps ouvrent l’écoute. Il se désactive tout seul s’il gêne la reconnaissance vocale.'
      : 'Deux claps secs, à moins d’une demi-seconde d’écart, la réveillent quand elle est en veille. Pour lui couper la parole, parle simplement par-dessus elle (option « Pouvoir la couper à la voix » ci-dessus).';
  }
  try{ monterUI(); }catch(e){ console.warn('[écoute] réglages',e); }

  return {fenetreMs,resteFenetre,ignorer,peutInterrompre,reglages:()=>Object.assign({},R),
    // pour les tests : simule un double clap ou une voix par-dessus la sienne
    _test:{doubleClap,voix(){ voixJusqua=Date.now()+2500; baisserVolume(); },etat:()=>({flux:!!flux,echo,volumeBaisse,clap:detecteur&&detecteur.etat()})}};
})();
