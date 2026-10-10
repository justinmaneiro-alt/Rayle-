"use strict";
/* ═════════════ PANNEAUX HOLOGRAPHIQUES : réglages de l'étape « Jarvis » ═════════════
   S'appuie sur js/commun/panneaux.js (cadre, colonnes, pile sur téléphone) :
   - 3 panneaux au plus à la fois (le panneau de sécurité n'est jamais chassé ni fermé avant l'heure),
   - fermeture automatique par défaut, mise en pause pendant qu'on lit (survol, toucher, défilement),
   - apparition avec un petit glitch, colonnes légèrement inclinées en 3D (ui.css),
   - un geste pour fermer : glisser le panneau sur le côté (doigt) ou tirer son en-tête (souris),
   - l'entité se range en haut quand un grand panneau (carte, document) occupe le centre : elle n'est jamais couverte,
   - RayleUI.sparkline(serie) : mini-graphique SVG pour les panneaux de données. */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  if(!window.Panneaux || !Panneaux.surOuverture) return;
  Panneaux.max(3);
  Panneaux.dureeParDefaut=o=>{
    if(o.type==='securite' || o.protege) return 0;          // gardent leur propre durée
    if(o.taille==='large') return 4*60000;                   // carte, document : on a le temps de les explorer
    return o.type==='donnees' ? 75000 : 60000;
  };

  let palier=1;
  RayleBus.on('ui:reglages',r=>{ palier=r.palier; });
  try{ palier=UI.reglages().palier; }catch(e){}

  // Un grand panneau au centre : l'entité monte et rapetisse (body.ui-large, voir ui.css)
  const majLarge=()=>document.body.classList.toggle('ui-large',!!document.querySelector('#panneaux .pn.large:not(.hud-out)'));
  RayleBus.on('etat:panneaux',majLarge);

  Panneaux.surOuverture((id,el)=>{
    majLarge();
    if(palier<2){ el.classList.add('ui-glitch'); setTimeout(()=>el.classList.remove('ui-glitch'),1300); }

    // lecture en cours : minuterie en pause (souris dessus, doigt, défilement), reprise un moment après
    let reprise=0;
    const pause=()=>{ Panneaux.suspendre(id,true); clearTimeout(reprise); };
    const reprendre=ms=>{ clearTimeout(reprise); reprise=setTimeout(()=>Panneaux.suspendre(id,false),ms); };
    el.addEventListener('pointerenter',e=>{ if(e.pointerType==='mouse') pause(); });
    el.addEventListener('pointerleave',e=>{ if(e.pointerType==='mouse') reprendre(1500); });
    el.addEventListener('pointerdown',e=>{ pause(); if(e.pointerType!=='mouse') reprendre(15000); });
    el.addEventListener('focusin',pause);
    el.addEventListener('focusout',()=>reprendre(4000));
    const corps=el.querySelector('.pn-corps');
    if(corps) corps.addEventListener('scroll',()=>{ pause(); reprendre(12000); },{passive:true});

    // geste : glisser sur le côté pour fermer
    let x0=0, y0=0, dx=0, suivi=false, decide=false;
    el.addEventListener('pointerdown',e=>{
      if(e.button>0 || e.target.closest('.pn-carte,.pn-code,iframe,input,textarea,select,a,button,.sec-grille,.leaflet-container')) return;
      if(e.pointerType==='mouse' && !e.target.closest('.pn-tete')) return;   // à la souris : par l'en-tête seulement (le texte reste sélectionnable)
      x0=e.clientX; y0=e.clientY; dx=0; suivi=true; decide=false;
    });
    el.addEventListener('pointermove',e=>{
      if(!suivi) return;
      dx=e.clientX-x0; const dy=e.clientY-y0;
      if(!decide){
        if(Math.abs(dx)>12 && Math.abs(dx)>Math.abs(dy)*1.3){ decide=true; try{ el.setPointerCapture(e.pointerId); }catch(er){} el.classList.add('ui-glisse'); }
        else if(Math.abs(dy)>12){ suivi=false; return; }
        else return;
      }
      el.style.translate=dx+'px 0';
      el.style.opacity=String(1-Math.min(.75,Math.abs(dx)/280));
    });
    const fin=()=>{
      if(!suivi) return; suivi=false;
      if(!decide) return;
      el.classList.remove('ui-glisse');
      if(Math.abs(dx)>90){ el.style.translate=(dx>0?1:-1)*Math.max(320,innerWidth/2)+'px 0'; el.style.opacity='0'; Panneaux.fermer(id); }
      else{ el.style.translate=''; el.style.opacity=''; }
    };
    el.addEventListener('pointerup',fin); el.addEventListener('pointercancel',fin);
  });

  /* ───── mini-graphique (série de nombres) : SVG échappé par construction, rien que des chiffres ───── */
  UI.sparkline=function(serie,titre){
    const v=(serie||[]).map(Number).filter(isFinite).slice(-120);
    if(v.length<2) return '';
    const min=Math.min(...v), max=Math.max(...v), et=(max-min)||1, W=300, H=56;
    const pts=v.map((y,i)=>(i/(v.length-1)*W).toFixed(1)+','+(H-3-(y-min)/et*(H-8)).toFixed(1));
    const hausse=v[v.length-1]>=v[0];
    const ttl=String(titre||'').replace(/[&<>"']/g,'');
    return '<svg class="ui-spark '+(hausse?'hausse':'baisse')+'" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" role="img" aria-label="'+(ttl||'Mini-graphique')+'">'
      +'<polygon class="ui-spark-aire" points="0,'+H+' '+pts.join(' ')+' '+W+','+H+'"/>'
      +'<polyline class="ui-spark-ligne" points="'+pts.join(' ')+'"/></svg>';
  };
})();
