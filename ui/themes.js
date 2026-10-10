"use strict";
/* ═════════════ THÈMES : 6 packs de couleurs ═════════════
   Le CSS (ui/ui.css) lit l'attribut <html data-theme="…"> : variables --t1 (accent), --t2 (second), --t3 (clair), --t4 (profond), --tx (texte),
   avec un fondu d'environ 1 s. Ici, les mêmes couleurs en chiffres pour ce qui se dessine en JS (entité, anneaux, fond animé).
   API (window.RayleUI) :
     THEMES                     {id:{nom,c:[4 couleurs],tourne?}}
     appliquerTheme(id,direct)  change de thème (fondu de 1 s, sauf direct)
     theme()                    id du thème actuel
     couleurs()                 [[r,g,b]×4] (0..255) à l'instant présent : fondu en cours, Nébuleuse qui tourne
     rgba([r,g,b],a)            chaîne CSS */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  const THEMES={
    originel: {nom:'Raylé Originel',c:['#ff4fd8','#9b5cff','#ff9ef0','#6a3cff'],alias:/\b(?:originel(?:le)?|original(?:e)?|origine|defaut|rose)\b/},
    arc:      {nom:'Arc Reactor',  c:['#00e5ff','#4fc3ff','#b8f6ff','#1f6bff'],alias:/\b(?:arcs?|ark) ?(?:reactor|reacteur|reactors)?\b|\barc\b|\bcyan\b|\bbleu\b/},
    rouge:    {nom:'Mark Rouge',   c:['#ff2e4d','#ffb300','#ff7a2e','#b0122c'],alias:/\b(?:mark|marc|marque) rouge\b|\bmark\b|\brouge\b|\biron ?man\b/},
    aurore:   {nom:'Aurore',       c:['#00ffa3','#00d4c8','#8a5cff','#00876a'],alias:/\baurore\b|\bemeraude\b|\bvert\b/},
    ambre:    {nom:'Ambre Solaire',c:['#ff9500','#ffc845','#ff5e3a','#b35400'],alias:/\bambre(?: solaire)?\b|\bsolaire\b|\borange\b/},
    nebuleuse:{nom:'Nébuleuse',    c:['#ff4fd8','#4f7cff','#00e5ff','#6a3cff'],alias:/\bnebuleuse\b|\bnebula\b/,tourne:true}
  };
  const PERIODE_NEB=36;   // secondes pour un tour complet de la Nébuleuse (même durée que l'animation CSS)
  const hex=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
  Object.keys(THEMES).forEach(k=>{ THEMES[k].rgb=THEMES[k].c.map(hex); });

  const maintenant=()=>(typeof performance!=='undefined'?performance.now():Date.now());
  let actuel='originel', depuis=null, t0=0, cache=null, tCache=-1;
  const mix=(a,b,k)=>[a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k];

  function base(id,now){
    const th=THEMES[id];
    if(!th.tourne || (typeof document!=='undefined' && document.documentElement.classList.contains('ui-eco'))) return th.rgb;
    const ph=((now/1000)/PERIODE_NEB%1)*3, i=Math.floor(ph), f=ph-i, c=th.rgb;
    return [mix(c[i%3],c[(i+1)%3],f),mix(c[(i+1)%3],c[(i+2)%3],f),mix(c[(i+2)%3],c[i%3],f),c[3]];
  }
  function couleurs(){
    const now=maintenant();
    if(cache && now-tCache<33) return cache;          // recalcul au plus ~30 fois par seconde
    let c=base(actuel,now);
    if(depuis){
      const k=Math.min(1,(now-t0)/1000);
      if(k>=1) depuis=null;
      else{ const e=k*k*(3-2*k); c=c.map((x,i)=>mix(depuis[i],x,e)); }
    }
    cache=c; tCache=now;
    return c;
  }
  function appliquerTheme(id,direct){
    if(!THEMES[id]) id='originel';
    if(id===actuel && !direct && document.documentElement.dataset.theme===id) return;
    depuis=direct?null:couleurs().map(x=>x.slice());
    actuel=id; t0=maintenant(); cache=null;
    try{ document.documentElement.dataset.theme=id; }catch(e){}
  }
  const rgba=(c,a)=>'rgba('+(c[0]|0)+','+(c[1]|0)+','+(c[2]|0)+','+(+a).toFixed(3)+')';

  // Couleurs de l'entité selon son état (0..1). Alerte, verrouillé, déverrouillé : l'entité garde les siennes.
  const ROLES={idle:[1,3],veille:[1,0],listening:[2,0],thinking:[1,2],speaking:[0,2]};
  const sorties={};
  Object.keys(ROLES).forEach(k=>{ sorties[k]={c:[0,0,0],d:[0,0,0]}; });
  function paletteEntite(etat){
    const r=ROLES[etat]; if(!r) return null;
    const c=couleurs(), o=sorties[etat];
    for(let i=0;i<3;i++){ o.c[i]=c[r[0]][i]/255; o.d[i]=c[r[1]][i]/255; }
    return o;
  }

  Object.assign(UI,{THEMES,appliquerTheme,theme:()=>actuel,couleurs,rgba});
  if(typeof document!=='undefined'){
    appliquerTheme('originel',true);
    try{ if(window.Entite && Entite.palette) Entite.palette(paletteEntite); }catch(e){}
  }
})();
