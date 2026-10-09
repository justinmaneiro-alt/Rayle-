"use strict";
  /* ═════════════ CONNEXION AU WORKER ═════════════ */
  const W={ url:()=>store.get(KEY_WURL).replace(/\/+$/,''), token:()=>store.get(KEY_WTOK) };
  const workerReady=()=>!!(W.url() && W.token());
  // Le terminal (même page) réutilise ces réglages, par le bus
  RayleBus.fournir('worker',()=>({url:W.url(),token:W.token()}));
  RayleBus.fournir('worker:code',v=>{ store.set(KEY_WTOK,String(v||'').trim()); });

  let epoch=0;                          // change à chaque coupure : les réponses en cours deviennent « orphelines »
  let cutAbort=new AbortController();   // permet d'interrompre les appels réseau d'une réponse coupée
  async function fetchT(url,opts,ms){
    const c=new AbortController(); const tm=setTimeout(()=>c.abort(),ms);
    const sig=cutAbort.signal, onCut=()=>c.abort();
    sig.addEventListener('abort',onCut);
    try{ return await fetch(url,Object.assign({},opts,{signal:c.signal})); }
    finally{ clearTimeout(tm); sig.removeEventListener('abort',onCut); }
  }
  function wfetch(path,opts,ms){
    const o=Object.assign({},opts||{});
    o.headers=Object.assign({},o.headers||{},{'X-Rayle-Token':W.token()});
    return fetchT(W.url()+path,o,ms||15000);
  }
  async function workerError(res){
    let d='';
    try{
      const j=await res.json();
      d=j.error||j.message||'';
      if(Array.isArray(j.essais) && j.essais.length) d+=' ['+j.essais.join(' | ')+']';
      if(Array.isArray(j.erreurs) && j.erreurs.length) d+=' ['+j.erreurs.join(' | ')+']';
    }catch(e){}
    return new Error('HTTP '+res.status+(d?' · '+String(d).slice(0,400):''));
  }
  function errMsg(e){
    if(e && e.name==='AbortError') return 'délai dépassé ou coupé';
    const m=String((e && e.message) || e);
    if(/HTTP 401/.test(m)) return "code d'accès refusé par le Worker (vérifiez ⚙ Réglages et le secret RAYLE_TOKEN)";
    if(/^HTTP 429/.test(m)) return 'limite atteinte, patientez un instant';
    if(/^HTTP 503 · aucune IA disponible/.test(m)) return 'aucune IA ne répond pour le moment'+(/429/.test(m)?' (limites atteintes)':'')+' — détail : '+m.replace(/^HTTP 503 · aucune IA disponible\s*/,'').slice(0,300);
    if(/HTTP 404 · route inconnue/.test(m)) return "le Worker n'est pas à jour (cette fonction n'existe pas encore chez lui)";
    if(/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Worker injoignable (adresse erronée, pas de réseau, ou site non autorisé)';
    return m;
  }
  const valid=t=>typeof t==='string' && t.trim().length>1 && /[A-Za-zÀ-ÿ0-9]/.test(t);
  async function wjson(path,ms){
    const res=await wfetch(path,{method:'GET'},ms||15000);
    if(!res.ok) throw await workerError(res);
    return res.json();
  }
  // Petit cache côté page pour les données qui bougent peu (contexte, sentiment)
  const pageCache={};
  async function wjsonCache(path,ms,ttl){
    const h=pageCache[path]; if(h && Date.now()-h.t<ttl) return h.v;
    const v=await wjson(path,ms); pageCache[path]={t:Date.now(),v}; return v;
  }
