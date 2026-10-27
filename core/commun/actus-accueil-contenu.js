"use strict";
/* ═════════════ ACTUALITÉS DE L'ACCUEIL : analyse pure des demandes (testée) ═════════════
   Transforme une phrase (« montre-moi les actus sport », « l'actualité dans le monde », « ferme les actualités ») en ordre
   { action:'ouvrir', portee:'france'|'monde', rubrique:null|id } · { action:'fermer' } · { action:'actualiser' } · null.
   Prudent : une phrase qui contient autre chose que des mots de portée ou de rubrique (« les actus sur la guerre », « infos sur le bitcoin »)
   n'est PAS prise ici et part vers l'agent. Les demandes qui parlent de la Terre ou de la galaxie restent à la Terre.
   Aucune donnée ici : le contenu vient du Worker (/actualites/fil), voir actus-accueil.js. */
(function(racine){
  const sans=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/œ/g,'oe').replace(/[’'`]/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();

  /* rubriques = catégories du Worker (mêmes identifiants que planetes/terre/pc/actus-sujets.js) */
  const RUBRIQUES=[
    {id:'politique',nom:'Politique',mots:['politique','politiques','gouvernement']},
    {id:'economie',nom:'Économie',mots:['economie','economique','economiques','finance','financieres']},
    {id:'international',nom:'International',mots:['international','internationale','internationales','internationaux','etranger','geopolitique']},
    {id:'societe',nom:'Société',mots:['societe','sociale','sociales']},
    {id:'justice',nom:'Justice et faits divers',mots:['justice','police','faitsdivers','judiciaire','judiciaires']},
    {id:'sport',nom:'Sport',mots:['sport','sports','sportive','sportives','sportif','sportifs']},
    {id:'culture',nom:'Culture',mots:['culture','culturelle','culturelles','cinema','musique']},
    {id:'sciences',nom:'Sciences et technologies',mots:['science','sciences','technologie','technologies','tech','numerique','hightech']},
    {id:'environnement',nom:'Environnement',mots:['environnement','climat','ecologie','ecologique']},
    {id:'sante',nom:'Santé',mots:['sante','medecine','medicale','medicales']}
  ];
  const parMot=new Map(); RUBRIQUES.forEach(r=>r.mots.forEach(m=>parMot.set(m,r.id)));
  const rubrique=id=>RUBRIQUES.find(r=>r.id===id)||null;
  const MOTS_MONDE=new Set(['monde','mondial','mondiale','mondiales','mondiaux','planete']);   // « planete » est refusé plus haut ; gardé par prudence
  const MOTS_FRANCE=new Set(['france','francais','francaise','francaises','national','nationale','nationales','locale','locales']);
  /* mots qui peuvent accompagner la demande sans changer son sens */
  const NEUTRES=new Set('de du des d en sur dans la le les l a au aux et un une ce cet cette ces aujourd hui jour maintenant moment matin soir actuel actuelle actuelles recent recente recentes derniere dernieres heure heures voir moi svp stp s il te plait merci raylé rayle pour tout toutes tous'.split(' '));

  const NOM_ACTUS='(?:actualites?|actus?|infos|information|informations|info|news|nouvelles|titres|a la une|les unes)';
  const VERBE='(?:montre|montrer|affiche|afficher|ouvre|ouvrir|donne|donner|mets|mettre|lance|lancer|lis|lire|fais|faire|passe|sors|sortir)';
  const POLI='(?:(?:ok|alors|bon|et|puis|aussi|dis moi|dis|s il te plait|stp|svp|raylé|rayle|hey)\\s+)*';
  const OUVRIR=new RegExp('^'+POLI+'(?:'+VERBE+'(?: moi)?(?: voir)?\\s+)?(?:(?:les|la|le|l|des|mes|toutes les|tous les|quelles sont les|quels sont les|c est quoi les)\\s+)?'+NOM_ACTUS+'\\b(.*)$');
  const QUOI_DE_NEUF=/^(?:(?:ok|alors|dis moi|dis|raylé|rayle)\s+)*(?:quoi de neuf|qu est ce qui se passe|il se passe quoi|quoi de beau)\b(.*)$/;
  const FERMER=new RegExp('^'+POLI+'(?:ferme|fermer|enleve|enlever|retire|retirer|efface|effacer|cache|cacher)(?: moi)?\\s+(?:(?:les|la|le|l|des|toutes les|tous les)\\s+)?(?:fenetres? (?:d |des |de |du )?)?(?:panneaux? (?:d |des |de |du )?)?'+NOM_ACTUS+'\\b');
  const ACTUALISER=new RegExp('^'+POLI+'(?:actualise|actualiser|rafraichis|rafraichir|recharge|recharger|mets a jour|mettre a jour)\\s+(?:(?:les|la|le|l|des|toutes les)\\s+)?'+NOM_ACTUS+'\\b');
  const TERRE=/\b(terre|galaxie|globe|planete|planetes|carte|satellite|orbite|mars|jupiter|saturne|neptune|vole|voler|va|aller|survole)\b/;

  /* qualificatifs (portée, rubrique) d'un reste de phrase ; null si un mot inconnu apparaît */
  function qualifier(reste){
    let r=' '+sans(reste)+' ';
    r=r.replace(/ faits? divers /g,' faitsdivers ').replace(/ high tech /g,' hightech ');
    let portee=null, rub=null;
    for(const m of r.trim().split(' ')){
      if(!m) continue;
      if(MOTS_MONDE.has(m)){ portee='monde'; continue; }
      if(MOTS_FRANCE.has(m)){ if(!portee) portee='france'; continue; }
      if(parMot.has(m)){ if(rub&&rub!==parMot.get(m)) return null; rub=parMot.get(m); continue; }
      if(NEUTRES.has(m)) continue;
      return null;
    }
    return {portee:portee||(rub==='international'?'monde':'france'),rubrique:rub};
  }

  function commande(texte){
    const t=sans(texte); if(!t||t.length>140) return null;
    if(TERRE.test(t)) return null;
    if(FERMER.test(t)) return {action:'fermer'};
    if(ACTUALISER.test(t)) return {action:'actualiser'};
    let m=t.match(OUVRIR)||t.match(QUOI_DE_NEUF);
    if(!m) return null;
    const q=qualifier(m[1]); if(!q) return null;
    return {action:'ouvrir',portee:q.portee,rubrique:q.rubrique};
  }

  const identifiant=(portee,rub)=>'actus-'+portee+(rub?'-'+rub:'');
  const titreFenetre=(portee,rub)=>{ const r=rubrique(rub); const lieu=portee==='monde'?'Monde':'France'; return r?r.nom+' · '+lieu:'À la une · '+lieu; };

  /* sujets (modèles de actus-sujets.js) filtrés par rubrique, les plus repris d'abord, au plus n */
  function selection(sujets,rub,n){
    const l=(sujets||[]).filter(s=>!rub||s.cat===rub).slice().sort((a,b)=>b.importance-a.importance);
    return l.slice(0,Math.max(1,n|0));
  }
  /* nombre de lignes affichées selon le mode de l'accueil (body[data-hud]) */
  const lignes=mode=>mode==='complet'?10:mode==='leger'?5:7;
  /* rubriques réellement présentes dans les données, les plus fournies d'abord (pastilles de la fenêtre) */
  function rubriquesPresentes(sujets,max){
    const n=new Map(); (sujets||[]).forEach(s=>n.set(s.cat,(n.get(s.cat)||0)+1));
    return RUBRIQUES.filter(r=>n.has(r.id)).sort((a,b)=>n.get(b.id)-n.get(a.id)).slice(0,max||6).map(r=>({id:r.id,nom:r.nom,n:n.get(r.id)}));
  }
  /* largeur de la barre d'importance (0 à 1) : nombre réel de médias, plafonné à 8 */
  const barre=n=>Math.max(0.12,Math.min(1,(n|0)/8));
  /* phrase parlée : annonce + le sujet le plus repris (jamais inventé) */
  function phrase(portee,rub,liste){
    const r=rubrique(rub), lieu=portee==='monde'?'dans le monde':'en France';
    const intro=r?'Voici l’actualité '+r.nom.toLowerCase()+' '+lieu+'.':'Voici l’actualité '+lieu+'.';
    if(!liste||!liste.length) return r?'Je n’ai aucun sujet dans la rubrique '+r.nom.toLowerCase()+' pour le moment.':intro;
    return intro+' Le plus repris : '+liste[0].titre.replace(/[.!?…]+$/,'')+'.';
  }

  const api={sans,commande,RUBRIQUES,rubrique,identifiant,titreFenetre,selection,lignes,rubriquesPresentes,barre,phrase};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.ActusAccueilContenu=api;
})(typeof window!=='undefined'?window:globalThis);
