"use strict";
  /* ═════════════ LOCALISATION DES APPAREILS : où sont ma tablette, mon PC, mon téléphone ═════════════
     • Chaque appareil donne sa position PAR LUI-MÊME, avec ta permission : bouton « Partager la position de cet appareil »
       (Réglages) ou « Raylé, localise cet appareil ». Rien n'est demandé au navigateur tant que tu n'as pas accepté.
     • La position (latitude, longitude, précision, heure) reste sur l'appareil (localStorage) et, si le Worker est relié et l'appareil appairé,
       elle est envoyée à SON Worker (POST /appareil/position) pour que les autres appareils la voient. Rien ne part ailleurs.
     • « Appareils » : panneau avec nom, position (lieu le plus proche + coordonnées), précision, dernière activité ; repères sur le globe (Terre vivante et Univers).
     • « Arrêter le partage » efface la position locale et celle du Worker.
     API (window.RayleLocalisation) : consentement() · autoriser() · arreter() · maPosition() · liste() · afficher() · reperes() · analyser(texte)
     Bus : 'appareils:positions' {liste}. */
  const RayleLocalisation=(function(){
    const CLE_OK='rayle_loc_ok', CLE_POS='rayle_loc_pos', CLE_LISTE='rayle_loc_liste';
    const PERIODE=5*60000;                         // la position est rafraîchie au plus toutes les 5 minutes, onglet visible
    const lsGet=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
    const lsSet=(k,v)=>{ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} };
    const n2=t=>String(t==null?'':t).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/['’\-]/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();

    /* ───── calculs purs (testés) ───── */
    const RAD=Math.PI/180;
    function distanceKm(a,b){
      const dLat=(b.lat-a.lat)*RAD, dLon=(b.lon-a.lon)*RAD, x=Math.sin(dLat/2)**2+Math.cos(a.lat*RAD)*Math.cos(b.lat*RAD)*Math.sin(dLon/2)**2;
      return 12742*Math.asin(Math.min(1,Math.sqrt(x)));
    }
    function coordTexte(lat,lon){ return Math.abs(lat).toFixed(2)+'° '+(lat>=0?'N':'S')+', '+Math.abs(lon).toFixed(2)+'° '+(lon>=0?'E':'O'); }
    function ilYa(t,maintenant){
      const s=Math.max(0,Math.round(((maintenant||Date.now())-t)/1000));
      if(!t) return 'jamais vu';
      if(s<45) return 'à l’instant';
      if(s<3600) return 'il y a '+Math.max(1,Math.round(s/60))+' min';
      if(s<86400) return 'il y a '+Math.round(s/3600)+' h';
      return 'il y a '+Math.round(s/86400)+' j';
    }
    function precisionTexte(m){ if(!isFinite(m)||m<=0) return ''; return m<1000 ? '± '+Math.round(m)+' m' : '± '+(m/1000).toFixed(1).replace('.',',')+' km'; }
    // valide une position venant du réseau ou du stockage
    function propre(p){
      if(!p || typeof p!=='object') return null;
      const lat=+p.lat, lon=+p.lon;
      if(!isFinite(lat)||!isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180) return null;
      return {lat:Math.round(lat*1e4)/1e4,lon:Math.round(lon*1e4)/1e4,prec:isFinite(+p.prec)?Math.max(0,Math.round(+p.prec)):0,t:isFinite(+p.t)?+p.t:0};
    }
    // lieu connu le plus proche (villes de ui/espace-terre-donnees.js), « à 12 km de Lyon » ; vide si rien de proche
    function lieuProche(p){
      try{
        const T=window.RayleUI&&RayleUI.espaceTerre, villes=T&&T.villesIndex&&T.villesIndex();
        if(!villes) return '';
        let best=null, bd=1e9;
        for(const v of villes.values()){ if(!isFinite(v.lat)||!isFinite(v.lon)) continue; const d=distanceKm(p,v); if(d<bd){ bd=d; best=v; } }
        if(!best||bd>400) return '';
        return bd<12 ? best.nom : 'à '+Math.round(bd)+' km de '+best.nom;
      }catch(e){ return ''; }
    }
    function genre(nom){
      const n=n2(nom);
      if(/\b(?:tablette|xiaomi|ipad)\b/.test(n)) return 'tablette';
      if(/\b(?:telephone|tel|portable|mobile|smartphone|samsung|galaxy|iphone)\b/.test(n)) return 'telephone';
      return 'pc';
    }
    const ICONES={pc:'🖥',tablette:'📱',telephone:'📞'};

    /* ───── état ───── */
    let derniereMaj=0, timer=null, enCours=false;
    const consentement=()=>lsGet(CLE_OK)==='1';
    function maPosition(){ try{ return propre(JSON.parse(lsGet(CLE_POS)||'null')); }catch(e){ return null; } }
    const monNom=()=>{ try{ return store.get(KEY_WDEVNOM)||''; }catch(e){ return ''; } };
    const monNomAffiche=()=>monNom()||((matchMedia&&matchMedia('(pointer:coarse)').matches)?(Math.min(screen.width,screen.height)<600?'Téléphone':'Tablette'):'PC');

    function lireGeo(){
      return new Promise((ok,ko)=>{
        if(!navigator.geolocation) return ko(new Error('la géolocalisation n’existe pas sur ce navigateur'));
        navigator.geolocation.getCurrentPosition(
          p=>ok({lat:p.coords.latitude,lon:p.coords.longitude,prec:p.coords.accuracy,t:Date.now()}),
          e=>ko(new Error(e&&e.code===1?'permission refusée':e&&e.code===3?'délai dépassé':'position indisponible')),
          {enableHighAccuracy:false,timeout:15000,maximumAge:PERIODE});
      });
    }
    async function envoyer(p){                       // facultatif : sans Worker appairé, la position reste locale
      try{
        if(typeof workerReady!=='function'||!workerReady()||!store.get(KEY_WDEV)) return false;
        const r=await wfetch('/appareil/position',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat:p.lat,lon:p.lon,prec:p.prec})},12000);
        return r.ok;
      }catch(e){ return false; }
    }
    async function actualiser(){
      if(enCours||!consentement()) return maPosition();
      enCours=true;
      try{
        const p=propre(await lireGeo());
        if(p){ lsSet(CLE_POS,JSON.stringify(p)); derniereMaj=Date.now(); await envoyer(p); }
        return p;
      }finally{ enCours=false; emettre(); }
    }
    function planifier(){
      clearInterval(timer);
      if(!consentement()) return;
      timer=setInterval(()=>{ if(!document.hidden) actualiser().catch(()=>{}); },PERIODE);
    }
    async function autoriser(){
      lsSet(CLE_OK,'1');
      try{ const p=await actualiser(); planifier(); if(!p) throw new Error('position indisponible'); return {ok:true,position:p}; }
      catch(e){ lsSet(CLE_OK,null); return {ok:false,raison:String(e&&e.message||e)}; }
    }
    async function arreter(){
      lsSet(CLE_OK,null); lsSet(CLE_POS,null); clearInterval(timer); timer=null;
      try{ if(typeof workerReady==='function'&&workerReady()&&store.get(KEY_WDEV)) await wfetch('/appareil/position',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({effacer:true})},10000); }catch(e){}
      emettre();
      return true;
    }

    /* ───── liste : cet appareil + ceux que le Worker connaît ───── */
    async function liste(){
      const out=[]; const moi=maPosition();
      let distants=[];
      try{
        if(typeof workerReady==='function'&&workerReady()&&store.get(KEY_WDEV)){
          const d=await wjson('/appareil/liste',10000);
          distants=(d.appareils||[]).filter(a=>!a.revoque);
        }
      }catch(e){}
      const vus=new Set();
      for(const a of distants){
        const pos=propre(a.position&&Object.assign({t:a.position.t||a.vu||0},a.position));
        const celuiCi=!!a.moi;
        out.push({nom:a.nom,genre:genre(a.nom),moi:celuiCi,ouvert:a.ouvert,vu:celuiCi?Date.now():(a.vu||a.dernier||0),position:celuiCi?(moi||pos):pos});
        vus.add(n2(a.nom));
      }
      if(!out.some(a=>a.moi)) out.unshift({nom:monNomAffiche(),genre:genre(monNomAffiche()),moi:true,ouvert:true,vu:Date.now(),position:moi});
      lsSet(CLE_LISTE,JSON.stringify(out.map(a=>({nom:a.nom,position:a.position,vu:a.vu}))));
      return out;
    }
    function reperes(l){ return (l||[]).filter(a=>a.position).map(a=>({nom:a.nom,lat:a.position.lat,lon:a.position.lon,prec:a.position.prec||0,t:a.position.t||0,genre:a.genre,moi:!!a.moi})); }

    let derniereListe=[];
    async function emettre(){
      try{ derniereListe=await liste(); RayleBus.emit('appareils:positions',{liste:derniereListe,reperes:reperes(derniereListe)}); majGlobe(derniereListe); }catch(e){}
    }
    // repères sur la Terre vivante (le fond Espace) : épingles cyan « 📱 Tablette »
    function majGlobe(l){
      try{
        const T=window.RayleUI&&RayleUI.espaceTerre; if(!T||!T.etat) return;
        T.etat.epingles=T.etat.epingles.filter(e=>!e.appareil);
        for(const r of reperes(l)){
          if(T.etat.epingles.length>=T.MAX_EPINGLES) break;
          T.etat.epingles.push({id:'a'+(++T.etat.compteur),nom:ICONES[r.genre]+' '+r.nom,lat:r.lat,lon:r.lon,couleur:'cyan',appareil:true});
        }
        const s=T.scene&&T.scene(); if(s&&s.majObjets) s.majObjets();
      }catch(e){}
    }

    /* ───── panneau « Appareils » ───── */
    const esc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function ligneHtml(a){
      const p=a.position;
      const lieu=p?lieuProche(p):'';
      return '<div class="pn-item"><h3>'+ICONES[a.genre]+' '+esc(a.nom)+(a.moi?' <small>(cet appareil)</small>':'')+'</h3>'
        +'<small>'+(p?esc((lieu?lieu+' · ':'')+coordTexte(p.lat,p.lon)+(p.prec?' · '+precisionTexte(p.prec):'')):'position non partagée')+'</small><br>'
        +'<small>dernière activité : '+esc(a.moi?'maintenant':ilYa(a.vu))+(a.ouvert===true&&!a.moi?' · ouvert':a.ouvert===false?' · fermé':'')+'</small></div>';
    }
    async function afficher(){
      const l=await liste(); derniereListe=l;
      const pied=[];
      if(!consentement()) pied.push({texte:'📍 Partager la position de cet appareil',clic:async()=>{ const r=await autoriser(); const m=r.ok?'Position de cet appareil partagée.':'Je n’ai pas pu la lire : '+r.raison+'.'; try{ addLine('sys',m); }catch(e){} afficher(); }});
      else pied.push({texte:'⏹ Arrêter le partage',clic:async()=>{ await arreter(); try{ addLine('sys','Partage de position arrêté et position effacée.'); }catch(e){} afficher(); }});
      if(reperes(l).length) pied.push({texte:'🌍 Voir sur le globe',clic:()=>voirSurGlobe()});
      try{ Panneaux.ouvrir({id:'appareils',type:'appareils',icone:'📍',titre:'Appareils',corps:{html:l.map(ligneHtml).join('')+'<small class="pn-vide">'+(consentement()?'Cet appareil partage sa position avec toi seul (navigateur et ton Worker).':'La position n’est lue qu’avec ta permission.')+'</small>'},pied,duree:120000}); }catch(e){}
      emettre();
      return l;
    }
    // ouvre l'Univers (js/univers) sur la Terre, centrée sur le premier appareil localisé ; les repères viennent de 'appareils:positions'
    function voirSurGlobe(){ try{ RayleBus.emit('univers:demande',{theme:'espace',cible:'appareils'}); }catch(e){} }

    /* ───── voix ───── */
    function analyser(texte){
      const t=n2(texte).replace(/^(?:hey |ok |dis )?rayle /,'');
      if(/^(?:arrete|stoppe|coupe|desactive|efface)\b.*\b(?:partage|localisation|geolocalisation|position)\b/.test(t)||/^(?:ne )?(?:partage|localise) plus\b/.test(t)) return {action:'arreter'};
      if(/\b(?:localise|geolocalise|trouve|partage)\b.*\b(?:cet appareil|ma position|tablette|telephone|pc|mon ordinateur|ou je suis)\b|\bactive\b.*\b(?:localisation|geolocalisation)\b/.test(t)) return {action:'autoriser'};
      if(/\bou (?:sont|est|se trouve|se trouvent)\b.*\b(?:appareils?|tablette|telephone|pc|ordinateur)\b|\b(?:localisation|position) (?:de |des )?(?:mes )?(?:appareils?|tablette|telephone|pc)\b|^(?:affiche|montre|ouvre) (?:moi )?(?:le panneau |la liste )?(?:des |mes |les )?appareils$/.test(t)) return {action:'afficher',appareil:(t.match(/\b(telephone|tablette|pc|ordinateur)\b/)||[])[1]||''};
      return null;
    }
    async function commande(texte){
      const a=analyser(texte); if(!a) return null;
      if(a.action==='autoriser'){ const r=await autoriser(); await afficher(); return r.ok?'C’est fait : cet appareil partage sa position. Je l’affiche dans le panneau Appareils.':'Je n’ai pas pu lire la position ('+r.raison+'). Autorise la localisation dans le navigateur, puis redemande-moi.'; }
      if(a.action==='arreter'){ await arreter(); return 'D’accord, j’ai arrêté le partage et effacé la position de cet appareil.'; }
      const l=await afficher();
      const avec=l.filter(x=>x.position);
      if(!avec.length) return 'Voici tes appareils, mais aucun ne partage sa position pour l’instant. Dis « localise cet appareil » pour activer le partage sur celui-ci.';
      // la Terre sert de carte : le globe descend vers l'appareil demandé (ou vers tous) pendant que la phrase est dite (js/rayle/terre-outils.js, earth.show_devices)
      try{ if(typeof RayleTerre!=='undefined') RayleTerre.executer('earth.show_devices',{device:a.appareil||''}).catch(()=>{}); }catch(e){}
      const voulu=a.appareil?avec.filter(x=>genre(x.nom)===(/telephone/.test(a.appareil)?'telephone':/tablette/.test(a.appareil)?'tablette':'pc')):[];
      const cible=voulu.length?voulu:avec;
      return 'Voici où '+(cible.length>1?'sont ':'est ')+cible.map(x=>x.nom+' ('+(lieuProche(x.position)||coordTexte(x.position.lat,x.position.lon))+')').join(', ')+'.';
    }

    if(consentement()) setTimeout(()=>{ actualiser().then(planifier).catch(()=>{}); },4000);
    try{ RayleBus.fournir('appareils:positions',()=>derniereListe); RayleBus.on('espace:pret',emettre); }catch(e){}

    return {consentement,autoriser,arreter,maPosition,liste,afficher,reperes,analyser,commande,distanceKm,coordTexte,ilYa,precisionTexte,propre,genre,n2,lieuProche};
  })();
  function commandeLocalisation(texte){ return RayleLocalisation.commande(texte); }
  // Réglages : boutons et ligne d'état
  (function(){
    const $$=id=>document.getElementById(id), info=$$('locInfo'); if(!info) return;
    const maj=()=>{
      const p=RayleLocalisation.maPosition();
      info.textContent=RayleLocalisation.consentement()
        ? 'Position partagée'+(p?' : '+RayleLocalisation.coordTexte(p.lat,p.lon)+' '+RayleLocalisation.precisionTexte(p.prec)+' · '+RayleLocalisation.ilYa(p.t):' (en attente de la première lecture)')+'. Elle reste sur cet appareil et sur ton Worker.'
        : 'Position : non partagée. Elle n’est lue qu’avec ta permission, reste sur cet appareil et sur ton Worker, et sert à placer tes appareils sur le globe.';
    };
    $$('cfgLocPartager').addEventListener('click',async()=>{ info.textContent='Demande d’autorisation au navigateur…'; const r=await RayleLocalisation.autoriser(); if(!r.ok) info.textContent='✖ '+r.raison+'. Autorise la localisation pour ce site dans le navigateur, puis réessaie.'; else maj(); });
    $$('cfgLocArreter').addEventListener('click',async()=>{ await RayleLocalisation.arreter(); maj(); });
    $$('cfgLocPanneau').addEventListener('click',()=>{ RayleLocalisation.afficher().then(maj); });
    $$('gear').addEventListener('click',maj);
    maj();
  })();
