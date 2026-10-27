"use strict";
/* ═════════════ MODE MULTI-ÉCRANS : le contrôleur (fenêtre principale ET fenêtres satellites) ═════════════
   Fenêtre principale : elle seule a le micro et la voix. Elle détecte les écrans (serveur local → app-pc/fenetres.ps1), ouvre une fenêtre satellite par écran à remplir
   (Edge « application », sans bordure, placée sur l'écran), diffuse l'état aux satellites (BroadcastChannel « rayle-multi ») et exécute les ordres (voix, ⚙, F9).
   Fenêtre satellite (?ecran=<id>) : même page, accueil masqué, affiche seulement les modules de son écran ; ses boutons passent par la fenêtre principale.
   Ordres vocaux : ils passent par le bus d'ordres (RayleOrdres, cible « rayle » : multi_ecrans, disposition, identifier_ecrans, fermer_tout, deplacer_module).
   Les calculs (écrans, dispositions, phrases) sont dans multi-calcul.js (pur, testé) ; les modules d'écran dans multi-modules.js ; l'éditeur ⚙ dans multi-editeur.js.
   Réglages enregistrés dans ce navigateur : rayle_multi (dispositions, disposition courante). Raccourcis : F9 = activer/désactiver, Ctrl+F9 = tout fermer. */
