"use strict";
/* ═════════════ BUS D'ÉVÉNEMENTS (mémoire de la page, rien dans localStorage) ═════════════
   Raylé et le terminal sont dans la même page : ils se parlent par ici.
   - on / emit      : événements ponctuels (commandes, changements de vue…)
   - etat / fusion  : état partagé, gardé en mémoire (ce que le terminal affiche, ses notes…)
   - fournir / demander : un module propose une fonction, un autre l'appelle (ex. adresse et code du Worker) */
window.RayleBus=(function(){
  const ecouteurs={}, etats={}, services={};
  function on(ev,fn){
    (ecouteurs[ev]=ecouteurs[ev]||[]).push(fn);
    return ()=>{ ecouteurs[ev]=(ecouteurs[ev]||[]).filter(f=>f!==fn); };
  }
  function emit(ev,data){
    (ecouteurs[ev]||[]).slice().forEach(fn=>{ try{ fn(data); }catch(e){ console.error('[bus] '+ev,e); } });
  }
  const etat=nom=>etats[nom]||null;
  function fusion(nom,donnees){
    etats[nom]=Object.assign({},etats[nom]||{},donnees);
    emit('etat:'+nom,etats[nom]);
    return etats[nom];
  }
  function fournir(nom,fn){ services[nom]=fn; }
  function demander(nom,arg){ return services[nom] ? services[nom](arg) : undefined; }
  return {on,emit,etat,fusion,fournir,demander};
})();
