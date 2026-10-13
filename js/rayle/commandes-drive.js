"use strict";
  /* ═════════════ DOCUMENTS DU DRIVE : lire, ouvrir et modifier (voir js/drive/ et docs/drive.md) ═════════════
     « ouvre le cours d'anatomie » · « lis le 2e paragraphe » · « lis-moi la suite » · « résume le document » · « cherche l'humérus dans le cours »
     « corrige la faute dans le 2e paragraphe » (aperçu avant/après, puis « valide ») · « ajoute ce paragraphe sous le titre X : … » · « annule la dernière modification »
     « plein écran » · « surligne ce passage » · « liste mes documents » · « ajoute un document du Drive ».
     Raylé ne voit que les documents choisis par Justin avec le sélecteur Google (portée drive.file). Le module (connexion Google, API, fenêtre) n'est chargé
     qu'à la première demande qui parle d'un document, ou quand un document est ouvert. Les phrases qui ne parlent pas d'un document passent à la suite
     du traitement sans rien changer. Sans identifiant client (js/config-drive.js) ni document autorisé, rien n'est intercepté (sauf « connecte-toi à Google »). */
  const DRIVE_PRE=/\b(?:drive|google|gdrive|documents?|docs?|fichiers?|pdf|docx|word|tableur|feuille de calcul|presentation|diapos?|diaporama|slides?|cours|poly|polycopie|rapport|memoire|compte rendu|selecteur|paragraphes?|passage)\b/;
  const DRIVE_VERBES=/^(?:ouvre|ouvrir|affiche|afficher|montre|charge|lis|lire|relis|resume|resumer|cherche|trouve|recherche|retrouve|corrige|remplace|ajoute|supprime|efface|enregistre|sauvegarde|annule|reformule|reecris|ecris|insere|rajoute)\b/;
  let driveModule=null, driveChargement=null;
  function chargerDrive(){
    if(driveModule) return Promise.resolve(driveModule);
    if(!driveChargement) driveChargement=import(new URL('js/drive/index.js?v=2026.10.14.1',document.baseURI).href).then(m=>{ driveModule=m; return m; }).catch(e=>{ driveChargement=null; throw e; });
    return driveChargement;
  }
  function driveFichiersConnus(){ try{ return JSON.parse(localStorage.getItem('rayle_drive_fichiers')||'[]'); }catch(e){ return []; } }
  // le nom d'un document autorisé est-il évoqué par la phrase (mots d'au moins 5 lettres) ?
  function driveNomEvoque(n){
    const mots=new Set(n.split(' '));
    return driveFichiersConnus().some(f=>{ const t=norm(f.name).replace(/[^a-z0-9]+/g,' ').split(' ').filter(w=>w.length>=5); return t.length && t.some(w=>mots.has(w)); });
  }
  const driveConfigure=()=>{ const c=window.RAYLE_DRIVE_CONFIG||{}; return /^[\w-]+\.apps\.googleusercontent\.com$/.test(String(c.clientId||'').trim()); };
  const driveActif=()=>{ try{ const s=driveModule&&driveModule.statut(); return !!(s&&(s.ouvert||s.enAttente||s.choix)); }catch(e){ return false; } };

  // Renvoie la phrase à dire, ou null si ce n'est pas une commande de documents (la suite du traitement prend le relais)
  async function commandeDrive(texte){
    const n=norm(texte).replace(/[’']/g,' ').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
    if(!driveActif()){
      // pas configuré et aucun document autorisé : on ne charge rien sauf si la phrase parle de Google ou du Drive (« cours du Bitcoin » ne regarde pas les documents)
      if(!driveConfigure() && !driveFichiersConnus().length && !/\b(?:drive|google|gdrive|selecteur)\b/.test(n)) return null;
      const concerne=DRIVE_PRE.test(n) || (DRIVE_VERBES.test(n) && driveNomEvoque(n));
      if(!concerne) return null;
    }
    let m; try{ m=await chargerDrive(); }catch(e){ return null; }          // pas de réseau pour le module : le reste répond
    let c; try{ c=m.analyser(texte); }catch(e){ console.error('[drive]',e); return null; }
    if(!c) return null;
    try{ return await m.executer(c); }
    catch(e){ return 'Le module Drive a rencontré un problème : '+errMsg(e); }
  }
  /** Action décidée par l'IA (outil « commande_drive » du Worker) : { type:'drive', phrase } → texte à ajouter à la réponse ; un échec remplace la réponse de l'IA */
  async function driveAgent(a){
    const phrase=String(a&&a.phrase||'').trim().slice(0,300);
    if(!phrase){ echecsActions.push('Je n’ai pas pu agir sur le document : la demande est vide.'); return ''; }
    const r=await commandeDrive(phrase);
    if(r==null && !driveConfigure() && !driveFichiersConnus().length){ echecsActions.push('Les documents Google ne sont pas encore configurés : il manque l’identifiant client dans js/config-drive.js (étapes dans docs/drive.md).'); return ''; }
    if(r!=null && driveModule && driveModule.dernierResultat && driveModule.dernierResultat().ok===false){ echecsActions.push(r); return ''; }     // l'opération a échoué : sa phrase REMPLACE la réponse de l'IA (jamais « c'est fait » à tort)
    if(r==null){ echecsActions.push('Je n’ai pas compris cette demande pour les documents : « '+phrase+' ». Dis par exemple « ouvre le cours d’anatomie » puis « lis le 2e paragraphe ».'); return ''; }
    return r;
  }

  /* ───── liens avec le reste de la page ───── */
  RayleBus.fournir('drive:dire',t=>{ try{ addLine('ray',String(t)); speak(String(t)); }catch(e){} return true; });
  // fournir() attend une fonction ; celle-ci renvoie la fonction d'appel de l'IA (utilisée pour « corrige la faute… »)
  RayleBus.fournir('drive:ia',()=>iaDrive);
  async function iaDrive(prompt){
    if(!workerReady()) throw new Error('le Worker n’est pas configuré');
    const res=await wfetch('/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:prompt,context:'',history:[]})},45000);
    if(!res.ok) throw await workerError(res);
    const d=await res.json(); return d.reply;
  }

  /* ───── Réglages : connexion, sélecteur, liste ───── */
  (function reglagesDrive(){
    const info=$('driveInfo'), bCo=$('driveConnexion'), bDeco=$('driveDeconnexion'), bChoix=$('driveChoisir'), bOuvre=$('driveOuvrir'), bUn=$('driveOuvrirDoc');
    if(!info) return;
    const cfgOk=()=>{ const c=window.RAYLE_DRIVE_CONFIG||{}; return /^[\w-]+\.apps\.googleusercontent\.com$/.test(String(c.clientId||'').trim()); };
    function afficher(){
      const s=(driveModule&&driveModule.statut)?driveModule.statut():{configure:cfgOk(),connecte:false,fichiers:driveFichiersConnus().length,dejaConnecte:localStorage.getItem('rayle_drive_connecte')==='1'};
      if(!cfgOk()){ info.textContent='Google Drive : pas encore configuré. Il manque l’identifiant client dans js/config-drive.js — étapes dans docs/drive.md.'; }
      else info.textContent='Google Drive : '+(s.connecte?'connecté':(s.dejaConnecte?'session à rétablir (touche « Se connecter »)':'non connecté'))+' · '+s.fichiers+' document'+(s.fichiers>1?'s':'')+' autorisé'+(s.fichiers>1?'s':'')+(s.ouvert?' · « '+s.nom+' » ouvert':'')+'.';
      bCo.disabled=!cfgOk(); bChoix.disabled=!cfgOk(); if(bUn) bUn.disabled=!cfgOk(); bDeco.disabled=!cfgOk()||!(s.connecte||s.dejaConnecte);
    }
    const vite=()=>{ if(cfgOk()) chargerDrive().then(m=>{ try{ m.precharger(); }catch(e){} }).catch(()=>{}); };
    bCo.addEventListener('pointerenter',vite); bCo.addEventListener('focus',vite);
    bCo.addEventListener('click',async()=>{ try{ const m=await chargerDrive(); const r=await m.seConnecter(); if(r.dit) addLine('sys','Drive : '+r.dit); }catch(e){ addLine('sys','Drive : '+errMsg(e)); } afficher(); });
    bDeco.addEventListener('click',async()=>{ try{ const m=await chargerDrive(); const r=await m.seDeconnecter(); if(r.dit) addLine('sys','Drive : '+r.dit); }catch(e){ addLine('sys','Drive : '+errMsg(e)); } afficher(); });
    bChoix.addEventListener('click',async()=>{ try{ const m=await chargerDrive(); const r=await m.choisirDocuments(); if(r.dit) addLine('sys','Drive : '+r.dit); }catch(e){ addLine('sys','Drive : '+errMsg(e)); } afficher(); });
    if(bUn) bUn.addEventListener('click',async()=>{ try{ const m=await chargerDrive(); const r=await m.ouvrirUnDocument(); if(r.dit) addLine('sys','Drive : '+r.dit); }catch(e){ addLine('sys','Drive : '+errMsg(e)); } afficher(); });
    bOuvre.addEventListener('click',async()=>{ try{ const m=await chargerDrive(); m.ouvrirFenetre(); }catch(e){ addLine('sys','Drive : '+errMsg(e)); } });
    RayleBus.on('etat:drive',afficher);
    afficher();
    // déjà connecté lors d'une visite précédente : on prépare la connexion silencieuse pendant que la page est au repos
    try{ if(cfgOk() && localStorage.getItem('rayle_drive_connecte')==='1') setTimeout(vite,3000); }catch(e){}
  })();

  /* ───── Réglages : mémoire des cours (analyser, relire, oublier ; resynchronisation seule à l'ouverture) ───── */
  (function reglagesCours(){
    const info=$('coursInfo'), barre=$('coursProgres'), bAna=$('coursAnalyser'), bRel=$('coursRelire'), bOub=$('coursOublier');
    if(!info) return;
    const cfgOk=()=>driveConfigure();
    const actif=()=>{ try{ return localStorage.getItem('rayle_cours_actif')==='1'; }catch(e){ return false; } };
    let occupe=false, enAttente=false, resume=null, dernierBilan='';
    const taille=o=>o<1024?o+' o':o<1048576?Math.round(o/1024)+' Ko':(o/1048576).toFixed(o<10485760?1:0).replace('.',',')+' Mo';
    function texteResume(){
      if(!resume||!resume.documents) return 'aucun cours en mémoire pour l’instant.';
      const d=resume.derniere?' · dernière synchronisation : '+new Date(resume.derniere).toLocaleString('fr-FR',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}):'';
      return resume.documents+' document'+(resume.documents>1?'s':'')+' en mémoire sur cet appareil ('+taille(resume.octets)+')'+d+'.';
    }
    function afficher(){
      bAna.disabled=!cfgOk()||occupe; bRel.disabled=!cfgOk()||occupe||!actif(); bOub.disabled=occupe||!(actif()||(resume&&resume.documents));
      if(occupe) return;
      barre.hidden=true;
      if(!cfgOk()){ info.textContent='Mémoire des cours : il faut d’abord configurer Google Drive (identifiant client dans js/config-drive.js — voir docs/drive.md).'; return; }
      info.textContent='Mémoire des cours : '+(dernierBilan||texteResume())+(enAttente?' Resynchronisation en attente : connecte-toi à Google (bouton ci-dessus).':'');
    }
    function progres(e){
      occupe=true; bAna.disabled=bRel.disabled=bOub.disabled=true; barre.hidden=false;
      if(e.phase==='lecture'&&e.n){ barre.max=e.n; barre.value=Math.max(0,e.i-1); info.textContent='Mémoire des cours : document '+e.i+' sur '+e.n+' — '+(e.nom||''); }
      else { barre.removeAttribute('value'); info.textContent='Mémoire des cours : '+(e.nom?'je parcours « '+e.nom+' »…':'je prépare l’analyse…'); }
    }
    function fini(r,silencieux){
      occupe=false; enAttente=!!(r&&r.reconnexion); dernierBilan='';
      if(r&&r.ok&&!r.annule&&!r.vide){ dernierBilan=r.dit; resume={documents:r.documents,octets:r.octets,derniere:Date.now()}; }
      // au démarrage (silencieux) on n'écrit dans la conversation que s'il y a eu du changement ou un problème
      const parle=r&&r.dit&&(!silencieux||(r.ok?(r.nouveaux||r.modifies||r.supprimes||(r.echecs&&r.echecs.length)):!r.reconnexion));
      if(parle) addLine('sys',(silencieux?'Cours resynchronisés — ':'Mémoire des cours : ')+r.dit);
      afficher();
      if(r&&!r.ok&&r.dit&&!(silencieux&&r.reconnexion)) info.textContent='Mémoire des cours : '+r.dit;
    }
    let propre=false;                  // vrai quand un clic ou la synchro d'ouverture suit lui-même son résultat (sinon, c'est la synchro déclenchée par la reconnexion)
    async function lancer(nom,silencieux){
      if(occupe) return;
      occupe=true; propre=true; progres({phase:'exploration',nom:''});
      let r; try{ const m=await chargerDrive(); r=await m[nom](silencieux?{silencieux:true}:undefined); }catch(e){ r={ok:false,dit:errMsg(e)}; }
      propre=false; fini(r,silencieux);
    }
    bAna.addEventListener('click',()=>{ lancer('analyserCours',false); });
    bRel.addEventListener('click',()=>{ lancer('relireCours',false); });
    bOub.addEventListener('click',async()=>{
      if(occupe) return;
      if(!window.confirm('Effacer de cet appareil tout le texte de tes cours mémorisés ? (Ton Drive n’est pas touché ; tu pourras refaire l’analyse.)')) return;
      try{ const m=await chargerDrive(); const r=await m.oublierCours(); resume=null; dernierBilan=r.ok?'':''; enAttente=false; addLine('sys','Mémoire des cours : '+r.dit); afficher(); if(r.ok) info.textContent='Mémoire des cours : '+r.dit; }
      catch(e){ addLine('sys','Mémoire des cours : '+errMsg(e)); }
    });
    RayleBus.on('cours:etat',e=>{
      if(!e) return;
      if(e.phase==='exploration'||e.phase==='lecture') progres(e);
      else if(e.phase==='repos'&&e.dernier&&!propre&&occupe) fini(e.dernier,!!e.silencieux);
    });
    afficher();
    // une mémoire existe déjà : à chaque ouverture, resynchronisation seule (seuls les documents modifiés sont relus)
    if(cfgOk()&&actif()){
      setTimeout(async()=>{
        try{
          const m=await chargerDrive(); resume=await m.coursResume(); afficher();
          propre=true; occupe=true; progres({phase:'exploration',nom:''});
          const r=await m.synchroAuto(); propre=false;
          if(r) fini(r,true); else { occupe=false; afficher(); }
        }catch(e){ propre=false; occupe=false; afficher(); }
      },2500);
    }
  })();
