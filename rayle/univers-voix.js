"use strict";
/* ═════════════ RAYLE ↔ UNIVERS : la voix (et le menu) pilotent la caméra ═════════════
   - commandeUnivers(texte) : appelée par respond() (phrase.js) avant tout le reste. Renvoie la phrase à dire, ou null si ce n'est pas pour l'Univers.
   - allerPlanete(id)       : le même chemin pour la voix et pour le petit menu des planètes.
   - analyserUnivers(texte) : analyse PURE (aucune action), testable : {type:'aller',id} | {type:'systeme'} | {type:'zoom',facteur} | {type:'menu',ouvert}
   Futur : d'autres modules (terminal de trading, anatomie) s'ajouteront ici, dans MODULES_FUTURS, sans rien changer d'autre. */
  const PLANETES=[
    {id:'soleil',  nom:'le Soleil',  alias:['soleil'],            cmd:['aller',{nom:'soleil'}]},
    {id:'mercure', nom:'Mercure',    alias:['mercure'],           cmd:['aller',{nom:'mercure'}]},
    {id:'venus',   nom:'Vénus',      alias:['venus'],             cmd:['aller',{nom:'venus'}]},
    {id:'terre',   nom:'la Terre',   alias:['terre','planete terre','globe'], cmd:['terre',{}]},
    {id:'lune',    nom:'la Lune',    alias:['lune'],              cmd:['lune',{}]},
    {id:'mars',    nom:'Mars',       alias:['mars','planete mars'], cmd:['aller',{nom:'mars'}]},
    {id:'jupiter', nom:'Jupiter',    alias:['jupiter'],           cmd:['aller',{nom:'jupiter'}]},
    {id:'saturne', nom:'Saturne',    alias:['saturne'],           cmd:['aller',{nom:'saturne'}]},
    {id:'uranus',  nom:'Uranus',     alias:['uranus'],            cmd:['aller',{nom:'uranus'}]},
    {id:'neptune', nom:'Neptune',    alias:['neptune'],           cmd:['aller',{nom:'neptune'}]},
  ];
  // Modules rangés, à brancher plus tard (terminal de trading, anatomie) : { id, test(texte) → bool, ouvrir() → phrase }. Aucun n'est actif.
  const MODULES_FUTURS=[];

  const univNorm=t=>String(t==null?'':t).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/['’\-]/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()
    .replace(/^(?:(?:hey|ok|dis) )?rayle /,'').replace(/ s il (?:te|vous) plait$| stp$| svp$| merci$/,'').trim();
  const NOMS_RE=PLANETES.flatMap(p=>p.alias).sort((a,b)=>b.length-a.length).join('|');
  const VERBE_ALLER='(?:va|vas|aller|allons|allez|file|filons|vole|volons|emmene moi|emmene nous|amene moi|amene nous|conduis moi|dirige toi|rends toi|retourne|direction|cap sur|on va|on y va|j aimerais aller|je veux aller|je veux voir|je veux aller voir|montre moi|montre nous|montre|affiche moi|affiche|fais moi voir|fais nous voir|presente moi|presente|zoome sur|regarde|voir|allons voir|va voir|va regarder|ramene moi)';
  const ALLER_RE=new RegExp('^(?:(?:je voudrais|je veux|j aimerais|peux tu|pourrais tu|tu peux|tu pourrais|il faut|on peut|s il te plait) )*'+VERBE_ALLER+'(?: (?:sur|vers|a|au|en|dans|chez|jusqu a|jusqu au))? ?(?:la |le |les |l )?(?:planete |etoile |satellite )?('+NOMS_RE+')(?: s il te plait)?$');
  const NU_RE=new RegExp('^(?:la |le |l )?(?:planete )?('+NOMS_RE+')$');                  // « Mars », « Saturne » seuls
  const SYSTEME_RE=/^(?:(?:retour|reviens|retourne|revenons|ramene moi|ramene nous|remets? moi|remets?|montre moi|montre nous|montre|affiche|va|allons|on retourne|je veux voir|vue)\s+)?(?:(?:au|en|sur|dans|a|vers|le|la|l)\s+)*(?:systeme solaire|vue d ensemble|ensemble|vue generale|vue globale|vue large|plan large|tout le systeme|systeme)(?: complet| entier)?$|^(?:retour|reviens|revenons)$|^(?:dezoome|recule|elargis) (?:tout|au maximum|completement|a fond)$/;
  const ZOOM_AVANT_RE=/^(?:(?:peux tu|pourrais tu|tu peux) )?(?:zoome|zoom|zoomer|rapproche(?: toi| nous)?|rapprocher|avance|avancer|plus pres|approche(?: toi)?|approcher|grossis|agrandis)(?: (?:un peu|encore|plus|davantage|beaucoup|plus fort|plus pres|en avant|en grand))?$|^(?:plus pres|plus gros|un peu plus pres|zoom avant)$/;
  const ZOOM_ARRIERE_RE=/^(?:(?:peux tu|pourrais tu|tu peux) )?(?:dezoome|dezoom|dezoomer|zoom arriere|eloigne(?: toi| nous)?|eloigner|recule|reculer|plus loin|elargis|prends du recul)(?: (?:un peu|encore|plus|davantage|beaucoup|plus loin|en arriere))?$|^(?:plus loin|plus petit|un peu plus loin|zoom arriere)$/;
  const MENU_OUVRIR_RE=/^(?:ouvre|ouvrir|affiche|afficher|montre|montrer|sors|fais apparaitre|donne moi|donne nous|fais voir)(?: moi| nous)? (?:le |la |les |l |mon |ton |un |ce )?(?:petit )?(?:menu|liste)(?: des planetes| de planetes| planetes| des astres| du systeme| du systeme solaire| des corps)?$|^(?:menu|menu des planetes|liste des planetes)$|^(?:quelles sont les planetes|quelles planetes (?:peux tu|je peux|y a t il)[a-z ]*|que peux tu me montrer)$/;
  const MENU_FERMER_RE=/^(?:ferme|fermer|cache|cacher|range|ranger|masque|masquer|enleve|enlever|retire|retirer|rentre|efface|effacer)(?: moi| nous)? (?:le |la |les |l |mon |ton |ce |cette )?(?:petit )?(?:menu|liste)(?: des planetes| de planetes| planetes| des astres| du systeme| du systeme solaire| des corps)?$|^(?:ferme|cache) (?:ca|tout)$/;

  function idDe(nom){ for(const p of PLANETES) if(p.alias.includes(nom)) return p.id; return null; }
  function analyserUnivers(texte){
    const n=univNorm(texte);
    if(!n) return null;
    if(MENU_OUVRIR_RE.test(n)) return {type:'menu',ouvert:true};
    if(MENU_FERMER_RE.test(n)) return {type:'menu',ouvert:false};
    if(SYSTEME_RE.test(n)) return {type:'systeme'};
    let m=n.match(ALLER_RE)||n.match(NU_RE);
    if(m){ const id=idDe(m[1]); if(id) return {type:'aller',id}; }
    if(ZOOM_AVANT_RE.test(n)) return {type:'zoom',facteur:.55};
    if(ZOOM_ARRIERE_RE.test(n)) return {type:'zoom',facteur:1.7};
    return null;
  }

  const unePlanete=id=>PLANETES.find(p=>p.id===id);
  const monde=()=>window.RayleMonde||null;
  let enCours=0;
  async function allerPlanete(id){
    const p=unePlanete(id), M=monde();
    if(!p) return null;
    if(!M) return 'Je n’ai pas encore l’univers sous les yeux, Justin. Un instant.';
    const mon=++enCours;
    const [nom,args]=p.cmd;
    let r;
    try{ r=await M.commande(nom,args); }catch(e){ console.warn('[rayle] univers',e); return 'Je n’arrive pas à y aller pour le moment.'; }
    if(mon!==enCours) return '__deja_dit__';
    if(r && r.ok===false && r.texte) return r.texte;
    return pick([
      'Direction '+p.nom+', Justin.',
      'Je t’emmène vers '+p.nom+'.',
      'En route pour '+p.nom+'.',
      'Voici '+p.nom+'.'
    ].map(s=>persona.adresse==='tu'?s:s.replace('Je t’emmène','Je vous emmène')));
  }
  async function retourSysteme(){
    const M=monde(); if(!M) return 'Je n’ai pas encore l’univers sous les yeux, Justin.';
    enCours++;
    try{ await M.commande('systeme',{}); }catch(e){ return 'Je n’arrive pas à revenir pour le moment.'; }
    return pick(['Voici le système solaire.','Retour à la vue d’ensemble.','Le système solaire, en entier.']);
  }
  async function zoomer(facteur){
    const M=monde(); if(!M) return null;
    let r; try{ r=await M.commande('zoom',{facteur}); }catch(e){ return 'Je ne peux pas zoomer ici.'; }
    if(r && r.ok===false) return r.texte||'Je ne peux pas zoomer ici.';
    return facteur<1?pick(['Je me rapproche.','Voilà, plus près.']):pick(['Je m’éloigne.','Voilà, un peu de recul.']);
  }
  function menu(ouvert){
    const M=window.RayleMenuPlanetes;
    if(!M) return null;
    M.basculer(ouvert);
    return ouvert?pick(['Voici les planètes.','Le menu est ouvert.']):pick(['Menu fermé.','C’est fermé.']);
  }

  async function commandeUnivers(texte){
    for(const m of MODULES_FUTURS){ try{ if(m.test(texte)) return await m.ouvrir(texte); }catch(e){} }
    const a=analyserUnivers(texte);
    if(!a) return null;
    if(a.type==='aller') return allerPlanete(a.id);
    if(a.type==='systeme') return retourSysteme();
    if(a.type==='zoom') return zoomer(a.facteur);
    if(a.type==='menu') return menu(a.ouvert);
    return null;
  }
  window.RayleUniversVoix={analyserUnivers,allerPlanete,retourSysteme,zoomer,planetes:PLANETES.map(p=>({id:p.id,nom:p.nom.replace(/^(?:le |la )/,'').replace(/^./,c=>c.toUpperCase())}))};
