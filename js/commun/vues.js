"use strict";
/* ═════════════ VUES : Raylé (par défaut), terminal et Anatomie & Orthopédie, dans la même page ═════════════
   Le terminal et les fenêtres Anatomie et Cerveau sont des vues plein écran (#vueTerminal, #vueAnatomie, #vueCerveau) chargées à la première ouverture.
   Demandes par le bus : emit('vue:demande',{vue:'terminal'|'anatomie'|'rayle', options}). Réponse : emit('vue:changee',{vue}).
   Services : 'vue' (vue courante) · 'vue:ouvrir' (terminal) · 'vue:ouvrir-anatomie'(options) · 'vue:ouvrir-cerveau'(options) · 'vue:fermer' (ferme la vue ouverte, quelle qu'elle soit). */
(function(){
  const PLEINES={
    terminal:{ el:'vueTerminal', url:'js/terminal/terminal.js?v=2026.10.14.2', hash:'#terminal', classe:'vue-terminal', erreur:'Terminal impossible à charger : ', bus:'terminal' },
    anatomie:{ el:'vueAnatomie', url:'js/anatomie/fenetre.js?v=2026.10.14.2', hash:'#anatomie', classe:'vue-anatomie', erreur:'Anatomie impossible à charger : ', bus:'anatomie' },
    cerveau:{ el:'vueCerveau', url:'js/anatomie/cerveau-fenetre.js?v=2026.10.14.2', hash:'#cerveau', classe:'vue-cerveau', erreur:'Cerveau impossible à charger : ', bus:'cerveau' }
  };
  let vue='rayle', pousse=false;
  const modules={}, chargements={};

  function charger(nom){
    if(modules[nom]) return Promise.resolve(modules[nom]);
    if(!chargements[nom]) chargements[nom]=import(new URL(PLEINES[nom].url,document.baseURI).href).then(m=>{ modules[nom]=m; return m; }).catch(e=>{ chargements[nom]=null; throw e; });
    return chargements[nom];
  }
  function fermerVue(nom){
    const p=PLEINES[nom]; if(!p) return;
    document.getElementById(p.el).hidden=true; document.body.classList.remove(p.classe);
    if(modules[nom]) modules[nom].fermer();
    RayleBus.fusion(p.bus,{ouvert:false});
  }
  async function afficher(v,options){
    if(v===vue && !((v==='anatomie' || v==='cerveau') && options)) return;
    if(PLEINES[v]){
      const p=PLEINES[v]; let m;
      try{ m=await charger(v); }
      catch(e){ RayleBus.emit('vue:erreur',{message:p.erreur+(e&&e.message||e)}); return; }
      if(vue!=='rayle' && vue!==v) fermerVue(vue);            // une seule vue plein écran à la fois
      vue=v; document.getElementById(p.el).hidden=false; document.body.classList.add(p.classe);
      m.ouvrir(options);
    }else{
      if(vue!=='rayle') fermerVue(vue);
      vue='rayle';
    }
    RayleBus.fusion('terminal',{ouvert:vue==='terminal'});
    RayleBus.fusion('anatomie',{ouvert:vue==='anatomie'});
    RayleBus.fusion('cerveau',{ouvert:vue==='cerveau'});
    RayleBus.emit('vue:changee',{vue});
  }
  function ouvrirVue(nom,options){
    const p=PLEINES[nom];
    if(vue===nom && !options) return Promise.resolve();
    if(vue!==nom && location.hash!==p.hash){ try{ history.pushState(null,'',p.hash); pousse=true; }catch(e){} }
    return afficher(nom,options);
  }
  const ouvrirTerminal=()=>ouvrirVue('terminal');
  const ouvrirAnatomie=options=>ouvrirVue('anatomie',options||null);
  const ouvrirCerveau=options=>ouvrirVue('cerveau',options||null);
  function retour(){
    if(vue==='rayle') return;
    const hash=PLEINES[vue].hash;
    // On ferme la vue tout de suite (sans attendre popstate, qui n'arrive pas toujours), puis on nettoie l'adresse
    afficher('rayle');
    if(pousse){ pousse=false; if(location.hash===hash){ try{ history.back(); }catch(e){} } return; }
    try{ history.replaceState(null,'',location.pathname+location.search); }catch(e){}
  }
  const depuisAdresse=()=>location.hash==='#terminal'?'terminal':location.hash==='#anatomie'?'anatomie':location.hash==='#cerveau'?'cerveau':'rayle';
  window.addEventListener('popstate',()=>afficher(depuisAdresse()));
  RayleBus.on('vue:demande',d=>{ if(d&&PLEINES[d.vue]) ouvrirVue(d.vue,d.options||null); else retour(); });
  RayleBus.fournir('vue',()=>vue);
  RayleBus.fournir('vue:ouvrir',ouvrirTerminal);
  RayleBus.fournir('vue:ouvrir-anatomie',ouvrirAnatomie);
  RayleBus.fournir('vue:ouvrir-cerveau',ouvrirCerveau);
  RayleBus.fournir('vue:fermer',retour);

  document.addEventListener('DOMContentLoaded',()=>{
    const o=document.getElementById('btnOuvrirTerminal'), r=document.getElementById('btnRetour'), a=document.getElementById('btnOuvrirAnatomie');
    if(o) o.addEventListener('click',ouvrirTerminal);
    if(a) a.addEventListener('click',()=>ouvrirAnatomie());
    if(r) r.addEventListener('click',retour);
    const v=depuisAdresse();
    if(v!=='rayle') afficher(v);   // ancienne adresse du terminal, ou lien direct
  });
})();
