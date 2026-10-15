"use strict";
/* Petit menu des planètes : la seule interface. Fermé par défaut ; une poignée presque invisible sur le bord gauche l'ouvre, ou la voix (« ouvre le menu »).
   Un toucher sur une planète appelle exactement le même chemin que la voix (allerPlanete). */
(function(){
  const nav=document.createElement('nav');
  nav.id='menuPlanetes'; nav.setAttribute('aria-label','Planètes');
  const poignee=document.createElement('div');
  poignee.className='mp-poignee'; poignee.setAttribute('aria-hidden','true');
  const liste=document.createElement('ul');
  liste.className='mp-liste';
  (window.RayleUniversVoix?RayleUniversVoix.planetes:[]).forEach(p=>{
    const li=document.createElement('li'); li.textContent=p.nom; li.dataset.id=p.id;
    li.addEventListener('pointerdown',e=>{ e.stopPropagation(); });
    li.addEventListener('click',e=>{
      e.stopPropagation();
      basculer(false);
      Promise.resolve(RayleUniversVoix.allerPlanete(p.id)).then(t=>{ if(t && t!=='__deja_dit__'){ try{ addLine('ray',t); speak(t); }catch(er){} } });
    });
    liste.appendChild(li);
  });
  nav.append(poignee,liste);
  document.body.appendChild(nav);

  let ouvert=false;
  function basculer(o){ ouvert=(o===undefined)?!ouvert:!!o; nav.classList.toggle('ouvert',ouvert); }
  poignee.addEventListener('pointerdown',e=>{ e.stopPropagation(); });
  poignee.addEventListener('click',e=>{ e.stopPropagation(); basculer(); });   // au « click » (et pas au pointerdown) : le clic fantôme d'un toucher ne tombe pas sur la liste qui vient d'apparaître
  // un toucher ailleurs referme
  document.addEventListener('pointerdown',e=>{ if(ouvert && !nav.contains(e.target)) basculer(false); },true);
  window.RayleMenuPlanetes={basculer,estOuvert:()=>ouvert};
})();
