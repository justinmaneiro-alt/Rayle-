"use strict";
  /* ═════════════ AFFICHAGE : sous-titres, qualité de l'entité, bouton Couper, état verrouillé ═════════════ */
  const soustitreEl=$('soustitre'), kSousTitres=$('kSousTitres'), kQualite=$('kQualite'), infoEntite=$('infoEntite');
  const KEY_SOUSTITRES='rayle_soustitres';
  const sousTitresActifs=()=>store.get(KEY_SOUSTITRES)==='1';
  function appliquerSousTitres(){ document.body.classList.toggle('avec-soustitres',sousTitresActifs()); if(!sousTitresActifs()) soustitreEl.classList.remove('vu'); }
  appliquerSousTitres();

  let sousTitreTimer=null;
  function afficherSousTitre(texte,ecoute,duree){
    if(!sousTitresActifs()) return;
    soustitreEl.textContent=texte;
    soustitreEl.classList.toggle('ecoute',!!ecoute);
    soustitreEl.classList.add('vu');
    clearTimeout(sousTitreTimer);
    if(duree) sousTitreTimer=setTimeout(()=>soustitreEl.classList.remove('vu'),duree);
  }
  // appelée par addLine (base.js) pour chaque phrase de Raylé ou de Justin
  function sousTitre(kind,text){
    const t=String(text);
    afficherSousTitre(kind==='user'?'« '+t.slice(0,200)+' »':t.slice(0,360),kind==='user',Math.max(5000,Math.min(18000,t.length*70)));
  }
  // ce que Raylé entend, en direct (le journal technique le reçoit, on le recopie)
  new MutationObserver(()=>{
    const t=interimEl.textContent||'';
    if(t && !t.startsWith('zz') && !document.body.classList.contains('secu-capture')) afficherSousTitre(t.replace(/^…\s*/,'').slice(0,200),true,6000);
  }).observe(interimEl,{childList:true,characterData:true,subtree:true});

  /* ───── Verrouillé : pas d'adresse ni de code pour le Worker ───── */
  function majVerrou(){ try{ Entite.verrou(!workerReady() || (window.SEC && Date.now()<window.SEC.flashJusqua)); }catch(e){} }
  majVerrou(); setInterval(majVerrou,2000);

  /* ───── Réglages d'affichage ───── */
  function majReglagesAffichage(){
    kSousTitres.checked=sousTitresActifs();
    const q=store.get('rayle_entite_qualite'); kQualite.value=(q===''||q==='auto')?'auto':q;
    const i=Entite.info();
    infoEntite.textContent='Actuellement : '+i.points+' points, '+(i.moteur==='gl'?'WebGL':'canvas 2D')+', environ '+i.fps+' images/s.';
  }
  $('gear').addEventListener('click',majReglagesAffichage);
  kSousTitres.addEventListener('change',()=>{ store.set(KEY_SOUSTITRES,kSousTitres.checked?'1':''); appliquerSousTitres(); });
  kQualite.addEventListener('change',()=>{ Entite.qualite(kQualite.value==='auto'?'auto':+kQualite.value); majReglagesAffichage(); });

  /* ───── Bouton Couper : interrompt ce qu'elle fait, sinon coupe l'écoute ───── */
  $('btnCouper').addEventListener('click',()=>{
    if(speaking||processing||queue.length) cutAll('Coupé (bouton)');
    else if(micOn) stopListening();
    try{ RayleBus.emit('panneaux:fermer-tout'); }catch(e){}
  });
