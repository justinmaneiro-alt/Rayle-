"use strict";
/* Chargeur léger (script classique) de la voix « trading » : window.TraderPro.commande(texte) → réponse parlée ou null.
   Le module complet (trader-pro/commun/voix-trader.js) n'est chargé que si la phrase ressemble à une demande de trading (détection par mots-clés, instantanée). */
(function(){
  const MOTS=/\b(portefeuille|resultats?|performances?|bilan|compte xtb|risques?|erreurs?|fautes?|defauts?|discipline|coach|couvr\w*|signaux?|cot|commitments|fonds speculatifs|managed money|que je fais mal|mes positions)\b/;
  const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’'`]/g,' ');
  let mod=null;
  window.TraderPro={
    /* prix unique de l'or (spot XAU/USD du Worker, repli Kraken) : utilisé par les fenêtres Marchés, Alertes, Portefeuille et, via le cadre, par le terminal */
    async prixOr(){ try{ const m=await import(new URL('trader-pro/commun/donnees.js',document.baseURI).href); return await m.prixOr(); }catch(e){ return null; } },
    async commande(texte){
      if(!MOTS.test(norm(texte))) return null;
      try{ mod=mod||await import(new URL('trader-pro/commun/voix-trader.js',document.baseURI).href); return await mod.commande(texte); }catch(e){ console.warn('[trader-pro] voix :',e&&e.message||e); return null; }
    }
  };
})();
