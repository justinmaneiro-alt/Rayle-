"use strict";
/* ═════════════ « MES ÉCRANS » : l'éditeur de disposition, dans ⚙ Réglages ═════════════
   - bouton Activer / Désactiver le mode multi-écrans, Identifier les écrans, Détecter de nouveau ;
   - carte de TES écrans dessinée à l'échelle (position, taille, orientation réelles) ; chaque module est une tuile : glisser-déposer pour la réorganiser
     ou l'envoyer sur un autre écran, clic pour la régler (taille, variante, ville…) ou la retirer ;
   - dispositions enregistrées : choisir, enregistrer sous un nom, renommer, dupliquer, supprimer.
   Tout changement s'applique en direct si le mode est actif. Les modules viennent du registre (multi-modules.js) : ceux des futures planètes apparaissent seuls. */
(function(){
  const E=window.MultiEcrans, C=window.MultiCalcul, M=window.MultiModules;
  if(!E||!C||!M||E.estSatellite) return;
  const $=id=>document.getElementById(id), esc=M.esc;
  const racine=$('mxEditeur'), bouton=$('mxBascule'), etatEl=$('mxEtat'), info=$('mxInfo');
  if(!racine||!bouton) return;
  let selEcran=null, selModule=null, message='', confirmer=false, ouvert=false, timerMsg=0, viderNom=false;

  const dire=(t,erreur)=>{ message=t||''; racine.dataset.erreur=erreur?'1':''; clearTimeout(timerMsg); if(t) timerMsg=setTimeout(()=>{ message=''; rendre(); },8000); };
  const ecrans=()=>E.ecrans(), etat=()=>E.etat(), disp=()=>E.disposition();
  const nomModule=m=>M.libelle(m);
  const iconeModule=m=>(M.obtenir(m.type)||{}).icone||'▣';
  function actionner(r,ok,viderChamp){ if(r&&r.erreur) dire(r.erreur,true); else{ if(ok) dire(ok); if(viderChamp) viderNom=true; } rendre(); }

  function rendreEtatHaut(){
    const a=E.actif(), dispo=E.disponible();
    bouton.textContent=a?'Désactiver le mode multi-écrans':'Activer le mode multi-écrans';
    bouton.classList.toggle('ghost',a);
    etatEl.textContent=a?'ACTIF · '+(E.fenetresVivantes().length)+' fenêtre(s) ouverte(s)':dispo===false?'INDISPONIBLE':'désactivé';
    const n=ecrans().length;
    const app=E.application();
    info.innerHTML=(dispo===false?'<b>Indisponible pour le moment :</b> '+esc(E.raison())+'.<br>':'')
      +(dispo!==false&&app===false?'Rayle tourne ici dans un onglet de navigateur : le mode multi-écrans marche aussi (les fenêtres s’ouvrent dans ce navigateur), mais « Ferme tout » ne ferme pas cet onglet. <button type="button" class="ghost" id="mxLancer">Ouvrir l’application Rayle Multi-écrans</button><br>':'')
      +(n?n+' écran'+(n>1?'s':'')+' détecté'+(n>1?'s':'')+'. ':'')+'Raccourcis : <b>F9</b> active/désactive · <b>Ctrl + F9</b> ferme tout. Voix : « active le mode multi-écrans », « mets la disposition Trading », « ferme tout ».';
  }

  function tuile(m,ecran){
    const sel=selModule===m.id;
    return '<div class="mx-tuile'+(sel?' sel':'')+'" draggable="true" data-m="'+esc(m.id)+'" data-e="'+esc(ecran.id)+'" style="flex-grow:'+m.part+'" title="Glisser pour déplacer · clic pour régler">'
      +'<span class="mx-ti">'+esc(iconeModule(m))+'</span><span class="mx-tn">'+esc(nomModule(m))+'</span></div>';
  }
  function carteEcrans(){
    const l=ecrans(), d=disp(); if(!l.length) return '<p class="hint">Aucun écran détecté pour le moment. Clique « Détecter mes écrans ».</p>';
    const larg=Math.max(300,Math.min(780,(racine.clientWidth||700))), haut=Math.round(Math.min(300,larg*0.42));
    const g=C.echelleEditeur(l,larg,haut), vivants=E.fenetresVivantes();
    const rects=g.rects.map(r=>{
      const e=l.find(x=>x.id===r.id), mods=(d&&d.ecrans[e.id])||[], fid=C.fenetreId(e.id);
      const ouvertEtat=E.actif()&&!e.primaire?(vivants.includes(fid)?'<i class="mx-pt ok" title="fenêtre ouverte">●</i>':(mods.length?'<i class="mx-pt" title="fenêtre non ouverte">○</i>':'')):'';
      return '<div class="mx-ecran'+(selEcran===e.id?' sel':'')+(e.orientation==='vertical'?' vertical':'')+'" data-e="'+esc(e.id)+'" style="left:'+r.left.toFixed(1)+'px;top:'+r.top.toFixed(1)+'px;width:'+r.width.toFixed(1)+'px;height:'+r.height.toFixed(1)+'px">'
        +'<div class="mx-ecran-tete"><b>'+e.numero+'</b> '+(e.primaire?'principal · ':'')+e.w+'×'+e.h+' '+ouvertEtat+'</div>'
        +'<div class="mx-ecran-corps">'+(mods.length?mods.map(m=>tuile(m,e)).join(''):'<span class="mx-ecran-vide">écran non utilisé</span>')+'</div></div>';
    }).join('');
    return '<div class="mx-carte" style="width:'+larg+'px;height:'+haut+'px">'+rects+'</div>';
  }
  function barreDispositions(){
    const s=etat(); if(!s) return '';
    const opts=Object.keys(s.dispositions).map(n=>'<option'+(n===s.courante?' selected':'')+'>'+esc(n)+'</option>').join('');
    return '<div class="mx-ed-ligne"><label>Disposition <select id="mxDispoSel">'+opts+'</select></label>'
      +'<input type="text" id="mxNom" maxlength="40" placeholder="Nom (ex. Trading, Détente)" autocomplete="off" spellcheck="false" value="">'
      +'<button type="button" data-a="enreg" title="Enregistre la disposition actuelle sous ce nom">Enregistrer sous ce nom</button>'
      +'<button type="button" class="ghost" data-a="renom" title="Renomme la disposition choisie">Renommer en ce nom</button>'
      +'<button type="button" class="ghost" data-a="dupli">Dupliquer</button>'
      +'<button type="button" class="ghost" data-a="suppr">'+(confirmer?'Confirmer la suppression':'Supprimer')+'</button></div>';
  }
  function palette(){
    const l=ecrans(); if(!l.length||!etat()) return '';
    const cible=selEcran&&l.some(e=>e.id===selEcran)?selEcran:l[0].id;
    const groupes={};
    M.liste().forEach(d=>{ (groupes[d.groupe]=groupes[d.groupe]||[]).push(d); });
    const opts=Object.entries(groupes).map(([g,defs])=>'<optgroup label="'+esc(g)+'">'+defs.map(d=>d.variantes.map((v,i)=>'<option value="'+esc(d.type+'|'+i)+'">'+esc(d.icone+' '+(d.variantes.length>1?d.nom+' · '+v.nom:d.nom))+'</option>').join('')).join('')+'</optgroup>').join('');
    return '<div class="mx-ed-ligne"><label>Ajouter à l’écran <select id="mxVers">'+l.map(e=>'<option value="'+esc(e.id)+'"'+(e.id===cible?' selected':'')+'>'+e.numero+(e.primaire?' (principal)':'')+' — '+e.w+'×'+e.h+'</option>').join('')+'</select></label>'
      +'<label>module <select id="mxType">'+opts+'</select></label><button type="button" data-a="ajout">+ Ajouter</button></div>';
  }
  function inspecteur(){
    const d=disp(); if(!d||!selModule) return '';
    let m=null, idE=null; for(const [e,l] of Object.entries(d.ecrans)){ const x=l.find(y=>y.id===selModule); if(x){ m=x; idE=e; } }
    if(!m) return '';
    const def=M.obtenir(m.type)||{variantes:[]}, autres=ecrans().filter(e=>e.id!==idE);
    const cur=def.variantes.findIndex(v=>JSON.stringify(v.params||{})===JSON.stringify(m.params||{}));
    const variantes=def.variantes.length>1?'<label>Contenu <select id="mxVariante">'+(cur<0?'<option value="-1" selected>Personnalisé</option>':'')+def.variantes.map((v,i)=>'<option value="'+i+'"'+(i===cur?' selected':'')+'>'+esc(v.nom)+'</option>').join('')+'</select></label>':'';
    const champ=def.parametre?'<label>'+esc(def.parametre.libelle)+' <input type="text" id="mxChamp" placeholder="'+esc(def.parametre.texte||'')+'" value="'+esc((m.params||{}).ville||(m.params||{}).nom||'')+'" autocomplete="off" spellcheck="false"></label><button type="button" class="ghost" data-a="champ">Valider</button>':'';
    return '<div class="mx-insp" data-e="'+esc(idE)+'" data-m="'+esc(m.id)+'"><b>'+esc(iconeModule(m)+' '+nomModule(m))+'</b>'
      +(def.fond?'':'<span>Taille <button type="button" class="ghost" data-a="moins">−</button> '+m.part+' <button type="button" class="ghost" data-a="plus">+</button></span>')
      +variantes+champ
      +autres.map(e=>'<button type="button" class="ghost" data-a="vers" data-v="'+esc(e.id)+'">↦ écran '+e.numero+'</button>').join('')
      +'<button type="button" class="ghost" data-a="retirer">Retirer</button></div>';
  }

  function rendre(){
    rendreEtatHaut();
    if(!ouvert) return;
    const gardeNom=viderNom?'':((racine.querySelector('#mxNom')||{}).value||''); viderNom=false;
    racine.innerHTML=(E.disponible()===false&&!etat()?'<p class="hint">L’éditeur est disponible dans l’application PC de Rayle.</p>':barreDispositions()+carteEcrans()+inspecteur()+palette())
      +(message?'<div class="mx-ed-msg'+(racine.dataset.erreur?' erreur':'')+'" role="status">'+esc(message)+'</div>':'');
    const n=racine.querySelector('#mxNom'); if(n) n.value=gardeNom;
  }

  /* ───── interactions ───── */
  racine.addEventListener('click',async e=>{
    const t=e.target.closest('.mx-tuile'); if(t&&!e.target.closest('button')){ selModule=t.dataset.m; selEcran=t.dataset.e; rendre(); return; }
    const ec=e.target.closest('.mx-ecran'); if(ec&&!e.target.closest('button')&&!t){ selEcran=ec.dataset.e; selModule=null; rendre(); return; }
    const b=e.target.closest('button[data-a]'); if(!b) return;
    const nom=((racine.querySelector('#mxNom')||{}).value||'').trim(), insp=b.closest('.mx-insp');
    switch(b.dataset.a){
      case 'enreg': confirmer=false; { const r=E.edition.enregistrerSous(nom); actionner(r,'Disposition « '+(r.nom||nom)+' » enregistrée.',true); } break;
      case 'renom': confirmer=false; { const cur=(etat()||{}).courante; const r=E.edition.renommer(cur,nom); actionner(r,'Disposition renommée « '+nom+' ».',true); } break;
      case 'dupli': confirmer=false; { const cur=(etat()||{}).courante; const r=E.edition.dupliquer(cur,nom||cur+' (copie)'); actionner(r,'Disposition dupliquée.',true); } break;
      case 'suppr': if(!confirmer){ confirmer=true; rendre(); setTimeout(()=>{ if(confirmer){ confirmer=false; rendre(); } },4000); } else { confirmer=false; const r=E.edition.supprimer((etat()||{}).courante); actionner(r,'Disposition supprimée.'); } break;
      case 'ajout': { const idE=(racine.querySelector('#mxVers')||{}).value, [type,i]=String((racine.querySelector('#mxType')||{}).value||'').split('|'); const def=M.obtenir(type); if(!def||!idE) break;
        const r=E.edition.ajouterModule(idE,type,(def.variantes[Number(i)]||{}).params||{}); if(r.erreur) dire(r.erreur,true); else { selEcran=idE; selModule=r.module?r.module.id:null; dire('Module ajouté.'); } rendre(); break; }
      case 'plus': case 'moins': actionner(E.edition.redimensionner(insp.dataset.e,insp.dataset.m,b.dataset.a==='plus'?1:-1)); break;
      case 'retirer': actionner(E.edition.retirerModule(insp.dataset.e,insp.dataset.m),'Module retiré.'); selModule=null; rendre(); break;
      case 'vers': { const r=E.edition.deplacer(insp.dataset.m,insp.dataset.e,b.dataset.v); if(r.erreur) dire(r.erreur,true); else { selEcran=b.dataset.v; dire('Module déplacé.'); } rendre(); break; }
      case 'champ': await validerChamp(insp); break;
    }
  });
  racine.addEventListener('keydown',e=>{ if(e.key==='Enter'&&e.target.id==='mxChamp'){ e.preventDefault(); validerChamp(e.target.closest('.mx-insp')); } });
  racine.addEventListener('change',e=>{
    if(e.target.id==='mxDispoSel'){ confirmer=false; actionner(E.edition.choisir(e.target.value),'Disposition « '+e.target.value+' » choisie.'); }
    else if(e.target.id==='mxVariante'){ const insp=e.target.closest('.mx-insp'); let m=null; Object.values(disp().ecrans).forEach(l=>l.forEach(x=>{ if(x.id===insp.dataset.m) m=x; })); const def=M.obtenir(m.type), v=def.variantes[Number(e.target.value)]; if(v) actionner(E.edition.changerParams(insp.dataset.e,insp.dataset.m,v.params||{})); }
  });
  async function validerChamp(insp){
    const champ=insp.querySelector('#mxChamp'), texte=champ.value.trim(); let m=null; Object.values(disp().ecrans).forEach(l=>l.forEach(x=>{ if(x.id===insp.dataset.m) m=x; }));
    const def=M.obtenir(m.type); if(!def||!def.resoudre){ actionner(E.edition.changerParams(insp.dataset.e,insp.dataset.m,{...m.params,ville:texte})); return; }
    dire('Recherche de « '+texte+' »…'); rendre();
    try{ const p=await def.resoudre(texte); actionner(E.edition.changerParams(insp.dataset.e,insp.dataset.m,p),'Lieu : '+p.nom+'.'); }
    catch(err){ dire('Lieu introuvable : '+(err&&err.message||err),true); rendre(); }
  }
  // glisser-déposer : réorganiser, ou passer d'un écran à l'autre
  let glisse=null;
  racine.addEventListener('dragstart',e=>{ const t=e.target.closest&&e.target.closest('.mx-tuile'); if(!t) return; glisse={m:t.dataset.m,e:t.dataset.e}; try{ e.dataTransfer.setData('text/plain',t.dataset.m); e.dataTransfer.effectAllowed='move'; }catch(x){} t.classList.add('glisse'); });
  racine.addEventListener('dragend',()=>{ glisse=null; racine.querySelectorAll('.glisse,.depot').forEach(x=>x.classList.remove('glisse','depot')); });
  racine.addEventListener('dragover',e=>{ if(!glisse) return; const ec=e.target.closest('.mx-ecran'); if(!ec) return; e.preventDefault(); racine.querySelectorAll('.depot').forEach(x=>x.classList.remove('depot')); ec.classList.add('depot'); });
  racine.addEventListener('drop',e=>{
    if(!glisse) return; const ec=e.target.closest('.mx-ecran'); if(!ec) return; e.preventDefault();
    const vers=ec.dataset.e, vertical=ec.classList.contains('vertical');
    const tuiles=[...ec.querySelectorAll('.mx-tuile')].filter(t=>t.dataset.m!==glisse.m);
    let index=tuiles.length; for(let i=0;i<tuiles.length;i++){ const r=tuiles[i].getBoundingClientRect(); if((vertical?e.clientY<r.top+r.height/2:e.clientX<r.left+r.width/2)){ index=i; break; } }
    const r=E.edition.deplacer(glisse.m,glisse.e,vers,index); glisse=null;
    if(r.erreur) dire(r.erreur,true); else { selEcran=vers; selModule=null; } rendre();
  });

  info.addEventListener('click',async e=>{ if(e.target.id==='mxLancer'){ const r=await E.lancerApplication(); dire(r.texte,!r.ok); rendre(); } });
  bouton.addEventListener('click',async()=>{
    bouton.disabled=true; dire('…'); rendre();
    try{ const r=await E.basculer(); dire(r.texte||'',r.ok===false); }finally{ bouton.disabled=false; rendre(); }
  });
  $('mxIdentifier').addEventListener('click',async()=>{ const r=await E.identifier(); dire(r.texte,!r.ok); rendre(); });
  $('mxDetecter').addEventListener('click',async()=>{ dire('Détection des écrans…'); rendre(); await E.detecter(); const n=ecrans().length; dire(E.disponible()?n+' écran'+(n>1?'s':'')+' détecté'+(n>1?'s':'')+'.':E.raison(),!E.disponible()); rendre(); });

  E.surChangement(()=>rendre());
  // ouverture de ⚙ : on détecte les écrans et on dessine l'éditeur (une fois le panneau visible)
  const gear=$('gear'), cfg=$('cfg');
  function ouverture(){ const o=cfg.classList.contains('open'); if(o&&!ouvert){ ouvert=true; (E.disponible()===null||!ecrans().length?E.detecter():Promise.resolve()).then(()=>{ if(!selEcran&&ecrans().length) selEcran=(ecrans().find(e=>e.id===E.principalId())||ecrans()[0]).id; rendre(); }); rendre(); } else if(!o) ouvert=false; }
  new MutationObserver(ouverture).observe(cfg,{attributes:true,attributeFilter:['class']});
  if(gear) gear.addEventListener('click',()=>setTimeout(ouverture,0));
  window.addEventListener('resize',()=>{ if(ouvert) rendre(); });
  rendreEtatHaut();
})();
