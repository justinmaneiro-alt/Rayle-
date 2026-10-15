"use strict";
  /* ═════════════ CARTES : la Terre sert de carte (globe 3D → carte détaillée MapLibre, tuiles OpenFreeMap) ═════════════
     « montre-moi Castres », « montre le Mont-Blanc », « où est la gare de Lyon », « itinéraire de Bordeaux à Toulouse à pied ».
     Ce fichier COMPREND la phrase ; l'affichage est fait par l'Univers (js/univers/espace/carte-terre.js) via les outils earth.* (js/rayle/terre-outils.js) :
     le globe descend en continu vers le lieu, pose un repère, et Raylé commente. Géocodage et itinéraires : js/univers/espace/lieux.js
     (API Adresse / geo.api.gouv.fr pour la France, Nominatim à 1 requête par seconde avec cache pour le reste du monde ; itinéraires FOSSGIS / OSRM).
     Aucune tuile n'est demandée en dehors de la carte MapLibre (jamais tile.openstreetmap.org). */

  /* Dernier repère montré (lu par js/rayle/appareils.js pour envoyer la carte à un autre appareil) : {lieu} ou {a, b, profil} */
  let carteVue=null;

  /* ───── Compréhension de la phrase ───── */
  const CARTE_EXCLUS=/\b(terminal|graphique|dashboard|tableau|contexte|carnet|rsi|notes?|calendrier|bitcoin|btc|solana|nasdaq|us ?100|ndx|or|gold|euro|eur|meteo|actus?|actualites?|image|photo|video|ca|cela|tout|moi|le|la|les|prix|cours|resultats?|panneau|fenetre|ecran)$/;
  // « où est … » : on ne cherche sur la carte que ce qui ressemble à un lieu (majuscule ou mot de lieu)
  const MOT_LIEU=/(gare|mairie|aeroport|hopital|clinique|tour|rue|avenue|boulevard|place|pont|musee|chateau|cathedrale|eglise|lac|mont|montagne|plage|parc|jardin|universite|ecole|lycee|college|pharmacie|supermarche|station|port|ville|village|quartier|foret|riviere|fleuve)/;
  const ressembleLieu=s=>/[A-ZÀ-Ý]/.test(String(s))||MOT_LIEU.test(norm(s));
  function profilDans(n){ return /\b(a pied|pieton|marche|en marchant)\b/.test(n)?'pied':/\b(velo|a velo|bicyclette)\b/.test(n)?'velo':'voiture'; }
  function nettoyerLieu(s){
    return String(s||'').replace(/[?!.,;]+$/,'').replace(/\b(?:s'il (?:te|vous) pla[iî]t|stp|svp)\b/ig,'')
      .replace(/\s+(?:sur|dans) (?:la |une )?(?:carte|map|google maps)\b/i,'').replace(/\s+(?:a pied|à pied|en voiture|a velo|à vélo|en velo|en vélo)\b/i,'').replace(/\s+/g,' ').trim();
  }
  // → {type:'lieu',lieu,explicite} | {type:'route',de,vers,profil} | null
  function analyserCarte(text){
    const t=String(text||'').replace(/^(?:hey |dis |ok )?rayl[ée][\s,]*/i,'').replace(/\s+/g,' ').trim().replace(/^[A-ZÀ-Ý]/,c=>c.toLowerCase());   // « Montre-moi Castres » (majuscule de début de phrase de la reconnaissance vocale)
    const n=norm(t).replace(/[?!.,;]/g,' ').replace(/\s+/g,' ').trim();
    if(!n||n.split(' ').length>16) return null;
    const profil=profilDans(n);
    let m;
    // Itinéraire entre deux lieux
    if((m=t.match(/(?:itin[ée]raire|trajet|route|chemin)s?\s+(?:de |depuis |d['’])\s*(.+?)\s+(?:à|a|au|vers|jusqu['’]?(?:à|a|au))\s+(.+)$/i))
     ||(m=t.match(/comment (?:aller|se rendre|j['’]?aller|je vais|on va)\s+(?:de |depuis |d['’])\s*(.+?)\s+(?:à|a|au|vers)\s+(.+)$/i))
     ||(m=t.match(/(?:combien de temps|quelle distance|combien de kilom[èe]tres)(?: y a[- ]t[- ]il| faut[- ]il)?\s+(?:de |depuis |entre |d['’])\s*(.+?)\s+(?:à|a|au|et|jusqu['’]?(?:à|a|au))\s+(.+)$/i)))
      return {type:'route',de:nettoyerLieu(m[1]),vers:nettoyerLieu(m[2]),profil};
    // Itinéraire depuis ma position
    if((m=t.match(/^(?:itin[ée]raire|emm[èe]ne[- ]moi|m['’]emm[èe]ne|guide[- ]moi|route|trajet)\s+(?:pour aller |pour |jusqu['’]?|vers )?(?:à |a |au |aux )?(.+)$/i)) && /(itineraire|emmene|guide|trajet|route)/.test(n))
      return {type:'route',de:null,vers:nettoyerLieu(m[1]),profil};
    // Carte explicite
    if((m=t.match(/(?:montre|affiche|ouvre|fais voir|donne)[- ]?(?:moi)?\s+(?:la |une |sa )?carte\s+(?:de |du |des |d['’]|pour )?(.+)$/i)))
      return {type:'lieu',lieu:nettoyerLieu(m[1]),explicite:true};
    if((m=t.match(/(?:montre|affiche|ouvre|situe|localise|trouve)[- ]?(?:moi)?\s+(.+?)\s+sur (?:la |une )?(?:carte|map|google maps)$/i)))
      return {type:'lieu',lieu:nettoyerLieu(m[1]),explicite:true};
    if((m=t.match(/(?:carte|plan) (?:de |du |des |d['’])\s*(.+)$/i)) && n.split(' ').length<=6)
      return {type:'lieu',lieu:nettoyerLieu(m[1]),explicite:true};
    // « où est … » : essai discret (si le lieu n'existe pas, la phrase part à l'IA)
    if((m=t.match(/^(?:o[ùu]|ou) (?:est|se trouve|se situe|sont|se trouvent)\s+(?:donc )?(.+)$/i)) && n.split(' ').length<=8 && ressembleLieu(m[1]))
      return {type:'lieu',lieu:nettoyerLieu(m[1]),explicite:false};
    // « montre-moi Toulouse » : un nom propre avec majuscule, hors commandes connues
    if((m=t.match(/^(?:montre|affiche|fais voir)[- ]?(?:moi)?\s+([A-ZÀ-Ý][\p{L}'’-]+(?:[ -](?:[A-ZÀ-Ý][\p{L}'’-]+|de|du|des|la|le|les|sur|sous|en|d['’]\w+))*)\s*$/u))
      && !CARTE_EXCLUS.test(norm(m[1]))) return {type:'lieu',lieu:nettoyerLieu(m[1]),explicite:false};
    // « montre le Mont-Blanc », « affiche la Corse » : article + nom propre avec majuscule, hors commandes connues
    if((m=t.match(/^(?:montre|affiche|fais voir)[- ]?(?:moi)?\s+(?:le |la |les |l['’]|un |une )([A-ZÀ-Ý][\p{L}'’-]+(?:[ -](?:[A-ZÀ-Ý][\p{L}'’-]+|de|du|des|la|le|les|sur|sous|en|d['’]\w+))*)\s*$/u))
      && !CARTE_EXCLUS.test(norm(m[1]))) return {type:'lieu',lieu:nettoyerLieu(m[1]),explicite:false};
    return null;
  }

  /* ───── Commande vocale : renvoie la phrase à dire, ou null si ce n'est pas une demande de carte ───── */
  async function commandeCarte(text){
    const a=analyserCarte(text); if(!a) return null;
    const my=epoch;
    try{
      if(a.type==='lieu'){
        if(a.lieu.length<2) return null;
        const r=await RayleTerre.executer('earth.show_place',{query:a.lieu});
        if(my!==epoch) return '';
        if(!r.ok){
          // « où est … » / « montre-moi Machin » sans certitude : si le lieu n'existe pas, la phrase part à l'IA ; une demande explicite reçoit la réponse d'échec
          if(!a.explicite && /pas trouv/.test(r.texte||'')) return null;
          return r.texte;
        }
        if(r.lieu) carteVue={lieu:r.lieu};
        return r.texte;
      }
      // itinéraire
      const r=await RayleTerre.executer('earth.show_route',{from:a.de||'',to:a.vers,mode:a.profil});
      if(my!==epoch) return '';
      if(r.ok && r.a && r.b) carteVue={a:r.a,b:r.b,profil:r.profil,route:r.route};
      return r.texte;
    }catch(e){
      if(my!==epoch) return '';
      addLine('sys','Carte : '+errMsg(e));
      return "Je n'ai pas pu préparer la carte : "+errMsg(e).replace(/ — détail.*$/,'').slice(0,120)+'.';
    }
  }
