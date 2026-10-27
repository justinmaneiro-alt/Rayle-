"use strict";
/* Interrupteur ⚙ « Utiliser l'ancien système de fenêtres » (V2) : mémorise rayle_fenetres_v1 = '1' (ancien) ou rien (nouveau). Lu par planetes/mars/pc/index.js au moment d'entrer dans le salon
   (et par l'accueil Jarvis, phase 3). L'ancien code est archivé dans legacy/ (voir legacy/README.md). */
(function(){
  const CLE='rayle_fenetres_v1', c=document.getElementById('kAncienFenetres'); if(!c) return;
  try{ c.checked=localStorage.getItem(CLE)==='1'; }catch(e){}
  c.addEventListener('change',()=>{ try{ if(c.checked) localStorage.setItem(CLE,'1'); else localStorage.removeItem(CLE); }catch(e){} });
})();
