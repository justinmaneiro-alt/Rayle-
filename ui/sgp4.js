"use strict";
/* ═════════════ SGP4 (orbite proche de la Terre) : position de l'ISS à partir d'un TLE ═════════════
   Modèle analytique de NORAD (Spacetrack Report n° 3, révision de Vallado et al. 2006), partie « proche Terre » seulement
   (période < 225 min : l'ISS, Hubble, la plupart des satellites ; les orbites lointaines sont refusées).
   RayleUI.sgp4.lireTLE(l1, l2) → satellite · .propager(sat, tMs) → { x, y, z (km, repère TEME), vx, vy, vz (km/s) }
   .geodesique(p, tMs) → { lat, lon (degrés), alt (km) }.
   Vérifié par tests/sgp4-test.mjs sur le cas d'essai officiel (satellite 00005 : 7022,465 · −1400,083 · 0,040 km à t = 0). */
(function(){
  const G=typeof window!=='undefined'?window:globalThis;
  const UI=G.RayleUI=G.RayleUI||{};
  const PI2=2*Math.PI, D2R=Math.PI/180;
  // constantes WGS-72, comme dans le modèle d'origine
  const RT=6378.135, XKE=7.43669161331734132e-2, J2=1.082616e-3, J3=-2.53881e-6, J4=-1.65597e-6, J3OJ2=J3/J2;
  const S0=1.01222928, QOMS2T=1.88027916e-9;
  const mod=x=>((x%PI2)+PI2)%PI2;

  function exposant(s){            // « 11499-3 » → 0,11499 × 10⁻³
    const m=/^([+-]?)(\d+)([+-]\d+)$/.exec(String(s).trim());
    return m?(m[1]==='-'?-1:1)*parseFloat('0.'+m[2])*Math.pow(10,+m[3]):0;
  }

  /** TLE (deux lignes) → satellite, avec les constantes de l'initialisation */
  function lireTLE(l1,l2){
    l1=String(l1); l2=String(l2);
    if(l1.length<64||l2.length<68||l1[0]!=='1'||l2[0]!=='2') throw new Error('TLE illisible');
    const an=+l1.slice(18,20), jour=+l1.slice(20,32), bstar=exposant(l1.slice(53,61));
    const inc=+l2.slice(8,16)*D2R, node=+l2.slice(17,25)*D2R, ecc=+('0.'+l2.slice(26,33).trim()), argp=+l2.slice(34,42)*D2R, m0=+l2.slice(43,51)*D2R, no=+l2.slice(52,63)*PI2/1440;
    if(![an,jour,inc,node,ecc,argp,m0,no,bstar].every(isFinite)||no<=0||ecc>=1) throw new Error('TLE illisible');
    const annee=an<57?2000+an:1900+an;
    const s={epoqueMs:Date.UTC(annee,0,1)+(jour-1)*86400000,inc,node,ecc,argp,m0,bstar,no};
    return init(s);
  }

  function init(s){
    const ecc=s.ecc, eccsq=ecc*ecc, omeosq=1-eccsq, rteosq=Math.sqrt(omeosq), cosio=Math.cos(s.inc), cosio2=cosio*cosio, sinio=Math.sin(s.inc);
    const ck2=.5*J2, ck4=-.375*J4;
    // moyen mouvement et demi-grand axe « de Kozai » (en rayons terrestres)
    const a1=Math.pow(XKE/s.no,2/3), d1=1.5*ck2*(3*cosio2-1)/(rteosq*omeosq), del1=d1/(a1*a1);
    const a0=a1*(1-del1*(1/3+del1*(1+134/81*del1))), delo=1.5*ck2*(3*cosio2-1)/(a0*a0*rteosq*omeosq);
    s.noK=s.no/(1+delo); s.ao=Math.pow(XKE/s.noK,2/3);
    if(PI2/s.noK>=225) throw new Error('orbite lointaine (SGP4 « espace profond ») non gérée');
    s.isimp=s.ao*(1-ecc)<(220/RT+1);
    const perigee=(s.ao*(1-ecc)-1)*RT;
    let sfour=S0, qzms24=QOMS2T;
    if(perigee<156){ sfour=perigee-78; if(perigee<98) sfour=20; qzms24=Math.pow((120-sfour)/RT,4); sfour=sfour/RT+1; }
    const pinvsq=1/(s.ao*s.ao*omeosq*omeosq), tsi=1/(s.ao-sfour);
    const eta=s.ao*ecc*tsi, etasq=eta*eta, eeta=ecc*eta, psisq=Math.abs(1-etasq);
    const coef=qzms24*Math.pow(tsi,4), coef1=coef/Math.pow(psisq,3.5), con41=3*cosio2-1;
    const cc2=coef1*s.noK*(s.ao*(1+1.5*etasq+eeta*(4+etasq))+.375*J2*tsi/psisq*con41*(8+3*etasq*(8+etasq)));
    s.cc1=s.bstar*cc2;
    const cc3=ecc>1e-4?-2*coef*tsi*J3OJ2*s.noK*sinio/ecc:0;
    s.x1mth2=1-cosio2; s.con41=con41; s.x7thm1=7*cosio2-1;
    s.cc4=2*s.noK*coef1*s.ao*omeosq*(eta*(2+.5*etasq)+ecc*(.5+2*etasq)-J2*tsi/(s.ao*psisq)*(-3*con41*(1-2*eeta+etasq*(1.5-.5*eeta))+.75*s.x1mth2*(2*etasq-eeta*(1+etasq))*Math.cos(2*s.argp)));
    s.cc5=2*coef1*s.ao*omeosq*(1+2.75*(etasq+eeta)+eeta*etasq);
    const cosio4=cosio2*cosio2, temp1=1.5*J2*pinvsq*s.noK, temp2=.5*temp1*J2*pinvsq, temp3=-.46875*J4*pinvsq*pinvsq*s.noK;
    s.mdot=s.noK+.5*temp1*rteosq*con41+.0625*temp2*rteosq*(13-78*cosio2+137*cosio4);
    s.argpdot=-.5*temp1*(1-5*cosio2)+.0625*temp2*(7-114*cosio2+395*cosio4)+temp3*(3-36*cosio2+49*cosio4);
    const xhdot1=-temp1*cosio;
    s.nodedot=xhdot1+(.5*temp2*(4-19*cosio2)+2*temp3*(3-7*cosio2))*cosio;
    s.omgcof=s.bstar*cc3*Math.cos(s.argp);
    s.xmcof=ecc>1e-4?-2/3*coef*s.bstar/eeta:0;
    s.nodecf=3.5*omeosq*xhdot1*s.cc1;
    s.t2cof=1.5*s.cc1;
    s.xlcof=-.25*J3OJ2*sinio*(3+5*cosio)/(Math.abs(cosio+1)>1.5e-12?1+cosio:1.5e-12);
    s.aycof=-.5*J3OJ2*sinio;
    s.eta=eta; s.delmo=Math.pow(1+eta*Math.cos(s.m0),3); s.sinmao=Math.sin(s.m0);
    s.cosio=cosio; s.sinio=sinio;
    if(!s.isimp){
      const cc1sq=s.cc1*s.cc1;
      s.d2=4*s.ao*tsi*cc1sq;
      const t=s.d2*tsi*s.cc1/3;
      s.d3=(17*s.ao+sfour)*t;
      s.d4=.5*t*s.ao*tsi*(221*s.ao+31*sfour)*s.cc1;
      s.t3cof=s.d2+2*cc1sq;
      s.t4cof=.25*(3*s.d3+s.cc1*(12*s.d2+10*cc1sq));
      s.t5cof=.2*(3*s.d4+12*s.cc1*s.d3+6*s.d2*s.d2+15*cc1sq*(2*s.d2+cc1sq));
    }
    void ck4;
    return s;
  }

  /** position et vitesse (km, km/s, repère TEME) à l'instant tMs (ms Unix) */
  function propager(s,tMs){
    const t=(tMs-s.epoqueMs)/60000, t2=t*t;                                  // minutes depuis l'époque du TLE
    const xmdf=s.m0+s.mdot*t, argpdf=s.argp+s.argpdot*t, nodedf=s.node+s.nodedot*t;
    let argpm=argpdf, mm=xmdf, nodem=nodedf+s.nodecf*t2;
    let tempa=1-s.cc1*t, tempe=s.bstar*s.cc4*t, templ=s.t2cof*t2;
    if(!s.isimp){
      const temp=s.omgcof*t+s.xmcof*(Math.pow(1+s.eta*Math.cos(xmdf),3)-s.delmo);
      mm=xmdf+temp; argpm=argpdf-temp;
      const t3=t2*t, t4=t3*t;
      tempa=tempa-s.d2*t2-s.d3*t3-s.d4*t4;
      tempe=tempe+s.bstar*s.cc5*(Math.sin(mm)-s.sinmao);
      templ=templ+s.t3cof*t3+t4*(s.t4cof+t*s.t5cof);
    }
    const am=Math.pow(XKE/s.noK,2/3)*tempa*tempa, nm=XKE/Math.pow(am,1.5);
    let em=s.ecc-tempe; if(em<1e-6) em=1e-6;
    mm+=s.noK*templ;
    const xlm=mm+argpm+nodem;
    nodem=nodem%PI2; argpm=argpm%PI2;
    mm=(xlm-argpm-nodem)%PI2;
    // termes à longue période
    const axnl=em*Math.cos(argpm), tp=1/(am*(1-em*em)), aynl=em*Math.sin(argpm)+tp*s.aycof, xl=mm+argpm+nodem+tp*s.xlcof*axnl;
    // équation de Kepler
    const u=(xl-nodem)%PI2;
    let eo1=u, tem5=1, sineo1=0, coseo1=0;
    for(let k=0;k<10&&Math.abs(tem5)>=1e-12;k++){
      sineo1=Math.sin(eo1); coseo1=Math.cos(eo1);
      tem5=1-coseo1*axnl-sineo1*aynl;
      tem5=(u-aynl*coseo1+axnl*sineo1-eo1)/tem5;
      if(Math.abs(tem5)>=.95) tem5=tem5>0?.95:-.95;
      eo1+=tem5;
    }
    // termes à courte période
    const ecose=axnl*coseo1+aynl*sineo1, esine=axnl*sineo1-aynl*coseo1, el2=axnl*axnl+aynl*aynl, pl=am*(1-el2);
    if(pl<0) throw new Error('SGP4 : orbite dégénérée');
    const rl=am*(1-ecose), rdotl=Math.sqrt(am)*esine/rl, rvdotl=Math.sqrt(pl)/rl, betal=Math.sqrt(1-el2), tb=esine/(1+betal);
    const sinu=am/rl*(sineo1-aynl-axnl*tb), cosu=am/rl*(coseo1-axnl+aynl*tb);
    let su=Math.atan2(sinu,cosu);
    const sin2u=2*cosu*sinu, cos2u=1-2*sinu*sinu, t1=.5*J2/pl, t2b=t1/pl;
    const mrt=rl*(1-1.5*t2b*betal*s.con41)+.5*t1*s.x1mth2*cos2u;
    su-=.25*t2b*s.x7thm1*sin2u;
    const xnode=nodem+1.5*t2b*s.cosio*sin2u, xinc=s.inc+1.5*t2b*s.cosio*s.sinio*cos2u;
    const mvt=rdotl-nm*t1*s.x1mth2*sin2u/XKE, rvdot=rvdotl+nm*t1*(s.x1mth2*cos2u+1.5*s.con41)/XKE;
    const sinsu=Math.sin(su), cossu=Math.cos(su), snod=Math.sin(xnode), cnod=Math.cos(xnode), sini=Math.sin(xinc), cosi=Math.cos(xinc);
    const xmx=-snod*cosi, xmy=cnod*cosi;
    const ux=xmx*sinsu+cnod*cossu, uy=xmy*sinsu+snod*cossu, uz=sini*sinsu;
    const vx=xmx*cossu-cnod*sinsu, vy=xmy*cossu-snod*sinsu, vz=sini*cossu;
    if(mrt<1) throw new Error('SGP4 : le satellite est tombé');
    const vk=RT*XKE/60;
    return {x:mrt*ux*RT,y:mrt*uy*RT,z:mrt*uz*RT,vx:(mvt*ux+rvdot*vx)*vk,vy:(mvt*uy+rvdot*vy)*vk,vz:(mvt*uz+rvdot*vz)*vk};
  }

  /** temps sidéral de Greenwich (rad) à l'instant tMs */
  function gmstRad(tMs){
    const T=(tMs/86400000+2440587.5-2451545)/36525;
    const g=(67310.54841+(876600*3600+8640184.812866)*T+.093104*T*T-6.2e-6*T*T*T)%86400;   // secondes de temps sidéral
    return mod(g/240*D2R);
  }
  /** TEME → repère lié à la Terre (rotation du temps sidéral ; le mouvement du pôle, < 15 m, est négligé) */
  function ecef(p,tMs){ const g=gmstRad(tMs), c=Math.cos(g), sn=Math.sin(g); return {x:c*p.x+sn*p.y,y:-sn*p.x+c*p.y,z:p.z}; }
  /** latitude, longitude (degrés) et altitude (km) au-dessus de l'ellipsoïde WGS-84 */
  function geodesique(p,tMs){
    const e=ecef(p,tMs), a=6378.137, f=1/298.257223563, e2=f*(2-f), r=Math.hypot(e.x,e.y);
    let lat=Math.atan2(e.z,r*(1-e2)), alt=0;
    for(let i=0;i<6;i++){ const sl=Math.sin(lat), N=a/Math.sqrt(1-e2*sl*sl); alt=r/Math.cos(lat)-N; lat=Math.atan2(e.z,r*(1-e2*N/(N+alt))); }
    return {lat:lat/D2R,lon:Math.atan2(e.y,e.x)/D2R,alt};
  }
  UI.sgp4={lireTLE,propager,ecef,geodesique,gmstRad};
})();
