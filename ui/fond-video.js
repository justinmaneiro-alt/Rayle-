"use strict";
/* ═════════════ FOND « VILLE RÉELLE » : vraie vidéo de ville de nuit en timelapse, en boucle, sans son ═════════════
   Fichiers dans ui/assets/ (H.264, boucle sans coupure grâce à un fondu enchaîné fin → début) :
   ville-paysage.mp4 (1280×720, écrans en paysage : ordinateur, tablette couchée) et ville-portrait.mp4 (720×1280, téléphone debout).
   Si l'un manque, l'autre sert (recadré). Une teinte du thème passe par-dessus (ui.css).
   RayleUI.fondsReels.video(boite, {leger}) → {taille(), image(), qualite(), pause(bool), detruire()} ; rejette si aucune vidéo n'est lisible. */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  UI.fondsReels=UI.fondsReels||{};
  const BASE=(()=>{ try{ return new URL('ui/assets/',document.baseURI).href; }catch(e){ return 'ui/assets/'; } })();

  UI.fondsReels.video=function(boite,o){
    o=o||{};
    return new Promise((ok,ko)=>{
      const v=document.createElement('video');
      v.muted=true; v.defaultMuted=true; v.loop=true; v.playsInline=true; v.autoplay=true; v.preload='auto';
      v.setAttribute('muted',''); v.setAttribute('playsinline',''); v.setAttribute('aria-hidden','true'); v.disablePictureInPicture=true;
      const ordre=innerHeight>innerWidth ? ['portrait','paysage'] : ['paysage','portrait'];
      ordre.forEach(n=>{ const s=document.createElement('source'); s.src=BASE+'ville-'+n+'.mp4'; s.type='video/mp4'; v.appendChild(s); });
      let fini=false;
      const echec=msg=>{ if(fini) return; fini=true; clearTimeout(minuteur); if(v.parentNode) v.parentNode.removeChild(v); ko(new Error(msg)); };
      const minuteur=setTimeout(()=>echec('vidéo trop lente à charger'),20000);
      // l'erreur arrive sur la DERNIÈRE source quand aucune n'est lisible (fichier absent, format inconnu)
      v.lastElementChild.addEventListener('error',()=>echec('aucune vidéo dans ui/assets/ (ville-paysage.mp4 ou ville-portrait.mp4)'));
      v.addEventListener('loadeddata',()=>{
        if(fini) return; fini=true; clearTimeout(minuteur);
        const p=v.play(); if(p&&p.catch) p.catch(()=>{});
        ok({
          taille(){},
          image(){},
          qualite(){},
          pause(oui){ try{ if(oui){ if(!v.paused) v.pause(); } else if(v.paused){ const p2=v.play(); if(p2&&p2.catch) p2.catch(()=>{}); } }catch(e){} },
          detruire(){ try{ v.pause(); v.removeAttribute('src'); while(v.firstChild) v.removeChild(v.firstChild); v.load(); }catch(e){} if(v.parentNode) v.parentNode.removeChild(v); }
        });
      });
      boite.appendChild(v);
      try{ v.load(); }catch(e){}
    });
  };
})();
