"use strict";
  /* ═════════════ CARTES : Leaflet + OpenStreetMap, lieux (Nominatim), itinéraires (OSRM) ═════════════
     « montre-moi Toulouse », « où est la gare de Castres », « itinéraire de Castres à Toulouse à pied ».
     Conditions d'usage vérifiées : tuiles OSM avec attribution visible, Nominatim 1 requête/s maximum (recherches déclenchées
     par Justin seulement, résultats gardés en mémoire), itinéraires FOSSGIS/OSRM en usage léger avec attribution.
     Leaflet est chargé seulement à la première carte (js/vendor/leaflet/). */

  let leafletP=null;
  function chargerLeaflet(){
    if(window.L) return Promise.resolve(window.L);
    if(leafletP) return leafletP;
    leafletP=new Promise((ok,ko)=>{
      const css=document.createElement('link'); css.rel='stylesheet'; css.href='js/vendor/leaflet/leaflet.css'; document.head.appendChild(css);
      const sc=document.createElement('script'); sc.src='js/vendor/leaflet/leaflet.js';
      sc.onload=()=>ok(window.L); sc.onerror=()=>{ leafletP=null; ko(new Error('Leaflet introuvable')); };
      document.head.appendChild(sc);
    });
    return leafletP;
  }

  /* ───── Géocodage (Nominatim) : 1 requête par seconde au plus, avec mémoire ───── */
  // Zone favorisée (sans exclure le reste du monde) : « Castres » doit être celui du Tarn, pas celui de l'Aisne. Modifiable : localStorage « rayle_carte_zone » = ouest,sud,est,nord
  const ZONE_PRIORITE=(store.get('rayle_carte_zone')||'-2,42,8,46').replace(/[^0-9.,-]/g,'');
  const geoMemoire=new Map(); let geoDernier=0, geoFile=Promise.resolve();
  function geocoder(q){
    const cle=norm(q).trim();
    if(geoMemoire.has(cle)) return Promise.resolve(geoMemoire.get(cle));
    const tache=geoFile.then(async()=>{
      const attente=geoDernier+1100-Date.now(); if(attente>0) await new Promise(r=>setTimeout(r,attente));
      geoDernier=Date.now();
      const res=await fetchT('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=fr&viewbox='+ZONE_PRIORITE+'&q='+encodeURIComponent(q),{headers:{'Accept':'application/json'}},12000);
      if(!res.ok) throw new Error('Nominatim HTTP '+res.status);
      const l=await res.json();
      const r=l[0]?{lat:+l[0].lat,lon:+l[0].lon,nom:String(l[0].display_name||q),court:String(l[0].name||l[0].display_name||q).split(',')[0],box:l[0].boundingbox?l[0].boundingbox.map(Number):null}:null;
      geoMemoire.set(cle,r);
      return r;
    });
    geoFile=tache.catch(()=>{});
    return tache;
  }

  /* ───── Itinéraire : routing.openstreetmap.de (voiture, vélo, pied), secours OSRM démo (voiture) ───── */
  const PROFILS={voiture:{url:'routed-car',lib:'en voiture',ico:'🚗'},velo:{url:'routed-bike',lib:'à vélo',ico:'🚲'},pied:{url:'routed-foot',lib:'à pied',ico:'🚶'}};
  async function calculerRoute(a,b,profil){
    const coord=a.lon+','+a.lat+';'+b.lon+','+b.lat, fin='?overview=full&geometries=geojson&steps=false';
    const essais=['https://routing.openstreetmap.de/'+PROFILS[profil].url+'/route/v1/driving/'+coord+fin];
    if(profil==='voiture') essais.push('https://router.project-osrm.org/route/v1/driving/'+coord+fin);
    let derniere;
    for(const u of essais){
      try{
        const res=await fetchT(u,{},15000);
        if(!res.ok) throw new Error('HTTP '+res.status);
        const d=await res.json();
        if(d.code!=='Ok' || !d.routes || !d.routes[0]) throw new Error(d.code||'aucun itinéraire');
        const r=d.routes[0];
        return {km:r.distance/1000,min:r.duration/60,coords:r.geometry.coordinates.map(c=>[c[1],c[0]]),via:/openstreetmap\.de/.test(u)?'FOSSGIS':'OSRM'};
      }catch(e){ derniere=e; }
    }
    throw derniere||new Error('itinéraire indisponible');
  }
  const duree=min=>{ const m=Math.round(min); if(m<60) return m+' minutes'; const h=Math.floor(m/60), r=m%60; return h+(h>1?' heures':' heure')+(r?' '+r+(r>1?' minutes':' minute'):''); };
  const kmTxt=km=>km<10?String(Math.round(km*10)/10).replace('.',','):String(Math.round(km));

  /* ───── Panneau carte ───── */
  let carteVue=null;   // {lieu} ou {a,b,profil,route}
  function ouvrirPanneauCarte(vue){
    carteVue=vue;
    const titre=vue.route?'Itinéraire · '+pnCourt(vue.a.court+' → '+vue.b.court,34):'Carte · '+pnCourt(vue.lieu.court,28);
    const centre=vue.route?vue.b:vue.lieu;
    const osm=vue.route
      ?'https://www.openstreetmap.org/directions?engine=fossgis_osrm_'+({voiture:'car',velo:'bike',pied:'foot'})[vue.profil]+'&route='+vue.a.lat+'%2C'+vue.a.lon+'%3B'+vue.b.lat+'%2C'+vue.b.lon
      :'https://www.openstreetmap.org/?mlat='+centre.lat+'&mlon='+centre.lon+'#map=15/'+centre.lat+'/'+centre.lon;
    const gmaps=vue.route
      ?'https://www.google.com/maps/dir/?api=1&origin='+vue.a.lat+','+vue.a.lon+'&destination='+vue.b.lat+','+vue.b.lon+'&travelmode='+({voiture:'driving',velo:'bicycling',pied:'walking'})[vue.profil]
      :'https://www.google.com/maps/search/?api=1&query='+centre.lat+','+centre.lon;
    const pied=[{texte:'OpenStreetMap',url:osm},{texte:'Google Maps',url:gmaps}];
    if(vue.route) Object.keys(PROFILS).forEach(p=>{ if(p!==vue.profil) pied.unshift({texte:PROFILS[p].ico+' '+PROFILS[p].lib,clic:()=>changerProfil(p)}); });
    Panneaux.ouvrir({id:'carte',type:'carte',icone:'🗺',titre,taille:'large',pied,
      corps:(el)=>{
        el.innerHTML=(vue.route?'<div class="pn-sous">'+PROFILS[vue.profil].ico+' <b>'+pnH(kmTxt(vue.route.km))+' km</b> · environ <b>'+pnH(duree(vue.route.min))+'</b> '+pnH(PROFILS[vue.profil].lib)+'</div>':'<div class="pn-sous">'+pnH(pnCourt(vue.lieu.nom,110))+'</div>')
          +'<div class="pn-carte"></div>';
        const boite=el.querySelector('.pn-carte'); let carte=null, fini=false;
        chargerLeaflet().then(L=>{
          if(fini) return;
          carte=L.map(boite,{zoomControl:true,attributionControl:true,worldCopyJump:true});
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'+(vue.route?' · itinéraire '+vue.route.via:'')}).addTo(carte);
          const point=(p,coul)=>L.circleMarker([p.lat,p.lon],{radius:8,color:'#fff',weight:2,fillColor:coul,fillOpacity:.95}).addTo(carte).bindTooltip(pnH(p.court),{permanent:false});
          if(vue.route){
            L.polyline(vue.route.coords,{color:'#4de3ff',weight:5,opacity:.9}).addTo(carte);
            point(vue.a,'#17d98a'); point(vue.b,'#ff007f');
            carte.fitBounds(L.latLngBounds(vue.route.coords),{padding:[24,24]});
          }else{
            point(vue.lieu,'#ff007f');
            const b=vue.lieu.box;
            if(b&&b.length===4) carte.fitBounds([[b[0],b[2]],[b[1],b[3]]],{maxZoom:16,padding:[20,20]}); else carte.setView([vue.lieu.lat,vue.lieu.lon],14);
          }
          setTimeout(()=>{ try{ carte.invalidateSize(); }catch(e){} },750);   // après l'animation d'ouverture
        }).catch(e=>{ boite.innerHTML='<p class="pn-vide">Carte indisponible : '+pnH(e.message)+'</p>'; });
        return ()=>{ fini=true; try{ carte&&carte.remove(); }catch(e){} };
      }});
  }
  async function changerProfil(p){
    if(!carteVue||!carteVue.route) return;
    try{
      const route=await calculerRoute(carteVue.a,carteVue.b,p);
      ouvrirPanneauCarte({a:carteVue.a,b:carteVue.b,profil:p,route});
    }catch(e){ addLine('sys','Itinéraire : '+errMsg(e)); }
  }

  /* ───── Position de Justin (pour « emmène-moi à… ») ───── */
  function maPosition(){
    return new Promise((ok,ko)=>{
      if(!navigator.geolocation) return ko(new Error('position indisponible'));
      navigator.geolocation.getCurrentPosition(p=>ok({lat:p.coords.latitude,lon:p.coords.longitude,nom:'Ma position',court:'Ma position'}),()=>ko(new Error('position refusée')),{timeout:8000,maximumAge:300000});
    });
  }

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
    const t=String(text||'').replace(/^(?:hey |dis |ok )?rayl[ée][\s,]*/i,'').replace(/\s+/g,' ').trim();
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
    return null;
  }

  /* ───── Commande vocale : renvoie la phrase à dire, ou null si ce n'est pas une demande de carte ───── */
  async function commandeCarte(text){
    const a=analyserCarte(text); if(!a) return null;
    const my=epoch;
    try{
      if(a.type==='lieu'){
        if(a.lieu.length<2) return null;
        let lieu;
        try{ lieu=await geocoder(a.lieu); }catch(e){ if(!a.explicite) return null; return "Je n'ai pas pu joindre le service de cartes : "+errMsg(e).slice(0,100)+'.'; }
        if(my!==epoch) return '';
        if(!lieu) return a.explicite ? "Je n'ai pas trouvé « "+a.lieu+" » sur la carte, Justin." : null;
        ouvrirPanneauCarte({lieu});
        return pick(['Voici '+lieu.court+', Justin.','Je '+fx('vous','te')+' montre '+lieu.court+'.','Carte de '+lieu.court+' affichée.']);
      }
      // itinéraire
      let depart;
      if(a.de){ depart=await geocoder(a.de); }
      else{ try{ depart=await maPosition(); }catch(e){ return "Je ne connais pas ta position, Justin. Dis-moi de quel endroit tu pars : « itinéraire de tel endroit à tel endroit »."; } }
      if(my!==epoch) return '';
      const arrivee=await geocoder(a.vers);
      if(my!==epoch) return '';
      if(!depart) return "Je n'ai pas trouvé « "+a.de+" » sur la carte, Justin.";
      if(!arrivee) return "Je n'ai pas trouvé « "+a.vers+" » sur la carte, Justin.";
      const route=await calculerRoute(depart,arrivee,a.profil);
      if(my!==epoch) return '';
      ouvrirPanneauCarte({a:depart,b:arrivee,profil:a.profil,route});
      return 'De '+depart.court+' à '+arrivee.court+' '+PROFILS[a.profil].lib+' : '+kmTxt(route.km)+' kilomètres, environ '+duree(route.min)+'.';
    }catch(e){
      if(my!==epoch) return '';
      addLine('sys','Carte : '+errMsg(e));
      return "Je n'ai pas pu préparer la carte : "+errMsg(e).replace(/ — détail.*$/,'').slice(0,120)+'.';
    }
  }
