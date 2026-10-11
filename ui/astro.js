"use strict";
/* ═════════════ ASTRONOMIE LOCALE (sans réseau, sans clé) ═════════════
   Un seul endroit pour les formules du soleil et de la lune : le fond « Globe » (point subsolaire, limite jour/nuit) et le moteur
   d'ambiance (moment de la journée, altitude du soleil, phase de la lune) s'en servent. Rien n'est dupliqué.
   RayleUI.astro :
     soleil(ts)                         point subsolaire {lat, lon} en degrés (précis à quelques dixièmes de degré)
     position(ts, lat, lon)             {altitude, azimut, matin} du soleil vu d'un lieu (degrés ; azimut depuis le nord, vers l'est)
     moment(altitude, matin)            'aube' | 'jour' | 'crepuscule' | 'nuit'
     luminosite(altitude)               0 (nuit noire) … 1 (plein jour), progressive : sert aux fondus
     lune(ts)                           {phase 0..1 (0 nouvelle, .5 pleine), eclairee 0..1}
   Pur calcul : testé sous node (tests/ambiance-test.mjs). */
(function(){
  const UI=(typeof window!=='undefined'?window:globalThis).RayleUI=(typeof window!=='undefined'?window:globalThis).RayleUI||{};
  const RAD=Math.PI/180;

  // point subsolaire (approximation de l'almanach, précise à quelques dixièmes de degré)
  function soleil(ts){
    const d=(ts-946728000000)/864e5, rad=RAD;
    const g=(357.529+.98560028*d)*rad, q=280.459+.98564736*d;
    const L=(q+1.915*Math.sin(g)+.020*Math.sin(2*g))*rad, e=(23.439-.00000036*d)*rad;
    const ra=Math.atan2(Math.cos(e)*Math.sin(L),Math.cos(L))/rad, dec=Math.asin(Math.sin(e)*Math.sin(L))/rad;
    let eqt=((q-ra)%360+540)%360-180;                      // équation du temps, en degrés
    const heuresUTC=(ts%864e5)/36e5;
    let lon=-15*(heuresUTC-12)-eqt; lon=((lon+540)%360)-180;
    return {lat:dec,lon};
  }

  // hauteur et direction du soleil pour un observateur (lat, lon en degrés), à partir du point subsolaire
  function position(ts,lat,lon){
    const s=soleil(ts), phi=lat*RAD, dec=s.lat*RAD;
    const H=(((lon-s.lon)+540)%360-180)*RAD;                // angle horaire : négatif le matin (soleil à l'est), positif l'après-midi
    const sinAlt=Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(H);
    const altitude=Math.asin(Math.max(-1,Math.min(1,sinAlt)))/RAD;
    // azimut depuis le sud (vers l'ouest) puis ramené au nord (vers l'est)
    const azS=Math.atan2(Math.sin(H),Math.cos(H)*Math.sin(phi)-Math.tan(dec)*Math.cos(phi))/RAD;
    const azimut=((azS+180)%360+360)%360;
    return {altitude,azimut,matin:Math.sin(H)<0};
  }

  // aube / crépuscule : le soleil est proche de l'horizon (crépuscule civil, jusqu'à -6°) ; nuit en dessous
  function moment(altitude,matin){
    if(altitude>6) return 'jour';
    if(altitude<-6) return 'nuit';
    return matin ? 'aube' : 'crepuscule';
  }
  const lisse=(a,b,x)=>{ const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };
  const luminosite=altitude=>lisse(-8,12,altitude);

  // lune : cycle synodique de 29,530589 jours depuis la nouvelle lune du 6 janvier 2000 (18 h 14 UTC)
  function lune(ts){
    const jours=(ts-947182440000)/864e5, cycle=29.530588853;
    const phase=(((jours/cycle)%1)+1)%1;
    return {phase,eclairee:(1-Math.cos(2*Math.PI*phase))/2};
  }

  UI.astro={soleil,position,moment,luminosite,lune};
})();
