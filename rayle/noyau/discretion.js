"use strict";
/* ═════════════ RAYLÉ SE FAIT DISCRÈTE : l'entité laisse la place au contenu affiché ═════════════
   Quand une planète (Espace), un modèle 3D (aperçu Anatomie) ou un panneau (image, fenêtre, carte…) s'affiche pendant qu'elle répond,
   body.rayle-discrete réduit l'entité en une petite bulle dans le coin (css/hud.css). Elle continue de parler et reste touchable.
   Elle revient seule : affichage fermé (ou planète quittée), ou réponse finie (≈1,5 s après la fin de la voix).
   Quelques secondes de maintien à l'ouverture évitent le clignotement si l'affichage précède la voix. Bus : 'rayle:discrete' {actif}. */
(function(){
  const MAINTIEN=3000, RETOUR=1500;
  const reactor=document.getElementById('reactor');
  if(!reactor) return;
  let affiche=false, jusqua=0, derniere=0, actif=false;

  const planete=()=>{ const e=(RayleBus.etat&&RayleBus.etat('espace'))||{}; return !!e.focusedTarget && e.focusedTarget!==e.savedHomeLocation; };
  const modele=()=>{ const q=document.getElementById('anQuick'); return !!q && !q.hidden && !q.classList.contains('hud-out'); };
  const panneau=()=>!!document.querySelector('#panneaux .pn:not(.hud-out):not([data-type="securite"])');
  const enReponse=()=>reactor.classList.contains('speaking') || reactor.classList.contains('thinking');

  function maj(){
    const t=Date.now();
    const vu=planete() || modele() || panneau();
    if(vu && !affiche) jusqua=t+MAINTIEN;
    affiche=vu;
    if(enReponse()) derniere=t;
    const veut=affiche && (enReponse() || t<jusqua || t-derniere<RETOUR);
    if(veut!==actif){
      actif=veut; document.body.classList.toggle('rayle-discrete',actif);
      try{ RayleBus.emit('rayle:discrete',{actif}); }catch(e){}
    }
  }
  setInterval(maj,250);
  ['etat:espace','etat:panneaux','vue:changee'].forEach(n=>{ try{ RayleBus.on(n,maj); }catch(e){} });
  try{ new MutationObserver(maj).observe(reactor,{attributes:true,attributeFilter:['class']}); }catch(e){}
  maj();
})();
