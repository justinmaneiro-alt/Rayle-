"use strict";
/* ═════════════ MODULES DU MODE MULTI-ÉCRANS ═════════════
   Un module = un morceau d'écran (Raylé, actualités, fil, conversation, météo et heure, la Terre, la galaxie, un écran noir…).
   Registre : MultiModules.enregistrer({type, nom, icone, groupe, fond, variantes, creer(conteneur, ctx)}).
   Les futures planètes (Mars et le trading, etc.) ajoutent LEURS modules en appelant simplement MultiModules.enregistrer(…) : ils apparaissent d'eux-mêmes dans « Mes écrans ».
     type       identifiant (lettres, chiffres, tirets) ; groupe : titre de la liste dans l'éditeur
     fond       true pour un module qui occupe tout l'écran derrière les autres (la Terre, la galaxie : vues 3D plein écran) ; au plus un par écran
     variantes  [{id, nom, params}] : choix proposés dans l'éditeur (ex. actualités France / Monde / Sport…) ; params = réglages du module
     parametre  {libelle, champ, texte} facultatif : champ libre affiché dans l'éditeur (ex. la ville de la météo)
     creer      (conteneur, ctx) → {detruire(), majParams?(params), surVoix?(texte) → bool}
   ctx = {params, role ('principal' | 'satellite'), ecran (id de l'écran), ecouter(type, fn) → fonction d'arrêt,
          envoyer(message) (vers la fenêtre principale), micro(), principal (true dans la fenêtre principale)}
   Événements à écouter : 'etat' (état de Raylé : idle, veille, listening, thinking, speaking), 'ligne' ({kind:'ray'|'user', texte}), 'interim' ({texte}). */
