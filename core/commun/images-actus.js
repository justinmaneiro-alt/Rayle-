/* ═════════════ IMAGES DES ACTUALITÉS (phase T3) ═════════════
   Chaque actualité affichée (cartes sur la Terre, fenêtres Jarvis, hub des pays) reçoit une image, par ordre :
   (a) l'image fournie par le flux du média (enclosure, media:thumbnail, og:image côté Worker) : miniature affichée DEPUIS le site du média, avec son nom
       et le lien vers l'article ; jamais copiée, jamais republiée, jamais enregistrée ici ;
   (b) sinon une photo libre du lieu sur Wikimedia Commons (recherche géographique autour du lieu, puis par nom), licences CC BY, CC BY-SA, CC0 ou domaine
       public seulement, auteur, licence et lien de la page du fichier toujours affichés ;
   (c) sinon une vue cartographique du lieu (4 tuiles satellite NASA GIBS ou EOX Sentinel-2 + repère), sans aucune donnée personnelle.
   Chargement paresseux (au plus 2 demandes Commons en parallèle, résultats gardés 7 jours sur l'appareil), aucune image ne bloque l'affichage.
   Désactivable : ⚙ « Images dans les actualités » (clé rayle_images_actus = '0') ; mode léger ou médias coupés : aucune image.
   Le Worker n'est pas nécessaire (Commons répond avec CORS ouvert) ; aucune route à déployer.
   Utilisable dans la page (window.ImagesActus) et sous Node (partie pure). */
