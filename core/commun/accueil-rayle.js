"use strict";
/* ═════════════ ACCUEIL RAYLÉ : l'entité au centre, la vie autour ═════════════
   · fond profond : particules en trois plans + parallaxe (souris, inclinaison du téléphone) ; l'entité elle-même (apparence validée) ne change pas
   · météo et ville : navigator.geolocation → géocodage inverse → Open-Meteo ; repli sur la dernière ville mémorisée ; jamais de valeur inventée
   · « ce jour-là » : événements historiques du jour (Wikipédia, flux « on this day » en français)
   · 2 ou 3 actualités importantes de France, avec image (flux du média, sinon photo libre, sinon carte), lues depuis le Worker
   Chaque bloc dit honnêtement ce qui manque : « indisponible : <raison> ». Ne dessine rien quand l'accueil n'est pas à l'écran. */
(function(){
  const T=window.TableauBordContenu, corps=document.body;
  const CLE_VILLE='rayle_ville_derniere', CLE_GEO='rayle_geoloc';
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const lire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const ecrire=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
  const msg=e=>{ try{ return (window.errMsg?window.errMsg(e):String((e&&e.message)||e)).slice(0,110); }catch(x){ return 'erreur'; } };
  const aLEcran=()=>!document.hidden&&corps.classList.contains('app-accueil')&&!corps.classList.contains('vue-terminal')&&!corps.classList.contains('vue-galaxie');
  let racine=null, nMeteo=null, nJour=null, nActus=null;
  const etat={ville:null,meteo:null,jour:null,actus:null};

  /* ───── construction ───── */
  function construire(){
    racine=document.createElement('div'); racine.className='ar-racine'; racine.id='ar-racine';
    racine.innerHTML='<canvas class="ar-fond" aria-hidden="true"></canvas>'
      +'<aside class="ar-col ar-g"><article class="ar-fen ar-meteo" aria-label="Météo"><header><span>Météo</span><button type="button" class="ar-btn" data-a="position" title="Utiliser ma position">⌖</button></header><div class="ar-corps" data-z="meteo"><p class="ar-vide">Recherche de ta position…</p></div></article>'
      +'<article class="ar-fen ar-jour" aria-label="Ce jour-là"><header><span>Ce jour-là</span></header><div class="ar-corps" data-z="jour"><p class="ar-vide">Chargement…</p></div></article></aside>'
      +'<aside class="ar-col ar-d"><article class="ar-fen ar-actus" aria-label="L’actualité en France"><header><span>À la une · France</span><button type="button" class="ar-btn" data-a="actus" title="Toute l’actualité">↗</button></header><div class="ar-corps" data-z="actus"><p class="ar-vide">Chargement…</p></div></article></aside>';
    document.body.appendChild(racine);
    nMeteo=racine.querySelector('[data-z=meteo]'); nJour=racine.querySelector('[data-z=jour]'); nActus=racine.querySelector('[data-z=actus]');
    racine.addEventListener('click',e=>{
      const b=e.target.closest('[data-a]'); if(!b) return;
      if(b.dataset.a==='position') demanderPosition(true);
      else if(b.dataset.a==='actus'&&window.Application) Application.ouvrir('terre');
      else if(b.dataset.a==='ville') choisirVille();
    });
  }

  /* ───── météo et ville ───── */
  const ICONES={soleil:'☀',eclaircies:'🌤',nuageux:'☁',brouillard:'🌫',bruine:'🌦',pluie:'🌧',neige:'❄',orage:'⛈'};
  function dessinerMeteo(){
    const m=etat.meteo, v=etat.ville;
    if(!v){ nMeteo.innerHTML='<p class="ar-vide">Position inconnue. <button type="button" class="ar-lien" data-a="position">Autoriser la position</button> ou <button type="button" class="ar-lien" data-a="ville">choisir une ville</button>.</p>'; return; }
    if(!m){ nMeteo.innerHTML='<p class="ar-ville">'+esc(v.nom)+'</p><p class="ar-vide">Chargement…</p>'; return; }
    if(m.etat!=='ok'){ nMeteo.innerHTML='<p class="ar-ville">'+esc(v.nom)+'</p><p class="ar-vide ar-ko">INDISPONIBLE : '+esc(m.raison||'météo')+'</p>'; return; }
    nMeteo.innerHTML='<p class="ar-ville"><button type="button" class="ar-lien" data-a="ville" title="Changer de ville">'+esc(v.nom)+'</button></p>'
      +'<div class="ar-temp"><span class="ar-ico">'+(ICONES[m.categorie]||'☁')+'</span><b>'+Math.round(m.temp)+'°</b><small>'+esc(m.libelle)+(m.ressenti!=null?' · ressenti '+Math.round(m.ressenti)+'°':'')+'</small></div>'
      +'<ul class="ar-jours">'+m.jours.map(j=>'<li><span>'+esc(j.jour)+'</span><i>'+(ICONES[j.categorie]||'')+'</i><b>'+Math.round(j.max)+'°</b><small>'+Math.round(j.min)+'°</small></li>').join('')+'</ul>';
  }
  async function nomDeLieu(lat,lon){
    try{
      const r=await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude='+lat+'&longitude='+lon+'&localityLanguage=fr',{cache:'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status); const j=await r.json();
      const n=j.city||j.locality||j.principalSubdivision||''; if(n) return n+(j.countryCode&&j.countryCode!=='FR'&&j.countryName?', '+j.countryName:'');
    }catch(e){ /* repli ci-dessous */ }
    return 'Ma position';
  }
  async function chargerMeteo(){
    const v=etat.ville; if(!v){ dessinerMeteo(); return; }
    try{
      const r=await fetch(T.urlMeteo(v.lat,v.lon),{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status);
      etat.meteo=T.resumeMeteo(await r.json(),v.nom);
    }catch(e){ etat.meteo={etat:'indisponible',raison:'Open-Meteo : '+msg(e)}; }
    dessinerMeteo();
  }
  function poserVille(nom,lat,lon,sauver=true){
    etat.ville={nom,lat,lon}; etat.meteo=null; if(sauver) ecrire(CLE_VILLE,JSON.stringify(etat.ville)); dessinerMeteo(); chargerMeteo();
  }
  function demanderPosition(manuel){
    if(!navigator.geolocation){ if(manuel) nMeteo.insertAdjacentHTML('beforeend','<p class="ar-vide ar-ko">La position n’est pas disponible sur cet appareil.</p>'); return; }
    navigator.geolocation.getCurrentPosition(async p=>{
      ecrire(CLE_GEO,'oui'); const nom=await nomDeLieu(p.coords.latitude,p.coords.longitude); poserVille(nom,+p.coords.latitude.toFixed(3),+p.coords.longitude.toFixed(3));
    },e=>{
      ecrire(CLE_GEO,e&&e.code===1?'refuse':'erreur');
      if(!etat.ville){ dessinerMeteo(); if(manuel||(e&&e.code===1)) nMeteo.insertAdjacentHTML('beforeend','<p class="ar-vide ar-ko">'+(e&&e.code===1?'Position refusée.':'Position indisponible.')+'</p>'); }
    },{timeout:10000,maximumAge:600000,enableHighAccuracy:false});
  }
  async function choisirVille(){
    const q=window.prompt('Ville pour la météo :',etat.ville?etat.ville.nom:''); if(!q||!q.trim()) return;
    try{
      const r=await fetch(T.urlGeocodage(q.trim()),{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status);
      const res=T.resultatsGeocodage(await r.json()); if(!res.length){ nMeteo.insertAdjacentHTML('beforeend','<p class="ar-vide ar-ko">Ville introuvable.</p>'); return; }
      poserVille(res[0].nom.split(',')[0],res[0].lat,res[0].lon);
    }catch(e){ nMeteo.insertAdjacentHTML('beforeend','<p class="ar-vide ar-ko">INDISPONIBLE : '+esc(msg(e))+'</p>'); }
  }
  function demarrerVille(){
    let derniere=null; try{ derniere=JSON.parse(lire(CLE_VILLE)||'null'); }catch(e){}
    if(derniere&&Number.isFinite(derniere.lat)&&Number.isFinite(derniere.lon)) poserVille(derniere.nom,derniere.lat,derniere.lon,false);   // affichage immédiat, puis la position réelle corrige
    const refus=lire(CLE_GEO)==='refuse';
    if(!refus) demanderPosition(false); else dessinerMeteo();
  }

  /* ───── ce jour-là ───── */
  function dessinerJour(){
    const j=etat.jour; if(!j){ return; }
    if(j.erreur){ nJour.innerHTML='<p class="ar-vide ar-ko">INDISPONIBLE : '+esc(j.erreur)+'</p>'; return; }
    nJour.innerHTML='<ul class="ar-liste">'+j.liste.map(e=>'<li><b>'+esc(e.annee)+'</b><span>'+esc(e.texte)+'</span></li>').join('')+'</ul><small class="ar-src">Source : Wikipédia (ce jour-là)</small>';
  }
  const coupe=(t,n)=>t.length<=n?t:t.slice(0,n).replace(/s+S*$/,'')+'…';
  async function chargerJour(){
    const d=new Date(), mm=String(d.getMonth()+1).padStart(2,'0'), jj=String(d.getDate()).padStart(2,'0'), cle='rayle_jour_'+mm+jj;
    try{ const c=JSON.parse(lire(cle)||'null'); if(c&&c.liste&&c.liste.length){ etat.jour=c; dessinerJour(); return; } }catch(e){}
    try{
      const r=await fetch('https://api.wikimedia.org/feed/v1/wikipedia/fr/onthisday/events/'+mm+'/'+jj,{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status);
      const j=await r.json(), ev=(j.events||[]).filter(e=>e&&e.text&&Number.isFinite(e.year)).sort((a,b)=>b.year-a.year);
      // les plus récents d'abord, mais pas uniquement : un mélange lisible de trois événements
      const choisis=[]; const pas=Math.max(1,Math.floor(ev.length/3)); for(let i=0;i<ev.length&&choisis.length<3;i+=pas) choisis.push(ev[i]);
      etat.jour={liste:choisis.map(e=>({annee:e.year,texte:coupe(String(e.text).replace(/\s+/g,' '),130)}))};
      if(!etat.jour.liste.length) throw new Error('aucun événement pour ce jour');
      ecrire(cle,JSON.stringify(etat.jour));
    }catch(e){ etat.jour={erreur:'Wikipédia : '+msg(e)}; }
    dessinerJour();
  }

  /* ───── actualités de France ───── */
  let modActus=null;
  const chargerMods=()=>modActus||(modActus=Promise.all([import(new URL('planetes/terre/pc/fil-actus.js',document.baseURI).href),import(new URL('planetes/terre/pc/actus-sujets.js',document.baseURI).href)]).then(([fil,suj])=>({fil,suj})).catch(e=>{ modActus=null; throw e; }));
  function dessinerActus(){
    const a=etat.actus; if(!a) return;
    if(a.erreur){ nActus.innerHTML='<p class="ar-vide ar-ko">INDISPONIBLE : '+esc(a.erreur)+'</p>'; return; }
    nActus.innerHTML=a.sujets.map((s,i)=>'<a class="ar-actu" href="'+esc(s.url||'#')+'" target="_blank" rel="noopener noreferrer" data-i="'+i+'"><span class="ar-img" data-img="'+i+'"></span><div><b>'+esc(s.titre)+'</b><small>'+esc(s.source)+(s.quand?' · '+esc(s.quand):'')+'</small></div></a>').join('');
    if(window.ImagesActus) a.sujets.forEach((s,i)=>{ const c=nActus.querySelector('[data-img="'+i+'"]'); if(c) try{ ImagesActus.attacher(c,s,{largeur:120,hauteur:80}); }catch(e){} });
  }
  async function chargerActus(){
    try{
      const {fil,suj}=await chargerMods(); const brut=await fil.chargerFil('france','',{}); const m=suj.modelesFil(brut,{max:12});
      const tri=m.sujets.filter(s=>s.titre).slice().sort((a,b)=>(b.importance||0)-(a.importance||0));
      const avecImage=tri.filter(s=>s.image||(s.sources||[]).some(x=>x.image));
      const choix=[]; for(const s of avecImage.concat(tri)){ if(choix.length>=3) break; if(!choix.includes(s)) choix.push(s); }
      etat.actus=choix.length?{sujets:choix,perime:!!m.perime}:{erreur:'aucun sujet pour le moment'};
    }catch(e){ etat.actus={erreur:msg(e)}; }
    dessinerActus();
  }

  /* ───── fond profond : particules en trois plans + parallaxe ───── */
  function fond(){
    const cv=racine.querySelector('.ar-fond'), cx=cv.getContext('2d'); if(!cx) return;
    const reduit=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const petit=Math.min(screen.width,screen.height)<700, N=reduit?0:(petit?46:90), P=[];
    for(let i=0;i<N;i++){ const z=Math.random(); P.push({x:Math.random(),y:Math.random(),z,vx:(Math.random()-.5)*.004*(.4+z),vy:-(.002+Math.random()*.004)*(.4+z),r:.5+z*1.6,ph:Math.random()*6.28}); }
    let w=0,h=0,dpr=1,px=0,py=0,cibleX=0,cibleY=0,dernier=0,vivant=true;
    const taille=()=>{ dpr=Math.min(window.devicePixelRatio||1,petit?1.5:2); w=innerWidth; h=innerHeight; cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr); cv.style.width=w+'px'; cv.style.height=h+'px'; };
    taille(); window.addEventListener('resize',taille);
    window.addEventListener('pointermove',e=>{ if(e.pointerType==='touch') return; cibleX=(e.clientX/innerWidth-.5)*2; cibleY=(e.clientY/innerHeight-.5)*2; },{passive:true});
    window.addEventListener('deviceorientation',e=>{ if(e.gamma==null) return; cibleX=Math.max(-1,Math.min(1,e.gamma/30)); cibleY=Math.max(-1,Math.min(1,((e.beta||0)-45)/30)); },{passive:true});
    const scene=document.getElementById('scene');
    function image(t){
      requestAnimationFrame(image);
      if(!aLEcran()){ if(vivant){ cx.clearRect(0,0,cv.width,cv.height); vivant=false; } return; }
      vivant=true; if(t-dernier<(petit?33:16)) return; const dt=Math.min(.1,(t-dernier)/1000||.016); dernier=t;
      px+=(cibleX-px)*.06; py+=(cibleY-py)*.06;
      cx.setTransform(dpr,0,0,dpr,0,0); cx.clearRect(0,0,w,h);
      for(const p of P){
        p.x+=p.vx*dt*60; p.y+=p.vy*dt*60; if(p.y<-.02){ p.y=1.02; p.x=Math.random(); } if(p.x<-.02)p.x=1.02; else if(p.x>1.02)p.x=-.02;
        const a=(.25+.55*(.5+.5*Math.sin(t/900+p.ph)))*(.35+p.z*.65);
        cx.fillStyle='rgba(143,208,227,'+a.toFixed(3)+')'; cx.beginPath(); cx.arc(p.x*w+px*p.z*38,p.y*h+py*p.z*26,p.r,0,6.283); cx.fill();
      }
      if(scene){ scene.style.setProperty('--ar-px',(px*-10).toFixed(1)+'px'); scene.style.setProperty('--ar-py',(py*-7).toFixed(1)+'px'); }
    }
    requestAnimationFrame(image);
  }

  /* ───── cycle de vie ───── */
  function demarrer(){
    if(!T){ console.warn('[accueil] TableauBordContenu absent'); return; }
    construire(); fond(); demarrerVille(); chargerJour(); chargerActus();
    setInterval(()=>{ if(aLEcran()){ chargerMeteo(); } },10*60*1000);
    setInterval(()=>{ if(aLEcran()){ chargerActus(); } },10*60*1000);
    window.AccueilRayle={etat:()=>JSON.parse(JSON.stringify(etat)),recharger:()=>{ chargerMeteo(); chargerJour(); chargerActus(); },poserVille};
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',demarrer); else demarrer();
})();
