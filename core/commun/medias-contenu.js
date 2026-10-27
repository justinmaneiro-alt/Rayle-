/* ═════════════ MÉDIAS DANS LES RÉPONSES : règles pures (testées sous Node : galaxie/tests/medias-contenu-test.mjs) ═════════════
   · QUAND afficher des images ou des vidéos : seulement pour une question de RECHERCHE (« parle-moi de… », « c'est quoi… », « où se trouve… », « l'histoire de… »)
     ou d'ACTUALITÉ (« que se passe-t-il à… »). Jamais pour une commande (Terre, galaxie, météo, réglages, écrans, voix, trading) ni pour une conversation simple ;
   · COMBIEN : selon le mode de l'accueil (léger / normal / complet) et les deux réglages ⚙ (médias, vidéos) ;
   · QUOI accepter : réponses du Worker filtrées (hôtes autorisés, titre, auteur, licence et lien toujours présents) ; images fournies par les flux RSS des médias ;
   · commandes vocales : « enlève les images », « désactive les vidéos », « montre-moi les images de cette actualité », « montre-moi une vidéo de… ».
   Aucun média n'est inventé : tout vient du Worker (Wikipédia, Wikimedia Commons, Openverse, Internet Archive, chaînes YouTube officielles) ou du flux RSS du média.
   Utilisable dans la page (window.MediasContenu) et sous Node. */
