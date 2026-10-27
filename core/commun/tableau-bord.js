"use strict";
/* ═════════════ TABLEAU DE BORD VIVANT DE L'ACCUEIL (V1) ═════════════
   Autour de l'entité de Raylé : de VRAIES fenêtres, toutes animées en continu, chacune cliquable (elle ouvre sa vue complète) :
   heure et date · météo (Open-Meteo, ville choisie dans ⚙) · actualités (fil France du Worker, défilement doux) · agent de trading (régime, état, signaux, gardien prop :
   mêmes calculs que les fenêtres de la table de Mars) · marché (BTC, SOL, DOGE, or, US100 : mêmes cotations que le terminal, avec mini-courbes) · événements de la Terre (USGS, NASA EONET, GDACS)
   · système (Worker, Veilleur, micro, affichage). Aucune valeur inventée : donnée absente = « — » ou « INDISPONIBLE : raison ».
   Réglages (⚙ « Tableau de bord ») : afficher / masquer, côté, ordre, ville de la météo ; stockés sur l'appareil seulement.
   Quand Raylé répond (panneaux ouverts : body.avec-panneaux), les fenêtres reculent (CSS), puis reviennent. Mode léger : quatre fenêtres, aucune animation continue ;
   « réduire les animations » et onglet caché : tout est figé ; hors accueil (terminal, galaxie, satellite multi-écrans) : rien ne tourne. Contenu pur : tableau-bord-contenu.js (testé). */
