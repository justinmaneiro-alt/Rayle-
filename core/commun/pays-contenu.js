/* ═════════════ ACTUALITÉS PAR PAYS ET PAR CONTINENT : règles pures (testées sous Node : galaxie/tests/pays-contenu-test.mjs) ═════════════
   · l'index des pays (noms français + alias : « États-Unis », « USA », « Corée du Sud »…) construit à partir de la liste du Worker (/actualites?liste=1) ;
   · les commandes vocales : « les actualités du Japon », « les actualités en Afrique », « les actualités du Brésil », « ajoute le Japon à mes favoris », « mes pays favoris » ;
   · la recherche du sélecteur (accents et majuscules ignorés), les favoris (mémorisés sur l'appareil), les étiquettes de langue.
   Aucune IA : les titres restent dans leur langue d'origine avec une étiquette (« JA », « AR »…) ; une traduction n'est faite que sur demande (« traduis ces titres »).
   Un pays sans média fiable est dit tel quel (« je n'ai pas de source fiable pour… ») : rien n'est inventé. Utilisable dans la page (window.PaysContenu) et sous Node. */
(function(racine){
  "use strict";
  const sans=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/œ/g,'oe').replace(/[’'`\-]/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();

  const CLE_FAVORIS='rayle_pays_favoris', MAX_FAVORIS=30;
  const CONTINENTS={europe:'Europe','moyen-orient':'Moyen-Orient et Caucase',afrique:'Afrique',asie:'Asie','amerique-nord':'Amérique du Nord','amerique-centrale':'Amérique centrale et Caraïbes','amerique-sud':'Amérique du Sud',oceanie:'Océanie'};
  const ALIAS_CONTINENTS={
    europe:['europe','union europeenne','europeen'], 'moyen-orient':['moyen orient','proche orient','golfe','caucase','golfe persique'], afrique:['afrique','africain','afrique noire'],
    asie:['asie','extreme orient','asie du sud est','asie centrale'], 'amerique-nord':['amerique du nord','amerique septentrionale'], 'amerique-centrale':['amerique centrale','caraibes','antilles'],
    'amerique-sud':['amerique du sud','amerique latine','amerique australe'], oceanie:['oceanie','pacifique','pacifique sud']
  };
  /* noms usuels en plus du nom du registre */
  const ALIAS_PAYS={
    US:['etats unis','etats unis d amerique','usa','les etats unis'], GB:['royaume uni','angleterre','grande bretagne','uk'], KR:['coree du sud','coree'], KP:['coree du nord'], CD:['rd congo','congo kinshasa','republique democratique du congo'],
    CG:['congo brazzaville','congo'], CI:['cote d ivoire'], AE:['emirats arabes unis','emirats','dubai','abou dabi'], CZ:['tchequie','republique tcheque'], MK:['macedoine','macedoine du nord'], MM:['birmanie','myanmar'],
    SZ:['eswatini','swaziland'], TL:['timor oriental','timor'], BA:['bosnie','bosnie herzegovine'], TT:['trinite et tobago','trinite'], DO:['republique dominicaine'], ZA:['afrique du sud'], SA:['arabie saoudite','arabie'],
    PS:['palestine','territoires palestiniens','gaza','cisjordanie'], HK:['hong kong'], TW:['taiwan','formose'], NZ:['nouvelle zelande'], PG:['papouasie','papouasie nouvelle guinee'], LK:['sri lanka','ceylan'], BY:['bielorussie','belarus'],
    NL:['pays bas','hollande'], VA:['vatican','saint siege'], ST:['sao tome et principe','sao tome'], CV:['cap vert'], GN:['guinee','guinee conakry'], GW:['guinee bissau'], GQ:['guinee equatoriale'], SS:['soudan du sud'],
    BF:['burkina faso','burkina'], SL:['sierra leone'], CF:['centrafrique','republique centrafricaine'], NC:['nouvelle caledonie'], PF:['polynesie francaise','polynesie','tahiti'], SV:['salvador','el salvador'],
    CR:['costa rica'], SG:['singapour'], PH:['philippines'], XK:['kosovo'], CH:['suisse'], IE:['irlande'], BE:['belgique'], LU:['luxembourg'], IL:['israel'], IR:['iran'], IQ:['irak'], SY:['syrie'], YE:['yemen'], AF:['afghanistan']
  };
  const NEUTRES=/\b(?:aujourd hui|maintenant|actuellement|du moment|recentes?|derniere?s?|en direct|s il te plait|stp|svp|merci|pour moi|sur place|la bas|en ce moment)\b/g;

  /* ───── index ───── */
  /* liste : réponse du Worker (/actualites?liste=1).pays ; sansSource : .sansSource (pays connus sans média fiable). */
  function construireIndex(liste,sansSource){
    const idx=[];
    for(const p of liste||[]){
      if(!p||!p.code||p.code==='MONDE'||!p.nom) continue;
      const cles=new Set([sans(p.nom),...(ALIAS_PAYS[p.code]||[]).map(sans)].filter(Boolean));
      idx.push({code:p.code,nom:p.nom,continent:p.continent||null,cles:[...cles],langues:p.langues||[],flux:p.flux||0,sansSource:false,lat:p.lat,lon:p.lon,dist:p.dist});
    }
    for(const p of sansSource||[]){
      if(!p||!p.code||!p.nom||idx.some(x=>x.code===p.code)) continue;
      idx.push({code:p.code,nom:p.nom,continent:p.continent||null,cles:[...new Set([sans(p.nom),...(ALIAS_PAYS[p.code]||[]).map(sans)].filter(Boolean))],langues:[],flux:0,sansSource:true});
    }
    return idx;
  }
  const contient=(t,cle)=>(' '+t+' ').includes(' '+cle+' ');
  /* Le pays dont le nom (ou l'alias) est dans le texte, le plus long d'abord (« Corée du Sud » avant « Corée », « Guinée équatoriale » avant « Guinée »). */
  function trouverPays(texte,index){
    const t=sans(texte); let meilleur=null,taille=0;
    for(const p of index||[]) for(const c of p.cles) if(c.length>taille&&contient(t,c)){ meilleur=p; taille=c.length; }
    return meilleur?{pays:meilleur,cle:taille}:null;
  }
  function trouverContinent(texte){
    const t=sans(texte); let meilleur=null,taille=0;
    for(const [id,alias] of Object.entries(ALIAS_CONTINENTS)) for(const a of alias) if(a.length>taille&&contient(t,a)){ meilleur=id; taille=a.length; }
    return meilleur;
  }
  /* « Amérique » seule : ambiguë (on ne devine pas) */
  const amerique=t=>/^(?:l |les )?(?:amerique|ameriques|americains?)$/.test(t);

  /* ───── commandes vocales ───── */
  const DEBUT='(?:(?:ok|alors|bon|dis moi|donne moi|montre moi|montre|affiche|ouvre|fais moi voir|je veux|je voudrais|j aimerais|raylé|rayle|hey rayle)\\s+)*';
  const PREP='(?:de la|de l|des|du|de|d|en|aux|au|a la|a l|a|dans les|dans le|dans la|dans l|sur|pour|concernant|venant du|venant de|venant d)';   // les plus longues d'abord (« aux » avant « au », « de » avant « d »)
  const NOM_ACTUS='(?:actualites?|actus?|infos?|informations|news|nouvelles|titres|journaux|presse)';
  const RE_ACTUS=new RegExp('^'+DEBUT+'(?:(?:voir|lire|avoir|consulter)\\s+)?(?:les |la |le |l |des |mes )?(?:dernieres |derniers |principales? )?'+NOM_ACTUS+'(?: '+PREP+')? ?(.*)$');
  const RE_NEUF=new RegExp('^'+DEBUT+'(?:quoi de neuf|que se passe t il|qu est ce qui se passe|il se passe quoi|des nouvelles)(?: '+PREP+')? ?(.*)$');
  const ACTION_FAV_AJOUT=/^(?:ajoute|ajouter|mets|mettre|garde|garder|enregistre|enregistrer)(?: moi)? (?:le |la |l |les )?(.+?) (?:dans|a|en|aux|parmi|comme)(?: mes| les| un)? (?:pays )?favoris?$/;
  const ACTION_FAV_RETRAIT=/^(?:retire|retirer|enleve|enlever|supprime|supprimer|efface|effacer)(?: moi)? (?:le |la |l |les )?(.+?) (?:de|des|dans)(?: mes| les)? (?:pays )?favoris?$/;
  const ACTION_FAVORIS=/^(?:(?:ok |alors |bon )*(?:ouvre|montre|affiche|donne|lis)(?: moi)? )?(?:les )?(?:actualites|actus|infos|news)? ?(?:de |des )?(?:mes |les )?(?:pays )?favoris$|^(?:mes )?pays favoris$/;
  const ACTION_SELECTEUR=/^(?:ouvre|montre|affiche)(?: moi)?(?: le| la)?(?: selecteur| choix| liste| menu)?(?: des| de)? pays$|^(?:je veux )?choisir un pays$|^(?:ouvre |montre |affiche )?(?:la )?liste des pays$/;
  const ACTION_TRADUIRE=/^(?:traduis|traduire|traduction)(?: moi)?(?: de)?(?: en francais)? ?(?:les |ces |le |ce |ces dernieres )?(?:premiers? |deux premiers |trois premiers )?(?:titres?|actualites?|infos?|news|ca)?(?: en francais)?$/;

  /* Renvoie null (pas pour les pays) ou une action : {action:'pays',code,pays} · {action:'region',id,nom} · {action:'sans_source',nom,continent} · {action:'favoris'} ·
     {action:'ajouter_favori'|'retirer_favori',code,pays} · {action:'favori_inconnu',nom} · {action:'selecteur'} · {action:'traduire'} · {action:'amerique'} */
  function commande(texte,index){
    const t=sans(texte); if(!t||t.length>110) return null;
    let m;
    if(ACTION_TRADUIRE.test(t)&&/traduis|traduire|traduction/.test(t)) return {action:'traduire'};
    if((m=ACTION_FAV_AJOUT.exec(t))){ const p=trouverPays(m[1],index); return p?{action:'ajouter_favori',code:p.pays.code,pays:p.pays}:{action:'favori_inconnu',nom:m[1]}; }
    if((m=ACTION_FAV_RETRAIT.exec(t))){ const p=trouverPays(m[1],index); return p?{action:'retirer_favori',code:p.pays.code,pays:p.pays}:{action:'favori_inconnu',nom:m[1]}; }
    if(ACTION_FAVORIS.test(t)) return {action:'favoris'};
    if(ACTION_SELECTEUR.test(t)) return {action:'selecteur'};
    m=RE_ACTUS.exec(t)||RE_NEUF.exec(t); if(!m) return null;
    const reste=sans(m[1]).replace(NEUTRES,' ').replace(/\s+/g,' ').trim();
    if(!reste) return null;                                               // « les actualités » seules : France ou monde, géré par l'accueil
    if(amerique(reste)) return {action:'amerique'};
    const c=trouverContinent(reste);
    if(c&&reste.replace(new RegExp('\\b(?:'+ALIAS_CONTINENTS[c].map(a=>a.replace(/ /g,'\\s+')).join('|')+')\\b'),' ').replace(/\b(?:le|la|les|l|du|de|des|d|en|au|aux|a|dans)\b/g,' ').replace(/\s+/g,' ').trim()==='') return {action:'region',id:c,nom:CONTINENTS[c]};
    const p=trouverPays(reste,index);
    if(!p) return null;                                                   // un sujet (« la guerre », « le football ») : l'agent ou les rubriques s'en occupent
    const restant=reste.replace(new RegExp('(?:^| )'+p.pays.cles.filter(k=>contient(reste,k)).sort((a,b)=>b.length-a.length)[0].replace(/ /g,' ')+'(?= |$)'),' ').replace(/\b(?:le|la|les|l|du|de|des|d|en|au|aux|a|dans|sur|pour)\b/g,' ').replace(/\s+/g,' ').trim();
    if(restant) return null;                                              // autre chose que le pays (« les actualités du Japon sur le sport ») : pas de devinette
    return p.pays.sansSource?{action:'sans_source',nom:p.pays.nom,continent:p.pays.continent,code:p.pays.code}:{action:'pays',code:p.pays.code,pays:p.pays};
  }

  /* ───── sélecteur : recherche et groupement ───── */
  function filtrer(index,requete,continent){
    const q=sans(requete);
    const l=(index||[]).filter(p=>(!continent||p.continent===continent)&&(!q||p.cles.some(c=>c.includes(q))||sans(p.code)===q));
    l.sort((a,b)=>sans(a.nom).localeCompare(sans(b.nom)));
    return l;
  }
  function groupes(index,requete){
    const l=filtrer(index,requete), res=[];
    for(const id of Object.keys(CONTINENTS)){ const g=l.filter(p=>p.continent===id); if(g.length) res.push({id,nom:CONTINENTS[id],pays:g}); }
    const sansC=l.filter(p=>!p.continent||!CONTINENTS[p.continent]); if(sansC.length) res.push({id:'autres',nom:'Autres',pays:sansC});
    return res;
  }

  /* ───── favoris ───── */
  function lireFavoris(lire){
    try{ const v=JSON.parse(lire(CLE_FAVORIS)||'[]'); return Array.isArray(v)?[...new Set(v.filter(c=>/^[A-Z]{2}$/.test(String(c))))].slice(0,MAX_FAVORIS):[]; }catch(e){ return []; }
  }
  function basculerFavori(favoris,code,etat){   // etat : true (ajouter), false (retirer), undefined (inverser) → {favoris, change}
    const a=favoris.slice(), i=a.indexOf(code), veut=etat===undefined?i<0:!!etat;
    if(veut&&i<0){ if(a.length>=MAX_FAVORIS) return {favoris:a,change:false,plein:true}; a.push(code); return {favoris:a,change:true}; }
    if(!veut&&i>=0){ a.splice(i,1); return {favoris:a,change:true}; }
    return {favoris:a,change:false};
  }

  /* ───── langues et phrases ───── */
  const LANGUES={fr:'français',en:'anglais',es:'espagnol',pt:'portugais',de:'allemand',it:'italien',nl:'néerlandais',ar:'arabe',ja:'japonais',ko:'coréen',zh:'chinois',ru:'russe',tr:'turc',he:'hébreu',hi:'hindi',bn:'bengali',id:'indonésien',vi:'vietnamien',th:'thaï',pl:'polonais',cs:'tchèque',sk:'slovaque',sl:'slovène',hr:'croate',sr:'serbe',bs:'bosniaque',bg:'bulgare',ro:'roumain',hu:'hongrois',el:'grec',sv:'suédois',no:'norvégien',da:'danois',fi:'finnois',is:'islandais',et:'estonien',lv:'letton',lt:'lituanien',uk:'ukrainien',be:'biélorusse',sq:'albanais',mk:'macédonien',mt:'maltais',ms:'malais',mn:'mongol',dv:'divehi'};
  const nomLangue=l=>LANGUES[l]||String(l||'').toUpperCase();
  const etiquetteLangue=l=>String(l||'').slice(0,3).toUpperCase();
  const listeLangues=l=>{ const u=[...new Set((l||[]).filter(Boolean))].map(nomLangue); return u.length<=1?(u[0]||''):u.slice(0,-1).join(', ')+' et '+u[u.length-1]; };
  const phrasePays=(nom,sources,langues)=>'Voici les actualités, pays : '+nom+(sources&&sources.length?', par '+sources.slice(0,3).join(', ')+(sources.length>3?' et d’autres':''):'')+'. Les titres restent dans leur langue d’origine'+(langues&&langues.length?' ('+listeLangues(langues)+')':'')+' ; dis « traduis ces titres » si tu veux une traduction.';
  const phraseRegion=(nom,nbPays,nbTitres)=>'Voici les actualités de la région : '+nom+', '+nbTitres+' titres de '+nbPays+' pays et de médias régionaux, dans leur langue d’origine.';
  const phraseSansSource=nom=>'Je n’ai pas de source d’actualité fiable pour '+nom+' : aucun média public de ce pays ne m’envoie de flux lisible. Je préfère ne rien inventer.';
  const phraseFavoris=(noms)=>noms.length?'Voici les actualités de tes pays favoris : '+noms.slice(0,6).join(', ')+(noms.length>6?' et '+(noms.length-6)+' autres':'')+'.':'Tu n’as pas encore de pays favori : ouvre le sélecteur de pays et touche l’étoile, ou dis « ajoute le Japon à mes favoris ».';

  const api={sans,CONTINENTS,ALIAS_CONTINENTS,CLE_FAVORIS,MAX_FAVORIS,construireIndex,trouverPays,trouverContinent,commande,filtrer,groupes,lireFavoris,basculerFavori,nomLangue,etiquetteLangue,listeLangues,phrasePays,phraseRegion,phraseSansSource,phraseFavoris};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.PaysContenu=api;
})(typeof window!=='undefined'?window:globalThis);
