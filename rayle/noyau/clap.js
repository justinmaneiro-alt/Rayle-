"use strict";
/* ═════════════ DÉTECTEUR DE DOUBLE CLAP (pur calcul, sans micro ni page : testable dans Node) ═════════════
   On lui donne des blocs d'échantillons (de préférence filtrés passe-haut, vers 1,2 kHz) avec leur heure en ms.
   Un clap : énergie qui bondit d'un coup au-dessus du bruit de fond, puis retombe en moins de 100 ms.
   (Une syllabe ou une note de musique dure plus longtemps : elle est rejetée.)
   Un double clap : deux claps espacés de 150 à 600 ms, sans troisième dans les 450 ms qui suivent (pas d'applaudissements).
   RayleClap.creer({sensibilite:'faible'|'moyenne'|'forte'}) → {bloc(echantillons, tMs) → true au double clap, sensibilite(s), etat()} */
(function(racine){
  const REGLAGES={
    faible: {k:16,min:.20},
    moyenne:{k:10,min:.12},
    forte:  {k:6, min:.06}
  };
  function creer(o){
    o=o||{};
    let cfg=REGLAGES[o.sensibilite]||REGLAGES.moyenne;
    let fond=.004, rmsPrec=0, candidat=null, claps=[], attente=null, repos=0, n=0;
    function confirmer(t){
      if(attente){ attente=null; claps=[]; repos=t+800; return false; }        // troisième clap : des applaudissements, on oublie
      claps=claps.filter(x=>t-x<=600);
      const prec=claps.length?claps[claps.length-1]:null;
      if(prec!=null && t-prec>=150){ attente={t}; claps=[]; return false; }   // le deuxième : on attend de voir s'il en vient un troisième
      claps=[t];
      return false;
    }
    function bloc(x,t){
      let pic=0, s=0;
      for(let i=0;i<x.length;i++){ const v=x[i]; s+=v*v; const a=v<0?-v:v; if(a>pic) pic=a; }
      const rms=Math.sqrt(s/x.length);
      n++;
      let declenche=false;
      if(attente && t-attente.t>450){ attente=null; declenche=true; repos=t+900; }
      if(candidat){
        if(rms>candidat.rms) candidat.rms=rms;
        if(rms<candidat.rms*.25){ const t0=candidat.t; candidat=null; repos=t+60; confirmer(t0); }
        else if(t-candidat.t>100){ candidat=null; repos=t+150; }               // trop long pour un clap
      }else if(t>=repos && rms>fond*cfg.k && pic>cfg.min && rms>rmsPrec*3){
        candidat={t,rms};
      }
      // bruit de fond : suit lentement le calme, jamais pendant un son
      if(!candidat && rms<fond*3) fond+=(rms-fond)*.03;
      if(fond<.0008) fond=.0008;
      rmsPrec=rms;
      return declenche;
    }
    return {
      bloc,
      sensibilite(s){ cfg=REGLAGES[s]||REGLAGES.moyenne; },
      etat(){ return {fond:+fond.toFixed(4),blocs:n,claps:claps.length,attente:!!attente}; }
    };
  }
  racine.RayleClap={creer,REGLAGES};
})(typeof window!=='undefined'?window:globalThis);