(function(){
  const C=window.MultiCalcul, M=window.MultiModules, B=window.RayleBus;
  if(!C||!M||!B) return;
  const SAT=window.RAYLE_SATELLITE||null, ROLE=SAT?'satellite':'principal', MOI=SAT?SAT.id:'principal';
  const CLE='rayle_multi', PERIODE_VIE=2500, DELAI_VIVANT=9000;
  const canal=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('rayle-multi'):null;
  const attendre=ms=>new Promise(r=>setTimeout(r,ms));

  /* ───── abonnements locaux des modules (état de Raylé, lignes de conversation, texte en cours) ───── */
  const ecouteurs={etat:new Set(),ligne:new Set(),interim:new Set()};
  const ecouter=(type,fn)=>{ (ecouteurs[type]=ecouteurs[type]||new Set()).add(fn); return ()=>ecouteurs[type].delete(fn); };
  const diffuserLocal=(type,d)=>{ (ecouteurs[type]||[]).forEach(fn=>{ try{ fn(d); }catch(e){ console.error('[multi]',e); } }); };
  const historique=[]; let etatRayle='idle';
  const noter=(kind,texte)=>{ historique.push({kind,texte:String(texte)}); if(historique.length>40) historique.shift(); };
  const envoyer=m=>{ if(canal){ try{ canal.postMessage(Object.assign({de:MOI},m)); }catch(e){} } };

  /* ───── serveur local (écrans, fenêtres) ───── */
  async function serveur(chemin,corps){
    try{
      const r=await fetch('/__multi/'+chemin,corps?{method:'POST',headers:{'Content-Type':'application/json','X-Rayle-Multi':'1'},body:JSON.stringify(corps)}:{});
      if(r.status===404) return {ok:false,ancien:true,erreur:'ANCIEN_SERVEUR'};      // le serveur en marche date d'avant le mode multi-écrans (il est resté en mémoire)
      if(!r.ok&&r.status!==403) return {ok:false,erreur:'le serveur local de Rayle a répondu '+r.status};
      return await r.json();
    }catch(e){ return {ok:false,injoignable:true,erreur:'INJOIGNABLE'}; }
  }
  /* Phrase claire pour une panne du serveur local, avec ce qu'il faut faire */
  function raisonServeur(r){
    if(r&&r.ancien) return 'le serveur local de Rayle date d’avant la mise à jour du mode multi-écrans. Ferme Rayle, puis double-clique sur « Rayle Multi-écrans » (Bureau) : le serveur se met à jour tout seul';
    if(r&&r.injoignable) return 'je ne joins pas le serveur local de Rayle. Cette page doit venir de http://127.0.0.1:8000 (raccourci « Rayle » ou « Rayle Multi-écrans »), pas d’un site en ligne';
    return (r&&r.erreur)||'détection impossible';
  }

  /* ───── surface : affiche des modules côte à côte (une fenêtre satellite, ou la surface plein écran de la fenêtre principale) ───── */
  function creerSurface(racine,ecranId){
    const instances=new Map();
    const ctxPour=m=>({params:m.params||{},role:ROLE,principal:ROLE==='principal',ecran:ecranId,ecouter,envoyer,micro:demanderMicro,etatInitial:()=>etatRayle,historique:()=>historique.slice()});
    const detruire=o=>{ try{ o.inst&&o.inst.detruire&&o.inst.detruire(); }catch(e){ console.error('[multi] fermeture du module',e); } o.el.remove(); };
    function outils(m,def){
      const autres=ecransConnus().filter(e=>e.id!==ecranId);
      const b=[]; if(def&&!def.fond) b.push('<button type="button" data-a="taille" data-d="-1" title="Plus petit">−</button><button type="button" data-a="taille" data-d="1" title="Plus grand">+</button>');
      autres.forEach(e=>b.push('<button type="button" data-a="vers" data-e="'+M.esc(e.id)+'" title="Envoyer sur l’écran '+e.numero+'">↦ '+e.numero+'</button>'));
      return b.join('');
    }
    function maj(modules,ecran){
      racine.classList.toggle('vertical',!!ecran&&ecran.orientation==='vertical'); racine.classList.add('mx-surface');
      const vus=new Set();
      modules.forEach((m,i)=>{
        vus.add(m.id); let o=instances.get(m.id); const def=M.obtenir(m.type), p=JSON.stringify(m.params||{});
        if(o&&o.type!==m.type){ detruire(o); instances.delete(m.id); o=null; }
        if(!o){
          const el=document.createElement('section'); el.className='mx-slot'+(def&&def.fond?' fond':''); el.dataset.id=m.id; el.dataset.type=m.type;
          el.innerHTML='<div class="mx-contenu"></div><div class="mx-outils"></div>';
          o={type:m.type,el,params:p,inst:null,outils:''}; instances.set(m.id,o);
          const contenu=el.querySelector('.mx-contenu');
          if(!def) contenu.innerHTML='<div class="mx-erreur"><b>Module inconnu</b><p>« '+M.esc(m.type)+' » n’est pas disponible dans cette version.</p></div>';
          else try{ o.inst=def.creer(contenu,ctxPour(m)); }catch(e){ console.error('[multi] module',m.type,e); contenu.innerHTML='<div class="mx-erreur"><b>Module en panne</b><p>'+M.esc(e&&e.message||e)+'</p></div>'; }
          el.querySelector('.mx-outils').addEventListener('click',ev=>{
            const b=ev.target.closest('button'); if(!b) return;
            if(b.dataset.a==='taille') demanderTaille(m.id,ecranId,Number(b.dataset.d));
            else if(b.dataset.a==='vers') demanderDeplacement(m.id,ecranId,b.dataset.e);
          });
        }else if(o.params!==p){ o.params=p; try{ o.inst&&o.inst.majParams&&o.inst.majParams(m.params||{}); }catch(e){} }
        const barre=outils(m,def); if(barre!==o.outils){ o.outils=barre; o.el.querySelector('.mx-outils').innerHTML=barre; }
        o.el.style.flexGrow=String(m.part||1);
        if(racine.children[i]!==o.el) racine.insertBefore(o.el,racine.children[i]||null);
      });
      for(const [id,o] of [...instances]) if(!vus.has(id)){ detruire(o); instances.delete(id); }
      racine.classList.toggle('a-fond',modules.some(m=>{ const d=M.obtenir(m.type); return d&&d.fond; }));
    }
    function vider(){ for(const o of instances.values()) detruire(o); instances.clear(); racine.classList.remove('a-fond'); }
    function voix(texte){ for(const o of instances.values()){ try{ if(o.inst&&o.inst.surVoix) o.inst.surVoix(texte); }catch(e){} } }
    return {maj,vider,voix,vide:()=>instances.size===0};
  }

  /* ───── état partagé ───── */
  let etat=null, ecrans=[], principalId=null, actif=false, serveurDispo=null, raison='', occupe=false, application=null, serveurAncien=false;
  let ecransSatellite=[];                       // satellite : écrans reçus de la fenêtre principale
  const vivants=new Map();                      // principal : identifiant de fenêtre → dernière fois vue
  const ecransConnus=()=>ROLE==='principal'?ecrans:ecransSatellite;
  const change=()=>{ try{ B.emit('multi:change',{actif}); }catch(e){} };
  const disp=()=>etat?etat.dispositions[etat.courante]:null;
  const copie=o=>JSON.parse(JSON.stringify(o));
  function lireStocke(){ try{ const t=localStorage.getItem(CLE); return t?JSON.parse(t):null; }catch(e){ return null; } }
  function sauver(){ if(!etat) return; etat.actif=actif; try{ localStorage.setItem(CLE,JSON.stringify({version:etat.version,actif:etat.actif,courante:etat.courante,dispositions:etat.dispositions})); }catch(e){} }
  const souhaitees=()=>C.fenetresSouhaitees(disp()||C.dispositionVide(),ecrans,principalId);
  const fenetresVivantes=()=>{ const t=Date.now(); return [...vivants].filter(([,v])=>t-v<DELAI_VIVANT).map(([i])=>i); };

  async function detecter(){
    const r=await serveur('ecrans');
    if(r&&r.ok&&Array.isArray(r.ecrans)){
      ecrans=C.normaliserEcrans(r.ecrans); serveurDispo=true; raison=''; serveurAncien=false; if(typeof r.application==='boolean') application=r.application;
      principalId=(r.principal&&ecrans.some(e=>e.id===r.principal)?r.principal:(ecrans.find(e=>e.primaire)||ecrans[0]||{}).id)||null;
      const brut=lireStocke(); etat=brut?C.normaliserEtat(brut,ecrans,M.types()):C.normaliserEtat(null,ecrans,M.types());
      if(!brut) etat.dispositions[etat.courante]=C.dispositionDefaut(ecrans);
      etat.actif=actif;
    }else{ serveurDispo=false; serveurAncien=!!(r&&r.ancien); raison=raisonServeur(r); if(!etat){ const brut=lireStocke(); if(brut) etat=C.normaliserEtat(brut,[],M.types()); } }
    change(); return serveurDispo;
  }

  /* ───── fenêtre principale : sa propre surface (si son écran n'est pas « Raylé seul ») ───── */
  let surfacePrincipale=null, voileEl=null;
  function majPrincipale(P){
    const montrer=actif&&P&&!P.normal;
    if(!montrer){ if(surfacePrincipale){ surfacePrincipale.vider(); surfacePrincipale=null; } if(voileEl){ voileEl.remove(); voileEl=null; } document.body.classList.remove('multi-voile'); return; }
    if(!voileEl){
      voileEl=document.createElement('div'); voileEl.id='multi-voile'; voileEl.className='mx-voile';
      voileEl.innerHTML='<div class="mx-surface-hote"></div><div class="mx-barre-principale"><button type="button" data-a="reglages" title="Ouvrir les réglages">⚙</button><button type="button" data-a="normal" title="Remettre l’écran principal en mode normal (Raylé seul)">↩ normal</button></div>';
      document.body.appendChild(voileEl);
      voileEl.querySelector('.mx-barre-principale').addEventListener('click',e=>{
        const b=e.target.closest('button'); if(!b) return;
        if(b.dataset.a==='reglages'){ const c=document.getElementById('cfg'); if(c) c.classList.add('open'); }
        else if(b.dataset.a==='normal'&&P.ecran) edit(d=>{ const x=copie(d); x.ecrans[P.ecran.id]=[C.creerModule('rayle')]; return {disp:x}; });
      });
      surfacePrincipale=creerSurface(voileEl.querySelector('.mx-surface-hote'),P.ecran&&P.ecran.id);
    }
    document.body.classList.add('multi-voile');
    surfacePrincipale.maj(P.modules,P.ecran);
  }

  /* ───── ouvrir / fermer les fenêtres selon la disposition ───── */
  /* Une seule application à la fois : si on modifie la disposition pendant qu'une application tourne, elle est rejouée juste après (jamais deux ouvertures de la même fenêtre). */
  let enCours=null, rejouer=false;
  function appliquer(){
    if(enCours){ rejouer=true; return enCours; }
    enCours=(async()=>{ let r; do{ rejouer=false; r=await appliquerUneFois(); }while(rejouer); return r; })().finally(()=>{ enCours=null; });
    return enCours;
  }
  async function appliquerUneFois(){
    const S=souhaitees(), erreurs=[];
    majPrincipale(S.principal);
    diffuserDispo();
    const plan=C.planDeFenetres(S.satellites,fenetresVivantes());
    for(const id of plan.fermer){ await serveur('fermer',{id}); vivants.delete(id); }
    for(const f of plan.ouvrir){
      const r=await serveur('ouvrir',{id:f.id,ecran:{x:f.ecran.x,y:f.ecran.y,w:f.ecran.w,h:f.ecran.h}});
      if(!r.ok) erreurs.push('écran '+f.ecran.numero+' : '+(r.erreur||'échec'));
      else{ const t0=Date.now(); while(Date.now()-t0<12000&&!fenetresVivantes().includes(f.id)){ await attendre(300); } if(!fenetresVivantes().includes(f.id)) erreurs.push('écran '+f.ecran.numero+' : la fenêtre s’est ouverte mais ne répond pas (Rayle doit tourner dans l’application PC)'); }
    }
    diffuserDispo(); change();
    return {ouverts:S.satellites.length,erreurs,absents:S.absents,principalNormal:S.principal.normal};
  }
  function diffuserDispo(){
    if(ROLE!=='principal') return;
    envoyer({t:'dispo',actif,disp:actif?disp():C.dispositionVide(),ecrans,principalId,nom:etat?etat.courante:''});
  }

  async function activer(){
    if(ROLE!=='principal') return {ok:false,texte:'Cela se commande depuis la fenêtre principale de Raylé.'};
    if(occupe) return {ok:false,texte:'Une opération est déjà en cours, un instant.'};
    occupe=true;
    try{
      const dejaActif=actif; await detecter();
      if(!serveurDispo) return {ok:false,texte:'Je ne peux pas ouvrir les autres écrans : '+raison+'.'};
      if(dejaActif) { await appliquer(); return {ok:true,texte:'Le mode multi-écrans est déjà actif.'}; }
      actif=true; sauver();
      const r=await appliquer();
      const n=r.ouverts+(r.principalNormal?0:1);
      if(r.erreurs.length) return {ok:false,texte:'Mode multi-écrans activé, mais : '+r.erreurs.join(' ; ')+'.'};
      if(!r.ouverts&&!r.principalNormal) return {ok:true,texte:'Mode multi-écrans activé.'};
      if(!r.ouverts) return {ok:true,texte:'Mode multi-écrans activé, mais je ne vois aucun autre écran à remplir dans cette disposition.'+(r.absents.length?' '+r.absents.length+' écran'+(r.absents.length>1?'s':'')+' réglé'+(r.absents.length>1?'s':'')+' mais pas branché'+(r.absents.length>1?'s':'')+'.':'')};
      return {ok:true,texte:'Mode multi-écrans activé : '+r.ouverts+' fenêtre'+(r.ouverts>1?'s':'')+' ouverte'+(r.ouverts>1?'s':'')+(r.absents.length?'. '+r.absents.length+' écran'+(r.absents.length>1?'s':'')+' de la disposition '+(r.absents.length>1?'ne sont':'n’est')+' pas branché'+(r.absents.length>1?'s':''):'')+'.'};
    }finally{ occupe=false; change(); }
  }
  async function desactiver(){
    if(ROLE!=='principal'){ envoyer({t:'raccourci',nom:'bascule'}); return {ok:true,texte:''}; }
    if(!actif){ return {ok:true,texte:'Le mode multi-écrans est déjà désactivé.'}; }
    actif=false; sauver();
    envoyer({t:'dispo',actif:false,disp:C.dispositionVide(),ecrans,principalId,nom:etat?etat.courante:''});
    majPrincipale(null);
    await serveur('fermer',{satellites:true}); vivants.clear();
    change();
    return {ok:true,texte:'Mode multi-écrans désactivé. L’écran principal reste comme avant.'};
  }
  const basculer=()=>actif?desactiver():activer();

  async function fermerTout(){
    if(ROLE==='principal'){ actif=false; sauver(); }
    const r=await serveur('fermer',{tout:true});
    if(ROLE==='principal'){
      if(r.principaleOuverte){   // Rayle tourne dans un onglet de navigateur : on ferme les autres écrans, pas ton navigateur
        majPrincipale(null); try{ addLine('sys','Les fenêtres des autres écrans sont fermées. Cet onglet Rayle reste ouvert : ferme-le avec Ctrl+W.'); }catch(e){}
        change();
      }else if(!r.ok){ try{ addLine('sys','Je n’ai pas pu fermer les fenêtres : '+raisonServeur(r)+'.'); }catch(e){} }
    }
    return r;
  }
  /* Bouton « Ouvrir l'application Rayle » : lance le même programme que le raccourci du Bureau (le lanceur s'occupe du serveur, de la fenêtre et du mode multi-écrans) */
  async function lancerApplication(){ const r=await serveur('lancer',{multi:true}); return r.ok?{ok:true,texte:'J’ouvre l’application Rayle Multi-écrans. Elle va apparaître dans quelques secondes.'}:{ok:false,texte:'Je n’ai pas pu lancer l’application : '+raisonServeur(r)+'.'}; }
  async function identifier(){ const r=await serveur('identifier',{duree:3}); return r.ok?{ok:true,texte:'Voici le numéro de chacun de tes écrans.'}:{ok:false,texte:'Je n’ai pas pu afficher les numéros : '+(r.erreur||'échec')+'.'}; }

  /* ───── modifications de la disposition (éditeur, boutons des modules, voix) ───── */
  function edit(fn){
    if(!etat) return {erreur:'dispositions indisponibles (écrans non détectés)'};
    const r=fn(disp()); if(!r) return {}; const nouvelle=r.disp||r; if(r.erreur) return r;
    etat.dispositions[etat.courante]=nouvelle; sauver(); change(); if(actif) appliquer(); return {};
  }
  function editEtat(fn){   // renvoie {etat,erreur,nom}
    if(!etat) return {erreur:'dispositions indisponibles (écrans non détectés)'};
    const r=fn(etat); if(r.erreur) return r; etat=Object.assign({},r.etat,{actif}); sauver(); change(); if(actif) appliquer(); return r;
  }
  const api_edition={
    ajouterModule:(idE,type,params,index)=>{ let res=null; const r=edit(d=>{ res=C.ajouterModule(d,idE,type,params,index); return res; }); return r.erreur?r:{module:res&&res.module}; },
    retirerModule:(idE,idM)=>edit(d=>({disp:C.retirerModule(d,idE,idM)})),
    redimensionner:(idE,idM,delta)=>edit(d=>({disp:C.redimensionner(d,idE,idM,delta)})),
    changerParams:(idE,idM,p)=>edit(d=>({disp:C.changerParams(d,idE,idM,p)})),
    deplacer:(idM,de,vers,index)=>edit(d=>C.deplacerModule(d,de,idM,vers,index)),
    choisir:nom=>editEtat(e=>C.choisirDisposition(e,nom)),
    enregistrerSous:nom=>editEtat(e=>C.enregistrerDisposition(e,nom,e.dispositions[e.courante])),
    renommer:(a,n)=>editEtat(e=>C.renommerDisposition(e,a,n)),
    supprimer:nom=>editEtat(e=>C.supprimerDisposition(e,nom)),
    dupliquer:(nom,n)=>editEtat(e=>C.dupliquerDisposition(e,nom,n))
  };
  function demanderDeplacement(idM,deEcran,vers){ if(ROLE==='principal') api_edition.deplacer(idM,deEcran,vers); else envoyer({t:'deplacer',module:idM,de_ecran:deEcran,vers}); }
  function demanderTaille(idM,idE,delta){ if(ROLE==='principal') api_edition.redimensionner(idE,idM,delta); else envoyer({t:'taille',module:idM,de_ecran:idE,delta}); }
  function demanderMicro(){ if(ROLE==='principal'){ try{ return B.demander('rayle:conversation'); }catch(e){} } else envoyer({t:'micro'}); }

  /* ───── canal entre fenêtres ───── */
  let surfaceSat=null, vuPrincipal=Date.now(), avertissement=null;   // satellite : surface affichée, dernier signe de la fenêtre principale, bandeau « principale fermée »
  function recevoir(m){
    if(!C.messageValide(m)||m.de===MOI) return;
    if(ROLE==='principal'){
      switch(m.t){
        case 'bonjour': case 'demande_etat': diffuserDispo(); envoyer({t:'statut',etat:etatRayle,historique:historique.slice()}); if(m.t==='bonjour') vivants.set(m.de,Date.now()); break;
        case 'vivant': { const nouveau=!vivants.has(m.de); vivants.set(m.de,Date.now()); if(nouveau) change(); break; }
        case 'absent': if(vivants.delete(m.de)) change(); break;
        case 'micro': demanderMicro(); break;
        case 'deplacer': if(actif) api_edition.deplacer(m.module,m.de_ecran,m.vers); break;
        case 'taille': if(actif&&Number.isFinite(m.delta)) api_edition.redimensionner(m.de_ecran,m.module,Math.max(-1,Math.min(1,m.delta))); break;
        case 'raccourci': if(m.nom==='bascule') basculer().then(r=>annoncer(r.texte)); else fermerTout(); break;
      }
      return;
    }
    // satellite : seuls les messages de la fenêtre principale comptent
    if(m.de!=='principal') return;
    vuPrincipal=Date.now(); if(avertissement) majAvertissement();
    switch(m.t){
      case 'dispo': appliquerSatellite(m); break;
      case 'statut': if(m.etat){ etatRayle=m.etat; diffuserLocal('etat',{etat:m.etat}); } if(Array.isArray(m.historique)&&!historique.length) m.historique.forEach(l=>noter(l.kind,l.texte)); break;
      case 'etat': etatRayle=m.etat&&m.etat.etat||m.etat; diffuserLocal('etat',{etat:etatRayle}); break;
      case 'ligne': noter(m.kind,m.texte); diffuserLocal('ligne',{kind:m.kind,texte:m.texte}); break;
      case 'interim': diffuserLocal('interim',{texte:m.texte||''}); break;
      case 'voix': if(surfaceSat) surfaceSat.voix(m.texte); break;
      case 'jeu': document.body.classList.toggle('mode-jeu',!!m.actif); B.emit('mode:jeu',{actif:!!m.actif}); break;
      case 'absent': vuPrincipal=0; majAvertissement(); break;
    }
  }
  if(canal) canal.onmessage=e=>recevoir(e.data);

  /* ───── satellite ───── */
  function appliquerSatellite(m){
    ecransSatellite=C.normaliserEcrans(m.ecrans||[]);
    let hote=document.getElementById('multi-satellite');
    if(!hote){
      hote=document.createElement('div'); hote.id='multi-satellite'; document.body.appendChild(hote);
      const x=document.createElement('button'); x.type='button'; x.id='multi-fermer-fenetre'; x.title='Fermer cette fenêtre (les autres restent ouvertes)'; x.textContent='✕';
      x.addEventListener('click',()=>serveur('fermer',{id:SAT.id})); document.body.appendChild(x);
    }
    const mon=m.actif?C.fenetresSouhaitees(m.disp||C.dispositionVide(),ecransSatellite,m.principalId).satellites.find(s=>s.id===SAT.id):null;
    if(!mon){
      if(surfaceSat){ surfaceSat.vider(); surfaceSat=null; }
      hote.className=''; hote.innerHTML='<div class="mx-attente">'+(m.actif?'Aucun module sur cet écran dans la disposition « '+M.esc(m.nom||'')+' ».':'Mode multi-écrans désactivé : cette fenêtre va se fermer.')+'</div>'; return;
    }
    if(!surfaceSat||surfaceSat.pourEcran!==mon.ecran.id){   // la surface est liée à l'écran (boutons « ↦ n ») : recréée si l'écran change
      if(surfaceSat) surfaceSat.vider();
      hote.innerHTML=''; surfaceSat=creerSurface(hote,mon.ecran.id); surfaceSat.pourEcran=mon.ecran.id;
    }
    document.title='Raylé · écran '+mon.ecran.numero+' [rayle-sat-'+SAT.id+']';
    surfaceSat.maj(mon.modules,mon.ecran);
  }
  function majAvertissement(){
    const perdu=ROLE==='satellite'&&Date.now()-vuPrincipal>DELAI_VIVANT+3000;
    if(!perdu){ if(avertissement){ avertissement.remove(); avertissement=null; } return; }
    if(avertissement) return;
    avertissement=document.createElement('div'); avertissement.className='mx-principal-absent';
    avertissement.innerHTML='<b>La fenêtre principale de Raylé est fermée.</b><p>Cette fenêtre attend son retour. Elle se reconnecte toute seule.</p><button type="button">Tout fermer</button>';
    avertissement.querySelector('button').addEventListener('click',()=>fermerTout());
    document.body.appendChild(avertissement);
  }

  function annoncer(t){ if(!t) return; try{ addLine('ray',t); speak(t); }catch(e){} }

  /* ───── voix : phrases du mode multi-écrans (passent par le bus d'ordres) ───── */
  const NOMS_TYPES={actus:'les actualités',fil:'le fil d’actualité',conversation:'la conversation',meteo:'la météo',terre:'la Terre',galaxie:'la galaxie',rayle:'Raylé'};
  async function ordre(action,params){
    try{ if(window.RayleGalaxie) await window.RayleGalaxie.preparer(); }catch(e){}
    const r=await RayleOrdres.envoyer({de:'rayle',vers:'rayle',action,params});
    return r.ok?(r.texte||'C’est fait.'):'Je n’ai pas pu le faire : '+r.erreur+'.';
  }
  function nomsDispositions(){ return etat?Object.keys(etat.dispositions):[]; }
  function trouverNom(nom){
    if(!etat) return null; const exact=C.trouverDisposition(etat,nom); if(exact) return exact;
    const n=C.sans(nom), cand=nomsDispositions().filter(k=>C.sans(k).includes(n)||n.includes(C.sans(k))); return cand.length===1?cand[0]:null;
  }
  async function executer(a){
    switch(a.type){
      case 'activer': return ordre('multi_ecrans',{etat:'actif'});
      case 'desactiver': return ordre('multi_ecrans',{etat:'inactif'});
      case 'disposition': if(!etat) await detecter(); return ordre('disposition',{nom:a.nom});
      case 'identifier': return ordre('identifier_ecrans',{});
      case 'fermer_tout': return ordre('fermer_tout',{});
      case 'deplacer': return ordre('deplacer_module',{module:a.module,ecran:a.numero});
      case 'liste': { if(!etat) await detecter(); const l=nomsDispositions(); return l.length?'Tes dispositions : '+l.join(', ')+'. Actuellement : '+etat.courante+'.':'Je n’ai aucune disposition enregistrée.'; }
    }
    return null;
  }
  /* true si la phrase (déjà simplifiée par cmdNorm) est une commande du mode multi-écrans ; l'exécution et la réponse parlée suivent */
  function voix(c){
    if(ROLE!=='principal') return false;
    const a=C.analyserCommandeVoix(c,{actif}); if(!a) return false;
    executer(a).then(t=>annoncer(t)).catch(e=>annoncer('Je n’ai pas pu le faire : '+(e&&e.message||e)+'.'));
    return true;
  }
  function diffuserVoix(texte){ if(ROLE==='principal'&&actif&&texte) envoyer({t:'voix',texte:String(texte).slice(0,300)}); }

  /* ───── enregistrement des ordres sur le bus ───── */
  function brancherOrdres(){
    const O=window.RayleOrdres; if(!O||ROLE!=='principal') return;
    const mettre=(action,fn)=>{ try{ if(!O.disponible('rayle',action)) O.enregistrer('rayle',action,fn,{delai:90000}); }catch(e){} };
    mettre('multi_ecrans',async({etat:e})=>{ const r=await(e==='actif'?activer():desactiver()); return {ok:r.ok!==false,texte:r.texte,erreur:r.ok===false?r.texte:undefined}; });
    mettre('disposition',async({nom})=>{
      if(!etat) await detecter(); if(!etat) return {ok:false,erreur:'je ne vois pas tes écrans : '+raison};
      const vrai=trouverNom(nom); if(!vrai) return {ok:true,texte:'Je ne connais pas la disposition « '+nom+' ». J’ai : '+(nomsDispositions().join(', ')||'aucune')+'.'};
      const r=api_edition.choisir(vrai); if(r.erreur) return {ok:false,erreur:r.erreur};
      if(!actif) return {ok:true,texte:'Disposition '+vrai+' choisie. Dis « active le mode multi-écrans » pour l’afficher.'};
      const x=await appliquer();
      return {ok:true,texte:'Disposition '+vrai+(x.erreurs.length?' : '+x.erreurs.join(' ; ')+'.':'.')};
    });
    mettre('identifier_ecrans',async()=>{ const r=await identifier(); return {ok:r.ok,texte:r.texte,erreur:r.ok?undefined:r.texte}; });
    mettre('fermer_tout',async()=>{ setTimeout(()=>fermerTout(),2200); return {ok:true,texte:'Je ferme tout. À bientôt, Justin.'}; });
    mettre('deplacer_module',async({module:type,ecran:numero})=>{
      if(!actif) return {ok:true,texte:'Le mode multi-écrans n’est pas actif.'};
      const cible=ecrans.find(e=>e.numero===numero); if(!cible) return {ok:true,texte:'Je ne vois pas d’écran numéro '+numero+'.'};
      let n=0, d=copie(disp());
      for(const [idE,mods] of Object.entries(d.ecrans)) for(const m of mods.slice()) if(m.type===type&&idE!==cible.id){ const r=C.deplacerModule(d,idE,m.id,cible.id); if(!r.erreur){ d=r.disp; n++; } }
      if(!n) return {ok:true,texte:(NOMS_TYPES[type]||'Ce module')+' est déjà sur l’écran '+numero+'.'};
      edit(()=>({disp:d}));
      return {ok:true,texte:'J’envoie '+(NOMS_TYPES[type]||'ce module')+' sur l’écran '+numero+'.'};
    });
  }

  /* ───── raccourcis clavier (toutes les fenêtres) ───── */
  document.addEventListener('keydown',e=>{
    if(e.key!=='F9'||e.altKey||e.metaKey||e.shiftKey) return;
    e.preventDefault();
    if(e.ctrlKey){ if(ROLE==='principal') fermerTout(); else { envoyer({t:'raccourci',nom:'fermer-tout'}); fermerTout(); } return; }
    if(ROLE==='principal') basculer().then(r=>annoncer(r.texte)); else envoyer({t:'raccourci',nom:'bascule'});
  });

  /* ───── démarrage ───── */
  if(ROLE==='principal'){
    B.on('raylé:etat',d=>{ etatRayle=d&&d.etat||'idle'; diffuserLocal('etat',{etat:etatRayle}); if(actif) envoyer({t:'etat',etat:etatRayle}); });
    B.on('raylé:reponse',d=>{ noter('ray',d.texte); diffuserLocal('ligne',{kind:'ray',texte:d.texte}); if(actif) envoyer({t:'ligne',kind:'ray',texte:d.texte}); });
    B.on('raylé:question',d=>{ noter('user',d.texte); diffuserLocal('ligne',{kind:'user',texte:d.texte}); if(actif) envoyer({t:'ligne',kind:'user',texte:d.texte}); });
    B.on('mode:jeu',d=>{ if(actif) envoyer({t:'jeu',actif:!!(d&&d.actif)}); });
    window.addEventListener('pagehide',()=>envoyer({t:'absent'}));
    document.addEventListener('DOMContentLoaded',()=>{
      const it=document.getElementById('interim'); if(it&&window.MutationObserver) new MutationObserver(()=>{ const t=it.textContent.replace(/^…\s*/,''); const texte=/^zz/.test(t)?'':t; diffuserLocal('interim',{texte}); if(actif) envoyer({t:'interim',texte}); }).observe(it,{childList:true,characterData:true,subtree:true});
      setTimeout(brancherOrdres,0);
    });
    brancherOrdres();
    setInterval(()=>{ if(actif){ envoyer({t:'statut',etat:etatRayle}); change(); } },3000);
    setInterval(()=>{ const t=Date.now(); for(const [i,v] of vivants) if(t-v>60000) vivants.delete(i); },20000);
    // au démarrage : « Rayle Multi-écrans » (?multi=1) active le mode ; un rechargement de la page reprend les fenêtres déjà ouvertes ; le raccourci normal ne change rien
    // le raccourci « Rayle Multi-écrans » cliqué alors que Rayle est déjà ouvert dépose une demande au serveur local : la page la lit (une requête toutes les 3 s, uniquement si le serveur connaît le mode)
    const sonder=async()=>{
      const e=await serveur('etat'); if(!(e&&e.ok&&e.version)){ serveurAncien=!!(e&&e.ancien); return; }
      if(typeof e.application==='boolean') application=e.application;
      setInterval(async()=>{ const d=await serveur('demande'); if(d&&d.ok&&d.activer&&!actif) activer().then(r=>annoncer(r.texte)); },3000);
    };
    window.addEventListener('load',()=>setTimeout(()=>sonder().catch(()=>{}),1500));
    const veutMulti=/[?&]multi=1(?:&|$)/.test(location.search);
    const demarrer=async()=>{
      if(veutMulti){ await attendre(1200); const r=await activer(); if(r.texte) annoncer(r.ok?'':r.texte); return; }
      const brut=lireStocke(); if(!brut||brut.actif!==true) return;
      const f=await serveur('fenetres'); if(!(f&&f.ok)) return;
      const sats=(f.fenetres||[]).filter(x=>/\[rayle-sat-/.test(x.titre)); if(!sats.length){ return; }
      await detecter(); actif=true; if(etat){ etat.actif=true; } await appliquer();
    };
    window.addEventListener('load',()=>setTimeout(()=>demarrer().catch(e=>console.warn('[multi]',e)),900));
  }else{
    const bonjour=()=>{ envoyer({t:'bonjour'}); envoyer({t:'demande_etat'}); };
    bonjour(); const essai=setInterval(()=>{ if(surfaceSat) return clearInterval(essai); bonjour(); },1500);
    setInterval(()=>{ envoyer({t:'vivant'}); majAvertissement(); },PERIODE_VIE);
    window.addEventListener('pagehide',()=>envoyer({t:'absent'}));   // fenêtre fermée : la principale le sait tout de suite
  }

  window.MultiEcrans={role:ROLE,lancerApplication,application:()=>application,serveurAncien:()=>serveurAncien,estSatellite:ROLE==='satellite',
    etat:()=>etat?copie(etat):null,ecrans:()=>ecransConnus().slice(),principalId:()=>principalId,actif:()=>actif,disponible:()=>serveurDispo,raison:()=>raison,
    detecter,activer,desactiver,basculer,fermerTout,identifier,edition:api_edition,voix,diffuserVoix,appliquer,
    fenetresVivantes,disposition:()=>disp()?copie(disp()):null,
    surChangement:fn=>B.on('multi:change',fn)};
})();
