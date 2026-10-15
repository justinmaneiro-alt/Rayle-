"use strict";
/* Remplaçant minimal de l'ancien ui/settings.js + ui/background.js : l'entité n'a besoin que de ces quelques fonctions.
   Entité « Neurones » par défaut (le visuel choisi de Rayle), thème Univers, aucun fond animé propre (l'Univers est derrière). */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  const lire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const mobile=(function(){ try{ return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)||matchMedia('(pointer:coarse)').matches; }catch(e){ return false; } })();
  const entite=lire('rayle_ui_entite')==='sphere'?'sphere':'neurones';
  UI.three=()=>import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js');
  UI.reglages=()=>({theme:'originel',fond:'aucun',anim:'auto',ultra:false,palier:mobile?1:0,micro:!mobile,mobile,entite,taille:100,contraste:60,ecoForce:false,appareil:{}});
})();
