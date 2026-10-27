/* ═════════════ IA LOCALE (LM Studio) : logique PURE, testée par galaxie/tests/ia-locale-test.mjs ═════════════
   · quelle réponse peut venir du modèle local, laquelle doit aller aux API (Groq, Mistral, Gemini… via le Worker) ;
   · choix du modèle à partir de la liste /v1/models ;
   · modèle NON CENSURÉ (Dolphin) : jamais le défaut, seulement sur demande explicite de Justin ou après sa phrase secrète, et SANS aucune action d'outil (texte seulement) ;
   · construction des messages (personnalité courte de Raylé) et contrôle de qualité de la réponse.
   Utilisable dans la page (window.IaLocaleCalcul) et sous Node (module.exports). Aucun contournement de sécurité : ce module n'ajoute que de l'aiguillage. */
(function(racine){
  "use strict";
  const sansAccent=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[’']/g,' ').replace(/\s+/g,' ').trim();

  const URL_DEFAUT='http://localhost:1234/v1';
  const REGLAGES_DEFAUT={actif:false,url:URL_DEFAUT,relais:'',jetonRelais:'',modele:'',modeleNonCensure:'',empreinteSecrete:'',delaiMs:20000,maxCaracteres:6000};

  /* Ce qui demande des OUTILS ou des données en direct : le modèle local n'en a pas → API (le Worker les a). */
  const BESOIN_OUTILS=/\b(marche|cours|prix|bitcoin|btc|solana|nasdaq|us100|or|xau|dollar|rsi|support|resistance|alerte|alertes|actualite|actualites|news|meteo|temperature|pluie|recherche|cherche|google|internet|web|sur le web|image|images|photo|photos|video|videos|rappelle|rappel|agenda|telegram|envoie|envoi|ouvre|ferme|affiche|montre|lance|mets|passe en|va sur|zoom|terre|mars|saturne|jupiter|neptune|galaxie|terminal|graphique|lppr|lpp|code)\b/;
  const BESOIN_VISION=/\b(capture|screenshot|cette image|cette photo|ce graphique|sur l ecran|regarde l image|que vois tu)\b/;
  const BESOIN_RECENT=/\b(aujourd hui|ce matin|cette semaine|en ce moment|dernier|derniere|derniers|dernieres|vient de|hier|demain)\b/;

  /* Phrases d'appel explicite du modèle non censuré. Rien d'implicite : « mode non censuré », « sans filtre », « avec dolphin », « modèle non censuré ». */
  const APPEL_NON_CENSURE=/\b(?:mode|modele|ia|version|avec|via|utilise|passe (?:sur|en|a)|reponds? (?:avec|via|en))\b[^.?!]{0,30}\b(?:non censure[es]?|sans filtre|dolphin|uncensored)\b|\b(?:non censure[es]?|sans filtre|dolphin|uncensored)\b[^.?!]{0,12}\b(?:mode|modele|stp|s il te plait)\b/;

  function fusionnerReglages(brut){
    const r=Object.assign({},REGLAGES_DEFAUT,brut&&typeof brut==='object'?brut:{});
    r.actif=!!r.actif; r.url=String(r.url||URL_DEFAUT).replace(/\/+$/,'');
    r.delaiMs=Math.min(120000,Math.max(3000,+r.delaiMs||20000)); r.maxCaracteres=Math.min(30000,Math.max(500,+r.maxCaracteres||6000));
    return r;
  }

  /* Réponse de /v1/models → liste d'identifiants utilisables (les modèles d'embeddings ne répondent pas aux questions). */
  function parseModeles(json){
    const l=json&&Array.isArray(json.data)?json.data:[];
    return l.map(m=>String(m&&m.id||'')).filter(id=>id&&!/embed|embedding|nomic-embed|bge-|e5-|rerank|whisper|tts|clip/i.test(id));
  }
  const estNonCensure=id=>/dolphin|uncensor|abliterat|lexi/i.test(String(id||''));

  /* Modèle choisi : réglage s'il est chargé, sinon le premier modèle non « non censuré ». Pour le mode non censuré : réglage, sinon un modèle Dolphin chargé, sinon null (jamais un modèle ordinaire). */
  function choisirModele(modeles,reglages,nonCensure){
    const l=Array.isArray(modeles)?modeles:[];
    if(nonCensure){
      if(reglages.modeleNonCensure&&l.includes(reglages.modeleNonCensure)) return reglages.modeleNonCensure;
      return l.find(estNonCensure)||null;
    }
    if(reglages.modele&&l.includes(reglages.modele)&&!estNonCensure(reglages.modele)) return reglages.modele;
    return l.find(id=>!estNonCensure(id))||null;
  }

  /* Empreinte de la phrase secrète (djb2 + longueur) : pas un secret cryptographique, seulement pour ne pas garder la phrase en clair dans le navigateur. */
  function empreinte(phrase){
    const s=sansAccent(phrase); if(!s) return '';
    let h=5381; for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0;
    return 'e'+(h>>>0).toString(16)+'-'+s.length;
  }

  /* Demande explicite du non censuré : { demande:true, texte:<question sans la formule> }, ou { demande:false }. La phrase secrète n'est reconnue que si elle est définie. */
  function detecterNonCensure(texte,reglages){
    const brut=String(texte||''), n=sansAccent(brut);
    if(reglages&&reglages.empreinteSecrete){
      const s=n.split(' ');   // la phrase secrète peut être placée en tête : on teste ses préfixes (1 à 6 mots)
      for(let k=1;k<=Math.min(6,s.length);k++){ if(empreinte(s.slice(0,k).join(' '))===reglages.empreinteSecrete) return {demande:true,par:'phrase',texte:brut.split(/\s+/).slice(k).join(' ').trim()||brut}; }
    }
    const m=APPEL_NON_CENSURE.exec(n);
    if(m) return {demande:true,par:'explicite',texte:brut.replace(/(?:en )?(?:mode|modele|version|avec|via|utilise)[^,.:;!?]{0,30}(?:non censur[ée]e?s?|sans filtre|dolphin|uncensored)[^,.:;!?]{0,12}[,.:;!?]?/i,'').trim()||brut};
    return {demande:false};
  }

  /* Aiguillage. Entrée : texte, état {disponible, modeles, echecRecent, nonCensureDemande}, réglages. Sortie : {route:'locale'|'api'|'refus', raison}.
     « refus » : le non censuré est demandé mais aucun modèle adapté n'est chargé (on le dit, on ne bascule PAS sur un autre modèle en silence). */
  function router(texte,etat,reglages){
    const r=fusionnerReglages(reglages), e=etat||{}, n=sansAccent(texte);
    if(e.nonCensureDemande){
      if(!r.actif) return {route:'refus',raison:'L’IA locale est désactivée dans les réglages.'};
      if(!e.disponible) return {route:'refus',raison:'LM Studio ne répond pas : démarre le serveur local pour le modèle non censuré.'};
      if(!choisirModele(e.modeles,r,true)) return {route:'refus',raison:'Aucun modèle non censuré (Dolphin) n’est chargé dans LM Studio.'};
      return {route:'locale',raison:'non censuré, demandé explicitement',nonCensure:true};
    }
    if(!r.actif) return {route:'api',raison:'IA locale désactivée'};
    if(!e.disponible) return {route:'api',raison:'IA locale absente'};
    if(!choisirModele(e.modeles,r,false)) return {route:'api',raison:'aucun modèle de conversation chargé'};
    if(e.echecRecent) return {route:'api',raison:'IA locale en échec ou trop lente il y a peu'};
    if(String(texte||'').length>r.maxCaracteres) return {route:'api',raison:'contexte trop long'};
    if(BESOIN_VISION.test(n)) return {route:'api',raison:'vision'};
    if(BESOIN_OUTILS.test(n)) return {route:'api',raison:'outils ou données en direct'};
    if(BESOIN_RECENT.test(n)) return {route:'api',raison:'information récente'};
    return {route:'locale',raison:'tâche courante'};
  }

  /* Qualité : une réponse vide, trop courte pour la question, répétitive ou qui avoue ne pas savoir → on repasse par les API. */
  function reponseSuffisante(reponse,question){
    const t=String(reponse||'').trim(); if(t.length<2) return {ok:false,raison:'réponse vide'};
    const n=sansAccent(t);
    if(/^(je ne sais pas|je ne peux pas (?:repondre|aider)|desole,? je ne|as an ai|en tant qu ia)/.test(n)) return {ok:false,raison:'le modèle local ne sait pas'};
    if(String(question||'').length>120&&t.length<25) return {ok:false,raison:'réponse trop courte'};
    const mots=n.split(' '); if(mots.length>30&&new Set(mots).size<mots.length*0.25) return {ok:false,raison:'réponse répétitive'};
    return {ok:true};
  }

  const PERSONNALITE=[
    'Tu es Raylé, l’assistante vocale de Justin. Tu es féminine, tu parles en français, tu tutoies Justin.',
    'Ton ton : naturel, drôle sans être lourde, ni majordome ni « pote ». Tes réponses sont PARLÉES : phrases courtes, aucun markdown, aucune liste à puces, aucun émoji, aucun symbole.',
    'Si tu ne sais pas, dis-le simplement. Tu n’inventes ni chiffres, ni cours de bourse, ni dates, ni références. Tu ne donnes aucun conseil d’investissement et tu ne décides jamais d’un trade.'
  ].join(' ');
  const NON_CENSURE_AJOUT=' Justin a explicitement demandé ce modèle : réponds directement et sans détour, mais tu restes honnête et dans le cadre de la loi ; tu ne fournis rien qui puisse nuire gravement à des personnes.';

  function construireMessages({question,contexte='',historique=[],nonCensure=false}){
    const msgs=[{role:'system',content:PERSONNALITE+(nonCensure?NON_CENSURE_AJOUT:'')+(contexte?'\nContexte : '+String(contexte).slice(0,1500):'')}];
    for(const h of (historique||[]).slice(-6)) if(h&&(h.role==='user'||h.role==='assistant')&&h.content) msgs.push({role:h.role,content:String(h.content).slice(0,800)});
    msgs.push({role:'user',content:String(question||'')});
    return msgs;
  }

  /* Enlève ce qui ne se dit pas : balises de réflexion de certains modèles, markdown, émojis. */
  function nettoyerPourLaVoix(t){
    return String(t||'').replace(/<think>[\s\S]*?<\/think>/gi,'').replace(/```[\s\S]*?```/g,' ').replace(/[*_#`>~]+/g,'').replace(/^\s*[-•]\s+/gm,'').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,'').replace(/\s+\n/g,'\n').replace(/[ \t]{2,}/g,' ').trim();
  }

  /* Texte de l'indicateur d'état : « IA locale : connectée (modèle) » / « absente » / « désactivée ». */
  function libelleEtat(etat,reglages){
    const r=fusionnerReglages(reglages), e=etat||{};
    if(!r.actif) return 'IA locale : désactivée';
    if(!e.disponible) return 'IA locale : absente'+(e.raison?' ('+e.raison+')':'');
    const m=choisirModele(e.modeles,r,false);
    return 'IA locale : connectée'+(m?' · '+m:' · aucun modèle de conversation chargé')+(e.relais?' (via le PC)':'');
  }

  const api={URL_DEFAUT,REGLAGES_DEFAUT,fusionnerReglages,parseModeles,estNonCensure,choisirModele,empreinte,detecterNonCensure,router,reponseSuffisante,PERSONNALITE,construireMessages,nettoyerPourLaVoix,libelleEtat,sansAccent};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.IaLocaleCalcul=api;
})(typeof window!=='undefined'?window:globalThis);
