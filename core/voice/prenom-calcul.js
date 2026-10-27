/* ═════════════ DÉTECTION DU PRÉNOM « RAYLÉ » DANS UNE PHRASE (module pur, testé : galaxie/tests/prenom-test.mjs) ═════════════
   · corrige les écritures que la reconnaissance vocale donne au prénom (« Riley », « Rallye »…) ; la liste de base est prudente (pas de mot courant) ;
     Justin ajoute ses propres variantes dans ⚙ (« Réelle », « Rail »… à ses risques : ce sont des mots courants) ;
   · sépare ce qui est dit avant et après le prénom (« Raylé, ouvre Mars » → apres = « ouvre Mars »).
   Utilisable dans la page (window.Prenom) et sous Node (module.exports). */
(function(racine){
  "use strict";
  const NOMS_BASE='riley,rayley,railey,reilly,rayleigh,raylet,rayler,rayle,raylee,rallye,ralé,rallé,réalé,reylé,reilé,railé,raïlé,raillé,rayé,raille';
  const norm=t=>String(t||'').normalize('NFC').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  const echapper=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function variantes(extra){
    const sup=String(extra||'').split(',').map(s=>s.trim().toLowerCase()).filter(s=>s.length>=3);
    return [...new Set(NOMS_BASE.split(',').concat(sup))];
  }
  function creerCorrecteur(extra){
    const tous=variantes(extra).map(echapper).sort((a,b)=>b.length-a.length);
    const re=new RegExp('(^|[^\\p{L}])('+tous.join('|')+')(?![\\p{L}])','giu');
    return t=>String(t||'').normalize('NFC').replace(re,'$1Raylé');
  }
  /* Trouve « Raylé » dans la phrase (après correction) : renvoie ce qui est dit avant et après, ou null. */
  function separer(texte){
    const t=String(texte).normalize('NFC'), n=norm(t);
    const m=n.match(/(^|[^a-z])((?:(?:hey|he|eh|ok|okay|dis[- ]moi|dis|salut|bonjour|bonsoir|coucou|allo|yo)[\s,]+)?rayle)(?![a-z])/);
    if(!m) return null;
    const debut=m.index+m[1].length, fin=debut+m[2].length;
    return {avant:t.slice(0,debut).replace(/[\s,.!?:;…-]+$/,'').trim(), apres:t.slice(fin).replace(/^[\s,.!?:;…-]+/,'').trim()};
  }
  /* En veille : la phrase est-elle adressée à Raylé ? Renvoie {actif, demande} ; demande = '' si seul le prénom a été dit. */
  function enVeille(texte,extra){
    const corrige=creerCorrecteur(extra)(texte), w=separer(corrige);
    if(!w) return {actif:false,demande:''};
    let q=w.apres||(w.avant.split(/\s+/).length>=2?w.avant:'');
    if(!q||norm(q).replace(/[^a-z0-9]/g,'').length<3) q='';
    return {actif:true,demande:q};
  }
  const api={NOMS_BASE,variantes,creerCorrecteur,separer,enVeille,norm};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.Prenom=api;
})(typeof window!=='undefined'?window:globalThis);
