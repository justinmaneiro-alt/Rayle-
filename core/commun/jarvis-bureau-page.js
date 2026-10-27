"use strict";
/* Pont classique vers le bureau de l'accueil Jarvis (core/commun/jarvis-bureau.js, module ES chargé à la demande) : window.JarvisBureau, bouton « Bureau » de la barre.
   Actif seulement dans le thème Jarvis et si ⚙ « Utiliser l'ancien système de fenêtres » est décoché. */
(function(){
  if(window.RAYLE_SATELLITE) return;
  const url=()=>new URL('core/commun/jarvis-bureau.js',document.baseURI).href;
  let mod=null; const charger=()=>mod||(mod=import(url()));
  const actif=()=>{ try{ return localStorage.getItem('rayle_fenetres_v1')!=='1'&&document.body.classList.contains('jarvis')&&!document.body.classList.contains('g1'); }catch(e){ return false; } };
  window.JarvisBureau={
    actif,
    ouvrir:async(id,o)=>{ const M=await charger(); return M.bureau().ouvrir(id,o); },
    ouvrirBureau:async()=>{ const M=await charger(); return M.bureau().ouvrirBureau(); },
    toutRanger:async()=>{ const M=await charger(); return M.bureau().toutRanger(); },
    disposer:async m=>{ const M=await charger(); return M.bureau().disposer(m); },
    instance:async()=>{ const M=await charger(); return M.bureau(); }
  };
  const b=document.getElementById('btnBureau');
  if(b) b.addEventListener('click',()=>{ window.JarvisBureau.ouvrirBureau(); });
})();
