"use strict";
/* ═════════════ VUES : Raylé (par défaut) et terminal, dans la même page ═════════════
   Le terminal est une vue plein écran (#vueTerminal) chargée à la première ouverture.
   Demandes par le bus : emit('vue:demande',{vue:'terminal'|'rayle'}). Réponse : emit('vue:changee',{vue}). */
(function(){
  const vueEl=()=>document.getElementById('vueTerminal');
  let vue='rayle', module=null, chargement=null, pousse=false;

  function charger(){
    if(module) return Promise.resolve(module);
    if(!chargement) chargement=import(new URL('js/terminal/terminal.js?v=2026.10.10.4',document.baseURI).href).then(m=>{ module=m; return m; }).catch(e=>{ chargement=null; throw e; });
    return chargement;
  }
  async function afficher(v){
    if(v===vue) return;
    if(v==='terminal'){
      let m;
      try{ m=await charger(); }
      catch(e){ RayleBus.emit('vue:erreur',{message:'Terminal impossible à charger : '+(e&&e.message||e)}); return; }
      vue='terminal'; vueEl().hidden=false; document.body.classList.add('vue-terminal');
      m.ouvrir();
    }else{
      vue='rayle'; vueEl().hidden=true; document.body.classList.remove('vue-terminal');
      if(module) module.fermer();
    }
    RayleBus.fusion('terminal',{ouvert:vue==='terminal'});
    RayleBus.emit('vue:changee',{vue});
  }
  function ouvrirTerminal(){
    if(vue==='terminal') return Promise.resolve();
    if(location.hash!=='#terminal'){ try{ history.pushState(null,'','#terminal'); pousse=true; }catch(e){} }
    return afficher('terminal');
  }
  function retour(){
    if(vue!=='terminal') return;
    // On ferme la vue tout de suite (sans attendre popstate, qui n'arrive pas toujours), puis on nettoie l'adresse
    afficher('rayle');
    if(pousse){ pousse=false; if(location.hash==='#terminal'){ try{ history.back(); }catch(e){} } return; }
    try{ history.replaceState(null,'',location.pathname+location.search); }catch(e){}
  }
  window.addEventListener('popstate',()=>afficher(location.hash==='#terminal'?'terminal':'rayle'));
  RayleBus.on('vue:demande',d=>{ if(d&&d.vue==='terminal') ouvrirTerminal(); else retour(); });
  RayleBus.fournir('vue',()=>vue);
  RayleBus.fournir('vue:ouvrir',ouvrirTerminal);
  RayleBus.fournir('vue:fermer',retour);

  document.addEventListener('DOMContentLoaded',()=>{
    const o=document.getElementById('btnOuvrirTerminal'), r=document.getElementById('btnRetour');
    if(o) o.addEventListener('click',ouvrirTerminal);
    if(r) r.addEventListener('click',retour);
    if(location.hash==='#terminal') afficher('terminal');   // ancienne adresse du terminal, ou lien direct
  });
})();
