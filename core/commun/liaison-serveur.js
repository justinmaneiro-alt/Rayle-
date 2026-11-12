"use strict";
/* ═════════════ LIAISON AVEC LE SERVEUR (téléphone et tablette) ═════════════
   Sur téléphone, « localhost » n'existe pas : l'adresse du backend est celle de la page quand elle vient du PC (réseau local), sinon l'adresse distante configurée.
   Quand rien ne répond, on le dit clairement (« Serveur injoignable » + l'adresse essayée), jamais une vieille copie présentée comme actuelle.
   Pur côté page : ne fait rien sur PC. API : window.LiaisonServeur = { verifier(), etat() }. */
(function(){
  const A=window.RayleAppareil; if(!A||A.estPC()||window.RAYLE_SATELLITE) return;
  const etat={ok:null,adresse:'',raison:'',t:0};
  const adresse=()=>{ try{ const u=(typeof W!=='undefined'&&W&&W.url)?W.url():(window.RAYLE_CONFIG&&window.RAYLE_CONFIG.workerUrl); return String(u||'').replace(/\/+$/,''); }catch(e){ return ''; } };   // W : const du script classique api-keys/worker.js (par son nom, pas window.W)
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function bandeau(){
    let b=document.getElementById('liaison-ko');
    if(etat.ok!==false){ if(b) b.remove(); return; }
    if(!b){ b=document.createElement('div'); b.id='liaison-ko'; b.setAttribute('role','alert'); document.body.appendChild(b); }
    b.innerHTML='<b>Serveur injoignable</b><span>'+esc(etat.adresse||'adresse inconnue')+' — '+esc(etat.raison)+'. Les données en direct sont indisponibles.</span><button type="button" data-a="re">Réessayer</button>';
    b.querySelector('[data-a=re]').onclick=()=>verifier();
  }
  async function verifier(){
    const adr=adresse(); etat.adresse=adr; etat.t=Date.now();
    if(!adr||/^https?:\/\/(localhost|127\.)/.test(adr)&&!/^(localhost|127\.)/.test(location.hostname)){ etat.ok=false; etat.raison='cette adresse (localhost) n’existe pas depuis un téléphone'; bandeau(); return etat; }
    const c=new AbortController(), t=setTimeout(()=>c.abort(),7000);
    try{ await fetch(adr+'/health',{cache:'no-store',signal:c.signal}); etat.ok=true; etat.raison=''; }   // toute réponse HTTP = le serveur est là
    catch(e){ etat.ok=false; etat.raison=e&&e.name==='AbortError'?'pas de réponse en 7 s':'connexion impossible (PC éteint, autre réseau, ou adresse erronée)'; }
    clearTimeout(t); bandeau(); return etat;
  }
  window.LiaisonServeur={verifier,etat:()=>({...etat})};
  const go=()=>{ setTimeout(verifier,1500); setInterval(()=>{ if(!document.hidden) verifier(); },60000); document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&Date.now()-etat.t>15000) verifier(); }); };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',go); else go();
})();
