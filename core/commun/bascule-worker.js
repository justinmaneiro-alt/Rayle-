"use strict";
/* ═════════════ BASCULE VRAI WORKER ⇄ MINI-WORKER LOCAL (démonstration) ═════════════
   http://127.0.0.1:8000/?worker=local   : branche la page sur le mini-Worker local (tests-navigateur/worker-local-reel.mjs, port 8796) ;
                                           l'adresse et le jeton du vrai Worker sont d'abord mis de côté (rayle_worker_sauvegarde).
   http://127.0.0.1:8000/?worker=normal  : remet EXACTEMENT l'adresse et le jeton d'avant (une clé absente reste absente), puis efface la sauvegarde.
   Tant que la bascule est active, un petit bandeau « MINI-WORKER LOCAL (démo) » s'affiche (avec le lien de retour). Réservé à la machine locale. Rien ne part vers un serveur. */
(function(){
  const L=location, locale=/^(127\.0\.0\.1|localhost)$/.test(L.hostname);
  const U='rayle_worker_url', T='rayle_worker_token', S='rayle_worker_sauvegarde', ADRESSE_LOCALE='http://127.0.0.1:8796';
  const lire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const ecrire=(k,v)=>{ try{ if(v===null||v===undefined) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} };
  let demande=null; try{ demande=new URLSearchParams(L.search).get('worker'); }catch(e){}
  if(locale && (demande==='local'||demande==='normal')){
    if(demande==='local'){
      if(lire(S)===null) ecrire(S,JSON.stringify({url:lire(U),token:lire(T)}));   // déjà active : on garde la première sauvegarde (le vrai Worker)
      ecrire(U,ADRESSE_LOCALE); ecrire(T,'local');
    }else{
      let s=null; try{ s=JSON.parse(lire(S)); }catch(e){}
      if(s){ ecrire(U,s.url); ecrire(T,s.token); ecrire(S,null); }
    }
    try{   // l'adresse redevient propre : un rechargement ne refait pas la bascule
      const p=new URLSearchParams(L.search); p.delete('worker'); const q=p.toString();
      history.replaceState(null,'',L.pathname+(q?'?'+q:'')+L.hash);
    }catch(e){}
  }
  if(locale && lire(S)!==null && lire(U)===ADRESSE_LOCALE){
    const bandeau=()=>{
      if(document.getElementById('bascule-worker')) return;
      const b=document.createElement('div'); b.id='bascule-worker';
      b.style.cssText='position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:99999;display:flex;gap:10px;align-items:center;padding:3px 12px;font:600 10.5px/1.6 ui-monospace,Consolas,monospace;letter-spacing:.14em;color:#1a1000;background:#ffb347;border-radius:0 0 6px 6px;box-shadow:0 0 12px rgba(255,179,71,.5)';
      b.innerHTML='<span>MINI-WORKER LOCAL (démo)</span><a href="?worker=normal" style="color:#1a1000;font-weight:400;letter-spacing:.04em">revenir à mon Worker</a>';
      document.body.appendChild(b);
    };
    if(document.body) bandeau(); else document.addEventListener('DOMContentLoaded',bandeau);
  }
})();
