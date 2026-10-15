"use strict";
/* Premier toucher : le navigateur exige un geste pour le micro et pour le son. Un simple toucher n'importe où (ni bouton, ni texte) réveille Rayle :
   audio débloqué, micro ouvert, puis écoute en continu (mot d'activation « Rayle »). La reconnaissance se relance toute seule (reconnaissance.js, veillerMicro). */
(function(){
  try{ localStorage.setItem('rayle_mode_ecoute','mainslibres'); }catch(e){}   // écoute continue : jamais « toucher pour parler » (réglé avant base.js)
})();
