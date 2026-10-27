/* ═════════════ IMAGES DE RÉPONSE : calculs purs (testés sous Node : galaxie/tests/images-contenu-test.mjs) ═════════════
   · détecter une QUESTION VISUELLE (« qui est… », « à quoi ressemble… », « montre-moi… », « photo de… ») et en extraire le sujet ;
   · refuser ce qui ne doit pas être cherché (contenu sensible, personnes privées, demandes qui ne sont pas des images : « montre-moi le terminal ») ;
   · reconnaître les commandes de la fenêtre (« agrandis l'image », « image suivante », « ferme l'image ») ;
   · filtrer la réponse du Worker (licence, source, hôtes d'images autorisés, mots sensibles) et écrire la phrase d'introduction ;
   · naviguer dans la galerie (index, agrandissement).
   Aucune image n'est inventée : tout vient de la réponse du Worker (Wikipédia, Wikimedia Commons, Openverse). Utilisable dans la page (window.ImagesContenu) et sous Node. */
(function(racine){
  "use strict";
  const A={'à':'a','â':'a','ä':'a','á':'a','ã':'a','é':'e','è':'e','ê':'e','ë':'e','î':'i','ï':'i','í':'i','ô':'o','ö':'o','ó':'o','õ':'o','ù':'u','û':'u','ü':'u','ú':'u','ç':'c','ñ':'n','œ':'o','’':"'"};
  /* minuscules, sans accents, MÊME LONGUEUR que l'original (les positions restent valables pour extraire le sujet avec ses accents) */
  const sans=t=>String(t==null?'':t).toLowerCase().replace(/[àâäáãéèêëîïíôöóõùûüúçñœ’]/g,c=>A[c]||c);
  const MAX_IMAGES=4;

  const SENSIBLE=/porn|xxx|erotiq|sexe\b|sexuel|sexy|\bnu(?:e|es|s)?\b|nudit|gore|decapit|cadavre|torture|suicide|\bviol\b|viole\b|pedophil|snuff|massacre|egorge|mutil|agonie|bestial|fetich/;
  const PRIVE=/^(?:mon|ma|mes|ton|ta|tes|notre|nos|votre|vos|son|sa|ses)\s|\b(?:moi|toi|nous)\b/;
  const FONCTION=/^(?:(?:le|la|les|l)\s*)?(?:president|presidente|premier ministre|ministre|roi|reine|maire|depute|senateur|gagnant|gagnante|vainqueur|champion|championne|meilleur|meilleure|plus|prochain|dernier|patron|chef|directeur|directrice)\b|^(?:celui|celle|ceux|celles|ce qui|ce que)\b/;
  /* « montre-moi … » n'est une demande d'image que pour un sujet du monde ; pas pour les écrans de Raylé, les marchés, les alertes… */
  const NON_VISUEL=/\b(?:terminal|galaxie|graphique|graphiques|marche|marches|cours|prix|courbe|rsi|bougie|bougies|alerte|alertes|calendrier|agenda|meteo|heure|date|menu|reglages|parametres|journal|carte|itineraire|panneau|panneaux|fenetre|fenetres|ecran|tout|ca|cela|ceci|resultats?|donnees|analyse|scenario|scenarios|nasdaq|bitcoin|sol|dashboard|volume|support|resistance|terre|planete|actualite|actualites|news|infos?|informations?|nouvelles|titres|presse|temps|monde|mondiale|mondial)\b/;   // « montre-moi la Terre / l'actualité en France / la météo » : outils de Raylé (la Terre), pas des images
  const FIN=/\s*(?:s ?'?il (?:te|vous) plait|stp|svp|merci|maintenant|a l ?'?ecran|rapidement|vite)\s*$/;

  function nettoyerSujet(brut){
    let s=String(brut||'').replace(/[?!.…]+$/,'').trim();
    for(let i=0;i<3;i++){ const avant=s; s=s.replace(/\s*(?:s'?il (?:te|vous) (?:plait|plaît)|stp|svp|merci|maintenant|rapidement|vite)\s*$/i,'').trim(); if(s===avant) break; }
    const ART=/^(?:(?:les|le|la|une|un|des|du|de la|de l'|de)\s+|l'|d')/i;
    s=s.replace(ART,'').replace(/^(?:images?|photos?|illustrations?|portraits?)\s+(?:de |d'|du |des )\s*/i,'').replace(ART,'').trim();
    return s;
  }

  /* Analyse d'une phrase : null (pas une demande d'image) · {refus:'sensible'|'prive', sujet} · {type:'qui'|'ressemble'|'montre'|'photo', sujet, requete} */
  function demande(texte){
    const orig=String(texte==null?'':texte).trim().replace(/\s+/g,' '); if(!orig) return null;
    const t=sans(orig).replace(/[-'’]/g,' ');   // « montre-moi » = « montre moi » (même longueur : les positions restent valables)
    // préfixes de politesse : « dis-moi », « peux-tu », « raylé »…
    const pre=/^(?:(?:hey |he |eh |ok |okay |dis )?rayle[ ,]+)?(?:(?:dis[- ]moi|peux[- ]tu|pouvez[- ]vous|tu peux|est[- ]ce que tu peux|j aimerais|je voudrais|je veux|j'?aimerais|s il te plait|stp|svp)[ ,]+)*/.exec(t)[0].length;
    const reste=t.slice(pre);
    const SCHEMAS=[
      ['qui',/^(?:qui (?:est|etait|sont|etaient)|c est qui|ils sont qui|elle est qui|il est qui)\s+(.+)$/],
      ['ressemble',/^(?:a quoi (?:ressemble|ressemblent|ressemblait|ressemblaient))\s+(.+)$/],
      ['montre',/^(?:me |nous )?(?:montre|montrer|montres|affiche|afficher|fais voir|faire voir|fait voir|fais moi voir|voir)(?: moi)?\s+(.+)$/],
      ['montre',/^(?:je veux voir|je voudrais voir|j aimerais voir|a quoi ca ressemble,? )\s*(.+)$/],
      ['photo',/^(?:(?:cherche|trouve|donne|donne moi|trouve moi|cherche moi|sors|sors moi|ajoute|fais)(?: moi)?\s+)?(?:une?|des|la|les|quelques)?\s*(?:photos?|images?|illustrations?|portraits?|dessins?)\s+(?:de |d |du |des )\s*(.+)$/]
    ];
    for(const [type,re] of SCHEMAS){
      const m=re.exec(reste); if(!m) continue;
      let sujet=nettoyerSujet(orig.slice(orig.length-m[1].length));   // le sujet est la fin de la phrase : on le reprend dans le texte d'origine (accents et majuscules conservés)
      const norm=sans(sujet).replace(/'/g,' ').replace(/\s+/g,' ').trim();
      if(!norm||norm.length<2) return null;
      if(type==='montre'&&NON_VISUEL.test(norm)) return null;
      if(/^(?:ce|cela|ca|ceci|il|elle|ils|elles|tu|vous|je)$/.test(norm)) return null;
      if(type==='qui'&&(FONCTION.test(norm)||/^(?:es|etes|suis|sommes)\b/.test(norm)||/^(?:tu|vous|je|moi|toi|ce|ca|il|elle|ils)\b/.test(norm))) return null;
      if(SENSIBLE.test(norm)) return {refus:'sensible',sujet};
      if(PRIVE.test(norm)) return {refus:'prive',sujet};
      if(sujet.length>90) sujet=sujet.slice(0,90).replace(/\s+\S*$/,'');
      return {type,sujet,requete:sujet};
    }
    return null;
  }

  /* Un sujet peut-il être cherché ? '' (oui) · 'vide' · 'fonction' (« le président… » : une fonction, pas un sujet encyclopédique) · 'sensible' · 'prive' */
  function sujetAdmis(sujet){
    const norm=sans(String(sujet==null?'':sujet)).replace(/'/g,' ').replace(/\s+/g,' ').trim();
    if(!norm||norm.length<2) return 'vide';
    if(/^(?:ce|cela|ca|ceci|il|elle|ils|elles|tu|vous|je|moi|toi)$/.test(norm)||/^(?:tu|vous|je|moi|toi|ce|ca|il|elle|ils)\b/.test(norm)) return 'vide';
    if(FONCTION.test(norm)) return 'fonction';
    if(SENSIBLE.test(norm)) return 'sensible';
    if(PRIVE.test(norm)) return 'prive';
    return '';
  }

  /* Commandes de la fenêtre d'images (texte déjà normalisé comme dans coupure.js : sans accents, sans apostrophes) */
  function commandeFenetre(c){
    const t=sans(c).replace(/['’]/g,' ').replace(/\s+/g,' ').replace(FIN,'').trim();
    if(/^(?:agrandis|agrandir|agrandi|zoome|zoomer|mets? en grand|plein ecran)(?: moi)?(?: (?:l|la|cette|les|ca))?(?: ?(?:image|images|photo|photos|illustration))?$/.test(t)||/^(?:montre|affiche) (?:l |la |cette )?(?:image|photo) en grand$/.test(t)) return 'agrandir';
    if(/^(?:reduis|reduire|retrecis|retrecir|remets? en petit|sors du plein ecran)(?: (?:l|la|cette))?(?: ?(?:image|photo))?$/.test(t)) return 'reduire';
    if(/^(?:(?:passe|va|montre|affiche|mets?)(?: moi)?(?: a)? )?(?:l |la |cette )?(?:image |photo )?(?:suivante|suivant|d apres)$/.test(t)||/^(?:l |la )?(?:image|photo) d apres$/.test(t)) return 'suivante';
    if(/^(?:(?:retourne|reviens|passe|va|montre|affiche|mets?)(?: moi)?(?: a)? )?(?:l |la |cette )?(?:image |photo )?(?:precedente|precedent|d avant)$/.test(t)||/^(?:l |la )?(?:image|photo) d avant$/.test(t)||/^(?:retour|reviens) (?:a )?(?:l |la )?(?:image|photo)(?: precedente)?$/.test(t)) return 'precedente';
    if(/^(?:ferme|fermer|enleve|enlever|retire|retirer|efface|effacer|cache|cacher|vire)(?: moi)?(?: (?:l|la|les|cette|ces|ca))? ?(?:image|images|photo|photos|galerie|illustration)$/.test(t)) return 'fermer';
    return null;
  }

  /* ───── réponse du Worker : filtre et phrases ───── */
  const HOTES=[/^https:\/\/(?:upload|thumb)\.wikimedia\.org\//i,/^https:\/\/api\.openverse\.(?:org|engineering)\//i,/^https:\/\/archive\.org\/services\/img\/[A-Za-z0-9._-]+$/i];
  const SOURCE_OK=/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\//i;
  const ORIGINES={wikipedia:'Wikipédia',commons:'Wikimedia Commons',openverse:'Openverse',archive:'Internet Archive'};
  const LICENCE_NON=/non[- ]?commercial|\bnc\b|[- ]nd\b|no[- ]?deriv|fair use|usage loyal|non[- ]?free|all rights|tous droits/i;
  function filtrerImages(res,max){
    if(!res||!Array.isArray(res.images)) return [];
    const sortie=[], vus=new Set();
    for(const im of res.images){
      if(!im||typeof im!=='object') continue;
      const titre=String(im.titre||'').trim(), auteur=String(im.auteur||'').trim(), licence=String(im.licence||'').trim();
      if(!titre||!auteur||!licence||LICENCE_NON.test(licence)) continue;                      // titre, auteur et licence : toujours affichables
      if(!SOURCE_OK.test(String(im.source_url||''))) continue;                                  // lien vers la source obligatoire
      if(!HOTES.some(r=>r.test(String(im.miniature||'')))) continue;                          // images servies seulement par leurs sources connues
      if(im.grande&&!HOTES.some(r=>r.test(String(im.grande)))) continue;
      if(SENSIBLE.test(sans(titre+' '+auteur))) continue;
      if(vus.has(im.source_url)) continue; vus.add(im.source_url);
      sortie.push({titre:titre.slice(0,160),auteur:auteur.slice(0,140),licence:licence.slice(0,40),
        licence_url:/^https:\/\//i.test(String(im.licence_url||''))?im.licence_url:'',source_url:im.source_url,miniature:im.miniature,grande:im.grande||im.miniature,
        largeur:+im.largeur||0,hauteur:+im.hauteur||0,origine:ORIGINES[im.origine]?im.origine:'commons'});
      if(sortie.length>=(max||MAX_IMAGES)) break;
    }
    return sortie;
  }
  const nomOrigine=o=>ORIGINES[o]||o;
  function introduction(res,images){
    const s=res&&res.sujet, n=(images||[]).length;
    if(!n||!s) return '';
    const origines=[...new Set(images.map(i=>nomOrigine(i.origine)))];
    const lieu=origines.length===1&&origines[0]==='Wikipédia'?'':' ('+origines.join(' et ')+')';
    return 'Voici '+(n===1?'une image':'les '+n+' images')+" de l'article Wikipédia « "+s.titre+" »"+lieu+'.';
  }
  function messageSansImage(res,sujet){
    const raison=String((res&&res.raison)||'aucune source libre n\'a répondu').replace(/\.$/,'');
    return 'Je n\'ai trouvé aucune image libre pour « '+sujet+' » : '+raison+'.';
  }
  const messageRefus=r=>r==='sensible'?'Je préfère ne pas chercher ce genre d\'image.':'Je ne cherche pas d\'images de personnes privées : je ne montre que des sujets qui ont une page encyclopédique.';
  const messageIndisponible=raison=>'La source d\'images est indisponible pour le moment'+(raison?' ('+String(raison).replace(/\.$/,'').slice(0,120)+')':'')+'.';

  /* ───── navigation dans la galerie (état pur) ───── */
  function etatGalerie(n){ return {n:Math.max(0,n|0),index:0,agrandi:false}; }
  function naviguer(etat,action){
    const e={n:etat.n,index:etat.index,agrandi:etat.agrandi};
    if(!e.n) return {etat:e,message:''};
    if(action==='suivante'){ if(e.index<e.n-1) e.index++; else return {etat:e,message:'C\'est la dernière image.'}; }
    else if(action==='precedente'){ if(e.index>0) e.index--; else return {etat:e,message:'C\'est la première image.'}; }
    else if(action==='agrandir') e.agrandi=true;
    else if(action==='reduire') e.agrandi=false;
    return {etat:e,message:action==='agrandir'?'Image agrandie.':action==='reduire'?'Image réduite.':'Image '+(e.index+1)+' sur '+e.n+'.'};
  }
  const api={sans,nettoyerSujet,sujetAdmis,demande,commandeFenetre,filtrerImages,introduction,messageSansImage,messageRefus,messageIndisponible,etatGalerie,naviguer,nomOrigine,MAX_IMAGES};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.ImagesContenu=api;
})(typeof window!=='undefined'?window:globalThis);
