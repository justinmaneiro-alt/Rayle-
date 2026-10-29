/* ═════════════ APPAREIL : PC, TABLETTE OU TÉLÉPHONE (V7b ; module pur + page, testé : galaxie/tests/appareil-test.mjs) ═════════════
   UN seul endroit décide du mode de l'appareil, au tout début du chargement (premier script de index.html), AVANT d'initialiser le moindre module 3D. Tous les autres modules lisent le résultat :
     window.RayleAppareil.mode()  →  'pc' | 'tablette' | 'telephone'      (aussi <html data-appareil="…">, <html class="appareil-…">, et RayleBus.etat('appareil') une fois le bus prêt)
   Règle d'or : le mode Galaxie (accueil 3D lourd) est RÉSERVÉ AU PC. Sur téléphone et tablette, Rayle reste sur le thème Jarvis et ne charge ni Galaxie, ni ses textures, ni ses particules.
   Détection (jamais la seule taille de la fenêtre : une fenêtre de PC réduite reste en mode PC) :
     1. réglage explicite 'rayle_appareil' (auto | pc | tablette | telephone) — invisible sur téléphone et tablette en mode automatique ; un paramètre d'URL de développement (?appareil=pc|tablette|telephone,
        documenté dans docs/APPAREILS.md, absent de tous les menus) prime pour la visite en cours ;
     2. sinon l'appareil lui-même : navigator.userAgentData.mobile, User-Agent (iPhone, iPod, iPad, Android avec ou sans « Mobile », Samsung), tablettes qui se déclarent « bureau » (iPadOS et Android en
        « mode ordinateur » : écran tactile + pointeur grossier + pas de survol + plusieurs points de contact), pointeur principal (grossier sans survol = tactile) ;
     3. téléphone ou tablette = la plus petite dimension de l'ÉCRAN (pas de la fenêtre) : moins de 600 px CSS = téléphone (Galaxy S23 Ultra : 412 × 915 px).
   Un PC avec écran tactile ET souris (pointeur principal fin, survol) reste un PC. */
