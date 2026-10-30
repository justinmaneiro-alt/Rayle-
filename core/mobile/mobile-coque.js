"use strict";
/* ═════════════ COQUE MOBILE DE RAYLÉ (V8) : téléphone et tablette, thème Jarvis, jamais de Galaxie ═════════════
   Barre du bas (Accueil · Marchés · [Voix] · Actus · Plus), écrans enregistrés par les autres modules (MobileCoque.enregistrer), feuilles qui montent du bas (MobileCoque.feuille),
   bouton retour du téléphone qui ferme la feuille au lieu de quitter l'application, voyant de liaison, bannière hors ligne, retour haptique léger, gouverneur de performance
   (images/s mesurées → on allège tout seul ; écran masqué → on arrête ; économie de batterie et « réduire les animations » respectés).
   Les anciens boutons (Terminal, Pays, Sources, Réglages…) restent dans la page et sont pilotés par le menu « Plus » : aucune logique n'est écrite deux fois.
   Ne s'exécute QUE hors PC (le PC ne change pas). Calculs purs : mobile-calcul.js. */
(function(){
  const A=window.RayleAppareil, C=window.MobileCalcul;
  if(!A||!C||A.estPC()||window.RAYLE_SATELLITE) return;
  const html=document.documentElement, corps=document.body, $=id=>document.getElementById(id);
  const esc=C.esc;
  const lire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } }, ecrire=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };

  const ICONES={
    accueil:'<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
    agent:'<svg viewBox="0 0 24 24"><path d="M3 20h18"/><path d="M4 16l5-6 4 3 7-8"/><path d="M16 5h4v4"/></svg>',
    actus:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
    plus:'<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="18" cy="6" r="1.6"/><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/><circle cx="6" cy="18" r="1.6"/><circle cx="12" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/></svg>',
    voix:'<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
  };
  const NOMS={accueil:'Accueil',agent:'Marchés',actus:'Actus',plus:'Plus'};

  /* ───── structure ───── */
  const app=document.createElement('div'); app.id='m-app'; app.setAttribute('aria-label','Raylé');
  app.innerHTML='<header class="m-haut"><span class="m-marque">RAYLÉ</span><div class="m-puces"><button type="button" class="m-puce" id="m-puce-lien" data-etat="att" aria-label="État de la liaison"><i></i><span>…</span></button><button type="button" class="m-puce" id="m-ecrire" aria-label="Écrire à Raylé"><span>⌨</span></button></div></header>'
    +'<main class="m-ecrans" id="m-ecrans">'+C.ECRANS.map(id=>'<section class="m-ecran" id="m-'+id+'" data-ecran="'+id+'" aria-label="'+NOMS[id]+'">'+(id==='accueil'?'':'<div class="m-squelette" style="margin-top:20px"><i></i><i></i><i></i></div>')+'</section>').join('')+'</main>'
    +'<nav class="m-nav" id="m-nav" aria-label="Navigation">'+C.ONGLETS.map(o=>o.central
      ?'<button type="button" class="m-voix" id="m-voix" data-etat="coupe" aria-label="Parler à Raylé"><b>'+ICONES.voix+'</b><small id="m-voix-txt">Parler</small></button>'
      :'<button type="button" data-ecran="'+o.id+'" aria-label="'+esc(o.nom)+'">'+ICONES[o.id]+'<span>'+esc(o.nom)+'</span></button>').join('')+'</nav>';
  const hors=document.createElement('div'); hors.className='m-hors-ligne'; hors.hidden=true; hors.textContent='HORS LIGNE · dernières données';
  const maj=document.createElement('div'); maj.className='m-maj'; maj.hidden=true; maj.setAttribute('role','status');
  document.body.append(app,hors,maj);
  html.classList.add('m-pret');

  /* ───── écrans ───── */
  const modules={}, montes=new Set(); let courant=null;
  function enregistrer(id,def){ modules[id]=def; if(courant===id){ monter(id); if(def.montrer) try{ def.montrer(); }catch(e){} } }
  function monter(id){
    if(montes.has(id)||!modules[id]) return;
    montes.add(id); const el=$('m-'+id); try{ modules[id].monter(el); }catch(e){ console.error('[mobile] '+id,e); el.innerHTML='<p class="m-vide">Cet écran n’a pas pu s’afficher : '+esc(C.messageErreur(e))+'</p>'; }
  }
  function aller(id,{pousser=false}={}){
    if(!C.ECRANS.includes(id)) id='accueil';
    fermerFeuilles();
    const avant=courant; courant=id; html.dataset.mEcran=id;
    document.querySelectorAll('.m-ecran').forEach(e=>e.classList.toggle('m-actif',e.dataset.ecran===id));
    app.querySelectorAll('.m-nav button[data-ecran]').forEach(b=>{ if(b.dataset.ecran===id) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
    monter(id);
    if(avant&&avant!==id&&modules[avant]&&modules[avant].cacher) try{ modules[avant].cacher(); }catch(e){}
    if(modules[id]&&modules[id].montrer) try{ modules[id].montrer(); }catch(e){}
    ecrire('rayle_m_ecran',id);
    try{ RayleBus.emit('mobile:ecran',{id,avant}); }catch(e){}
  }
  app.querySelector('#m-nav').addEventListener('click',ev=>{
    const b=ev.target.closest('button'); if(!b) return;
    if(b.id==='m-voix'){ vibrer(12); const mic=$('btn'); if(mic) mic.click(); return; }
    if(b.dataset.ecran){ if(courant===b.dataset.ecran){ const e=$('m-'+courant); if(e) e.scrollTo({top:0,behavior:'smooth'}); } else vibrer(8); aller(b.dataset.ecran); }
  });

  /* ───── feuilles (bottom sheets) + bouton retour du téléphone ───── */
  const pile=[];
  function feuille({titre='',plein=false,rendre,surFermer}={}){
    const voile=document.createElement('div'); voile.className='m-voile';
    const f=document.createElement('section'); f.className='m-feuille'+(plein?' m-plein':''); f.setAttribute('role','dialog'); f.setAttribute('aria-modal','true'); f.setAttribute('aria-label',titre||'Fenêtre');
    f.innerHTML='<div class="m-poignee" aria-hidden="true"><i></i></div><div class="m-feuille-tete"><h2>'+esc(titre)+'</h2><button type="button" class="m-fermer" aria-label="Fermer">✕</button></div><div class="m-feuille-corps"></div>';
    document.body.append(voile,f); const c=f.querySelector('.m-feuille-corps');
    const o={el:f,corps:c,titre:f.querySelector('h2'),fermer:()=>retirer(o)};
    pile.push({o,voile,surFermer});
    try{ history.pushState({m:'feuille',n:pile.length},''); }catch(e){}
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ voile.classList.add('m-ouvert'); f.classList.add('m-ouvert'); }));
    voile.addEventListener('click',()=>retirer(o)); f.querySelector('.m-fermer').addEventListener('click',()=>retirer(o));
    // glisser la poignée vers le bas = fermer
    const poi=f.querySelector('.m-poignee'); let y0=null,dy=0;
    poi.addEventListener('pointerdown',ev=>{ y0=ev.clientY; dy=0; poi.setPointerCapture(ev.pointerId); f.style.transition='none'; });
    poi.addEventListener('pointermove',ev=>{ if(y0==null) return; dy=Math.max(0,ev.clientY-y0); f.style.transform='translateY('+dy+'px)'; });
    const fin=()=>{ if(y0==null) return; y0=null; f.style.transition=''; f.style.transform=''; if(dy>90) retirer(o); };
    poi.addEventListener('pointerup',fin); poi.addEventListener('pointercancel',fin);
    if(rendre) rendre(c,o);
    return o;
  }
  function retirer(o,{depuisRetour=false}={}){
    const i=pile.findIndex(x=>x.o===o); if(i<0) return;
    const {voile,surFermer}=pile[i]; pile.splice(i,1);
    o.el.classList.remove('m-ouvert'); voile.classList.remove('m-ouvert');
    setTimeout(()=>{ o.el.remove(); voile.remove(); },260);
    if(surFermer) try{ surFermer(); }catch(e){}
    if(!depuisRetour){ try{ if(history.state&&history.state.m==='feuille'){ ignorerRetour++; history.back(); } }catch(e){} }
  }
  function fermerFeuilles(){ while(pile.length) retirer(pile[pile.length-1].o); }
  let ignorerRetour=0;
  window.addEventListener('popstate',()=>{ if(ignorerRetour>0){ ignorerRetour--; return; } if(pile.length) retirer(pile[pile.length-1].o,{depuisRetour:true}); });

  /* ───── retour haptique léger (actions importantes seulement) ───── */
  function vibrer(ms){ try{ if(navigator.vibrate&&lire('rayle_m_vibration')!=='0') navigator.vibrate(ms); }catch(e){} }

  /* ───── voyant de liaison (serveur Raylé) ───── */
  function majLien(){
    const b=$('m-puce-lien'); if(!b) return; let ok=false, verrou=false;
    try{ ok=typeof workerReady==='function'&&!!workerReady(); verrou=!ok; }catch(e){}
    const lien=navigator.onLine===false?['mal','HORS LIGNE']:ok?['ok','EN LIGNE']:['att','VERROUILLÉE'];
    b.dataset.etat=lien[0]; b.querySelector('span').textContent=lien[1]; b.title=verrou?'Entre ton code dans les réglages pour relier Raylé':'';
    hors.hidden=navigator.onLine!==false;
  }
  $('m-puce-lien').addEventListener('click',()=>{ const g=$('gear'); if(g) g.click(); });
  window.addEventListener('online',majLien); window.addEventListener('offline',majLien); setInterval(majLien,8000); majLien();
  RayleBus.on('etat:raylé',majLien);

  /* ───── bouton voix : reflète l'état de Raylé ───── */
  const NOM_ETAT={idle:['coupe','Parler'],veille:['veille','Veille'],listening:['ecoute','J’écoute'],thinking:['reflechit','Réflexion'],speaking:['parle','Je parle']};
  function majVoix(){
    const e=corps.dataset.etat||'idle', v=$('m-voix'), t=$('m-voix-txt'); if(!v) return;
    const mic=$('btn'); const actif=mic&&/\bon\b|veille/.test(mic.className);
    const x=NOM_ETAT[e]||NOM_ETAT.idle; v.dataset.etat=e==='idle'&&actif?'veille':x[0]; t.textContent=e==='idle'&&actif?'Veille':x[1];
  }
  new MutationObserver(majVoix).observe(corps,{attributes:true,attributeFilter:['data-etat']});
  if($('btn')) new MutationObserver(majVoix).observe($('btn'),{attributes:true,attributeFilter:['class']}); majVoix();

  /* ───── écrire à Raylé (clavier) ───── */
  $('m-ecrire').addEventListener('click',()=>{
    feuille({titre:'Écrire à Raylé',rendre(c,o){
      c.innerHTML='<form class="m-ecrire-f" autocomplete="off"><input type="text" enterkeyhint="send" autocapitalize="sentences" placeholder="Une question, un ordre…" aria-label="Message à Raylé" style="width:100%;min-height:52px;padding:0 14px;font:16px var(--m-sans);color:#fff;background:rgba(143,208,227,.07);border:1px solid var(--m-trait-fort)"><p class="m-faible" style="margin:10px 2px">Exemples : « donne-moi l’actualité en France », « affiche le terminal », « ouvre l’agent », « montre-moi des images de Napoléon ».</p></form>';
      const f=c.querySelector('form'), i=c.querySelector('input'); setTimeout(()=>i.focus(),300);
      f.addEventListener('submit',ev=>{ ev.preventDefault(); const t=i.value.trim(); if(!t) return; o.fermer(); envoyer(t); });
    }});
  });
  function envoyer(t){ try{ if(typeof addLine==='function') addLine('user',t); if(typeof respond==='function') respond(t); }catch(e){ console.error(e); } }

  /* ───── gouverneur de performance ───── */
  const reduit=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):null;
  let batterie=null; try{ if(navigator.getBattery) navigator.getBattery().then(b=>{ batterie=b; evaluer(); b.addEventListener('levelchange',evaluer); b.addEventListener('chargingchange',evaluer); }).catch(()=>{}); }catch(e){}
  const suivi=C.suivreImages({niveau:0}); let niveau=0;
  function evaluer(){
    const eco=!!(batterie&&!batterie.charging&&batterie.level<=.2)||lire('rayle_m_eco')==='1';
    html.classList.toggle('m-eco',eco||!!(reduit&&reduit.matches));
    try{ if(window.Entite&&Entite.qualite&&eco&&niveau<1) niveau=Math.max(niveau,1); }catch(e){}
    appliquerNiveau();
  }
  function appliquerNiveau(){
    html.classList.toggle('m-niveau-1',niveau>=1); html.classList.toggle('m-niveau-2',niveau>=2);
    try{ RayleBus.fusion('mobile',{niveau}); RayleBus.emit('mobile:niveau',{niveau}); }catch(e){}
    try{ if(window.Entite&&Entite.qualite&&niveau>=2) Entite.qualite(3,{temporaire:true}); }catch(e){}   // dessin 2D de secours, pour la visite seulement
  }
  let t0=performance.now(), n=0;
  function mesure(now){
    n++; if(now-t0>=1000){ const fps=n*1000/(now-t0); n=0; t0=now; if(!document.hidden){ const avant=suivi.niveau(); suivi.echantillon(fps,now); if(suivi.niveau()!==avant){ niveau=suivi.niveau(); appliquerNiveau(); } } window.__mFps=Math.round(fps); }
    requestAnimationFrame(mesure);
  }
  requestAnimationFrame(mesure);
  document.addEventListener('visibilitychange',()=>{ html.classList.toggle('m-masque',document.hidden); try{ RayleBus.emit('mobile:visible',{visible:!document.hidden}); }catch(e){} });
  if(reduit) reduit.addEventListener&&reduit.addEventListener('change',evaluer);
  evaluer();

  /* ───── vues existantes qui prennent tout l'écran (terminal, carte) : la coque se range ───── */
  const obs=new MutationObserver(()=>{ html.classList.toggle('m-vue-externe',corps.classList.contains('vue-terminal')||corps.classList.contains('hote-ouvert')); });
  obs.observe(corps,{attributes:true,attributeFilter:['class']});

  /* ───── bannière « Nouvelle version disponible » ───── */
  function bannièreMaj(texte,action){
    maj.hidden=false; maj.innerHTML='<span>'+esc(texte)+'</span><button type="button" class="m-bouton">Actualiser</button>';
    maj.querySelector('button').addEventListener('click',action);
  }

  window.MobileCoque={enregistrer,aller,feuille,fermerFeuilles,ecran:()=>courant,vibrer,envoyer,bannièreMaj,niveau:()=>niveau,$:$};

  /* ───── modules chargés APRÈS le chargement de la page ─────
     Le lot critique (calculs, données, coque, accueil) est synchrone : l'accueil s'affiche vite. Le reste (météo, actualités, marchés, agent, graphique, voix, menu Plus, mises à jour) arrive juste après,
     en parallèle mais exécuté dans l'ordre ; chaque module se branche à son arrivée (événement mobile:module). Un écran demandé avant l'arrivée de son module affiche un squelette. */
  const LOT=['mobile-voix','mobile-marche','mobile-agent-donnees','mobile-meteo','mobile-actus','mobile-maj','mobile-plus','mobile-agent-calcul','mobile-graphique','core/commun/trader-vue','mobile-agent'];
  function chargerLot(){
    const l=document.createElement('link'); l.rel='stylesheet'; l.href='core/mobile/mobile-agent.css'; document.head.appendChild(l);
    const lt=document.createElement('link'); lt.rel='stylesheet'; lt.href='core/commun/trader-vue.css'; document.head.appendChild(lt);
    for(const f of LOT){ const s=document.createElement('script'); s.src=(f.indexOf('/')>=0?f:'core/mobile/'+f)+'.js'; s.async=false; s.onload=s.onerror=()=>{ try{ RayleBus.emit('mobile:module',{nom:f}); }catch(e){} }; document.head.appendChild(s); }
  }
  const apresChargement=()=>{ (window.requestIdleCallback||(f=>setTimeout(f,150)))(chargerLot,{timeout:1200}); };
  if(document.readyState==='complete') apresChargement(); else window.addEventListener('load',apresChargement);

  /* ───── réglages : sections du PC sans objet sur mobile ───── */
  (function(){ const cfg=$('cfg'); if(!cfg) return; const NOMS=/^(Tableau de bord|Mode multi-écrans|Mes écrans)/; let masque=false;
    for(const h of cfg.querySelectorAll('h3')){ masque=NOMS.test(h.textContent.trim())?true:(masque&&false); if(masque){ h.hidden=true; let n=h.nextElementSibling; while(n&&n.tagName!=='H3'){ n.hidden=true; n=n.nextElementSibling; } } } })();

  /* ───── démarrage : écran mémorisé ou accueil ───── */
  RayleBus.emit('mobile:pret',{});
  const initial=(location.hash||'').replace('#','');
  aller(C.ECRANS.includes(initial)?initial:'accueil');
})();
