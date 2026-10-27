"use strict";
/* ═════════════ ACCUEIL SOBRE : ÉTAT, MODE ET MESURES (V1) ═════════════
   L'ancien décor de l'accueil (anneaux, échelles graduées, coins, colonnes de données, radar, hexagones, flux, compteurs, objets en orbite) est SUPPRIMÉ :
   il ne servait à rien. Ce script garde ce qui a une fonction :
   · body.jarvis, body[data-etat] (idle · veille · listening · thinking · speaking) : couleur de l'état de Raylé (jarvis.css) ;
   · body.alerte-hud : alerte de prix ou du Veilleur (couleur orange, quelques secondes) ;
   · body[data-hud] (complet · normal · leger) : le mode de l'entité, lu chaque seconde ; il règle le tableau de bord (tableau-bord.js) ;
   · --barre-h : hauteur réelle de la barre de boutons (les fenêtres de réponse et le tableau de bord s'arrêtent au-dessus).
   L'heure, les voyants (micro, liaison, mode, images/s) et la version sont dans le tableau de bord (tableau-bord.js). */
(function(){
  const $=id=>document.getElementById(id);
  const scene=$('scene'), reactor=$('reactor');
  if(!scene||!reactor) return;
  const corps=document.body;
  corps.classList.add('jarvis');
  corps.dataset.hud='normal';

  let etat='idle';
  const poserEtat=e=>{ etat=e||'idle'; corps.dataset.etat=etat; };
  poserEtat('idle');
  RayleBus.on('etat:raylé',d=>{ if(d&&d.etat) poserEtat(d.etat); });
  let finAlerte=0;
  RayleBus.on('raylé:alerte',d=>{ corps.classList.add('alerte-hud'); clearTimeout(finAlerte); finAlerte=setTimeout(()=>corps.classList.remove('alerte-hud'),(d&&d.ms)||9000); });

  const visible=()=>!document.hidden&&!corps.classList.contains('vue-terminal')&&!corps.classList.contains('vue-galaxie');
  function tic(){
    let info=null; try{ info=Entite.info(); }catch(e){}
    const moteurReseau=!!(info&&info.moteur==='reseau');
    const mode=moteurReseau?info.mode:(info&&info.moteur!=='chargement'?'leger':null);   // pendant le chargement du réseau, le mode précédent est conservé
    if(mode&&corps.dataset.hud!==mode) corps.dataset.hud=mode;
  }
  setInterval(()=>{ if(visible()) tic(); },1000);
  document.addEventListener('visibilitychange',()=>{ corps.classList.toggle('hud-pause',!visible()); if(visible()) tic(); });
  RayleBus.on('vue:changee',()=>{ corps.classList.toggle('hud-pause',!visible()); if(visible()) tic(); });

  const barre=$('barre');
  const mesurerBarre=()=>{ if(barre&&barre.offsetHeight) corps.style.setProperty('--barre-h',Math.round(window.innerHeight-barre.getBoundingClientRect().top)+'px'); };
  mesurerBarre(); window.addEventListener('resize',mesurerBarre);
  if(barre&&'ResizeObserver' in window) new ResizeObserver(mesurerBarre).observe(barre);
  tic();
})();
