"use strict";
/* ═════════════ TERRE VIVANTE : trafic simulé, épingles, tracés, frontières, temps et rotation (outils de Raylé sur la Terre) ═════════════
   Deux parties :
   • PURE (testable sans navigateur) : résolution d'un lieu (ville, capitale, monument, pays), géométrie sur la sphère, positions des avions et des bateaux à un instant donné,
     état des épingles et des tracés, analyse des phrases (analyser) et exécution (executer).
   • SCÈNE (monter) : objets three.js posés sur la Terre (UI.espaceMonter de ui/fond-espace.js l'appelle) : avions et bateaux, épingles avec étiquette, trajets, frontières, panneau « Terre vivante ».
   Honnêteté : le trafic est SIMULÉ (routes plausibles, vitesses accélérées pour être visibles : ×240 pour les avions, ×1 800 pour les bateaux en mode pédagogique, temps réel en mode réaliste) ;
   l'écran l'écrit toujours (« trafic simulé »). Le mode « temps réel » ne s'allume que si le Worker fournit la route /vols (OpenSky Network, anonyme) ; sinon Raylé le dit et reste en simulation. */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  const D=()=>UI.espaceTerreDonnees||{AEROPORTS:[],ROUTES_AERIENNES:[],VOIES_MARITIMES:[],VILLES:[]};
  const RAD=Math.PI/180, R_KM=6371;
  const norm=t=>String(t==null?'':t).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[œ]/g,'oe').replace(/[’'`´]/g,' ').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
  const clamp=(x,a,b)=>x<a?a:x>b?b:x;
  const dir=(lat,lon,r)=>{ const a=lat*RAD, b=lon*RAD; r=r||1; return [r*Math.cos(a)*Math.cos(b),r*Math.sin(a),-r*Math.cos(a)*Math.sin(b)]; };
  const vers=v=>({lat:Math.asin(clamp(v[1],-1,1))/RAD,lon:Math.atan2(-v[2],v[0])/RAD});
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  /** point à la fraction t du grand cercle de A vers B (vecteurs unitaires) */
  function gc(A,B,t,om){
    om=om==null?Math.acos(clamp(dot(A,B),-1,1)):om; if(om<1e-6) return A.slice();
    const s=Math.sin(om), a=Math.sin((1-t)*om)/s, b=Math.sin(t*om)/s, p=[a*A[0]+b*B[0],a*A[1]+b*B[1],a*A[2]+b*B[2]], n=Math.hypot(...p)||1;
    return [p[0]/n,p[1]/n,p[2]/n];
  }
  const distKm=(la1,lo1,la2,lo2)=>Math.acos(clamp(dot(dir(la1,lo1),dir(la2,lo2)),-1,1))*R_KM;
  const rng=graine=>{ let s=graine>>>0; return ()=>(s=(s*1664525+1013904223)>>>0)/4294967296; };

  /* ───────────────────────── lieux ───────────────────────── */
  const ALIAS_PAYS={'usa':'840','etats unis d amerique':'840','etats unis':'840','royaume uni':'826','grande bretagne':'826','angleterre':'826','hollande':'528','pays bas':'528','coree':'410','republique tcheque':'203','tchequie':'203','birmanie':'104','myanmar':'104','cote d ivoire':'384','russie':'643','iran':'364','syrie':'760','laos':'418','viet nam':'704','vietnam':'704','bolivie':'068','venezuela':'862','tanzanie':'834','moldavie':'498','coree du sud':'410','coree du nord':'408','republique democratique du congo':'180','rd congo':'180','congo':'178','eswatini':'748','swaziland':'748','turquie':'792','palestine':'275'};
  let indexPays=null;
  function paysIndex(){
    if(indexPays) return indexPays; indexPays=new Map();
    const centres=new Map((UI.espacePaysCentres||[]).map(l=>[l[0],l]));
    for(const l of (window.RaylePays||[])){ const c=centres.get(l[0]); if(!c) continue; const nom=l[3]; indexPays.set(norm(nom),{num:l[0],nom,lat:c[1],lon:c[2],etendue:c[3]}); }
    for(const [k,num] of Object.entries(ALIAS_PAYS)){ const p=[...indexPays.values()].find(x=>x.num===num.replace('x','')); if(p&&!indexPays.has(k)) indexPays.set(k,p); }
    return indexPays;
  }
  let indexVilles=null;
  function villesIndex(){
    if(indexVilles) return indexVilles; indexVilles=new Map();
    for(const [nom,lat,lon,pays] of D().VILLES) indexVilles.set(norm(nom),{nom,lat,lon,pays,type:'ville'});
    const E=UI.espace; const L=(UI.espaceLieux&&UI.espaceLieux.LIEUX)||[];
    for(const l of L) if(l.type==='capitale'){ const k=norm(l.nom); if(!indexVilles.has(k)) indexVilles.set(k,{nom:l.nom,lat:l.lat,lon:l.lon,pays:l.pays,type:'capitale'}); }
    void E; return indexVilles;
  }
  const sansArticle=s=>s.replace(/^(?:l|le|la|les|un|une|du|de|des|d|au|aux|en|a) /,'').replace(/^(?:l|le|la|les) /,'');
  const zoomPays=e=>clamp(1.2+e/48,1.35,2.5);
  /** Texte libre → { nom, lat, lon, zoom, type:'pays'|'ville'|'capitale'|'monument', pays?, num? } ou null */
  function lieu(texte){
    let r=norm(texte).replace(/ (?:sur la terre|sur le globe|sur terre|stp|svp|s il te plait)$/,'').trim(); if(!r) return null;
    for(let i=0;i<3;i++){ const s=sansArticle(r); if(s===r) break; r=s; }
    const L=(UI.espaceLieux&&UI.espaceLieux.LIEUX)||[];
    const mon=L.find(l=>l.type==='monument'&&norm(l.nom).replace(/^(?:l|le|la|les) /,'')===r); if(mon) return {nom:mon.nom,lat:mon.lat,lon:mon.lon,zoom:mon.zoom||1.18,type:'monument',info:mon.info};
    const v=villesIndex().get(r); if(v) return {nom:v.nom,lat:v.lat,lon:v.lon,zoom:v.type==='capitale'?1.35:1.3,type:v.type,pays:v.pays};
    const p=paysIndex().get(r); if(p){ const l=L.find(x=>x.type==='pays'&&norm(x.nom)===norm(p.nom)); return {nom:p.nom,lat:l?l.lat:p.lat,lon:l?l.lon:p.lon,zoom:l&&l.zoom?Math.max(l.zoom,zoomPays(p.etendue)):zoomPays(p.etendue),type:'pays',num:p.num}; }
    const l=L.find(x=>norm(x.nom).replace(/^(?:l|le|la|les) /,'')===r); if(l) return {nom:l.nom,lat:l.lat,lon:l.lon,zoom:l.zoom||1.5,type:l.type,pays:l.pays};
    return null;
  }
  const ciblePour=l=>'geo:'+l.lat+','+l.lon+','+String(l.nom).replace(/,/g,' ')+','+(l.zoom||1.5);

  /* ───────────────────────── trafic simulé ───────────────────────── */
  const K_VISU={pedagogique:{avion:240,navire:1800},realiste:{avion:1,navire:1}};
  const VIT_AVION=880, VIT_NAVIRE=40;                                // km/h
  let routesCache=null, voiesCache=null;
  function routes(){
    if(routesCache) return routesCache; const A=new Map(D().AEROPORTS.map(a=>[a[0],a])); routesCache=[];
    for(const [x,y,p] of D().ROUTES_AERIENNES){ const a=A.get(x), b=A.get(y); if(!a||!b) continue; const va=dir(a[2],a[3]), vb=dir(b[2],b[3]), om=Math.acos(clamp(dot(va,vb),-1,1)); routesCache.push({a:x,b:y,va,vb,om,km:om*R_KM,poids:p||1}); }
    return routesCache;
  }
  /** Les voies maritimes densifiées : points tous les ≈ 80 km, longueurs cumulées */
  function voies(){
    if(voiesCache) return voiesCache; voiesCache=[];
    for(const [id,nom,type,pts] of D().VOIES_MARITIMES){
      const poly=[], cum=[]; let total=0;
      for(let i=0;i<pts.length-1;i++){ const A=dir(...pts[i]), B=dir(...pts[i+1]), om=Math.acos(clamp(dot(A,B),-1,1)), n=Math.max(1,Math.ceil(om*R_KM/80)); for(let k=0;k<n;k++){ const p=gc(A,B,k/n,om); if(poly.length){ total+=Math.acos(clamp(dot(poly[poly.length-1],p),-1,1))*R_KM; } poly.push(p); cum.push(total); } }
      const last=dir(...pts[pts.length-1]); total+=Math.acos(clamp(dot(poly[poly.length-1],last),-1,1))*R_KM; poly.push(last); cum.push(total);
      voiesCache.push({id,nom,type,poly,cum,km:total});
    }
    return voiesCache;
  }
  /** N avions répartis sur les routes selon leur poids ; déterministe (même graine, mêmes avions) */
  function creerAvions(n,graine){
    const R=rng(graine||77), rs=routes(), tot=rs.reduce((s,r)=>s+r.poids,0), out=[];
    for(let i=0;i<n;i++){ let k=R()*tot, ri=0; for(;ri<rs.length-1;ri++){ k-=rs[ri].poids; if(k<=0) break; } out.push({r:ri,off:R(),v:VIT_AVION*(.9+.2*R()),sens:R()<.5?1:-1}); }
    return out;
  }
  /** Position d'un avion à l'instant virtuel T (ms) : { v:[x,y,z] unitaire, alt, cap:[x,y,z] direction } ; il va de A à B puis revient (pas de saut). */
  function positionAvion(av,T,mode){
    const r=routes()[av.r], k=(K_VISU[mode]||K_VISU.pedagogique).avion, trajet=Math.max(r.km/av.v,.3)*3600;       // secondes d'un aller
    const ph=(((T/1000)*k/trajet+av.off)%2+2)%2, t=ph<1?ph:2-ph, a=av.sens>0?r.va:r.vb, b=av.sens>0?r.vb:r.va, p=gc(a,b,t,r.om), q=gc(a,b,Math.min(1,t+.01),r.om);
    return {v:p,alt:1.004+.012*Math.sin(Math.PI*t)*Math.min(1,r.km/3000),cap:[q[0]-p[0],q[1]-p[1],q[2]-p[2]],t};
  }
  function creerNavires(n,graine){
    const R=rng(graine||91), vs=voies(), tot=vs.reduce((s,v)=>s+v.km,0), out=[];
    for(let i=0;i<n;i++){ let k=R()*tot, vi=0; for(;vi<vs.length-1;vi++){ k-=vs[vi].km; if(k<=0) break; } out.push({v:vi,off:R(),vit:VIT_NAVIRE*(.7+.5*R()),sens:R()<.5?1:-1}); }
    return out;
  }
  function positionNavire(nv,T,mode){
    const w=voies()[nv.v], k=(K_VISU[mode]||K_VISU.pedagogique).navire, trajet=Math.max(w.km/nv.vit,1)*3600, ph=(((T/1000)*k/trajet+nv.off)%2+2)%2, t=ph<1?ph:2-ph, d=(nv.sens>0?t:1-t)*w.km;
    let lo=0, hi=w.cum.length-1; while(hi-lo>1){ const m=(lo+hi)>>1; if(w.cum[m]<=d) lo=m; else hi=m; }
    const span=(w.cum[hi]-w.cum[lo])||1, f=(d-w.cum[lo])/span, p=gc(w.poly[lo],w.poly[hi],f);
    return {v:p,alt:1.0012};
  }
  const lonLocale=(v,Tms)=>{ const l=vers(v); return ((l.lon+((Tms/86400000)%1)*360)%360); };
  void lonLocale;

  /* ───────────────────────── état : épingles, tracés ───────────────────────── */
  const etat={epingles:[],traces:[],dernierLieu:null,dernierLieuT:0,compteur:0,couches:{villes:true,vols:true,bateaux:true,epingles:true},reelVols:false,reelEtat:'simulé'};
  const COULEURS={rouge:0xff4d6d,bleu:0x4da8ff,vert:0x39d98a,jaune:0xffd24d,orange:0xff9f43,violet:0xb06cff,rose:0xff7ac8,blanc:0xffffff,cyan:0x4de3ff};
  const NOMS_COULEURS=Object.keys(COULEURS);
  const MAX_EPINGLES=60, MAX_TRACES=12;
  function ajouterEpingle(l,couleur){
    const ex=etat.epingles.find(e=>Math.abs(e.lat-l.lat)<.02&&Math.abs(e.lon-l.lon)<.02); if(ex){ if(couleur) ex.couleur=couleur; return {ok:true,id:ex.id,deja:true,epingle:ex}; }
    if(etat.epingles.length>=MAX_EPINGLES) return {ok:false,raison:'limite'};
    const e={id:'p'+(++etat.compteur),nom:l.nom,lat:l.lat,lon:l.lon,couleur:couleur||'rouge'}; etat.epingles.push(e); return {ok:true,id:e.id,epingle:e};
  }
  function ajouterTrace(t){ if(etat.traces.length>=MAX_TRACES) etat.traces.shift(); const x=Object.assign({id:'t'+(++etat.compteur)},t); etat.traces.push(x); return x; }
  function effacer(quoi){
    const n0=etat.epingles.length, t0=etat.traces.length;
    if(!quoi||quoi==='tout'){ etat.epingles.length=0; etat.traces.length=0; }
    else if(quoi==='epingles') etat.epingles.length=0;
    else if(quoi==='traces') etat.traces.length=0;
    else if(quoi==='frontieres') etat.traces=etat.traces.filter(t=>t.type!=='frontieres');
    else if(quoi==='trajets') etat.traces=etat.traces.filter(t=>t.type!=='trajet');
    return {epingles:n0-etat.epingles.length,traces:t0-etat.traces.length};
  }

  /* ───────────────────────── phrases ───────────────────────── */
  const CIBLE_ART='(?:(?:le|la|les|l|un|une|du|de la|de l|des|d|au|aux|en|a|sur|vers) )*';
  const MOT_POINT='(?:point|points|marqueur|marqueurs|epingle|epingles|repere|reperes|pastille|pastilles|punaise|balise)';
  const V_POSER='(?:place|placer|pose|poser|mets|met|mettre|ajoute|ajouter|plante|planter|marque|marquer|epingle|epingler|signale|signaler|indique|indiquer)';
  const V_TRACER='(?:trace|tracer|dessine|dessiner|relie|relier|montre|montrer|affiche|afficher|fais|fait|surligne|surligner|contourne)';
  const V_EFFACER='(?:efface|effacer|supprime|supprimer|enleve|enlever|retire|retirer|nettoie|nettoyer|vide|vider|retire moi|enleve moi|supprime moi|efface moi)';
  const FEM={bleue:'bleu',verte:'vert',violette:'violet',blanche:'blanc'}, COULEUR_RE=new RegExp('\\b(?:en |de couleur )?('+NOMS_COULEURS.join('|')+'|bleue|verte|violette|blanche)\\b');
  const ECHELLES_NOMBRE=[[/\bjour(?:s)? par seconde\b/,86400],[/\b(?:6|six) heures? par seconde\b/,21600],[/\bheure par seconde\b/,3600],[/\b(?:10|dix) minutes? par seconde\b/,600],[/\bminute par seconde\b/,60]];
  /** Phrase normalisée → { type:'terre', action, … } ou null. `ctx` : { cible (astre affiché), lieuAffiche, fond } */
  function analyser(texte,ctx){
    const t=norm(texte); if(!t||t.split(' ').length>16) return null; ctx=ctx||{};
    const sur=/\b(?:sur la terre|sur le globe|sur terre|sur le fond)\b/.test(t);
    // ── temps ──
    if((/\btemps\b|\bheure reelle\b|\bhorloge\b|\bpar seconde\b/.test(t)) && !/\bquel(?:le)? temps\b|\bmeteo\b|\bcombien de temps\b/.test(t)){
      if(/^(?:remets?|remettre|reviens|revenir|repasse|repasser|retour|reprends|reprendre|rends|mets|passe)\b.*\b(?:temps reel|heure reelle|heure normale|temps normal|vitesse normale|heure actuelle)\b|^(?:temps reel|heure reelle)$/.test(t)) return {type:'terre',action:'temps',mode:'reel'};
      if(/\b(?:fige|figer|arrete|arreter|stoppe|stopper|pause|gele|geler|immobilise|suspends|suspendre)\b.*\btemps\b|\btemps\b.*\b(?:fige|fige|arrete|pause|gele)\b/.test(t)) return {type:'terre',action:'temps',mode:'pause'};
      if(/\b(?:reprends|reprendre|relance|relancer|redemarre|redemarrer|remets|remettre|libere|liberer)\b.*\btemps\b/.test(t)&&!/reel|normal/.test(t)) return {type:'terre',action:'temps',mode:'reprise'};
      for(const [re,k] of ECHELLES_NOMBRE) if(re.test(t)) return {type:'terre',action:'temps',mode:'echelle',k};
      const m=t.match(/\b(?:accelere|accelerer|acceleration|rapide|vite|fois|x)\b.*?(\d[\d ]*)|\b(?:x|fois) ?(\d[\d ]*)/); const nb=m&&parseInt(String(m[1]||m[2]).replace(/ /g,''),10);
      if(/\b(?:accelere|accelerer|acceleration|plus vite|fais passer|fait passer|avance rapide)\b/.test(t)||nb){ if(nb&&nb>=2) return {type:'terre',action:'temps',mode:'echelle',k:Math.min(nb,1e7)}; return {type:'terre',action:'temps',mode:'plus'}; }
      if(/\b(?:ralentis|ralentir|ralenti|moins vite|plus lentement)\b/.test(t)) return {type:'terre',action:'temps',mode:'moins'};
      const dec=t.match(/\b(avance|avancer|recule|reculer|remonte|remonter|decale|decaler)\b.*?\bde (\d+) (minutes?|heures?|jours?|semaines?|mois)\b/);
      if(dec){ const u=/^minute/.test(dec[3])?60000:/^heure/.test(dec[3])?3600000:/^jour/.test(dec[3])?86400000:/^semaine/.test(dec[3])?604800000:2592000000; return {type:'terre',action:'temps',mode:'decaler',ms:(/^(?:recule|reculer|remonte|remonter)/.test(dec[1])?-1:1)*(+dec[2])*u}; }
    }
    // ── rotation à la main ──
    if(/\b(?:terre|globe|planete)\b/.test(t) || /\b(?:a la main|manuellement|au doigt)\b/.test(t)){
      if(/\b(?:arrete|arreter|desactive|desactiver|quitte|quitter|fin)\b.*\b(?:rotation|main|manuel\w*)\b/.test(t)) return {type:'terre',action:'main',oui:false};
      if(/\b(?:fais|fait|faire|laisse moi|je veux|permets moi de|permets)\b.*\b(?:tourner|pivoter|rotation)\b|\b(?:tourner|pivoter|rotation)\b.*\b(?:a la main|manuellement|au doigt|moi meme)\b|\b(?:mode|rotation) (?:main|manuel\w*)\b/.test(t)) return {type:'terre',action:'main',oui:true};
      if(/\b(?:remets?|remettre|replace|replacer|reinitialise|reinitialiser|redresse|redresser)\b.*\b(?:terre|globe|rotation|orientation)\b/.test(t)&&/\b(?:en place|normale|reelle|vraie|d origine|orientation)\b|\brotation\b/.test(t)) return {type:'terre',action:'zero'};
      const sens=t.match(/\b(?:tourne|tourner|fais tourner|fait tourner|fais pivoter|pivote)\b.*\b(?:vers l |vers |a l )?(est|ouest|droite|gauche|l est|l ouest)\b/);
      if(sens) return {type:'terre',action:'elan',sens:/ouest|gauche/.test(sens[1])?-1:1};
    }
    // ── trafic, villes lumineuses ──
    { const on=/\b(?:affiche|afficher|montre|montrer|active|activer|allume|allumer|ajoute|ajouter|remets|remettre|je veux voir|fais apparaitre)\b/.test(t), off=/\b(?:masque|masquer|cache|cacher|desactive|desactiver|eteins|eteindre|enleve|enlever|retire|retirer|supprime|supprimer|plus de|sans|coupe|couper)\b/.test(t);
      const ou=(on||off)&&!/\b(?:points?|marqueurs?|epingles?|traces?|trajets?|frontieres?)\b/.test(t)?(off?false:true):null;
      if(/\b(?:vols?|avions?|trafic aerien)\b.*\b(?:temps reel|en direct|reels?|vrais)\b|\b(?:temps reel|en direct|vrais)\b.*\b(?:vols?|avions?)\b/.test(t)&&/\b(?:affiche|montre|active|passe|mets|utilise|je veux)\b/.test(t)) return {type:'terre',action:'vols-reels',oui:true};
      if(/\b(?:vols?|avions?|trafic)\b.*\b(?:simule|simules|simulation)\b/.test(t)&&/\b(?:remets?|repasse|retour|reviens|passe|mets)\b/.test(t)) return {type:'terre',action:'vols-reels',oui:false};
      if(ou!==null){
        if(/\b(?:vols?|avions?|trafic aerien|aerien|aeriennes?)\b/.test(t)) return {type:'terre',action:'couche',cle:'vols',oui:ou};
        if(/\b(?:bateaux|bateau|navires?|cargos?|trafic maritime|maritime|maritimes)\b/.test(t)) return {type:'terre',action:'couche',cle:'bateaux',oui:ou};
        if(/\btrafic\b/.test(t)) return {type:'terre',action:'couche',cle:'trafic',oui:ou};
        if(/\b(?:villes? lumineuses?|lumieres? des villes|lumieres? nocturnes?|villes? la nuit|eclairage des villes|villes illuminees)\b/.test(t)) return {type:'terre',action:'couche',cle:'villes',oui:ou};
      }
    }
    // ── effacer ──
    { const e=t.match(new RegExp('^'+V_EFFACER+'(?: moi)? (?:(?:tout|toute|toutes|tous|le|la|les|l|mes|ces|ses|des|du|de la|de l|d|sur la terre|sur le globe) )*(.*)$'));
      if(e && (/\b(?:points?|marqueurs?|epingles?|traces?|trajets?|frontieres?|reperes?|dessins?|annotations?|pastilles?|punaises?|balises?|lignes?|arcs?|contours?)\b/.test(t) || /^(?:efface|supprime|nettoie|vide|enleve|retire)(?: moi)? tout(?: sur (?:la terre|le globe))?$/.test(t) || (sur&&/\btout\b/.test(t)))){
        let quoi='tout'; const q=e[1];
        if(/\b(?:points?|marqueurs?|epingles?|reperes?|pastilles?|punaises?|balises?)\b/.test(q)&&!/\b(?:traces?|trajets?|frontieres?)\b/.test(q)) quoi='epingles';
        else if(/\bfrontieres?|contours?\b/.test(q)&&!/\b(?:points?|marqueurs?|epingles?)\b/.test(q)) quoi='frontieres';
        else if(/\b(?:trajets?|arcs?|lignes?)\b/.test(q)&&!/\b(?:points?|marqueurs?|epingles?)\b/.test(q)) quoi='trajets';
        else if(/\btraces?\b/.test(q)&&!/\b(?:points?|marqueurs?|epingles?)\b/.test(q)) quoi='traces';
        return {type:'terre',action:'effacer',quoi}; } }
    // ── épingles ──
    { const re=new RegExp('^'+V_POSER+'(?: moi)? (?:(?:un|une|des|deux|trois|quelques|le|la|les|l|mon|ma|mes) )*(?:'+MOT_POINT+')?(?: (?:rouge|bleue?|verte?|jaune|orange|violette?|rose|blanche?|cyan)s?)?(?: (?:en|de couleur) (?:'+NOMS_COULEURS.join('|')+'|bleue|verte|violette|blanche))? ?(?:a|au|aux|en|sur|dans|pres de|vers|a cote de|de|d)? ?(.*)$');
      const m=t.match(re);
      if(m && (new RegExp('\\b'+MOT_POINT+'\\b').test(t) || /^(?:marque|epingle|signale|indique)\b/.test(t)) && m[1]){
        const col0=(t.match(COULEUR_RE)||[])[1]||null, col=col0?(FEM[col0]||col0):null;
        let reste=m[1].replace(new RegExp(COULEUR_RE.source,'g'),' ').replace(/ (?:sur la terre|sur le globe|sur terre|stp|svp|s il te plait)$/,'').replace(/\s+/g,' ').trim();
        const noms=reste.split(/ (?:et|puis|,) | et un (?:point|marqueur|epingle) (?:a|au|en|sur) /).map(x=>x.replace(new RegExp('^(?:(?:un|une) )?'+MOT_POINT+' (?:a|au|aux|en|sur|dans) '),'').replace(/^(?:un|une) /,'').replace(/^(?:a|au|aux|en|sur|dans) /,'').trim()).filter(Boolean);
        if(noms.length) return {type:'terre',action:'epingle',lieux:noms.slice(0,6),couleur:col}; } }
    // ── trajet : « trace un trajet de Paris à Tokyo », « relie Paris et Tokyo » ──
    { const re=new RegExp('^'+V_TRACER+'(?: moi)? (?:(?:un|une|le|la|les|l|mon|ma) )*(?:trajet|itineraire|route|vol|liaison|arc|ligne|chemin|lien|connexion)? ?(?:direct )?(?:de |depuis |entre |du |d )?(.+?) (?:a|au|aux|vers|jusqu a|jusqu au|et|avec|et le|et la) (?:le |la |l |les )?(.+?)$');
      const m=t.match(re);
      if(m&&(/\b(?:trajet|itineraire|route|vol|liaison|arc|ligne|chemin|lien|connexion|relie|relier)\b/.test(t))&&!/\bfrontieres?\b/.test(t)){
        const a=m[1].replace(/ (?:sur la terre|sur le globe)$/,'').trim(), b=m[2].replace(/ (?:sur la terre|sur le globe)$/,'').trim();
        if(a&&b&&a!==b) return {type:'terre',action:'trajet',de:a,vers:b}; } }
    // ── frontières ──
    { const m=t.match(new RegExp('^'+V_TRACER+'(?: moi)? (?:(?:les|le|la|l|mes) )*(?:frontieres|frontiere|contours|contour|limites|bordures|forme|silhouette)(?: de| du| de la| de l| des| d)? (.+)$'));
      if(m) return {type:'terre',action:'frontieres',lieu:m[1].replace(/ (?:sur la terre|sur le globe)$/,'').trim()}; }
    // ── actualités d'un pays ──
    { const m=t.match(/^(?:montre|affiche|ouvre|donne|lis|donne moi|quelles sont|quelle est)(?: moi)? (?:les |l |la |le |des )?(?:actualites?|actus?|infos|informations|nouvelles|news)(?: (?:du|de la|de l|des|de|d|sur|concernant|au sujet de|a propos de) (?:la |le |l |les )?(.+?))?(?: sur la terre| sur le globe| ici)?$/);
      if(m && (sur || /\b(?:ici|de ce pays|de cette ville|de ce lieu)\b/.test(t) || (m[1]&&lieu(m[1])&&lieu(m[1]).type==='pays'&&/\b(?:du|de la|de l|des)\b/.test(t)&&ctx.lieuAffiche))) { const l=m[1]||''; return {type:'terre',action:'actus',lieu:/\b(?:ce pays|cette ville|ce lieu|ici)\b/.test(l)||!l?null:l}; } }
    // ── zoom sur un lieu (pays, ville, capitale, monument) ──
    { const m=t.match(new RegExp('^(?:zoome|zoomer|zoom|centre|centrer|survole|survoler|vole|voler|emmene|emmener|amene|amener|va|aller|dirige toi|rends toi|rapproche toi|approche toi|approche|visite|visiter)(?: moi| toi)? (?:(?:sur|vers|a|au|aux|en|dans|jusqu a|jusqu au) )?'+CIBLE_ART+'(.+?)(?: sur la terre| sur le globe| sur terre)?$'));
      if(m){ const l=lieu(m[1]); const verbeZoom=/^(?:zoome|zoomer|zoom|survole|survoler|centre|centrer)/.test(t); if(l && (sur || verbeZoom || l.type==='monument')) return {type:'terre',action:'zoom-lieu',lieu:m[1]}; } }      // « va à Paris », « emmène-moi à Lyon » restent aux cartes : il faut un verbe de zoom, « sur le globe », ou un monument
    return null;
  }
  const liste=a=>a.length<=1?(a[0]||''):a.slice(0,-1).join(', ')+' et '+a[a.length-1];
  /** Exécute une commande analysée. `deps` : { vers(cible), scene() → contrôleur 3D ou null, actus(lieu) → promesse }. → { texte, ok } */
  function executer(a,deps){
    deps=deps||{}; const sc=deps.scene?deps.scene():null; const noScene=sc?'':' (Elles apparaîtront quand le fond Espace sera affiché, en qualité Auto ou Max.)';
    const H=UI.horloge;
    if(a.action==='temps'){
      if(!H) return {texte:'L’horloge de l’Espace n’est pas chargée.',ok:false};
      if(a.mode==='reel'){ H.retourReel(); return {texte:'Retour à l’heure réelle : le jour et la nuit sont ceux de maintenant.',ok:true}; }
      if(a.mode==='pause'){ H.pause(true); return {texte:'Le temps est figé ; la Terre ne tourne plus. Dis « reprends le temps » pour repartir.',ok:true}; }
      if(a.mode==='reprise'){ H.pause(false); return {texte:'Le temps repart'+(H.echelle()===1?' à vitesse réelle.':' (' +H.nomEchelle()+').'),ok:true}; }
      if(a.mode==='echelle'){ if(!H.regler(a.k)) return {texte:'Je n’ai pas compris cette vitesse.',ok:false}; const p=H.presets().find(x=>x.k===a.k); return {texte:'Le temps s’écoule à '+(p?p.nom:'×'+a.k)+'. La Terre tourne plus vite, le jour et la nuit défilent.'+(sc?'':noScene),ok:true}; }
      if(a.mode==='plus'||a.mode==='moins'){ const ps=H.presets(), i=ps.findIndex(p=>p.k===H.echelle()), j=a.mode==='plus'?Math.min(ps.length-1,(i<0?0:i)+1):Math.max(0,(i<0?ps.length-1:i)-1); H.regler(ps[j].k); return {texte:'Temps : '+ps[j].nom+'.',ok:true}; }
      if(a.mode==='decaler'){ H.decaler(a.ms); return {texte:'Voici la Terre '+(a.ms<0?'avant':'après')+' : '+H.formater()+'.',ok:true}; }
    }
    if(a.action==='main'){ const T=UI.terreMain; if(!T) return {texte:'La rotation à la main n’est pas chargée.',ok:false}; T.activer(a.oui); return {texte:a.oui?'Glisse ton doigt sur l’écran pour faire tourner la Terre ; elle garde son élan. Dis « arrête la rotation à la main » pour finir.':'Rotation à la main terminée.',ok:true}; }
    if(a.action==='zero'){ const T=UI.terreMain; if(T) T.zero(); return {texte:'La Terre reprend sa vraie orientation.',ok:true}; }
    if(a.action==='elan'){ const T=UI.terreMain; if(!T) return {texte:'La rotation à la main n’est pas chargée.',ok:false}; T.lancer(.05*a.sens); return {texte:'Je fais tourner la Terre vers '+(a.sens>0?'l’est.':'l’ouest.'),ok:true}; }
    if(a.action==='couche'){
      const cles=a.cle==='trafic'?['vols','bateaux']:[a.cle]; cles.forEach(k=>{ etat.couches[k]=!!a.oui; }); sc&&sc.majCouches&&sc.majCouches();
      const noms={vols:'les vols aériens simulés',bateaux:'les bateaux simulés',villes:'les lumières des villes'};
      return {texte:(a.oui?'J’affiche ':'Je masque ')+liste(cles.map(k=>noms[k]))+'.'+(a.oui&&a.cle!=='villes'?' Le trafic est simulé et accéléré pour être visible.':'')+(sc?'':noScene),ok:true};
    }
    if(a.action==='vols-reels'){
      if(!a.oui){ etat.reelVols=false; etat.reelEtat='simulé'; sc&&sc.majCouches&&sc.majCouches(); return {texte:'Les vols redeviennent simulés.',ok:true}; }
      etat.reelVols=true; sc&&sc.majCouches&&sc.majCouches();
      return {texte:'J’essaie de lire les vols réels (OpenSky Network, par le Worker). Si la route n’existe pas ou ne répond pas, je reste sur les vols simulés, et l’écran affichera « simulé ».',ok:true};
    }
    if(a.action==='effacer'){
      const r=effacer(a.quoi); sc&&sc.majObjets&&sc.majObjets();
      const total=r.epingles+r.traces; if(!total) return {texte:'Il n’y avait rien à effacer sur la Terre.',ok:true};
      return {texte:'J’ai effacé '+liste([r.epingles?r.epingles+(r.epingles>1?' points':' point'):'',r.traces?r.traces+(r.traces>1?' tracés':' tracé'):''].filter(Boolean))+'.',ok:true};
    }
    if(a.action==='epingle'){
      const ok=[], ko=[]; let derniere=null;
      for(const nom of a.lieux){ const l=lieu(nom); if(!l){ ko.push(nom); continue; } const r=ajouterEpingle(l,a.couleur); if(r.ok){ ok.push(l.nom); derniere=l; } else ko.push(nom+' (limite de '+MAX_EPINGLES+' points atteinte)'); }
      if(!ok.length) return {texte:'Je ne connais pas '+(ko.length>1?'ces lieux':'ce lieu')+' : '+liste(ko)+'. Dis une ville, un pays, une capitale ou un monument connu, par exemple « place un point à Tokyo ».',ok:false};
      etat.dernierLieu=derniere; etat.dernierLieuT=Date.now(); sc&&sc.majObjets&&sc.majObjets();
      if(deps.vers&&derniere&&ok.length===1) deps.vers(ciblePour(derniere));
      return {texte:(a.couleur?'Point '+a.couleur+' posé ':'Point posé ')+(ok.length>1?'à ':'à ')+liste(ok)+(deps.vers&&ok.length===1?'.':'.')+(ko.length?' Je n’ai pas trouvé : '+liste(ko)+'.':'')+(sc?'':noScene),ok:true};
    }
    if(a.action==='trajet'){
      const A=lieu(a.de), B=lieu(a.vers); if(!A||!B) return {texte:'Je ne connais pas '+(!A&&!B?'ces deux lieux : '+a.de+' et '+a.vers:!A?a.de:a.vers)+'. Dis par exemple « trace un trajet de Paris à Tokyo ».',ok:false};
      ajouterTrace({type:'trajet',de:A.nom,vers:B.nom,a:{lat:A.lat,lon:A.lon},b:{lat:B.lat,lon:B.lon}}); ajouterEpingle(A); ajouterEpingle(B);
      const km=Math.round(distKm(A.lat,A.lon,B.lat,B.lon)/10)*10; sc&&sc.majObjets&&sc.majObjets();
      if(deps.vers) deps.vers('geo:'+((A.lat+B.lat)/2).toFixed(2)+','+((A.lon+B.lon)/2).toFixed(2)+','+A.nom+' – '+B.nom+','+clamp(1.25+km/9000,1.4,2.6).toFixed(2));
      return {texte:'Trajet tracé de '+A.nom+' à '+B.nom+' : environ '+String(km).replace(/\B(?=(\d{3})+(?!\d))/g,' ')+' kilomètres à vol d’oiseau (grand cercle).'+(sc?'':noScene),ok:true};
    }
    if(a.action==='frontieres'){
      const l=lieu(a.lieu); if(!l||l.type!=='pays'||!l.num) return {texte:(l?l.nom+' n’est pas un pays : ':'Je ne connais pas ce pays : ')+a.lieu+'. Je peux tracer les frontières d’un pays, par exemple « trace les frontières du Japon ».',ok:false};
      if(etat.traces.some(t=>t.type==='frontieres'&&t.num===l.num)) return {texte:'Les frontières de '+l.nom+' sont déjà tracées.',ok:true};
      ajouterTrace({type:'frontieres',nom:l.nom,num:l.num}); etat.dernierLieu=l; etat.dernierLieuT=Date.now(); sc&&sc.majObjets&&sc.majObjets();
      if(deps.vers) deps.vers(ciblePour(l));
      return {texte:'Je trace les frontières de '+l.nom+' (contours simplifiés à l’échelle 1:110 millions : un repère, pas une frontière juridique).'+(sc?'':noScene),ok:true};
    }
    if(a.action==='zoom-lieu'){
      const l=lieu(a.lieu); if(!l) return {texte:'Je ne connais pas ce lieu : '+a.lieu+'. Dis une ville, un pays, une capitale ou un monument connu.',ok:false};
      etat.dernierLieu=l; etat.dernierLieuT=Date.now(); if(deps.vers) deps.vers(ciblePour(l));
      return {texte:'Direction '+l.nom+(l.pays?' ('+l.pays+')':'')+'.'+(l.info?' '+l.info:''),ok:true};
    }
    if(a.action==='actus'){
      const l=a.lieu?lieu(a.lieu):(etat.dernierLieu&&Date.now()-etat.dernierLieuT<20*60000?etat.dernierLieu:null);
      if(!l) return {texte:'De quel pays veux-tu l’actualité ? Dis par exemple « montre les actualités du Japon sur le globe ».',ok:false};
      const nom=l.type==='ville'||l.type==='capitale'?l.nom:l.nom;
      if(deps.actus){ deps.actus(nom,l); return {texte:'Je cherche l’actualité de '+nom+' dans les sources du Worker ; elle s’affichera dans un panneau avec ses sources. Si je n’en trouve pas de fiable, je te le dirai sans rien inventer.',ok:true}; }
      return {texte:'Je n’ai pas accès à une source d’actualité fiable pour '+nom+' pour l’instant (le Worker n’est pas relié) : je préfère ne rien inventer.',ok:false};
    }
    return {texte:'',ok:false};
  }

  UI.espaceTerre={norm,dir,vers,gc,distKm,lieu,ciblePour,etat,COULEURS,NOMS_COULEURS,K_VISU,routes,voies,creerAvions,positionAvion,creerNavires,positionNavire,ajouterEpingle,ajouterTrace,effacer,analyser,executer,paysIndex,villesIndex,MAX_EPINGLES,MAX_TRACES};
})();
