"use strict";
  /* ═════════════ ESPACE : questions de savoir (sans IA) et actions de l'agent ═════════════
     • « quelle est la taille de Mars ? », « compare Mars et la Terre », « parle-moi de l'ISS » : réponse tirée des fiches sourcées (ui/espace-savoir.js), sans IA ;
       si la fiche n'a pas la donnée, Raylé le dit. « et sa taille ? » se rapporte à l'astre affiché (état de l'Espace).
     • Quand l'IA décide d'une action de l'Espace (outil « commande_espace » du Worker), la page l'exécute ici et rend compte du résultat RÉEL :
       un échec remplace la réponse de l'IA (jamais « c'est fait » quand ça a échoué). */
  const echecsActions=[];                 // lus par respond() (js/rayle/phrase.js) : si non vide, ils remplacent la réponse de l'IA
  const espaceUI=()=>window.RayleUI&&window.RayleUI.espace;
  const savoirUI=()=>window.RayleUI&&window.RayleUI.savoir;
  function cibleAffichee(){ try{ const e=espaceUI(); return e&&e.etat().cible||null; }catch(err){ return null; } }       // l'astre affiché dans l'Univers (fond ou plein écran), pour « et sa taille ? »
  // Renvoie la phrase à dire, ou null si ce n'est pas une question de savoir sur l'espace (la suite du traitement prend le relais)
  function commandeEspaceSavoir(texte){
    const S=savoirUI(); if(!S) return null;
    try{ return S.repondre(texte,{cible:cibleAffichee()}); }catch(err){ console.error('[espace-savoir]',err); return null; }
  }
  // Fiches utiles à l'IA pour une question d'espace qui n'a pas de réponse locale (couleur, comparaison inhabituelle…) : elle s'appuie dessus et dit ce qui manque
  function contexteEspace(texte){
    const S=savoirUI(); if(!S) return '';
    try{ return S.contexte(texte); }catch(err){ return ''; }
  }
  /** Action décidée par l'agent : { type:'espace', phrases:[…] } → texte à ajouter à la réponse. Un échec est mis dans echecsActions.
      Chaque phrase est passée à l'analyseur de l'Univers (js/rayle/commandes-univers.js) : la scène de l'accueil (ou le plein écran) bouge réellement, étape par étape. */
  async function espaceAgent(a){
    if(typeof commandeUnivers!=='function'){ echecsActions.push('Je n’ai pas pu agir sur l’Espace : le module n’est pas chargé.'); return ''; }
    const phrases=(Array.isArray(a.phrases)?a.phrases:[a.phrase]).map(x=>String(x||'').trim()).filter(Boolean).slice(0,6);
    if(!phrases.length){ echecsActions.push('Je n’ai pas pu agir sur l’Espace : la demande est vide.'); return ''; }
    const dits=[];
    for(const p of phrases){
      let r=null;
      try{ r=await commandeUnivers(p); }catch(err){ echecsActions.push('Je n’ai pas pu agir sur l’Espace : '+errMsg(err)+'.'); return dits.join(' '); }
      if(r==null){                                                    // une étape n'est pas comprise : on dit laquelle au lieu de faire semblant
        echecsActions.push('Je n’ai pas compris cette demande pour l’Espace : « '+p+' ». Dis-moi par exemple « montre-moi Mars », « retour au système solaire » ou « vue d’ensemble ».');
        return dits.join(' ');
      }
      if(r!=='__deja_dit__') dits.push(r);
    }
    return dits.join(' ');
  }

  /* ═════════════ ACTUALITÉ D'UN PAYS (Terre vivante) ═════════════
     « montre les actualités du Japon sur le globe » : l'actualité vient UNIQUEMENT des sources du Worker (/actus : flux ouverts cités un par un). Sans Worker, ou sans article, Raylé le dit et n'invente rien.
     Un panneau s'ouvre avec les titres, leurs sources et leurs liens ; Raylé en lit trois en citant la source. */
  async function actusPays(nom,lieu){
    const dire=t=>{ try{ addLine('ray',t); speak(t); }catch(e){} };
    try{
      if(!workerReady()){ dire('Je n’ai pas d’actualité fiable sur '+nom+' : le Worker n’est pas relié, et je préfère ne rien inventer.'); return; }
      const requete=(lieu&&lieu.type==='pays'?nom+' actualités':nom+' actualité');
      const d=await wjson('/actus?q='+encodeURIComponent(requete),20000);
      const items=(d.items||[]).slice(0,6);
      if(!items.length){ dire('Je n’ai trouvé aucune actualité fiable sur '+nom+' dans les sources disponibles ; je ne la remplace pas par une supposition.'); return; }
      try{ pn(montrerActus,'Actualités · '+nom,d); }catch(e){}
      const sources=(d.sources&&d.sources.length?d.sources:[...new Set(items.map(x=>x.source).filter(Boolean))]).slice(0,3);
      dire('À la une sur '+nom+(sources.length?', d’après '+sources.join(', '):'')+' : '+items.slice(0,3).map(x=>x.titre+(x.source?' ('+x.source+')':'')).join(' ; ')+'.');
    }catch(e){ dire('Je n’ai pas pu lire l’actualité de '+nom+' ('+errMsg(e)+'). Je n’invente rien.'); }
  }
  try{ RayleBus.fournir('espace:actus',d=>{ actusPays(String(d&&d.nom||'ce pays'),d&&d.lieu); return true; }); }catch(e){}
