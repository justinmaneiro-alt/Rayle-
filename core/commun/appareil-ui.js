"use strict";
/* V7b : réglage « Appareil » (automatique / PC / tablette / téléphone). Proposé SEULEMENT sur PC (ou si un choix manuel est déjà enregistré) :
   sur téléphone et tablette en mode automatique, aucun réglage ne permet d'activer Galaxie. Sert surtout à tester l'affichage mobile depuis le PC. */
(function(){
  const A=window.RayleAppareil; if(!A) return;
  /* Sur téléphone et tablette, la place du bouton Galaxie est prise par « Carte » : la carte plate de la Terre (actualités, météo, recherche de lieux), sans galaxie. */
  if(A.estMobile()){
    const g=document.getElementById('btnOuvrirGalaxie'), pays=document.getElementById('btnPays')||Array.from(document.querySelectorAll('button.gros')).find(b=>/pays/i.test(b.textContent));
    if(g&&g.parentNode){
      const c=document.createElement('button'); c.type='button'; c.className=g.className; c.id='btnCarteTerre'; c.innerHTML=(pays?pays.innerHTML.replace(/Pays/i,'Carte'):g.innerHTML).replace(/PAYS/,'CARTE');
      c.addEventListener('click',()=>{ window.HoteModules&&HoteModules.ouvrirTerre().catch(e=>{ if(window.addLine) addLine('sys','Carte indisponible : '+(e&&e.message||e)); }); });
      g.parentNode.insertBefore(c,g);
    }
  }
  const rg=document.createElement('div'); rg.id='appareilReglages';
  const cible=document.getElementById('tbReglages');
  if(cible&&cible.parentNode) cible.parentNode.insertBefore(rg,cible); else return;
  function dessiner(){
    if(!A.peutChoisir()){ rg.innerHTML=''; return; }
    const v=A.reglage(), o=(k,t)=>'<option value="'+k+'"'+(v===k?' selected':'')+'>'+t+'</option>';
    rg.innerHTML='<h3>Appareil</h3><label for="appareilChoix">Mode de l’appareil</label><select id="appareilChoix">'+o('auto','Automatique ('+A.mode()+')')+o('pc','PC (Galaxie disponible)')+o('tablette','Tablette (Jarvis seulement)')+o('telephone','Téléphone (Jarvis seulement)')+'</select>'
      +'<div class="hint">Le mode Galaxie est réservé au PC. Ce choix est stocké sur cet appareil ; recharge la page après l’avoir changé.</div>';
  }
  rg.addEventListener('change',ev=>{ if(ev.target.id==='appareilChoix'){ A.choisir(ev.target.value); dessiner(); } });
  dessiner();
})();
