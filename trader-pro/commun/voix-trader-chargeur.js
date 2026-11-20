"use strict";
/* Chargeur léger (script classique) de la voix « trading » : window.TraderPro.commande(texte) → réponse parlée ou null.
   Le module complet (trader-pro/commun/voix-trader.js) n'est chargé que si la phrase ressemble à une demande de trading (détection par mots-clés, instantanée). */
(function(){
  const MOTS=/\b(volume|vwap|poc|portefeuille|resultats?|performances?|bilan|compte xtb|risques?|erreurs?|fautes?|defauts?|discipline|coach|couvr\w*|signaux?|cot|commitments|fonds speculatifs|managed money|que je fais mal|mes positions|attractifs?|attractives?|saisonnalite|saisonnier|saisonniere|pepites?|mega caps?|a eviter|neutre|pourquoi|j ai|je viens de|ca y est|je suis)\b/;
  const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’'`]/g,' ');
  let mod=null;
  /* rappel du dimanche : si l'historique XTB n'a pas été importé depuis 7 jours, Rayle le dit une fois (le Worker envoie le même rappel par Telegram) */
  setTimeout(async()=>{ try{ if(document.hidden) return; const j=await import(new URL('trader-pro/portefeuille/journal-stockage.js',document.baseURI).href), ia=await import(new URL('trader-pro/commun/ia.js',document.baseURI).href); const aujourdhui=j.partiesParis(Date.now()).jour; if(j.doitRappeler({ maintenant:Date.now(), dernierImport:j.dernierImport(), dernierRappel:localStorage.getItem(j.CLE_RAPPEL) })){ localStorage.setItem(j.CLE_RAPPEL,aujourdhui); ia.parler(j.PHRASE_RAPPEL); } }catch(e){ /* facultatif */ } },15000);
  window.TraderPro={
    /* prix unique de l'or (spot XAU/USD du Worker, repli Kraken) : utilisé par les fenêtres Marchés, Alertes, Portefeuille et, via le cadre, par le terminal */
    async prixOr(){ try{ const m=await import(new URL('trader-pro/commun/donnees.js',document.baseURI).href); return await m.prixOr(); }catch(e){ return null; } },
    async commande(texte){
      if(!MOTS.test(norm(texte))) return null;
      try{ mod=mod||await import(new URL('trader-pro/commun/voix-trader.js',document.baseURI).href); return await mod.commande(texte); }catch(e){ console.warn('[trader-pro] voix :',e&&e.message||e); return null; }
    }
  };
})();
