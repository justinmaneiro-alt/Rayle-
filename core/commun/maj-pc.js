"use strict";
/* ═════════════ MISE À JOUR SUR PC ═════════════
   Le PC n'utilise pas de service worker (il est réservé au téléphone et à la tablette) : l'application PC lit les fichiers du dossier par le serveur local,
   toujours revalidés. Mais une fenêtre restée ouverte garde en mémoire l'ancien code. Ici : la page relit index.html (sans cache) à l'ouverture, au retour
   au premier plan et toutes les 5 minutes ; si window.RAYLE_VERSION a changé, un petit message « Nouvelle version disponible, recharger » apparaît.
   Par précaution, un ancien service worker de Raylé enregistré sur ce PC est retiré (avec ses caches « rayle-shell-… »). */
(function(){
  const A=window.RayleAppareil; if(!A||!A.estPC()||window.RAYLE_SATELLITE) return;
  const actuelle=String(window.RAYLE_VERSION||'');
  if('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(l=>{
    for(const r of l) if(/\/sw\.js$/.test((r.active||r.waiting||r.installing||{}).scriptURL||'')) r.unregister();
    if(window.caches) caches.keys().then(k=>k.filter(x=>x.startsWith('rayle-shell-')).forEach(x=>caches.delete(x))).catch(()=>{});
  }).catch(()=>{});
  let montre=false;
  function bandeau(v){
    if(montre) return; montre=true;
    const b=document.createElement('div'); b.id='majPc'; b.setAttribute('role','status');
    b.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147481500;display:flex;gap:10px;align-items:center;padding:8px 10px 8px 14px;background:rgba(12,18,26,.94);border:1px solid rgba(143,208,227,.45);border-radius:6px;color:#d7e3ea;font:13px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5)';
    b.innerHTML='<span>Nouvelle version disponible ('+String(v).replace(/[^0-9.]/g,'')+')</span><button type="button" style="padding:5px 10px;background:#0e1a24;border:1px solid #8fd0e3;border-radius:4px;color:#8fd0e3;font:inherit;cursor:pointer">Recharger</button>';
    b.querySelector('button').onclick=()=>location.reload();
    document.body.appendChild(b);
  }
  async function verifier(){
    try{
      const r=await fetch('index.html',{cache:'no-store'}); if(!r.ok) return;
      const m=/RAYLE_VERSION\s*=\s*'([^']+)'/.exec(await r.text());
      if(m&&actuelle&&m[1]!==actuelle) bandeau(m[1]);
    }catch(e){ /* hors ligne : on réessaiera */ }
  }
  setTimeout(verifier,4000); setInterval(verifier,5*60e3);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) verifier(); });
  window.MajPc={verifier};
})();
