"use strict";
/* ═════════════ ACTUALITÉS DE TOUS LES PAYS : fenêtres, sélecteur, favoris, voix ═════════════
   Fenêtres holographiques (même cadre que les autres actualités) pour : un PAYS (/actualites?pays=), un CONTINENT (/actualites/region?id=), MES PAYS FAVORIS (digest /actualites/planete).
   Sélecteur de pays : recherche, continents, étoile de favori ; favoris mémorisés sur cet appareil (rayle_pays_favoris).
   Règles : titres, média, langue, date, lien et miniature seulement (jamais le texte des articles) ; les titres restent dans leur langue d'origine avec une étiquette (JA, AR, PT…) ;
   AUCUN appel à l'IA pour récupérer ou afficher (zéro jeton) : l'IA n'intervient que si tu demandes « traduis ces titres » (une seule demande, avec les titres affichés).
   Un pays sans média fiable : la fenêtre ou la voix le disent. Dans la Terre 3D, un pays s'ouvre sur la planète (caméra et fenêtre de la Terre).
   Voix (appelée par actus-accueil.js) : window.ActusPays.commande(texte) → phrase à dire, ou null. Contenu pur : pays-contenu.js (testé). */
(function(){
  if(!window.Panneaux||!window.PaysContenu||!window.RayleBus) return;
  const PC=PaysContenu, esc=Panneaux.esc;
  const lire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const ecrire=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
  const workerOk=()=>{ try{ return !!workerReady(); }catch(e){ return false; } };
  const message=e=>{ try{ return errMsg(e); }catch(x){ return String((e&&e.message)||e); } };
  const mode=()=>document.body.dataset.hud||'normal';
  const DUREE=20*60*1000;
  let index=[], sansSource=[], listeChargee=null, contenu=null;
  let favoris=PC.lireFavoris(lire);
  let derniers={titre:'',titres:[]};          // dernière liste affichée (pour « traduis ces titres »)
  const ouvertes=new Map();                    // id fenêtre → {type, code|id}

  /* ───── données ───── */
  const charger=()=>contenu||(contenu=import(new URL('planetes/terre/pc/actus-contenu.js',document.baseURI).href).catch(e=>{ contenu=null; throw e; }));
  async function pret(){
    if(index.length) return true;
    if(!workerOk()) return false;
    if(!listeChargee) listeChargee=wjson('/actualites?liste=1',12000).then(r=>{ sansSource=r.sansSource||[]; index=PC.construireIndex(r.pays||[],sansSource); return index.length>0; }).catch(()=>{ listeChargee=null; return false; });
    return listeChargee;
  }
  const paysDe=code=>index.find(p=>p.code===code)||null;
  const vignettes=()=>!!(window.MediasContenu&&MediasContenu.profil(mode(),MediasContenu.lireReglages(lire)).vignettes);

  /* ───── rendu d'une liste de titres ───── */
  let lieuCourant=null, compteurIA=0; const registreIA=new Map();   // lieu du pays affiché (photo libre ou carte quand le média ne fournit pas d'image)
  const iaPossible=(t,lieu)=>!!(window.ImagesActus&&ImagesActus.actif()&&lieu);
  function ligneTitre(t,i,avecPays,lieuFixe){
    const dir=/^(?:ar|he|fa|ur)$/.test(t.langue||'')?' dir="rtl"':'', img=vignettes()&&t.image&&/^https:\/\/[^\s<>"']{8,400}$/.test(t.image);
    const lieuT=avecPays&&t.pays&&paysDe(t.pays.code)?{lat:paysDe(t.pays.code).lat,lon:paysDe(t.pays.code).lon,nom:t.pays.nom,type:'pays'}:(lieuFixe||null), zone=vignettes()&&!img&&iaPossible(t,lieuT);
    let jeton=0; if(zone){ jeton=++compteurIA; registreIA.set(jeton,{t,lieu:lieuT}); if(registreIA.size>400) registreIA.delete(registreIA.keys().next().value); }
    return '<li class="ac-sujet ap-titre'+(img||zone?' ac-avec-image':'')+'" style="--d:'+(0.15+i*0.07).toFixed(2)+'s;--c:#4de3ff">'
      +(zone?'<span class="ac-vignette ia-zone ac-vig-vide" data-iak="'+jeton+'"></span>':'')+(img?'<img class="ac-vignette" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="" title="Image fournie par le flux RSS de '+esc(t.source)+' (© '+esc(t.source)+')" src="'+esc(t.image)+'">':'')
      +'<a class="ac-titre" href="'+esc(t.url)+'" target="_blank" rel="noopener noreferrer"'+(t.langue?' lang="'+esc(t.langue)+'"':'')+dir+'>'+esc(t.titre)+'</a>'
      +'<div class="ac-meta">'+(t.langue?'<span class="ap-lang" title="Titre en '+esc(PC.nomLangue(t.langue))+' (langue d’origine, non traduit)">'+esc(PC.etiquetteLangue(t.langue))+'</span>':'')
      +(avecPays&&t.pays?'<span class="ap-pays">'+esc(t.pays.nom)+'</span>':'')+'<span>'+esc(t.source)+'</span>'+(t.quand?'<span>'+esc(t.quand)+'</span>':'')+'</div></li>';
  }
  const htmlAttente=nom=>'<p class="pn-vide ac-attente">Lecture des médias'+(nom?' · '+esc(nom):'')+'…</p><i class="ac-balayage" aria-hidden="true"></i>';
  const htmlErreur=(titre,raison)=>'<div class="ac-erreur"><b>'+esc(titre)+'</b><p>'+esc(raison)+'</p></div>';
  function afficher(id,titre,html,pied){
    Panneaux.ouvrir({id,type:'holo-actus',icone:'◈',titre,duree:DUREE,corps:{html},pied});
    const f=document.querySelector('#panneaux .pn[data-id="'+id+'"]');
    if(f&&window.ImagesActus) f.querySelectorAll('.ac-vig-vide[data-iak]').forEach(z=>{ const r=registreIA.get(+z.dataset.iak); if(r) ImagesActus.attacher(z,{image:r.t.image,source:r.t.source,url:r.t.url},{lieu:r.lieu,largeur:74,hauteur:50}); });
    if(window.ActusAccueil&&ActusAccueil.deplacable) ActusAccueil.deplacable(id);
  }
  const piedPays=(code,rafraichir)=>[{texte:favoris.includes(code)?'★ Retirer des favoris':'☆ Mes favoris',clic:()=>{ basculer(code); rafraichir(); }},{texte:'Actualiser',clic:rafraichir},{texte:'Pays…',clic:()=>selecteur()}];

  /* ───── un pays ───── */
  async function ouvrirPays(code,opt){
    await pret(); const p=paysDe(code);
    if(!p) return {ok:false,phrase:'Je ne connais pas ce pays.'};
    if(p.sansSource) return {ok:true,phrase:PC.phraseSansSource(p.nom),sans:true};
    if(window.Terre&&Terre.etat&&Terre.etat().actif&&!(opt&&opt.accueil)){   // dans la Terre 3D : le pays s'ouvre sur la planète
      const r=await Terre.actualites(code,p.nom); if(Number.isFinite(p.lat)&&Terre.aller) { try{ Terre.aller({nom:p.nom,lat:p.lat,lon:p.lon,distance:p.dist||1500}); }catch(e){} }
      return {ok:!!(r&&r.ok),phrase:PC.phrasePays(p.nom,r&&r.modele&&r.modele.sources,p.langues)};
    }
    const id='actus-pays-'+code, titre='Actualités · '+p.nom; ouvertes.set(id,{type:'pays',code});
    const rafraichir=()=>ouvrirPays(code,{accueil:true});
    afficher(id,titre,htmlAttente(p.nom),piedPays(code,rafraichir));
    try{
      const {modeleActus,dateRelative}=await charger();
      const res=await wjson('/actualites?pays='+encodeURIComponent(code)+'&n=16&nom='+encodeURIComponent(p.nom),20000);
      const m=modeleActus(res);
      const titres=(res.titres||[]).filter(t=>t&&t.titre&&t.url&&/^https?:\/\//.test(t.url)).slice(0,16).map(t=>({titre:String(t.titre).trim(),url:t.url,source:String(t.source||'source inconnue'),langue:t.langue||'',image:t.image||null,quand:dateRelative(t.date)}));
      if(!titres.length){ afficher(id,titre,htmlErreur('Aucun titre pour le moment','Les médias de '+p.nom+' ne répondent pas ou n’ont rien de récent. Rien n’est inventé.'),piedPays(code,rafraichir)); return {ok:false,phrase:'Je n’ai trouvé aucun titre pour '+p.nom+' pour le moment.'}; }
      derniers={titre:p.nom,titres:titres.slice(0,6)};
      const panne=(res.sources||[]).filter(s=>!s.ok).map(s=>s.nom);
      lieuCourant=Number.isFinite(p.lat)&&Number.isFinite(p.lon)?{lat:p.lat,lon:p.lon,nom:p.nom,type:'pays'}:null;
      afficher(id,titre,'<ol class="ac-liste">'+titres.map((t,i)=>ligneTitre(t,i,false,lieuCourant)).join('')+'</ol><div class="pn-sous ac-maj">'+esc(m.sources.join(' · '))+(panne.length?' · <span class="ac-panne">indisponible : '+esc(panne.join(', '))+'</span>':'')+' · titres dans leur langue d’origine</div>',piedPays(code,rafraichir));
      return {ok:true,phrase:PC.phrasePays(p.nom,m.sources,[...new Set(titres.map(t=>t.langue).filter(Boolean))])};
    }catch(e){ const r=message(e); afficher(id,titre,htmlErreur('Actualités indisponibles',r),piedPays(code,rafraichir)); return {ok:false,phrase:'Je n’ai pas pu lire les actualités de '+p.nom+' : '+r+'.'}; }
  }

  /* ───── un continent ───── */
  async function ouvrirRegion(id,nom){
    const fid='actus-region-'+id, titre='Actualités · '+nom; ouvertes.set(fid,{type:'region',id});
    const rafraichir=()=>ouvrirRegion(id,nom), pied=[{texte:'Actualiser',clic:rafraichir},{texte:'Pays…',clic:()=>selecteur()}];
    afficher(fid,titre,htmlAttente(nom),pied);
    try{
      const {dateRelative}=await charger();
      const res=await wjson('/actualites/region?id='+encodeURIComponent(id)+'&n=24',20000);
      const titres=(res.titres||[]).filter(t=>t&&t.titre&&/^https?:\/\//.test(t.url||'')).map(t=>({titre:t.titre,url:t.url,source:t.source||'source inconnue',langue:t.langue||'',image:t.image||null,pays:t.pays||null,quand:dateRelative(t.date)}));
      if(!titres.length){ afficher(fid,titre,htmlErreur('Rien pour le moment',(res.nbPays?'Aucun titre récent.':'Aucun pays de cette région n’a encore été lu.')+' Rien n’est inventé.'),pied); return {ok:false,phrase:'Je n’ai aucun titre pour '+nom+' pour le moment.'}; }
      derniers={titre:nom,titres:titres.slice(0,6)};
      afficher(fid,titre,'<ol class="ac-liste">'+titres.map((t,i)=>ligneTitre(t,i,true)).join('')+'</ol><div class="pn-sous ac-maj">'+(res.nbPays||0)+' pays + médias régionaux'+(res.sansDonnees&&res.sansDonnees.length?' · sans données : '+esc(res.sansDonnees.slice(0,8).join(', '))+(res.sansDonnees.length>8?'…':''):'')+(res.perime?' · <span class="ac-panne">copie ancienne</span>':'')+' · titres dans leur langue d’origine</div>',pied);
      return {ok:true,phrase:PC.phraseRegion(nom,res.nbPays||0,titres.length)};
    }catch(e){ const r=message(e); afficher(fid,titre,htmlErreur('Actualités indisponibles',/préparation/.test(r)?r:r),pied); return {ok:false,phrase:'Je n’ai pas pu lire les actualités de '+nom+' : '+r+'.'}; }
  }

  /* ───── mes pays favoris (digest de la planète : un appel, aucun flux lu à la demande) ───── */
  async function ouvrirFavoris(){
    await pret();
    const id='actus-favoris', titre='Actualités · mes pays favoris', rafraichir=()=>ouvrirFavoris(), pied=[{texte:'Actualiser',clic:rafraichir},{texte:'Pays…',clic:()=>selecteur()}];
    if(!favoris.length){ afficher(id,titre,htmlErreur('Aucun pays favori','Ouvre « Pays… » et touche l’étoile d’un pays, ou dis « ajoute le Japon à mes favoris ».'),pied); return {ok:true,phrase:PC.phraseFavoris([])}; }
    afficher(id,titre,htmlAttente(''),pied);
    try{
      const {dateRelative}=await charger();
      const d=await wjson('/actualites/planete',20000);
      let blocs='', noms=[];
      for(const code of favoris){
        const p=paysDe(code), nom=p?p.nom:code; noms.push(nom);
        const e=d.pays&&d.pays[code];
        blocs+='<h3 class="ap-h">'+esc(nom)+(e?' <small>'+esc(e.s||'')+'</small>':'')+'</h3>'
          +(e?'<ol class="ac-liste">'+e.t.map((t,i)=>ligneTitre({titre:t.t,url:t.u,source:e.s,langue:e.l,image:t.i,quand:dateRelative(t.d)},i,false)).join('')+'</ol>'
            :'<p class="pn-vide">'+(d.indisponibles&&d.indisponibles[code]?'Médias indisponibles pour le moment.':'Pas encore lu (le digest se remplit chaque heure).')+'</p>');
      }
      afficher(id,titre,blocs+'<div class="pn-sous ac-maj">digest de la planète · '+esc(d.genere?new Date(d.genere).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'')+' · titres dans leur langue d’origine</div>',pied);
      return {ok:true,phrase:PC.phraseFavoris(noms)};
    }catch(e){ const r=message(e); afficher(id,titre,htmlErreur('Digest indisponible',r+' Les pays restent disponibles un par un.'),pied); return {ok:false,phrase:'Je n’ai pas pu lire tes favoris : '+r+'.'}; }
  }

  /* ───── favoris ───── */
  function basculer(code,etat){
    const r=PC.basculerFavori(favoris,code,etat);
    if(r.change){ favoris=r.favoris; ecrire(PC.CLE_FAVORIS,JSON.stringify(favoris)); RayleBus.emit('pays:favoris',{favoris:favoris.slice()}); majSelecteur(); }
    return r;
  }

  /* ───── sélecteur de pays ───── */
  let sel=null, selContinent='tous', selRequete='';
  function majSelecteur(){ if(sel) dessinerSelecteur(); }
  function dessinerSelecteur(){
    const corps=sel.querySelector('.ps-corps'), chips=sel.querySelector('.ps-continents');
    const chip=(id,nom,n)=>'<button type="button" class="ps-chip" data-c="'+id+'"'+(selContinent===id?' aria-current="true"':'')+'>'+esc(nom)+(n!==undefined?' <b>'+n+'</b>':'')+'</button>';
    chips.innerHTML=chip('tous','Tous',index.filter(p=>!p.sansSource).length)+chip('favoris','★ Favoris',favoris.length)+Object.entries(PC.CONTINENTS).map(([id,nom])=>chip(id,nom,index.filter(p=>p.continent===id&&!p.sansSource).length)).join('');
    const q=selRequete, bouton=p=>'<div class="ps-pays'+(p.sansSource?' ps-sans':'')+'" data-code="'+p.code+'">'
      +'<button type="button" class="ps-etoile" data-e="'+p.code+'" aria-label="'+(favoris.includes(p.code)?'Retirer des favoris':'Ajouter aux favoris')+'" aria-pressed="'+favoris.includes(p.code)+'"'+(p.sansSource?' disabled':'')+'>'+(favoris.includes(p.code)?'★':'☆')+'</button>'
      +'<button type="button" class="ps-nom" data-p="'+p.code+'"'+(p.sansSource?' title="Aucun média fiable pour ce pays : rien n’est inventé"':'')+'><span>'+esc(p.nom)+'</span><small>'+(p.sansSource?'sans source fiable':esc(p.langues.map(l=>PC.etiquetteLangue(l)).join(' · ')))+'</small></button></div>';
    let html='';
    if(selContinent==='favoris'){
      const l=index.filter(p=>favoris.includes(p.code)&&(!q||PC.filtrer([p],q).length));
      html=l.length?'<div class="ps-grille">'+l.map(bouton).join('')+'</div><div class="ps-actions"><button type="button" class="ps-bouton" data-a="favoris">Voir les actualités de mes favoris</button></div>':'<p class="ps-vide">Aucun favori : touche l’étoile d’un pays.</p>';
    }else{
      const groupes=PC.groupes(index.filter(p=>selContinent==='tous'||p.continent===selContinent),q);
      if(!groupes.length) html='<p class="ps-vide">Aucun pays ne correspond à « '+esc(q)+' ».</p>';
      for(const g of groupes){
        const regionOk=PC.CONTINENTS[g.id];
        html+='<section class="ps-groupe"><h3>'+esc(g.nom)+' <small>'+g.pays.filter(p=>!p.sansSource).length+' pays</small>'+(regionOk?'<button type="button" class="ps-bouton ps-region" data-r="'+g.id+'">Actualités de la région</button>':'')+'</h3><div class="ps-grille">'+g.pays.map(bouton).join('')+'</div></section>';
      }
    }
    corps.innerHTML=html;
  }
  function selecteur(){
    pret().then(ok=>{
      if(!ok&&!index.length){ if(window.addLine) addLine('sys','Sélecteur de pays : liste indisponible ('+(workerOk()?'le Worker ne répond pas ou n’est pas à jour':'Worker verrouillé')+').'); }
      if(sel){ sel.querySelector('input').focus(); dessinerSelecteur(); return; }
      sel=document.createElement('div'); sel.id='pays-selecteur'; sel.className='ps'; sel.setAttribute('role','dialog'); sel.setAttribute('aria-label','Choisir un pays ou une région');
      sel.innerHTML='<div class="ps-cadre hud-cadre hud-in"><header class="pn-tete"><span class="pn-ico">◈</span><h2>Pays et régions</h2><button type="button" class="pn-x" aria-label="Fermer">✕</button></header>'
        +'<div class="ps-outils"><input type="search" placeholder="Chercher un pays (Japon, Brésil, USA, Côte d’Ivoire…)" aria-label="Chercher un pays" autocomplete="off" spellcheck="false" maxlength="60"><div class="ps-continents" role="group" aria-label="Continents"></div></div>'
        +'<div class="ps-corps"></div><footer class="ps-pied">Titres dans leur langue d’origine, avec le nom du média · aucun appel à l’IA pour les récupérer · les pays sans média fiable sont grisés.</footer></div>';
      document.body.appendChild(sel);
      const fermer=()=>{ sel.remove(); sel=null; document.removeEventListener('keydown',touche,true); };
      const touche=e=>{ if(e.key==='Escape'&&sel){ fermer(); e.stopImmediatePropagation(); } };
      document.addEventListener('keydown',touche,true);
      sel.querySelector('.pn-x').addEventListener('click',fermer);
      sel.addEventListener('click',e=>{
        if(e.target===sel){ fermer(); return; }
        const c=e.target.closest('[data-c]'); if(c){ selContinent=c.dataset.c; dessinerSelecteur(); return; }
        const et=e.target.closest('[data-e]'); if(et){ basculer(et.dataset.e); return; }
        const p=e.target.closest('[data-p]'); if(p){ const code=p.dataset.p; fermer(); ouvrirPays(code).then(r=>{ if(r&&r.phrase&&window.addLine) addLine('sys',r.phrase); }); return; }
        const r=e.target.closest('[data-r]'); if(r){ const id=r.dataset.r; fermer(); ouvrirRegion(id,PC.CONTINENTS[id]); return; }
        const a=e.target.closest('[data-a="favoris"]'); if(a){ fermer(); ouvrirFavoris(); }
      });
      const champ=sel.querySelector('input');
      champ.addEventListener('input',()=>{ selRequete=champ.value; dessinerSelecteur(); });
      champ.addEventListener('keydown',e=>{ if(e.key==='Enter'){ const premier=sel.querySelector('.ps-nom:not([disabled])'); if(premier&&!premier.closest('.ps-sans')){ premier.click(); e.preventDefault(); } } });
      selContinent='tous'; selRequete=''; dessinerSelecteur(); champ.focus();
    });
  }

  /* ───── voix ───── */
  async function commande(texte,opt){
    const cheap=PC.sans(texte);
    if(!/actualit|actus?\b|infos?\b|news|nouvelles|titres|favoris|pays\b|traduis|neuf|passe/.test(cheap)) return null;      // évite de charger la liste pour rien
    if(!(await pret())) return null;                       // liste indisponible (Worker verrouillé ou pas à jour) : la demande suit son chemin habituel
    const a=PC.commande(texte,index); if(!a) return null;
    switch(a.action){
      case 'pays': return (await ouvrirPays(a.code)).phrase;
      case 'region': return (await ouvrirRegion(a.id,a.nom)).phrase;
      case 'sans_source': return PC.phraseSansSource(a.nom);
      case 'amerique': return 'Quelle partie des Amériques : l’Amérique du Nord, l’Amérique centrale et les Caraïbes, ou l’Amérique du Sud ?';
      case 'favoris': return (await ouvrirFavoris()).phrase;
      case 'ajouter_favori': { const r=basculer(a.code,true); return r.plein?'Tu as déjà '+PC.MAX_FAVORIS+' pays favoris : retires-en un d’abord.':r.change?a.pays.nom+' est dans tes favoris.':a.pays.nom+' était déjà dans tes favoris.'; }
      case 'retirer_favori': { const r=basculer(a.code,false); return r.change?a.pays.nom+' n’est plus dans tes favoris.':a.pays.nom+' n’était pas dans tes favoris.'; }
      case 'favori_inconnu': return 'Je ne connais pas « '+a.nom+' » parmi les pays.';
      case 'selecteur': selecteur(); return 'Voici la liste des pays.';
      case 'traduire': {
        if(!derniers.titres.length) return 'Je n’ai pas de titres affichés à traduire : ouvre d’abord les actualités d’un pays.';
        const liste=derniers.titres.map((t,i)=>(i+1)+'. ['+(t.langue||'?').toUpperCase()+'] '+t.titre).join('\n');
        setTimeout(()=>{ try{ RayleBus.demander('rayle:demande','Traduis en français ces titres d’actualité ('+derniers.titre+'), un par un, sans commentaire :\n'+liste); }catch(e){} },50);   // la SEULE demande à l'IA de ce module, uniquement parce qu'on l'a demandé
        return 'Je les traduis, un instant.';
      }
    }
    return null;
  }

  RayleBus.on('medias:reglages',()=>{ for(const [id,o] of ouvertes) if(document.querySelector('#panneaux .pn[data-id="'+id+'"]')){ if(o.type==='pays') ouvrirPays(o.code,{accueil:true}); else if(o.type==='region') ouvrirRegion(o.id,PC.CONTINENTS[o.id]); } });
  const bouton=document.getElementById('btnPays'); if(bouton) bouton.addEventListener('click',()=>selecteur());
  window.ActusPays={pret,ouvrirPays,ouvrirRegion,ouvrirFavoris,selecteur,commande,basculer,favoris:()=>favoris.slice(),index:()=>index.slice(),
    etat:()=>({selecteur:!!sel,favoris:favoris.slice(),pays:index.length,ouvertes:[...ouvertes.keys()].filter(id=>document.querySelector('#panneaux .pn[data-id="'+id+'"]')),dernier:derniers.titre})};
})();
