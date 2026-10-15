"use strict";
  /* ═════════════ MÉMOIRE DURABLE (base D1 du Worker) ═════════════ */
  const MEM_READ_RE=/(qu'?est[- ]ce que tu as (?:note|retenu|en memoire)|qu'?as[- ]tu (?:note|retenu)|ce que tu as (?:note|retenu)|lis(?:[- ]moi)? (?:mes notes|mon journal|ta memoire|ton carnet)|que contient ta memoire|tes souvenirs|ta memoire|mon journal de trading|mes regles de trading)/;
  const NOTE_RE=/^(?:note(?:s)?(?: bien)?(?: (?:dans|sur) (?:mon|le|ton) (?:journal|carnet))?|retiens(?: bien)?|memorise|souviens[- ]toi|rappelle[- ]toi|garde en memoire|ajoute (?:a|dans|sur) (?:mon|le|ton) (?:journal|carnet)|enregistre (?:dans|sur) (?:ta memoire|mon journal|ton carnet))\s*(?:que |qu'|:|,)?\s*([\s\S]{3,})$/;
  let viderDemande=0;
  // Renvoie le texte à retenir (avec ses majuscules d'origine), ou null
  function noteDepuis(text){
    const orig=fixName(text).replace(/^\s*(?:(?:hey|hé|he|ok|dis)\s+)?Raylé[\s,.:!-]*/i,'').trim();
    const m=norm(orig).match(NOTE_RE);
    if(!m) return null;
    const contenu=orig.slice(m[0].length-m[1].length).replace(/^[\s:,]+/,'').replace(/[\s.]+$/,'').trim();
    return contenu.length>=3 ? contenu : null;
  }
  async function memoireAppel(body){
    const res=await wfetch('/memoire',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},12000);
    if(!res.ok) throw await workerError(res);
    return res.json();
  }
  async function memoireAjouter(texte){
    if(!workerReady()){ const r="Je ne peux rien retenir sans le Worker : configurez-le dans ⚙ Réglages."; addLine('ray',r); speak(r); return; }
    try{
      const d=await memoireAppel({action:'ajouter',texte});
      const lab=d.type==='règle'?'dans '+fx('vos','tes')+' règles':d.type==='trade'?'dans '+fx('votre','ton')+' journal de trades':'dans mes notes';
      const r="C'est noté "+lab+" : « "+d.texte+" ».";
      addLine('ray',r); speak(r);
    }catch(e){ const r="Je n'ai pas pu l'enregistrer : "+errMsg(e)+'.'; addLine('ray',r); speak(r); }
  }
  async function memoireOublierDerniere(){
    try{
      const d=await memoireAppel({action:'supprimer_derniere'});
      const r=d.supprime ? "C'est oublié : « "+d.supprime+" »." : "Ma mémoire est déjà vide.";
      addLine('ray',r); speak(r);
    }catch(e){ const r="Je n'ai pas pu effacer : "+errMsg(e)+'.'; addLine('ray',r); speak(r); }
  }
  async function memoireVider(){
    try{ await memoireAppel({action:'vider'}); const r='Mémoire effacée. Page blanche.'; addLine('ray',r); speak(r); }
    catch(e){ const r="Je n'ai pas pu effacer : "+errMsg(e)+'.'; addLine('ray',r); speak(r); }
  }
