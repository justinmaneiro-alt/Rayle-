"use strict";
  /* ═════════════ COMMANDES VOCALES DES NOUVEAUX MODES (sans IA) + PONT VERS L'UNIVERS 3D ═════════════
     « réduis-toi », « range-toi » · « rouvre-toi » · « où sont mes appareils » · « ouvre l'univers » · « présente la France » · « montre l'océan Pacifique » …
     • analyserUnivers(texte) : analyse PURE (testée) → {type, …} ou null. Aucune action, aucun réseau.
     • commandeUnivers(texte) : exécute (localisation, rangement, Univers 3D) et renvoie la phrase à dire, ou null si ce n'est pas pour nous.
     • window.RayleUniversPont : ce que l'Univers (modules ES, js/univers/) peut demander à la page classique : parler, savoir si on l'a coupée, Worker.
     • window.RayleUnivers : ouvrir / fermer / commander l'Univers (chargé à la première utilisation, js/univers/noyau.js). */
  const UNIVERS_URL='js/univers/noyau.js?v=2026.10.14.5';
  let universModule=null, universPromesse=null;
  function universCharger(){
    if(universModule) return Promise.resolve(universModule);
    if(!universPromesse) universPromesse=import(new URL(UNIVERS_URL,document.baseURI).href).then(m=>{ universModule=m; return m; }).catch(e=>{ universPromesse=null; throw e; });
    return universPromesse;
  }
  window.RayleUniversPont={
    workerPret:()=>{ try{ return !!workerReady(); }catch(e){ return false; } },
    wjson:(p,ms)=>wjson(p,ms),
    epoque:()=>epoch,
    dire:async t=>{ const e=epoch; try{ addLine('ray',t); await speak(t); }catch(er){ return false; } return e===epoch; },   // false : coupée entre-temps (l'appelant s'arrête)
    arreter:()=>{ try{ cutAll('Présentation arrêtée'); }catch(e){} },
    ligne:(k,t)=>{ try{ addLine(k,t); }catch(e){} },
  };
  window.RayleUnivers={
    async ouvrir(theme,options){ const N=await universCharger(); return N.ouvrir(theme||'espace',options||{}); },
    async fermer(){ if(universModule) universModule.fermer(); },
    async commande(nom,args){ const N=await universCharger(); if(!N.etat().ouvert) await N.ouvrir('espace'); return N.commande(nom,args||{}); },
    estOuvert:()=>!!(universModule && universModule.etat().ouvert),
    etat:()=>universModule?universModule.etat():{ouvert:false},
    charger:universCharger,
  };
  document.addEventListener('DOMContentLoaded',()=>{
    const b=document.getElementById('btnOuvrirUnivers');
    if(b) b.addEventListener('click',()=>{ RayleUnivers.estOuvert() ? RayleUnivers.fermer() : RayleUnivers.ouvrir('espace').catch(e=>{ try{ addLine('sys','Univers : '+(e&&e.message||e)); }catch(er){} }); });
  });
  try{ RayleBus.on('univers:demande',d=>{ RayleUnivers.ouvrir((d&&d.theme)||'espace',d||{}).catch(()=>{}); }); }catch(e){}

  /* ───── analyse des phrases ───── */
  const UNIVERS_RANGER=/^(?:(?:s il te plait|stp)\s+)?(?:reduis toi|reduit toi|range toi|ranger rayle|rangetoi|mets toi en bulle|mets toi sur le cote|fais toi (?:toute )?petite|fais toi discrete|cache toi|replie toi|va dans ta bulle|mets toi de cote|pousse toi|reduire rayle|ranger)(?:\s+(?:un peu|stp|s il te plait|maintenant))?$/;
  const UNIVERS_ROUVRIR=/^(?:(?:s il te plait|stp)\s+)?(?:rouvre toi|reouvre toi|reviens|reapparais|sors de ta bulle|agrandis toi|affiche toi|montre toi|sors|reviens au centre|ressors|redeviens normale|ouvre toi)$/;
  const normU=t=>String(t==null?'':t).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/['’\-]/g,' ').replace(/[^a-z0-9 ?]/g,' ').replace(/\s+/g,' ').trim()
      .replace(/^(?:hey |ok |dis )?rayle ?,? ?/,'').replace(/\?$/,'').trim();
  const DET='(?:(?:le|la|les|l|un|une|du|de la|de l|des|d|au|aux|a la|a l)\\s+)?';
  /* ───── vocabulaire des navires, des salles, des astres ───── */
  const NAV='(voilier|sloop|brick|fregate|vaisseau de ligne|vaisseau|navire de guerre|navire|bateau)', NATION='(francais|francaise|anglais|anglaise|espagnol|espagnole|portugais|portugaise)';
  const typeNav=s=>/vaisseau/.test(s)?'vaisseau':/fregate/.test(s)?'fregate':/brick/.test(s)?'brick':/voilier|sloop/.test(s)?'voilier':undefined;
  const nationNav=s=>!s?undefined:/franc/.test(s)?'france':/anglais|anglet|britann/.test(s)?'angleterre':/espagn/.test(s)?'espagne':/portug/.test(s)?'portugal':undefined;
  const PIECES=[['soute',/soute|poudre|munitions/],['infirmerie',/infirmerie|chirurgien|hopital/],['cuisine',/cuisine|cambuse|fourneau/],['hamacs',/hamacs?|dortoir|couchettes/],['cabine',/cabine|capitaine/],['batterie',/batterie|canons|entrepont/],['cale',/cale/],['pont',/pont/]];
  const pieceNav=s=>{ for(const [id,re] of PIECES) if(re.test(s)) return id; return undefined; };
  const PIECE_RE='(pont superieur|pont|cabine du capitaine|cabine|chambre du capitaine|batteries?|batterie des canons|canons|cuisine|cambuse|hamacs?|dortoir|infirmerie|soute a poudre|soute|cale)';
  /* Phrases des nouveaux modes (système solaire, Mars, ISS, bataille navale, qualité…). PURE : renvoie {type, action, …} ou null. Les actions « dans le thème » (tirer, caméra, météo…)
     ne sont exécutées que si le thème concerné est ouvert (voir commandeUnivers). */
  function analyserNouveau(t){
    let m;
    // — passer l'animation, qualité —
    if(/^(?:passe|passer|saute|sauter|skip|ignore|coupe|stoppe|arrete) (?:moi )?(?:l |cette |la |le |l intro )?(?:animation|cinematique|intro|sequence|video|film)$/.test(t)) return {type:'univers',action:'passer'};
    if((m=/^(?:mets|passe|regle|change|utilise|selectionne) (?:la |en )?(?:qualite graphique|qualite|graphismes?|details?) (?:en |sur |a )?(basse|moyenne|haute|automatique|auto|maximum|minimum|elevee|standard|ultra|faible)$/.exec(t))||(m=/^qualite (?:graphique )?(basse|moyenne|haute|automatique|auto|maximum|minimum|elevee|standard|ultra|faible)$/.exec(t))||(m=/^(?:mets|passe) (?:en |le mode )?(basse|moyenne|haute) qualite$/.exec(t)))
      return {type:'univers',action:'qualite',niveau:/basse|minimum|faible/.test(m[1])?'basse':/moyenne|standard/.test(m[1])?'moyenne':/haute|maximum|elevee|ultra/.test(m[1])?'haute':'auto'};
    // — bataille navale : ouvrir, scénarios, retour dans l'espace —
    if((m=/^(?:bascule|basculer|passe|passer|va|vas|retourne|reviens|mets|lance|ouvre|demarre|active|emmene moi|envoie moi|affiche|montre) (?:moi )?(?:sur|en|dans|a|au|vers|mode|le mode|le theme)? ?(?:la |le |l |une |un |mon |ma |les )?(?:bataille navale|batailles navales|combat naval|combats navals|mode bataille navale|theme bataille navale|bataille de navires|navires de guerre|vaisseaux de guerre|navires|vaisseaux|bateaux)(?: (?:dans|sur|pres de|pres du|pres de la|au large de|au large du|a|en|au|vers) (?:l |la |le |les )?(.{2,40}))?$/.exec(t))) return {type:'navale',action:'ouvrir',lieu:m[1]};
    if((m=/^(?:lance|demarre|fais|mets|genere|cree|montre|organise|prepare) (?:moi )?(?:une |un |la |le )?(escarmouche|bataille|duo|balade|combat|promenade|petite bataille|grande bataille|navire seul)(?: navale| en mer)?(?: (?:dans|sur|pres de|pres du|au large de|a|en|au|vers) (?:l |la |le |les )?(.{2,40}))?$/.exec(t)))
      return {type:'navale',action:'scenario',scenario:/escarmouche|petite/.test(m[1])?'escarmouche':/bataille|combat/.test(m[1])?'bataille':/duo/.test(m[1])?'duo':'balade',lieu:m[2]};
    if(/^(?:quitte|quitter) (?:la )?bataille navale(?: et (?:retourne|reviens|va) (?:sur|dans|vers|a)? ?(?:l |la )?(?:terre|espace))?$/.test(t)) return {type:'navale',action:'espace'};
    // — intérieur du navire —
    if((m=new RegExp('^(?:montre|affiche|fais|emmene|amene|donne) (?:moi )?(?:l |les |la |une |un )?(?:interieur|visite|visite guidee|visite interieure|tour)(?: guidee)? (?:de |du |d |des |dans )?(?:l |la |le |les )?(?:'+NAV+')?(?: '+NATION+')?$').exec(t))) return {type:'navale',action:'interieur',navire:typeNav(m[1]||''),nation:nationNav(m[2]),visite:/guide/.test(t)};
    if((m=new RegExp('^(?:visite|visiter|monte dans|monte a bord de|monte a bord|entre dans|entre a bord de|descends dans|va dans|va a bord de|embarque sur|embarque dans|embarque a bord de|montre moi) (?:moi )?(?:l |la |le |les |un |une )?'+NAV+'(?: '+NATION+')?$').exec(t))&&/visite|monte|entre|descends|embarque|va dans|va a bord/.test(t)) return {type:'navale',action:'interieur',navire:typeNav(m[1]),nation:nationNav(m[2]),visite:/^visit/.test(t)};
    if(/^(?:(?:fais moi |lance |commence |demarre )?(?:la |une |ma )?visite guidee(?: du navire| du bateau| complete)?|guide moi dans le navire|raconte moi le navire)$/.test(t)) return {type:'navale',action:'visite'};
    if(new RegExp('^(?:va|vas|descends|monte|emmene moi|amene moi|montre moi|montre|entre|retourne|conduis moi|rends toi) (?:moi )?(?:dans|a|vers|sur|jusqu a|jusque dans|en bas dans)? ?(?:l |la |le |les |au |aux )?'+PIECE_RE+'(?: du capitaine| de poudre| a poudre| des canons| de l equipage| principale| du navire| du bateau)?$').test(t)){ m=new RegExp(PIECE_RE).exec(t); return {type:'navale',action:'piece',piece:pieceNav(m[1])}; }
    if(/^(?:sors|sortir|sortez|quitte|quitter|ressors|remonte|retourne|reviens|va) (?:moi )?(?:de |du |dans |a |sur |vers |d |hors de |hors du )?(?:l |la |le )?(?:interieur|navire|bateau|fregate|vaisseau|voilier|brick|exterieur|dehors)(?: du navire)?$/.test(t)) return {type:'navale',action:'sortir'};
    // — dans la bataille : tirer, caméra, suivre, météo, heure, son —
    if(/^(?:tire|tirez|feu|fais feu|feu a volonte|tire une bordee|une bordee|bordee|lance une bordee|ordonne une bordee|charge et tire|canons feu|a vos canons|aux canons)$/.test(t)) return {type:'navale',action:'tirer'};
    if((m=/^(?:vue|camera|mets la camera|passe en vue|passe en camera|passe en mode camera|mets la vue|montre la vue|change la vue) ?(?:en |sur |du |de |d |a la )?(?:l |la |le )?(pont|ensemble|generale|libre|suivi|suivre|poursuite)$/.exec(t))) return {type:'navale',action:'camera',mode:/pont/.test(m[1])?'pont':/ensemble|generale/.test(m[1])?'ensemble':/libre/.test(m[1])?'libre':'suivre'};
    if(/^(?:vue d ensemble|vue generale)$/.test(t)) return {type:'navale',action:'camera',mode:'ensemble'};
    if((m=new RegExp('^(?:suis|suivre|suit|poursuis|regarde|zoome sur|focus sur) (?:moi )?(?:l |la |le |un |une )?'+NAV+'(?: '+NATION+')?$').exec(t))) return {type:'navale',action:'suivre',navire:typeNav(m[1]),nation:nationNav(m[2])};
    if((m=/^(?:mets|passe en|fais|fais venir|lance|change en|cree|ajoute) (?:moi )?(?:une |un |la |le |l |du |de la )?(tempete|orage|pluie|brouillard|calme plat|calme|beau temps|ciel clair|ciel degage|grand soleil)(?: sur la mer| en mer| sur les navires| maintenant)?$/.exec(t))) return {type:'navale',action:'meteo',meteo:/tempete|orage/.test(m[1])?'tempete':/pluie/.test(m[1])?'pluie':/brouillard/.test(m[1])?'brouillard':/calme/.test(m[1])?'calme':'clair'};
    if((m=/^(?:mets|passe en|fais|passe a|change en|mets moi) (?:la |le |l |une |un )?(nuit|minuit|jour|plein jour|aube|crepuscule|soir|matin|coucher de soleil|lever de soleil)(?: sur la mer| en mer| maintenant)?$/.exec(t))) return {type:'navale',action:'heure',moment:/nuit|minuit/.test(m[1])?'nuit':/aube|matin|lever/.test(m[1])?'aube':/crepuscule|soir|coucher/.test(m[1])?'crepuscule':'jour'};
    if(/^(?:quel temps fait il|quelle est la meteo|quelle meteo|comment est la mer|comment est le vent|quelle est la force du vent|decris la meteo|donne la meteo) ?(?:en mer|sur la mer|ici|a bord|sur place|sur les navires)?$/.test(t)) return {type:'navale',action:'infometeo'};
    if((m=/^(?:coupe|mets|remets|active|desactive|reactive) (?:le |les )?(son|sons|bruitages?|bruits?)(?: des navires| de la bataille)?$/.exec(t))) return {type:'navale',action:'son',muet:/^(?:coupe|desactive)/.test(t)};
    // — système solaire, astres, Mars, ISS, satellites —
    if(/^(?:montre|affiche|va dans|va sur|ouvre|passe sur|passe dans|retourne dans|emmene moi dans|emmene moi sur|reviens dans|reviens sur|va voir) (?:moi )?(?:le |l |les |tout )?(?:systeme solaire|systeme planetaire|planetes|toutes les planetes|soleil et les planetes)$/.test(t)) return {type:'espace',action:'systeme'};
    if((m=/^(?:montre|affiche|passe a|passe en|mets|mets en|utilise) (?:moi )?(?:l |la |les |en )?(echelle reelle|vraie echelle|vraies distances|vraies tailles|vraies proportions|echelle didactique|echelle simplifiee|tailles agrandies|distances reelles)$/.exec(t))) return {type:'espace',action:'echelle',reelle:/reelle|vrai/.test(m[1])};
    if(/^(?:atterris sur mars|atterrissage sur mars|lance l atterrissage|simule l atterrissage|atterrissage de perseverance|atterrissage de curiosity|pose toi sur mars|fais moi atterrir sur mars|emmene moi atterrir sur mars)$/.test(t)||(m=/^(?:atterris|atterrir|pose toi|me pose|descends) (?:moi )?(?:sur|a la surface de|a la surface) ?(?:la planete )?mars(?: avec (?:le rover )?(perseverance|curiosity|curiosite|perseverence))?$/.exec(t)))
      return {type:'espace',action:'atterrir',rover:(m&&m[1])||(/curiosity/.test(t)?'curiosity':/perseverance/.test(t)?'perseverance':undefined)};
    if((m=/^(?:montre|affiche|presente|va voir|zoome sur|montre moi) (?:moi )?(?:le |l )?(?:rover )?(perseverance|curiosity|curiosite|perseverence|rover|robot martien)$/.exec(t))) return {type:'espace',action:'rover',nom:/rover|robot/.test(m[1])?'':m[1]};
    if(/^(?:montre|affiche|passe a|passe sur|change de) (?:moi )?(?:l )?autre rover$/.test(t)) return {type:'espace',action:'autre-rover'};
    if((m=/^(?:montre|zoome sur|affiche|presente|explique|c est quoi|a quoi sert) (?:moi )?(?:la |le |l |les |un |une |du |de la )?(?:piece |partie )?(superc?am|mastcam|camera|cameras|bras robotique|bras|roues?|antenne|laser|helicoptere|ingenuity|panneaux?|generateur|rtg|foreuse|tourelle|mat|echantillons?|tubes?|moxie|pixl|sherloc|rimfax)(?: du rover| de perseverance| de curiosity)?$/.exec(t))) return {type:'espace',action:'piece-rover',nom:m[1]};
    if(/^(?:montre|affiche|retourne|reviens|va|remonte) (?:moi )?(?:sur|dans|en|a|vers)? ?(?:l |la )?(?:orbite de mars|mars depuis l orbite|mars de loin|vue de mars depuis l espace)$/.test(t)) return {type:'espace',action:'mars-orbite'};
    if((m=/^(?:montre|affiche|ou est|ou se trouve|trouve|va voir|va sur|presente|presente moi|parle moi de|zoome sur|suis) (?:moi )?(?:l |la )?(?:iss|station spatiale internationale|station spatiale|station)$/.exec(t))) return {type:'espace',action:'iss',presenter:/presente|parle/.test(t)};
    if(/^(?:montre|affiche|ajoute|mets) (?:moi )?(?:les )?satellites(?: reels| autour de la terre)?$/.test(t)) return {type:'espace',action:'satellites',oui:true};
    if(/^(?:retire|enleve|efface|cache|masque) (?:les )?satellites$/.test(t)) return {type:'espace',action:'satellites',oui:false};
    if((m=/^(?:va sur|va vers|va a|vole vers|emmene moi (?:sur|vers|a)|zoome sur|cap sur|direction|montre|affiche|montre moi) (?:la planete |planete |l etoile |le |la |l )?(mercure|venus|mars|jupiter|saturne|uranus|neptune|soleil|pluton|ceres|vesta|phobos|deimos|ganymede|callisto|titan|encelade|triton|ceinture d asteroides|asteroides|asteroide)$/.exec(t))) return {type:'espace',action:'aller',nom:m[1]};
    return null;
  }
  function analyserUnivers(texte){
    const t=normU(texte);
    if(UNIVERS_RANGER.test(t)) return {type:'rangement',action:'ranger'};
    if(UNIVERS_ROUVRIR.test(t)) return {type:'rangement',action:'rouvrir'};
    let m;
    if(/^(?:ouvre|lance|demarre|va dans|entre dans|montre|affiche|passe en|passe sur|mets|active) (?:moi )?(?:l |le |la |mon )?(?:univers|mode univers|univers 3d|mode espace|terre interactive|globe interactif|globe 3d|globe terrestre)$/.test(t)) return {type:'univers',action:'ouvrir',theme:'espace'};
    if(/^(?:quitte|ferme|sors de|sortir de|quitter|fermer) (?:l |le |la )?(?:univers|mode univers|globe|mode espace|scene)$/.test(t)) return {type:'univers',action:'fermer'};
    const nouveau=analyserNouveau(t); if(nouveau) return nouveau;
    if((m=/^(?:presente|presentez|presente moi|presenter|fais (?:moi )?(?:une )?presentation (?:de|du|de la|de l|des|sur)|raconte moi|decris|decris moi) ?(?:moi )?(?:l |le |la |les |un |une |du |de la |de l |des )?(.{2,60})$/.exec(t))) return {type:'espace',action:'presenter',nom:m[1].trim()};
    if((m=/^(?:parle moi|parles moi|dis moi (?:tout|quelque chose)|dis moi ce que tu sais) (?:de|du|de la|des|d|sur) (?:l |la |le |les )?(.{2,60})$/.exec(t))) return {type:'espace',action:'presenter',nom:m[1].trim(),souple:true};
    if(/^(?:montre|affiche|ouvre) (?:moi )?(?:les )?actualites(?: du monde| sur le globe| sur la terre)?$/.test(t)||/^(?:mets|ajoute|montre) (?:moi )?(?:les )?actualites (?:sur le globe|sur la carte|sur la terre)$/.test(t)) return {type:'espace',action:'actus'};
    if((m=/^(?:montre|affiche|donne|quelles sont|dis moi|lis moi) (?:moi )?(?:les )?(?:actualites|infos|nouvelles|news) (?:du|de la|de l|des|de|sur|en|au|aux) (?:la |le |les |l )?(.{2,50})$/.exec(t))) return {type:'espace',action:'actus',nom:m[1].trim()};
    if(/^(?:retire|enleve|efface|cache|masque) (?:les )?actualites$/.test(t)) return {type:'espace',action:'actus',oui:false};
    if(/^(?:montre|affiche|passe sur|va sur|retourne sur|reviens sur) (?:moi )?(?:la )?lune$/.test(t)||/^(?:montre|affiche) (?:moi )?(?:la )?terre et la lune$/.test(t)) return {type:'espace',action:'lune'};
    if(/^(?:montre|affiche|reviens sur|retourne sur|va sur|remets|retourne dans|reviens dans|va dans|remonte dans|remonte vers|retourne vers) (?:moi )?(?:la )?(?:terre|espace|orbite)$/.test(t.replace(/ (?:l |la )(?=espace|orbite)/,' '))) return {type:'espace',action:'terre'};
    if((m=/^(?:montre|affiche|quand a lieu|c est quand|donne moi|trouve) (?:moi )?(?:la |le )?(?:prochaine )?eclipse(?: (?:de )?(soleil|lune|solaire|lunaire))?$/.exec(t))) return {type:'espace',action:'eclipse',typeEclipse:m[1]&&/lun/.test(m[1])?'lune':m[1]?'soleil':undefined};
    if(/^(?:surprends moi|fais moi (?:une )?surprise|montre moi (?:quelque chose|un endroit) au hasard|presente moi (?:quelque chose|un endroit) au hasard|au hasard)$/.test(t)) return {type:'espace',action:'surprise'};
    if((m=/^(?:change|mets|passe|affiche) (?:le )?(?:fond|ciel|decor|arriere plan) (?:en |sur |avec )?(?:une |un |la |le )?(.{2,40})$/.exec(t))) return {type:'espace',action:'ciel',style:m[1].trim()};
    if(/^(?:accelere|accelerer) (?:le )?temps$/.test(t)||/^(?:acceleration du temps)$/.test(t)) return {type:'espace',action:'temps',vitesse:3600};
    if(/^(?:remets|retour a|reviens a|passe en) (?:le )?(?:l )?(?:heure|temps) reel(?:le)?$/.test(t)) return {type:'espace',action:'temps',vitesse:1};
    if(/^(?:fige|arrete|mets en pause) (?:le )?temps$/.test(t)) return {type:'espace',action:'temps',pause:true};
    if((m=/^(?:montre moi|montre|affiche|va sur|va dans|va en|va au|va aux|emmene moi (?:sur|en|au|aux|dans)|zoome sur|cap sur|direction|envoie moi (?:sur|en|au|aux)) (?:l |la |le |les )?(?:ocean |mer |golfe |pays )?(.{2,60})$/.exec(t))) return {type:'espace',action:'aller',nom:m[1].trim(),souple:true};
    return null;
  }
  const STYLES_CIEL_VOIX={spirale:/spirale|galaxie|bleu/,nebuleuse:/nebuleuse|rose|violet/,dore:/dore|or|jaune|voie lactee/,emeraude:/emeraude|vert/,braise:/braise|rouge|orange|feu/,realiste:/reel|normal|vrai|etoile/};
  async function commandeUnivers(texte){
    try{
      if(typeof commandeLocalisation==='function'){ const l=await commandeLocalisation(texte); if(l) return l; }
    }catch(e){ console.warn('[localisation]',e); }
    let a=analyserUnivers(texte);
    if(!a) return null;
    if(a.type==='rangement'){
      const R=window.RayleRangement; if(!R) return null;
      if(a.action==='ranger'){ if(R.estRange()) return 'Je suis déjà rangée, je t’écoute.'; R.ranger(); return 'Je me range sur le côté, je reste à l’écoute. Dis « rouvre-toi » ou touche ma bulle pour me rappeler.'; }
      if(!R.estRange()) return null;                                  // « reviens » seul : rien à rouvrir, la suite du traitement s'en occupe
      R.rouvrir(); return 'Me revoici.';
    }
    try{
      const th=()=>{ const e=RayleUnivers.etat(); return e.ouvert?e.theme:null; };
      const dire=t=>(window.RayleUniversPont&&RayleUniversPont.dire)?RayleUniversPont.dire(t):Promise.resolve(true);
      // « présente la frégate » : le nom d'un navire va vers la bataille navale
      if(a.type==='espace'&&a.action==='presenter'&&new RegExp('^'+NAV+'(?: '+NATION+')?$').test(a.nom||'')){ const mm=new RegExp('^'+NAV+'(?: '+NATION+')?$').exec(a.nom); a={type:'navale',action:'presenter',navire:typeNav(mm[1]),nation:nationNav(mm[2])}; }
      if(a.type==='univers'&&a.action==='passer'){ if(!RayleUnivers.estOuvert()) return null; const r=await RayleUnivers.commande('passer',{}); return r&&r.texte||null; }
      if(a.type==='univers'&&a.action==='qualite'){ if(!RayleUnivers.estOuvert()) return null; const r=await RayleUnivers.commande('qualite',{niveau:a.niveau}); return r&&r.texte||null; }
      if(a.type==='navale'){
        const dans=th()==='navale';
        if(a.action==='ouvrir'||a.action==='scenario'){
          if(dans&&a.action==='ouvrir'&&!a.lieu) return 'Nous sommes déjà en pleine bataille navale. Dis « lance une escarmouche » ou « tire ».';
          if(dans){ const r=await RayleUnivers.commande('scenario',{nom:a.scenario||'bataille'}); return r&&r.texte||null; }
          await dire(a.lieu?'Direction la bataille navale, '+a.lieu+'.':'Direction la bataille navale. Accroche-toi, on plonge !');
          await RayleUnivers.ouvrir('navale',{lieu:a.lieu,scenario:a.scenario||'bataille'}); return '__deja_dit__';
        }
        if(a.action==='interieur'||a.action==='visite'){
          if(!dans){ await dire('Je t’emmène à bord.'); await RayleUnivers.ouvrir('navale',{scenario:'balade',navires:a.navire?[{type:a.navire,nation:a.nation||['france','angleterre','espagne','portugal'][Math.floor(Math.random()*4)]}]:undefined}); }
          const r=await RayleUnivers.commande(a.action==='visite'||a.visite?'visite-interieur':'interieur',{type:a.navire,nation:a.nation});
          return a.action==='visite'||a.visite?'__deja_dit__':(r&&r.texte)||null;
        }
        if(!dans) return null;                                          // les autres ordres n'ont de sens que dans la bataille navale
        const cmd={tirer:'tirer',camera:'camera',suivre:'suivre',meteo:'meteo',heure:'meteo',infometeo:'info-meteo',son:'son',piece:'piece',sortir:'sortir-interieur',espace:'espace',presenter:'presenter'}[a.action];
        if(a.action==='espace'){ await dire('Je remonte vers l’espace.'); await RayleUnivers.commande('espace',{}); return '__deja_dit__'; }
        const r=await RayleUnivers.commande(cmd,{type:a.navire,nation:a.nation,mode:a.mode,meteo:a.meteo,moment:a.moment,muet:a.muet,piece:a.piece});
        if(a.action==='presenter') return r&&r.ok?'__deja_dit__':(r&&r.texte)||null;
        return r&&r.texte||null;
      }
      if(a.type==='univers'){
        if(a.action==='fermer'){ if(!RayleUnivers.estOuvert()) return null; await RayleUnivers.fermer(); return 'J’ai quitté l’Univers.'; }
        await RayleUnivers.ouvrir(a.theme); return 'L’Univers est ouvert : glisse pour tourner la Terre, pince ou utilise la molette pour zoomer. Dis « présente la France » ou « montre l’océan Pacifique ».';
      }
      if(a.type==='espace'){
        if(a.action==='terre' && !RayleUnivers.estOuvert()) return null;
        if(a.action==='terre' && th()==='navale'){ await dire('Je remonte vers l’espace.'); await RayleUnivers.commande('espace',{}); return '__deja_dit__'; }
        if(a.action==='piece-rover'){ const e=RayleUnivers.etat(); if(!(e.ouvert&&e.scene&&e.scene.vue==='mars')) return null; a.action='piece'; }       // « reviens sur la Terre » appartient au fond Espace tant que l'Univers est fermé
        // phrases larges (« montre … », « parle-moi de … ») : seulement si l'Univers est ouvert et que le nom est connu, pour ne pas voler les autres commandes (planètes, ISS, cartes…)
        if(a.souple){
          if(!RayleUnivers.estOuvert()) return null;
          const N=await RayleUnivers.charger(), inst=N.instance(); const I=inst&&inst._; if(th()!=='espace'||!I) return null; if(!(I.connait?I.connait(a.nom):(I.geo&&I.geo.centre(a.nom)))) return null;
        }else if(!RayleUnivers.estOuvert()){ await RayleUnivers.ouvrir('espace'); }
        else if(th()!=='espace'){ await RayleUnivers.ouvrir('espace'); }                 // depuis la bataille navale : on remonte d'abord dans l'espace
        const args={nom:a.nom,oui:a.oui,type:a.typeEclipse,vitesse:a.vitesse,pause:a.pause,reelle:a.reelle,presenter:a.presenter,rover:a.rover};
        if(a.action==='ciel'){ const st=Object.keys(STYLES_CIEL_VOIX).find(k=>STYLES_CIEL_VOIX[k].test(normU(a.style))); args.style=st; }
        const nomCmd={presenter:'presenter',aller:'aller',actus:'actus',lune:'lune',terre:'terre',eclipse:'eclipse',surprise:'surprise',ciel:'ciel',temps:'temps',systeme:'systeme',echelle:'echelle',iss:'iss',satellites:'satellites',atterrir:'atterrir',rover:'rover','autre-rover':'autre-rover',piece:'piece','mars-orbite':'mars-orbite'}[a.action];
        const r=await RayleUnivers.commande(nomCmd,args);
        if(a.action==='presenter'||a.action==='surprise'||(a.action==='iss'&&a.presenter)) return r&&r.ok?'__deja_dit__':(r&&r.texte)||null;      // la présentation parle elle-même
        return (r&&r.texte)||null;
      }
    }catch(e){ console.warn('[univers]',e); return 'L’Univers n’a pas pu s’ouvrir : '+(e&&e.message||e)+'.'; }
    return null;
  }
