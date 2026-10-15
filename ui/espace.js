"use strict";
/* ═════════════ ESPACE : faits, astres, ISS (RayleUI.espace) — logique pure, rien ne se dessine ici ═════════════
   La scène 3D (Terre, Lune, système solaire, Mars, ISS, satellites, éclipses…) est celle de l'Univers (js/univers/) : elle sert de fond à l'accueil et Raylé
   la pilote par la voix (js/rayle/commandes-univers.js). Ce module garde ce qui ne dessine rien :
   • ASTRES, faits() : un fait par astre, avec les chiffres du jour calculés (ui/astro.js) et les sources de ui/espace-savoir.js ;
   • cibleDe()/nomCible() : reconnaître un astre, un rover ou un lieu dans une phrase ;
   • creerISS() : position de l'ISS (TLE CelesTrak + SGP4 de ui/sgp4.js, repli wheretheiss.at puis orbite simulée) ; UI.espace.iss est utilisée en secours par l'Univers ;
   • etat() : l'astre ou la vue affichée dans l'Univers (injecté dans le contexte de l'IA par js/rayle/capacites.js). */

(function(){
  const G=typeof window!=='undefined'?window:globalThis;
  const UI=G.RayleUI=G.RayleUI||{};
  const RAD=Math.PI/180, DEG=180/Math.PI;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const lireLS=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const ecrireLS=(k,v)=>{ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} };


  /* ═════ les astres : noms, couleurs, faits ═════ */
  const ASTRES={
    soleil:{nom:'le Soleil',court:'Soleil'}, lune:{nom:'la Lune',court:'Lune'}, iss:{nom:'la Station spatiale internationale',court:'ISS'}, terre:{nom:'la Terre',court:'Terre'},
    mercure:{nom:'Mercure',court:'Mercure',rayonKm:2440}, venus:{nom:'Vénus',court:'Vénus',rayonKm:6052}, mars:{nom:'Mars',court:'Mars',rayonKm:3390},
    jupiter:{nom:'Jupiter',court:'Jupiter',rayonKm:69911}, saturne:{nom:'Saturne',court:'Saturne',rayonKm:58232}, uranus:{nom:'Uranus',court:'Uranus',rayonKm:25362}, neptune:{nom:'Neptune',court:'Neptune',rayonKm:24622}
  };
  const UA_KM=149597870.7;
  const fr=(n,d=0)=>Number(n).toLocaleString('fr-FR',{maximumFractionDigits:d,minimumFractionDigits:d});
  const millions=km=>{ const m=km/1e6; return m>=100?fr(Math.round(m)):fr(m,1); };
  // un fait par astre : uniquement des chiffres SOURCÉS (NASA, voir docs/espace-sources.md et ui/espace-savoir.js) ; dit à voix haute, donc sans symbole
  const FAIT2={
    soleil:'Il concentre presque toute la masse du système solaire.',
    lune:'Elle nous montre toujours la même face, car elle tourne sur elle-même en 27,3 jours, exactement le temps qu’elle met pour faire le tour de la Terre.',
    mercure:'Un jour solaire y dure environ 176 jours terrestres, deux fois plus que son année de 88 jours.',
    venus:'Il y fait 464 degrés Celsius : c’est la planète la plus chaude du système solaire, à cause de son effet de serre.',
    mars:'Le canyon Valles Marineris y mesure environ 3 870 kilomètres de long et jusqu’à 9,3 kilomètres de profondeur.',
    jupiter:'Elle a 95 lunes connues, dont les quatre grandes lunes de Galilée.',
    saturne:'Elle possède un système d’anneaux, et sa densité est inférieure à celle de l’eau : elle flotterait dans un océan assez grand.',
    uranus:'Son axe est incliné de 97,8 degrés : elle roule pratiquement sur son orbite.',
    neptune:'Ses vents atteignent 580 mètres par seconde, plus de 2 000 kilomètres par heure.',
    iss:'Elle est habitée en continu depuis novembre 2000.'
  };
  const MASC={soleil:1,mars:1,jupiter:1,saturne:1,uranus:1,neptune:1};
  const auMasc=(c,t)=>MASC[c]?t.replace(/\bElle\b/g,'Il').replace(/\belle\b/g,'il'):t;                  // « Mars… il », « la Lune… elle »
  // ce qu'on dit à voix haute : jamais de symbole
  const oral=t=>String(t||'').replace(/CO₂/g,'gaz carbonique').replace(/(\d)\s?%/g,'$1 pour cent').replace(/°\s?([NSEO])\b/g,(m,x)=>' degrés '+({N:'nord',S:'sud',E:'est',O:'ouest'})[x]).replace(/°/g,' degrés').replace(/\s+/g,' ').trim();
  // 1 ou 2 faits courts ; les chiffres du jour sont calculés (distances, phase, altitude de l'ISS)
  function faits(cible,ctx){
    ctx=ctx||{}; const ts=ctx.ts||Date.now(), A=UI.astro;
    if(cible==='terre') return 'De retour sur la Terre.';
    if(cible==='soleil'){
      const d=A.soleilEq(ts).dist;
      return 'Le Soleil est à '+millions(d*UA_KM)+' millions de kilomètres : sa lumière met '+fr(d*8.317,1)+' minutes à nous parvenir. '+auMasc('soleil',FAIT2.soleil);
    }
    if(cible==='lune'){
      const m=A.luneEq(ts), l=A.lune(ts);
      return 'La Lune est à '+fr(Math.round(m.distKm/1000)*1000)+' kilomètres ce soir, éclairée à '+Math.round(l.eclairee*100)+' pour cent. '+FAIT2.lune;
    }
    if(cible==='iss'){
      const e=ctx.iss&&ctx.iss.etat?ctx.iss.etat(ts):null;
      const alt=e?Math.round(e.alt/10)*10:420;
      return 'L’ISS est à environ '+fr(alt)+' kilomètres d’altitude et file à 27 600 kilomètres par heure : un tour de la Terre en 93 minutes.'+(e&&!e.simule?' Elle est en ce moment au-dessus de '+fr(Math.abs(e.lat),0)+' degrés '+(e.lat>=0?'nord':'sud')+', '+fr(Math.abs(e.lon),0)+' degrés '+(e.lon>=0?'est':'ouest')+'.':'')+' '+FAIT2.iss;
    }
    const p=A.planete(cible,ts); if(!p) return '';
    return ASTRES[cible].nom+' est à '+millions(p.dist*UA_KM)+' millions de kilomètres de nous aujourd’hui. '+auMasc(cible,FAIT2[cible]);
  }


  const norm=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/['’`]/g,' ').replace(/[?!.,;:…«»"]/g,' ').replace(/-/g,' ').replace(/\s+/g,' ').trim().replace(/^(?:(?:hey|he|eh|ok|okay|dis) )?rayle /,'');
  const ALIAS_ASTRE=[
    [/^(?:soleil|etoile du jour)$/,'soleil'], [/^(?:lune|satellite naturel)$/,'lune'],
    [/^(?:iss|i s s|isse|(?:la )?station(?: spatiale)?(?: internationale)?)$/,'iss'],
    [/^mercure$/,'mercure'], [/^venus$/,'venus'], [/^mars$/,'mars'], [/^jupiter$/,'jupiter'], [/^saturne$/,'saturne'], [/^uranus$/,'uranus'], [/^neptune$/,'neptune']
  ];
  const ARTICLES=/^(?:le|la|l|les|un|une|mon|ma|notre|planete|astre|de|d|du) /;
  /* ═════ lieux de la Terre, rovers, trou noir ═════
     Cibles : un astre (« mars »), « trounoir », un rover (« perseverance », « curiosity »), un lieu (« lieu:japon ») ou un point (« geo:35.68,139.69,Tokyo »). */
  const LX=()=>UI.espaceLieux||{LIEUX:[],ROVERS:{},FICHES:{},TROU_NOIR:{}};
  const ALIAS_EXTRA=[[/^(?:trou noir|trou noir supermassif|sagittarius a|sagittarius a etoile|sgr a)$/,'trounoir']];
  let indexLieux=null;
  const sansArticle=s=>s.replace(/^(?:le|la|les|l|un|une) /,'');
  function lieux(){ if(indexLieux) return indexLieux; indexLieux=new Map(); LX().LIEUX.forEach(l=>{ const k=sansArticle(norm(l.nom)); if(!indexLieux.has(k)) indexLieux.set(k,l); }); return indexLieux; }
  function lieuDe(id){ return LX().LIEUX.find(l=>l.id===id)||null; }
  function geoDe(cible){ const m=/^geo:(-?[\d.]+),(-?[\d.]+)(?:,([^,]*))?(?:,([\d.]+))?$/.exec(cible||''); return m?{lat:+m[1],lon:+m[2],nom:m[3]||'ce point',zoom:m[4]?Math.max(1.1,Math.min(3,+m[4])):1.5}:null; }
  /** Texte normalisé → { cible, genre:'astre'|'rover'|'lieu', lieu? } ou null */
  function cibleDe(r){
    r=String(r||'').replace(/ (?:stp|svp|s il te plait|maintenant|sur le globe|sur la terre|sur terre)$/,'').trim();
    for(let i=0;i<3 && ARTICLES.test(r);i++) r=r.replace(ARTICLES,'');
    const a=ALIAS_ASTRE.concat(ALIAS_EXTRA).find(([re])=>re.test(r)); if(a) return {cible:a[1],genre:'astre'};
    for(const id of Object.keys(LX().ROVERS)) if(LX().ROVERS[id].alias.some(x=>{ const n=norm(x); return r===n || r==='rover '+n || r==='le rover '+n; })) return {cible:id,genre:'rover'};
    const l=lieux().get(sansArticle(r)); if(l) return {cible:'lieu:'+l.id,genre:'lieu',lieu:l};
    return null;
  }
  const estRover=c=>!!(LX().ROVERS||{})[c];
  function nomCible(c){
    if(!c) return 'la Terre';
    if(ASTRES[c]) return ASTRES[c].nom; if(c==='trounoir') return 'le trou noir';
    if(estRover(c)) return 'le rover '+LX().ROVERS[c].nom;
    if(c.startsWith('lieu:')){ const l=lieuDe(c.slice(5)); return l?l.nom:'ce lieu'; }
    const g=geoDe(c); return g?g.nom:'la Terre';
  }


  /* ═════ état : ce que Raylé sait de la scène à tout instant (injecté dans son contexte par js/rayle/capacites.js) ═════ */
  function etat(){
    let vue='rayle'; try{ if(typeof RayleBus!=='undefined') vue=RayleBus.demander('vue')||'rayle'; }catch(err){}
    const r=UI.reglages?UI.reglages():{}; let sc=null, u=null;
    try{ u=window.RayleUnivers&&RayleUnivers.etat(); sc=u&&u.ouvert?u.scene:null; }catch(err){}
    const cible=sc?(sc.vue==='systeme'?(sc.suivi||null):sc.vue==='mars'?'mars':null):null;      // l'astre suivi dans le système solaire, Mars dans sa vue, sinon la Terre
    return {vue,fond:r.fond||null,palier:r.palier==null?null:r.palier,univers:u&&u.ouvert?(u.plein?'plein':'fond'):null,scene:sc,cible,nom:cible?nomCible(cible):'la Terre'};
  }

  /* ═════ ISS : orbite réelle par TLE + SGP4 (ui/sgp4.js), repli sur la position publique wheretheiss.at, puis orbite simulée ═════
     Ordre : TLE frais (CelesTrak, rafraîchi toutes les 6 h) → dernier TLE en cache → TLE de secours embarqué (13/10/2026) → [sans SGP4] position wheretheiss.at → orbite d'exemple.
     SGP4 est précis à quelques kilomètres près du TLE et se dégrade d'environ 1 à 3 km par jour : hors ligne, le TLE de secours reste utile quelques semaines (erreur de plusieurs minutes d'avance ensuite). */
  const INCL=51.64, PERIODE_S=92.9*60, N_RAD_S=2*Math.PI/PERIODE_S, TTL_ISS=10*60000;
  const TLE_SECOURS=['1 25544U 98067A   26286.11204827  .00005858  00000+0  11499-3 0  9991','2 25544  51.6319  76.5194 0006724 256.4602 103.5638 15.48846742590035'];
  const TTL_TLE=6*3600*1000, URL_TLE='https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE';
  const EXEMPLE={t0:Date.UTC(2026,0,1,0,0,0),lat0:0,lon0:30,asc:true,alt:420,vitesse:27600};   // orbite d'exemple si rien n'est connu
  function creerISS(deps){
    deps=deps||{};
    const maintenant=deps.maintenant||(()=>Date.now());
    const stock=deps.stockage||{get:lireLS,set:ecrireLS};
    const doFetch=deps.fetch||(typeof fetch==='function'?(u,o)=>fetch(u,o):null);
    const gmst=ts=>UI.astro.gmst(ts);
    const SG=deps.sgp4||UI.sgp4||null;
    let modele=null, simule=true, erreur=null, sat=null, srcTLE=null;
    const lireCache=()=>{ try{ return JSON.parse(stock.get('rayle_esp_iss')||'null'); }catch(e){ return null; } };
    // ajuste l'orbite sur deux positions (lat/lon terrestres) prises à 60 s d'écart
    function ajuster(p0,p1){
      const i=INCL*RAD, lat0=p0.lat*RAD;
      const asc=p1.lat>p0.lat;
      let u0=Math.asin(clamp(Math.sin(lat0)/Math.sin(i),-1,1)); if(!asc) u0=Math.PI-u0;
      const decal=Math.atan2(Math.cos(i)*Math.sin(u0),Math.cos(u0))*DEG;             // longitude le long de l'orbite
      const omega=((p0.lon-decal)+gmst(p0.t)+720)%360;                                 // nœud ascendant, repère inertiel
      return {t0:p0.t,u0,omega,alt:p0.alt,vitesse:p0.vitesse||27600};
    }
    function depuisEchantillon(e){ return ajuster({t:e.t0,lat:e.lat0,lon:e.lon0,alt:e.alt,vitesse:e.vitesse},{lat:e.asc?e.lat0+.1:e.lat0-.1}); }
    function init(){
      const c=lireCache();
      if(c&&c.t0!=null){ modele=ajuster({t:c.t0,lat:c.lat0,lon:c.lon0,alt:c.alt,vitesse:c.vitesse},{lat:c.asc?c.lat0+1:c.lat0-1}); simule=true; }
      else{ modele=depuisEchantillon(EXEMPLE); simule=true; }
    }
    init();
    function poserTLE(l1,l2,src){ sat=SG.lireTLE(l1,l2); srcTLE=src; }
    function initTLE(){
      if(!SG) return;
      try{ const c=JSON.parse(stock.get('rayle_esp_tle')||'null'); if(c&&c.l1&&c.l2){ poserTLE(c.l1,c.l2,'cache'); return; } }catch(e){}
      try{ poserTLE(TLE_SECOURS[0],TLE_SECOURS[1],'secours'); }catch(e){ sat=null; }
    }
    initTLE();
    // position inertielle : {ra, dec (degrés), r (rayons terrestres), lat, lon (terrestres)} à l'instant ts
    function positionTLE(ts){
      const p=SG.propager(sat,ts), r=Math.hypot(p.x,p.y,p.z), g=SG.geodesique(p,ts);
      const dec=Math.asin(p.z/r)*DEG, ra=((Math.atan2(p.y,p.x)*DEG)%360+360)%360;
      return {ra,dec,lat:g.lat,lon:g.lon,r:r/6371,alt:g.alt,vitesse:Math.hypot(p.vx,p.vy,p.vz)*3600};
    }
    function position(ts){
      if(sat){ try{ return positionTLE(ts); }catch(e){ /* repli ci-dessous */ } }
      const u=modele.u0+N_RAD_S*(ts-modele.t0)/1000, i=INCL*RAD;
      const dec=Math.asin(Math.sin(i)*Math.sin(u))*DEG;
      const ra=(modele.omega+Math.atan2(Math.cos(i)*Math.sin(u),Math.cos(u))*DEG+720)%360;
      const lon=((ra-gmst(ts)+540)%360+360)%360-180;
      return {ra,dec,lat:dec,lon,r:1+modele.alt/6371,alt:modele.alt};
    }
    const etat=ts=>{ const t=ts||maintenant(), p=position(t); return Object.assign(p,{vitesse:p.vitesse||modele.vitesse,simule:sat?srcTLE!=='frais':simule,source:sat?'tle-'+srcTLE:(simule?'simule':'api'),ageTleJours:sat?Math.round((t-sat.epoqueMs)/864e5*10)/10:null}); };
    function trace(ts,avantMin,apresMin,pas){                       // suite de positions inertielles (pour la traînée)
      const o=[]; for(let m=-avantMin;m<=apresMin+1e-6;m+=pas){ const p=position(ts+m*60000); o.push(p); } return o;
    }
    async function chargerTLE(force){
      const c=lireTLEcache();
      if(!force && c && maintenant()-(c.recu||0)<TTL_TLE){ if(!sat||srcTLE==='secours') try{ poserTLE(c.l1,c.l2,'frais'); }catch(e){} return etat(); }
      try{
        if(!doFetch) throw new Error('réseau indisponible');
        const r=await doFetch(URL_TLE);
        if(!r||!r.ok) throw new Error('HTTP '+(r&&r.status));
        const lignes=(await r.text()).split(/\r?\n/).map(x=>x.trimEnd()).filter(Boolean);
        const i=lignes.findIndex(x=>x[0]==='1'&&/^1 25544/.test(x));
        if(i<0||!lignes[i+1]) throw new Error('TLE absent de la réponse');
        poserTLE(lignes[i],lignes[i+1],'frais');                       // lève une erreur si le TLE est illisible : l'ancien reste en place
        stock.set('rayle_esp_tle',JSON.stringify({l1:lignes[i],l2:lignes[i+1],recu:maintenant()}));
        erreur=null;
      }catch(e){ erreur=String(e&&e.message||e); if(sat&&srcTLE==='frais') srcTLE='cache'; }
      return etat();
    }
    const lireTLEcache=()=>{ try{ return JSON.parse(stock.get('rayle_esp_tle')||'null'); }catch(e){ return null; } };
    async function charger(force){
      if(SG) return chargerTLE(force);
      const c=lireCache();
      if(!force && c && c.t0!=null && maintenant()-(c.recu||0)<TTL_ISS){ return etat(); }
      try{
        if(!doFetch) throw new Error('réseau indisponible');
        const t=Math.floor(maintenant()/1000);
        const r=await doFetch('https://api.wheretheiss.at/v1/satellites/25544/positions?timestamps='+t+','+(t+60)+'&units=kilometers');
        if(!r||!r.ok) throw new Error('HTTP '+(r&&r.status));
        const j=await r.json();
        if(!Array.isArray(j)||j.length<2||j.some(x=>!isFinite(+x.latitude)||!isFinite(+x.longitude))) throw new Error('réponse ISS inutilisable');
        const a=j[0], b=j[1], p0={t:a.timestamp*1000,lat:+a.latitude,lon:+a.longitude,alt:+a.altitude||420,vitesse:+a.velocity||27600};
        modele=ajuster(p0,{lat:+b.latitude});
        simule=false; erreur=null;
        stock.set('rayle_esp_iss',JSON.stringify({t0:p0.t,lat0:p0.lat,lon0:p0.lon,asc:+b.latitude>+a.latitude,alt:p0.alt,vitesse:p0.vitesse,recu:maintenant()}));
      }catch(e){
        erreur=String(e&&e.message||e);                              // on garde l'orbite en cours (dernière position connue, sinon exemple)
        if(c&&c.t0!=null&&simule){ modele=ajuster({t:c.t0,lat:c.lat0,lon:c.lon0,alt:c.alt,vitesse:c.vitesse},{lat:c.asc?c.lat0+1:c.lat0-1}); }
      }
      return etat();
    }
    return {etat,position,trace,charger,tle:()=>sat?{source:srcTLE,epoque:sat.epoqueMs}:null,erreur:()=>erreur,simule:()=>simule};
  }

  /* ═════ envoyer la scène vers un astre (outil « ambiance » de l'IA : « emmène-moi voir Saturne ») ═════
     La scène de l'Univers (fond ou plein écran) se déplace vraiment ; la phrase rendue ne dit que ce qui est calculé (faits du jour). */
  function executer(a){
    const U=G.RayleUnivers; if(!a||!U||!U.commande) return '';
    const cible=a.type==='retour'?'terre':a.cible; if(!cible||!ASTRES[cible]) return '';
    const cmd=cible==='terre'||cible==='iss'||cible==='lune'?[cible,{}]:['aller',{nom:cible}];
    Promise.resolve().then(()=>U.commande(cmd[0],cmd[1])).catch(()=>{});
    return (cible==='terre'?'':'Direction '+ASTRES[cible].nom+'. ')+faits(cible,{iss:UI.espace&&UI.espace.iss});
  }
  UI.espace={etat,cibleDe,nomCible,lieuDe,geoDe,estRover,ASTRES,faits,executer,creerISS,INCL,PERIODE_S,TTL_ISS};
  if(typeof document!=='undefined') UI.espace.iss=creerISS();
})();
