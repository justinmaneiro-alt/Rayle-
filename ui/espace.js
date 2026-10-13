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

  /* ═════ échelle : « pédagogique » (défaut : distances resserrées, astres agrandis, tout se voit) ou « réaliste » (vraies tailles apparentes et vraie distance de la Lune :
     le Soleil et la Lune ≈ 0,5°, les planètes de simples points lumineux) ; mémorisée, RayleBus 'espace:echelle' ═════ */
  const ECHELLES={pedagogique:'Pédagogique',realiste:'Réaliste'};
  let echelle=ECHELLES[lireLS('rayle_esp_echelle')]?lireLS('rayle_esp_echelle'):'pedagogique';
  function reglerEchelle(mode){
    if(!ECHELLES[mode]) return false;
    echelle=mode; ecrireLS('rayle_esp_echelle',mode);
    try{ RayleBus.emit('espace:echelle',mode); }catch(e){}
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

  /* ═════ commandes vocales (texte normalisé : minuscules, sans accents ni ponctuation) ═════ */
  const norm=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/['’`]/g,' ').replace(/[?!.,;:…«»"]/g,' ').replace(/-/g,' ').replace(/\s+/g,' ').trim().replace(/^(?:(?:hey|he|eh|ok|okay|dis) )?rayle /,'');
  const QUESTION=/\b(?:pourquoi|comment|quel|quelle|quels|quelles|combien|c est quoi|qu est ce|est ce que|est ce qu|ou est|ou se trouve)\b/;
  const ALIAS_ASTRE=[
    [/^(?:soleil|etoile du jour)$/,'soleil'], [/^(?:lune|satellite naturel)$/,'lune'],
    [/^(?:iss|i s s|isse|(?:la )?station(?: spatiale)?(?: internationale)?)$/,'iss'],
    [/^mercure$/,'mercure'], [/^venus$/,'venus'], [/^mars$/,'mars'], [/^jupiter$/,'jupiter'], [/^saturne$/,'saturne'], [/^uranus$/,'uranus'], [/^neptune$/,'neptune']
  ];
  const VERBE_VOL=/^(?:(?:s il te plait|stp) )?(?:montre|montres|montrer|affiche|afficher|emmene|emmener|amene|amener|vole|voler|va|vas|aller|zoome|zoomer|regarde|regarder|visite|visiter|direction|cap sur|focus sur|fais moi voir|fais voir)(?: moi)?(?: voler)?(?: (?:voir|vers|sur|a|au|aux|jusqu a|jusqu au|dans|de))*(?: moi)? (.+)$/;
  const ARTICLES=/^(?:le|la|l|les|un|une|mon|ma|notre|planete|astre|de|d|du) /;
  const ELEM_ALIAS=[
    [/^(?:planetes?|les planetes)$/,'planetes'], [/^(?:asteroides?|ceinture d asteroides|ceinture|cometes?|etoiles filantes?|debris|rochers)$/,'asteroides'],
    [/^(?:satellites?|iss|station spatiale)$/,'satellites'], [/^(?:aurores?(?: polaires?| boreales?)?)$/,'aurores'],
    [/^(?:voie lactee|nebuleuses?|voie lactee et nebuleuses?)$/,'voielactee'], [/^(?:lens ?flare|flare|eclat du soleil|eclat)$/,'flare'], [/^lune$/,'lune']
  ];
  const ON=/^(?:active|activer|allume|allumer|remets|remet|remettre|affiche|afficher|montre|montrer|mets|met|mettre|ajoute|ajouter|rends|rends moi)(?: moi)?$/;
  const OFF=/^(?:desactive|desactiver|eteins|eteindre|coupe|couper|enleve|enlever|retire|retirer|cache|cacher|masque|masquer|supprime|supprimer|ote|plus de|sans)(?: moi)?$/;
  /* ═════ lieux de la Terre, rovers, trou noir ═════
     Cibles : un astre (« mars »), « trounoir », un rover (« perseverance », « curiosity »), un lieu (« lieu:japon ») ou un point (« geo:35.68,139.69,Tokyo »). */
  const LX=()=>UI.espaceLieux||{LIEUX:[],ROVERS:{},FICHES:{},TROU_NOIR:{}};
  const ALIAS_EXTRA=[[/^(?:trou noir|trou noir supermassif|sagittarius a|sagittarius a etoile|sgr a)$/,'trounoir']];
  let indexLieux=null;
  const sansArticle=s=>s.replace(/^(?:le|la|les|l|un|une) /,'');
  function lieux(){ if(indexLieux) return indexLieux; indexLieux=new Map(); LX().LIEUX.forEach(l=>{ const k=sansArticle(norm(l.nom)); if(!indexLieux.has(k)) indexLieux.set(k,l); }); return indexLieux; }
  function lieuDe(id){ return LX().LIEUX.find(l=>l.id===id)||null; }
  function geoDe(cible){ const m=/^geo:(-?[\d.]+),(-?[\d.]+)(?:,(.*))?$/.exec(cible||''); return m?{lat:+m[1],lon:+m[2],nom:m[3]||'ce point',zoom:1.5}:null; }
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

  /* ═════ vue par défaut : l'astre ou le lieu où l'on reste (mémorisé, plus de retour forcé sur la Terre) ═════ */
  const CLE_ACCUEIL='rayle_esp_accueil';
  const accueil=()=>lireLS(CLE_ACCUEIL)||null;
  function definirAccueil(cible){
    ecrireLS(CLE_ACCUEIL,cible&&cible!=='terre'?cible:null);
    publier(undefined);
    try{ RayleBus.emit('espace:accueil',{cible:accueil()}); }catch(e){}
  }
  // état partagé (équivalent d'un store) : RayleBus.etat('espace') → { currentPlanet, savedHomeLocation, focusedTarget }
  function publier(cible){
    const sc=UI.fondScene&&UI.fondScene(), cur=cible!==undefined?cible:((sc&&sc.etat&&sc.etat().cible)||null);
    try{ RayleBus.fusion('espace',{currentPlanet:(cur&&ASTRES[cur]&&cur!=='iss')?cur:(cur?null:'terre'),focusedTarget:cur,savedHomeLocation:accueil()}); }catch(e){}
  }

  /* ═════ fiches de présentation (rubriques variées, tirées au hasard à chaque fois) ═════ */
  function melanger(a){ const b=a.slice(); for(let i=b.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [b[i],b[j]]=[b[j],b[i]]; } return b; }
  /** → { titre, rubriques:[{t,v}], parle } : `parle` est la phrase dite (chiffres du jour + 1 ou 2 rubriques), `rubriques` remplit la fiche affichée */
  const CLE_SAVOIR={lune:'lune',soleil:'soleil',iss:'iss',terre:'terre',trounoir:'trounoir',perseverance:'perseverance',curiosity:'curiosity'};
  const LIBELLES={diametre:'Taille',masse:'Masse',distance:'Distance',jour:'Jour',annee:'Année',gravite:'Pesanteur',atmosphere:'Atmosphère',temperature:'Température',lunes:'Lunes',anneaux:'Anneaux',geologie:'Géologie',histoire:'Histoire',records:'À retenir',missions:'Missions',obliquite:'Inclinaison de l’axe',inclinaison:'Inclinaison de l’orbite',composition:'Composition',orbite:'Orbite',energie:'Énergie',volume:'Volume',densite:'Densité',vitesse_orbitale:'Vitesse',vitesse_liberation:'Vitesse de libération',luminosite:'Luminosité',age:'Âge',nombre:'Nombre'};
  /** rubriques de la fiche affichée, tirées de la base sourcée (ui/espace-savoir.js) ; [] si elle n'est pas chargée */
  function rubriquesSavoir(cible){
    const S=UI.savoir, f=S&&S.fiche(CLE_SAVOIR[cible]||cible); if(!f) return [];
    return Object.keys(f.champs).map(k=>({t:LIBELLES[k]||k,v:auMasc(cible,f.champs[k][0])}));
  }
  function fiche(cible,ctx){
    ctx=ctx||{}; const L=LX();
    if(estRover(cible)){
      const R=L.ROVERS[cible], sv=rubriquesSavoir(cible), infos=sv.length?sv:R.infos.map((v,i)=>({t:['Mission','Science','Technique','À retenir'][i]||'Info',v}));
      const dit=melanger(infos).slice(0,1).map(r=>r.v).join(' ');
      return {titre:'Rover '+R.nom,rubriques:[{t:'Site',v:'Il explore '+R.site+', sur Mars ('+Math.abs(R.lat).toFixed(2)+'° '+(R.lat>=0?'N':'S')+', '+Math.abs(R.lon).toFixed(2)+'° E).'}].concat(infos),parle:oral('Le rover '+R.nom+' explore '+R.site+', sur Mars. '+dit)};
    }
    if(cible&&cible.startsWith('lieu:')||geoDe(cible)){
      const l=cible.startsWith('lieu:')?lieuDe(cible.slice(5)):null, g=geoDe(cible), nom=l?l.nom:g.nom, lat=l?l.lat:g.lat, lon=l?l.lon:g.lon;
      const rub=[{t:'Position',v:Math.abs(lat).toFixed(2)+'° '+(lat>=0?'nord':'sud')+', '+Math.abs(lon).toFixed(2)+'° '+(lon>=0?'est':'ouest')+'.'}];
      let parle='Voici '+nom+'.';
      if(l&&l.capitale){ rub.push({t:'Capitale',v:l.capitale}); parle+=' Sa capitale est '+l.capitale+'.'; }
      if(l&&l.pays){ rub.push({t:'Pays',v:l.pays}); parle+=' Capitale de : '+l.pays+'.'; }
      if(l&&l.info){ rub.push({t:'À savoir',v:l.info}); parle+=' '+l.info; }
      return {titre:nom.replace(/^./,x=>x.toUpperCase()),rubriques:rub,parle};
    }
    const sv=rubriquesSavoir(cible), rub=sv.length?sv:((L.FICHES&&L.FICHES[cible])||[]);
    let base=faits(cible,ctx);
    if(!base&&cible==='trounoir'&&UI.savoir){ const f=UI.savoir.fiche('trounoir'); base=f?f.resume+' '+f.champs.masse[0]:''; }       // « une phrase + un fait » : pas de rubrique supplémentaire
    return {titre:(ASTRES[cible]?ASTRES[cible].nom:nomCible(cible)).replace(/^./,x=>x.toUpperCase()),rubriques:rub,parle:oral(base||(rub[0]?rub[0].v:''))};
  }
  const echapper=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function afficherFiche(f){
    try{
      if(typeof Panneaux==='undefined'||!f||!f.rubriques.length) return;
      Panneaux.ouvrir({id:'espace-fiche',type:'espace',titre:f.titre,icone:'🪐',duree:45000,
        corps:{html:f.rubriques.map(r=>'<p><b>'+echapper(r.t)+' : </b>'+echapper(r.v)+'</p>').join('')}});
    }catch(e){}
  }

  /* ═════ état : ce que Raylé sait de l'écran à tout instant (injecté dans son contexte par js/rayle/capacites.js) ═════ */
  function etat(){
    const sc=UI.fondScene&&UI.fondScene(), e=sc&&sc.etat?sc.etat():null;
    let vue='rayle'; try{ if(typeof RayleBus!=='undefined') vue=RayleBus.demander('vue')||'rayle'; }catch(err){}
    const r=UI.reglages?UI.reglages():{}, cible=e&&e.cible?e.cible:null;
    return {vue,fond:r.fond||null,palier:r.palier==null?null:r.palier,cible,nom:nomCible(cible),accueil:accueil(),echelle,vol:!!(e&&e.vol),zoom:e&&e.zoom!=null?e.zoom:1};
  }
  /* ═════ noms mal formés : « perseverence », « jupitere », « curiosité » → la cible la plus proche (une lettre d'écart, deux pour les longs noms) ═════ */
  function distance(a,b){
    const m=a.length, n=b.length; if(Math.abs(m-n)>2) return 9;
    let prec=Array.from({length:n+1},(_,j)=>j);
    for(let i=1;i<=m;i++){ const cur=[i]; for(let j=1;j<=n;j++) cur[j]=Math.min(prec[j]+1,cur[j-1]+1,prec[j-1]+(a[i-1]===b[j-1]?0:1)); prec=cur; }
    return prec[n];
  }
  function flou(r){
    r=String(r||'').replace(/ (?:stp|svp|s il te plait|maintenant)$/,'').trim();
    for(let i=0;i<3 && ARTICLES.test(r);i++) r=r.replace(ARTICLES,'');
    r=r.replace(/^(?:rover|le rover) /,'');
    if(r.length<5||r.split(' ').length>2) return null;
    const noms=[['mercure','mercure','astre'],['venus','venus','astre'],['jupiter','jupiter','astre'],['saturne','saturne','astre'],['uranus','uranus','astre'],['neptune','neptune','astre'],['soleil','soleil','astre']];
    for(const id of Object.keys(LX().ROVERS)) for(const x of LX().ROVERS[id].alias) noms.push([norm(x),id,'rover']);
    let meilleur=null, dm=9;
    for(const [n,cible,genre] of noms){ if(n.length<5) continue; const d=distance(r,n); if(d<dm){ dm=d; meilleur={cible,genre,nom:n}; } else if(d===dm&&meilleur&&meilleur.cible!==cible) meilleur=null; }
    return meilleur&&dm<=(r.length>=8?2:1)?meilleur:null;
  }

  /* ═════ objets sans modèle 3D : lunes, planètes naines, engins ═════ */
  const HORS_MODELE={io:'jupiter',europa:'jupiter',ganymede:'jupiter',callisto:'jupiter',titan:'saturne',encelade:'saturne',enceladus:'saturne',phobos:'mars',deimos:'mars',triton:'neptune',
    charon:null,pluton:null,ceres:null,eris:null,haumea:null,makemake:null,hubble:null,'telescope hubble':null,webb:null,'james webb':null,'telescope james webb':null,voyager:null,'voyager 1':null,'voyager 2':null,'ceinture d asteroides':null,'la ceinture d asteroides':null};
  const SAVOIR_DE={europa:'europe',encelade:'encelade',enceladus:'encelade',deimos:'deimos','telescope hubble':'hubble','james webb':'webb','telescope james webb':'webb','voyager':'voyager1','ceinture d asteroides':'ceinture','la ceinture d asteroides':'ceinture'};
  const NOMS_HM={europa:'Europe',enceladus:'Encelade',ceres:'Cérès',eris:'Éris',pluton:'Pluton',deimos:'Déimos','telescope hubble':'Hubble','james webb':'Webb','telescope james webb':'Webb','voyager':'Voyager','ceinture d asteroides':'la ceinture d’astéroïdes','la ceinture d asteroides':'la ceinture d’astéroïdes'};
  function analyser(texte){
    let t=norm(texte);
    // commandes qui dépendent de ce qui est affiché : « zoome dessus », « et sa lune ? », « garde cette vue », « et Mars ? », « reviens »
    if(t && t.split(' ').length<=8){
      if(/^(?:zoome|zoom|zoomer|rapproche|rapprocher|approche|approcher|avance|avancer|plus pres|va plus pres)(?: toi)?(?: (?:dessus|dedans|la|ici|un peu|encore|plus|davantage|plus pres))*$/.test(t)) return {type:'zoom',facteur:.65};
      if(/^(?:dezoome|dezoomer|recule|reculer|eloigne|eloigner|eloigne toi|prends du recul|plus loin|un peu plus loin|recule un peu|dezoome un peu)$/.test(t)) return {type:'zoom',facteur:1.5};
      if(/^(?:et )?(?:sa|ses|leur|leurs|ses principales) (?:lunes?|satellites?(?: naturels?)?)$|^(?:montre|affiche)(?: moi)? (?:sa|ses) lunes?$/.test(t)) return {type:'lunes'};
      if(/^(?:garde|garder|sauvegarde|sauvegarder|enregistre|enregistrer|memorise|memoriser|retiens|retenir) (?:cette|la|ma) (?:vue|position|scene)(?: actuelle)?$/.test(t)) return {type:'accueil'};
      if(/^(?:reviens|revenir|retour|retourne|retourner|ramene moi)(?: en arriere| a la vue d ensemble| a l orbite)?$/.test(t)){ const e=etat(); if(e.cible && e.vue==='rayle') return {type:'retour'}; }
      const et=t.match(/^et (?:pour |avec |si on (?:regardait|allait voir) |pour voir )?(.+)$/);
      if(et){ const c=cibleDe(et[1]); if(c && c.genre!=='lieu') return {type:'vers',cible:c.cible,genre:c.genre}; }
    }
    if(t && t.split(' ').length<=10){
      // « où est la Terre… » : où est / où se trouve / situe / localise + un astre, un rover, un lieu
      const ou=t.match(/^(?:montre moi )?(?:ou (?:est|se trouve|se situe|se trouvent|sont|habite)|situe|situer|localise|localiser|trouve moi|repere moi)(?: moi)? (.+)$/);
      if(ou){ const c=cibleDe(ou[1]); if(c) return {type:'vers',cible:c.cible,genre:c.genre,question:true}; }
      // vue par défaut : « garde Mars comme vue par défaut », « sauvegarde cette vue », « remets la Terre par défaut »
      if(/\b(?:par defaut|d accueil|de depart|favorite|favori|habituelle)\b/.test(t)){
        if(/^(?:reinitialise|reinitialiser|remets?|remettre|reviens|oublie|oublier|supprime|supprimer|efface|effacer|annule|annuler)\b/.test(t) || /\bterre\b/.test(t)) return {type:'accueil',cible:null,reset:true};
        if(/^(?:garde|garder|sauvegarde|sauvegarder|enregistre|enregistrer|memorise|memoriser|mets|met|mettre|definis|definir|fixe|fixer|reste|rester|prends|prendre|choisis|choisir|utilise|utiliser)\b/.test(t)){
          const mid=t.replace(/^[a-z]+(?: moi)? /,'').replace(/ (?:comme|en|par|pour|a|au) .*$/,'').replace(/^(?:cette vue|cet astre|cette planete|ici|cette position|la vue actuelle|la vue|ce lieu)$/,'');
          const c=mid?cibleDe(mid):null; return {type:'accueil',cible:c?c.cible:undefined};
        }
      }
    }
    if(!t || t.split(' ').length>10 || QUESTION.test(t)) return null;
    if(/\b(?:graphique|graphe|chart|bougies?|rsi|terminal|carte|courbe|bitcoin|nasdaq|calendrier|mois)\b/.test(t)) return null;
    // échelle : « échelle réaliste », « mode pédagogique », « passe en tailles réelles »
    { const e=t.match(/^(?:(?:passe|passer|mets|met|mettre|active|activer|utilise|utiliser|reviens|revenir|repasse|repasser) (?:moi )?)?(?:(?:en|a|au|sur|l|la|le|les) )*(?:echelle|mode|vue|tailles?|distances?|proportions?)?(?: (?:en|a|au|sur))? ?(reelles?|realistes?|pedagogiques?|educatives?|didactiques?)$/);
      if(e && /(?:echelle|mode|tailles?|distances?|proportions?|vue|^(?:passe|mets|met|active|utilise|reviens|repasse))/.test(t)) return {type:'echelle',mode:/^reel|^realis/.test(e[1])?'realiste':'pedagogique'}; }
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
      // trou noir, rovers ; un lieu seulement si c'est un monument, ou « sur le globe » (sinon « montre-moi le Japon » reste la page Monde)
      const c=cibleDe(r);
      if(c && (c.genre!=='lieu' || c.lieu.type==='monument' || /\b(?:sur le globe|sur la terre|sur terre)\b/.test(t))) return {type:'vers',cible:c.cible,genre:c.genre};
      if(!c){ const fl=flou(r); if(fl) return {type:'vers',cible:fl.cible,genre:fl.genre,corrige:fl.nom}; }
      { const k=r.replace(/^(?:la |le |les |l |lune |planete naine |planete |telescope )+/,'').trim(), h=Object.prototype.hasOwnProperty.call(HORS_MODELE,r)?r:Object.prototype.hasOwnProperty.call(HORS_MODELE,k)?k:null;
        if(h) return {type:'horsmodele',id:h,ancre:HORS_MODELE[h]}; }       // « perseverence », « jupitere » : un nom mal formé est corrigé
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
  let dernier={ok:true};                                                           // résultat de la dernière action : lu par commandeDetaillee() (jamais « fait » si ça a échoué)
  function executer(a,ctx){
    if(!a) return null;
    dernier={ok:true};
    const r=UI.reglages?UI.reglages():{fond:'aucun',palier:0};
    const iss=UI.espace&&UI.espace.iss;
    if(a.type==='elements'){
      const bascule=regler(a.cle,a.valeur);
      if(bascule && r.fond!=='espace') return (a.valeur?'Activé':'Désactivé')+' : '+ELEMENTS[a.cle].toLowerCase()+'. Cela se verra avec le fond Espace.';
      return (a.valeur?'J’affiche':'Je retire')+' : '+ELEMENTS[a.cle].toLowerCase()+'.';
    }
    if(a.type==='echelle'){
      reglerEchelle(a.mode);
      return a.mode==='realiste'
        ? 'Échelle réaliste : la Lune à sa vraie distance (environ 384 000 kilomètres), le Soleil et la Lune à leur vraie taille apparente, un demi-degré, et les planètes réduites à de simples points lumineux. Elles reprennent leur taille quand on les visite.'
        : 'Échelle pédagogique : distances resserrées et astres agrandis pour qu’on les voie bien.';
    }
    if(a.type==='retour'){
      const sc=UI.fondScene&&UI.fondScene(); attente=null;
      if(sc && sc.retour && r.fond==='espace') sc.retour(true);                  // explicite : la Terre, même si une autre vue est mémorisée par défaut
      return 'Retour sur la Terre.';
    }
    if(a.type==='accueil'){
      const sc=UI.fondScene&&UI.fondScene();
      if(a.reset){ definirAccueil(null); return 'C’est noté : la Terre redevient ta vue par défaut.'; }
      const cur=a.cible!==undefined?a.cible:((sc&&sc.etat&&sc.etat().cible)||null);
      if(!cur){ definirAccueil(null); return 'Tu es sur la Terre : c’est ta vue par défaut.'; }
      definirAccueil(cur);
      return 'C’est noté : '+nomCible(cur)+' devient ta vue par défaut. Je n’y reviendrai plus sur la Terre toute seule, même après un rechargement.';
    }
    if(a.type==='zoom'){
      const sc=UI.fondScene&&UI.fondScene();
      if(!(r.fond==='espace') || !sc || !sc.zoom || r.palier>=2){ dernier={ok:false}; return 'Je ne peux pas zoomer ici : le zoom de la caméra n’existe qu’avec le fond Espace, en qualité Auto ou Max.'; }
      if(!sc.zoom(a.facteur)){ dernier={ok:false}; return 'Il n’y a rien à rapprocher pour l’instant : dis-moi d’abord quel astre tu veux voir, par exemple « montre-moi Mars ».'; }
      return a.facteur<1?'Je me rapproche de '+nomCible(etat().cible)+'.':'Je prends du recul sur '+nomCible(etat().cible)+'.';
    }
    if(a.type==='lunes'){
      const e=etat(), c=e.cible;
      if(!c||c==='terre') return executer({type:'vers',cible:'lune'},ctx);                 // « et sa lune ? » depuis la Terre : la Lune
      const S=UI.savoir, f=S&&S.fiche(c);
      if(f&&f.champs.lunes) return nomCible(c).replace(/^./,x=>x.toUpperCase())+' : '+auMasc(c,f.champs.lunes[0]);
      dernier={ok:false}; return 'Je n’ai pas de fiche sur les lunes de '+nomCible(c)+', et je préfère ne pas l’inventer.';
    }
    if(a.type==='horsmodele'){
      const S=UI.savoir, nom=NOMS_HM[a.id]||a.id.replace(/^./,x=>x.toUpperCase()), f=S&&S.fiche(SAVOIR_DE[a.id]||a.id);
      const savoir=f?' '+oral(S.expliquer(f.id,()=>0).split('. ').slice(0,2).join('. ').replace(/\.?$/,'.')):'';
      if(/^(?:la )?ceinture/.test(a.id)){                                                    // la ceinture est dessinée dans le fond : on l'allume, on ne vole pas vers elle
        regler('asteroides',true);
        return 'J’affiche la ceinture d’astéroïdes dans le fond, mais je ne peux pas la survoler.'+savoir;
      }
      if(a.ancre){
        const r2=executer({type:'vers',cible:a.ancre},ctx);
        return 'Je n’ai pas de vue 3D de '+nom+' : je ne peux pas le survoler lui-même. Je t’emmène vers '+nomCible(a.ancre)+', autour de qui il tourne.'+savoir+' '+r2;
      }
      dernier={ok:false};
      return 'Je n’ai pas de vue 3D de '+nom+'.'+(savoir||' Je n’ai pas non plus de fiche chiffrée dessus, et je préfère ne pas l’inventer.')+' Mes cibles de vol sont le Soleil, la Lune, l’ISS, les huit planètes, le trou noir et les rovers Curiosity et Perseverance.';
    }
    if(a.type==='vers'){
      const fi=fiche(a.cible,{iss});
      if(r.palier>=2){ afficherFiche(fi); return 'Voici '+nomCible(a.cible)+'. '+fi.parle+' (En mode Éco le fond reste une image fixe : passe en Auto ou Max pour que la caméra y vole.)'; }
      if(r.fond!=='espace'){ try{ UI.changer('fond','espace'); }catch(e){} }
      allerVers(a.cible);
      afficherFiche(fi);
      return (a.corrige?'J’ai compris '+nomCible(a.cible)+'. ':'')+(a.question?'Je te montre ':'Direction ')+nomCible(a.cible)+'. '+fi.parle;
    }
    return null;
  }
  /* ═════ enchaînements : « montre Mars puis Perseverance », « va sur Saturne puis reviens » ═════
     La première étape part tout de suite ; les suivantes attendent la fin du vol et quelques secondes de visite, puis Raylé les annonce (service 'rayle:dire'). */
  let jeton=0;
  function chaine(texte){
    const t=norm(texte); if(t.split(' ').length>20) return null;
    const parts=t.split(/ (?:puis|ensuite|et ensuite|et apres|et puis|apres ca|apres) /).map(x=>x.trim()).filter(Boolean);
    if(parts.length<2) return null;
    const acts=[];
    for(const p of parts){
      let a=analyser(p)||(/^(?:reviens|revenir|retour|retourne|retourner|rentre|ramene moi)(?: .*)?$/.test(p)?{type:'retour'}:analyser('montre moi '+p));
      if(!a || !['vers','retour','zoom','lunes','elements','echelle'].includes(a.type)) return null;
      acts.push(a);
    }
    return acts;
  }
  const attendreDefaut=ms=>new Promise(ok=>setTimeout(ok,ms));
  async function suite(actions,mon,deps){
    const attendre=deps.attendre||attendreDefaut, dire=deps.dire||(t=>{ try{ if(typeof RayleBus!=='undefined') RayleBus.demander('rayle:dire',t); }catch(e){} });
    for(let i=1;i<actions.length;i++){
      for(let k=0;k<40;k++){ const sc=UI.fondScene&&UI.fondScene(); if(!(sc&&sc.etat&&sc.etat().vol)) break; await attendre(500); }   // le vol en cours doit finir
      await attendre(deps.pause==null?6000:deps.pause);                                                                    // quelques secondes pour regarder
      if(mon!==jeton) return;                                                                                              // une nouvelle commande a pris le relais
      const t=executer(actions[i]); if(t) dire(t);
      if(!dernier.ok) return;                                                                                              // une étape a échoué : on s'arrête là
    }
  }
  /** → { texte, ok, suite? } : la phrase à dire et si l'action a réellement réussi ; null si ce n'est pas une commande de l'Espace */
  function commandeDetaillee(texte,deps){
    deps=deps||{}; const acts=chaine(texte);
    if(acts){
      const mon=++jeton, t=executer(acts[0]); const ok=dernier.ok;
      if(!ok) return {texte:t,ok:false};
      const p=suite(acts,mon,deps);
      return {texte:t+' Ensuite : '+nomCible(acts[1].cible||'terre')+'.',ok:true,suite:p};
    }
    const a=analyser(texte); if(!a) return null;
    jeton++; const t=executer(a); return {texte:t,ok:dernier.ok};
  }
  const commande=texte=>{ const r=commandeDetaillee(texte); return r?r.texte:null; };
  if(typeof RayleBus!=='undefined'){
    try{ RayleBus.fournir('espace:commande',commande); }catch(e){}
    // Événements d'actions 3D pour le reste de l'appli (ou un autre module) : { planetName } · { roverName } · { lat, long, name } ou { country }
    try{
      RayleBus.on('rayle:show-planet',d=>{ const c=cibleDe(norm(d&&(d.planetName||d.name)||'')); if(c) executer({type:'vers',cible:c.cible,genre:c.genre}); });
      RayleBus.on('rayle:show-rover',d=>{ const c=cibleDe(norm(d&&(d.roverName||d.name)||'')); if(c&&c.genre==='rover') executer({type:'vers',cible:c.cible,genre:'rover'}); });
      RayleBus.on('rayle:show-landmark',d=>{
        if(!d) return;
        const lat=+(d.lat!=null?d.lat:d.latitude), lon=+(d.long!=null?d.long:d.lon!=null?d.lon:d.longitude);
        if(isFinite(lat)&&isFinite(lon)&&d.lat!=null){ executer({type:'vers',cible:'geo:'+lat+','+lon+','+String(d.name||d.country||'ce point').replace(/,/g,' '),genre:'lieu'}); return; }
        const c=cibleDe(norm(d.country||d.name||'')); if(c&&c.genre==='lieu') executer({type:'vers',cible:c.cible,genre:'lieu'});
      });
    }catch(e){}
    try{ publier(null); }catch(e){}
    try{ RayleBus.on('espace:pret',()=>{ if(attente){ const c=attente; attente=null; const sc=UI.fondScene&&UI.fondScene(); if(sc&&sc.vers) setTimeout(()=>sc.vers(c),1500); } }); }catch(e){}
  }

  UI.espace={etat,flou,chaine,commande,commandeDetaillee,accueil,definirAccueil,publier,fiche,nomCible,cibleDe,lieuDe,geoDe,estRover,ELEMENTS,elements:()=>Object.assign({},elements),regler,ECHELLES,echelle:()=>echelle,reglerEchelle,ASTRES,faits,analyser,executer,creerISS,choisirVue,evaluerVue,vueVecteur,DIST_CAM,DIST_LUNE,FOV_V,INCL,PERIODE_S,TTL_ISS};
  if(typeof document!=='undefined') UI.espace.iss=creerISS();
})();
