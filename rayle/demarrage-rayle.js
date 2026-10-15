"use strict";
(function(){
  let fait=false;
  function reveiller(){
    if(fait) return; fait=true;
    ['pointerdown','touchend','click','keydown'].forEach(ev=>document.removeEventListener(ev,reveiller,true));
    try{ startListening(); }catch(e){ console.error('[rayle] écoute',e); fait=false; }
  }
  ['pointerdown','touchend','click','keydown'].forEach(ev=>document.addEventListener(ev,reveiller,true));
  setState('idle');
  window.RayleDemarrage={reveiller,estReveillee:()=>fait};
})();
