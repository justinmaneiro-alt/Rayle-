"use strict";
/* ═════════════ APPLICATION INSTALLABLE ET MISES À JOUR FIABLES (V8 ; téléphone et tablette seulement) ═════════════
   Enregistre le service worker (sw.js) : l'application s'ouvre vite, marche en lecture hors ligne et reçoit TOUJOURS la dernière version sans vider le cache à la main :
   la page vérifie une nouvelle version à l'ouverture, au retour au premier plan et toutes les 30 minutes ; quand une nouvelle version est prête, la bannière « Nouvelle version disponible — Actualiser »
   apparaît ; au toucher, la page se recharge sur la nouvelle version (jamais de rechargement surprise). Sur PC rien n'est enregistré. Seulement en HTTPS ou sur localhost. */
(function(){
  const A=window.RayleAppareil, C=window.MobileCalcul; if(!A||A.estPC()||!C||!('serviceWorker' in navigator)) return;
  try{ if(localStorage.getItem('rayle_m_sw')==='0') return; }catch(e){}      // réglage de secours (tests, dépannage) : pas de service worker
  if(!(location.protocol==='https:'||/^(localhost|127\.0\.0\.1)$/.test(location.hostname))) return;
  let reg=null, recharge=false;
  const proposer=()=>{ if(window.MobileCoque&&MobileCoque.bannièreMaj) MobileCoque.bannièreMaj('Nouvelle version disponible.',()=>{ if(reg&&reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'}); else location.reload(); }); window.__mMajPrete=true; };
  navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(recharge) return; recharge=true; location.reload(); });
  const demarrer=async()=>{
    try{
      reg=await navigator.serviceWorker.register('sw.js',{scope:'./'});
      if(reg.waiting&&navigator.serviceWorker.controller) proposer();
      reg.addEventListener('updatefound',()=>{ const n=reg.installing; if(!n) return; n.addEventListener('statechange',()=>{ if(n.state==='installed'&&navigator.serviceWorker.controller) proposer(); }); });
      const verifier=()=>{ if(reg&&!document.hidden&&navigator.onLine!==false) reg.update().catch(()=>{}); };
      document.addEventListener('visibilitychange',verifier); setInterval(verifier,30*60e3); window.MobileMaj={verifier,etat:()=>({enregistre:!!reg,attend:!!(reg&&reg.waiting)}),version:()=>window.RAYLE_VERSION};
    }catch(e){ /* HTTPS refusé ou navigation privée : l'application marche sans service worker */ }
  };
  if(document.readyState==='complete') demarrer(); else window.addEventListener('load',demarrer);   // ce module arrive souvent APRÈS l'événement load
})();
