"use strict";
/* ═════════════ VUES : Raylé (par défaut), terminal et galaxie, dans la même page ═════════════
   Le terminal (#vueTerminal) et la galaxie (#vueGalaxie) sont des vues plein écran chargées à la première ouverture.
   Demandes par le bus : emit('vue:demande',{vue:'terminal'|'galaxie'|'rayle'}) ou demander('vue:ouvrir', 'terminal'|'galaxie').
   Réponse : emit('vue:changee',{vue}). Un seul écran à la fois. */
(function(){
  const VUES={
    terminal:{el:()=>document.getElementById('vueTerminal'), hash:'#terminal', classe:'vue-terminal', libelle:'Terminal',
      charger:()=>import(new URL('terminal/js/terminal.js?v=2026.10.10.7',document.baseURI).href)},
    galaxie:{el:()=>document.getElementById('vueGalaxie'), hash:'#galaxie', classe:'vue-galaxie', libelle:'Galaxie',
      charger:()=>import(new URL('galaxie/vue.js',document.baseURI).href)}
  };
  let vue='rayle', pousse=false;
  /* V7b : le mode Galaxie est RÉSERVÉ AU PC. Sur téléphone et tablette on reste sur Jarvis : la demande est refusée poliment, rien de la galaxie n'est chargé (ni scripts, ni textures, ni three.js). */
  const galaxieRefusee=v=>v==='galaxie'&&window.RayleAppareil&&!RayleAppareil.galaxieAutorisee();
  function refuserGalaxie(){
    const m=(window.RayleAppareil&&RayleAppareil.MESSAGE_GALAXIE)||'Le mode Galaxie est réservé au PC ; ici je reste sur Jarvis.';
    try{ RayleBus.fusion('galaxie',{ouvert:false,erreur:m,refusee:true}); }catch(e){}
    RayleBus.emit('vue:erreur',{message:m}); RayleBus.emit('vue:refusee',{vue:'galaxie',message:m});
    try{ if(location.hash==='#galaxie') history.replaceState(null,'',location.pathname+location.search); }catch(e){}
  }
  const modules={}, chargements={};

  function charger(nom){
    if(modules[nom]) return Promise.resolve(modules[nom]);
    if(!chargements[nom]) chargements[nom]=VUES[nom].charger().then(m=>{ modules[nom]=m; return m; }).catch(e=>{ chargements[nom]=null; throw e; });
    return chargements[nom];
  }
  function masquer(nom){
    const d=VUES[nom]; d.el().hidden=true; document.body.classList.remove(d.classe);
    if(modules[nom]) modules[nom].fermer();
  }
  async function afficher(v){
    if(galaxieRefusee(v)){ refuserGalaxie(); v='rayle'; }
    if(v===vue) return;
    let m=null;
    if(v!=='rayle'){
      try{ m=await charger(v); }
      catch(e){ RayleBus.emit('vue:erreur',{message:VUES[v].libelle+' impossible à charger : '+(e&&e.message||e)}); return; }
      if(v===vue) return;   // une autre demande a abouti pendant le chargement
    }
    if(vue!=='rayle') masquer(vue);
    vue=v;
    if(v!=='rayle'){ const d=VUES[v]; d.el().hidden=false; document.body.classList.add(d.classe);
      try{ await m.ouvrir(); }
      catch(e){ d.el().hidden=true; document.body.classList.remove(d.classe); vue='rayle'; RayleBus.emit('vue:changee',{vue}); return; }   // l'erreur est déjà signalée par la vue (vue:erreur)
    }
    RayleBus.fusion('terminal',{ouvert:vue==='terminal'});
    RayleBus.fusion('galaxie',{ouvert:vue==='galaxie'});
    RayleBus.emit('vue:changee',{vue});
  }
  const depuisHash=h=>Object.keys(VUES).find(k=>VUES[k].hash===h)||'rayle';
  function ouvrir(v){
    if(galaxieRefusee(v)){ refuserGalaxie(); return Promise.resolve(); }
    if(vue===v) return Promise.resolve();
    const h=VUES[v].hash;
    if(location.hash!==h){
      try{
        if(vue==='rayle'){ history.pushState(null,'',h); pousse=true; }
        else history.replaceState(null,'',h);     // d'une vue à l'autre : on garde une seule entrée d'historique
      }catch(e){}
    }
    return afficher(v);
  }
  function retour(){
    if(vue==='rayle') return;
    // On ferme la vue tout de suite (sans attendre popstate, qui n'arrive pas toujours), puis on nettoie l'adresse
    afficher('rayle');
    if(pousse){ pousse=false; if(depuisHash(location.hash)!=='rayle'){ try{ history.back(); }catch(e){} } return; }
    try{ history.replaceState(null,'',location.pathname+location.search); }catch(e){}
  }
  window.addEventListener('popstate',()=>afficher(depuisHash(location.hash)));
  RayleBus.on('vue:demande',d=>{ if(d&&VUES[d.vue]) ouvrir(d.vue); else retour(); });
  RayleBus.fournir('vue',()=>vue);
  RayleBus.fournir('vue:ouvrir',v=>ouvrir(VUES[v]?v:'terminal'));   // sans argument : le terminal (ancien comportement)
  RayleBus.fournir('vue:fermer',retour);

  document.addEventListener('DOMContentLoaded',()=>{
    const lier=(id,fn)=>{ const e=document.getElementById(id); if(e) e.addEventListener('click',fn); };
    lier('btnOuvrirTerminal',()=>ouvrir('terminal'));
    lier('btnOuvrirGalaxie',()=>ouvrir('galaxie'));
    lier('btnRetour',retour);
    const v=depuisHash(location.hash);
    if(v!=='rayle') afficher(v);   // ancienne adresse du terminal, ou lien direct
  });
})();
