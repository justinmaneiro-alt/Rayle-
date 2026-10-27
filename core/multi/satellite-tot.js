"use strict";
/* ═════════════ FENÊTRE SATELLITE : détection au tout début du chargement (mode multi-écrans) ═════════════
   Une fenêtre ouverte sur un autre écran charge la même page avec ?ecran=<identifiant>. Ce script, chargé avant tous les autres, fixe son rôle :
   - window.RAYLE_SATELLITE = {id} ; la page principale n'en a pas ;
   - le titre de la fenêtre contient « [rayle-sat-<id>] » : c'est ainsi que app-pc/fenetres.ps1 la retrouve (placement, fermeture) ;
   - la reconnaissance vocale est désactivée ici : UNE SEULE fenêtre (la principale) a le micro ;
   - l'accueil (entité, HUD, boutons) est masqué par multi.css et les animations de l'accueil sont en pause (classe vue-terminal, comme dans le terminal). */
(function(){
  const m=/[?&]ecran=([a-z0-9-]{1,40})(?:&|$)/.exec(location.search);
  if(!m) return;
  window.RAYLE_SATELLITE={id:m[1]};
  document.documentElement.classList.add('satellite');
  document.title='Raylé · écran [rayle-sat-'+m[1]+']';
  try{ window.SpeechRecognition=undefined; window.webkitSpeechRecognition=undefined; }catch(e){}
  document.addEventListener('DOMContentLoaded',()=>document.body.classList.add('vue-terminal','satellite'));
})();
