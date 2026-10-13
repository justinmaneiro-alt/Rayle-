"use strict";
  /* ═════════════ ANATOMIE & ORTHOPÉDIE : ce que Raylé comprend (voir js/anatomie/) ═════════════
     « Décris-moi l'humérus » · « où s'insère le biceps ? » → pop-up 3D flottant avec la structure isolée et sa description.
     « ouvre l'anatomie » · « affiche les muscles et les nerfs » · « amputation trans-tibiale à droite » · « scoliose de 40 degrés » ·
     « fracture du col du fémur » · « mets une prothèse » · « mets l'emboîture en carbone » · « retour ».
     Le module 3D (three.js, données, fenêtres) n'est chargé qu'à la première demande, et seulement si la phrase parle d'anatomie.
     Les cours enregistrés par Justin (onglet « Cours » de la fenêtre) complètent les réponses : extraits dans la réponse parlée,
     et joints au contexte de l'IA pour les questions d'anatomie, de clinique et d'appareillage (contexteCours). */
  const ANATOMIE_PRE=/anatomi|orthop|prothes|orthese|corset|attelle|platre|emboiture|pylone|moignon|amput|desarticul|syme|chopart|lisfranc|scoliose|cobb|gibbosite|fracture|palpation|reperes? (?:osseux|anatom)|dermatome|squelette|muscl|nerfs?\b|nerveux|organes|visceres|\bpeau\b|\bos\b|osseu|humerus|radius|cubitus|ulna|clavicule|scapula|omoplate|sternum|vertebre|rachis|colonne|cote\b|cotes\b|\bcote \d|femur|tibia|fibula|perone|patella|rotule|bassin|sacrum|coccyx|crane|mandibule|talus|calcaneus|tarse|carpe|metacarp|metatars|phalange|biceps|triceps|deltoide|pectoral|trapeze|dorsal|quadriceps|ischio|fessier|psoas|sartorius|gastrocnemien|jumeaux|mollet|soleaire|sciatique|plexus|moelle|foie|coeur|poumon|rein\b|reins\b|estomac|rate\b|pancreas|intestin|colon|vessie|thyroide|trachee|cerveau|encephale|diaphragme|achille|\b[ctl] ?\d{1,2}\b|vue 3d|modele 3d|pop ?up|apercu|fenetre 3d/;
  let anatomieModule=null, anatomieChargement=null;
  function chargerAnatomie(){
    if(anatomieModule) return Promise.resolve(anatomieModule);
    if(!anatomieChargement) anatomieChargement=import(new URL('js/anatomie/index.js?v=2026.10.13.3',document.baseURI).href).then(m=>{ anatomieModule=m; return m; }).catch(e=>{ anatomieChargement=null; throw e; });
    return anatomieChargement;
  }
  // Renvoie la phrase à dire, ou null si ce n'est pas une commande d'anatomie (la suite du traitement prend le relais)
  async function commandeAnatomie(texte){
    const n=norm(texte).replace(/[’']/g,' ');
    const dedans=RayleBus.demander('vue')==='anatomie';
    if(!dedans && !anatomieModule && !ANATOMIE_PRE.test(n)) return null;
    let m; try{ m=await chargerAnatomie(); }catch(e){ return null; }          // pas de réseau pour three.js : le reste répond
    let c; try{ c=m.analyser(texte,{vue:RayleBus.demander('vue')}); }catch(e){ console.error('[anatomie]',e); return null; }
    if(!c) return null;
    try{ return await m.executer(c); }
    catch(e){ return 'Le module anatomie a rencontré un problème : '+errMsg(e); }
  }
  // Extraits des cours de Justin pour une question d'anatomie, de clinique ou d'appareillage : ajoutés au contexte de l'IA (voir phrase.js)
  async function contexteCours(texte){
    const n=norm(texte);
    if(!(ANATO_RE.test(n) || ANATOMIE_PRE.test(n.replace(/[’']/g,' ')))) return '';
    try{ const m=await Promise.race([chargerAnatomie(),new Promise((_,ko)=>setTimeout(ko,2500))]); return await m.contexteCours(texte); }
    catch(e){ return ''; }
  }
  // « 🔊 Raylé lit » dans la fiche : la fiche est dite à voix haute
  RayleBus.fournir('anatomie:parler',t=>{ try{ addLine('ray',String(t)); speak(String(t)); }catch(e){} return true; });