(function(racine){
  "use strict";
  const MODES=['pc','tablette','telephone'];
  const CLE='rayle_appareil', CLE_DEV='rayle_appareil_dev', SEUIL_TELEPHONE=600;
  const MESSAGE_GALAXIE="Le mode Galaxie est réservé au PC ; ici je reste sur Jarvis.";

  /* env : { ua, mobileUA (userAgentData.mobile), plateforme, pointsContact, pointeurGrossier, survol, ecranMin, preference, dev }  →  { mode, source, raison } */
  function detecter(env={}){
    const dev=MODES.includes(env.dev)?env.dev:null, pref=MODES.includes(env.preference)?env.preference:null;
    if(dev) return {mode:dev,source:'url',raison:"paramètre de développement ?appareil="+dev};
    if(pref) return {mode:pref,source:'reglage',raison:"réglage « Appareil » : "+pref};
    const ua=String(env.ua||''), contact=Number(env.pointsContact)||0;
    const iphone=/iPhone|iPod/i.test(ua), ipad=/iPad/i.test(ua) || (/Macintosh|MacIntel/i.test(ua+' '+(env.plateforme||'')) && contact>1);       // iPadOS se déclare Mac
    const android=/Android/i.test(ua), androidPhone=android && /Mobile/i.test(ua);
    const tactilePrincipal=!!env.pointeurGrossier && env.survol===false;                                                                           // doigt : pointeur grossier, pas de survol
    const bureauTactile=contact>0 && tactilePrincipal && !iphone && !ipad && !android;                                                             // tablette en « mode ordinateur »
    const mobile=env.mobileUA===true || iphone || ipad || android || bureauTactile;
    if(!mobile) return {mode:'pc',source:'auto',raison:'pointeur fin ou ordinateur'};
    const ecran=Number(env.ecranMin)||0;
    if(iphone || androidPhone) return {mode:'telephone',source:'auto',raison:iphone?'iPhone':'téléphone Android'};
    if(ipad) return {mode:'tablette',source:'auto',raison:'iPad'};
    if(android) return {mode:ecran>0 && ecran<SEUIL_TELEPHONE?'telephone':'tablette',source:'auto',raison:'Android sans « Mobile » : '+(ecran>0 && ecran<SEUIL_TELEPHONE?'petit écran':'tablette')};
    return {mode:ecran>0 && ecran<SEUIL_TELEPHONE?'telephone':'tablette',source:'auto',raison:'appareil tactile ('+ecran+' px)'};
  }
  const galaxieAutorisee=m=>m==='pc';
  const themeImpose=m=>m==='pc'?null:'jarvis';

  /* Lecture de l'environnement réel (page). Chaque lecture est protégée : un navigateur qui refuse l'accès donne simplement « inconnu ». */
  function lireEnv(){
    const n=racine.navigator||{}, ecran=racine.screen||{}, mm=q=>{ try{ return racine.matchMedia?racine.matchMedia(q).matches:null; }catch(e){ return null; } };
    let preference=null, dev=null;
    try{ preference=racine.localStorage.getItem(CLE); }catch(e){}
    try{ const q=new URLSearchParams(racine.location.search).get('appareil'); if(q){ dev=q; try{ racine.sessionStorage.setItem(CLE_DEV,q); }catch(e){} } else { dev=racine.sessionStorage.getItem(CLE_DEV); } }catch(e){}
    const ecranMin=Math.min(ecran.width||0,ecran.height||0)||0;
    return {ua:n.userAgent||'',mobileUA:n.userAgentData&&typeof n.userAgentData.mobile==='boolean'?n.userAgentData.mobile:null,plateforme:(n.userAgentData&&n.userAgentData.platform)||n.platform||'',
      pointsContact:n.maxTouchPoints||0,pointeurGrossier:mm('(pointer: coarse)')===true,survol:mm('(hover: hover)'),ecranMin,preference,dev};
  }

  const api={MODES,CLE,CLE_DEV,SEUIL_TELEPHONE,MESSAGE_GALAXIE,detecter,galaxieAutorisee,themeImpose,lireEnv};
  if(typeof module!=='undefined'&&module.exports){ module.exports=api; return; }

  // ── dans la page : on décide tout de suite, puis on expose le résultat ──
  let courant=detecter(lireEnv());
  function appliquer(){
    const m=courant.mode, h=racine.document&&racine.document.documentElement; if(!h) return;
    h.dataset.appareil=m; h.dataset.appareilSource=courant.source;
    for(const x of MODES) h.classList.toggle('appareil-'+x,x===m);
    h.classList.toggle('appareil-mobile',m!=='pc');
  }
  appliquer();
  racine.RayleAppareil=Object.assign({},api,{
    mode:()=>courant.mode, estPC:()=>courant.mode==='pc', estMobile:()=>courant.mode!=='pc', source:()=>courant.source, raison:()=>courant.raison,
    galaxieAutorisee:()=>galaxieAutorisee(courant.mode), themeImpose:()=>themeImpose(courant.mode),
    /* Choix de l'utilisateur (auto | pc | tablette | telephone). Sur téléphone et tablette en mode automatique ce réglage n'est pas proposé (aucun moyen d'activer Galaxie). */
    reglage:()=>{ try{ const v=racine.localStorage.getItem(CLE); return MODES.includes(v)?v:'auto'; }catch(e){ return 'auto'; } },
    peutChoisir:()=>courant.mode==='pc' || (()=>{ try{ return MODES.includes(racine.localStorage.getItem(CLE)); }catch(e){ return false; } })(),
    choisir:v=>{ try{ if(v==='auto'||!MODES.includes(v)) racine.localStorage.removeItem(CLE); else racine.localStorage.setItem(CLE,v); }catch(e){} courant=detecter(lireEnv()); appliquer(); if(racine.RayleBus) racine.RayleBus.fusion('appareil',{mode:courant.mode,source:courant.source}); return courant.mode; }
  });
  racine.document&&racine.document.addEventListener('DOMContentLoaded',()=>{ if(racine.RayleBus) racine.RayleBus.fusion('appareil',{mode:courant.mode,source:courant.source,raison:courant.raison}); });
})(typeof window!=='undefined'?window:globalThis);