(function(racine){
  "use strict";
  const CLE='rayle_images_actus', CLE_CACHE='rayle_ia_cache_v1', DUREE_CACHE=7*24*3600*1000;
  const TEST=(typeof racine!=='undefined'&&racine.__RAYLE_IA_TEST__)||{};
  const COMMONS=TEST.commons||'https://commons.wikimedia.org/w/api.php';
  const GIBS=TEST.gibs||'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8';
  const EOX=TEST.eox||'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g';

  /* ───── partie pure ───── */
  const esc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const httpsSur=u=>(typeof u==='string'&&/^https:\/\/[^\s<>"']{8,600}$/i.test(u)?u:null);
  /* Image du flux : celle du sujet, sinon la première image d'un des médias qui en parlent. */
  function imageFlux(s){
    if(!s) return null;
    const direct=httpsSur(s.image);
    if(direct) return {src:direct,source:s.source||'',lien:httpsSur(s.url)||null};
    for(const x of (s.sources||[])){ const u=httpsSur(x&&x.image); if(u) return {src:u,source:x.nom||s.source||'',lien:httpsSur(x.url)||httpsSur(s.url)||null}; }
    return null;
  }
  const LICENCES_OK=/^(CC[ -]BY([ -]SA)?([ -][0-9.]+)?( [A-Za-z]{2,3})?|CC[ -]?0([ -][0-9.]+)?|Public domain|PD[ -]?[A-Za-z0-9-]*|Domaine public)\s*$/i;
  const licenceOk=l=>LICENCES_OK.test(String(l||'').replace(/\s+/g,' ').trim());
  const sansHtml=t=>String(t==null?'':t).replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
  const MOTS_REFUSES=/\b(logo|coat of arms|blason|flag|drapeau|map|carte|plan|diagram|schema|sch[eé]ma|poster|affiche|stamp|timbre|screenshot|signature|icon|ic[oô]ne)\b/i;
  /* Réponse de l'API Commons (requête imageinfo) → candidats utilisables, du meilleur au moins bon. */
  function candidatsCommons(json){
    const pages=json&&json.query&&json.query.pages?Object.values(json.query.pages):[];
    const sortie=[];
    for(const p of pages){
      const ii=p&&p.imageinfo&&p.imageinfo[0]; if(!ii) continue;
      const m=ii.extmetadata||{}, lic=sansHtml(m.LicenseShortName&&m.LicenseShortName.value), nonLibre=sansHtml(m.NonFree&&m.NonFree.value);
      if(nonLibre&&/^true$/i.test(nonLibre)) continue;
      if(!/^image\/(jpeg|png)$/i.test(ii.mime||'')) continue;
      if(!licenceOk(lic)) continue;
      const thumb=httpsSur(ii.thumburl)||httpsSur(ii.url); if(!thumb) continue;
      const titre=String(p.title||'').replace(/^File:/i,'').replace(/\.[a-z]{3,4}$/i,'').replace(/_/g,' ');
      if(MOTS_REFUSES.test(titre)) continue;
      const auteur=sansHtml(m.Artist&&m.Artist.value)||sansHtml(m.Credit&&m.Credit.value)||'auteur non précisé';
      sortie.push({src:thumb,titre,auteur:auteur.slice(0,80),licence:lic,lien:'https://commons.wikimedia.org/wiki/'+encodeURI(String(p.title||'').replace(/ /g,'_')),largeur:ii.width||0,hauteur:ii.height||0,rang:p.index||99});
    }
    return sortie.filter(c=>c.largeur>=480||!c.largeur).sort((a,b)=>a.rang-b.rang);
  }
  const CHAMPS='&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize%7Cmime&iiurlwidth=360&iiextmetadatafilter=LicenseShortName%7CArtist%7CCredit%7CNonFree';
  function urlCommonsGeo(lat,lon,rayon=6000){
    return COMMONS+'?action=query&format=json&origin=*&generator=geosearch&ggscoord='+encodeURIComponent(lat.toFixed(4)+'|'+lon.toFixed(4))+'&ggsradius='+Math.min(10000,Math.max(500,rayon|0))+'&ggsnamespace=6&ggslimit=18'+CHAMPS;
  }
  function urlCommonsTexte(nom){
    return COMMONS+'?action=query&format=json&origin=*&generator=search&gsrsearch='+encodeURIComponent(String(nom).slice(0,80)+' filetype:bitmap')+'&gsrnamespace=6&gsrlimit=12'+CHAMPS;
  }
  /* Vue cartographique : 4 tuiles voisines choisies pour que le lieu tombe près du centre ; z selon la précision du lieu. */
  function zoomCarte(type){ return /ville|commune|city|town|village/i.test(type||'')?10:/region|région|state/i.test(type||'')?7:5; }
  function vueCarte(lat,lon,type){
    const z=zoomCarte(type), n=2**z, la=Math.max(-85,Math.min(85,lat))*Math.PI/180;
    const x=(lon+180)/360*n, y=(1-Math.log(Math.tan(la)+1/Math.cos(la))/Math.PI)/2*n;
    const x0=Math.floor(x), y0=Math.floor(y), fx=x-x0, fy=y-y0;
    const ox=fx<0.5?x0-1:x0, oy=fy<0.5?y0-1:y0;           // coin haut-gauche du bloc 2×2
    const base=z>=9?EOX:GIBS, fichier=z>=9?'jpg':'jpeg', source=z>=9?'EOX Sentinel-2 (CC BY-NC-SA)':'NASA GIBS';
    const tuiles=[];
    for(let j=0;j<2;j++) for(let i=0;i<2;i++){
      const tx=((ox+i)%n+n)%n, ty=Math.min(n-1,Math.max(0,oy+j));
      tuiles.push({url:`${base}/${z}/${ty}/${tx}.${fichier}`,i,j});
    }
    return {z,source,tuiles,px:(x-ox)/2,py:(y-oy)/2};      // position du lieu dans le bloc (0..1)
  }

  /* ───── réglage et cache ───── */
  function lireStockage(k){ try{ return racine.localStorage.getItem(k); }catch(e){ return null; } }
  function ecrireStockage(k,v){ try{ racine.localStorage.setItem(k,v); }catch(e){} }
  function actif(){
    if(typeof racine.localStorage==='undefined') return true;
    if(lireStockage(CLE)==='0') return false;
    try{
      const mode=(racine.document&&racine.document.body&&racine.document.body.dataset.hud)||'normal';
      if(racine.MediasContenu) return !!racine.MediasContenu.profil(mode,racine.MediasContenu.lireReglages(lireStockage)).vignettes;
    }catch(e){}
    return true;
  }
  let cache=null;
  function chargerCache(){ if(cache) return cache; try{ cache=JSON.parse(lireStockage(CLE_CACHE)||'{}')||{}; }catch(e){ cache={}; } return cache; }
  function garder(cle,val){
    const c=chargerCache(), t=Date.now(); c[cle]={t,v:val};
    const cles=Object.keys(c); if(cles.length>80){ cles.sort((a,b)=>c[a].t-c[b].t).slice(0,cles.length-80).forEach(k=>delete c[k]); }
    ecrireStockage(CLE_CACHE,JSON.stringify(c));
  }
  const lireCache=cle=>{ const e=chargerCache()[cle]; return e&&Date.now()-e.t<DUREE_CACHE?e.v:undefined; };

  /* ───── file de demandes Commons : 2 en parallèle, 350 ms entre deux départs ───── */
  const file=[]; let actives=0, dernier=0;
  function pousser(){
    while(actives<2&&file.length){
      const d=file.shift(); actives++;
      const attente=Math.max(0,dernier+350-Date.now()); dernier=Date.now()+attente;
      setTimeout(()=>{
        const ctl=typeof AbortController!=='undefined'?new AbortController():null, to=setTimeout(()=>ctl&&ctl.abort(),9000);
        fetch(d.url,{signal:ctl?ctl.signal:undefined,mode:'cors',credentials:'omit',referrerPolicy:'no-referrer'}).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }).then(d.ok,d.ko).finally(()=>{ clearTimeout(to); actives--; pousser(); });
      },attente);
    }
  }
  const demander=url=>new Promise((ok,ko)=>{ file.push({url,ok,ko}); pousser(); });

  /* Une photo libre du lieu : autour des coordonnées, sinon par le nom. Renvoie un descripteur ou null. */
  const enCours=new Map();
  async function photoCommons(lieu){
    if(!lieu) return null;
    if(/pays|country|r.gion|state|continent/i.test(lieu.type||'')) return null;      // un pays ou une région n'a pas de photo "du lieu" : on passe à la carte (jamais une photo au hasard)
    const cle='c:'+(Number.isFinite(lieu.lat)?lieu.lat.toFixed(2)+','+lieu.lon.toFixed(2):'n:'+String(lieu.nom||'').toLowerCase());
    const c=lireCache(cle); if(c!==undefined) return c;
    if(enCours.has(cle)) return enCours.get(cle);
    const p=(async()=>{
      let cands=[];
      try{
        if(Number.isFinite(lieu.lat)&&Number.isFinite(lieu.lon)) cands=candidatsCommons(await demander(urlCommonsGeo(lieu.lat,lieu.lon,/ville|commune|city|town|village/i.test(lieu.type||'')?4000:10000)));
        else if(lieu.nom) cands=candidatsCommons(await demander(urlCommonsTexte(lieu.nom)));   // seulement sans coordonnées : un nom seul est ambigu (homônymes)
      }catch(e){ return null; }                           // panne : on passe à la carte, sans mémoriser l'échec
      const meilleur=cands[0]?{type:'commons',src:cands[0].src,credit:'Commons · '+cands[0].auteur+' · '+cands[0].licence,lien:cands[0].lien,alt:cands[0].titre}:null;
      garder(cle,meilleur); return meilleur;
    })();
    enCours.set(cle,p); p.finally(()=>enCours.delete(cle));
    return p;
  }
  const descripteurCarte=lieu=>{
    if(!lieu||!Number.isFinite(lieu.lat)||!Number.isFinite(lieu.lon)) return null;
    const v=vueCarte(lieu.lat,lieu.lon,lieu.type);
    return {type:'carte',carte:v,credit:'Carte · '+v.source,lien:null,alt:'Vue satellite de '+(lieu.nom||'ce lieu')};
  };
  /* Descripteur de repli (b puis c) pour un lieu. */
  async function repli(lieu){
    const photo=await photoCommons(lieu).catch(()=>null);
    return photo||descripteurCarte(lieu);
  }

  /* ───── affichage ───── */
  function htmlFigure(d,{classe='',largeur=84,hauteur=62}={}){
    if(!d) return '';
    if(d.type==='carte'){
      const v=d.carte, T=0.46*256;           // taille d'une tuile affichée (px) : le bloc 2×2 fait 235 px
      const dx=largeur/2-v.px*2*T, dy=hauteur/2-v.py*2*T;
      const imgs=v.tuiles.map(t=>'<img alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" src="'+esc(t.url)+'" style="left:'+(dx+t.i*T).toFixed(1)+'px;top:'+(dy+t.j*T).toFixed(1)+'px;width:'+T.toFixed(1)+'px;height:'+T.toFixed(1)+'px">').join('');
      return '<span class="ia-fig ia-carte '+classe+'" role="img" aria-label="'+esc(d.alt)+'" title="'+esc(d.alt+' ('+d.credit+')')+'">'+imgs+'<i class="ia-pin"></i><small class="ia-credit">'+esc(d.credit)+'</small></span>';
    }
    const img='<img alt="'+esc(d.alt||'')+'" loading="lazy" decoding="async" referrerpolicy="no-referrer" src="'+esc(d.src)+'" title="'+esc(d.credit)+'">';
    const lien=httpsSur(d.lien);
    return '<span class="ia-fig ia-'+d.type+' '+classe+'">'+(lien?'<a href="'+esc(lien)+'" target="_blank" rel="noopener noreferrer">'+img+'</a>':img)+'<small class="ia-credit">'+esc(d.credit)+'</small></span>';
  }
  const descFlux=f=>f?{type:'flux',src:f.src,credit:'© '+(f.source||'média'),lien:f.lien,alt:''}:null;

  /* Remplit un conteneur pour une actualité s : image du flux tout de suite, repli (Commons puis carte) si absente ou introuvable. Rend true si une image est tentée. */
  function attacher(conteneur,s,{lieu=null,classe='',largeur=84,hauteur=62}={}){
    if(!conteneur||!actif()) return false;
    const l=lieu||(s&&s.lieu)||null, flux=imageFlux(s);
    const montrer=d=>{ conteneur.innerHTML=htmlFigure(d,{classe,largeur,hauteur}); conteneur.classList.remove('ia-vide'); conteneur.classList.toggle('ia-plein',!!d); };
    const secours=async()=>{ const d=await repli(l); if(d){ montrer(d); const im=d.type==='commons'&&conteneur.querySelector('img'); if(im) im.addEventListener('error',()=>{ const c=descripteurCarte(l); if(c) montrer(c); else { conteneur.innerHTML=''; conteneur.classList.add('ia-vide'); } },{once:true}); } else { conteneur.classList.remove('ia-plein'); conteneur.classList.add('ia-vide'); } };
    conteneur.classList.add('ia-zone');
    if(flux){
      montrer(descFlux(flux));
      const im=conteneur.querySelector('img');
      if(im) im.addEventListener('error',()=>{ im.remove(); conteneur.innerHTML=''; secours(); },{once:true});
    } else { conteneur.classList.add('ia-attente'); secours().finally(()=>conteneur.classList.remove('ia-attente')); }
    return true;
  }
  const api={imageFlux,licenceOk,candidatsCommons,urlCommonsGeo,urlCommonsTexte,vueCarte,zoomCarte,htmlFigure,descripteurCarte,repli,photoCommons,attacher,actif,
    reglage:{lire:()=>lireStockage(CLE)!=='0',ecrire:v=>{ ecrireStockage(CLE,v?'1':'0'); if(racine.RayleBus&&racine.RayleBus.emit) try{ racine.RayleBus.emit('medias:reglages',{}); }catch(e){} }}};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.ImagesActus=api;
})(typeof window!=='undefined'?window:globalThis);
