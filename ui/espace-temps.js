"use strict";
/* ═════════════ TERRE VIVANTE : horloge virtuelle et rotation à la main (pur : aucun accès à la scène) ═════════════
   UI.horloge  : l'heure que montre le fond Espace. Par défaut c'est l'heure réelle ; on peut accélérer le temps (×60 … 1 jour par seconde), le figer, le remettre à l'heure réelle ou le décaler.
                 La position du Soleil, de la Lune, des planètes, de l'ISS, le jour et la nuit, la rotation de la Terre et le trafic simulé suivent cette horloge.
   UI.terreMain: rotation de la Terre à la main (le doigt fait tourner le globe sous le Soleil, qui reste en place : le terminateur ne bouge pas, les continents défilent).
   Le temps est toujours borné à ±200 ans autour de l'heure réelle (les formules d'astronomie de ui/astro.js restent justes). */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  const PRESETS=[
    {id:'reel',nom:'temps réel',k:1,court:'×1'},
    {id:'minute',nom:'1 minute par seconde',k:60,court:'×60'},
    {id:'dix-minutes',nom:'10 minutes par seconde',k:600,court:'×600'},
    {id:'heure',nom:'1 heure par seconde',k:3600,court:'×3600'},
    {id:'six-heures',nom:'6 heures par seconde',k:21600,court:'6 h/s'},
    {id:'jour',nom:'1 jour par seconde',k:86400,court:'1 j/s'}
  ];
  const BORNE=200*365.25*86400000;
  let source=()=>Date.now(), echelle=1, enPause=false, baseReel=source(), baseVirt=baseReel;
  const reel=()=>source();
  const maintenant=()=>enPause?baseVirt:Math.max(reel()-BORNE,Math.min(reel()+BORNE,baseVirt+(reel()-baseReel)*echelle));
  function rebaser(){ baseVirt=maintenant(); baseReel=reel(); }
  function regler(k){ k=+k; if(!isFinite(k)||k===0) return false; rebaser(); echelle=Math.max(-1e7,Math.min(1e7,k)); enPause=false; return true; }
  function pause(oui){ rebaser(); enPause=oui==null?!enPause:!!oui; return enPause; }
  function retourReel(){ echelle=1; enPause=false; baseReel=reel(); baseVirt=baseReel; }
  function decaler(ms){ rebaser(); baseVirt+=ms; }
  function estReel(){ return !enPause&&echelle===1&&Math.abs(maintenant()-reel())<1500; }
  const presetDe=k=>PRESETS.find(p=>p.k===k)||null;
  function nomEchelle(){ if(enPause) return 'temps figé'; const p=presetDe(echelle); if(p) return p.nom; return (echelle<0?'à reculons, ':'')+'×'+Math.abs(Math.round(echelle*100)/100); }
  const MOIS=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  /** 14 oct. 2026 · 12:34 UTC */
  function formater(ts){ const d=new Date(ts==null?maintenant():ts), p=n=>String(n).padStart(2,'0'); return d.getUTCDate()+' '+MOIS[d.getUTCMonth()]+' '+d.getUTCFullYear()+' · '+p(d.getUTCHours())+':'+p(d.getUTCMinutes())+' UTC'; }
  function etat(){ return {echelle,pause:enPause,reel:estReel(),maintenant:maintenant(),texte:formater(),nom:nomEchelle(),decalageMs:maintenant()-reel()}; }
  UI.horloge={maintenant,regler,pause,retourReel,decaler,etat,estReel,formater,nomEchelle,presets:()=>PRESETS.slice(),echelle:()=>echelle,enPause:()=>enPause,_source:f=>{ source=f; baseReel=source(); baseVirt=baseReel; echelle=1; enPause=false; }};

  /* ───── rotation à la main ───── */
  let angle=0, vitesse=0, actif=false, derniere=0;
  UI.terreMain={
    angle:()=>angle,
    actif:()=>actif,
    activer:oui=>{ actif=oui==null?!actif:!!oui; if(!actif) vitesse=0; return actif; },
    /** le doigt déplace la surface de dx radians (positif : vers l'est, la Terre tourne dans son sens habituel) */
    glisser:dx=>{ angle=(angle+dx)%(2*Math.PI); vitesse=dx; derniere=Date.now(); },
    /** appelé à chaque image : l'élan retombe doucement après le geste */
    maj:dt=>{ if(!vitesse||Date.now()-derniere<60) return angle; angle=(angle+vitesse*Math.min(1,dt*60))%(2*Math.PI); vitesse*=Math.exp(-dt*3.2); if(Math.abs(vitesse)<1e-5) vitesse=0; return angle; },
    /** la Terre retrouve sa vraie orientation (le décalage fait à la main s'efface) */
    zero:()=>{ angle=0; vitesse=0; },
    lancer:v=>{ vitesse=+v||0; derniere=0; }
  };
})();
