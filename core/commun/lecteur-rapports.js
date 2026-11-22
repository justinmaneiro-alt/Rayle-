"use strict";
/* ═════════════ RAPPORTS GUIDÉS (v11) : point d'entrée léger ═════════════
   « Rayle, rapport complet sur l'or » / « rapport COT sur le Nasdaq » / « rapport sur le marché » / « quelles annonces cette semaine ? » ouvre une visite guidée animée et parlée (trader-pro/rapports/).
   Ce script est minuscule : le lecteur (modules ES) n'est chargé qu'à la première demande d'un rapport ; pendant un rapport, Application.commande lui passe d'abord chaque phrase
   (suivant, reviens, pause, reprends, stop, détaille ça, montre-moi sur le graphique). API : window.LecteurRapports = { commande(texte), actif(), lancer({type,actif}), etat(), moteur(), historique() }. */
(function(){
  let L=null, chargement=null;
  const DEMANDE=/\b(rapports?|annonces? (de |cette )?semaine|quelles annonces)\b/i;
  const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’'`]/g,' ');
  const charger=()=>chargement||(chargement=import(new URL('trader-pro/rapports/lecteur.js',document.baseURI).href).then(m=>{ L=m.creerLecteurReel(); return L; }).catch(e=>{ chargement=null; throw e; }));
  function commande(texte){
    if(L&&L.moteur.actif()) return L.moteur.commande(texte);            // pendant un rapport : contrôle immédiat (synchrone)
    if(!DEMANDE.test(norm(texte))) return null;                           // le reste de l'application n'est pas ralenti
    return charger().then(l=>l.moteur.commande(texte)).catch(e=>{ try{ addLine('sys','Rapport guidé indisponible : '+((e&&e.message)||e)); }catch(x){} return null; });
  }
  window.LecteurRapports={
    commande, actif:()=>!!(L&&L.moteur.actif()), charger,
    lancer:async o=>(await charger()).moteur.lancer(o), etat:()=>L?L.moteur.etat():null, dernier:()=>L?L.moteur.dernier():null,
    moteur:()=>L?L.moteur:null, historique:()=>L?L.moteur.historique():[], ouvrirHistorique:async()=>(await charger()).ecran.ouvrirHistorique(),
    arreter:()=>L?L.moteur.arreter('stop'):false, journal:()=>L?L.ecran.journal:[]
  };
})();
