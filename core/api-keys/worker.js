"use strict";
  /* ═════════════ CONNEXION AU WORKER ═════════════ */
  const W={ url:()=>(store.get(KEY_WURL)||(window.RAYLE_CONFIG&&window.RAYLE_CONFIG.workerUrl)||'').replace(/\/+$/,''), token:()=>store.get(KEY_WDEV)||store.get(KEY_WTOK) };   // jeton d'appareil (appairé) si présent, sinon code d'accès
  const workerReady=()=>!!(W.url() && (W.token() || (window.RAYLE_CONFIG && window.RAYLE_CONFIG.sansJeton)));   // en local le backend embarque n'exige pas de jeton
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
  async function wfetch(path,opts,ms){
    const o=Object.assign({},opts||{});
    const jeton=W.token();
    if(jeton) o.headers=Object.assign({},o.headers||{},{'X-Rayle-Token':jeton});
    let res; try{ res=await fetchT(W.url()+path,o,ms||15000); }catch(e){ if(e&&e.name==='AbortError') throw e; throw new Error((await diagnostiquerWorker()).message); }
    if(res.status===401 && jeton && jeton===store.get(KEY_WDEV)){   // appareil révoqué : on l'oublie, le code d'accès reprend la main
      store.set(KEY_WDEV,''); store.set(KEY_WDEVNOM,'');
      try{ addLine('sys',"Cet appareil n'est plus appairé (révoqué). Appairez-le de nouveau dans ⚙ Réglages."); }catch(e){}
    }
    return res;
  }
  /* Diagnostic précis d'une panne du Worker : on sonde /health (ouvert à toutes les origines) et on dit LAQUELLE des causes est la bonne. Résultat gardé 20 s. */
  let diagCache=null;
  async function diagnostiquerWorker(force){
    if(!force&&diagCache&&Date.now()-diagCache.t<20000) return diagCache.v;
    const base=W.url(), origine=location.origin; let v;
    if(!base) v={cause:'adresse',message:'Aucune adresse de Worker configurée (config.js ou ⚙ Réglages).'};
    else{
      try{
        const c=new AbortController(), tm=setTimeout(()=>c.abort(),8000);
        const r=await fetch(base+'/health',{cache:'no-store',signal:c.signal}); clearTimeout(tm);
        const texte=await r.text(); let j=null; try{ j=JSON.parse(texte); }catch(e){}
        if(r.ok&&j&&j.service==='rayle') v={cause:'cors',message:'Le Worker '+base+' répond (version '+(j.version||'?')+') mais refuse l’origine '+origine+' pour les données : ajoutez-la à la variable ORIGINE du Worker.',health:j};
        else if(r.status===404||/<html/i.test(texte)) v={cause:'pas-le-backend',message:'L’adresse '+base+' répond '+r.status+' mais ce n’est pas le backend Raylé (/health absent : un site statique ou un ancien Worker est déployé à cette adresse). Il faut redéployer le Worker (DEPLOIEMENT.md).'};
        else v={cause:'http',message:'Le Worker '+base+' répond HTTP '+r.status+' sur /health.'};
      }catch(e){
        if(e&&e.name==='AbortError') v={cause:'delai',message:'Le Worker '+base+' ne répond pas (délai de 8 s dépassé).'};
        else{
          let atteint=false; try{ await fetch(base+'/health',{mode:'no-cors',cache:'no-store'}); atteint=true; }catch(x){}   // une réponse « opaque » prouve que le serveur est joignable
          v=atteint?{cause:'sans-cors',message:'Le serveur '+base+' répond, mais sans autorisation CORS pour '+origine+' : soit ce n’est pas le backend Raylé (site statique ou ancien Worker à cette adresse), soit cette origine n’est pas dans la variable ORIGINE. Voir DEPLOIEMENT.md.'}:{cause:'reseau',message:'Impossible de joindre '+base+' : pas de réseau, nom de domaine introuvable, ou Worker supprimé.'};
        }
      }
    }
    diagCache={t:Date.now(),v}; return v;
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
    if(/Source «/.test(m)) return m.replace(/^HTTP \d+ · /,'');
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
