"use strict";
/* Réveil par le premier toucher + petit point d'état près de l'entité : gris = attend un toucher, vert = le micro écoute, rouge = micro refusé / indisponible / erreur. */
(function(){
  const point=document.createElement('div');
  point.id='pointEtat'; point.setAttribute('aria-hidden','true');
  document.body.appendChild(point);
  let etat='attente', cause='';
  function montrer(e,c){ etat=e; cause=c||''; point.className='etat-'+e; point.title=cause; window.RAYLE_ETAT={etat,cause}; }
  montrer('attente','en attente d’un toucher');

  let fait=false;
  const EV=['pointerdown','touchend','click','keydown'];
  function reveiller(){
    if(fait) return; fait=true;
    EV.forEach(ev=>document.removeEventListener(ev,reveiller,true));
    if(typeof SR==='undefined' || !SR){ montrer('erreur','reconnaissance vocale indisponible sur ce navigateur (utiliser Chrome)'); return; }
    try{ startListening(); }catch(e){ console.error('[rayle] écoute',e); montrer('erreur','démarrage : '+(e&&e.message||e)); }
  }
  EV.forEach(ev=>document.addEventListener(ev,reveiller,true));
  try{ setState('idle'); }catch(e){}

  // erreurs de la reconnaissance (micro refusé, réseau…)
  RayleBus.on('rec:erreur',err=>{
    if(err==='not-allowed'||err==='service-not-allowed') montrer('erreur','micro refusé : autoriser le micro pour ce site');
    else if(err==='audio-capture') montrer('erreur','aucun micro détecté');
    else if(err==='network') montrer('erreur','reconnaissance vocale : réseau indisponible');
  });
  // vert dès que la reconnaissance tourne vraiment ; sinon on le dit
  let depuisSansEcoute=0;
  setInterval(()=>{
    if(!fait) return;
    if(typeof recActif!=='undefined' && recActif) depuisSansEcoute=0;
    if(etat==='erreur' && /refus|indispon|aucun micro/.test(cause)) return;
    if(typeof micOn!=='undefined' && micOn && typeof recActif!=='undefined' && recActif) montrer('ecoute','le micro écoute');
    else if(typeof micOn!=='undefined' && micOn){ if(!depuisSansEcoute) depuisSansEcoute=Date.now(); if(Date.now()-depuisSansEcoute>8000) montrer('erreur','la reconnaissance vocale ne démarre pas'); else montrer('attente','micro en (re)démarrage'); }
    else if(etat==='ecoute') montrer('attente','micro coupé');
  },700);
  window.RayleDemarrage={reveiller,estReveillee:()=>fait};
})();