(function(racine){
  "use strict";
  const IC=(typeof require!=='undefined'&&typeof module!=='undefined')?require('./images-contenu.js'):racine.ImagesContenu;
  const sans=t=>IC.sans(t);
  const CLE_MEDIAS='rayle_medias', CLE_VIDEOS='rayle_videos';

  /* ───── réglages (⚙) : tout est activé par défaut ; '0' = désactivé ───── */
  function lireReglages(lire){
    const l=k=>{ try{ return lire(k); }catch(e){ return null; } };
    const medias=l(CLE_MEDIAS)!=='0';
    return {medias,videos:medias&&l(CLE_VIDEOS)!=='0'};
  }
  /* Ce que le mode permet. auto = compléments automatiques sous une réponse ; explicite = demande « montre-moi… ».
     léger : rien d'automatique, une seule image à la demande, pas de vignettes · normal : 3 images, 1 vidéo, vignettes · complet : 4 images, 2 vidéos, vignettes. */
  function profil(mode,reglages){
    const r=reglages||{medias:true,videos:true};
    if(!r.medias) return {auto:false,images:0,videos:0,vignettes:false,explicite:0,mode};
    const base=mode==='leger'?{auto:false,images:0,videos:0,vignettes:false,explicite:1}
      :mode==='complet'?{auto:true,images:4,videos:2,vignettes:true,explicite:4}
      :{auto:true,images:3,videos:1,vignettes:true,explicite:4};
    if(!r.videos) base.videos=0;
    return {...base,mode:mode||'normal'};
  }

  /* ───── classer une phrase ───── */
  /* Sujets qui sont des commandes ou des objets de Raylé, pas des sujets du monde : jamais de média. */
  const INTERNE=/\b(?:terminal|graphique|graphiques|bougie|bougies|chandelier|chandeliers|rsi|ema|ma200|us100|nasdaq|xau|xauusd|cot|trading|trade|trader|ordre|ordres|position|stop loss|take profit|alerte|alertes|marche|marches|bourse|cours|indicateur|indicateurs|volume profile|dashboard|reglage|reglages|parametre|parametres|ecran|ecrans|multi ecran|disposition|dispositions|micro|voix|mode jeu|mode|fenetre|fenetres|panneau|panneaux|rayle|raylé|worker|code d acces|memoire|note|notes|rappel|agenda|calendrier|meteo|heure|date|minuteur|chrono|alarme|volume|luminosite)\b/;
  const SUJET_MAX=90;
  const RUBRIQUES=/^(?:(?:du |de la |des |de l |le |la |les |l )?(?:sport|sports|politique|economie|culture|sciences?|technologies?|sante|societe|justice|environnement|international|monde|france|faits? divers|high tech|hightech)(?: et (?:du |de la |des )?(?:sport|politique|economie|culture|sciences?|sante|societe))?)$/;
  const PRE='(?:(?:hey |ok |okay |dis )?rayle[ ,]+)?(?:(?:dis[- ]moi|peux[- ]tu|pouvez[- ]vous|tu peux|est[- ]ce que tu peux|j aimerais|je voudrais|je veux|s il te plait|stp|svp)[ ,]+)*';
  const SCHEMAS_RECHERCHE=[
    new RegExp('^'+PRE+"(?:parle(?:z)?(?: moi)?|raconte(?:z)?(?: moi)?|explique(?:z)?(?: moi)?|dis moi tout|dis moi ce que tu sais|donne(?: moi)? des (?:infos|informations)|renseigne(?: moi)?|je veux en savoir plus)(?: un peu| plus| tout| encore)? (?:sur|de|du|des|d|a propos de|a propos du|a propos des|au sujet de|au sujet du|au sujet des)\\s+(.+)$"),
    new RegExp('^'+PRE+"(?:c est quoi|qu est ce qu(?:e|un|une)? c est|qu est ce que c est que|qu est ce que|qu est ce qu|ca veut dire quoi|qu est ce qu on appelle)\\s+(.+)$"),
    new RegExp('^'+PRE+"(?:ou (?:se trouve|est situee?|est|sont|se situe|se situent)|c est ou|dans quel pays (?:se trouve|est)|dans quelle ville (?:se trouve|est))\\s+(.+)$"),
    new RegExp('^'+PRE+"(?:quelle est l histoire (?:de|du|des|d)|l histoire (?:de|du|des|d)|raconte(?: moi)? l histoire (?:de|du|des|d)|quelle est l origine (?:de|du|des|d)|d ou vient|d ou viennent)\\s*(.+)$"),
    new RegExp('^'+PRE+"(?:qui a (?:invente|decouvert|construit|peint|ecrit|compose|fonde|cree|realise|dessine|sculpte|lance|bati|edifie))\\s+(.+)$"),
    new RegExp('^'+PRE+"(?:de quoi est fait|comment fonctionne|comment fonctionnent|comment vit|comment vivent|que mange|que mangent|quelle est la hauteur d|quelle est la taille d|comment est ne|comment est nee)\\s*(?:le |la |l |les |un |une |des |du |de la |d )?(.+)$")
  ];
  const SCHEMAS_ACTU=[
    new RegExp('^'+PRE+"(?:que se passe t il|qu est ce qui se passe|il se passe quoi|quoi de neuf|des nouvelles|les dernieres nouvelles|les dernieres infos|les infos|les actualites|l actualite|les news|l info)\\s+(?:a|au|aux|en|dans|sur|de|du|des|d|concernant|a propos de|a propos du|autour de|autour du)\\s*(.+)$"),
    new RegExp('^'+PRE+"(?:donne(?: moi)?|montre(?: moi)?|fais(?: moi)?|raconte(?: moi)?) (?:les |des |un point sur les |un point sur l |le point sur l |le point sur les )?(?:(?:dernieres |derniers )?(?:nouvelles|actualites|actu|news)|(?:dernieres|derniers) (?:infos|informations)) (?:sur|de|du|des|d|a propos de|au sujet de|concernant)\\s*(.+)$"),
    new RegExp('^'+PRE+"(?:qu est ce qui est arrive|que s est il passe|qu est il arrive|qu est il passe)\\s+(?:a|au|aux|en|dans|avec)?\\s*(.+)$")
  ];
  const sujetBrut=(orig,m)=>orig.slice(orig.length-m[1].length);
  function nettoyerSujet(brut){
    let s=IC.nettoyerSujet(String(brut||'')).replace(/\s*\b(?:ce soir|ce matin|aujourd'?hui|en ce moment|actuellement|maintenant|stp|svp|s'il te plait)\b\s*$/i,'').replace(/[?!.…]+$/,'').trim();
    s=s.replace(/^(?:le |la |l'|les |un |une |des |du |de la |de l'|d')/i,'').trim();
    return s;
  }
  /* classer(texte) → null (rien à afficher : commande, conversation simple, sujet douteux) ou {genre:'recherche'|'actualite', sujet, requete, motif}
     Les demandes déjà traitées par la galerie explicite (« montre-moi… », « photo de… », « qui est… ») ne passent pas ici : IC.demande les prend. */
  function classer(texte){
    const orig=String(texte==null?'':texte).trim().replace(/\s+/g,' '); if(!orig||orig.length>160) return null;
    if(IC.demande(orig)) return null;                                    // question visuelle : déjà gérée (galerie explicite, « qui est… »)
    const propre=orig.replace(/[?!.…]+$/,'');   // même longueur que t : le sujet est repris à la fin du texte d'origine (accents et majuscules conservés)
    const t=sans(propre).replace(/[-'’]/g,' ').replace(/[,;:«»"]/g,' ');
    for(const [genre,liste] of [['actualite',SCHEMAS_ACTU],['recherche',SCHEMAS_RECHERCHE]]){
      for(const re of liste){
        const m=re.exec(t); if(!m) continue;
        const sujet=nettoyerSujet(sujetBrut(propre,[null,m[1]]));
        const norm=sans(sujet).replace(/'/g,' ').replace(/\s+/g,' ').trim();
        if(!norm||norm.length<3||sujet.length>SUJET_MAX) return null;
        if(INTERNE.test(norm)||INTERNE.test(t.slice(0,t.length-m[1].length))) return null;
        if(IC.sujetAdmis(sujet)) return null;                            // fonction (« le président… »), sensible, privé, pronom
        if(/^\d+$/.test(norm)) return null;
        if(/^(?:qui|quoi|que|qu|quel|quelle|quels|quelles|comment|pourquoi|ou|quand|combien|lui|elle|eux|elles|ca|ceci|cela|celui|celle)\b/.test(norm)) return null;   // « parle-moi de qui est… » : une question, pas un sujet
        if(RUBRIQUES.test(norm)) return null;       // « les actualités du sport » : les fenêtres d'actualités s'en occupent

        return {genre,sujet,requete:sujet,motif:genre};
      }
    }
    return null;
  }

  /* ───── réponses du Worker ───── */
  const URL_HTTPS=/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?\/[^\s<>"']*$/i;
  const HOTES_VIDEO={
    youtube:{embed:/^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}$/,miniature:/^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\//,source:/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/},
    archive:{embed:/^https:\/\/archive\.org\/embed\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/,miniature:/^https:\/\/archive\.org\/services\/img\//,source:/^https:\/\/archive\.org\/details\//},
    commons:{fichier:/^https:\/\/upload\.wikimedia\.org\//,miniature:/^https:\/\/(?:upload|thumb)\.wikimedia\.org\//,source:/^https:\/\/commons\.wikimedia\.org\//}
  };
  /* Garde seulement les vidéos aux adresses connues, avec titre, auteur, licence et lien de la source. */
  function filtrerVideos(res,max){
    if(!res||!Array.isArray(res.videos)) return [];
    const sortie=[], vus=new Set();
    for(const v of res.videos){
      if(!v||typeof v!=='object') continue;
      const h=HOTES_VIDEO[v.plateforme]; if(!h) continue;
      const titre=String(v.titre||'').trim(), auteur=String(v.auteur||'').trim(), licence=String(v.licence||'').trim();
      if(!titre||!auteur||!licence||!h.source.test(String(v.source_url||''))) continue;
      if(v.plateforme==='commons'?!h.fichier.test(String(v.fichier||'')):!h.embed.test(String(v.embed||''))) continue;
      if(v.miniature&&!h.miniature.test(String(v.miniature))) continue;
      if(vus.has(v.source_url)) continue; vus.add(v.source_url);
      if(IC.sans(titre).match(/porn|xxx|erotiq|gore|decapit|torture|snuff/)) continue;
      sortie.push({plateforme:v.plateforme,titre:titre.slice(0,160),auteur:auteur.slice(0,120),licence:licence.slice(0,90),licence_url:/^https:\/\//.test(String(v.licence_url||''))?v.licence_url:'',
        source_url:v.source_url,embed:v.embed||'',fichier:v.fichier||'',type_mime:/^video\/(?:webm|ogg|mp4)$/.test(String(v.type_mime||''))?v.type_mime:'',miniature:v.miniature||'',duree:+v.duree||0,date:v.date||''});
      if(sortie.length>=(max||2)) break;
    }
    return sortie;
  }
  const NOM_PLATEFORME={youtube:'YouTube (lecteur officiel)',commons:'Wikimedia Commons',archive:'Internet Archive'};
  /* Images fournies par les flux RSS pour un sujet d'actualité : [{titre, auteur (le média), licence (précision de droits), source_url (l'article), miniature, grande}]
     Seules les adresses https sont gardées ; le titre affiché est celui de l'article du média. */
  function imagesDuSujet(sujet,max){
    const s=sujet||{}, vus=new Set(), sortie=[];
    const candidats=(Array.isArray(s.sources)?s.sources:[]).map(x=>({nom:x&&x.nom,url:x&&x.url,titre:x&&x.titre,image:x&&x.image}));
    if(s.image&&!candidats.some(c=>c.image===s.image)) candidats.unshift({nom:s.source||'média',url:s.url,titre:s.titre,image:s.image});
    for(const c of candidats){
      if(!c.image||!URL_HTTPS.test(String(c.image))||!URL_HTTPS.test(String(c.url||''))||!c.nom) continue;
      if(vus.has(c.image)) continue; vus.add(c.image);
      sortie.push({titre:String(c.titre||s.titre||'').slice(0,160),auteur:String(c.nom).slice(0,80),licence:'image fournie par le flux RSS du média (© '+String(c.nom).slice(0,60)+')',licence_url:'',
        source_url:c.url,miniature:c.image,grande:c.image,origine:'flux'});
      if(sortie.length>=(max||4)) break;
    }
    return sortie;
  }

  /* ───── commandes vocales (texte déjà simplifié comme dans coupure.js : sans accents ni ponctuation) ───── */
  const ORDINAUX={premiere:1,premier:1,'1':1,'1ere':1,deuxieme:2,seconde:2,second:2,'2':2,'2eme':2,troisieme:3,'3':3,'3eme':3,quatrieme:4,'4':4,cinquieme:5,'5':5,derniere:-1,dernier:-1,'1re':1};
  const NOM_MEDIA='(images?|photos?|videos?|medias?)';
  function commande(texte){
    const t=sans(String(texte||'')).replace(/['’-]/g,' ').replace(/[?!.,;:…«»"]/g,' ').replace(/\s+/g,' ').replace(/\s*(?:s il te plait|stp|svp|merci)$/,'').trim();
    if(!t||t.length>110) return null;
    let m;
    if((m=new RegExp('^(?:enleve|enlever|retire|retirer|cache|cacher|supprime|supprimer|vire|efface|effacer|ferme|fermer)(?: moi)? (?:les|ces|toutes les|tous les) '+NOM_MEDIA+'$').exec(t))) return {type:'enlever'};
    if((m=new RegExp('^(?:desactive|desactiver|coupe|couper|arrete|arreter|eteins|eteindre)(?: moi)?(?: les| tous les| toutes les)? '+NOM_MEDIA+'$').exec(t))||/^(?:n affiche plus|plus) d (?:images|photos|videos|medias)$/.exec(t)){
      const q=(m&&m[1])||/(images|photos|videos|medias)$/.exec(t)[1]; return {type:'desactiver',quoi:/video/.test(q)?'videos':'medias'};
    }
    if((m=new RegExp('^(?:active|activer|reactive|reactiver|rallume|rallumer|remets?|remettre|autorise|autoriser)(?: moi)?(?: les| tous les| toutes les)? '+NOM_MEDIA+'$').exec(t))) return {type:'activer',quoi:/video/.test(m[1])?'videos':'medias'};
    // « montre-moi les images / les vidéos de cette actualité », « de la deuxième actualité », « de l'actualité 2 »
    if((m=new RegExp('^(?:montre|affiche|ouvre|fais voir|fais moi voir|donne|je veux voir|je voudrais voir)(?: moi)?(?: voir)? (?:les |des |la )?'+NOM_MEDIA+'(?: et '+NOM_MEDIA+')? (?:liees? |associees? )?(?:a |de |sur |pour )?(?:cette |cet |l |la |le )?(?:(\\w+) )?(?:actualite|actu|info|nouvelle|sujet|article)(?: (?:numero |n |no )?(\\w+))?$').exec(t))){
      const mot=m[3]||null, ord=mot&&ORDINAUX[mot]!==undefined?ORDINAUX[mot]:(m[4]&&ORDINAUX[m[4]]!==undefined?ORDINAUX[m[4]]:null);
      if(mot&&ORDINAUX[mot]===undefined&&!/^(?:cette|cet|numero)$/.test(mot)) return null;
      const q=m[1]+' '+(m[2]||'');
      return {type:'galerie_actu',quoi:/video/.test(q)&&/image|photo/.test(q)?'tout':/video/.test(q)?'videos':'images',index:ord};
    }
    // « montre-moi une vidéo de la tour Eiffel », « vidéo de Fukushima »
    // le sujet est repris dans le texte d'ORIGINE (majuscules et accents gardés) : « tour Eiffel », pas « tour eiffel »
    const brut=String(texte||'').trim().replace(/\s+/g,' ').replace(/[?!.…]+$/,''), u=sans(brut).replace(/['’-]/g,' ');
    if((m=/^(?:(?:montre|affiche|fais voir|fais moi voir|mets|lance|cherche|trouve)(?: moi)? )?(?:une |la |des |les )?(?:video|videos|extrait video|reportage video) (?:de |du |des |d |sur |a propos de |au sujet de )(.+)$/.exec(u))){
      const sujet=IC.nettoyerSujet(brut.slice(brut.length-m[1].length)); if(!sujet||sujet.length<3||IC.sujetAdmis(sujet)||INTERNE.test(sans(sujet))) return null;
      return {type:'video',sujet,requete:sujet};
    }
    return null;
  }

  /* ───── phrases de Raylé ───── */
  const phrases={
    desactive:'Les images et les vidéos sont désactivées. Dis « active les images » pour les remettre.',
    active:'Les images sont de retour.',
    videosOff:'Les vidéos sont désactivées.',
    videosOn:'Les vidéos sont de retour.',
    enleve:'Images retirées.',
    rien:'Il n’y avait aucune image à retirer.',
    pasMedias:'Les images sont désactivées dans les réglages. Dis « active les images » pour en voir.',
    pasVideos:'Les vidéos sont désactivées dans les réglages. Dis « active les vidéos » pour en voir.',
    aucuneActu:'Je n’ai pas d’actualité affichée : demande d’abord « les actualités ».',
    actuSansMedia:'Cette actualité n’a ni image ni vidéo fiable.',
    aucuneVideo:sujet=>'Je n’ai trouvé aucune vidéo fiable pour « '+sujet+' ».',
    indisponible:raison=>'La source de vidéos est indisponible pour le moment'+(raison?' ('+String(raison).replace(/\.$/,'').slice(0,120)+')':'')+'.'
  };

  const api={CLE_MEDIAS,CLE_VIDEOS,lireReglages,profil,classer,filtrerVideos,imagesDuSujet,commande,phrases,NOM_PLATEFORME,INTERNE};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.MediasContenu=api;
})(typeof window!=='undefined'?window:globalThis);
