"use strict";
/* ═════════════ CHARGEMENT DES CONTENUS MOBILES (V8) ═════════════
   Règle : JAMAIS un « Chargement… » infini. Chaque contenu passe par squelette → contenu → erreur claire avec bouton « Réessayer », et la DERNIÈRE VERSION EN CACHE est montrée tout de suite
   (étiquetée « mise à jour il y a X min ») pendant que la page relance en arrière-plan avec retrait progressif (15 s, 30 s, 1 min, 2 min, 5 min).
   Un seul appel en vol par contenu, délai maximal par appel, pause quand l'écran est masqué, copie gardée sur l'appareil (localStorage, protégé : s'il est refusé, la mémoire sert).
   MobileDonnees.suivre({ cle, zone, ttl, charger: async()=>donnees, rendre: (zone, donnees, meta)=>…, squelette: 'liste'|'carte'|'image', vide: donnees=>bool, delai }) → { rafraichir, arreter, etat } */
(function(){
  const C=window.MobileCalcul; if(!C) return;
  const PREFIXE='rayle_m_cache_', memoire=new Map();
  const lire=cle=>{ try{ const j=JSON.parse(localStorage.getItem(PREFIXE+cle)||'null'); if(j&&Number.isFinite(j.t)) return j; }catch(e){} return memoire.get(cle)||null; };
  const ecrire=(cle,t,data)=>{ const o={t,data}; memoire.set(cle,o); try{ localStorage.setItem(PREFIXE+cle,JSON.stringify(o)); }catch(e){ /* quota ou accès refusé : la mémoire de la page suffit */ } };
  const oublier=cle=>{ memoire.delete(cle); try{ localStorage.removeItem(PREFIXE+cle); }catch(e){} };
  const SQUELETTES={liste:'<div class="m-squelette"><i></i><i></i><i></i></div>',carte:'<div class="m-squelette"><i></i><i></i></div>',image:'<div class="m-squelette m-image"><i></i><i></i><i></i></div>'};
  const esc=C.esc;

  function structure(zone,squelette){
    zone.classList.add('m-zone');
    if(!zone.querySelector(':scope>.m-corps')){
      zone.innerHTML='<div class="m-bandeau" hidden role="status"></div><div class="m-corps"></div>';
      zone.querySelector('.m-corps').innerHTML=SQUELETTES[squelette||'liste']||SQUELETTES.liste;
    }
    return {bandeau:zone.querySelector(':scope>.m-bandeau'),corps:zone.querySelector(':scope>.m-corps')};
  }
  function bandeau(b,genre,texte,action){
    if(!genre){ b.hidden=true; b.textContent=''; return; }
    b.hidden=false; b.dataset.genre=genre;
    b.innerHTML='<span>'+esc(texte)+'</span>'+(action?'<button type="button" class="m-bouton" data-m-reessayer>'+esc(action)+'</button>':'');
  }

  function suivre(o){
    const {cle,zone,ttl=5*60e3,charger,rendre,squelette,vide,delai=12000}=o;
    const S=structure(zone,squelette);
    const band=(g,t,a)=>{ bandeau(S.bandeau,g,t,a); if(o.surEtat) try{ o.surEtat({genre:g,texte:t||''}); }catch(e){} };
    let enVol=null, essais=0, minuterie=null, arrete=false, derniere=null, montre=null;
    const enLigne=()=>navigator.onLine!==false;
    const afficher=(data,t,perime,erreur)=>{
      if(vide&&vide(data)){ S.corps.innerHTML='<p class="m-vide">'+esc((o.texteVide)||'Rien à afficher pour le moment.')+'</p>'; }
      else { const sig=t+':'+(perime?1:0); if(montre!==sig){ montre=sig; rendre(S.corps,data,{t,perime,erreur}); } }
    };
    function planifier(){
      clearTimeout(minuterie); if(arrete) return;
      minuterie=setTimeout(()=>{ if(document.hidden||!enLigne()){ planifier(); return; } lancer(); },C.delaiReessai(essais));
    }
    async function lancer(force){
      if(enVol) return enVol;
      enVol=(async()=>{
        const copie=lire(cle);
        try{
          const data=await Promise.race([Promise.resolve().then(charger),new Promise((_,rej)=>setTimeout(()=>rej(new Error('délai dépassé')),delai))]);
          if(arrete) return;
          const t=Date.now(); ecrire(cle,t,data); derniere={t,data}; essais=0; band(null); afficher(data,t,false);
          if(ttl) { clearTimeout(minuterie); minuterie=setTimeout(()=>{ if(!document.hidden) lancer(); else planifier(); },ttl); }
        }catch(e){
          if(arrete) return;
          const msg=C.messageErreur(e), c=lire(cle);
          if(c){ afficher(c.data,c.t,true,msg); band('ancien','Copie ancienne ('+C.age(c.t)+') : '+msg,'Réessayer'); }
          else { S.corps.innerHTML=''; band('erreur',msg,'Réessayer'); }
          essais++; planifier();
        }finally{ enVol=null; }
      })();
      return enVol;
    }
    zone.addEventListener('click',ev=>{ if(arrete) return; if(ev.target.closest('[data-m-reessayer]')){ ev.stopPropagation(); essais=0; band(null); if(!lire(cle)) S.corps.innerHTML=SQUELETTES[squelette||'liste']||SQUELETTES.liste; lancer(true); } });
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&!arrete){ const c=lire(cle); if(!c||Date.now()-c.t>=ttl) lancer(); } });
    window.addEventListener('online',()=>{ if(!arrete) lancer(); });
    // 1) la copie, tout de suite ; 2) le rechargement si elle est ancienne ou absente
    const c0=lire(cle), d=C.decisionCache({t:c0&&c0.t,ttl,enLigne:enLigne()});
    if(d.montrer){ derniere=c0; afficher(c0.data,c0.t,d.perime); if(d.perime) band('ancien','Copie ancienne ('+C.age(c0.t)+') : mise à jour en cours…'); }
    if(d.rafraichir||!d.montrer){ if(enLigne()) lancer(); else if(!d.montrer){ S.corps.innerHTML='<p class="m-vide">Pas de réseau pour le moment.</p>'; band('erreur','Hors ligne.','Réessayer'); } }
    else if(d.montrer&&ttl){ minuterie=setTimeout(()=>{ if(!document.hidden) lancer(); else planifier(); },Math.max(5000,ttl-(Date.now()-c0.t))); }
    return {rafraichir:()=>{ essais=0; return lancer(true); },arreter:()=>{ arrete=true; clearTimeout(minuterie); },derniere:()=>derniere,zone:S};
  }
  window.MobileDonnees={suivre,lire,ecrire,oublier,SQUELETTES};
})();
