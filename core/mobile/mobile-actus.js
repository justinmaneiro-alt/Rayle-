"use strict";
/* ═════════════ ACTUALITÉS ANIMÉES AVEC IMAGES, SUR MOBILE (V8) ═════════════
   Fil de cartes (image en tête, titre, média, heure, « repris par N médias »), pastilles de rubriques (France, Monde, puis Économie, Tech, Sport, Science… selon ce qui est présent),
   mode « stories » (balayage d'une carte à l'autre, avancement automatique, pause au doigt), bandeau défilant sur l'accueil, lecture à la voix avec surbrillance de la carte en cours, « approfondir ».
   Données : /actualites/fil du Worker (mêmes sujets que la Terre et l'accueil PC). Si le Worker répond « en préparation » (503) : la dernière copie en cache s'affiche tout de suite, étiquetée
   « mise à jour il y a X min » ; sans copie, repli sur /actualites?pays=FR (lecture directe des flux) ; puis relance en arrière-plan avec retrait progressif. Jamais d'écran vide.
   Images : celle du flux du média (avec son nom), sinon photo libre Wikimedia Commons du lieu (auteur, licence, lien), sinon vue cartographique ; chargement paresseux. Désactivables (rayle_m_images = 0). */
(function(){
  const C=window.MobileCalcul, D=window.MobileDonnees, AC=window.ActusAccueilContenu, Coque=window.MobileCoque; if(!C||!D||!Coque) return;
  const esc=C.esc, lire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const PORTEES=[{id:'france',nom:'France'},{id:'monde',nom:'Monde'}];
  const images=()=>lire('rayle_m_images')!=='0';
  let mod=null;
  const charger=()=>mod||(mod=Promise.all([import(new URL('planetes/terre/pc/fil-actus.js',document.baseURI).href),import(new URL('planetes/terre/pc/actus-sujets.js',document.baseURI).href)]).then(([fil,suj])=>({fil,suj})).catch(e=>{ mod=null; throw e; }));

  /* Repli quand /actualites/fil est « en préparation » : lecture directe des flux du pays (route déjà déployée). */
  function sujetsDepuisTitres(res){
    return (res&&res.titres||[]).map(t=>{ const img=typeof t.image==='string'&&/^https:\/\//.test(t.image)?t.image:null, url=/^https?:\/\//.test(t.url||'')?t.url:null;
      return url?{id:url,titre:String(t.titre||'').replace(/\s+/g,' ').trim(),cat:'autre',catNom:'À la une',couleur:'#8fd0e3',importance:1,niveau:'faible',source:t.source||'média',url,quand:Number.isFinite(Date.parse(t.date))?C.age(Date.parse(t.date)):'',autres:[],nbSources:1,image:img,sources:[{nom:t.source||'média',url,titre:t.titre,image:img}],lieu:null,regions:[]}:null; }).filter(Boolean);
  }
  async function chargerSujets(portee){
    const {fil,suj}=await charger();
    try{
      const brut=await fil.chargerFil(portee,'',{force:true}), m=suj.modelesFil(brut,{max:40});
      if(!m.sujets.length) throw new Error('aucun sujet pour le moment');
      return {sujets:m.sujets,genere:m.genere,perime:m.perime,source:'fil'};
    }catch(e){
      const msg=String((e&&e.message)||e);
      if(portee==='france'&&/503|prépar|en préparation|introuvable|404/i.test(msg)&&window.wjson){
        const res=await window.wjson('/actualites?pays=FR&n=24&nom=France',20000), s=sujetsDepuisTitres(res);
        if(s.length) return {sujets:s,genere:res.genere||new Date().toISOString(),perime:false,source:'directe'};
      }
      throw e;
    }
  }
  const tMaj=d=>{ const t=Date.parse(d&&d.genere||''); return Number.isFinite(t)?t:null; };

  /* ───── image d'une carte ───── */
  function figure(zone,s,{grand=false}={}){
    const IA=window.ImagesActus; zone.classList.add('m-ia');
    if(!IA||!images()){ zone.classList.add('m-sans-image'); return; }
    const L=grand?900:420, H=grand?1200:236;
    const montrer=d=>{ zone.innerHTML=IA.htmlFigure(d,{largeur:L,hauteur:H}); zone.classList.add('m-ok'); zone.classList.remove('m-sans-image'); };
    const secours=async()=>{ if(!s.lieu){ zone.classList.add('m-sans-image'); return; } try{ const d=await IA.repli(s.lieu); if(d){ montrer(d); const im=zone.querySelector('img'); if(im&&d.type==='commons') im.addEventListener('error',()=>{ zone.innerHTML=''; zone.classList.add('m-sans-image'); },{once:true}); } else zone.classList.add('m-sans-image'); }catch(e){ zone.classList.add('m-sans-image'); } };
    const flux=IA.imageFlux(s);
    if(flux){ montrer({type:'flux',src:flux.src,credit:'© '+(flux.source||'média'),lien:flux.lien,alt:s.titre||''}); const im=zone.querySelector('img'); if(im) im.addEventListener('error',()=>{ zone.innerHTML=''; zone.classList.remove('m-ok'); secours(); },{once:true}); }
    else secours();
  }
  function lazy(zones,sujets,opts){
    const faire=z=>{ if(z.dataset.fait) return; z.dataset.fait='1'; figure(z,sujets[+z.dataset.i],opts); };
    if(!('IntersectionObserver' in window)){ zones.forEach(faire); return; }
    const io=new IntersectionObserver(es=>{ for(const e of es) if(e.isIntersecting){ io.unobserve(e.target); faire(e.target); } },{rootMargin:'300px 0px'});
    zones.forEach(z=>io.observe(z));
  }

  /* ───── fil ───── */
  const etat={portee:'france',rub:'',sujets:[],genere:null,perime:false,source:'fil'};
  let suivi=null, zoneListe=null, lecture=null;
  const cleCache=p=>'actus:'+p;
  function pastilles(){
    const rubs=AC&&AC.rubriquesPresentes?AC.rubriquesPresentes(etat.sujets,6):[];
    return '<div class="m-chips" role="tablist" aria-label="Portée et rubriques">'
      +PORTEES.map(p=>'<button type="button" role="tab" class="m-chip" data-portee="'+p.id+'"'+(etat.portee===p.id&&!etat.rub?' aria-selected="true"':'')+'>'+esc(p.nom)+'</button>').join('')
      +rubs.map(r=>'<button type="button" role="tab" class="m-chip" data-rub="'+esc(r.id)+'"'+(etat.rub===r.id?' aria-selected="true"':'')+'>'+esc(String(r.nom).split(' ')[0])+' <b>'+r.n+'</b></button>').join('')+'</div>';
  }
  function liste(){ return AC&&AC.selection?AC.selection(etat.sujets,etat.rub||'',40):etat.sujets; }
  function carte(s,i){
    const meta=[s.catNom,s.source,s.quand].filter(Boolean).map(esc).join(' · ');
    return '<article class="m-actu" data-i="'+i+'" style="--c:'+esc(s.couleur||'#8fd0e3')+';--i:'+Math.min(i,8)+'"><div class="m-actu-img" data-i="'+i+'"></div>'
      +'<div class="m-actu-c"><h3>'+esc(s.titre)+'</h3><p class="m-faible">'+meta+'</p>'
      +'<p class="m-actu-imp">'+esc(s.importance>1?'Repris par '+s.importance+' médias':'Signalé par 1 média')+'</p>'
      +'<div class="m-actu-act"><a class="m-bouton" href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">Lire l’article</a><button type="button" class="m-bouton" data-approf="'+i+'">Approfondir</button></div></div></article>';
  }
  function dessiner(corps,meta){
    const l=liste(); window.__mActus=l;
    const maj=etat.genere?'<p class="m-faible m-maj-actus" data-maj>'+esc(C.miseAJour(tMaj(etat))||'')+(etat.source==='directe'?' · lecture directe des médias':'')+(etat.perime?' · les sources ne répondent pas, copie ancienne':'')+'</p>':'';
    corps.innerHTML=pastilles()+'<div class="m-actus-barre"><button type="button" class="m-bouton" data-stories>▶ Stories</button><button type="button" class="m-bouton" data-lire>🔊 Lire les titres</button></div>'+maj
      +(l.length?'<div class="m-actus-liste">'+l.map(carte).join('')+'</div>':'<p class="m-vide">Aucun sujet dans cette rubrique pour le moment.</p>');
    lazy(corps.querySelectorAll('.m-actu-img'),l);
  }
  function monter(el){
    el.innerHTML='<div class="m-titre"><h1>Actualités</h1><small data-sous></small></div><div class="m-actus-zone"></div>';
    zoneListe=el.querySelector('.m-actus-zone');
    demarrer();
    el.addEventListener('click',ev=>{
      const ch=ev.target.closest('.m-chip');
      if(ch){ if(ch.dataset.portee){ const p=ch.dataset.portee; if(p!==etat.portee){ etat.portee=p; etat.rub=''; demarrer(); } else { etat.rub=''; rendre(); } } else { etat.rub=ch.dataset.rub; rendre(); } Coque.vibrer(6); return; }
      if(ev.target.closest('[data-stories]')){ stories(0); return; }
      if(ev.target.closest('[data-lire]')){ lireTitres(); return; }
      const ap=ev.target.closest('[data-approf]'); if(ap){ approfondir(liste()[+ap.dataset.approf]); return; }
    });
  }
  function rendre(){ const c=zoneListe&&zoneListe.querySelector('.m-corps'); if(c&&etat.sujets.length) dessiner(c); }
  function demarrer(){
    if(suivi) suivi.arreter();
    zoneListe.innerHTML='';
    suivi=D.suivre({cle:cleCache(etat.portee),zone:zoneListe,ttl:5*60e3,squelette:'image',charger:()=>chargerSujets(etat.portee),vide:d=>!d||!d.sujets||!d.sujets.length,texteVide:'Aucune actualité pour le moment.',
      rendre:(corps,d,meta)=>{ Object.assign(etat,{sujets:d.sujets,genere:d.genere,perime:!!d.perime||!!(meta&&meta.perime),source:d.source}); dessiner(corps,meta); }});
  }

  /* ───── stories ───── */
  function stories(depart=0){
    const l=liste(); if(!l.length) return;
    let i=Math.min(depart,l.length-1), debut=0, pause=false, dureeRestante=C.DUREE_STORY, raf=0, tPause=0;
    const f=Coque.feuille({titre:'Stories',plein:true,surFermer(){ cancelAnimationFrame(raf); }});
    f.corps.style.padding='0'; f.corps.innerHTML='<div class="m-story"><div class="m-story-barres">'+l.slice(0,20).map(()=>'<i><b></b></i>').join('')+'</div><div class="m-story-img"></div><div class="m-story-txt"><span class="m-story-cat"></span><h2></h2><p class="m-faible"></p><div class="m-story-act"><a class="m-bouton" target="_blank" rel="noopener noreferrer">Lire l’article</a><button type="button" class="m-bouton" data-ap>Approfondir</button></div></div><button type="button" class="m-story-g" aria-label="Carte précédente"></button><button type="button" class="m-story-d" aria-label="Carte suivante"></button></div>';
    const R=f.corps, barres=R.querySelectorAll('.m-story-barres b');
    function afficher(){
      const s=l[i]; R.querySelector('h2').textContent=s.titre; R.querySelector('.m-story-cat').textContent=s.catNom||''; R.querySelector('.m-story-txt p').textContent=[s.source,s.quand,s.importance>1?'repris par '+s.importance+' médias':''].filter(Boolean).join(' · ');
      R.querySelector('.m-story-act a').href=s.url; R.style.setProperty('--c',s.couleur||'#8fd0e3');
      const z=R.querySelector('.m-story-img'); z.innerHTML=''; z.dataset.fait=''; figure(z,s,{grand:true});
      barres.forEach((b,k)=>{ b.style.transform=k<i?'scaleX(1)':'scaleX(0)'; });
      debut=performance.now(); dureeRestante=C.DUREE_STORY;
    }
    function boucle(now){
      if(!pause){ const p=Math.min(1,(now-debut)/dureeRestante); if(barres[i]) barres[i].style.transform='scaleX('+p+')'; if(p>=1){ i=C.prochaineCarte(i,Math.min(l.length,20)); afficher(); } }
      raf=requestAnimationFrame(boucle);
    }
    const geler=()=>{ if(!pause){ pause=true; tPause=performance.now(); } }, reprendre=()=>{ if(pause){ pause=false; debut+=performance.now()-tPause; } };
    let x0=null,t0=0;
    R.addEventListener('pointerdown',ev=>{ if(ev.target.closest('a,button[data-ap]')) return; x0=ev.clientX; t0=performance.now(); geler(); });
    R.addEventListener('pointerup',ev=>{ if(x0==null) return; const dx=ev.clientX-x0, court=performance.now()-t0<250; x0=null; reprendre();
      const n=Math.min(l.length,20); const j=C.carteApresGeste(i,n,dx);
      if(j!==i){ i=j; afficher(); Coque.vibrer(6); }
      else if(court&&Math.abs(dx)<12){ const w=R.getBoundingClientRect(); const droite=ev.clientX>w.left+w.width*0.35; i=droite?C.prochaineCarte(i,n):C.precedenteCarte(i,n); afficher(); } });
    R.querySelector('[data-ap]').addEventListener('click',()=>{ f.fermer(); approfondir(l[i]); });
    afficher(); raf=requestAnimationFrame(boucle);
  }

  /* ───── lecture à la voix : titre par titre, la carte en cours est mise en valeur ───── */
  async function lireTitres(){
    if(lecture){ lecture.stop=true; lecture=null; document.querySelectorAll('.m-actu.m-lue').forEach(e=>e.classList.remove('m-lue')); const b=document.querySelector('[data-lire]'); if(b) b.textContent='🔊 Lire les titres'; return; }
    const l=liste().slice(0,6); if(!l.length||typeof speak!=='function') return;
    const L=lecture={stop:false}; const b=document.querySelector('[data-lire]'); if(b) b.textContent='⏹ Arrêter la lecture';
    for(let k=0;k<l.length&&!L.stop;k++){
      const el=document.querySelector('.m-actu[data-i="'+k+'"]'); document.querySelectorAll('.m-actu.m-lue').forEach(e=>e.classList.remove('m-lue'));
      if(el){ el.classList.add('m-lue'); el.scrollIntoView({block:'center',behavior:'smooth'}); }
      try{ await speak((k===0?'À la une. ':'')+l[k].titre+'. '+(l[k].source?'Source : '+l[k].source+'.':'')); }catch(e){ break; }
    }
    document.querySelectorAll('.m-actu.m-lue').forEach(e=>e.classList.remove('m-lue')); if(lecture===L) lecture=null; const b2=document.querySelector('[data-lire]'); if(b2) b2.textContent='🔊 Lire les titres';
  }
  function approfondir(s){ if(!s) return; Coque.feuille({titre:'Approfondir',rendre(c,o){
    c.innerHTML='<h3 style="margin:0 0 6px;font:600 17px var(--m-sans)">'+esc(s.titre)+'</h3><p class="m-faible">'+[s.source,s.quand].filter(Boolean).map(esc).join(' · ')+'</p>'
      +'<div class="m-grille" style="margin-top:12px"><button type="button" class="m-bouton" data-q="resume">Résume-moi ce sujet</button>'+(s.autres&&s.autres.length?'<button type="button" class="m-bouton" data-q="sources">Voir les autres sources</button>':'')+'<button type="button" class="m-bouton" data-q="images">Montre-moi des images</button></div>'
      +'<div data-src style="margin-top:12px"></div>';
    c.addEventListener('click',ev=>{ const q=ev.target.closest('[data-q]'); if(!q) return;
      if(q.dataset.q==='resume'){ o.fermer(); Coque.envoyer('Résume-moi cette actualité : '+s.titre); }
      else if(q.dataset.q==='images'){ o.fermer(); Coque.envoyer('Montre-moi des images de '+(s.lieu&&s.lieu.nom?s.lieu.nom:s.titre.split(/[:,–-]/)[0].trim())); }
      else c.querySelector('[data-src]').innerHTML='<ul class="m-liste-src">'+[{nom:s.source,url:s.url}].concat(s.autres||[]).filter(x=>x&&x.url).map(x=>'<li><a href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">'+esc(x.nom||x.url)+'</a></li>').join('')+'</ul>'; });
  }}); }

  /* ───── bandeau défilant (accueil) ───── */
  function bandeau(zone){
    const lig=(etat.sujets||[]).slice(0,8); if(!lig.length){ zone.hidden=true; return; }
    zone.hidden=false; const t=lig.map(s=>'<span>'+esc(s.titre)+'</span>').join('');
    zone.innerHTML='<div class="m-defile-b"><div class="m-defile-i">'+t+t+'</div></div>';
  }
  Coque.enregistrer('actus',{monter,montrer(){ if(suivi&&suivi.rafraichir&&etat.genere&&Date.now()-tMaj(etat)>5*60e3) suivi.rafraichir(); },cacher(){ if(lecture){ lecture.stop=true; lecture=null; } }});
  window.MobileActus={etat:()=>etat,liste,charger:chargerSujets,figure,lazy,stories,bandeau,sujetsDepuisTitres,aller:p=>{ if(p){ etat.portee=PORTEES.some(x=>x.id===p)?p:'france'; etat.rub=''; } Coque.aller('actus'); if(zoneListe) demarrer(); },lire:lireTitres,approfondir};
})();
