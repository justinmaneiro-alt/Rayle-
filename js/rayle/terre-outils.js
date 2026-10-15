"use strict";
  /* ═════════════ LA TERRE, BASE DE RAYLÉ : les outils earth.* exposés au cerveau ═════════════
     Quand Raylé doit montrer un lieu, la Terre sert de carte : le globe 3D de l'Univers descend en continu vers une carte détaillée (MapLibre, tuiles OpenFreeMap),
     pose un repère, et Raylé commente. Tout est exécuté par le thème Espace (js/univers/theme-espace.js + js/univers/espace/carte-terre.js).
     Quatre outils, donnés à l'IA sous deux noms équivalents (le Worker utilise les noms sans point, acceptés par toutes les API) :
       • earth.show_place(query, zoom?)            « montre-moi Castres », « montre le Mont-Blanc », « où est la gare de Lyon »
       • earth.show_route(from?, to, mode?)         « itinéraire jusqu'à Toulouse » (from absent = ma position ; mode : voiture, vélo, pied)
       • earth.show_devices(device?)                « où est mon téléphone ? » (positions partagées par les appareils eux-mêmes)
       • earth.set_zoom(level)                      0 à 19, ou monde, pays, région, département, ville, quartier, rue, bâtiment
     RayleTerre.OUTILS = définitions (nom, description, paramètres JSON-Schema) ; RayleTerre.executer(nom, args) → {ok, texte} ; terreAgent(action) pour les actions du Worker (type « terre »).
     Si l'Univers ne peut pas s'ouvrir (pas de WebGL), Raylé le dit et propose le lien OpenStreetMap : aucune tuile n'est jamais demandée en dehors de la carte MapLibre. */
  const RayleTerre=(function(){
    const OUTILS=[
      {nom:'earth.show_place',alias:'earth_show_place',
        description:'Montre un lieu sur la Terre : le globe 3D descend jusqu’à une carte détaillée, pose un repère et Raylé commente. Pour une ville, un village, un monument, un sommet, une rue, une adresse, une région de France ou un pays.',
        parametres:{type:'object',properties:{query:{type:'string',description:'le lieu à montrer, tel que dit par Justin (« Castres », « le Mont-Blanc », « 10 rue de Rivoli Paris »)'},zoom:{type:['string','number'],description:'niveau voulu (facultatif) : 0 à 19, ou monde, pays, région, département, ville, quartier, rue, bâtiment'}},required:['query']}},
      {nom:'earth.show_route',alias:'earth_show_route',
        description:'Calcule et trace un itinéraire sur la Terre (voiture, vélo ou à pied) : la caméra descend du globe, les deux extrémités sont marquées, Raylé donne la distance et la durée.',
        parametres:{type:'object',properties:{from:{type:'string',description:'point de départ (facultatif : sans lui, la position de Justin)'},to:{type:'string',description:'destination'},mode:{type:'string',enum:['voiture','velo','pied'],description:'moyen de déplacement (voiture par défaut)'}},required:['to']}},
      {nom:'earth.show_devices',alias:'earth_show_devices',
        description:'Montre sur la Terre les appareils de Justin (PC, tablette, téléphone) qui partagent leur position, avec la précision de la position quand on zoome.',
        parametres:{type:'object',properties:{device:{type:'string',description:'un appareil précis (« téléphone », « tablette », « PC »), facultatif : sinon tous'}},required:[]}},
      {nom:'earth.set_zoom',alias:'earth_set_zoom',
        description:'Règle le niveau de zoom de la Terre : le globe ou la carte détaillée (0 = planète entière, 19 = bâtiments). Accepte un nombre ou un nom de niveau.',
        parametres:{type:'object',properties:{level:{type:['string','number'],description:'0 à 19, ou monde, pays, région, département, ville, quartier, rue, bâtiment'}},required:['level']}},
    ];
    const norme=nom=>String(nom||'').replace(/^earth[._]/,'').trim();
    const TXT_PAS_DE_CARTE='La carte détaillée ne peut pas s’afficher sur cet appareil';
    const lienOsm=q=>'https://www.openstreetmap.org/search?query='+encodeURIComponent(q);

    // Appelle le thème Espace de l'Univers (l'ouvre au besoin). Renvoie {ok, texte, …}.
    async function themeCommande(nom,args){
      if(typeof RayleUnivers==='undefined') return {ok:false,texte:'L’Univers n’est pas disponible.'};
      try{
        if(!RayleUnivers.estOuvert()) await RayleUnivers.ouvrir('espace');
        const r=await RayleUnivers.commande(nom,args);
        return r||{ok:false,texte:'La Terre n’a pas répondu.'};
      }catch(e){
        const m=String(e&&e.message||e);
        return {ok:false,erreur:m,texte:/WebGL|webgl/.test(m)?TXT_PAS_DE_CARTE+' (WebGL indisponible).':'L’Univers n’a pas pu s’ouvrir : '+m.slice(0,100)+'.'};
      }
    }
    async function executer(nom,args){
      args=args||{}; const k=norme(nom);
      switch(k){
        case 'show_place':{
          const q=String(args.query||args.lieu||args.place||'').trim();
          if(!q) return {ok:false,texte:'Dis-moi quel lieu montrer, par exemple « montre-moi Castres ».'};
          const r=await themeCommande('lieu',{requete:q,zoom:args.zoom});
          if(!r.ok && r.erreur) r.texte+=' Tu peux le voir sur OpenStreetMap : '+lienOsm(q);
          return r;
        }
        case 'show_route':{
          const vers=String(args.to||args.vers||'').trim();
          if(!vers) return {ok:false,texte:'Dis-moi où aller, par exemple « itinéraire jusqu’à Toulouse ».'};
          const profil=profilDe(args.mode||args.profil);
          return themeCommande('itineraire',{de:String(args.from||args.de||'').trim()||null,vers,profil});
        }
        case 'show_devices': return themeCommande('appareils',{nom:String(args.device||args.appareil||'').trim()});
        case 'set_zoom':{
          if(args.level==null && args.niveau==null) return {ok:false,texte:'Dis quel niveau de zoom : un nombre de 0 à 19, ou monde, pays, région, département, ville, quartier, rue, bâtiment.'};
          return themeCommande('zoom-carte',{niveau:args.level!=null?args.level:args.niveau});
        }
        case 'clear': return themeCommande('effacer-carte',{});
      }
      return {ok:false,texte:'Outil inconnu : '+nom+'.'};
    }
    function profilDe(m){ const n=String(m||'').toLowerCase(); return /pied|marche|pieton|walk|foot/.test(n)?'pied':/v[eé]lo|bike|cycl/.test(n)?'velo':'voiture'; }
    return {OUTILS,executer,norme,profilDe,themeCommande,TXT_PAS_DE_CARTE};
  })();
  /** Action décidée par l'agent (Worker) : { type:'terre', outil:'earth.show_place' | 'earth_show_place', args:{…} } → texte à ajouter à la réponse. Un échec est mis dans echecsActions. */
  async function terreAgent(a){
    const nom=a.outil||a.op||a.nom||'';
    const args=a.args||a.parametres||a;
    const r=await RayleTerre.executer(nom,args);
    if(!r.ok){ if(typeof echecsActions!=='undefined') echecsActions.push(r.texte||'La Terre n’a pas pu faire cette action.'); return ''; }
    return r.texte||'';
  }
