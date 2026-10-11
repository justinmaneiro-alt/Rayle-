"use strict";
/* ═════════════ FOND « ESPACE » : logique pure (RayleUI.espace) ═════════════
   Tout ce qui ne dessine rien : interrupteurs des éléments, commandes vocales (sans IA), faits dits par Raylé, ISS (position réelle
   + orbite simulée de secours), choix de la vue de la caméra. Le dessin 3D est dans ui/fond-espace.js (scène) et ui/fond-globe.js (Terre).
   Les positions du Soleil, de la Lune et des planètes viennent de ui/astro.js (éléments orbitaux, aucun service externe).

   ÉLÉMENTS (Réglages → Espace) : planetes · asteroides (ceinture, rochers, comètes, étoiles filantes) · satellites (ISS, train, fixes)
     · lune · aurores · voielactee (Voie lactée et nébuleuses) · flare (éclat du Soleil). Mémorisés ; RayleBus 'espace:elements'.
   VOIX (service 'ui:commande' de ui/settings.js, sans IA) : « montre-moi Mars / Jupiter / Saturne / la Lune / le Soleil / l'ISS »,
     « reviens sur la Terre », « active / désactive les planètes / les astéroïdes / les satellites / les aurores… ».
   ISS : API publique sans clé (api.wheretheiss.at), cache 10 min ; si le réseau échoue, orbite simulée à partir de la dernière position
     connue (ou d'une orbite d'exemple) : inclinaison 51,64°, période 92,9 min. */
