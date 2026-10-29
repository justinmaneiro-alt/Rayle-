"use strict";
/* ═════════════ HÔTE DE MODULES SANS GALAXIE (V7b : téléphone et tablette) ═════════════
   Certains modules (la carte légère de la Terre) n'ont besoin de la galaxie que pour s'afficher en plein écran. Sur téléphone et tablette, la galaxie n'existe pas : cet hôte leur donne un plein écran à eux
   et la même petite interface « G » (sélection, délégation des gestes, retour), sans charger la galaxie ni three.js. Fermer = retour à Jarvis. */
(function(){
  let hote=null, module_=null;
  function creer(){
    const el=document.createElement('div'); el.id='hoteModules'; el.className='hote-modules'; el.hidden=true; document.body.appendChild(el); return el;
  }
  async function ouvrirTerre(options={}){
    if(!hote) hote=creer();
    hote.hidden=false; document.body.classList.add('hote-ouvert');
    const G={hote:true,racine:hote,surcharger(){},nav:{selectionner(){},deleguer(){},fermerSas(){ fermer(); }}};
    module_=await import(new URL('planetes/terre/leger/index.js',document.baseURI).href);
    await module_.entrer(G,{rapide:true,...options});
    return window.Terre;
  }
  async function fermer(){
    if(module_&&module_.sortir){ try{ await module_.sortir(); }catch(e){} }
    if(hote){ hote.hidden=true; } document.body.classList.remove('hote-ouvert');
    RayleBus.emit('hote:ferme',{});
  }
  window.HoteModules={ouvrirTerre,fermer,ouvert:()=>!!hote&&!hote.hidden};
})();
