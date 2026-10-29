"use strict";
/* ═════════════ ÉCRAN « PLUS » DE LA COQUE MOBILE (V8) ═════════════
   De grandes tuiles (≥ 100 px) qui ouvrent les vues existantes — terminal, carte, pays, sources en direct, réglages — sans les réécrire : le bouton historique correspondant est simplement
   déclenché. Les contenus qui chargeaient sans fin (événements de la Terre, sources en direct) passent par les états squelette → contenu → erreur + Réessayer.
   Les modules 3D lourds (Anatomie, Mars, Saturne, Neptune) sont réservés au PC : leur tuile le dit honnêtement (leurs modèles sont dans assets-lourds/, absents de GitHub Pages). */
(function(){
  const C=window.MobileCalcul, D=window.MobileDonnees, T=window.TableauBordContenu, Coque=window.MobileCoque; if(!C||!D||!Coque) return;
  const esc=C.esc, $=id=>document.getElementById(id);
  const lire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } }, ecrire=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
  const clic=id=>{ const b=$(id); if(b) b.click(); else Coque.feuille({titre:'Indisponible',rendre(c){ c.innerHTML='<p class="m-vide">Cette fonction n’est pas disponible sur cet appareil.</p>'; }}); };
  const I=d=>'<svg viewBox="0 0 24 24">'+d+'</svg>';
  const ICO={
    terminal:I('<path d="M3 20h18M4 16l5-6 4 3 7-8"/><path d="M16 5h4v4"/>'),carte:I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'),
    pays:I('<path d="M4 21V4M4 5h12l-2 4 2 4H4"/>'),sources:I('<circle cx="12" cy="12" r="2"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.5 4.5a10.6 10.6 0 0 0 0 15M19.5 4.5a10.6 10.6 0 0 1 0 15"/>'),
    terre:I('<path d="M12 3l9 17H3z"/><path d="M12 10v4M12 17v.5"/>'),reglages:I('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>'),
    affichage:I('<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M10 18.5h4"/>'),gestes:I('<path d="M8 12V5a1.5 1.5 0 0 1 3 0v5M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V6a1.5 1.5 0 0 1 3 0v8c0 4-2.500 6-5.500 6S7 18 6 15l-1.500-3a1.500 1.500 0 0 1 2.500-1.500L8 12"/>'),
    ia:I('<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>'),pc:I('<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8M12 16v4"/>')
  };
  const RESERVE_PC=[
    {id:'anatomie',nom:'Anatomie 3D',txt:'Le squelette, les muscles et les mouvements animés utilisent des modèles 3D très lourds, gardés sur le PC.'},
    {id:'mars',nom:'Base de Mars',txt:'La base 3D de Mars et sa table holographique demandent la carte graphique du PC. Le terminal de trading, lui, est disponible ici.'},
    {id:'saturne',nom:'Vaisseau de Saturne',txt:'Le vaisseau et la salle médicale sont des scènes 3D réservées au PC.'},
    {id:'neptune',nom:'Atelier de Neptune',txt:'L’atelier 3D (peindre, modifier, visiter) est réservé au PC.'}
  ];

  const TUILES=[
    {id:'terminal',nom:'Terminal',sous:'Graphique, marchés, calendrier',ico:'terminal',agir:()=>clic('btnOuvrirTerminal')},
    {id:'carte',nom:'Carte du monde',sous:'Pays, actualités, météo',ico:'carte',agir:()=>{ if(window.HoteModules) HoteModules.ouvrirTerre().catch(e=>Coque.feuille({titre:'Carte',rendre(c){ c.innerHTML='<p class="m-vide">'+esc(C.messageErreur(e))+'</p>'; }})); else clic('btnCarteTerre'); }},
    {id:'pays',nom:'Pays',sous:'Actualités par pays',ico:'pays',agir:()=>clic('btnPays')},
    {id:'sources',nom:'Sources en direct',sous:'Séismes, communiqués, TV',ico:'sources',agir:()=>clic('btnSources')},
    {id:'evenements',nom:'Événements de la Terre',sous:'Séismes, tempêtes, volcans',ico:'terre',agir:evenements},
    {id:'fenetres',nom:'Fenêtres ouvertes',sous:'Retrouver une fenêtre',ico:'sources',agir:fenetres},
    {id:'affichage',nom:'Affichage mobile',sous:'Images, vibration, économie',ico:'affichage',agir:affichage},
    {id:'gestes',nom:'Gestes & caméra',sous:'Main, caméra du téléphone',ico:'gestes',agir:()=>{ const g=$('gear'); if(g) g.click(); setTimeout(()=>{ const s=document.getElementById('gs-actif'); if(s&&s.scrollIntoView) s.scrollIntoView({block:'center'}); },400); }},
    {id:'ia',nom:'Voix & IA locale',sous:'Réveil, LM Studio, Dolphin',ico:'ia',agir:()=>{ const g=$('gear'); if(g) g.click(); }},
    {id:'reglages',nom:'Réglages',sous:'Code, voix, Worker, appareil',ico:'reglages',agir:()=>clic('gear')}
  ];

  function monter(el){
    el.innerHTML='<div class="m-titre"><h1>Plus</h1><small>'+esc(RayleAppareil.mode()==='tablette'?'tablette':'téléphone')+'</small></div><div class="m-tuiles"></div>';
    const z=el.querySelector('.m-tuiles');
    z.innerHTML=TUILES.map((t,i)=>'<button type="button" class="m-tuile" data-id="'+t.id+'" style="--i:'+i+'">'+ICO[t.ico]+'<span><b>'+esc(t.nom)+'</b><small>'+esc(t.sous)+'</small></span></button>').join('')
      +RESERVE_PC.map((t,i)=>'<button type="button" class="m-tuile" data-pc="1" data-id="'+t.id+'" style="--i:'+(TUILES.length+i)+'">'+ICO.pc+'<span><b>'+esc(t.nom)+'</b><em>RÉSERVÉ AU PC</em></span></button>').join('');
    z.addEventListener('click',ev=>{
      const b=ev.target.closest('.m-tuile'); if(!b) return; Coque.vibrer(8);
      if(b.dataset.pc){ const r=RESERVE_PC.find(x=>x.id===b.dataset.id); Coque.feuille({titre:r.nom,rendre(c){ c.innerHTML='<p style="font-size:16px;margin:0 0 12px">Réservé au PC.</p><p class="m-doux">'+esc(r.txt)+'</p><p class="m-faible">Sur le téléphone et la tablette, Raylé reste sur Jarvis : tout le reste fonctionne ici.</p>'; }}); return; }
      const t=TUILES.find(x=>x.id===b.dataset.id); if(t) t.agir();
    });
  }

  /* ───── événements de la Terre : squelette → contenu → erreur + Réessayer ───── */
  let direct=null;
  async function lireEvenements(){
    if(!direct){ const mod=await import(new URL('core/direct/donnees-direct.js',document.baseURI).href); direct=mod.creerDirect(); }
    const r=await direct.evenements();
    if(r.etat!=='ok') throw new Error(r.raison||'sources injoignables');
    return {lignes:T?T.lignesEvenements(r.evenements,Date.now(),30):[],etiquette:r.etiquette,sources:r.sources||[]};
  }
  function evenements(){
    Coque.feuille({titre:'Événements de la Terre',rendre(c){
      c.innerHTML='<div data-z></div><p class="m-faible" style="margin-top:12px">Sources : séismes USGS, NASA EONET, alertes GDACS. Gravité indicative calculée par Raylé, pas une mesure officielle.</p>';
      D.suivre({cle:'terre-evenements',zone:c.querySelector('[data-z]'),ttl:5*60e3,squelette:'liste',charger:lireEvenements,vide:d=>!d||!d.lignes.length,texteVide:'Aucun événement notable dans les dernières 48 heures.',
        rendre:(corps,d)=>{ corps.innerHTML='<ul class="m-evts">'+d.lignes.map(e=>'<li data-g="'+(e.severite||0)+'"><span class="m-evt-g"></span><div><b>'+esc(e.titre)+'</b><small class="m-faible">'+esc(e.age)+(e.url?' · <a href="'+esc(e.url)+'" target="_blank" rel="noopener noreferrer">fiche</a>':'')+'</small></div></li>').join('')+'</ul>'; }});
    }});
  }

  /* ───── fenêtres ouvertes (l'ancien tiroir flottant, ici sans icône posée sur l'écran) ───── */
  function fenetres(){
    Coque.feuille({titre:'Fenêtres',rendre(c,o){
      let l=[]; try{ l=window.TiroirFenetres?TiroirFenetres.toutes():[]; }catch(e){ l=[]; }
      l=l.filter(x=>x.posee);
      c.innerHTML=l.length?'<ul class="m-liste">'+l.map((x,i)=>'<li><button type="button" class="m-bouton" data-i="'+i+'" style="width:100%;justify-content:flex-start">'+esc(x.titre)+'</button></li>').join('')+'</ul>':'<p class="m-vide">Aucune fenêtre ouverte pour le moment. Les fenêtres s’ouvrent quand tu poses une question à Raylé.</p>';
      c.addEventListener('click',ev=>{ const b=ev.target.closest('[data-i]'); if(!b) return; const x=l[+b.dataset.i]; o.fermer(); try{ x.afficher(); }catch(e){} });
    }});
  }

  /* ───── affichage mobile ───── */
  function interrupteur(id,nom,aide,actif){ return '<div class="m-reglage"><label for="'+id+'">'+esc(nom)+(aide?'<small>'+esc(aide)+'</small>':'')+'</label><button type="button" role="switch" class="m-inter" id="'+id+'" aria-checked="'+(actif?'true':'false')+'"></button></div>'; }
  function affichage(){
    Coque.feuille({titre:'Affichage mobile',rendre(c){
      const etat=()=>({img:lire('rayle_m_images')!=='0',vib:lire('rayle_m_vibration')!=='0',eco:lire('rayle_m_eco')==='1'});
      const dessiner=()=>{ const e=etat(); c.innerHTML=interrupteur('mi-img','Images dans les actualités','Image du média, photo libre ou carte. Chargées au fur et à mesure.',e.img)+interrupteur('mi-vib','Retour haptique','Une légère vibration sur les actions importantes.',e.vib)+interrupteur('mi-eco','Économie de batterie','Animations plus lentes, moins d’effets.',e.eco)
        +'<p class="m-faible" style="margin-top:14px">Le téléphone allège tout seul l’affichage quand il rame (niveau actuel : '+Coque.niveau()+' sur 2) et arrête tout quand l’écran est masqué. « Réduire les animations » d’Android est respecté.</p>'; };
      dessiner();
      c.addEventListener('click',ev=>{ const b=ev.target.closest('.m-inter'); if(!b) return; const on=b.getAttribute('aria-checked')!=='true';
        if(b.id==='mi-img') ecrire('rayle_m_images',on?'1':'0'); else if(b.id==='mi-vib') ecrire('rayle_m_vibration',on?'1':'0'); else if(b.id==='mi-eco'){ ecrire('rayle_m_eco',on?'1':'0'); document.documentElement.classList.toggle('m-eco',on); }
        dessiner(); });
    }});
  }
  Coque.enregistrer('plus',{monter});
  window.MobilePlus={tuiles:()=>TUILES.map(t=>t.id).concat(RESERVE_PC.map(t=>t.id)),evenements,affichage};
})();
