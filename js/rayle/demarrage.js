"use strict";
  /* ═════════════ DÉMARRAGE ═════════════ */
  setState('idle'); majBouton();
  addLine('sys','Appareil : '+(IS_MOBILE?'téléphone ou tablette':'ordinateur')+' · façon de parler : '+(modeToucher()?'toucher pour parler':'mains libres')+' (modifiable dans ⚙ Réglages)');
  addLine('sys','RAYLÉ — Market & Neural Core · noyau initialisé (phase 2 · bougie par bougie, mémoire, images et vidéos, savoirs étendus)');
  if(SR){ addLine('sys','Reconnaissance vocale fr-FR : disponible'); }
  else{
    addLine('sys','Reconnaissance vocale indisponible : ouvrez cette page dans Google Chrome. La saisie au clavier reste active.');
    btn.disabled=true; btnTxt.textContent='Micro indisponible'; btnSub.textContent='';
  }
  addLine('sys', readBridge() ? 'Pont terminal détecté' : 'Pont terminal : aucune donnée pour le moment');
  if(OLD_KEYS.some(k=>store.get(k))) addLine('sys','Anciennes clés encore présentes dans ce navigateur : ⚙ Réglages → Effacer les anciennes clés');
  pingWorker();
  setTimeout(()=>{
    fetchCalendar(false)
      .then(ev=>addLine('sys','Calendrier économique : '+ev.length+' annonces ('+calVia+')'))
      .catch(e=>addLine('sys','Calendrier économique indisponible : '+errMsg(e)));
  },1500);
  const hh=new Date().getHours();
  addLine('ray',(hh>=18||hh<5?'Bonsoir':'Bonjour')+", Justin. "+(modeToucher()
    ? fx('Touchez','Touche')+" le bouton du bas, "+fx('parlez','parle')+", je réponds."
    : fx('Touchez','Touche')+" le bouton ci-dessous pour m'activer, puis "+fx('dites','dis')+" « Raylé »."));
  updateBridgeStatus();

  // Accès pour les tests locaux uniquement
  if(window.__RAYLE_TEST__) window.__RAYLE_TEST__({noteDepuis,SELF_RE,MEM_READ_RE,IMG_SUIVI_RE,citiesOf,wakeSplit,fixName,cmdNorm,norm,END_RE,COUPURE_RE,STOP_RE,exprDepuis,conversionDevise,conversionUnite,BOUGIE_RE,tfOf,nbBougies,assetsIn,newsQuery,clean,CALC_RE,urlYoutube});
