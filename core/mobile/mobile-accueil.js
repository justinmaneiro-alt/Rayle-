"use strict";
/* ═════════════ ACCUEIL VIVANT DE LA COQUE MOBILE (V8) ═════════════
   L'entité de Raylé (le moteur existant : réagit à la voix et au toucher, se simplifie toute seule si l'appareil rame) occupe le haut ; dessous, des cartes qui s'animent en cascade :
   heure et date · météo (position du téléphone) · actualités (carrousel avec images + bandeau défilant) · marchés (BTC, SOL, DOGE, or, US100 avec mini-courbes qui se dessinent) · agent de trading.
   Chaque carte s'ouvre en plein écran. Rien n'est inventé : donnée absente = « — » ou raison écrite. Animations par transform/opacity seulement ; figées quand l'écran est masqué ou niveau 2. */
(function(){
  const C=window.MobileCalcul, D=window.MobileDonnees, T=window.TableauBordContenu, Coque=window.MobileCoque; if(!C||!D||!Coque) return;
  const esc=C.esc;
  const SALUT=h=>h<5?'Bonne nuit':h<12?'Bonjour':h<18?'Bon après-midi':'Bonsoir';
  const JOURS=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'], MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  let racine=null, horloge=null, carrousel=null;

  function monter(el){
    racine=el;
    el.innerHTML='<div class="m-bandeau-actus" data-bandeau hidden></div><div class="m-grille">'
      +'<section class="m-carte m-large" data-carte="heure" style="--i:0" tabindex="0" role="button" aria-label="Heure et date"><div class="m-heure"><svg class="m-arc" viewBox="0 0 44 44" aria-hidden="true"><circle class="fond" cx="22" cy="22" r="19"/><circle class="sec" cx="22" cy="22" r="19" pathLength="60"/></svg><div><b class="m-grand m-mono" data-h>--:--</b><span class="m-doux" data-d></span></div></div><p class="m-salut" data-salut></p></section>'
      +'<section class="m-carte" data-carte="meteo" style="--i:1" tabindex="0" role="button" aria-label="Météo"><h3>Météo</h3><div data-z><div class="m-squelette"><i></i><i></i></div></div></section>'
      +'<section class="m-carte" data-carte="agent" style="--i:2" tabindex="0" role="button" aria-label="Agent de trading"><h3>Agent trading <em data-ag-et></em></h3><div data-z><div class="m-squelette"><i></i><i></i></div></div></section>'
      +'<section class="m-carte m-large m-carte-actus" data-carte="actus" style="--i:3" tabindex="0" role="button" aria-label="Actualités"><h3>À la une <em data-maj></em></h3><div data-z><div class="m-squelette m-image"><i></i><i></i><i></i></div></div></section>'
      +'<section class="m-carte m-large" data-carte="marche" style="--i:4" tabindex="0" role="button" aria-label="Marchés"><h3>Marchés <em data-m-et></em></h3><div data-z><div class="m-squelette"><i></i><i></i><i></i></div></div></section>'
      +'</div>';
    // cartes → écrans
    el.addEventListener('click',ev=>{
      const c=ev.target.closest('[data-carte]'); if(!c||ev.target.closest('button,a,[data-m-reessayer]')) return;
      const id=c.dataset.carte; Coque.vibrer(8);
      if(id==='actus') Coque.aller('actus'); else if(id==='marche'||id==='agent') Coque.aller('agent'); else if(id==='meteo'){ const m=window.MobileMeteo&&MobileMeteo.donneesCarte(); if(m&&m.etat==='ok') MobileMeteo.detail(m); else if(window.MobileMeteo&&!MobileMeteo.lieu()) { /* la carte porte ses propres boutons */ } }
      else if(id==='heure') Coque.feuille({titre:'Heure et date',rendre(f){ f.innerHTML='<p class="m-grand m-mono" data-h2></p><p class="m-doux" data-d2></p>'; const maj=()=>{ const n=new Date(); const a=f.querySelector('[data-h2]'); if(a){ a.textContent=n.toLocaleTimeString('fr-FR'); f.querySelector('[data-d2]').textContent=JOURS[n.getDay()]+' '+n.getDate()+' '+MOIS[n.getMonth()]+' '+n.getFullYear()+' · semaine '+semaine(n); } }; maj(); const t=setInterval(()=>{ if(!f.isConnected) clearInterval(t); else maj(); },1000); }});
    });
    el.addEventListener('keydown',ev=>{ if((ev.key==='Enter'||ev.key===' ')&&ev.target.matches('[data-carte]')){ ev.preventDefault(); ev.target.click(); } });
    horlogeDemarrer();
    // les données arrivent par des modules chargés APRÈS le chargement de la page (accueil prêt plus vite) : chaque carte se branche quand son module est là
    brancher(); RayleBus.on('mobile:module',brancher);
    // l'entité recule et s'estompe quand on fait défiler (transform/opacité seulement)
    const reactor=document.getElementById('reactor'); let pr=0;
    el.addEventListener('scroll',()=>{ if(pr) return; pr=requestAnimationFrame(()=>{ pr=0; if(reactor){ const p=Math.min(1,el.scrollTop/260); reactor.style.opacity=String(1-p*0.85); } }); },{passive:true});
  }
  const branche={};
  function brancher(){
    if(!racine) return;
    if(!branche.meteo&&window.MobileMeteo){ branche.meteo=1; MobileMeteo.monterCarte(racine.querySelector('[data-carte=meteo] [data-z]')); }
    if(!branche.actus&&window.MobileActus){ branche.actus=1; monterActus(); }
    if(!branche.marche&&window.MobileMarche&&T){ branche.marche=1; monterMarche(); }
    if(!branche.agent&&window.MobileAgentDonnees){ branche.agent=1; monterAgent(); }
  }
  const semaine=d=>{ const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())); const j=t.getUTCDay()||7; t.setUTCDate(t.getUTCDate()+4-j); return Math.ceil((((t-new Date(Date.UTC(t.getUTCFullYear(),0,1)))/864e5)+1)/7); };

  /* ───── heure ───── */
  function horlogeDemarrer(){
    const h=racine.querySelector('[data-h]'), d=racine.querySelector('[data-d]'), s=racine.querySelector('[data-salut]'), arc=racine.querySelector('.m-arc .sec');
    const tic=()=>{
      if(document.hidden||Coque.ecran()!=='accueil') return;
      const n=new Date(), hh=n.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
      if(h.textContent!==hh) h.textContent=hh;
      const dd=JOURS[n.getDay()]+' '+n.getDate()+' '+MOIS[n.getMonth()]; if(d.textContent!==dd) d.textContent=dd;
      const ss=SALUT(n.getHours()); if(s.textContent!==ss) s.textContent=ss;
      if(arc) arc.style.strokeDashoffset=String(60-n.getSeconds());
    };
    tic(); horloge=setInterval(tic,1000);
  }

  /* ───── actualités : carrousel d'images + bandeau ───── */
  function monterActus(){
    const zone=racine.querySelector('[data-carte=actus] [data-z]'), maj=racine.querySelector('[data-carte=actus] [data-maj]'), bande=racine.querySelector('[data-bandeau]');
    if(!window.MobileActus){ racine.querySelector('[data-carte=actus]').remove(); return; }
    D.suivre({cle:'accueil-actus',zone,ttl:5*60e3,squelette:'image',charger:()=>MobileActus.charger('france'),vide:d=>!d||!d.sujets||!d.sujets.length,texteVide:'Aucune actualité pour le moment.',
      rendre:(corps,d)=>{
        const l=d.sujets.slice(0,5), sig=l.map(s=>s.id).join('|');
        const t=Date.parse(d.genere||''); maj.textContent=Number.isFinite(t)?C.age(t):'';
        if(corps.dataset.sig===sig) return; corps.dataset.sig=sig;
        corps.innerHTML='<div class="m-car" data-car><div class="m-car-pistes">'+l.map((s,i)=>'<div class="m-car-s" data-i="'+i+'"'+(i?'':' data-actif')+'><div class="m-car-img" data-i="'+i+'"></div><b>'+esc(s.titre)+'</b><small>'+esc([s.source,s.quand].filter(Boolean).join(' · '))+'</small></div>').join('')+'</div><div class="m-car-pts">'+l.map((s,i)=>'<i'+(i?'':' data-actif')+'></i>').join('')+'</div></div>';
        MobileActus.lazy(corps.querySelectorAll('.m-car-img'),l);
        demarrerCarrousel(corps.querySelector('[data-car]'),l.length);
        window.MobileActus&&MobileActus.bandeau(bande);   // le bandeau lit la liste de l'écran Actus quand elle existe
        bande.hidden=!l.length; bande.innerHTML='<div class="m-defile-b"><div class="m-defile-i">'+l.map(s=>'<span>'+esc(s.titre)+'</span>').join('')+l.map(s=>'<span>'+esc(s.titre)+'</span>').join('')+'</div></div>';
      }});
  }
  function demarrerCarrousel(el,n){
    clearInterval(carrousel); if(n<2) return;
    let i=0; const pistes=el.querySelectorAll('.m-car-s'), pts=el.querySelectorAll('.m-car-pts i');
    const aller=k=>{ i=k; pistes.forEach((p,j)=>{ if(j===i) p.setAttribute('data-actif',''); else p.removeAttribute('data-actif'); }); pts.forEach((p,j)=>{ if(j===i) p.setAttribute('data-actif',''); else p.removeAttribute('data-actif'); }); };
    carrousel=setInterval(()=>{ if(document.hidden||Coque.ecran()!=='accueil'||Coque.niveau()>=2) return; aller((i+1)%n); },5500);
    let x0=null; el.addEventListener('pointerdown',ev=>{ x0=ev.clientX; }); el.addEventListener('pointerup',ev=>{ if(x0==null) return; const dx=ev.clientX-x0; x0=null; if(Math.abs(dx)>40){ ev.stopPropagation(); aller(dx<0?Math.min(n-1,i+1):Math.max(0,i-1)); } });
  }

  /* ───── marchés ───── */
  function monterMarche(){
    if(!window.MobileMarche||!T){ racine.querySelector('[data-carte=marche]').remove(); return; }
    const zone=racine.querySelector('[data-carte=marche] [data-z]'), et=racine.querySelector('[data-carte=marche] [data-m-et]');
    D.suivre({cle:'marche',zone,ttl:60e3,squelette:'liste',charger:()=>MobileMarche.lire(),
      rendre:(corps,lignes,meta)=>{
        const bonnes=lignes.filter(q=>!q.vide); et.textContent=meta&&meta.perime?'COPIE ANCIENNE':bonnes.length?'EN DIRECT':'';
        if(!corps.querySelector('.m-m')) corps.innerHTML=lignes.map(q=>'<div class="m-m" data-i="'+esc(q.id)+'"><b>'+esc(q.nom)+'</b><svg class="m-spark" viewBox="0 0 72 24" preserveAspectRatio="none" aria-hidden="true"><path/><circle r="2"/></svg><span class="m-p m-mono">—</span><span class="m-v m-mono">—</span></div>').join('');
        for(const q of lignes){
          const r=corps.querySelector('[data-i="'+q.id+'"]'); if(!r) continue;
          if(q.vide){ r.classList.add('vide'); r.querySelector('.m-p').textContent='indisponible'; r.querySelector('.m-v').textContent=''; r.title=q.erreur||''; continue; }
          r.classList.remove('vide'); r.title=(q.source||'')+(q.differe?' · différé':'');
          const p=r.querySelector('.m-p'), avant=Number(p.dataset.v), v=T.variation(q.pct);
          p.textContent=T.prix(q.prix,q.decimales); if(Number.isFinite(avant)&&avant!==q.prix){ r.classList.remove('flash-h','flash-b'); void r.offsetWidth; r.classList.add(q.prix>avant?'flash-h':'flash-b'); } p.dataset.v=q.prix;
          const vv=r.querySelector('.m-v'); vv.textContent=v.texte; vv.dataset.s=v.sens;
          const c=T.courbe(q.courbe,72,24,2); if(c){ const path=r.querySelector('path'); if(path.getAttribute('d')!==c.d){ path.setAttribute('d',c.d); path.classList.remove('trace'); void path.getBoundingClientRect(); path.classList.add('trace'); } const dot=r.querySelector('circle'); dot.setAttribute('cx',c.dernier[0]); dot.setAttribute('cy',c.dernier[1]); r.dataset.s=c.sens; }
        }
      }});
  }

  /* ───── agent de trading ───── */
  function monterAgent(){
    const zone=racine.querySelector('[data-carte=agent] [data-z]'), et=racine.querySelector('[data-ag-et]'), carte=racine.querySelector('[data-carte=agent]');
    if(!window.MobileAgentDonnees){ carte.remove(); return; }
    MobileAgentDonnees.observer(({data,meta,bandeau})=>{
      if(!data){ if(bandeau&&bandeau.genre==='erreur'){ zone.innerHTML='<p class="m-faible">'+esc(bandeau.texte)+'</p>'; et.textContent=''; } return; }
      const P=data.paquet.positions||{}, props=(P.propositions||[]).filter(p=>['en_attente','ouverte'].includes(p.statut)), B=P.bilan&&P.bilan.tous;
      const ancien=meta&&meta.perime||bandeau&&bandeau.genre==='ancien';
      et.textContent=data.origine==='PC'?'PC · EN DIRECT':ancien?'COPIE ANCIENNE':'SERVEUR';
      carte.dataset.alerte=props.some(p=>p.statut==='ouverte')?'1':'';
      zone.innerHTML='<div class="m-ligne"><b class="m-grand m-mono">'+props.length+'</b><span class="m-doux">position'+(props.length>1?'s':'')+' du jour</span></div>'
        +'<p class="m-faible" style="margin:6px 0 0">'+esc(B&&B.phrase?B.phrase:'Pas encore de bilan.')+'</p>'
        +'<p class="m-faible" style="margin:4px 0 0">'+(data.pcVivant?'PC en marche':'PC éteint')+' · '+esc(C.miseAJour(data.recuLe))+'</p>';
    });
  }

  Coque.enregistrer('accueil',{monter,montrer(){ const r=document.getElementById('reactor'); if(r) r.style.opacity='1'; }});
})();
