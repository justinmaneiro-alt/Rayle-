"use strict";
/* ═════════════ DONNÉES DE KEPLER POUR LA COQUE MOBILE (V8) ═════════════
   UN SEUL agent Kepler : le téléphone et la tablette affichent les mêmes données que le PC. Source : le service du PC en priorité (route locale /__agent/mobile, seulement quand la page est servie
   par le PC), sinon le Worker (/agent/mobile : copie compacte publiée par le service, avec l'heure de dernière mise à jour). Rafraîchissement lent (le Worker garde 45 s de copie ; budget D1).
   Réponse : { paquet, origine: 'PC'|'Worker', recuLe, pcVivantLe, pcVivant, t } ; paquet = positions du jour, bilan, types de setup, performance simulée, pistes, équipe, occasions, exemples, données.
   Commandes (pause, reprise, charge) : service du PC si joignable, sinon Worker (le PC les applique à son prochain battement). Aucun ordre de trading n'existe nulle part. */
(function(){
  const C=window.MobileCalcul; if(!C) return;
  const local=()=>/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
  const PC_VIVANT_MS=4*60e3;
  async function lire(){
    if(local()){
      try{
        const r=await fetch('/__agent/mobile',{cache:'no-store',signal:AbortSignal.timeout(8000)});
        if(r.ok){ const j=await r.json(); if(j&&j.ok&&j.paquet) return {paquet:j.paquet,origine:'PC',recuLe:j.recuLe,pcVivantLe:j.pcVivantLe,pcVivant:!!(j.pcVivantLe&&Date.now()-j.pcVivantLe<PC_VIVANT_MS),t:Date.now()}; }
      }catch(e){ /* le PC ne répond pas : le Worker prend le relais */ }
    }
    let pret=false; try{ pret=typeof workerReady==='function'&&!!workerReady(); }catch(e){}
    if(!pret||!window.wjson) throw new Error('Raylé est verrouillée : entre ton code dans les réglages pour lire l’agent');
    const j=await window.wjson('/agent/mobile',15000);
    if(!j||!j.existe) throw new Error((j&&j.note)||'Le PC n’a pas encore publié de données de l’agent');
    return {paquet:j.paquet,origine:'Worker',recuLe:j.recuLe,pcVivantLe:j.pcVivantLe,pcVivant:!!(j.pcVivantLe&&(j.maintenant||Date.now())-j.pcVivantLe<PC_VIVANT_MS),t:Date.now()};
  }
  async function commande(type,valeur){
    if(!['pause','reprendre','charge','rapport','reglages','niveau_preuve','observation'].includes(type)) throw new Error('commande inconnue');
    if(local()){
      try{ const r=await fetch(type==='reglages'?'/__agent/positions/commande':'/__agent/commande',{method:'POST',headers:{'Content-Type':'application/json','X-Rayle-Multi':'1'},body:JSON.stringify({type,valeur}),signal:AbortSignal.timeout(8000)}); if(r.ok){ const j=await r.json().catch(()=>null); if(j&&j.ok===true) return {ok:true,via:'PC'}; } }catch(e){ /* Worker */ }
    }
    if(!window.wfetch) throw new Error('liaison indisponible');
    const r=await window.wfetch('/agent/commande',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,valeur})},15000);
    if(!r.ok) throw new Error('HTTP '+r.status);
    return {ok:true,via:'Worker'};
  }
  /* Marquer un exemple (« ici j'aurais pris ça ») : transmis au service du PC, directement ou par le Worker (le PC l'analyse à son prochain battement). */
  async function exemple(valeur){
    if(local()){
      try{ const r=await fetch('/__agent/positions/commande',{method:'POST',headers:{'Content-Type':'application/json','X-Rayle-Multi':'1'},body:JSON.stringify({type:'exemple',valeur}),signal:AbortSignal.timeout(8000)}); if(r.ok){ const j=await r.json().catch(()=>null); if(j&&j.ok===true) return {ok:true,via:'PC'}; } }catch(e){}
    }
    if(!window.wfetch) throw new Error('liaison indisponible');
    const r=await window.wfetch('/agent/commande',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'exemple',valeur})},15000);
    if(!r.ok) throw new Error('HTTP '+r.status);
    return {ok:true,via:'Worker',note:'transmis ; le PC l’analysera à son prochain battement (PC éteint : il attend)'};
  }
  /* Un seul abonnement aux données de l'agent pour toute la coque (accueil, écran Agent) : une copie en cache (rafraîchie toutes les 2 min tant que l'écran est visible) ; les abonnés reçoivent
     { data, meta: { t, perime }, bandeau: { genre, texte } }. */
  let ctrl=null, courant={data:null,meta:null,bandeau:null}; const abonnes=new Set();
  const diffuser=()=>abonnes.forEach(f=>{ try{ f(courant); }catch(e){ console.error(e); } });
  function demarrer(){
    if(ctrl||!window.MobileDonnees) return;
    ctrl=window.MobileDonnees.suivre({cle:'agent',zone:document.createElement('div'),ttl:2*60e3,charger:lire,squelette:'carte',
      rendre:(c,d,meta)=>{ courant={...courant,data:d,meta}; diffuser(); },
      surEtat:b=>{ courant={...courant,bandeau:b.genre?b:null}; diffuser(); }});
  }
  function observer(f){ abonnes.add(f); demarrer(); if(courant.data||courant.bandeau) f(courant); return ()=>abonnes.delete(f); }
  const rafraichir=()=>{ demarrer(); return ctrl&&ctrl.rafraichir(); };
  window.MobileAgentDonnees={lire,commande,exemple,local,observer,rafraichir,etat:()=>courant};
})();
