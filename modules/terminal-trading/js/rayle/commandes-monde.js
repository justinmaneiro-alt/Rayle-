"use strict";
  /* ═════════════ COMMANDES VOCALES DE LA PAGE « MONDE » (terminal) ═════════════
     « ouvre la carte du monde », « montre-moi le Japon », « zoom sur l'Europe », « qu'est-ce qui se passe en Chine ? »,
     « affiche l'inflation sur la carte », « carte TradingView », « vue Terre », « masque les actualités ».
     Seuls les PAYS et les RÉGIONS vont vers la page Monde : « montre-moi Toulouse » va sur la Terre qui sert de carte (js/rayle/carte.js → js/rayle/terre-outils.js).
     La page répond par le bus ('monde:commande', js/terminal/page-monde.js). */
  const RayleMonde=(function(){
    const n2=t=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/['’-]/g,' ').replace(/[?!.,;:«»"]/g,' ').replace(/\s+/g,' ').trim();
    const PAYS=new Map(), NOMS={};
    for(const [,a2,,nom] of (window.RaylePays||[])){ PAYS.set(n2(nom),a2); NOMS[a2]=nom; }
    const ALIAS={'usa':'US','etats unis':'US','les etats unis':'US','amerique':'US','l amerique':'US','us':'US','angleterre':'GB','grande bretagne':'GB','royaume uni':'GB','uk':'GB',
      'coree':'KR','coree du sud':'KR','coree du nord':'KP','hollande':'NL','pays bas':'NL','tchequie':'CZ','republique tcheque':'CZ','emirats':'AE','emirats arabes unis':'AE','dubai':'AE',
      'arabie':'SA','arabie saoudite':'SA','gaza':'PS','palestine':'PS','taiwan':'TW','vietnam':'VN','viet nam':'VN','birmanie':'MM','cote d ivoire':'CI','russie':'RU','iran':'IR','syrie':'SY',
      'bolivie':'BO','venezuela':'VE','laos':'LA','moldavie':'MD','macedoine':'MK','bosnie':'BA','congo':'CD','rdc':'CD','tanzanie':'TZ'};
    Object.entries(ALIAS).forEach(([k,v])=>PAYS.set(k,v));
    const REGIONS={'europe':'europe','asie':'asie','moyen orient':'moyenorient','proche orient':'moyenorient','afrique':'afrique','amerique du nord':'ameriquenord',
      'amerique du sud':'ameriquesud','amerique latine':'ameriquesud','oceanie':'oceanie','monde':'monde','monde entier':'monde','le monde':'monde','la planete':'monde'};
    const INDIC={inflation:'inflation','l inflation':'inflation',chomage:'chomage','le chomage':'chomage',croissance:'croissance','la croissance':'croissance',pib:'pib','le pib':'pib',
      'taux':'taux','les taux':'taux','taux directeurs':'taux','les taux directeurs':'taux','taux d interet':'taux','les taux d interet':'taux','taux directeur':'taux'};
    const ARTICLES=/^(?:(?:le|la|les|l|du|des|de|d|en|au|aux|a|sur|vers|dans|pour|cote|du cote de|du cote du|du cote des)\s+)*/;
    // un lieu : pays ou région (après avoir enlevé les articles), sinon null
    function lieu(t){
      const x=t.replace(ARTICLES,'').replace(/\s+(?:sur la carte|sur le globe|en ce moment|actuellement|aujourd hui|stp|svp|s il te plait)$/,'').trim();
      if(REGIONS[x]) return {region:REGIONS[x]};
      if(PAYS.has(x)) return {a2:PAYS.get(x)};
      return null;
    }
    function analyser(texte){
      let t=n2(texte).replace(/^(?:(?:hey|he|ok|dis|dis moi)\s+)?rayle\s+/,'').replace(/\s+rayle$/,'').trim();
      if(!t || t.split(' ').length>12) return null;
      if(/^(?:ouvre|affiche|montre|lance|va sur|passe sur|mets)(?: moi)?(?: la| le)? (?:carte du monde|carte monde|page monde|mappemonde|planisphere|monde)$|^(?:la )?carte du monde$/.test(t)) return {type:'ouvrir'};
      if(/^(?:(?:passe|mets|affiche|montre|ouvre|bascule)(?: moi)?(?: en| sur| la| le)* )?(?:la )?(?:carte tradingview|carte trading view|carte eco|carte economique|carte de l economie)$/.test(t)) return {type:'vue',valeur:'tv'};
      if(/^(?:(?:passe|mets|affiche|montre|reviens|bascule|retour)(?: moi)?(?: en| sur| a| la| le| au)* )?vue (?:terre|globe|3d)$|^(?:affiche|montre)(?: moi)? (?:la terre|le globe terrestre)$/.test(t)) return {type:'vue',valeur:'terre'};
      let m=t.match(/^(?:affiche|montre|mets|colore|carte)(?: moi)?(?: de)? (l inflation|inflation|le chomage|chomage|la croissance|croissance|le pib|pib|les taux directeurs|taux directeurs|les taux d interet|taux d interet|les taux|taux directeur)(?: sur la carte| dans le monde| mondiale?| mondial| par pays)$/)
        || t.match(/^(?:la )?carte (?:de l |du |des |de la )?(inflation|chomage|croissance|pib|taux directeurs|taux d interet)$/);
      if(m) return {type:'indicateur',valeur:INDIC[m[1]]||INDIC[m[1].replace(/^(?:l |le |la |les )/,'')]};
      m=t.match(/^(affiche|montre|masque|cache|enleve|retire)(?: moi)? (?:les )?(places boursieres|bourses|actualites|actus|calendrier|annonces)( sur la carte| sur le globe)?$/);
      if(m && (m[3] || !/affiche|montre/.test(m[1]))) return {type:'couche',nom:/bours/.test(m[2])?'places':/actu/.test(m[2])?'actus':'calendrier',oui:/affiche|montre/.test(m[1])};
      // questions : « qu'est-ce qui se passe en Chine ? », « quoi de neuf au Japon ? »
      m=t.match(/^(?:qu est ce qui se passe|que se passe t il|qu est ce qu il se passe|quoi de neuf|quelles sont les nouvelles|quelle est la situation|ca se passe comment)(?: en ce moment| actuellement)? (.+)$/);
      if(m){ const l=lieu(m[1]); if(l) return Object.assign({type:'question'},l); return null; }
      // « montre-moi le Japon », « zoom sur l'Europe », « va en Chine », « ouvre la fiche du Brésil »
      m=t.match(/^(?:montre(?: moi)?|affiche(?: moi)?|zoome?(?: sur| vers)?|zoom(?: sur| vers)?|va|centre(?: toi)?(?: sur)?|emmene moi|ouvre la fiche|fiche|tourne vers|tourne la terre vers)\s+(.+)$/);
      if(m){ const l=lieu(m[1]); if(l) return Object.assign({type:'lieu'},l); }
      return null;
    }
    return {analyser,nom:a2=>NOMS[a2]||a2};
  })();

  // Ouvre le terminal sur la page Monde (si besoin), puis transmet la commande à la page
  async function ouvrirPageMonde(){
    if(RayleBus.demander('vue')!=='terminal') await RayleBus.demander('vue:ouvrir');
    RayleBus.demander('terminal:commande',{type:'page',valeur:'monde'});
  }
  const mondeCmd=c=>RayleBus.demander('monde:commande',c)||{};
  const NOMS_REGIONS={monde:'le monde',europe:"l'Europe",asie:"l'Asie",moyenorient:'le Moyen-Orient',afrique:"l'Afrique",ameriquenord:"l'Amérique du Nord",ameriquesud:"l'Amérique du Sud",oceanie:"l'Océanie"};
  const INDIC_NOMS={inflation:"l'inflation",chomage:'le chômage',croissance:'la croissance',pib:'le PIB',taux:'les taux directeurs'};

  // Renvoie la phrase à dire, ou null si ce n'est pas une commande de la page Monde (la suite du traitement prend le relais)
  async function commandeMonde(texte){
    const a=RayleMonde.analyser(texte); if(!a) return null;
    try{ await ouvrirPageMonde(); }catch(e){ return 'Impossible d’ouvrir la page Monde : '+errMsg(e); }
    switch(a.type){
      case 'ouvrir': return 'Voici la carte du monde.';
      case 'vue': mondeCmd({action:'vue',valeur:a.valeur}); return a.valeur==='tv'?'Carte économique TradingView.':'Retour à la Terre.';
      case 'indicateur': mondeCmd({action:'indicateur',valeur:a.valeur}); return 'J’affiche '+(INDIC_NOMS[a.valeur]||a.valeur)+' sur la carte.';
      case 'couche': mondeCmd({action:'couche',nom:a.nom,oui:a.oui}); return a.oui?'C’est affiché.':'C’est masqué.';
      case 'lieu':
        if(a.region){ mondeCmd({action:'region',id:a.region}); return 'Cap sur '+NOMS_REGIONS[a.region]+'.'; }
        mondeCmd({action:'pays',a2:a.a2,fiche:true}); return RayleMonde.nom(a.a2)+', à l’écran.';
      case 'question':{
        if(a.region){ mondeCmd({action:'region',id:a.region}); return null; }   // une région : l'IA répond, avec la page Monde dans son contexte
        const r=mondeCmd({action:'pays',a2:a.a2,fiche:true});
        let d=null; try{ d=await Promise.race([r.fiche,new Promise(ok=>setTimeout(()=>ok(null),25000))]); }catch(e){}
        return d && d.resume ? d.resume : 'Voici la fiche '+RayleMonde.nom(a.a2)+' : le détail est à l’écran.';
      }
    }
    return null;
  }
  // La page Monde peut faire parler Raylé (bouton « Raylé le lit »)
  RayleBus.fournir('rayle:dire',t=>{ const x=String(t||'').trim(); if(!x) return false; addLine('ray',x); speak(x); return true; });