(function(){
  if(window.RAYLE_SATELLITE) return;
  const T=window.TableauBordContenu, scene=document.getElementById('scene');
  if(!T||!scene||!window.RayleBus) return;
  const corps=document.body, $=id=>document.getElementById(id);
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reduit=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):null;
  const mode=()=>corps.dataset.hud||'normal';
  const anime=()=>mode()!=='leger'&&!(reduit&&reduit.matches);
  const visible=()=>!document.hidden&&!corps.classList.contains('vue-terminal')&&!corps.classList.contains('vue-galaxie')&&(corps.classList.contains('g1')||T.assezLarge(window.innerWidth));
  const lire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const ecrire=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
  let reglages=T.lireReglages(lire);
  const donnees={meteo:null,actus:null,marche:null,terre:null,reels:{},pilote:null};
  const poser=(el,t)=>{ if(el&&el.textContent!==t) el.textContent=t; };
  const etiquette=(el,etat)=>{ if(!el) return; const E={reel:'RÉEL',differe:'DIFFÉRÉ',perime:'PÉRIMÉ',secours:'SECOURS',simule:'SIMULÉ',indispo:'INDISPO',attente:'ATTENTE'}; el.hidden=!etat; if(etat){ el.dataset.etat=etat; poser(el,E[etat]||etat.toUpperCase()); } };

  /* ───── structure ───── */
  const racine=document.createElement('div'); racine.className='tb'; racine.id='tableau'; racine.setAttribute('aria-label','Tableau de bord');
  racine.innerHTML='<div class="tb-col g"></div><div class="tb-col d"></div>';
  scene.appendChild(racine);
  const col={g:racine.querySelector('.g'),d:racine.querySelector('.d')};

  const ENTETE=(f)=>'<header class="tb-t"><h3>'+esc(f.titre)+'</h3><em class="tb-et" hidden></em><button type="button" class="tb-pose" aria-label="Poser « '+esc(f.titre)+' » dans une fenêtre déplaçable" title="Poser dans une fenêtre (déplacer, agrandir, ranger)">⤢</button></header>';
  const CORPS={
    heure:()=>'<div class="tb-heure"><svg class="tb-sec" viewBox="0 0 40 40" aria-hidden="true"><circle class="fond" cx="20" cy="20" r="18"/><circle class="arc" cx="20" cy="20" r="18" pathLength="60"/></svg><div><b class="tb-h" data-z="h">--:--</b><small class="tb-s" data-z="s">--</small></div></div><div class="tb-date" data-z="date">—</div>',
    meteo:()=>'<div data-z="meteo"><p class="tb-vide">Lecture de la météo…</p></div>',
    actus:()=>'<div class="tb-actus" data-z="actus"><p class="tb-vide">Lecture du fil d’actualités…</p></div>',
    systeme:()=>'<ul class="tb-sys" data-z="sys"></ul>',
    agent:()=>'<ul class="tb-agent" data-z="agent"><li class="tb-vide">Lecture de l’agent…</li></ul>',
    marche:()=>'<div class="tb-marche" data-z="marche"><p class="tb-vide">Lecture des cotations…</p></div>',
    terre:()=>'<ul class="tb-terre" data-z="terre"><li class="tb-vide">Lecture des événements…</li></ul>'
  };
  const fen={};   // id → élément
  function fabriquer(f,i){
    const e=document.createElement('section'); e.className='tb-f'; e.dataset.id=f.id; e.dataset.ouvre=f.ouvre; e.tabIndex=0; e.setAttribute('role','button'); e.setAttribute('aria-label',f.titre+' : ouvrir la vue complète');
    e.innerHTML=ENTETE(f)+'<div class="tb-c">'+CORPS[f.id]()+'</div>'; fen[f.id]=e; e.style.setProperty('--i',i||0); return e;
  }
  function construire(){
    reglages=T.normaliserReglages(reglages);
    const dis=T.disposition(reglages,mode());
    for(const c of T.COTES){
      const present=new Map(); for(const e of col[c].children) present.set(e.dataset.id,e);
      const ids=dis[c].map(f=>f.id);
      for(const e of [...col[c].children]) if(!ids.includes(e.dataset.id)){ e.remove(); delete fen[e.dataset.id]; }
      dis[c].forEach((f,i)=>{
        let e=fen[f.id];
        if(e&&e.dataset.detache==='1') return;          // V2 : posée dans une fenêtre du bureau (jarvis-bureau.js), pas dans la colonne
        if(!e) e=fabriquer(f,i);
        if(e.parentNode!==col[c]||col[c].children[i]!==e) col[c].insertBefore(e,col[c].children[i]||null);
      });
    }
    corps.classList.toggle('tb-actif',reglages.actif&&dis.g.length+dis.d.length>0);
    for(const k of Object.keys(fen)){ const z=fen[k].querySelector('[data-z]'); if(z) delete z.dataset.sig; }
    dessinerMeteo(); dessinerActus(); dessinerMarche(); dessinerTerre(); dessinerAgent();   // une fenêtre recréée (déplacée, réaffichée) retrouve ses dernières données
    rafraichirTout();
  }

  /* ───── heure et date ───── */
  function tic(){
    const e=fen.heure; if(e){
      const n=new Date(); poser(e.querySelector('[data-z=h]'),n.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}));
      poser(e.querySelector('[data-z=s]'),String(n.getSeconds()).padStart(2,'0'));
      poser(e.querySelector('[data-z=date]'),n.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'}));
      const arc=e.querySelector('.arc'); if(arc) arc.style.strokeDashoffset=String(60-(n.getSeconds()+n.getMilliseconds()/1000)); }
    majSysteme();
  }

  /* ───── météo ───── */
  const ICONES={
    soleil:'<svg viewBox="0 0 32 32" class="ic ic-soleil"><circle cx="16" cy="16" r="5.5"/><g class="rayons">'+[0,45,90,135,180,225,270,315].map(a=>'<line x1="16" y1="4" x2="16" y2="7.5" transform="rotate('+a+' 16 16)"/>').join('')+'</g></svg>',
    eclaircies:'<svg viewBox="0 0 32 32" class="ic ic-eclaircies"><circle cx="21" cy="11" r="4.5" class="s"/><path class="n" d="M9 24a5 5 0 0 1 .6-9.9A6.5 6.5 0 0 1 22 15.5a4.2 4.2 0 0 1-.5 8.5z"/></svg>',
    nuageux:'<svg viewBox="0 0 32 32" class="ic ic-nuageux"><path class="n" d="M9 24a5.5 5.5 0 0 1 .5-10.9A7 7 0 0 1 23 14.5a4.8 4.8 0 0 1-.5 9.5z"/></svg>',
    brouillard:'<svg viewBox="0 0 32 32" class="ic ic-brouillard"><path d="M5 11h22M8 16h19M5 21h22M10 26h14"/></svg>',
    bruine:'<svg viewBox="0 0 32 32" class="ic ic-pluie"><path class="n" d="M9 18a5 5 0 0 1 .5-9.9A6.5 6.5 0 0 1 22 9.5a4.5 4.5 0 0 1-.5 8.5z"/><g class="gouttes"><line x1="11" y1="22" x2="10" y2="25"/><line x1="17" y1="22" x2="16" y2="25"/></g></svg>',
    pluie:'<svg viewBox="0 0 32 32" class="ic ic-pluie"><path class="n" d="M9 18a5 5 0 0 1 .5-9.9A6.5 6.5 0 0 1 22 9.5a4.5 4.5 0 0 1-.5 8.5z"/><g class="gouttes"><line x1="10" y1="22" x2="8.5" y2="26"/><line x1="16" y1="22" x2="14.5" y2="26"/><line x1="22" y1="22" x2="20.5" y2="26"/></g></svg>',
    neige:'<svg viewBox="0 0 32 32" class="ic ic-neige"><path class="n" d="M9 18a5 5 0 0 1 .5-9.9A6.5 6.5 0 0 1 22 9.5a4.5 4.5 0 0 1-.5 8.5z"/><g class="gouttes"><circle cx="10" cy="24" r="1.2"/><circle cx="16" cy="25" r="1.2"/><circle cx="22" cy="24" r="1.2"/></g></svg>',
    orage:'<svg viewBox="0 0 32 32" class="ic ic-orage"><path class="n" d="M9 17a5 5 0 0 1 .5-9.9A6.5 6.5 0 0 1 22 8.5a4.5 4.5 0 0 1-.5 8.5z"/><path class="eclair" d="M17 17l-4 6h3.5l-1.5 5 5.5-7.5H17.5z"/></svg>'
  };
  function dessinerMeteo(){
    const e=fen.meteo; if(!e) return; const z=e.querySelector('[data-z=meteo]'), m=donnees.meteo;
    if(!reglages.meteo.nom&&reglages.meteo.lat==null){ z.innerHTML='<p class="tb-vide">Aucune ville choisie.</p><span class="tb-lien">Choisir une ville dans les réglages</span>'; etiquette(e.querySelector('.tb-et'),null); return; }
    if(!m){ return; }
    if(m.etat!=='ok'){ z.innerHTML='<p class="tb-vide tb-ko">INDISPONIBLE : '+esc(m.raison)+'</p>'; etiquette(e.querySelector('.tb-et'),'indispo'); return; }
    etiquette(e.querySelector('.tb-et'),'reel');
    z.innerHTML='<div class="tb-met"><div class="tb-ico">'+ICONES[m.categorie]+'</div><div><b class="tb-temp"><span data-v="'+m.temp+'">'+T.nombre(m.temp,0)+'</span>°</b><small>'+esc(m.libelle)+' · '+esc(m.nom)+'</small></div></div>'
      +'<div class="tb-metl"><span>ressenti '+(m.ressenti!=null?T.nombre(m.ressenti,0)+'°':'—')+'</span><span>vent '+(m.vent!=null?m.vent+' km/h':'—')+'</span></div>'
      +(m.jours.length?'<div class="tb-jours">'+m.jours.map(j=>'<span><i>'+esc(j.jour)+'</i><b>'+T.nombre(j.max,0)+'°</b><small>'+T.nombre(j.min,0)+'°</small></span>').join('')+'</div>':'');
  }
  async function chargerMeteo(){
    const r=reglages.meteo; if(r.lat==null){ donnees.meteo=null; dessinerMeteo(); return; }
    try{
      const rep=await fetch(T.urlMeteo(r.lat,r.lon),{cache:'no-store'}); if(!rep.ok) throw new Error('HTTP '+rep.status);
      donnees.meteo=T.resumeMeteo(await rep.json(),r.nom);
    }catch(e){ donnees.meteo={etat:'indisponible',raison:String((e&&e.message)||e).slice(0,80)}; }
    dessinerMeteo();
  }

  /* ───── actualités ───── */
  let modActus=null;
  const chargerModActus=()=>modActus||(modActus=Promise.all([import(new URL('planetes/terre/pc/fil-actus.js',document.baseURI).href),import(new URL('planetes/terre/pc/actus-sujets.js',document.baseURI).href)]).then(([fil,suj])=>({fil,suj})).catch(e=>{ modActus=null; throw e; }));
  function dessinerActus(){
    const e=fen.actus; if(!e) return; const z=e.querySelector('[data-z=actus]'), a=donnees.actus;
    if(!a) return;
    if(a.erreur){ z.innerHTML='<p class="tb-vide tb-ko">INDISPONIBLE : '+esc(a.erreur)+'</p>'; etiquette(e.querySelector('.tb-et'),'indispo'); return; }
    etiquette(e.querySelector('.tb-et'),a.perime?'perime':'reel');
    const liste=a.titres, anim_=anime()&&liste.length>3, l=anim_?liste.concat(liste):liste.slice(0,4);
    const html='<ul class="tb-defile'+(anim_?' va':'')+'" style="--n:'+liste.length+'">'+l.map(t=>'<li><span class="pt" style="--c:'+esc(t.couleur||'#8fd0e3')+'"></span><div><b>'+esc(t.titre)+'</b><small>'+esc(t.source)+(t.quand?' · '+esc(t.quand):'')+'</small></div></li>').join('')+'</ul>';
    if(z.dataset.sig!==html){ z.dataset.sig=html; z.innerHTML=html; }
  }
  async function chargerActus(){
    try{
      const {fil,suj}=await chargerModActus(); const brut=await fil.chargerFil('france','',{}); const m=suj.modelesFil(brut,{max:12});
      donnees.actus={titres:T.titresActus(m.sujets,8),perime:!!m.perime};
      if(!donnees.actus.titres.length) donnees.actus={erreur:'aucun sujet pour le moment'};
    }catch(e){ donnees.actus={erreur:(typeof errMsg==='function'?errMsg(e):String((e&&e.message)||e)).slice(0,90)}; }
    dessinerActus();
  }

  /* ───── marché ───── */
  const IDS_MARCHE=['BTC','SOL','DOGE','XAU','US100'];
  let modMarche=null;
  const chargerModMarche=()=>modMarche||(modMarche=Promise.all([import(new URL('planetes/mars/pc/trading/session.js',document.baseURI).href),import(new URL('planetes/mars/pc/trading/cotations.js',document.baseURI).href)]).then(([s,c])=>({s,c})).catch(e=>{ modMarche=null; throw e; }));
  function dessinerMarche(){
    const e=fen.marche; if(!e) return; const z=e.querySelector('[data-z=marche]'), cot=donnees.marche;
    if(!cot) return;
    if(cot.erreur){ z.innerHTML='<p class="tb-vide tb-ko">INDISPONIBLE : '+esc(cot.erreur)+'</p>'; z.dataset.sig=''; etiquette(e.querySelector('.tb-et'),'indispo'); return; }
    const toutes=cot.lignes, bonnes=toutes.filter(q=>!q.vide);
    etiquette(e.querySelector('.tb-et'),!bonnes.length?'indispo':bonnes.some(q=>q.perime)?'perime':bonnes.some(q=>q.differe)?'differe':'reel');
    if(!z.querySelector('.tb-m')) z.innerHTML=toutes.map(q=>'<div class="tb-m" data-i="'+esc(q.id)+'"><b>'+esc(q.nom)+'</b><svg class="tb-spark" viewBox="0 0 64 20" preserveAspectRatio="none" aria-hidden="true"><path/><circle r="1.8"/></svg><span class="tb-p">—</span><span class="tb-v">—</span></div>').join('');
    for(const q of toutes){
      const r=z.querySelector('[data-i="'+q.id+'"]'); if(!r) continue;
      if(q.vide){ r.classList.add('vide'); poser(r.querySelector('.tb-p'),'indispo.'); poser(r.querySelector('.tb-v'),'—'); r.title=q.erreur||''; continue; }
      r.classList.remove('vide'); r.title=(q.source?q.source+' · ':'')+(q.differe?'différé · ':'')+T.age(q.t,Date.now());
      const p=r.querySelector('.tb-p'), avant=Number(p.dataset.v), vr=T.variation(q.pct);
      if(Number.isFinite(avant)&&avant!==q.prix){ r.classList.remove('flash-h','flash-b'); void r.offsetWidth; r.classList.add(q.prix>avant?'flash-h':'flash-b'); }
      defiler(p,Number.isFinite(avant)?avant:q.prix,q.prix,x=>T.prix(x,q.decimales));
      p.dataset.v=q.prix; const v=r.querySelector('.tb-v'); poser(v,vr.texte); v.dataset.s=vr.sens;
      const c=T.courbe(q.courbe,64,20,2), path=r.querySelector('path'), dot=r.querySelector('circle');
      if(c){ if(path.getAttribute('d')!==c.d){ path.setAttribute('d',c.d); path.classList.remove('trace'); void path.getBoundingClientRect(); path.classList.add('trace'); } dot.setAttribute('cx',c.dernier[0]); dot.setAttribute('cy',c.dernier[1]); r.dataset.s=c.sens; }
    }
  }
  async function chargerMarche(){
    try{
      if(!(typeof workerReady==='function'&&workerReady())) throw new Error('Worker verrouillé (⚙ Réglages de Raylé)');
      const {s,c}=await chargerModMarche(); const client=await s.obtenirClient(); const lignes=await c.lireCotations(client,IDS_MARCHE);
      donnees.marche={lignes};
    }catch(e){ donnees.marche={erreur:String((e&&e.message)||e).slice(0,90)}; }
    dessinerMarche();
  }

  /* ───── événements de la Terre ───── */
  let direct=null;
  async function chargerTerre(){
    try{
      if(!direct){ const mod=await import(new URL('core/direct/donnees-direct.js',document.baseURI).href); direct=mod.creerDirect(); }
      const r=await direct.evenements();
      donnees.terre=r.etat==='ok'?{lignes:T.lignesEvenements(r.evenements,Date.now(),4),etiquette:r.etiquette==='RÉEL'?'reel':r.etiquette==='PÉRIMÉ'?'perime':'differe'}:{erreur:(r.raison||'sources injoignables').slice(0,90)};
    }catch(e){ donnees.terre={erreur:String((e&&e.message)||e).slice(0,90)}; }
    dessinerTerre();
  }
  function dessinerTerre(){
    const e=fen.terre; if(!e) return; const z=e.querySelector('[data-z=terre]'), t=donnees.terre; if(!t) return;
    if(t.erreur){ z.innerHTML='<li class="tb-vide tb-ko">INDISPONIBLE : '+esc(t.erreur)+'</li>'; etiquette(e.querySelector('.tb-et'),'indispo'); return; }
    etiquette(e.querySelector('.tb-et'),t.etiquette);
    z.innerHTML=t.lignes.length?t.lignes.map(l=>'<li data-sev="'+l.severite+'"><i class="pt"></i><div><b>'+esc(l.titre)+'</b><small>'+esc(l.age)+'</small></div></li>').join(''):'<li class="tb-vide">Rien de notable ces dernières 48 h.</li>';
  }

  /* ───── agent de trading (mêmes calculs que les fenêtres de la table de Mars) ───── */
  let arretAgent=null;
  async function demarrerAgent(){
    if(arretAgent) return; arretAgent=()=>{};
    try{
      const [fm,pp]=await Promise.all([import(new URL('planetes/mars/pc/trading/fenetres-m6.js',document.baseURI).href),import(new URL('planetes/mars/pc/trading/pilotes-paires.js',document.baseURI).href)]);
      arretAgent=fm.demarrerFenetresM6({majReel:(id,r)=>{ donnees.reels[id]=r; try{
        const h=pp.hotesChargees(), paires=Object.keys(h); let rech=false, val=0;
        for(const p of paires){ try{ const v=h[p].vue(); if(v.rechercheEnCours) rech=true; val+=v.recherche&&v.recherche.valideesComptees||0; }catch(e){} }
        donnees.pilote={paires,enRecherche:rech,valides:val};
      }catch(e){} dessinerAgent(); },actif:visible});
    }catch(e){ donnees.reels={'gardien-prop':{etat:'indisponible',erreur:String((e&&e.message)||e).slice(0,60)}}; arretAgent=null; dessinerAgent(); }
  }
  /* V3 : état de l'agent unique (PC d'abord, sinon Worker) : une ligne « Kepler · en surveillance ». Aucune valeur inventée : sans état, la ligne n'existe pas. */
  let agentV3Charge=0;
  async function sonderAgentV3(){
    if(Date.now()-agentV3Charge<30000) return; agentV3Charge=Date.now();
    try{
      const [pg,ae]=await Promise.all([importer('planetes/mars/pc/trading/agent-accueil.js'),importer('strategies/agent-etat.js')]);
      const d=await pg.lireEtatAgent(); if(!d||!d.etat){ donnees.agentV3=null; return; }
      const sv=d.suivi||{}, st=ae.statutAgent(d.etat,{pcVivant:d.enMarche,enPreparation:Object.values(sv).some(x=>x&&x.pendante),positionOuverte:Object.values(sv).some(x=>x&&x.position)}), c=ae.chiffres(d.etat);
      donnees.agentV3={nom:d.etat.identite.nom,valeur:st.texte,detail:(c.validees?c.validees+' stratégie(s)':'aucune stratégie validée')+' · v'+(c.version||'—'),ton:st.code==='position'||st.code==='preparation'?'attention':(st.code==='pause'||st.code==='aucune'||st.code==='pc_eteint'?'neutre':'ok')};
      dessinerAgent();
    }catch(e){ donnees.agentV3=null; }
  }
  function dessinerAgent(){
    const e=fen.agent; if(!e) return; const z=e.querySelector('[data-z=agent]');
    const l=T.lignesAgent(donnees.reels,donnees.pilote);
    if(donnees.agentV3) l.unshift(donnees.agentV3);   // V3 : l'agent unique (Kepler) : sa phrase d'état, lue sur le PC ou le Worker
    const html=l.map(x=>'<li data-ton="'+x.ton+'"><span>'+esc(x.nom)+'</span><b>'+esc(x.valeur)+'</b><small>'+esc(x.detail)+'</small></li>').join('');
    if(z.dataset.sig!==html){ z.dataset.sig=html; z.innerHTML=html; }
    const p=donnees.reels['propositions-agent'];
    etiquette(e.querySelector('.tb-et'),donnees.reels['gardien-prop']&&donnees.reels['gardien-prop'].etat==='indisponible'?'indispo':(p&&p.etiquette==='SIMULÉ'?'simule':'reel'));
  }

  /* ───── système ───── */
  let veilleurActif=null;
  async function sonderVeilleur(){ try{ const r=await fetch('/__veilleur/etat',{cache:'no-store'}); veilleurActif=r.ok?!!(await r.json()).enMarche:null; }catch(e){ veilleurActif=null; } majSysteme(); }
  function majSysteme(){
    const e=fen.systeme; if(!e) return; let info=null; try{ info=Entite.info(); }catch(x){}
    let worker=false; try{ worker=!!workerReady(); }catch(x){}
    const l=T.lignesSysteme({worker,veilleur:veilleurActif,etat:corps.dataset.etat||'idle',mode:mode(),fps:info&&info.fps});
    const z=e.querySelector('[data-z=sys]'); const sig=JSON.stringify(l.map(x=>[x.id,x.valeur,x.ton]));
    if(z.dataset.sig!==sig){ z.dataset.sig=sig; z.innerHTML=l.map(x=>'<li data-ton="'+x.ton+'"><i class="led"></i><span>'+esc(x.nom)+'</span><b>'+esc(x.valeur)+'</b></li>').join(''); }
  }

  /* ───── chiffres qui défilent (une seule boucle, seulement si les animations sont permises) ───── */
  const suivis=new Map(); let rafT=0;
  function defiler(el,a,b,fmt){
    if(!anime()||a===b){ poser(el,fmt(b)); suivis.delete(el); return; }
    suivis.set(el,{a,b,t0:performance.now(),fmt}); if(!rafT) rafT=requestAnimationFrame(pasDefile);
  }
  function pasDefile(now){
    rafT=0;
    for(const [el,s] of suivis){ const k=Math.min(1,(now-s.t0)/700), e=1-Math.pow(1-k,3); poser(el,s.fmt(s.a+(s.b-s.a)*e)); if(k>=1) suivis.delete(el); }
    if(suivis.size) rafT=requestAnimationFrame(pasDefile);
  }

  /* ───── rafraîchissement : seulement quand l'accueil est visible ───── */
  const CADENCES={meteo:15*60e3,actus:10*60e3,marche:60e3,terre:5*60e3,veilleur:30e3};
  const dernier={}, charge={meteo:chargerMeteo,actus:chargerActus,marche:chargerMarche,terre:chargerTerre,veilleur:sonderVeilleur};
  const util={meteo:'meteo',actus:'actus',marche:'marche',terre:'terre',veilleur:'systeme'};
  function rafraichirTout(){ for(const k of Object.keys(dernier)) dernier[k]=0; cadence(); }
  const TEST=window.__RAYLE_TB_TEST__||{};
  function cadence(){
    const g1=corps.classList.contains('g1');   // accueil G1 : il lit les mêmes données, même sans les fenêtres Jarvis
    if(TEST.sansReseau||!visible()||(!g1&&!corps.classList.contains('tb-actif'))) return; const now=Date.now();
    for(const k of Object.keys(charge)){ if(!g1&&!fen[util[k]]) continue; if(now-(dernier[k]||0)>=CADENCES[k]){ dernier[k]=now; charge[k](); } }
    if(fen.agent||g1) demarrerAgent();
    if(fen.agent||g1) sonderAgentV3();
  }
  setInterval(()=>{ if(visible()&&corps.classList.contains('tb-actif')){ tic(); } },1000);
  setInterval(cadence,15000);
  document.addEventListener('visibilitychange',()=>{ corps.classList.toggle('tb-pause',!visible()); if(visible()){ tic(); cadence(); } });
  RayleBus.on('vue:changee',()=>{ corps.classList.toggle('tb-pause',!visible()); if(visible()) cadence(); });
  window.addEventListener('resize',()=>{ corps.classList.toggle('tb-pause',!visible()); });
  const surMode=new MutationObserver(()=>{ const m=mode(); if(m!==racine.dataset.mode){ racine.dataset.mode=m; construire(); dessinerActus(); } });
  surMode.observe(corps,{attributes:true,attributeFilter:['data-hud']});
  racine.dataset.mode=mode();

  /* ───── vues complètes (clic ou Entrée sur une fenêtre) ───── */
  function vueMeteo(){
    const m=donnees.meteo; if(!m||m.etat!=='ok'){ if(window.Panneaux) Panneaux.ouvrir({id:'tb-meteo',type:'holo-meteo',titre:'Météo',etat:'indispo',corps:'INDISPONIBLE : '+(m?m.raison:'aucune ville choisie (⚙ Tableau de bord)')}); return; }
    const lignes=m.jours.map(j=>'<div class="pn-l"><span>'+esc(j.jour)+' · '+esc(j.libelle)+'</span><b>'+T.nombre(j.min,0)+'° / '+T.nombre(j.max,0)+'°'+(Number.isFinite(j.pluiePct)?' · pluie '+Math.round(j.pluiePct)+' %':'')+'</b></div>').join('');
    Panneaux.ouvrir({id:'tb-meteo',type:'holo-meteo',titre:'Météo · '+m.nom,icone:'◈',etat:'reel',corps:{html:'<div class="pn-gros">'+T.nombre(m.temp,0)+'<small>°C</small></div><div class="pn-sous">'+esc(m.libelle)+' · ressenti '+(m.ressenti!=null?T.nombre(m.ressenti,0)+'°':'—')+' · vent '+(m.vent!=null?m.vent+' km/h':'—')+'</div>'+lignes+'<div class="pn-sous">Source : Open-Meteo (données ouvertes)</div>'},duree:60000});
  }
  const importer=u=>import(new URL(u,document.baseURI).href);
  const VUES={
    reglages:()=>{ const g=$('gear'); if(g) g.click(); },
    meteo:()=>{ if(!reglages.meteo.nom&&reglages.meteo.lat==null){ const g=$('gear'); if(g) g.click(); return; } vueMeteo(); },
    actus:()=>{ if(window.ActusAccueil) ActusAccueil.ouvrir('france'); },
    agent:async()=>{ try{ await importer('planetes/mars/pc/trading/fenetre-agent.js'); await window.PosteAgent.ouvrir({}); }catch(e){ try{ RayleBus.emit('log',{kind:'err',texte:'Agent : '+e.message}); }catch(x){} } },
    terminal:()=>{ const b=$('btnOuvrirTerminal'); if(b) b.click(); },
    terre:()=>{ if(window.DirectPage) DirectPage.ouvrirHub('evenements').catch(()=>{}); }
  };
  racine.addEventListener('click',ev=>{ const f=ev.target.closest('.tb-f'); if(f&&ev.target.closest('.tb-pose')){ ev.stopPropagation(); if(window.JarvisBureau&&JarvisBureau.actif()) JarvisBureau.ouvrir(f.dataset.id); return; } if(f&&VUES[f.dataset.ouvre]) VUES[f.dataset.ouvre](); });
  racine.addEventListener('keydown',ev=>{ if(ev.key!=='Enter'&&ev.key!==' ') return; if(ev.target.closest('.tb-pose')) return; const f=ev.target.closest('.tb-f'); if(f&&VUES[f.dataset.ouvre]){ ev.preventDefault(); VUES[f.dataset.ouvre](); } });
  /* parallaxe très légère à la souris (complet seulement) */
  let pxr=0;
  window.addEventListener('pointermove',ev=>{ if(mode()!=='complet'||!visible()||pxr) return; pxr=requestAnimationFrame(()=>{ pxr=0; racine.style.setProperty('--px',((ev.clientX/innerWidth-.5)*2).toFixed(3)); racine.style.setProperty('--py',((ev.clientY/innerHeight-.5)*2).toFixed(3)); }); },{passive:true});

  /* ───── réglages (⚙ « Tableau de bord ») ───── */
  const rg=$('tbReglages');
  function sauver(){ T.ecrireReglages(ecrire,reglages); }
  function dessinerReglages(){
    if(!rg) return; const r=reglages;
    rg.innerHTML='<label class="chk"><input type="checkbox" data-r="actif"'+(r.actif?' checked':'')+'> Afficher le tableau de bord autour de Raylé</label>'
      +'<div class="tb-rl">'+T.FENETRES.map(f=>{ const x=r.fenetres[f.id]; return '<div class="tb-rr"><label class="chk"><input type="checkbox" data-r="vis" data-id="'+f.id+'"'+(x.visible?' checked':'')+'> '+esc(f.titre)+'</label>'
        +'<span><button type="button" class="ghost" data-r="haut" data-id="'+f.id+'" aria-label="Monter">↑</button><button type="button" class="ghost" data-r="bas" data-id="'+f.id+'" aria-label="Descendre">↓</button>'
        +'<button type="button" class="ghost" data-r="cote" data-id="'+f.id+'">'+(x.cote==='g'?'Gauche':'Droite')+'</button></span></div>'; }).join('')+'</div>'
      +'<label for="tbVille">Ville de la météo (stockée sur cet appareil seulement)</label><div class="row"><input id="tbVille" type="text" placeholder="ex. Pau" autocomplete="off" spellcheck="false" value="'+esc(r.meteo.nom)+'"><button type="button" class="ghost" data-r="chercher">Chercher</button><button type="button" class="ghost" data-r="position">Ma position</button></div>'
      +'<div class="hint" id="tbVilleInfo">'+(r.meteo.lat!=null?'Ville enregistrée : '+esc(r.meteo.nom||'position')+'.':'Aucune ville choisie : la fenêtre météo reste vide.')+'</div><div id="tbVilleRes" class="tb-res"></div>'
      +'<div class="hint">Un clic sur une fenêtre du tableau de bord ouvre sa vue complète. Quand Raylé répond, les fenêtres reculent puis reviennent. Mode léger : quatre fenêtres, sans animation continue. Le tableau est caché sous 1100 px de large.</div>';
  }
  async function chercherVille(){
    const q=($('tbVille')||{}).value||'', info=$('tbVilleInfo'), res=$('tbVilleRes'); if(q.trim().length<2){ poser(info,'Tape au moins deux lettres.'); return; }
    poser(info,'Recherche…');
    try{
      const rep=await fetch(T.urlGeocodage(q.trim()),{cache:'no-store'}); if(!rep.ok) throw new Error('HTTP '+rep.status);
      const l=T.resultatsGeocodage(await rep.json()); poser(info,l.length?'Choisis la bonne ville :':'Aucun résultat.');
      res.innerHTML=l.map((v,i)=>'<button type="button" class="ghost" data-r="choisir" data-i="'+i+'" data-nom="'+esc(v.nom)+'" data-lat="'+v.lat+'" data-lon="'+v.lon+'">'+esc(v.nom)+'</button>').join('');
    }catch(e){ poser(info,'Recherche impossible : '+String((e&&e.message)||e).slice(0,80)); }
  }
  function poserVille(nom,lat,lon){ reglages.meteo=T.normaliserReglages({meteo:{nom,lat,lon}}).meteo; sauver(); donnees.meteo=null; dessinerReglages(); chargerMeteo(); }
  if(rg){
    rg.addEventListener('click',ev=>{
      const b=ev.target.closest('[data-r]'); if(!b) return; const a=b.dataset.r, id=b.dataset.id;
      if(a==='haut'||a==='bas'){ reglages=T.deplacer(reglages,id,a); sauver(); dessinerReglages(); construire(); }
      else if(a==='cote'){ reglages=T.deplacer(reglages,id,reglages.fenetres[id].cote==='g'?'d':'g'); sauver(); dessinerReglages(); construire(); }
      else if(a==='chercher') chercherVille();
      else if(a==='choisir') poserVille(b.dataset.nom,+b.dataset.lat,+b.dataset.lon);
      else if(a==='position'){ if(!navigator.geolocation){ poser($('tbVilleInfo'),'La position n’est pas disponible sur cet appareil.'); return; } poser($('tbVilleInfo'),'Demande de position…');
        navigator.geolocation.getCurrentPosition(p=>poserVille('Ma position',p.coords.latitude,p.coords.longitude),e=>poser($('tbVilleInfo'),'Position refusée ou indisponible.'),{timeout:10000,maximumAge:600000}); }
    });
    rg.addEventListener('change',ev=>{
      const b=ev.target.closest('[data-r]'); if(!b) return;
      if(b.dataset.r==='actif'){ reglages.actif=b.checked; sauver(); construire(); }
      else if(b.dataset.r==='vis'){ reglages.fenetres[b.dataset.id].visible=b.checked; sauver(); construire(); }
    });
    rg.addEventListener('keydown',ev=>{ if(ev.key==='Enter'&&ev.target.id==='tbVille'){ ev.preventDefault(); chercherVille(); } });
    dessinerReglages();
  }

  /* V2 (bureau de l'accueil) : une fenêtre du tableau peut être POSÉE dans une fenêtre du gestionnaire, puis REMISE dans sa colonne. */
  function detacher(id){
    const def=T.FENETRES.find(f=>f.id===id); if(!def) return null;
    const e=fen[id]||fabriquer(def,0); e.dataset.detache='1'; if(e.parentNode) e.parentNode.removeChild(e);
    delete e.dataset.sig; const z=e.querySelector('[data-z]'); if(z) delete z.dataset.sig;
    dessinerMeteo(); dessinerActus(); dessinerMarche(); dessinerTerre(); dessinerAgent(); tic(); return e;
  }
  function rattacher(id){ const e=fen[id]; if(!e) return false; delete e.dataset.detache; if(e.parentNode) e.parentNode.removeChild(e); construire(); return true; }
  window.TableauBord={detacher,rattacher,titres:()=>T.FENETRES.map(f=>({id:f.id,titre:f.titre})),vue:id=>{ const e=fen[id]||T.FENETRES.find(f=>f.id===id); const v=e&&VUES[e.dataset?e.dataset.ouvre:e.ouvre]; if(v) v(); return !!v; },donnees:()=>donnees,etat:()=>({actif:corps.classList.contains('tb-actif'),fenetres:Object.keys(fen),donnees:Object.keys(donnees).filter(k=>donnees[k]&&Object.keys(donnees[k]).length),reglages}),
    rafraichir:rafraichirTout,reglages:()=>reglages,definirReglages:r=>{ reglages=T.normaliserReglages(r); sauver(); dessinerReglages(); construire(); },ouvrir:id=>{ const e=fen[id]; if(e&&VUES[e.dataset.ouvre]){ VUES[e.dataset.ouvre](); return true; } return false; },
    /* tests : injecter des données sans réseau */
    injecter:(cle,val)=>{ donnees[cle]=val; ({meteo:dessinerMeteo,actus:dessinerActus,marche:dessinerMarche,terre:dessinerTerre,reels:dessinerAgent,pilote:dessinerAgent})[cle]&&({meteo:dessinerMeteo,actus:dessinerActus,marche:dessinerMarche,terre:dessinerTerre,reels:dessinerAgent,pilote:dessinerAgent})[cle](); }};
  /* « Teste ma stratégie » : si des stratégies de l'utilisatrice sont en alertes, leur suivi démarre dès l'accueil (une fois par bougie M15 fermée), sans ouvrir le poste ni garder la fenêtre « Agent » affichée */
  setTimeout(()=>{ try{ const reg=localStorage.getItem('rayle_ms_registre'); if(reg&&/"alertes":\{"actif":true/.test(reg)) import(new URL('planetes/mars/pc/trading/ms-page.js',document.baseURI).href).then(m=>m.demarrerAlertesMS()).catch(()=>{}); }catch(e){} },6000);
  construire(); tic(); corps.classList.toggle('tb-pause',!visible());
})();
