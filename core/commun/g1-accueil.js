"use strict";
/* ═════════════ ACCUEIL G1 « AURORE » (thème par défaut ; Jarvis reste disponible : ⚙ Thème de l'accueil) ═════════════
   Structure inspirée d'un poste de pilotage d'IA personnelle (dessin original) :
   1. NOYAU énorme au centre (l'entité Raylé), entouré d'anneaux d'arcs et d'éclats angulaires roses qui tournent ;
   2. REPOS : seulement de fines colonnes de petit texte vivant (actualités, journal) à gauche et de petits graphiques discrets en haut à droite ;
   3. DOCK : longue vague rose lumineuse, bague d'état de Raylé à gauche, petite pastille de cinq icônes (Accueil, Vie, Communications, Espaces, Réglages) ;
   4. FENÊTRE À LA DEMANDE : UNE grande fenêtre verticale en verre devant le noyau (qui recule et se floute), ouverte par le dock, la voix ou la télécommande.
   Rien n'est inventé : les données viennent du tableau de bord (window.TableauBord.donnees()) ; absent = « — » ou « INDISPONIBLE » ; état vide propre sinon.
   Calculs purs : g1-contenu.js, g1-fenetres-calcul.js, graphique-bougies-calcul.js (testés). Thème et couleur stockés sur l'appareil (rayle_theme, rayle_g1_couleur). */
