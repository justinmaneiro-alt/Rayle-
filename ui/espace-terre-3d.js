"use strict";
/* ═════════════ TERRE VIVANTE : objets 3D, panneau et rotation à la main (monté par ui/fond-espace.js) ═════════════
   UI.espaceTerre3D.monter(X) → contrôleur { maj(dt), majCouches(), majObjets(), qualite(q, ultra), rayon(), liberer() }
   X : { THREE, terre, scene, camera, rendu, q, ultra, sunDir(), rayonPx(), mode() }
   Tout est posé dans le groupe « terre » (il tourne avec elle). La logique (positions, état, phrases) est dans ui/espace-terre.js. */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  const VS_TRAFIC=`
attribute float a_a; uniform float u_px, u_taille; uniform vec3 u_sun; varying float v_a; varying float v_jour;
void main(){
  vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv;
  vec3 w=normalize(mat3(modelMatrix)*position); v_jour=smoothstep(-0.18,0.28,dot(w,u_sun)); v_a=a_a;
  gl_PointSize=clamp(u_px*u_taille*(5.6/max(-mv.z,0.4)),1.5*u_px,10.0*u_px);
}`;
  const FS_TRAFIC=`
uniform vec3 u_c; varying float v_a; varying float v_jour;
void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.05,d); a*=a; float k=v_a*(0.62+0.38*v_jour); gl_FragColor=vec4(u_c*(1.0+0.8*a)*a*k,a*k); }`;
  const VS_TRACE=`
varying float v_t; void main(){ v_t=uv.x; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const FS_TRACE=`
uniform vec3 u_c; uniform float u_temps, u_base; varying float v_t;
void main(){ float p=fract(u_temps*0.16); float d=v_t-p; d=d-floor(d+0.5); float imp=exp(-d*d*700.0); float a=u_base+imp*0.7; a*=smoothstep(0.0,0.03,v_t)*smoothstep(1.0,0.97,v_t); gl_FragColor=vec4(mix(u_c,vec3(1.0),imp*0.5)*a*1.6,a); }`;
  const FS_RUBAN=`uniform vec3 u_c; uniform float u_a; void main(){ gl_FragColor=vec4(u_c*u_a*1.3,u_a); }`;

  function monter(X){
    const {THREE,terre,scene,camera}=X, T=UI.espaceTerre, DN=T.dir, ES=T.etat;
    const objets=new THREE.Group(); objets.name='terre-vivante'; terre.add(objets);
    const geos=[], mats=[], tex=[];
    const temps={value:0}, sunU={value:new THREE.Vector3(1,0,0)};
    let q=X.q|0, ultra=!!X.ultra, nAv=0, nNav=0, derHud=0, dernierRebuild=-1;
    const V3=(a,k)=>new THREE.Vector3(a[0]*(k||1),a[1]*(k||1),a[2]*(k||1));

    /* ───── trafic : deux nuages de points mis à jour à chaque image ───── */
    function nuage(n,couleur,taille){
      const g=new THREE.BufferGeometry(), pos=new Float32Array(n*3), al=new Float32Array(n).fill(1);
      g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('a_a',new THREE.BufferAttribute(al,1)); g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),2);
      const m=new THREE.ShaderMaterial({uniforms:{u_px:{value:1},u_taille:{value:taille},u_sun:sunU,u_c:{value:new THREE.Color(couleur)}},vertexShader:VS_TRAFIC,fragmentShader:FS_TRAFIC,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
      const p=new THREE.Points(g,m); p.frustumCulled=false; p.renderOrder=4; geos.push(g); mats.push(m); objets.add(p); return {p,g,m,pos,al,n};
    }
    let avions=null, navires=null, listeAv=[], listeNav=[];
    function effectifs(){ const plein=q===0; return {av:q>=2?0:plein?(ultra?900:420):140, nav:q>=2?0:plein?(ultra?360:160):60}; }
    function construireTrafic(){
      const e=effectifs();
      if(avions){ objets.remove(avions.p); avions.g.dispose(); avions.m.dispose(); avions=null; } if(navires){ objets.remove(navires.p); navires.g.dispose(); navires.m.dispose(); navires=null; }
      nAv=e.av; nNav=e.nav; listeAv=T.creerAvions(nAv,77); listeNav=T.creerNavires(nNav,91);
      if(nAv) avions=nuage(nAv,0xbfeaff,1.9); if(nNav) navires=nuage(nNav,0xffc35a,1.7);
      majCouches();
    }
    function majTrafic(Tms){
      const mode=(X.mode&&X.mode())||'pedagogique';
      if(avions&&avions.p.visible){
        for(let i=0;i<nAv;i++){ const a=T.positionAvion(listeAv[i],Tms,mode); avions.pos[3*i]=a.v[0]*a.alt; avions.pos[3*i+1]=a.v[1]*a.alt; avions.pos[3*i+2]=a.v[2]*a.alt; avions.al[i]=.55+.45*Math.sin(Math.PI*a.t); }
        avions.g.attributes.position.needsUpdate=true; avions.g.attributes.a_a.needsUpdate=true;
      }
      if(navires&&navires.p.visible){
        for(let i=0;i<nNav;i++){ const a=T.positionNavire(listeNav[i],Tms,mode); navires.pos[3*i]=a.v[0]*a.alt; navires.pos[3*i+1]=a.v[1]*a.alt; navires.pos[3*i+2]=a.v[2]*a.alt; }
        navires.g.attributes.position.needsUpdate=true;
      }
    }
    function majCouches(){
      if(avions) avions.p.visible=!!ES.couches.vols&&q<2; if(navires) navires.p.visible=!!ES.couches.bateaux&&q<2;
      pins.visible=!!ES.couches.epingles; if(X.villes) X.villes(!!ES.couches.villes);
      if(ES.reelVols) essayerVolsReels();
      majBadge();
    }

    /* ───── épingles (avec étiquette), trajets, frontières ───── */
    const pins=new THREE.Group(), traces=new THREE.Group(); objets.add(pins,traces);
    const objetsPar=new Map();
    function etiquette(nom,couleur){
      const cv=document.createElement('canvas'), c=cv.getContext('2d'), px=34; c.font='600 '+px+'px sans-serif'; const w=Math.ceil(c.measureText(nom).width)+36;
      cv.width=w; cv.height=px+22; c.font='600 '+px+'px sans-serif'; c.fillStyle='rgba(6,4,14,.78)'; c.fillRect(0,0,cv.width,cv.height); c.strokeStyle='#'+couleur.toString(16).padStart(6,'0'); c.lineWidth=3; c.strokeRect(1.5,1.5,cv.width-3,cv.height-3);
      c.fillStyle='#fff'; c.textBaseline='middle'; c.fillText(nom,18,cv.height/2+2);
      const t=new THREE.CanvasTexture(cv); t.anisotropy=2; tex.push(t); return {t,ratio:cv.width/cv.height};
    }
    function construireEpingle(e){
      const col=T.COULEURS[e.couleur]||T.COULEURS.rouge, g=new THREE.Group(), m=new THREE.MeshBasicMaterial({color:col}), ring=new THREE.MeshBasicMaterial({color:0x7be7ff,transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false});
      const geoT=new THREE.SphereGeometry(.011,12,8), geoP=new THREE.ConeGeometry(.0085,.05,10), geoR=new THREE.RingGeometry(.85,1,40); geos.push(geoT,geoP,geoR); mats.push(m,ring);
      const tete=new THREE.Mesh(geoT,m); tete.position.y=.058; const pointe=new THREE.Mesh(geoP,m); pointe.position.y=.027; pointe.rotation.x=Math.PI; const an=new THREE.Mesh(geoR,ring); an.rotation.x=-Math.PI/2; an.position.y=.002; g.add(tete,pointe,an);
      const et=etiquette(e.nom,col), sp=new THREE.Sprite(new THREE.SpriteMaterial({map:et.t,transparent:true,depthTest:true,depthWrite:false})); sp.scale.set(.05*et.ratio,.05,1); sp.position.y=.105; mats.push(sp.material); g.add(sp);
      const p=DN(e.lat,e.lon,1.0); g.position.set(p[0],p[1],p[2]); g.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(p[0],p[1],p[2]).normalize()); g.userData={anneau:an,ring,t0:Math.random()*2,sprite:sp,ratio:et.ratio};
      return g;
    }
    function ruban(pts,w){
      const n=pts.length, pos=new Float32Array(n*6), uv=new Float32Array(n*4), idx=[];
      for(let i=0;i<n;i++){
        const p=pts[i], a=pts[Math.max(0,i-1)], b=pts[Math.min(n-1,i+1)], tg=new THREE.Vector3().subVectors(b,a).normalize(), s=new THREE.Vector3().crossVectors(tg,p).normalize().multiplyScalar(w);
        pos.set([p.x+s.x,p.y+s.y,p.z+s.z,p.x-s.x,p.y-s.y,p.z-s.z],i*6); uv.set([i/(n-1),0,i/(n-1),1],i*4);
        if(i<n-1){ const k=i*2; idx.push(k,k+1,k+2,k+1,k+3,k+2); }
      }
      const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('uv',new THREE.BufferAttribute(uv,2)); g.setIndex(idx); geos.push(g); return g;
    }
    function construireTrajet(t){
      const A=DN(t.a.lat,t.a.lon), B=DN(t.b.lat,t.b.lon), om=Math.acos(Math.max(-1,Math.min(1,A[0]*B[0]+A[1]*B[1]+A[2]*B[2]))), N=Math.max(24,Math.min(200,Math.ceil(om*60))), pts=[], h=.04+.2*om/Math.PI;
      for(let i=0;i<=N;i++){ const f=i/N, p=T.gc(A,B,f,om), r=1.006+h*Math.sin(Math.PI*f); pts.push(new THREE.Vector3(p[0]*r,p[1]*r,p[2]*r)); }
      const m=new THREE.ShaderMaterial({uniforms:{u_c:{value:new THREE.Color(0x7be7ff)},u_temps:temps,u_base:{value:.5}},vertexShader:VS_TRACE,fragmentShader:FS_TRACE,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}); mats.push(m);
      const mesh=new THREE.Mesh(ruban(pts,.0042),m); mesh.renderOrder=5; return mesh;
    }
    /* contours des pays : world-atlas 1:110m (js/vendor/world-110m.json, ISC) lus une fois, à la demande */
    let promesseTopo=null;
    function contours(){
      if(!promesseTopo) promesseTopo=(async()=>{
        if(!window.topojson) await new Promise((ok,ko)=>{ const s=document.createElement('script'); s.src=new URL('js/vendor/topojson-client.min.js',document.baseURI).href; s.onload=ok; s.onerror=()=>ko(new Error('topojson')); document.head.appendChild(s); });
        const topo=await (await fetch(new URL('js/vendor/world-110m.json',document.baseURI).href)).json();
        return {topo,features:window.topojson.feature(topo,topo.objects.countries).features};
      })().catch(e=>{ promesseTopo=null; throw e; });
      return promesseTopo;
    }
    async function construireFrontieres(t,groupe){
      let c; try{ c=await contours(); }catch(e){ console.warn('[terre] contours indisponibles',e&&e.message); return; }
      const f=c.features.find(x=>String(x.id).padStart(3,'0')===t.num); if(!f||!groupe.parent) return;
      const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
      const m=new THREE.ShaderMaterial({uniforms:{u_c:{value:new THREE.Color(0xffc86b)},u_a:{value:.85}},vertexShader:VS_TRACE,fragmentShader:FS_RUBAN,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}); mats.push(m);
      for(const p of polys) for(const ring of p.slice(0,1)){
        const pts=[]; for(let i=0;i<ring.length-1;i++){ const a=DN(ring[i][1],ring[i][0]), b=DN(ring[i+1][1],ring[i+1][0]), om=Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2]))), n=Math.max(1,Math.ceil(om/.02)); for(let k=0;k<n;k++){ const g=T.gc(a,b,k/n,om); pts.push(new THREE.Vector3(g[0]*1.0035,g[1]*1.0035,g[2]*1.0035)); } }
        if(pts.length<2) continue; const mesh=new THREE.Mesh(ruban(pts,.0024),m); mesh.renderOrder=5; groupe.add(mesh);
      }
    }
    function majObjets(){
      // épingles
      const vusP=new Set(ES.epingles.map(e=>e.id));
      for(const [id,o] of objetsPar) if(!vusP.has(id)&&!ES.traces.some(t=>t.id===id)){ (o.parent||pins).remove(o); objetsPar.delete(id); }
      for(const e of ES.epingles) if(!objetsPar.has(e.id)){ const g=construireEpingle(e); pins.add(g); objetsPar.set(e.id,g); }
      for(const id of [...objetsPar.keys()]) if(/^t/.test(id)&&!ES.traces.some(t=>t.id===id)){ const o=objetsPar.get(id); traces.remove(o); objetsPar.delete(id); }
      for(const t of ES.traces) if(!objetsPar.has(t.id)){
        if(t.type==='trajet'){ const o=construireTrajet(t); traces.add(o); objetsPar.set(t.id,o); }
        else if(t.type==='frontieres'){ const g=new THREE.Group(); traces.add(g); objetsPar.set(t.id,g); construireFrontieres(t,g); }
      }
      majBadge();
    }

    /* ───── vols réels (optionnel) : route /vols du Worker (OpenSky Network, anonyme). Sans elle, le trafic reste simulé et l'écran le dit. ───── */
    let reelEnCours=false;
    async function essayerVolsReels(){
      if(reelEnCours||!ES.reelVols) return; reelEnCours=true;
      try{
        const wj=window.wjson; if(typeof wj!=='function') throw new Error('Worker non relié');
        const d=await wj('/vols',15000); if(!d||!Array.isArray(d.avions)||!d.avions.length) throw new Error('réponse vide');
        ES.reelEtat='temps réel'; ES.reelAvions=d.avions.slice(0,1500); ES.reelT=Date.now();
      }catch(e){ ES.reelEtat='simulé'; ES.reelVols=false; ES.reelRaison=String(e&&e.message||e).slice(0,80); }
      reelEnCours=false; majBadge();
    }
    function appliquerReel(){
      if(!ES.reelVols||ES.reelEtat!=='temps réel'||!ES.reelAvions||!avions) return false;
      const n=Math.min(nAv,ES.reelAvions.length); for(let i=0;i<nAv;i++){ if(i<n){ const [lat,lon,alt]=ES.reelAvions[i], p=DN(lat,lon,1.004+Math.min(.012,(alt||0)/9e5)); avions.pos[3*i]=p[0]; avions.pos[3*i+1]=p[1]; avions.pos[3*i+2]=p[2]; avions.al[i]=1; } else avions.al[i]=0; }
      avions.g.attributes.position.needsUpdate=true; avions.g.attributes.a_a.needsUpdate=true; return true;
    }

    /* ───── badge permanent et panneau « Terre vivante » ───── */
    let badge=null, bouton=null, pop=null, voile=null, refs={};
    function textes(){
      const H=UI.horloge&&UI.horloge.etat(), vols=ES.couches.vols&&q<2, nav=ES.couches.bateaux&&q<2;
      const reel=ES.reelVols&&ES.reelEtat==='temps réel';
      return {heure:H?H.texte:'',tempsNom:H?H.nom:'',trafic:(vols||nav)?(vols?(reel?'vols : temps réel (OpenSky)':'vols : simulés'):'')+(vols&&nav?' · ':'')+(nav?'bateaux : simulés':''):''};
    }
    function majBadge(){ if(!badge) return; const t=textes(); const H=UI.horloge&&UI.horloge.etat(); badge.textContent=(t.trafic?'Trafic '+t.trafic:'')+(H&&!H.reel?(t.trafic?' · ':'')+'heure '+t.tempsNom+' ('+t.heure+')':''); badge.hidden=!badge.textContent; majPanneau(); }
    function majPanneau(){
      if(!pop||pop.hidden) return; const t=textes(), H=UI.horloge&&UI.horloge.etat();
      refs.heure.textContent=t.heure+(H&&H.reel?' · temps réel':' · '+t.tempsNom);
      refs.vitesses.forEach(b=>b.setAttribute('aria-pressed',String(!!H&&!H.pause&&H.echelle===+b.dataset.k))); refs.pause.setAttribute('aria-pressed',String(!!H&&H.pause));
      refs.main.setAttribute('aria-pressed',String(!!UI.terreMain&&UI.terreMain.actif()));
      for(const [k,b] of Object.entries(refs.couches)) b.setAttribute('aria-pressed',String(!!ES.couches[k]));
      refs.etat.textContent=(ES.couches.vols||ES.couches.bateaux?'Trafic : '+(t.trafic||'masqué')+'. Les vitesses sont accélérées pour être visibles.':'Trafic masqué.')+(ES.reelRaison&&!ES.reelVols?' Vols réels indisponibles ('+ES.reelRaison+').':'')+' '+ES.epingles.length+' point(s), '+ES.traces.length+' tracé(s).';
    }
    function monterInterface(){
      const sc=document.getElementById('scene'); if(!sc||document.getElementById('terreBouton')) return;
      badge=document.createElement('div'); badge.className='tv-badge'; badge.setAttribute('aria-live','polite'); badge.hidden=true; document.body.appendChild(badge);
      bouton=document.createElement('button'); bouton.type='button'; bouton.id='terreBouton'; bouton.className='ui-bouton ui-terre'; bouton.title='Terre vivante : temps, rotation, trafic, points'; bouton.setAttribute('aria-label','Terre vivante'); bouton.setAttribute('aria-expanded','false'); bouton.textContent='🌍'; sc.appendChild(bouton);
      pop=document.createElement('div'); pop.id='terrePop'; pop.className='ui-pop hud-cadre tv-pop'; pop.hidden=true; pop.setAttribute('role','dialog'); pop.setAttribute('aria-label','Terre vivante');
      pop.innerHTML='<header class="pn-tete"><span class="pn-ico">🌍</span><h2>Terre vivante</h2><button type="button" class="pn-x" aria-label="Fermer">✕</button></header>';
      const corps=document.createElement('div'); corps.className='ui-pop-corps tv-corps';
      const el=(tag,cls,txt)=>{ const e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; };
      refs.heure=el('div','tv-heure'); corps.append(el('div','ui-lbl','Heure du globe'),refs.heure);
      const presets=UI.horloge?UI.horloge.presets():[]; const seg=el('div','tv-chips'); refs.vitesses=presets.map(p=>{ const b=el('button','tv-chip',p.court); b.type='button'; b.dataset.k=p.k; b.title=p.nom; b.addEventListener('click',()=>{ UI.horloge.regler(p.k); majPanneau(); majBadge(); }); seg.append(b); return b; });
      refs.pause=el('button','tv-chip','⏸'); refs.pause.type='button'; refs.pause.title='Figer ou relancer le temps'; refs.pause.addEventListener('click',()=>{ UI.horloge.pause(); majPanneau(); majBadge(); }); seg.append(refs.pause);
      const reel=el('button','tv-chip','⟲ réel'); reel.type='button'; reel.title='Revenir à l’heure réelle'; reel.addEventListener('click',()=>{ UI.horloge.retourReel(); majPanneau(); majBadge(); }); seg.append(reel);
      corps.append(el('div','ui-lbl','Vitesse du temps'),seg);
      refs.main=el('button','tv-chip tv-large','✋ Faire tourner la Terre à la main'); refs.main.type='button'; refs.main.addEventListener('click',()=>{ UI.terreMain.activer(); basculerVoile(); majPanneau(); if(UI.terreMain.actif()) pop.hidden=true; });
      const zero=el('button','tv-chip','↺ Orientation réelle'); zero.type='button'; zero.addEventListener('click',()=>UI.terreMain.zero());
      corps.append(el('div','ui-lbl','Rotation'),refs.main,zero);
      const cal=el('div','tv-chips'); refs.couches={};
      for(const [k,nom] of [['villes','Villes la nuit'],['vols','Vols (simulés)'],['bateaux','Bateaux (simulés)'],['epingles','Points']]){ const b=el('button','tv-chip',nom); b.type='button'; b.addEventListener('click',()=>{ ES.couches[k]=!ES.couches[k]; majCouches(); majPanneau(); }); refs.couches[k]=b; cal.append(b); }
      corps.append(el('div','ui-lbl','Couches'),cal);
      const eff=el('button','tv-chip','Effacer points et tracés'); eff.type='button'; eff.addEventListener('click',()=>{ T.effacer('tout'); majObjets(); majPanneau(); }); corps.append(eff);
      refs.etat=el('p','tv-info'); corps.append(refs.etat,el('p','tv-info','Dis aussi : « place un point à Tokyo », « trace un trajet de Paris à Tokyo », « accélère le temps », « efface les points ».'));
      pop.append(corps); document.body.appendChild(pop);
      const ouvrir=oui=>{ pop.hidden=!oui; bouton.setAttribute('aria-expanded',String(oui)); if(oui){ majPanneau(); pop.classList.remove('hud-in'); void pop.offsetWidth; pop.classList.add('hud-in'); } };
      bouton.addEventListener('click',e=>{ e.stopPropagation(); ouvrir(pop.hidden); }); pop.querySelector('.pn-x').addEventListener('click',()=>ouvrir(false));
      document.addEventListener('pointerdown',surDoc=e=>{ if(!pop.hidden&&!pop.contains(e.target)&&e.target!==bouton) ouvrir(false); }); document.addEventListener('keydown',surTouche=e=>{ if(e.key==='Escape'&&!pop.hidden) ouvrir(false); });
      // voile de rotation à la main : capte le glissement (un doigt) tant que le mode est actif
      voile=el('div','tv-main'); voile.hidden=true; voile.innerHTML='<div class="tv-main-bandeau"><span>✋ Glisse pour faire tourner la Terre</span><button type="button" class="tv-chip">Terminer</button></div>';
      voile.querySelector('button').addEventListener('click',()=>{ UI.terreMain.activer(false); basculerVoile(); majPanneau(); }); document.body.appendChild(voile);
      let dernierX=null, id=null;
      voile.addEventListener('pointerdown',e=>{ if(e.target.closest('button')) return; id=e.pointerId; dernierX=e.clientX; try{ voile.setPointerCapture(id); }catch(err){} UI.terreMain.lancer(0); });
      voile.addEventListener('pointermove',e=>{ if(e.pointerId!==id||dernierX==null) return; const r=Math.max(120,X.rayonPx?X.rayonPx():300); UI.terreMain.glisser((e.clientX-dernierX)/r); dernierX=e.clientX; });
      const fin=e=>{ if(e.pointerId===id){ id=null; dernierX=null; } }; voile.addEventListener('pointerup',fin); voile.addEventListener('pointercancel',fin);
      majPanneau(); majBadge();
    }
    let surDoc=null, surTouche=null;
    function basculerVoile(){ if(voile) voile.hidden=!(UI.terreMain&&UI.terreMain.actif()); }
    try{ monterInterface(); }catch(e){ console.warn('[terre] interface',e); }
    construireTrafic(); majObjets();
    const abonne=(typeof RayleBus!=='undefined')?RayleBus.on('ui:terre',()=>{ basculerVoile(); majCouches(); majObjets(); majPanneau(); }):null;

    /* ───── à chaque image ───── */
    function maj(dt){
      temps.value+=dt; const Tms=UI.horloge?UI.horloge.maintenant():Date.now();
      if(X.sunDir){ sunU.value.copy(X.sunDir()); }
      for(const m of mats) if(m.uniforms&&m.uniforms.u_px) m.uniforms.u_px.value=X.rendu?X.rendu.getPixelRatio():1;
      if(!appliquerReel()) majTrafic(Tms);
      const kz=Math.max(.3,Math.min(1.1,camera.position.length()/6.4));      // l'étiquette garde une taille lisible quand la caméra s'approche
      for(const o of pins.children){ const u=o.userData; if(!u||!u.anneau) continue; const ph=((temps.value+u.t0)%2)/2; u.anneau.scale.setScalar(.035+.07*ph); u.ring.opacity=.9*(1-ph); if(u.sprite){ u.sprite.scale.set(.05*u.ratio*kz,.05*kz,1); u.sprite.position.y=.07+.04*kz; } }
      derHud+=dt; if(derHud>.5){ derHud=0; majBadge(); }
      if(voile&&!voile.hidden!==(UI.terreMain&&UI.terreMain.actif())) basculerVoile();
    }
    function qualite(nq,nu){ const chg=nq!==q||!!nu!==ultra; q=nq|0; ultra=!!nu; if(chg) construireTrafic(); }
    function liberer(){
      try{ terre.remove(objets); geos.forEach(g=>g.dispose()); mats.forEach(m=>m.dispose&&m.dispose()); tex.forEach(t=>t.dispose()); }catch(e){}
      [badge,bouton,pop,voile].forEach(x=>x&&x.remove()); document.removeEventListener('pointerdown',surDoc); document.removeEventListener('keydown',surTouche);
      try{ abonne&&abonne(); }catch(e){}
      if(UI.terreMain) UI.terreMain.activer(false);
    }
    const r={maj,majCouches,majObjets,qualite,liberer,objets,etatTrafic:()=>({avions:nAv,bateaux:nNav,vols:!!(avions&&avions.p.visible),bat:!!(navires&&navires.p.visible),epingles:pins.children.length,traces:traces.children.length})};
    UI.espaceTerre.scene=()=>r; const libere=r.liberer; r.liberer=()=>{ libere(); if(UI.espaceTerre.scene()===r) UI.espaceTerre.scene=()=>null; }; return r;
  }
  UI.espaceTerre3D={monter};
})();
