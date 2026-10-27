"use strict";
/* ═════════════ SONS D'INTERFACE (facultatifs, DÉSACTIVÉS par défaut) ═════════════
   De petits bips très discrets générés par le navigateur (Web Audio) : démarrage, ouverture et fermeture de fenêtre, alerte. Aucun fichier audio, aucune
   bibliothèque, aucun coût quand c'est désactivé (rien n'est même créé). Activables dans ⚙ Réglages → « Sons d'interface ». Le navigateur n'autorise le son
   qu'après un premier geste (clic, touche) : avant, rien ne sonne. Volume volontairement bas, notes courtes. */
window.Sons=(function(){
  const CLE='rayle_sons';
  const lire=()=>{ try{ return localStorage.getItem(CLE); }catch(e){ return null; } };
  let actif=lire()==='1', ctx=null, geste=false, joues=0;
  const dernier={};
  const VOLUME=0.045;
  /* notes : [fréquence de départ, fréquence de fin, début (s), durée (s), forme, force 0 à 1] */
  const SONS={
    demarrage:[[330,330,0,.11,'sine',.8],[440,440,.12,.11,'sine',.8],[660,660,.24,.12,'sine',.9],[990,1100,.37,.22,'sine',1]],
    ouverture:[[620,980,0,.085,'triangle',.9],[1240,1240,.06,.05,'sine',.35]],
    fermeture:[[900,500,0,.1,'triangle',.8]],
    alerte:[[740,740,0,.09,'square',.5],[740,740,.14,.09,'square',.5],[880,880,.28,.14,'square',.55]],
    clic:[[1200,1200,0,.03,'sine',.6]]
  };
  const sonore=()=>{ if(!ctx){ const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return null; try{ ctx=new AC(); }catch(e){ return null; } } return ctx; };
  ['pointerdown','keydown','touchend'].forEach(ev=>window.addEventListener(ev,()=>{ geste=true; if(actif){ const c=sonore(); if(c&&c.state==='suspended') c.resume().catch(()=>{}); } },{passive:true,capture:true}));

  function jouer(nom){
    if(!actif||!SONS[nom]||!geste) return false;
    const maintenant=performance.now(); if(dernier[nom]&&maintenant-dernier[nom]<90) return false; dernier[nom]=maintenant;
    const c=sonore(); if(!c) return false;
    if(c.state==='suspended'){ c.resume().catch(()=>{}); return false; }
    const t0=c.currentTime+0.01;
    for(const [f0,f1,debut,duree,forme,force] of SONS[nom]){
      const o=c.createOscillator(), g=c.createGain(), d=t0+debut;
      o.type=forme; o.frequency.setValueAtTime(f0,d); if(f1!==f0) o.frequency.exponentialRampToValueAtTime(f1,d+duree);
      g.gain.setValueAtTime(0.0001,d); g.gain.linearRampToValueAtTime(VOLUME*force,d+0.008); g.gain.exponentialRampToValueAtTime(0.0001,d+duree);
      o.connect(g); g.connect(c.destination); o.start(d); o.stop(d+duree+0.03); joues++;
    }
    return true;
  }
  function activer(oui){ actif=!!oui; try{ localStorage.setItem(CLE,actif?'1':'0'); }catch(e){} if(actif&&geste){ const c=sonore(); if(c&&c.state==='suspended') c.resume().catch(()=>{}); jouer('clic'); } }
  RayleBus.on('raylé:alerte',()=>jouer('alerte'));
  RayleBus.on('raylé:alerte-prix',()=>jouer('alerte'));
  document.addEventListener('DOMContentLoaded',()=>{});
  const k=document.getElementById('kSons');
  if(k){ k.checked=actif; k.addEventListener('change',()=>activer(k.checked)); }
  return {jouer,activer,actif:()=>actif,notesJouees:()=>joues,noms:()=>Object.keys(SONS),contexteCree:()=>!!ctx};
})();
