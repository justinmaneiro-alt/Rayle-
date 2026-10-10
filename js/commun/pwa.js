"use strict";
/* ═════════════ APPLICATION INSTALLABLE (PWA) : service worker, mise à jour, installation, écran allumé ═════════════
   Script classique : utilise store, $, addLine (js/rayle/base.js), donc chargé après lui. */
(function(){
  const VERSION=window.RAYLE_VERSION||'dev';
  const KEY_ECRAN='rayle_ecran_allume';                     // '0' = l'écran peut s'éteindre
  const enAppli=()=>{ try{ return matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true; }catch(e){ return false; } };

  /* ── Message « nouvelle version » ── */
  let banniere=null;
  function proposerMiseAJour(nouvelle){
    if(banniere) return;
    banniere=document.createElement('div'); banniere.className='maj-banniere'; banniere.setAttribute('role','status');
    const t=document.createElement('span'); t.textContent='Nouvelle version de Raylé'+(nouvelle?' ('+nouvelle+')':'')+' disponible.';
    const b=document.createElement('button'); b.type='button'; b.textContent='Mettre à jour';
    b.addEventListener('click',()=>location.reload());
    const x=document.createElement('button'); x.type='button'; x.className='ghost'; x.textContent='Plus tard';
    x.addEventListener('click',()=>{ banniere.remove(); banniere=null; });
    banniere.append(t,b,x); document.body.appendChild(banniere);
  }
  // Compare la version affichée à celle de index.html sur le serveur (toujours demandée sans cache)
  async function versionServeur(){
    const r=await fetch('index.html?_='+Date.now(),{cache:'no-store'});
    if(!r.ok) throw new Error('http '+r.status);
    const m=(await r.text()).match(/RAYLE_VERSION='([^']+)'/);
    return m?m[1]:null;
  }
  let verifEnCours=false;
  async function verifierVersion(){
    if(verifEnCours||!navigator.onLine||VERSION==='dev') return; verifEnCours=true;
    try{ const v=await versionServeur(); if(v && v!==VERSION) proposerMiseAJour(v); }catch(e){} finally{ verifEnCours=false; }
  }

  /* ── Service worker ── */
  if('serviceWorker' in navigator && location.protocol.startsWith('http')){
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register('sw.js?v='+encodeURIComponent(VERSION)).then(reg=>{ try{ reg.update(); }catch(e){} }).catch(()=>{});
      setTimeout(verifierVersion,4000);
    });
    setInterval(verifierVersion,30*60*1000);
  }
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') verifierVersion(); });

  /* ── Installation ── */
  let invite=null;
  const btnInstall=$('cfgInstaller'), infoInstall=$('installInfo');
  function majInstall(){
    if(!btnInstall) return;
    if(enAppli()){ btnInstall.hidden=true; infoInstall.textContent="Raylé est installée sur cet appareil (elle s'ouvre déjà sans barre de navigateur)."; return; }
    btnInstall.hidden=!invite;
    infoInstall.textContent=invite?"Installer Raylé : icône sur l'écran d'accueil et ouverture en plein écran.":"Pour l'installer : menu ⋮ de Chrome, puis « Installer l'application » (ou « Ajouter à l'écran d'accueil »).";
  }
  window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); invite=e; majInstall(); });
  window.addEventListener('appinstalled',()=>{ invite=null; majInstall(); try{ addLine('sys','Raylé est installée.'); }catch(e){} });
  if(btnInstall) btnInstall.addEventListener('click',async()=>{ if(!invite) return; invite.prompt(); try{ await invite.userChoice; }catch(e){} invite=null; majInstall(); });
  const btnMaj=$('cfgMaj');
  if(btnMaj) btnMaj.addEventListener('click',async()=>{
    const msg=$('cfgMsg'); msg.textContent="Recherche d'une nouvelle version…";
    try{
      const v=await versionServeur();
      if(v && v!==VERSION){ msg.textContent='Nouvelle version '+v+' trouvée (vous avez '+VERSION+').'; proposerMiseAJour(v); }
      else msg.textContent='✔ Raylé est à jour (version '+VERSION+').';
    }catch(e){ msg.textContent='✖ Impossible de vérifier (hors ligne ?).'; }
  });
  majInstall();

  /* ── Écran maintenu allumé (Wake Lock) ── */
  const ecranVoulu=()=>store.get(KEY_ECRAN)!=='0';
  let verrou=null;
  async function garderEcran(){
    if(!('wakeLock' in navigator)) return;
    try{
      if(ecranVoulu() && document.visibilityState==='visible'){
        if(verrou) return;
        verrou=await navigator.wakeLock.request('screen');
        verrou.addEventListener('release',()=>{ verrou=null; });
      }else if(verrou){ await verrou.release(); verrou=null; }
    }catch(e){ verrou=null; }                               // refusé (économie d'énergie…) : sans gravité
  }
  document.addEventListener('visibilitychange',garderEcran);
  document.addEventListener('pointerdown',()=>{ if(!verrou) garderEcran(); },{passive:true});   // certains appareils exigent un geste
  const kEcran=$('kEcran');
  if(kEcran){
    kEcran.checked=ecranVoulu();
    if(!('wakeLock' in navigator)){ kEcran.disabled=true; kEcran.parentElement.append(' (non géré par ce navigateur)'); }
    kEcran.addEventListener('change',()=>{ store.set(KEY_ECRAN,kEcran.checked?'':'0'); garderEcran(); addLine('sys',kEcran.checked?'Écran maintenu allumé.':"L'écran peut maintenant s'éteindre tout seul."); });
  }
  garderEcran();
})();
