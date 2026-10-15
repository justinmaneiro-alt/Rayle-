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
     gmst(ts)                           temps sidéral de Greenwich (degrés) : rotation de la Terre par rapport aux étoiles
     soleilEq(ts) luneEq(ts)            {ra, dec, dist…} équatoriaux (degrés) ; luneEq : distKm aussi
     planete(nom, ts)                   mercure|venus|mars|jupiter|saturne|uranus|neptune → {ra, dec, dist (UA), elongation, distSoleil}
     direction(ra, dec)                 vecteur unitaire du monde de la scène « Espace » (y = pôle nord céleste) ; separation(a,b) en degrés
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


  /* ───── Positions réelles des astres (éléments orbitaux, méthode simple de P. Schlyter : précision de l'ordre du degré, largement
     suffisante pour un ciel de fond) — le Soleil, la Lune et les 7 planètes vus du centre de la Terre ───── */
  const DEG=180/Math.PI;
  const norm360=x=>((x%360)+360)%360;
  const sd=x=>Math.sin(x*RAD), cd=x=>Math.cos(x*RAD);
  const joursSchlyter=ts=>(ts-946728000000)/864e5+1.5;          // jours depuis le 0 janvier 2000 à 0 h (échelle des éléments ci-dessous)
  // temps sidéral de Greenwich (degrés) : l'angle dont la Terre a tourné par rapport aux étoiles
  const gmst=ts=>norm360(280.46061837+360.98564736629*((ts-946728000000)/864e5));
  // éléments : N (nœud), i (inclinaison), w (périhélie), a (UA), e, M (anomalie moyenne) = valeur + pente × jours
  const EL={
    mercure:{N:[48.3313,3.24587e-5],i:[7.0047,5.00e-8],w:[29.1241,1.01444e-5],a:[.387098,0],e:[.205635,5.59e-10],M:[168.6562,4.0923344368]},
    venus:  {N:[76.6799,2.46590e-5],i:[3.3946,2.75e-8],w:[54.8910,1.38374e-5],a:[.723330,0],e:[.006773,-1.302e-9],M:[48.0052,1.6021302244]},
    mars:   {N:[49.5574,2.11081e-5],i:[1.8497,-1.78e-8],w:[286.5016,2.92961e-5],a:[1.523688,0],e:[.093405,2.516e-9],M:[18.6021,.5240207766]},
    jupiter:{N:[100.4542,2.76854e-5],i:[1.3030,-1.557e-7],w:[273.8777,1.64505e-5],a:[5.20256,0],e:[.048498,4.469e-9],M:[19.8950,.0830853001]},
    saturne:{N:[113.6634,2.38980e-5],i:[2.4886,-1.081e-7],w:[339.3939,2.97661e-5],a:[9.55475,0],e:[.055546,-9.499e-9],M:[316.9670,.0334442282]},
    uranus: {N:[74.0005,1.3978e-5],i:[.7733,1.9e-8],w:[96.6612,3.0565e-5],a:[19.18171,-1.55e-8],e:[.047318,7.45e-9],M:[142.5905,.011725806]},
    neptune:{N:[131.7806,3.0173e-5],i:[1.7700,-2.55e-7],w:[272.8461,-6.027e-6],a:[30.05826,3.313e-8],e:[.008606,2.15e-9],M:[260.2471,.005995147]}
  };
  const elt=(o,d)=>{ const r={}; for(const k in o) r[k]=o[k][0]+o[k][1]*d; return r; };
  function kepler(M,e){                                          // résout E - e sin E = M (degrés)
    let E=M+e*DEG*sd(M)*(1+e*cd(M));
    for(let k=0;k<8;k++){ const dE=(E-e*DEG*sd(E)-M)/(1-e*cd(E)); E-=dE; if(Math.abs(dE)<1e-9) break; }
    return E;
  }
  function orbite(el){                                           // → {x, y, z (écliptique héliocentrique ou géocentrique pour la Lune), r, v}
    const E=kepler(norm360(el.M),el.e), xv=el.a*(cd(E)-el.e), yv=el.a*Math.sqrt(1-el.e*el.e)*sd(E);
    const v=Math.atan2(yv,xv)*DEG, r=Math.hypot(xv,yv), u=v+el.w;
    return {x:r*(cd(el.N)*cd(u)-sd(el.N)*sd(u)*cd(el.i)),y:r*(sd(el.N)*cd(u)+cd(el.N)*sd(u)*cd(el.i)),z:r*sd(u)*sd(el.i),r,v};
  }
  const obliquite=d=>23.4393-3.563e-7*d;
  function versEquatorial(x,y,z,d){                               // écliptique → équatorial : {ra, dec (degrés), dist}
    const e=obliquite(d), ye=y*cd(e)-z*sd(e), ze=y*sd(e)+z*cd(e);
    return {ra:norm360(Math.atan2(ye,x)*DEG),dec:Math.atan2(ze,Math.hypot(x,ye))*DEG,dist:Math.hypot(x,y,z)};
  }
  // Soleil vu de la Terre (écliptique géocentrique), partagé par les planètes
  function soleilEcl(d){
    const o=orbite({N:0,i:0,w:282.9404+4.70935e-5*d,a:1,e:.016709-1.151e-9*d,M:356.0470+.9856002585*d});
    return {x:o.r*cd(o.v+282.9404+4.70935e-5*d),y:o.r*sd(o.v+282.9404+4.70935e-5*d),z:0,r:o.r};
  }
  function soleilEq(ts){ const d=joursSchlyter(ts), s=soleilEcl(d); const q=versEquatorial(s.x,s.y,0,d); q.ecl=norm360(Math.atan2(s.y,s.x)*DEG); return q; }
  // Lune (géocentrique) avec les principales perturbations ; distance en rayons terrestres
  function luneEq(ts){
    const d=joursSchlyter(ts), N=norm360(125.1228-.0529538083*d), w=norm360(318.0634+.1643573223*d), M=norm360(115.3654+13.0649929509*d);
    const o=orbite({N,i:5.1454,w,a:60.2666,e:.0549,M});
    const Ls=norm360(282.9404+4.70935e-5*d+356.0470+.9856002585*d), Lm=norm360(N+w+M), D=Lm-Ls, F=Lm-N, Ms=norm360(356.0470+.9856002585*d);
    let lon=Math.atan2(o.y,o.x)*DEG, lat=Math.atan2(o.z,Math.hypot(o.x,o.y))*DEG, dist=o.r;
    lon+=-1.274*sd(M-2*D)+.658*sd(2*D)-.186*sd(Ms)-.059*sd(2*M-2*D)-.057*sd(M-2*D+Ms)+.053*sd(M+2*D)+.046*sd(2*D-Ms)+.041*sd(M-Ms)-.035*sd(D)-.031*sd(M+Ms)-.015*sd(2*F-2*D)+.011*sd(M-4*D);
    lat+=-.173*sd(F-2*D)-.055*sd(M-F-2*D)-.046*sd(M+F-2*D)+.033*sd(F+2*D)+.017*sd(2*M+F);
    dist+=-.58*cd(M-2*D)-.46*cd(2*D);
    const q=versEquatorial(dist*cd(lat)*cd(lon),dist*cd(lat)*sd(lon),dist*sd(lat),d);
    q.ecl=norm360(lon); q.distKm=dist*6371; return q;
  }
  // planète vue de la Terre : {ra, dec, dist (UA), elongation (degrés)}
  function planete(nom,ts){
    const el=EL[nom]; if(!el) return null;
    const d=joursSchlyter(ts), s=soleilEcl(d), h=orbite(elt(el,d));
    const x=h.x+s.x, y=h.y+s.y, z=h.z;                           // géocentrique écliptique
    const q=versEquatorial(x,y,z,d), lon=norm360(Math.atan2(y,x)*DEG), lat=Math.atan2(z,Math.hypot(x,y))*DEG;
    const ls=norm360(Math.atan2(s.y,s.x)*DEG);
    q.elongation=Math.acos(Math.max(-1,Math.min(1,cd(lat)*cd(lon-ls))))*DEG;
    q.ecl=lon; q.distSoleil=h.r; return q;
  }
  // direction dans le repère du monde de la scène (y = pôle nord céleste ; ascension droite α → (cos δ cos α, sin δ, −cos δ sin α), comme dir() du Globe)
  const direction=(ra,dec)=>[cd(dec)*cd(ra),sd(dec),-cd(dec)*sd(ra)];
  // angle (degrés) entre deux directions équatoriales
  const separation=(a,b)=>{ const u=direction(a.ra,a.dec), v=direction(b.ra,b.dec); return Math.acos(Math.max(-1,Math.min(1,u[0]*v[0]+u[1]*v[1]+u[2]*v[2])))*DEG; };
  const PLANETES=Object.keys(EL);

  UI.astro={soleil,position,moment,luminosite,lune,gmst,soleilEq,luneEq,planete,direction,separation,PLANETES,joursSchlyter};
})();
