"use strict";
/* ═════════════ ACCUEIL G1 « AURORE » : CONTENU PUR (testé sous Node : galaxie/tests/g1-contenu-test.mjs) ═════════════
   Thème et couleurs du noyau, adresses Open-Meteo (prévision + qualité de l'air), résumé détaillé, courbe de la journée.
   Aucune dépendance au navigateur. Une donnée absente reste null : l'affichage met « — ». */
(function(root){
  const PALETTES={
    rose:  {nom:'Rose', c:[1.0,.28,.60], d:[.45,.65,1.0], casc:[1.0,.66,.84], css:'#ff5aa5', css2:'#7aa8ff'},
    cyan:  {nom:'Cyan', c:null, d:null, casc:null, css:'#8fd0e3', css2:'#c9b27a'},
    ambre: {nom:'Doré (par défaut)', c:[1.0,.62,.18], d:[1.0,.90,.55], casc:[1.0,.85,.55], css:'#ffae3d', css2:'#ffe08a'},
    violet:{nom:'Violet', c:[.62,.38,1.0], d:[.95,.60,1.0], casc:[.85,.70,1.0], css:'#a77bff', css2:'#f09cff'},
    vert:  {nom:'Vert', c:[.25,.90,.60], d:[.70,1.0,.85], casc:[.70,1.0,.85], css:'#46e69a', css2:'#b3ffd9'}
  };
  const THEMES=['aurore','jarvis'];
  const themeValide=v=>THEMES.includes(v)?v:'aurore';
  const couleurValide=v=>Object.prototype.hasOwnProperty.call(PALETTES,v)?v:'ambre';

  /* Change les couleurs d'attente, d'écoute et de parole du noyau (la réflexion violette et l'alerte orange ne bougent jamais). nom = null : couleurs d'origine. */
  const TOUCHES=['idle','veille','listening','speaking','deverrouille'];
  const origine=new WeakMap();
  function appliquerPalette(ETATS,CASCADES,nom){
    if(!ETATS||!CASCADES) return false;
    if(!origine.has(ETATS)){ const o={}; for(const k of TOUCHES){ o[k]={c:ETATS[k].c.slice(),d:ETATS[k].d.slice(),casc:CASCADES[k].col.slice()}; } origine.set(ETATS,o); }
    const o=origine.get(ETATS), p=nom&&PALETTES[nom]&&PALETTES[nom].c?PALETTES[nom]:null;
    for(const k of TOUCHES){
      const src=p?{c:p.c,d:p.d,casc:p.casc}:o[k];
      ETATS[k].c.splice(0,3,...src.c); ETATS[k].d.splice(0,3,...src.d); CASCADES[k].col.splice(0,3,...src.casc);
    }
    return !!p;
  }

  const LIB={idle:'VEILLE',veille:'VEILLE',listening:'ÉCOUTE',thinking:'RÉFLEXION',speaking:'PAROLE',alerte:'ALERTE',deverrouille:'ACTIF',verrouille:'VERROUILLÉ'};
  const libelleEtat=(etat,worker)=>worker===false&&(etat==='idle'||etat==='verrouille')?'HORS LIGNE':(LIB[etat]||'VEILLE');

  const nb=v=>Number.isFinite(v)?v:null;
  const urlPrevision=(lat,lon)=>'https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon
    +'&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,uv_index'
    +'&hourly=temperature_2m,apparent_temperature,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max&timezone=auto&forecast_days=1';
  const urlAir=(lat,lon)=>'https://air-quality-api.open-meteo.com/v1/air-quality?latitude='+lat+'&longitude='+lon+'&current=european_aqi,pm2_5&hourly=european_aqi&timezone=auto&forecast_days=1';
  const heureDe=s=>{ const m=/T(\d{2}):(\d{2})/.exec(String(s||'')); return m?m[1]+':'+m[2]:null; };
  const heureNum=s=>{ const m=/T(\d{2}):(\d{2})/.exec(String(s||'')); return m?(+m[1])+(+m[2])/60:null; };
  const serie=a=>Array.isArray(a)?a.filter(Number.isFinite):[];

  function resumeDetail(prev,air){
    const c=(prev&&prev.current)||{}, h=(prev&&prev.hourly)||{}, d=(prev&&prev.daily)||{}, ac=(air&&air.current)||{}, ah=(air&&air.hourly)||{};
    return {
      temp:nb(c.temperature_2m), ressenti:nb(c.apparent_temperature), hum:nb(c.relative_humidity_2m), vent:nb(c.wind_speed_10m), uv:nb(c.uv_index),
      min:nb(d.temperature_2m_min&&d.temperature_2m_min[0]), max:nb(d.temperature_2m_max&&d.temperature_2m_max[0]), pluie:nb(d.precipitation_probability_max&&d.precipitation_probability_max[0]),
      lever:heureDe(d.sunrise&&d.sunrise[0]), coucher:heureDe(d.sunset&&d.sunset[0]),
      aqi:nb(ac.european_aqi), pm25:nb(ac.pm2_5),
      heures:{t:Array.isArray(h.temperature_2m)?h.temperature_2m.map(nb):[], now:heureNum(c.time)},
      serieAir:serie(ah.european_aqi), serieRessenti:serie(h.apparent_temperature), serieHum:serie(h.relative_humidity_2m)
    };
  }
  function niveauAir(aqi){ if(!Number.isFinite(aqi)) return '—'; return aqi<=20?'bon':aqi<=40?'correct':aqi<=60?'moyen':aqi<=80?'médiocre':aqi<=100?'mauvais':'très mauvais'; }

  /* Courbe de la température sur 24 h : d (trait), aire (fermée), maintenant (x de l'heure actuelle). null si trop peu de points. */
  function courbeJour(hh,l,h,marge=6){
    const t=(hh&&hh.t)||[], pts=t.map((v,i)=>[i,v]).filter(p=>Number.isFinite(p[1]));
    if(pts.length<3) return null;
    const mn=Math.min(...pts.map(p=>p[1])), mx=Math.max(...pts.map(p=>p[1])), pl=mx-mn||1, n=Math.max(1,t.length-1);
    const xy=p=>[+(p[0]/n*l).toFixed(1),+(h-marge-(p[1]-mn)/pl*(h-2*marge)).toFixed(1)];
    const d=pts.map((p,i)=>(i?'L':'M')+xy(p).join(' ')).join('');
    const a=xy(pts[0]), z=xy(pts[pts.length-1]);
    const now=Number.isFinite(hh.now)?+(hh.now/n*l).toFixed(1):null;
    return {d,aire:d+'L'+z[0]+' '+h+'L'+a[0]+' '+h+'Z',maintenant:now};
  }

  const api={PALETTES,THEMES,themeValide,couleurValide,appliquerPalette,libelleEtat,urlPrevision,urlAir,resumeDetail,niveauAir,courbeJour};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.G1Contenu=api;
})(typeof window!=='undefined'?window:globalThis);
