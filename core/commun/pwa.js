"use strict";
/* ═════════════ APPLICATION INSTALLABLE (PWA) : service worker, mise à jour, installation ═════════════
   · enregistre sw.js sur https ou localhost (jamais en file://, jamais avec ?sw=0 ni dans l'application PC Windows qui a son propre serveur)
   · quand une nouvelle version attend : bannière « Nouvelle version disponible — Actualiser » ; au clic le service worker prend la main et la page se recharge
   · bouton « Installer l'application » dans ⚙ quand le navigateur le propose (événement beforeinstallprompt) ; sinon l'aide dit où trouver « Installer / Ajouter à l'écran d'accueil »
   · état exposé : window.Pwa.etat() → { actif, version, hors_ligne, installable, miseAJour } */
(function(){
  const etat={actif:false,version:null,miseAJour:false,installable:false,erreur:null};
  let reg=null, invite=null;
  const sur=()=>location.protocol==='https:'||/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const desactive=()=>/[?&]sw=0\b/.test(location.search)||!!window.RAYLE_SATELLITE;

  function bandeau(){
    if(document.getElementById('pwa-maj')||document.getElementById('majPc')) return;
    const b=document.createElement('div'); b.id='pwa-maj'; b.setAttribute('role','status');
    b.innerHTML='<span>Nouvelle version disponible</span><button type="button" id="pwa-maj-ok">Actualiser</button><button type="button" id="pwa-maj-non" aria-label="Plus tard">✕</button>';
    document.body.appendChild(b);
    document.getElementById('pwa-maj-ok').addEventListener('click',()=>{ const w=reg&&reg.waiting; if(w) w.postMessage({type:'SKIP_WAITING'}); else location.reload(); });
    document.getElementById('pwa-maj-non').addEventListener('click',()=>b.remove());
  }
  function surveiller(r){
    const verifier=()=>{ if(r.waiting&&navigator.serviceWorker.controller){ etat.miseAJour=true; bandeau(); } };
    verifier();
    r.addEventListener('updatefound',()=>{ const n=r.installing; if(n) n.addEventListener('statechange',()=>{ if(n.state==='installed') verifier(); }); });
  }
  async function demarrer(){
    if(!('serviceWorker' in navigator)||!sur()||desactive()) return;
    try{
      reg=await navigator.serviceWorker.register('sw.js',{scope:'./'}); etat.actif=true; surveiller(reg);
      let rechargee=false; navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(rechargee) return; rechargee=true; location.reload(); });
      navigator.serviceWorker.addEventListener('message',e=>{ if(e.data&&e.data.type==='VERSION') etat.version=e.data.version; });
      navigator.serviceWorker.ready.then(r=>{ if(r.active) r.active.postMessage({type:'VERSION'}); });
      setInterval(()=>{ try{ reg.update(); }catch(e){} },30*60*1000);   // une vérification toutes les 30 minutes
      document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ try{ reg.update(); }catch(e){} } });
    }catch(e){ etat.erreur=String((e&&e.message)||e); }
  }
  window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); invite=e; etat.installable=true; const b=document.getElementById('btnInstaller'); if(b) b.hidden=false; });
  window.addEventListener('appinstalled',()=>{ invite=null; etat.installable=false; const b=document.getElementById('btnInstaller'); if(b) b.hidden=true; });
  async function installer(){ if(!invite) return false; invite.prompt(); try{ await invite.userChoice; }catch(e){} invite=null; return true; }
  window.Pwa={etat:()=>({...etat,hors_ligne:!navigator.onLine,version_page:window.RAYLE_VERSION||null}),installer,verifier:()=>reg&&reg.update()};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{ const b=document.getElementById('btnInstaller'); if(b) b.addEventListener('click',installer); demarrer(); });
  else{ const b=document.getElementById('btnInstaller'); if(b) b.addEventListener('click',installer); demarrer(); }
})();