(function(){
  const G=typeof window!=='undefined'?window:globalThis;
  const UI=G.RayleUI=G.RayleUI||{};
  const RAD=Math.PI/180, DEG=180/Math.PI;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const lireLS=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const ecrireLS=(k,v)=>{ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} };

  /* ═════ éléments activables ═════ */
  const ELEMENTS={planetes:'Planètes',asteroides:'Astéroïdes, comètes et étoiles filantes',satellites:'Satellites et ISS',lune:'Lune',aurores:'Aurores polaires',voielactee:'Voie lactée et nébuleuses',flare:'Éclat du Soleil (lens-flare)'};
  let elements=Object.fromEntries(Object.keys(ELEMENTS).map(k=>[k,true]));
  try{ Object.assign(elements,JSON.parse(lireLS('rayle_esp_elements')||'{}')||{}); }catch(e){}
  function regler(cle,v){
    if(!(cle in ELEMENTS)) return false;
    elements[cle]=!!v; ecrireLS('rayle_esp_elements',JSON.stringify(elements));
    try{ RayleBus.emit('espace:elements',Object.assign({},elements)); }catch(e){}
    return true;
  }

  /* ═════ les astres : noms, couleurs, faits ═════ */
  const ASTRES={
    soleil:{nom:'le Soleil',court:'Soleil'}, lune:{nom:'la Lune',court:'Lune'}, iss:{nom:'la Station spatiale internationale',court:'ISS'}, terre:{nom:'la Terre',court:'Terre'},
    mercure:{nom:'Mercure',court:'Mercure',rayonKm:2440}, venus:{nom:'Vénus',court:'Vénus',rayonKm:6052}, mars:{nom:'Mars',court:'Mars',rayonKm:3390},
    jupiter:{nom:'Jupiter',court:'Jupiter',rayonKm:69911}, saturne:{nom:'Saturne',court:'Saturne',rayonKm:58232}, uranus:{nom:'Uranus',court:'Uranus',rayonKm:25362}, neptune:{nom:'Neptune',court:'Neptune',rayonKm:24622}
  };
  const UA_KM=149597870.7;
  const fr=(n,d=0)=>Number(n).toLocaleString('fr-FR',{maximumFractionDigits:d,minimumFractionDigits:d});
  const millions=km=>{ const m=km/1e6; return m>=100?fr(Math.round(m)):fr(m,1); };
  const FAIT2={
    soleil:'Il contient 99,8 % de la masse du système solaire.',
    lune:'Elle s’éloigne de nous de près de 4 centimètres par an.',
    mercure:'Sa surface passe de 430 degrés le jour à moins 180 la nuit.',
    venus:'Son atmosphère de gaz carbonique en fait la planète la plus chaude : 465 degrés.',
    mars:'Il porte le plus grand volcan connu, l’Olympus Mons, trois fois haut comme l’Everest.',
    jupiter:'Sa Grande Tache rouge est une tempête plus large que la Terre, observée depuis plus de trois siècles.',
    saturne:'Ses anneaux s’étendent sur près de 280 000 kilomètres, mais ne font que quelques dizaines de mètres d’épaisseur.',
    uranus:'Il tourne couché sur le côté, incliné de 98 degrés.',
    neptune:'Il a les vents les plus rapides du système solaire : plus de 2 000 kilomètres par heure.',
    iss:'Six à sept astronautes y vivent en permanence depuis l’an 2000.'
  };
  // 1 ou 2 faits courts ; les chiffres du jour sont calculés (distances, phase, altitude de l'ISS)
  function faits(cible,ctx){
    ctx=ctx||{}; const ts=ctx.ts||Date.now(), A=UI.astro;
    if(cible==='terre') return 'De retour sur la Terre.';
    if(cible==='soleil'){
      const d=A.soleilEq(ts).dist;
      return 'Le Soleil est à '+millions(d*UA_KM)+' millions de kilomètres : sa lumière met '+fr(d*8.317,1)+' minutes à nous parvenir. '+FAIT2.soleil;
    }
    if(cible==='lune'){
      const m=A.luneEq(ts), l=A.lune(ts);
      return 'La Lune est à '+fr(Math.round(m.distKm/1000)*1000)+' kilomètres ce soir, éclairée à '+Math.round(l.eclairee*100)+' %. '+FAIT2.lune;
    }
    if(cible==='iss'){
      const e=ctx.iss&&ctx.iss.etat?ctx.iss.etat(ts):null;
      const alt=e?Math.round(e.alt/10)*10:420;
      return 'L’ISS est à environ '+fr(alt)+' kilomètres d’altitude et file à 27 600 kilomètres par heure : un tour de la Terre en 93 minutes.'+(e&&!e.simule?' Elle est en ce moment au-dessus de '+fr(Math.abs(e.lat),0)+'° '+(e.lat>=0?'nord':'sud')+', '+fr(Math.abs(e.lon),0)+'° '+(e.lon>=0?'est':'ouest')+'.':'');
    }
    const p=A.planete(cible,ts); if(!p) return '';
    return ASTRES[cible].nom+' est à '+millions(p.dist*UA_KM)+' millions de kilomètres de nous aujourd’hui. '+FAIT2[cible];
  }

  /* ═════ commandes vocales (texte normalisé : minuscules, sans accents ni ponctuation) ═════ */
  const norm=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/['’`]/g,' ').replace(/[?!.,;:…«»"]/g,' ').replace(/-/g,' ').replace(/\s+/g,' ').trim().replace(/^(?:(?:hey|he|eh|ok|okay|dis) )?rayle /,'');
  const QUESTION=/\b(?:pourquoi|comment|quel|quelle|quels|quelles|combien|c est quoi|qu est ce|est ce que|est ce qu|ou est|ou se trouve)\b/;
  const ALIAS_ASTRE=[
    [/^(?:soleil|etoile du jour)$/,'soleil'], [/^(?:lune|satellite naturel)$/,'lune'],
    [/^(?:iss|i s s|isse|station spatiale(?: internationale)?|station internationale)$/,'iss'],
    [/^mercure$/,'mercure'], [/^venus$/,'venus'], [/^mars$/,'mars'], [/^jupiter$/,'jupiter'], [/^saturne$/,'saturne'], [/^uranus$/,'uranus'], [/^neptune$/,'neptune']
  ];
  const VERBE_VOL=/^(?:(?:s il te plait|stp) )?(?:montre|montres|montrer|affiche|afficher|emmene|emmener|amene|amener|vole|voler|va|vas|aller|zoome|zoomer|regarde|regarder|visite|visiter|direction|cap sur|focus sur|fais moi voir|fais voir)(?: moi)?(?: voler)?(?: (?:vers|sur|a|au|aux|jusqu a|jusqu au|dans|de))*(?: moi)? (.+)$/;
  const ARTICLES=/^(?:le|la|l|les|un|une|mon|ma|notre|planete|astre|de|d|du) /;
  const ELEM_ALIAS=[
    [/^(?:planetes?|les planetes)$/,'planetes'], [/^(?:asteroides?|ceinture d asteroides|ceinture|cometes?|etoiles filantes?|debris|rochers)$/,'asteroides'],
    [/^(?:satellites?|iss|station spatiale)$/,'satellites'], [/^(?:aurores?(?: polaires?| boreales?)?)$/,'aurores'],
    [/^(?:voie lactee|nebuleuses?|voie lactee et nebuleuses?)$/,'voielactee'], [/^(?:lens ?flare|flare|eclat du soleil|eclat)$/,'flare'], [/^lune$/,'lune']
  ];
  const ON=/^(?:active|activer|allume|allumer|remets|remet|remettre|affiche|afficher|montre|montrer|mets|met|mettre|ajoute|ajouter|rends|rends moi)(?: moi)?$/;
  const OFF=/^(?:desactive|desactiver|eteins|eteindre|coupe|couper|enleve|enlever|retire|retirer|cache|cacher|masque|masquer|supprime|supprimer|ote|plus de|sans)(?: moi)?$/;
  function analyser(texte){
    let t=norm(texte);
    if(!t || t.split(' ').length>10 || QUESTION.test(t)) return null;
    if(/\b(?:graphique|graphe|chart|bougies?|rsi|terminal|carte|courbe|bitcoin|nasdaq|calendrier|mois)\b/.test(t)) return null;
    // retour sur la Terre
    if(/^(?:reviens|revenir|retourne|retourner|retour|ramene moi|ramene|rentre|rentrer|repars|recentre|recentrer)\b/.test(t) && /\b(?:terre|vue d ensemble|vue generale|orbite)\b/.test(t)) return {type:'retour'};
    // allumer / éteindre des éléments : « désactive les astéroïdes »
    const m=t.match(/^([a-z]+(?: moi)?|plus de|sans) (?:(?:les|la|le|l|des|du|de|d) )*(.+)$/);
    if(m){
      const verbe=m[1], cat=m[2].replace(/ (?:stp|svp|s il te plait|maintenant)$/,'');
      const cle=(ELEM_ALIAS.find(([re])=>re.test(cat))||[])[1];
      const pluriel=/^(?:planetes|asteroides|satellites|cometes|etoiles filantes|aurores|nebuleuses|debris|rochers)/.test(cat) || /^(?:aurores?|voie lactee|nebuleuses?|ceinture|lens|flare|eclat)/.test(cat);
      if(cle && OFF.test(verbe)) return {type:'elements',cle,valeur:false};
      if(cle && ON.test(verbe) && (pluriel || /^(?:active|activer|allume|allumer|remets|remet|remettre|ajoute|ajouter)/.test(verbe))) return {type:'elements',cle,valeur:true};
    }
    // « montre-moi Mars »
    const v=t.match(VERBE_VOL);
    if(v){
      let r=v[1].replace(/ (?:stp|svp|s il te plait|maintenant)$/,'');
      for(let i=0;i<3 && ARTICLES.test(r);i++) r=r.replace(ARTICLES,'');
      const a=ALIAS_ASTRE.find(([re])=>re.test(r));
      if(a) return {type:'vers',cible:a[1]};
    }
    return null;
  }

  /* ═════ ISS : position réelle (cache 10 min), orbite simulée sinon ═════ */
  const INCL=51.64, PERIODE_S=92.9*60, N_RAD_S=2*Math.PI/PERIODE_S, TTL_ISS=10*60000;
  const EXEMPLE={t0:Date.UTC(2026,0,1,0,0,0),lat0:0,lon0:30,asc:true,alt:420,vitesse:27600};   // orbite d'exemple si rien n'est connu
  function creerISS(deps){
    deps=deps||{};
    const maintenant=deps.maintenant||(()=>Date.now());
    const stock=deps.stockage||{get:lireLS,set:ecrireLS};
    const doFetch=deps.fetch||(typeof fetch==='function'?(u,o)=>fetch(u,o):null);
    const gmst=ts=>UI.astro.gmst(ts);
    let modele=null, simule=true, erreur=null;
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
    // position inertielle : {ra, dec (degrés), r (rayons terrestres), lat, lon (terrestres)} à l'instant ts
    function position(ts){
      const u=modele.u0+N_RAD_S*(ts-modele.t0)/1000, i=INCL*RAD;
      const dec=Math.asin(Math.sin(i)*Math.sin(u))*DEG;
      const ra=(modele.omega+Math.atan2(Math.cos(i)*Math.sin(u),Math.cos(u))*DEG+720)%360;
      const lon=((ra-gmst(ts)+540)%360+360)%360-180;
      return {ra,dec,lat:dec,lon,r:1+modele.alt/6371,alt:modele.alt};
    }
    const etat=ts=>Object.assign(position(ts||maintenant()),{vitesse:modele.vitesse,simule});
    function trace(ts,avantMin,apresMin,pas){                       // suite de positions inertielles (pour la traînée)
      const o=[]; for(let m=-avantMin;m<=apresMin+1e-6;m+=pas){ const p=position(ts+m*60000); o.push(p); } return o;
    }
    async function charger(force){
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
    return {etat,position,trace,charger,erreur:()=>erreur,simule:()=>simule};
  }

  /* ═════ choix de la vue de la caméra : où regarder pour avoir une belle image ═════ */
  // vue (yaw, pitch en degrés) → direction de la caméra depuis la Terre (unitaire)
  const vueVecteur=(yaw,pitch)=>[Math.cos(pitch*RAD)*Math.sin(yaw*RAD),Math.sin(pitch*RAD),Math.cos(pitch*RAD)*Math.cos(yaw*RAD)];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const FOV_V=35, DIST_CAM=6.4, DIST_LUNE=3.6;
  // ctx : {soleil:[x,y,z], lune:[x,y,z], planetes:[{nom,dir,poids}], aspect}. Renvoie {yaw, pitch, score}
  function evaluerVue(yaw,pitch,ctx){
    const c=vueVecteur(yaw,pitch), a=c.map(x=>-x), tanV=Math.tan(FOV_V*RAD/2), tanH=tanV*(ctx.aspect||1.6);
    const eclairee=(1+dot(c,ctx.soleil))/2;
    let s=5*Math.max(0,1-Math.abs(eclairee-.62)/.4)-(eclairee<.3?8:0);   // Terre bien éclairée (un joli terminateur) : jamais sacrifiée à la Lune ou aux planètes
    const dansLeChamp=(p)=>{                                           // p : position dans le monde ; vrai si dans le cadre (sans le bord)
      const v=[p[0]-c[0]*DIST_CAM,p[1]-c[1]*DIST_CAM,p[2]-c[2]*DIST_CAM], z=dot(v,a); if(z<=0.5) return false;
      // base de la caméra (haut ≈ pôle nord céleste) : droite = a × y
      let r=[-a[2],0,a[0]]; const nr=Math.hypot(r[0],r[2])||1; r=[r[0]/nr,0,r[2]/nr];
      const u=[r[1]*a[2]-r[2]*a[1],r[2]*a[0]-r[0]*a[2],r[0]*a[1]-r[1]*a[0]];
      return Math.abs(dot(v,r)/z)<tanH*.78 && Math.abs(dot(v,u)/z)<tanV*.78;
    };
    if(ctx.lune){
      const m=ctx.lune.map(x=>x*DIST_LUNE), derriere=dot(ctx.lune,c)<-.15 && Math.sqrt(Math.max(0,1-dot(ctx.lune,c)**2))*DIST_LUNE<1.15;
      if(dansLeChamp(m) && !derriere) s+=2.2;
    }
    let n=0;
    for(const p of (ctx.planetes||[])){ if(n>=2) break; if(dansLeChamp(p.dir.map(x=>x*40))){ s+=(p.poids||1)*1.4; n++; } }
    return s;
  }
  function choisirVue(ctx,opts){
    opts=opts||{}; let meilleur=null;
    for(let yaw=0;yaw<360;yaw+=10) for(const pitch of [8,16,24]){
      if(opts.loinDe!=null){ const d=Math.abs(((yaw-opts.loinDe+540)%360)-180); if(d<(opts.ecartMin||45)) continue; }
      const s=evaluerVue(yaw,pitch,ctx)-(opts.penalite?opts.penalite(yaw,pitch):0);
      if(!meilleur||s>meilleur.score) meilleur={yaw,pitch,score:s};
    }
    return meilleur;
  }

  /* ═════ exécution des commandes vocales ═════ */
  let attente=null;
  function allerVers(cible){
    const sc=UI.fondScene&&UI.fondScene();
    if(sc && sc.vers && UI.reglages().fond==='espace'){ sc.vers(cible); return true; }
    attente=cible; return false;
  }
  function executer(a,ctx){
    if(!a) return null;
    const r=UI.reglages?UI.reglages():{fond:'aucun',palier:0};
    const iss=UI.espace&&UI.espace.iss;
    if(a.type==='elements'){
      const bascule=regler(a.cle,a.valeur);
      if(bascule && r.fond!=='espace') return (a.valeur?'Activé':'Désactivé')+' : '+ELEMENTS[a.cle].toLowerCase()+'. Cela se verra avec le fond Espace.';
      return (a.valeur?'J’affiche':'Je retire')+' : '+ELEMENTS[a.cle].toLowerCase()+'.';
    }
    if(a.type==='retour'){
      const sc=UI.fondScene&&UI.fondScene(); attente=null;
      if(sc && sc.retour && r.fond==='espace') sc.retour();
      return 'Retour sur la Terre.';
    }
    if(a.type==='vers'){
      const f=faits(a.cible,{iss});
      if(r.palier>=2) return 'Voici '+ASTRES[a.cible].nom+'. '+f+' (En mode Éco le fond reste une image fixe : passe en Auto ou Max pour que la caméra y vole.)';
      if(r.fond!=='espace'){ try{ UI.changer('fond','espace'); }catch(e){} }
      allerVers(a.cible);
      return 'Direction '+ASTRES[a.cible].nom+'. '+f;
    }
    return null;
  }
  if(typeof RayleBus!=='undefined'){
    try{ RayleBus.fournir('espace:commande',c=>{ const a=analyser(c); return a?executer(a):null; }); }catch(e){}
    try{ RayleBus.on('espace:pret',()=>{ if(attente){ const c=attente; attente=null; const sc=UI.fondScene&&UI.fondScene(); if(sc&&sc.vers) setTimeout(()=>sc.vers(c),1500); } }); }catch(e){}
  }

  UI.espace={ELEMENTS,elements:()=>Object.assign({},elements),regler,ASTRES,faits,analyser,executer,creerISS,choisirVue,evaluerVue,vueVecteur,DIST_CAM,DIST_LUNE,FOV_V,INCL,PERIODE_S,TTL_ISS};
  if(typeof document!=='undefined') UI.espace.iss=creerISS();
})();