(function(){
  if(window.RAYLE_SATELLITE) return;
  const C=window.G1Contenu, T=window.TableauBordContenu, F=window.G1Fenetres, K=window.GraphiqueBougiesCalcul, scene=document.getElementById('scene'), corps=document.body;
  if(!C||!T||!F||!K||!scene||!window.RayleBus) return;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const lire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const ecrire=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
  const reduit=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):null;
  const mode=()=>corps.dataset.hud||'normal';
  const anime=()=>mode()!=='leger'&&!(reduit&&reduit.matches);
  const surAccueil=()=>!document.hidden&&!corps.classList.contains('vue-terminal')&&!corps.classList.contains('vue-galaxie');
  const poser=(el,t)=>{ if(el&&el.textContent!==t) el.textContent=t; };
  const maj=(el,html)=>{ if(!el) return; if(el.dataset.sig!==html){ el.dataset.sig=html; el.innerHTML=html; } };
  const hhmm=t=>new Date(t).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});

  /* ───── thème et couleur du noyau ───── */
  let theme=C.themeValide(lire('rayle_theme')), couleur=C.couleurValide(lire('rayle_g1_couleur'));
  let modEtats=null;
  const chargerEtats=()=>modEtats||(modEtats=import(new URL('skins/neurone/etats-reseau.js',document.baseURI).href).catch(()=>null));
  async function appliquerPalette(){
    const m=await chargerEtats(); if(!m) return;
    const actif=theme==='aurore'&&surAccueil();
    C.appliquerPalette(m.ETATS,m.CASCADES,actif?couleur:null);
  }
  function appliquerTheme(){
    corps.classList.toggle('g1',theme==='aurore');
    corps.dataset.g1c=couleur;
    corps.classList.toggle('tb-actif-g1',theme==='aurore');
    appliquerPalette(); if(theme==='aurore'){ placerNoyau(); rafraichir(); }
  }

  /* ───── structure ───── */
  const racine=document.createElement('div'); racine.className='g1-racine'; racine.id='g1';
  racine.innerHTML=
    '<div class="g1-haut"><nav class="g1-fil-ariane" id="g1Ariane" aria-label="Fil d’Ariane"><span>Accueil</span></nav><span class="g1-titre">Raylé · poste central</span></div>'
   +'<svg class="g1-anneaux" id="g1Anneaux" viewBox="-100 -100 200 200" aria-hidden="true"><g class="a1"><path d="M-92 0A92 92 0 0 1 0 -92"/><path d="M92 0A92 92 0 0 1 0 92"/></g><g class="a2"><path d="M-80 20A82 82 0 0 1 20 -80"/><path d="M80 -20A82 82 0 0 1 -20 80"/><path d="M-46 -68A82 82 0 0 1 46 -68" class="fin"/></g><g class="a3"><path d="M-70 0A70 70 0 0 0 70 0" class="fin"/><path d="M-98 30A102 102 0 0 1 -30 -98" class="fin"/></g></svg>'
   +'<svg class="g1-eclats" id="g1Eclats" viewBox="-100 -100 200 200" aria-hidden="true"><g class="e0"></g><g class="e1"></g><g class="e2"></g></svg>'
   +'<aside class="g1-fil" id="g1Fil" aria-label="Fil d’actualités et journal"></aside>'
   +'<aside class="g1-graphs" id="g1Graphs" aria-label="Graphiques discrets"></aside>'
   +'<div class="g1-fond-clic" hidden></div>'
   +'<section class="g1-fen" id="g1Fen" hidden role="dialog" aria-modal="false" aria-labelledby="g1FenTitre"><h2 class="g1-fen-titre" id="g1FenTitre"></h2><div class="g1-fen-cadre"><div class="g1-fen-barre"><nav class="g1-fen-onglets" id="g1Onglets" role="tablist" aria-label="Contenus"></nav><button type="button" class="g1-fen-x" id="g1FenX" aria-label="Fermer la fenêtre">✕</button></div><div class="g1-fen-corps" id="g1FenC"></div><footer class="g1-fen-pied" id="g1FenP"></footer></div></section>'
   +'<div class="g1-dock" id="g1Dock"><canvas class="g1-vague" id="g1Vague" aria-hidden="true"></canvas><div class="g1-dock-in">'
   +'<button type="button" class="g1-etat" id="g1Etat" aria-label="Raylé : toucher pour parler ou couper"><i></i><span id="g1EtatT">COUPÉ</span></button><div class="g1-icones" id="g1Icones"></div></div>'
   +'<div class="g1-menu" id="g1Menu" hidden></div></div>';
  scene.appendChild(racine);
  const fond=racine.querySelector('.g1-fond-clic'), fen=$('g1Fen');

  /* ───── placement du noyau : anneaux et éclats centrés sur le réacteur ───── */
  function placerNoyau(){
    const r=$('reactor'); if(!r||!r.offsetParent) return; const b=r.getBoundingClientRect(), s=scene.getBoundingClientRect();
    if(!b.width) return;
    const d=Math.round(b.width*0.84);
    racine.style.setProperty('--g1-cx',Math.round(b.left-s.left+b.width/2)+'px'); racine.style.setProperty('--g1-cy',Math.round(b.top-s.top+b.height/2)+'px'); racine.style.setProperty('--g1-d',d+'px');
  }
  window.addEventListener('resize',()=>{ placerNoyau(); tailleVague(); if(!anime()) peindreVague(0); });
  if(window.ResizeObserver){ const ro=new ResizeObserver(()=>placerNoyau()); ro.observe($('reactor')||scene); }
  function dessinerEclats(){
    const g=$('g1Eclats'); if(!g) return; const n=mode()==='complet'?24:mode()==='leger'?0:16;
    if(g.dataset.n===String(n)) return; g.dataset.n=String(n);
    const l=F.eclats(n,7), gr=[g.querySelector('.e0'),g.querySelector('.e1'),g.querySelector('.e2')];
    gr.forEach(x=>{ x.innerHTML=''; });
    gr[0].innerHTML=gr[1].innerHTML=gr[2].innerHTML='';
    for(const e of l) gr[e.anneau].insertAdjacentHTML('beforeend','<polygon points="'+e.pts.map(p=>p.join(',')).join(' ')+'" style="opacity:'+e.opacite+'" class="'+(e.plein?'p':'v')+'"/>');
  }

  /* ───── données (mêmes sources que l'accueil Jarvis) ───── */
  const D=()=>{ try{ return window.TableauBord?window.TableauBord.donnees():{}; }catch(e){ return {}; } };
  let meteoDet=null, alertes=[], journal=[], messages=[], taches=F.normaliserTaches((()=>{ try{ return JSON.parse(lire('rayle_g1_taches')||'[]'); }catch(e){ return []; } })());
  const noter=(type,texte)=>{ journal=F.ajouterJournal(journal,{type,texte}); if(theme==='aurore') dessinerFil(); };
  RayleBus.on('raylé:alerte-prix',d=>{ const t=String((d&&(d.texte||d.message||d.nom))||'Alerte de prix').slice(0,80); alertes.unshift({t:Date.now(),txt:t}); alertes=alertes.slice(0,8); noter('alerte',t); majFenetre(); });
  RayleBus.on('raylé:alerte',d=>{ const t=String((d&&(d.texte||d.message))||'Alerte').slice(0,80); alertes.unshift({t:Date.now(),txt:t}); alertes=alertes.slice(0,8); noter('alerte',t); majFenetre(); });
  RayleBus.on('raylé:question',d=>{ const t=String((d&&d.texte)||'').trim(); if(!t) return; messages.push({t:Date.now(),de:'vous',texte:t.slice(0,300)}); messages=messages.slice(-30); noter('question','Vous : '+t); majFenetre(); });
  RayleBus.on('raylé:reponse',d=>{ const t=String((d&&d.texte)||'').trim(); if(!t) return; messages.push({t:Date.now(),de:'rayle',texte:t.slice(0,300)}); messages=messages.slice(-30); noter('reponse','Raylé : '+t); majFenetre(); });
  noter('info','Poste central prêt');

  const spark=(vals,l,h,cls)=>{ const c=K.courbe(vals,l,h,2); return c?'<svg class="g1-sp '+(cls||'')+'" viewBox="0 0 '+l+' '+h+'" preserveAspectRatio="none" aria-hidden="true"><path d="'+c.d+'"/><circle cx="'+c.dernier[0]+'" cy="'+c.dernier[1]+'" r="1.8"/></svg>':'<span class="g1-nd">—</span>'; };

  /* ───── repos : colonne de texte vivant (gauche) et petits graphiques (haut à droite) ───── */
  function dessinerFil(){
    const a=D().actus, t=[];
    t.push('<div class="g1-fil-t">Actualités</div>');
    if(!a) t.push('<p class="g1-fil-v">Lecture…</p>');
    else if(a.erreur) t.push('<p class="g1-fil-v g1-ko">INDISPONIBLE : '+esc(a.erreur)+'</p>');
    else if(!a.titres||!a.titres.length) t.push('<p class="g1-fil-v">Aucune actualité reçue.</p>');
    else t.push('<ul class="g1-fil-l">'+a.titres.slice(0,mode()==='leger'?3:6).map(x=>'<li data-ouvre="actus"><b>'+esc(x.titre)+'</b><small>'+esc(x.source||'')+(x.quand?' · '+esc(x.quand):'')+'</small></li>').join('')+'</ul>');
    t.push('<div class="g1-fil-t">Journal</div>');
    t.push(journal.length?'<ul class="g1-fil-j">'+journal.slice(0,mode()==='leger'?3:6).map(x=>'<li data-type="'+x.type+'"><time>'+hhmm(x.t)+'</time><span>'+esc(x.texte)+'</span></li>').join('')+'</ul>':'<p class="g1-fil-v">Rien pour l’instant.</p>');
    maj($('g1Fil'),t.join(''));
  }
  const PETITS=[['BTC','BTC'],['XAU','OR'],['US100','US100']];
  function dessinerGraphes(){
    const mk=D().marche, el=$('g1Graphs'); if(!el) return;
    if(!mk){ maj(el,'<p class="g1-fil-v">Marché : lecture…</p>'); return; }
    if(mk.erreur){ maj(el,'<p class="g1-fil-v g1-ko">Marché INDISPONIBLE</p>'); return; }
    maj(el,PETITS.map(([id,nom])=>{
      const q=(mk.lignes||[]).find(x=>x.id===id);
      if(!q||q.vide) return '<button type="button" class="g1-pg" data-inst="'+id+'"><small>'+nom+'</small><span class="g1-nd">indispo.</span></button>';
      const v=T.variation(q.pct);
      return '<button type="button" class="g1-pg" data-inst="'+id+'" data-s="'+v.sens+'"><small>'+nom+'</small>'+spark(q.courbe,86,22,'bl')+'<b>'+T.prix(q.prix,q.decimales)+'</b><em>'+v.texte+'</em></button>';
    }).join(''));
  }
  racine.addEventListener('click',ev=>{
    const g=ev.target.closest('.g1-pg'); if(g){ ouvrir('marche'); if(ctrlGraph&&g.dataset.inst) ctrlGraph.choisir(g.dataset.inst); return; }
    const o=ev.target.closest('[data-ouvre]'); if(o&&o.closest('#g1Fil')){ ouvrir(o.dataset.ouvre); return; }
  });

  /* ───── météo détaillée (Open-Meteo : prévision + qualité de l'air) ───── */
  let meteoCle='', meteoT=0;
  async function chargerMeteoDetail(force){
    const r=(T.lireReglages(lire).meteo)||{}; if(r.lat==null){ meteoDet={etat:'aucune'}; majFenetre('meteo'); return; }
    const cle=r.lat+','+r.lon; if(!force&&cle===meteoCle&&Date.now()-meteoT<15*60e3) return; meteoCle=cle; meteoT=Date.now();
    try{
      const [a,b]=await Promise.all([
        fetch(C.urlPrevision(r.lat,r.lon),{cache:'no-store'}).then(x=>{ if(!x.ok) throw new Error('HTTP '+x.status); return x.json(); }),
        fetch(C.urlAir(r.lat,r.lon),{cache:'no-store'}).then(x=>x.ok?x.json():null).catch(()=>null)]);
      meteoDet={etat:'ok',nom:r.nom||'Ma position',m:C.resumeDetail(a,b)};
    }catch(e){ meteoDet={etat:'indispo',raison:String((e&&e.message)||e).slice(0,80)}; }
    majFenetre('meteo');
  }
  function enregistrerVille(nom,lat,lon){
    const brut=Object.assign({},T.lireReglages(lire),{meteo:{nom,lat,lon}});
    if(window.TableauBord&&TableauBord.definirReglages){ try{ TableauBord.definirReglages(brut); }catch(e){ T.ecrireReglages(ecrire,T.normaliserReglages(brut)); } } else T.ecrireReglages(ecrire,T.normaliserReglages(brut));
    meteoDet=null; meteoCle=''; try{ if(window.TableauBord) TableauBord.rafraichir(); }catch(e){} chargerMeteoDetail(true);
  }
  const tuilesMeteo=x=>{ const t=(v,u,d)=>v==null?'—':T.nombre(v,d||0)+(u||''); return [['Température',t(x.temp,'°')],['Ressenti',t(x.ressenti,'°')],['Min – max',t(x.min,'°')+' – '+t(x.max,'°')],['Qualité de l’air',x.aqi==null?'—':Math.round(x.aqi)+' · '+C.niveauAir(x.aqi)],['Indice UV',x.uv==null?'—':T.nombre(x.uv,1)],['Humidité',t(x.hum,' %')],['Vent',t(x.vent,' km/h')],['Pluie',t(x.pluie,' %')]]; };
  function htmlMeteo(){
    const m=meteoDet;
    if(!m) return '<p class="g1-vide">Lecture de la météo…</p>';
    if(m.etat==='aucune') return '<p class="g1-vide">Aucune ville choisie : cherche une ville ci-dessus, ou touche « Utiliser ma position ».</p>';
    if(m.etat!=='ok') return '<p class="g1-vide g1-ko">INDISPONIBLE : '+esc(m.raison)+'</p>';
    const x=m.m, jour=C.courbeJour(x.heures,300,80);
    return '<div class="g1-lieu"><b>'+esc(m.nom)+'</b><em data-etat="reel">RÉEL</em></div>'
      +'<div class="g1-tuiles">'+tuilesMeteo(x).map(a=>'<div><small>'+a[0]+'</small><b>'+esc(a[1])+'</b></div>').join('')+'</div>'
      +'<div class="g1-jour"><small>Toute la journée</small>'+(jour?'<svg viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="g1Grad" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#ffd27a"/><stop offset=".5" stop-color="#ff5aa5"/><stop offset="1" stop-color="#5aa0ff"/></linearGradient><linearGradient id="g1GradA" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#ffd27a" stop-opacity=".22"/><stop offset=".5" stop-color="#ff5aa5" stop-opacity=".2"/><stop offset="1" stop-color="#5aa0ff" stop-opacity=".2"/></linearGradient></defs><path class="aire" d="'+jour.aire+'" fill="url(#g1GradA)"/><path class="trait" d="'+jour.d+'" stroke="url(#g1Grad)"/>'+(jour.maintenant!=null?'<line class="now" x1="'+jour.maintenant+'" x2="'+jour.maintenant+'" y1="0" y2="80"/>':'')+'</svg>':'<span class="g1-nd">—</span>')
      +'<div class="g1-soleil"><span>↑ '+esc(x.lever||'—')+'</span><span>↓ '+esc(x.coucher||'—')+'</span></div></div>'
      +'<div class="g1-petites"><div><small>Qualité de l’air</small>'+spark(x.serieAir,80,24,'bl')+'</div><div><small>Ressenti</small>'+spark(x.serieRessenti,80,24,'ja')+'</div><div><small>Humidité</small>'+spark(x.serieHum,80,24,'bl')+'</div></div>';
  }

  /* ───── contenus de la grande fenêtre ───── */
  let courant=null, ctrlGraph=null;
  const lignesAgent=()=>{ const d=D(); return T.lignesAgent(d.reels||{},d.pilote||null); };
  const BOUTONS_PIED={meteo:null,afaire:null,messages:null,sante:['Ouvrir l’anatomie 3D (Saturne)','sante'],marche:['Ouvrir la vue complète','marche'],actus:['Ouvrir la vue complète','actus'],alertes:['Ouvrir l’agent de Mars','agent'],terre:['Ouvrir la vue complète','terre'],systemes:['Ouvrir les réglages','reglages']};
  const SQUELETTES={
    meteo:()=>'<div class="g1-rech"><input id="g1Ville" type="search" placeholder="Rechercher une ville" autocomplete="off" spellcheck="false" aria-label="Rechercher une ville"><button type="button" data-a="ville">Chercher</button><button type="button" data-a="position">Utiliser ma position</button></div><div class="g1-res" id="g1Res" aria-live="polite"></div><div data-z="meteo"></div>',
    afaire:()=>'<div data-z="compteurs"></div><form class="g1-ajout" id="g1Ajout"><input id="g1Tache" type="text" maxlength="140" placeholder="Nouvelle tâche" aria-label="Nouvelle tâche" autocomplete="off"><input id="g1TacheDate" type="date" aria-label="Échéance (facultatif)"><button type="submit">Ajouter</button></form><div data-z="liste"></div>',
    messages:()=>'<div data-z="messages"></div>',
    sante:()=>'<div data-z="sante"></div>',
    marche:()=>'<div class="g1-marche" id="g1Marche"></div>',
    actus:()=>'<div data-z="actus"></div>',
    alertes:()=>'<div data-z="alertes"></div>',
    terre:()=>'<div data-z="terre"></div>',
    systemes:()=>'<div data-z="systemes"></div>'
  };
  function silhouette(){
    return '<svg class="g1-corps" viewBox="0 0 120 250" aria-label="Silhouette humaine"><defs><linearGradient id="g1Sil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5aa5"/><stop offset="1" stop-color="#5aa0ff"/></linearGradient></defs><g fill="none" stroke="url(#g1Sil)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'
      +'<circle cx="60" cy="24" r="14"/><path d="M52 38v10M68 38v10M52 48C38 50 30 54 28 66l-6 56 8 2 8-40M68 48c14 2 22 6 24 18l6 56-8 2-8-40"/><path d="M52 48h16l2 70c0 6 0 10-2 14l2 52-8 2-4-60-4 60-8-2 2-52c-2-4-2-8-2-14z"/><path d="M60 52v66M44 72h32M46 96h28" class="fin"/><circle cx="60" cy="70" r="3" class="pt"/><circle cx="44" cy="150" r="2.4" class="pt"/><circle cx="76" cy="150" r="2.4" class="pt"/></g></svg>';
  }
  function zone(z){ return $('g1FenC').querySelector('[data-z="'+z+'"]'); }
  const RENDU={
    meteo(){ maj(zone('meteo'),htmlMeteo()); },
    afaire(){
      const c=F.compteurs(taches), l=F.trier(taches);
      maj(zone('compteurs'),'<div class="g1-cpt"><div><b>'+c.ouvertes+'</b><small>ouvertes</small></div><div data-alerte="'+(c.retard?1:0)+'"><b>'+c.retard+'</b><small>en retard</small></div><div><b>'+c.aujourdhui+'</b><small>pour aujourd’hui</small></div></div>');
      maj(zone('liste'),l.length?'<ul class="g1-todo">'+l.map(t=>'<li data-id="'+esc(t.id)+'" data-fait="'+(t.fait?1:0)+'"><button type="button" class="g1-coche" data-a="coche" role="checkbox" aria-checked="'+(t.fait?'true':'false')+'" aria-label="Cocher : '+esc(t.texte)+'"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5"/><path d="M6 10.5l3 3 5-6"/></svg></button><span>'+esc(t.texte)+(t.date?'<small>'+esc(t.date.split('-').reverse().join('/'))+'</small>':'')+'</span><button type="button" class="g1-sup" data-a="sup" aria-label="Supprimer">✕</button></li>').join('')+'</ul>':'<p class="g1-vide">Aucune tâche. Ajoute-en une ci-dessus : elles restent sur cet appareil seulement.</p>');
    },
    messages(){
      maj(zone('messages'),messages.length?'<ul class="g1-msgs">'+messages.slice().reverse().map(m=>'<li data-de="'+m.de+'"><time>'+hhmm(m.t)+'</time><b>'+(m.de==='vous'?'Vous':'Raylé')+'</b><span>'+esc(m.texte)+'</span></li>').join('')+'</ul>':'<p class="g1-vide">Aucun échange depuis l’ouverture. Dis « Raylé » pour lui parler.</p>');
    },
    sante(){
      maj(zone('sante'),'<div class="g1-sante">'+silhouette()+'<ul class="g1-ind">'+['Fréquence cardiaque','Sommeil','Pas du jour','Poids'].map(n=>'<li><span>'+n+'</span><b>—</b><em data-etat="indispo">NON CONNECTÉ</em></li>').join('')+'</ul></div><p class="g1-vide">Aucun capteur de santé n’est relié à Raylé : rien n’est affiché plutôt que des valeurs inventées. L’anatomie 3D est dans le vaisseau de Saturne.</p>');
    },
    actus(){
      const a=D().actus;
      maj(zone('actus'),!a?'<p class="g1-vide">Lecture…</p>':a.erreur?'<p class="g1-vide g1-ko">INDISPONIBLE : '+esc(a.erreur)+'</p>':a.titres&&a.titres.length?'<ul class="g1-liste g1-actus">'+a.titres.slice(0,10).map(t=>'<li><i class="pt"></i><div><b>'+esc(t.titre)+'</b><small>'+esc(t.source||'')+(t.quand?' · '+esc(t.quand):'')+'</small></div></li>').join('')+'</ul>':'<p class="g1-vide">Aucune actualité reçue.</p>');
    },
    alertes(){
      const ag=lignesAgent();
      maj(zone('alertes'),(alertes.length?'<ul class="g1-liste">'+alertes.map(a=>'<li><i class="pt"></i><div><b>'+esc(a.txt)+'</b><small>'+T.age(a.t,Date.now())+'</small></div></li>').join('')+'</ul>':'<p class="g1-vide">Aucune alerte depuis l’ouverture.</p>')+'<h4 class="g1-sous">Agent de Mars</h4>'+(ag.length?'<ul class="g1-agent">'+ag.slice(0,5).map(x=>'<li data-ton="'+x.ton+'"><span>'+esc(x.nom)+'</span><b>'+esc(x.valeur)+'</b></li>').join('')+'</ul>':'<p class="g1-vide">Agent : aucune donnée.</p>'));
    },
    terre(){
      const t=D().terre;
      maj(zone('terre'),!t?'<p class="g1-vide">Lecture…</p>':t.erreur?'<p class="g1-vide g1-ko">INDISPONIBLE : '+esc(t.erreur)+'</p>':t.lignes.length?'<ul class="g1-liste">'+t.lignes.map(l=>'<li data-sev="'+l.severite+'"><i class="pt"></i><div><b>'+esc(l.titre)+'</b><small>'+esc(l.age)+'</small></div></li>').join('')+'</ul>':'<p class="g1-vide">Rien de notable ces dernières 48 h.</p>');
    },
    systemes(){
      let worker=false; try{ worker=!!workerReady(); }catch(e){} let info=null; try{ info=Entite.info(); }catch(e){}
      const l=T.lignesSysteme({worker,veilleur,etat:corps.dataset.etat||'idle',mode:mode(),fps:info&&info.fps}), ok=l.filter(x=>x.ton==='ok').length, pct=Math.round(100*ok/Math.max(1,l.length));
      maj(zone('systemes'),'<div class="g1-pct"><b>'+pct+' %</b><small>systèmes en état</small></div><ul class="g1-sys">'+l.map(x=>'<li data-ton="'+x.ton+'"><i class="led"></i><span>'+esc(x.nom)+'</span><b>'+esc(x.valeur)+'</b></li>').join('')+'</ul>');
    },
    marche(){}
  };
  let veilleur=null;
  async function sonderVeilleur(){ try{ const r=await fetch('/__veilleur/etat',{cache:'no-store'}); veilleur=r.ok?!!(await r.json()).enMarche:null; }catch(e){ veilleur=null; } majFenetre('systemes'); }
  const ecMeteo=[];
  function majFenetre(seul){ if(seul==='meteo') ecMeteo.forEach(f=>{ try{ f(); }catch(e){} }); if(courant&&(!seul||seul===courant)&&RENDU[courant]) RENDU[courant](); }
  const sauverTaches=()=>ecrire('rayle_g1_taches',JSON.stringify(taches));

  function onglets(){
    $('g1Onglets').innerHTML=F.ONGLETS.map(o=>'<button type="button" role="tab" data-t="'+o.id+'" aria-selected="'+(o.id===courant)+'" class="'+(o.id===courant?'on':'')+'">'+o.titre+'</button>').join('');
    const on=$('g1Onglets').querySelector('.on'); if(on&&on.scrollIntoView&&anime()) try{ on.scrollIntoView({block:'nearest',inline:'center'}); }catch(e){}
  }
  function pied(){
    const b=BOUTONS_PIED[courant]; $('g1FenP').innerHTML=b?'<button type="button" class="g1-plus" data-vue="'+b[1]+'">'+b[0]+'</button>':'';
    $('g1FenP').hidden=!b;
  }
  function ouvrir(id){
    if(!F.idValide(id)) return false;
    if(corps.classList.contains('avec-panneaux')&&window.Panneaux) try{ Panneaux.fermerTout(); }catch(e){}
    const premier=!courant; if(ctrlGraph){ ctrlGraph.detruire(); ctrlGraph=null; }
    courant=id; fen.hidden=false; fond.hidden=false; corps.classList.add('g1-grand');
    const titre=F.ONGLETS.find(o=>o.id===id).titre; poser($('g1FenTitre'),titre); fen.dataset.id=id;
    $('g1FenC').innerHTML=SQUELETTES[id](); $('g1FenC').scrollTop=0; onglets(); pied();
    $('g1Ariane').innerHTML='<span>Accueil</span> › <span>'+esc(titre)+'</span>';
    if(premier){ fen.classList.remove('sortie'); fen.classList.remove('entre'); void fen.offsetWidth; fen.classList.add('entre'); }
    if(id==='marche'&&window.GraphiqueBougies) ctrlGraph=GraphiqueBougies.monter($('g1Marche'),{leger:mode()==='leger'});
    if(id==='meteo') chargerMeteoDetail(); if(id==='systemes') sonderVeilleur();
    RENDU[id](); return true;
  }
  function fermer(){
    if(!courant) return false;
    if(ctrlGraph){ ctrlGraph.detruire(); ctrlGraph=null; }
    courant=null; corps.classList.remove('g1-grand'); fond.hidden=true; $('g1Ariane').innerHTML='<span>Accueil</span>';
    if(anime()){ fen.classList.remove('entre'); fen.classList.add('sortie'); setTimeout(()=>{ if(!courant){ fen.hidden=true; fen.classList.remove('sortie'); } },260); } else fen.hidden=true;
    return true;
  }
  $('g1FenX').addEventListener('click',fermer);
  fond.addEventListener('click',fermer);
  $('g1Onglets').addEventListener('click',ev=>{ const b=ev.target.closest('[data-t]'); if(b) ouvrir(b.dataset.t); });
  document.addEventListener('keydown',ev=>{ if(ev.key==='Escape'&&courant){ fermer(); ev.stopPropagation(); } },true);

  const VUES={
    meteo:()=>{ const g=$('gear'); if(g) g.click(); },
    actus:()=>{ if(window.ActusAccueil) ActusAccueil.ouvrir('france'); },
    marche:()=>{ const b=$('btnOuvrirTerminal'); if(b) b.click(); },
    terre:()=>{ if(window.DirectPage) DirectPage.ouvrirHub('evenements').catch(()=>{}); },
    agent:()=>{ try{ if(window.TableauBord) window.TableauBord.ouvrir('agent'); }catch(e){} },
    sante:()=>allerPlanete('saturne'),
    reglages:()=>{ const g=$('gear'); if(g) g.click(); }
  };
  $('g1Fen').addEventListener('click',async ev=>{
    const p=ev.target.closest('.g1-plus'); if(p){ const v=p.dataset.vue; fermer(); if(VUES[v]) VUES[v](); return; }
    const a=ev.target.closest('[data-a]'); if(!a) return; const act=a.dataset.a;
    if(act==='coche'){ taches=F.basculer(taches,a.closest('li').dataset.id); sauverTaches(); RENDU.afaire(); }
    else if(act==='sup'){ taches=F.supprimer(taches,a.closest('li').dataset.id); sauverTaches(); RENDU.afaire(); }
    else if(act==='ville') rechercherVille();
    else if(act==='position') utiliserPosition();
    else if(act==='choisir'){ const nom=a.dataset.nom, lat=+a.dataset.lat, lon=+a.dataset.lon; $('g1Res').innerHTML=''; $('g1Ville').value=nom; enregistrerVille(nom,lat,lon); }
  });
  $('g1Fen').addEventListener('submit',ev=>{
    if(ev.target.id!=='g1Ajout') return; ev.preventDefault();
    const t=$('g1Tache'), d=$('g1TacheDate'); if(!t.value.trim()) return;
    taches=F.ajouter(taches,t.value,d.value||null); sauverTaches(); t.value=''; d.value=''; RENDU.afaire(); t.focus();
  });
  $('g1Fen').addEventListener('keydown',ev=>{ if(ev.key==='Enter'&&ev.target.id==='g1Ville'){ ev.preventDefault(); rechercherVille(); } });
  async function rechercherVille(){
    const q=($('g1Ville').value||'').trim(), res=$('g1Res'); if(q.length<2){ res.textContent='Tape au moins deux lettres.'; return; }
    res.textContent='Recherche…';
    try{
      const r=await fetch(T.urlGeocodage(q),{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status);
      const l=T.resultatsGeocodage(await r.json());
      res.innerHTML=l.length?'<span>Choisis la bonne ville :</span>'+l.slice(0,5).map(v=>'<button type="button" data-a="choisir" data-nom="'+esc(v.nom)+'" data-lat="'+v.lat+'" data-lon="'+v.lon+'">'+esc(v.nom)+'</button>').join(''):'Aucun résultat.';
    }catch(e){ res.textContent='INDISPONIBLE : '+String((e&&e.message)||e).slice(0,70); }
  }
  function utiliserPosition(dire){
    const res=typeof dire==='function'?dire:(m=>{ const e=$('g1Res'); if(e) e.textContent=m; }); if(!navigator.geolocation){ res('La position n’est pas disponible sur cet appareil.'); return; }
    res('Demande de position…');
    navigator.geolocation.getCurrentPosition(p=>{ res('Position trouvée.'); enregistrerVille('Ma position',+p.coords.latitude.toFixed(3),+p.coords.longitude.toFixed(3)); },()=>{ res('Position refusée ou indisponible : cherche une ville.'); },{timeout:10000,maximumAge:600000});   // demandée seulement au clic
  }

  /* ───── voix (appelée par phrase.js) ───── */
  async function commande(texte){
    if(theme!=='aurore'||!surAccueil()) return null;
    const o=F.reconnaitre(texte); if(!o) return null;
    if(o.action==='fermer') return fermer()?'Je ramène le noyau.':null;
    ouvrir(o.id); return 'Voici la fenêtre '+F.ONGLETS.find(x=>x.id===o.id).titre.toLowerCase()+'.';
  }

  /* ───── dock ───── */
  const IC={
    accueil:'<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/></svg>',
    vie:'<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    comm:'<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    espaces:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></svg>',
    reglages:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>'
  };
  const ICONES=[['accueil','Accueil'],['vie','Vie'],['comm','Communications'],['espaces','Espaces'],['reglages','Réglages']];
  $('g1Icones').innerHTML=ICONES.map(i=>'<button type="button" class="g1-ic" data-i="'+i[0]+'" aria-label="'+i[1]+'" title="'+i[1]+'"><span class="g1-ic-r">'+IC[i[0]]+'</span><small>'+i[1]+'</small></button>').join('');
  const PLANETES=[['terre','Terre'],['mars','Mars'],['saturne','Saturne'],['terminal','Terminal'],['galaxie','Galaxie'],['pays','Pays'],['sources','Sources'],['couper','Couper']];
  $('g1Menu').innerHTML=PLANETES.map(p=>'<button type="button" data-p="'+p[0]+'">'+p[1]+'</button>').join('');
  const clic=id=>{ const b=$(id); if(b) b.click(); };
  async function allerPlanete(cible){
    try{
      if(RayleBus.demander('vue')!=='galaxie') await RayleBus.demander('vue:ouvrir','galaxie');
      if(window.RayleGalaxie) await window.RayleGalaxie.preparer();
      await RayleOrdres.envoyer({de:'rayle',vers:'rayle',action:'aller_a',params:{cible}});
    }catch(e){}
  }
  $('g1Icones').addEventListener('click',ev=>{
    const b=ev.target.closest('[data-i]'); if(!b) return; const i=b.dataset.i, menu=$('g1Menu');
    if(i!=='espaces') menu.hidden=true;
    if(i==='accueil'){ fermer(); try{ if(window.Panneaux) Panneaux.fermerTout(); }catch(e){} if(RayleBus.demander('vue')!=='rayle') RayleBus.emit('vue:demande',{vue:'rayle'}); }
    else if(i==='vie') ouvrir('meteo');
    else if(i==='comm') ouvrir('messages');
    else if(i==='espaces') menu.hidden=!menu.hidden;
    else if(i==='reglages') clic('gear');
  });
  $('g1Menu').addEventListener('click',ev=>{
    const b=ev.target.closest('[data-p]'); if(!b) return; $('g1Menu').hidden=true; const p=b.dataset.p;
    if(p==='terminal') clic('btnOuvrirTerminal'); else if(p==='galaxie') clic('btnOuvrirGalaxie'); else if(p==='pays') clic('btnPays'); else if(p==='sources') clic('btnSources'); else if(p==='couper') clic('btnCouper'); else allerPlanete(p);
  });
  document.addEventListener('pointerdown',ev=>{ if(!ev.target.closest('.g1-dock')) $('g1Menu').hidden=true; });
  $('g1Etat').addEventListener('click',()=>clic('btn'));

  /* ───── vague lumineuse du dock (canvas 2D, ~30 i/s, seulement visible et animé) ───── */
  const cv=$('g1Vague'), ctx=cv.getContext('2d'); let parts=[], tVague=0, rafV=0, dernierV=0;
  function tailleVague(){ const r=cv.getBoundingClientRect(), k=Math.min(1.5,window.devicePixelRatio||1); cv.width=Math.max(2,Math.round(r.width*k)); cv.height=Math.max(2,Math.round(r.height*k)); }
  function peindreVague(t){
    const w=cv.width, h=cv.height; if(w<4) return; ctx.clearRect(0,0,w,h);
    const P=C.PALETTES[couleur], acc=P.css, sec=P.css2, ampli=(corps.dataset.etat==='speaking'||corps.dataset.etat==='listening')?1.8:1, dpr=Math.min(1.5,window.devicePixelRatio||1);
    const yb=h*.5;
    for(let k=0;k<4;k++){
      ctx.beginPath();
      for(let x=0;x<=w;x+=6){ const u=x/w, env=Math.sin(Math.PI*u)*.55+.45; const y=yb+(Math.sin(u*7+t*(.7+k*.25)+k*1.7)*h*.13*ampli*(1-.18*k)+Math.sin(u*2.6-t*.45+k)*h*.1)*env; if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
      ctx.strokeStyle=k<2?acc:sec; ctx.globalAlpha=k===0?.95:k===1?.55:.28; ctx.lineWidth=(k===0?3:1.4)*dpr; ctx.shadowColor=acc; ctx.shadowBlur=k===0?18*dpr:k===1?8*dpr:0; ctx.stroke();
    }
    ctx.shadowBlur=0; ctx.fillStyle=acc;
    for(const p of parts){ p.u=(p.u+p.v)%1; const x=p.u*w, env=Math.sin(Math.PI*p.u)*.55+.45, y=yb+(Math.sin(p.u*7+t*.7)*h*.13*ampli+Math.sin(p.u*2.6-t*.45)*h*.1)*env+p.dy*h; ctx.globalAlpha=.2+.6*p.a; ctx.beginPath(); ctx.arc(x,y,p.r*dpr,0,6.283); ctx.fill(); }
    ctx.globalAlpha=1;
  }
  function boucleV(now){
    rafV=0;
    if(theme!=='aurore'||!surAccueil()||!anime()){ peindreVague(0); return; }
    if(now-dernierV>=33){ dernierV=now; tVague+=.033; peindreVague(tVague); }
    rafV=requestAnimationFrame(boucleV);
  }
  function demarrerVague(){
    if(!parts.length) parts=Array.from({length:60},()=>({u:Math.random(),v:.0004+Math.random()*.0012,dy:(Math.random()-.5)*.55,r:.7+Math.random()*1.5,a:Math.random()}));
    tailleVague(); if(!rafV) rafV=requestAnimationFrame(boucleV);
  }

  /* ───── cycle de vie : cadences, visibilité, mode ───── */
  function dessinerTout(){
    if(!surAccueil()) return;
    dessinerFil(); dessinerGraphes(); dessinerEclats(); poser($('g1EtatT'),C.libelleEtat(corps.dataset.etat||'idle',(()=>{ try{ return !!workerReady(); }catch(e){ return false; } })()));
    if(courant&&courant!=='meteo'&&courant!=='afaire') majFenetre();
  }
  function rafraichir(){ dessinerTout(); chargerMeteoDetail(); sonderVeilleur(); }
  function etatVisible(){
    corps.classList.toggle('g1-pause',!surAccueil());
    appliquerPalette();
    if(theme==='aurore'&&surAccueil()){ placerNoyau(); demarrerVague(); rafraichir(); } else if(courant&&!surAccueil()) fermer();
  }
  setInterval(()=>{ if(theme==='aurore'&&surAccueil()) dessinerTout(); },2000);
  setInterval(()=>{ if(theme==='aurore'&&surAccueil()) chargerMeteoDetail(); },60000);
  document.addEventListener('visibilitychange',etatVisible);
  RayleBus.on('vue:changee',etatVisible);
  new MutationObserver(()=>{ if(theme!=='aurore') return; dessinerEclats(); dessinerFil(); demarrerVague(); if(ctrlGraph) ctrlGraph.definirLeger(mode()==='leger'); }).observe(corps,{attributes:true,attributeFilter:['data-hud']});
  RayleBus.on('etat:raylé',()=>{ if(theme==='aurore') poser($('g1EtatT'),C.libelleEtat(corps.dataset.etat||'idle',(()=>{ try{ return !!workerReady(); }catch(e){ return false; } })())); });

  /* ───── réglages : thème et couleur du noyau ───── */
  const rg=document.createElement('div'); rg.id='g1Reglages';
  const cible=$('tbReglages');
  if(cible&&cible.parentNode) cible.parentNode.insertBefore(rg,cible);
  function dessinerReglages(){
    rg.innerHTML='<h3>Thème de l’accueil</h3><label for="g1Theme">Thème</label><select id="g1Theme"><option value="aurore"'+(theme==='aurore'?' selected':'')+'>Aurore (par défaut : noyau rose et bleu nuit, fenêtre à la demande, dock)</option><option value="jarvis"'+(theme==='jarvis'?' selected':'')+'>Jarvis (thème de secours : tableau de bord cyan)</option></select>'
      +'<label for="g1Couleur">Couleur du noyau (thème Aurore)</label><select id="g1Couleur">'+Object.keys(C.PALETTES).map(k=>'<option value="'+k+'"'+(k===couleur?' selected':'')+'>'+C.PALETTES[k].nom+'</option>').join('')+'</select>'
      +'<div class="hint">Les couleurs d’alerte (orange) et de réflexion (violet) ne changent pas. Réglage stocké sur cet appareil seulement.</div>';
  }
  rg.addEventListener('change',ev=>{
    if(ev.target.id==='g1Theme'){ theme=C.themeValide(ev.target.value); ecrire('rayle_theme',theme); appliquerTheme(); etatVisible(); }
    else if(ev.target.id==='g1Couleur'){ couleur=C.couleurValide(ev.target.value); ecrire('rayle_g1_couleur',couleur); appliquerTheme(); peindreVague(tVague); }
  });
  dessinerReglages();

  window.G1={theme:()=>theme,couleur:()=>couleur,fenetres:()=>F.ONGLETS.map(o=>o.id),ouvrir,fermer,courant:()=>courant,commande,graphique:()=>ctrlGraph,
    definir:(t,c)=>{ if(t) theme=C.themeValide(t); if(c) couleur=C.couleurValide(c); appliquerTheme(); etatVisible(); dessinerReglages(); },actualiser:rafraichir,taches:()=>taches.slice(),
    meteo:()=>meteoDet,lieu:()=>(T.lireReglages(lire).meteo)||{},surMeteo:f=>{ ecMeteo.push(f); },utiliserPosition,rechercherVilleMini:async nom=>{ const r=await fetch(T.urlGeocodage(nom),{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status); return T.resultatsGeocodage(await r.json()).slice(0,5); },choisirVille:enregistrerVille,allerPlanete,surAccueil,modeLeger:()=>mode()==='leger'};
  appliquerTheme(); dessinerEclats(); etatVisible(); setTimeout(()=>{ if(theme==='aurore') rafraichir(); },1500);
})();