(function(){
  const registre=new Map();
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const noeud=(html)=>{ const d=document.createElement('div'); d.innerHTML=html; return d.firstElementChild; };

  function enregistrer(def){
    if(!def||!/^[a-z0-9-]{1,30}$/.test(def.type||'')||typeof def.creer!=='function') throw new Error('module invalide');
    registre.set(def.type,Object.assign({nom:def.type,icone:'▣',groupe:'Autres',fond:false,variantes:[{id:'',nom:def.nom||def.type,params:{}}]},def));
    try{ window.RayleBus&&RayleBus.emit('multi:modules',{type:def.type}); }catch(e){}
  }
  const obtenir=t=>registre.get(t)||null;
  const liste=()=>[...registre.values()];
  const types=()=>[...registre.keys()];
  /* Nom lisible d'un module placé : « Actualités · Sport » */
  function libelle(m){
    const d=obtenir(m.type); if(!d) return m.type;
    const v=(d.variantes||[]).find(x=>JSON.stringify(x.params||{})===JSON.stringify(m.params||{}));
    if(m.type==='meteo'&&m.params&&m.params.nom) return d.nom+' · '+m.params.nom;
    return v&&v.nom&&v.nom!==d.nom?d.nom+' · '+v.nom:d.nom;
  }

  /* ───── données d'actualité (partagées avec la Terre et l'accueil : chargées à la demande) ───── */
  let donneesActus=null;
  const chargerActus=()=>donneesActus||(donneesActus=Promise.all([
    import(new URL('planetes/terre/pc/fil-actus.js',document.baseURI).href),
    import(new URL('planetes/terre/pc/actus-sujets.js',document.baseURI).href)
  ]).then(([fil,suj])=>({fil,suj})).catch(e=>{ donneesActus=null; throw e; }));
  const message=e=>{ try{ return errMsg(e); }catch(x){ return String((e&&e.message)||e); } };
  const AC=()=>window.ActusAccueilContenu;

  /* ───── Raylé : l'entité Jarvis + le micro ───── */
  enregistrer({type:'rayle',nom:'Raylé',icone:'◉',groupe:'Raylé',
    variantes:[{id:'',nom:'Entité et micro',params:{}}],
    creer(el,ctx){
      el.classList.add('mx-rayle');
      el.innerHTML='<div class="mx-entite"></div><div class="mx-etat"></div><div class="mx-dit"></div><button type="button" class="mx-micro">🎙 Parler à Raylé</button>';
      const hote=el.querySelector('.mx-entite'), etat=el.querySelector('.mx-etat'), dit=el.querySelector('.mx-dit'), micro=el.querySelector('.mx-micro');
      const TEXTES={idle:'MICRO COUPÉ',veille:'VEILLE · DITES « RAYLÉ »',listening:'CONVERSATION',thinking:'ANALYSE',speaking:'TRANSMISSION'};
      const poser=s=>{ etat.textContent=TEXTES[s]||''; el.dataset.etat=s||'idle'; if(window.Entite&&ctx.role==='satellite'){ try{ Entite.etat(s||'idle'); }catch(e){} } };
      try{ window.Entite&&Entite.monter(hote); }catch(e){}
      const arrets=[ctx.ecouter('etat',d=>poser(d&&d.etat)),
        ctx.ecouter('ligne',d=>{ dit.textContent=(d.kind==='user'?'VOUS › ':'')+String(d.texte).slice(0,220); clearTimeout(dit._t); dit._t=setTimeout(()=>{ dit.textContent=''; },15000); }),
        ctx.ecouter('interim',d=>{ if(d&&d.texte){ dit.textContent='« '+String(d.texte).slice(0,200)+' »'; } })];
      poser(ctx.etatInitial&&ctx.etatInitial());
      micro.addEventListener('click',()=>ctx.micro());
      return {detruire(){ arrets.forEach(f=>f()); clearTimeout(dit._t);
        if(ctx.role!=='satellite'){ try{ const r=document.getElementById('reactor'); if(r&&window.Entite) Entite.monter(r); }catch(e){} }   // l'accueil retrouve son entité
      }};
    }});

  /* ───── Actualités : France, Monde ou une rubrique ───── */
  const VARIANTES_ACTUS=[{id:'france',nom:'France',params:{portee:'france',rubrique:null}},{id:'monde',nom:'Monde',params:{portee:'monde',rubrique:null}}]
    .concat(['politique','economie','international','societe','justice','sport','culture','sciences','environnement','sante'].map(r=>({id:'france-'+r,nom:{politique:'Politique',economie:'Économie',international:'International',societe:'Société',justice:'Justice et faits divers',sport:'Sport',culture:'Culture',sciences:'Sciences et technologies',environnement:'Environnement',sante:'Santé'}[r],params:{portee:r==='international'?'monde':'france',rubrique:r}})));
  enregistrer({type:'actus',nom:'Actualités',icone:'📰',groupe:'Actualités',variantes:VARIANTES_ACTUS,
    creer(el,ctx){
      el.classList.add('mx-actus');
      let params=Object.assign({portee:'france',rubrique:null},ctx.params), mort=false, minuteur=0, dernier=null;
      const ligne=s=>'<li class="mx-sujet" style="--c:'+esc(s.couleur)+'"><a class="mx-titre" href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.titre)+'</a>'
        +'<div class="mx-meta"><span class="mx-cat">'+esc(s.catNom)+'</span><span>'+esc(s.source)+'</span><span>'+esc(s.quand)+'</span></div></li>';
      function dessiner(m,S){
        const a=AC(), n=Math.max(4,Math.min(40,Math.floor((el.clientHeight-130)/68)||6));
        const liste=a.selection(m.sujets,params.rubrique,n);
        const chips=[{id:null,nom:'À la une'}].concat(a.rubriquesPresentes(m.sujets,6)).map(r=>'<button type="button" class="mx-chip" data-rub="'+esc(r.id||'')+'"'+((params.rubrique||null)===(r.id||null)?' aria-current="true"':'')+'>'+esc(String(r.nom).split(' ')[0])+'</button>').join('');
        el.innerHTML='<header class="mx-tete"><b>'+esc(a.titreFenetre(params.portee,params.rubrique))+'</b><button type="button" class="mx-act" title="Actualiser">↻</button></header><div class="mx-chips">'+chips+'</div>'
          +(liste.length?'<ol class="mx-liste">'+liste.map(ligne).join('')+'</ol>':'<p class="mx-vide">Aucun sujet dans cette rubrique pour le moment.</p>')
          +'<footer class="mx-pied">'+esc(S.libelleMaj(m.genere))+(m.perime?' · <span class="mx-alerte">copie ancienne : les sources ne répondent pas</span>':'')+'</footer>';
      }
      const attente=()=>{ el.innerHTML='<header class="mx-tete"><b>'+esc(AC().titreFenetre(params.portee,params.rubrique))+'</b></header><p class="mx-vide">Lecture du flux d’actualités…</p>'; };
      async function charger(force){
        if(mort) return; if(!dernier) attente();
        try{
          const {fil,suj}=await chargerActus();
          const brut=await fil.chargerFil(params.portee,'',{force:!!force});
          if(mort) return; dernier=suj.modelesFil(brut,{max:60}); dessiner(dernier,suj);
        }catch(e){ if(mort) return; el.innerHTML='<header class="mx-tete"><b>'+esc(AC().titreFenetre(params.portee,params.rubrique))+'</b></header><div class="mx-erreur"><b>Actualités indisponibles</b><p>'+esc(message(e))+'</p></div>'; }
      }
      el.addEventListener('click',e=>{
        const b=e.target.closest('[data-rub]'); if(b){ params={...params,rubrique:b.dataset.rub||null}; if(dernier) chargerActus().then(({suj})=>dessiner(dernier,suj)); return; }
        if(e.target.closest('.mx-act')) charger(true);
      });
      const ro=window.ResizeObserver?new ResizeObserver(()=>{ if(dernier&&!mort) chargerActus().then(({suj})=>{ if(!mort) dessiner(dernier,suj); }); }):null; if(ro) ro.observe(el);
      charger(false); minuteur=setInterval(()=>charger(true),10*60*1000);
      return {detruire(){ mort=true; clearInterval(minuteur); if(ro) ro.disconnect(); },
        majParams(p){ params=Object.assign({portee:'france',rubrique:null},p); dernier=null; charger(false); },
        /* « actus sport », « l'actualité dans le monde » : cette fenêtre affiche la demande (les phrases de fermeture ne la concernent pas) */
        surVoix(texte){ const c=AC().commande(texte); if(!c) return false;
          if(c.action==='ouvrir'){ params={portee:c.portee,rubrique:c.rubrique}; dernier=null; charger(false); return true; }
          if(c.action==='actualiser'){ charger(true); return true; } return false; }};
    }});

  /* ───── Fil d'actualité défilant (France et monde mélangés, les plus repris d'abord) ───── */
  enregistrer({type:'fil',nom:'Fil d’actualité',icone:'⟿',groupe:'Actualités',variantes:[{id:'',nom:'Défilant',params:{}}],
    creer(el){
      el.classList.add('mx-fil');
      let mort=false, minuteur=0;
      const dessiner=(items,S)=>{
        const html=items.map(s=>'<li class="mx-fil-ligne" style="--c:'+esc(s.couleur)+'"><span class="mx-fil-source">'+esc(s.source)+'</span> '+esc(s.texte)+'</li>').join('');
        el.innerHTML='<div class="mx-fil-tete">À LA UNE · EN DIRECT DES FLUX</div><div class="mx-fil-fenetre"><ul class="mx-fil-piste">'+html+html+'</ul></div>';
        const piste=el.querySelector('.mx-fil-piste'); piste.style.setProperty('--duree',Math.max(30,items.length*6)+'s');
      };
      async function charger(){
        try{
          const {fil,suj}=await chargerActus();
          const [fr,mo]=await Promise.all([fil.chargerFil('france'),fil.chargerFil('monde')]);
          if(mort) return;
          const a=suj.elementsBandeau(suj.modelesFil(fr,{max:40}).sujets,10), b=suj.elementsBandeau(suj.modelesFil(mo,{max:40}).sujets,10), items=[];
          for(let i=0;i<Math.max(a.length,b.length);i++){ if(a[i]) items.push(a[i]); if(b[i]) items.push(b[i]); }
          if(!items.length) throw new Error('aucun sujet pour le moment');
          dessiner(items,suj);
        }catch(e){ if(!mort) el.innerHTML='<div class="mx-erreur"><b>Fil indisponible</b><p>'+esc(message(e))+'</p></div>'; }
      }
      el.innerHTML='<p class="mx-vide">Lecture du flux d’actualités…</p>'; charger(); minuteur=setInterval(charger,10*60*1000);
      return {detruire(){ mort=true; clearInterval(minuteur); }};
    }});

  /* ───── Conversation : ce que Raylé entend et répond ───── */
  enregistrer({type:'conversation',nom:'Conversation',icone:'💬',groupe:'Raylé',variantes:[{id:'',nom:'Transcription',params:{}}],
    creer(el,ctx){
      el.classList.add('mx-conv');
      el.innerHTML='<header class="mx-tete"><b>CONVERSATION</b></header><div class="mx-conv-fil"></div><div class="mx-conv-direct"></div>';
      const fil=el.querySelector('.mx-conv-fil'), direct=el.querySelector('.mx-conv-direct');
      const ajouter=(kind,texte)=>{ const v=fil.querySelector('.mx-vide'); if(v) v.remove(); const d=document.createElement('div'); d.className='mx-msg '+kind; d.innerHTML='<i>'+(kind==='user'?'VOUS':'RAYLÉ')+'</i><span></span>'; d.querySelector('span').textContent=String(texte); fil.appendChild(d); while(fil.children.length>60) fil.removeChild(fil.firstChild); fil.scrollTop=fil.scrollHeight; };
      (ctx.historique&&ctx.historique()||[]).forEach(l=>ajouter(l.kind,l.texte));
      const arrets=[ctx.ecouter('ligne',d=>{ direct.textContent=''; ajouter(d.kind,d.texte); }),
        ctx.ecouter('interim',d=>{ direct.textContent=d&&d.texte?'… '+String(d.texte).slice(0,200):''; })];
      if(!fil.children.length) fil.innerHTML='<p class="mx-vide">La conversation apparaîtra ici.</p>';
      return {detruire(){ arrets.forEach(f=>f()); }};
    }});

  /* ───── Météo et heure ───── */
  enregistrer({type:'meteo',nom:'Météo et heure',icone:'☀',groupe:'Raylé',variantes:[{id:'',nom:'Météo et heure',params:{}}],
    parametre:{libelle:'Ville',champ:'ville',texte:'ex. Bordeaux'},
    async resoudre(texte){   // « Bordeaux » → {nom, lat, lon} par le géocodage gratuit d'Open-Meteo (le même que la Terre)
      const g=await import(new URL('planetes/terre/pc/geocodage.js',document.baseURI).href), r=(await g.chercher(texte,{n:1}))[0];
      if(!r) throw new Error('aucune ville de ce nom'); return {ville:texte,nom:g.libelle(r),lat:r.lat,lon:r.lon};
    },
    creer(el,ctx){
      el.classList.add('mx-meteo');
      let params=Object.assign({},ctx.params), mort=false;
      el.innerHTML='<div class="mx-heure"></div><div class="mx-date"></div><div class="mx-meteo-corps"></div><div class="mx-pied"></div>';
      const h=el.querySelector('.mx-heure'), d=el.querySelector('.mx-date'), corps=el.querySelector('.mx-meteo-corps'), pied=el.querySelector('.mx-pied');
      const tic=()=>{ const n=new Date(); h.textContent=n.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); d.textContent=n.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}); };
      tic(); const horloge=setInterval(tic,1000);
      async function charger(){
        if(!Number.isFinite(params.lat)||!Number.isFinite(params.lon)){ corps.innerHTML='<p class="mx-vide">Choisis une ville dans ⚙ → Mes écrans (clique ce module, champ « Ville »).</p>'; return; }
        corps.innerHTML='<p class="mx-vide">Interrogation du modèle météo…</p>';
        try{
          if(!window.wjson||typeof workerReady==='undefined'||!workerReady()) throw new Error('Worker verrouillé ou non configuré');
          const [M,m]=await Promise.all([import(new URL('planetes/terre/pc/meteo-contenu.js',document.baseURI).href),wjson('/meteo?lat='+params.lat.toFixed(3)+'&lon='+params.lon.toFixed(3),15000)]);
          if(mort) return; const a=m&&m.actuel; if(!a||a.temp===null) throw new Error('météo indisponible pour ce lieu');
          const j=m.jours&&m.jours[0], mm=M.pluie24h(m.heures);
          corps.innerHTML='<div class="mx-lieu">'+esc(params.nom||'')+'</div><div class="mx-temp">'+esc(M.nombre(a.temp,0,' °'))+'</div><div class="mx-ciel">'+esc(M.decrire(a.code)||'—')+'</div>'
            +'<div class="mx-det">Vent '+esc(M.nombre(a.vent,0,' km/h'))+(M.directionCourte(a.direction)?' '+esc(M.directionCourte(a.direction)):'')+(j&&j.tmin!==null?' · min '+esc(M.nombre(j.tmin,0,' °'))+' · max '+esc(M.nombre(j.tmax,0,' °')):'')+(mm!==null?' · pluie 24 h : '+esc(M.nombre(mm,1,' mm')):'')+'</div>';
          pied.textContent='Source : '+(m.modele||'Open-Meteo');
        }catch(e){ if(!mort) corps.innerHTML='<div class="mx-erreur"><b>Météo indisponible</b><p>'+esc(message(e))+'</p></div>'; }
      }
      charger(); const rafr=setInterval(charger,15*60*1000);
      return {detruire(){ mort=true; clearInterval(horloge); clearInterval(rafr); }, majParams(p){ params=Object.assign({},p); charger(); }};
    }});

  /* ───── La Terre en 3D et la galaxie : vues plein écran (« fond » : les autres modules de l'écran se posent par-dessus) ───── */
  const vue3D=(nom)=>async()=>{ const B=window.RayleBus; if(B.demander('vue')!==nom) await B.demander('vue:ouvrir',nom); return B.demander('vue')===nom; };
  enregistrer({type:'galaxie',nom:'Galaxie',icone:'🌌',groupe:'3D',fond:true,variantes:[{id:'',nom:'Galaxie 3D',params:{}}],
    creer(el){ el.classList.add('mx-fond'); el.innerHTML='<p class="mx-fond-note">Galaxie 3D</p>'; vue3D('galaxie')().catch(()=>{});
      return {detruire(){ try{ if(RayleBus.demander('vue')==='galaxie') RayleBus.demander('vue:fermer'); }catch(e){} }}; }});
  enregistrer({type:'terre',nom:'Terre',icone:'🌍',groupe:'3D',fond:true,variantes:[{id:'',nom:'Terre 3D',params:{}}],
    creer(el){ el.classList.add('mx-fond'); el.innerHTML='<p class="mx-fond-note">Terre 3D</p>';
      (async()=>{ try{ if(window.TerreVoix) await TerreVoix.executer({op:'afficher'}); }catch(e){ el.innerHTML='<div class="mx-erreur"><b>Terre indisponible</b><p>'+esc(message(e))+'</p></div>'; } })();
      return {detruire(){ try{ if(RayleBus.demander('vue')==='galaxie') RayleBus.demander('vue:fermer'); }catch(e){} }}; }});

  /* ───── Écran vide (noir) ───── */
  enregistrer({type:'vide',nom:'Écran vide',icone:'■',groupe:'Autres',variantes:[{id:'',nom:'Écran vide (noir)',params:{}}],
    creer(el){ el.classList.add('mx-vide-noir'); return {detruire(){}}; }});

  window.MultiModules={enregistrer,obtenir,liste,types,libelle,esc};
})();
