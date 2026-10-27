"use strict";
/* ═════════════ MÉDIAS DANS LES RÉPONSES : le complément (images, vidéos) sous la réponse de Raylé ═════════════
   Quand la question est une RECHERCHE (« parle-moi de… », « c'est quoi… », « où se trouve… », « l'histoire de… ») ou une ACTUALITÉ (« que se passe-t-il à… »), Raylé cherche en parallèle
   quelques images libres (Worker /images : Wikipédia, Wikimedia Commons, Openverse, archives libres) et, si c'est possible, une vidéo fiable (Worker /videos : chaînes YouTube
   officielles des médias d'information, Wikimedia Commons, Internet Archive). Le TEXTE reste la réponse : les médias ne s'affichent qu'APRÈS la réponse écrite, dans une petite fenêtre
   repliable à taille limitée, sans jamais retarder la voix. Les commandes, la conversation simple, le trading et les réglages n'en affichent jamais (règles : medias-contenu.js).
   Vidéos : miniature seulement ; le lecteur officiel (youtube-nocookie, archive.org/embed, ou le fichier Wikimedia) n'est créé qu'au CLIC, jamais en lecture automatique.
   Légende toujours visible : titre, « Source : … · Licence : … », lien vers la source. Rien n'est copié : tout s'affiche depuis la source.
   Réglages ⚙ : médias activés / vidéos activées ; modes : léger = rien d'automatique, normal = 3 images + 1 vidéo, complet = 4 images + 2 vidéos.
   Voix : « enlève les images », « désactive / active les images (les vidéos) », « montre-moi les images de cette actualité », « montre-moi une vidéo de… ». */
(function(){
  if(!window.Panneaux||!window.MediasContenu||!window.ImagesContenu||!window.RayleBus) return;
  const MC=MediasContenu, IC=ImagesContenu, esc=Panneaux.esc, ID='holo-medias';
  const mode=()=>document.body.dataset.hud||'normal';
  const lire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const ecrire=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
  const reglages=()=>MC.lireReglages(lire);
  const profil=()=>MC.profil(mode(),reglages());
  const workerOk=()=>{ try{ return !!workerReady(); }catch(e){ return false; } };
  const messageErreur=e=>{ try{ return errMsg(e); }catch(x){ return String((e&&e.message)||e); } };
  const lien=(url,texte,classe)=>'<a'+(classe?' class="'+classe+'"':'')+' href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(texte)+'</a>';
  const dire=t=>{ try{ addLine('ray',t); speak(t); }catch(e){} };

  let courant=null;        // {titre, images, videos, sujet, replie, sel, el}
  let attente=null;        // {jeton, promesse, requete} : recherche lancée avec la question, affichée après la réponse écrite
  let seq=0;

  /* ───── Worker ───── */
  async function appelImages(requete,n){
    if(!workerOk()) return {images:[],erreur:'Worker verrouillé'};
    try{ const res=await wjson('/images?q='+encodeURIComponent(requete)+'&n='+n,9000); return {images:IC.filtrerImages(res,n),sujet:res&&res.sujet||null}; }
    catch(e){ return {images:[],erreur:messageErreur(e)}; }
  }
  async function appelVideos(requete,type,n){
    if(!workerOk()) return {videos:[],erreur:'Worker verrouillé'};
    try{ const res=await wjson('/videos?q='+encodeURIComponent(requete)+'&type='+type+'&n='+n,9000); return {videos:MC.filtrerVideos(res,n),raison:res&&res.raison}; }
    catch(e){ return {videos:[],erreur:messageErreur(e)}; }
  }

  /* ───── légendes ───── */
  function legendeImage(im){
    const lic=im.licence_url?lien(im.licence_url,im.licence):esc(im.licence);
    const NOM={wikipedia:'Wikipédia (Wikimedia Commons)',commons:'Wikimedia Commons',openverse:'Openverse',archive:'Internet Archive'};
    const src=im.origine==='flux'?'Source : '+esc(im.auteur)+' (flux RSS du média)':'Source : '+esc(NOM[im.origine]||im.origine);
    return '<b class="med-l-titre">'+esc(im.titre)+'</b><span class="med-l-ligne">'+(im.origine==='flux'?src:'Auteur : '+esc(im.auteur)+' · '+src)+' · Licence : '+lic+'</span>'+lien(im.source_url,im.origine==='flux'?'Lire l’article':'Voir la source','med-l-lien');
  }
  function legendeVideo(v){
    const lic=v.licence_url?lien(v.licence_url,v.licence):esc(v.licence);
    return '<b class="med-l-titre">'+esc(v.titre)+'</b><span class="med-l-ligne">Source : '+esc(MC.NOM_PLATEFORME[v.plateforme]||v.plateforme)+' · '+esc(v.auteur)+' · Licence : '+lic+'</span>'+lien(v.source_url,'Ouvrir sur la source','med-l-lien');
  }

  /* ───── lecteur de vidéo : créé au clic seulement ───── */
  function lecteur(v){
    if(v.plateforme==='commons'){
      const e=document.createElement('video'); e.controls=true; e.autoplay=true; e.preload='auto'; e.playsInline=true; if(v.miniature) e.poster=v.miniature; e.src=v.fichier; e.className='med-lecteur'; e.setAttribute('referrerpolicy','no-referrer');
      return e;
    }
    const f=document.createElement('iframe'); f.className='med-lecteur';
    f.src=v.embed+(v.plateforme==='youtube'?'?autoplay=1&rel=0&modestbranding=1':'');
    f.allow='autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen=true; f.referrerPolicy='strict-origin-when-cross-origin'; f.title=v.titre;
    f.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox');
    return f;
  }

  /* ───── la fenêtre : bandeau d'images + vidéos, repliable ───── */
  function construire(el,d){
    el.classList.add('med');
    const imgs=d.images, vids=d.videos;
    el.innerHTML='<div class="med-corps">'
      +(imgs.length?'<div class="med-bande" role="list">'+imgs.map((im,i)=>'<button type="button" class="med-thumb'+(i===d.sel?' actif':'')+'" role="listitem" data-i="'+i+'" aria-label="Image '+(i+1)+' : '+esc(im.titre)+'"><img loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="'+esc(im.titre)+'" src="'+esc(im.miniature)+'"></button>').join('')+'</div><div class="med-legende"></div>':'')
      +(vids.length?'<div class="med-videos">'+vids.map((v,i)=>'<figure class="med-video" data-v="'+i+'"><button type="button" class="med-play" aria-label="Lire la vidéo : '+esc(v.titre)+'">'+(v.miniature?'<img loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="" src="'+esc(v.miniature)+'">':'')+'<span class="med-play-ico" aria-hidden="true">▶</span></button><figcaption>'+legendeVideo(v)+'</figcaption></figure>').join('')+'</div>':'')
      +(d.sujet?'<div class="med-note">Sujet : '+(d.sujet.url?lien(d.sujet.url,d.sujet.titre):esc(d.sujet.titre))+'</div>':'')
      +'</div>';
    el.classList.toggle('med-replie',!!d.replie);
    majLegende(el,d);
    el.addEventListener('click',e=>{
      const t=e.target.closest('.med-thumb'); if(t){ const i=+t.dataset.i; if(d.sel===i||e.pointerType==='mouse') ouvrirLightbox(i); else{ d.sel=i; el.querySelectorAll('.med-thumb').forEach(b=>b.classList.toggle('actif',+b.dataset.i===i)); majLegende(el,d); } return; }
      const p=e.target.closest('.med-play'); if(p){ const fig=p.closest('.med-video'), v=vids[+fig.dataset.v]; p.replaceWith(lecteur(v)); fig.classList.add('lit'); }
    });
    el.addEventListener('mouseover',e=>{ const t=e.target.closest&&e.target.closest('.med-thumb'); if(t&&+t.dataset.i!==d.sel){ d.sel=+t.dataset.i; el.querySelectorAll('.med-thumb').forEach(b=>b.classList.toggle('actif',+b.dataset.i===d.sel)); majLegende(el,d); } });
  }
  function majLegende(el,d){ const l=el.querySelector('.med-legende'); if(l&&d.images[d.sel]) l.innerHTML=legendeImage(d.images[d.sel]); }
  function brancherEntete(d){
    const pn=document.querySelector('.pn[data-id="'+ID+'"]'); if(!pn||pn.querySelector('.med-plier')) return;
    const b=document.createElement('button'); b.type='button'; b.className='med-plier'; b.setAttribute('aria-label','Replier ou déplier les médias');
    const maj=()=>{ b.textContent=d.replie?'▸':'▾'; b.setAttribute('aria-expanded',String(!d.replie)); b.title=d.replie?'Déplier':'Replier'; };
    b.addEventListener('click',()=>{ d.replie=!d.replie; pn.querySelector('.pn-corps').classList.toggle('med-replie',d.replie); maj(); });
    pn.querySelector('.pn-tete').insertBefore(b,pn.querySelector('.pn-x')); maj();
  }
  function ouvrir(d){
    courant=d;
    Panneaux.ouvrir({id:ID,type:'holo-medias',icone:'▣',titre:d.titre,duree:240000,
      corps:el=>{ d.el=el; el.classList.toggle('med-replie',!!d.replie); construire(el,d); return ()=>{ if(courant===d) d.el=null; }; },
      onFermer:()=>{ fermerLightbox(); if(courant===d) courant=null; }});
    brancherEntete(d);
    if(d.replie){ const pn=document.querySelector('.pn[data-id="'+ID+'"] .pn-corps'); if(pn) pn.classList.add('med-replie'); }
  }

  /* ───── agrandissement ───── */
  let lb=null, lbI=0;
  function fermerLightbox(){ if(lb){ lb.remove(); lb=null; } }
  function ouvrirLightbox(i){
    if(!courant||!courant.images.length) return;
    lbI=i;
    if(!lb){
      lb=document.createElement('div'); lb.className='med-lb'; lb.setAttribute('role','dialog'); lb.setAttribute('aria-label','Image agrandie');
      lb.innerHTML='<div class="med-lb-cadre hud-cadre hud-in"><header class="pn-tete"><span class="pn-ico">▣</span><h2></h2><button type="button" class="pn-x" aria-label="Fermer">✕</button></header><div class="med-lb-corps"><button type="button" class="med-lb-nav g" aria-label="Précédente">‹</button><img referrerpolicy="no-referrer" alt=""><button type="button" class="med-lb-nav d" aria-label="Suivante">›</button></div><div class="med-lb-leg"></div></div>';
      lb.querySelector('.pn-x').addEventListener('click',fermerLightbox);
      lb.querySelector('.g').addEventListener('click',()=>ouvrirLightbox(Math.max(0,lbI-1)));
      lb.querySelector('.d').addEventListener('click',()=>ouvrirLightbox(Math.min(courant.images.length-1,lbI+1)));
      lb.addEventListener('click',e=>{ if(e.target===lb) fermerLightbox(); });
      document.body.appendChild(lb);
    }
    const im=courant.images[lbI];
    lb.querySelector('h2').textContent=im.titre+'  ·  '+(lbI+1)+' / '+courant.images.length;
    lb.querySelector('img').src=im.grande||im.miniature; lb.querySelector('img').alt=im.titre;
    lb.querySelector('.med-lb-leg').innerHTML=legendeImage(im);
    lb.querySelector('.g').disabled=lbI===0; lb.querySelector('.d').disabled=lbI===courant.images.length-1;
  }
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&lb){ fermerLightbox(); e.stopImmediatePropagation(); } },true);

  /* ───── complément automatique d'une réponse ───── */
  /* Appelé avec la question, AVANT la réponse : la recherche part tout de suite (sans rien bloquer) ; montrer() l'affiche après la réponse écrite. */
  function lancer(texte){
    attente=null;
    const p=profil(); if(!p.auto||(p.images<1&&p.videos<1)) return false;
    const c=MC.classer(texte); if(!c||!workerOk()) return false;
    const jeton=++seq, genre=c.genre;
    const imgs=p.images>0?appelImages(c.requete,p.images):Promise.resolve({images:[]});
    const vids=p.videos>0?appelVideos(c.requete,genre==='actualite'?'actu':'savoir',p.videos):Promise.resolve({videos:[]});
    attente={jeton,requete:c.requete,genre,profil:p,promesse:Promise.all([imgs,vids]),cree:Date.now()};   // le profil est celui du moment de la question
    return true;
  }
  /* Appelé juste après l'affichage de la réponse écrite : ouvre la petite fenêtre si la recherche a trouvé quelque chose, sinon ne montre rien. */
  function montrer(){
    const a=attente; attente=null; if(!a||Date.now()-a.cree>60000) return false;
    a.promesse.then(([i,v])=>{
      if(a.jeton!==seq) return;
      const pr=a.profil, r=reglages(); if(!r.medias) return;     // réglage coupé entre-temps : rien
      const images=i.images.slice(0,pr.images), videos=r.videos?v.videos.slice(0,pr.videos):[];
      if(!images.length&&!videos.length) return;
      ouvrir({titre:(a.genre==='actualite'?'Actualité':'Médias')+' · '+(i.sujet?i.sujet.titre:a.requete),images,videos,sujet:i.sujet&&i.sujet.titre?i.sujet:null,replie:false,sel:0,el:null});
    }).catch(e=>console.warn('[médias]',e));
    return true;
  }

  /* ───── galerie d'une actualité (fenêtres d'actualité) ───── */
  async function galerieActu(sujet,quoi){
    const r=reglages();
    if(!r.medias) return MC.phrases.pasMedias;
    if(!sujet) return MC.phrases.aucuneActu;
    const p=profil(), voirImages=quoi!=='videos', voirVideos=quoi!=='images'&&r.videos;
    if(quoi==='videos'&&!r.videos) return MC.phrases.pasVideos;
    const images=voirImages?MC.imagesDuSujet(sujet,p.explicite||1):[];
    let videos=[];
    if(voirVideos&&workerOk()){ const v=await appelVideos(sujet.titre,'actu',p.mode==='leger'?1:2); videos=v.videos.slice(0,p.mode==='leger'?1:2); }
    if(!images.length&&!videos.length) return MC.phrases.actuSansMedia;
    ouvrir({titre:'Actualité · '+sujet.titre.slice(0,60),images,videos,sujet:{titre:sujet.titre,url:sujet.url||(sujet.sources&&sujet.sources[0]&&sujet.sources[0].url)||''},replie:false,sel:0,el:null});
    return 'Voici '+(images.length?(images.length===1?'l’image':'les '+images.length+' images'):'')+(images.length&&videos.length?' et ':'')+(videos.length?(videos.length===1?'la vidéo':'les '+videos.length+' vidéos'):'')+' de cette actualité. Rien ne se lit tout seul.';
  }
  async function videoDe(sujet){
    const r=reglages(); if(!r.medias||!r.videos) return r.medias?MC.phrases.pasVideos:MC.phrases.pasMedias;
    if(!workerOk()) return MC.phrases.indisponible('Worker verrouillé ou non configuré');
    const n=profil().mode==='leger'?1:2;
    const [a,b]=await Promise.all([appelVideos(sujet,'savoir',n),appelVideos(sujet,'actu',n)]);
    if(a.erreur&&b.erreur) return MC.phrases.indisponible(a.erreur);
    const vus=new Set(), videos=[...a.videos,...b.videos].filter(v=>!vus.has(v.source_url)&&vus.add(v.source_url)).slice(0,n);
    if(!videos.length) return MC.phrases.aucuneVideo(sujet);
    ouvrir({titre:'Vidéos · '+sujet,images:[],videos,sujet:null,replie:false,sel:0,el:null});
    return videos.length===1?'Voici une vidéo. Elle ne se lance que si tu cliques dessus.':'Voici '+videos.length+' vidéos. Elles ne se lancent que si tu cliques dessus.';
  }

  /* ───── réglages et commandes vocales ───── */
  function fermerTout(){ const a=!!courant; Panneaux.fermer(ID); let b=false; try{ b=Panneaux.liste().some(p=>p.id==='holo-images'); Panneaux.fermer('holo-images'); }catch(e){} return a||b; }
  function majCases(){
    const m=document.getElementById('kMedias'), v=document.getElementById('kVideos'), r=reglages(); if(m) m.checked=r.medias; if(v){ v.checked=r.videos; v.disabled=!r.medias; }
    const info=document.getElementById('infoMedias'); if(!info) return;
    const p=profil(), nom={leger:'Léger',normal:'Normal',complet:'Complet'}[p.mode]||p.mode;
    info.textContent=!r.medias?'Les images et les vidéos sont désactivées.'
      :p.auto?'Mode actuel de l’accueil : '+nom+' → jusqu’à '+p.images+' image'+(p.images>1?'s':'')+(p.videos?' et '+p.videos+' vidéo'+(p.videos>1?'s':''):'')+' sous une réponse de recherche ou d’actualité.'
      :'Mode actuel de l’accueil : '+nom+' → aucun média automatique (une image seulement quand tu la demandes). Pour en voir sous les réponses, choisis « Automatique », « Complet » ou « Normal » dans « Mode de l’entité » plus haut.';
  }
  function changerReglage(cle,actif){ ecrire(cle,actif?'1':'0'); majCases(); if(!reglages().medias) fermerTout(); else if(!reglages().videos&&courant&&courant.videos.length) Panneaux.fermer(ID); try{ RayleBus.emit('medias:reglages',reglages()); }catch(e){} }
  RayleBus.on('vue:changee',majCases);
  const sujetsAffiches=()=>{ try{ return window.ActusAccueil&&ActusAccueil.sujetsAffiches?ActusAccueil.sujetsAffiches():[]; }catch(e){ return []; } };
  /* c = phrase simplifiée (coupure.js) ; renvoie true si elle concerne les médias (la réponse est dite ici) */
  function voix(c,original){
    const a=MC.commande(original||c); if(!a) return false;   // le texte d'origine garde les majuscules et les accents du sujet
    (async()=>{
      switch(a.type){
        case 'enlever': return fermerTout()?MC.phrases.enleve:MC.phrases.rien;
        case 'desactiver': changerReglage(a.quoi==='videos'?MC.CLE_VIDEOS:MC.CLE_MEDIAS,false); return a.quoi==='videos'?MC.phrases.videosOff:MC.phrases.desactive;
        case 'activer': changerReglage(a.quoi==='videos'?MC.CLE_VIDEOS:MC.CLE_MEDIAS,true); if(a.quoi==='videos'&&!reglages().medias){ ecrire(MC.CLE_MEDIAS,'1'); majCases(); } return a.quoi==='videos'?MC.phrases.videosOn:MC.phrases.active;
        case 'galerie_actu': { const l=sujetsAffiches(); if(!l.length) return MC.phrases.aucuneActu; const i=a.index===-1?l.length-1:(a.index?a.index-1:0); if(i<0||i>=l.length) return 'Je n’ai pas autant d’actualités affichées.'; return await galerieActu(l[i],a.quoi); }
        case 'video': return await videoDe(a.sujet);
      }
      return null;
    })().then(t=>{ if(t) dire(t); }).catch(e=>dire('Je n’ai pas pu le faire : '+messageErreur(e)+'.'));
    return true;
  }
  const m=document.getElementById('kMedias'), vi=document.getElementById('kVideos');
  if(m) m.addEventListener('change',()=>changerReglage(MC.CLE_MEDIAS,m.checked));
  if(vi) vi.addEventListener('change',()=>changerReglage(MC.CLE_VIDEOS,vi.checked));
  const gear=document.getElementById('gear'); if(gear) gear.addEventListener('click',majCases);
  majCases();

  window.MediasHolo={lancer,montrer,voix,galerieActu,videoDe,fermer:fermerTout,reglages,profil,
    etat:()=>({ouvert:!!courant,images:courant?courant.images.length:0,videos:courant?courant.videos.length:0,replie:!!(courant&&courant.replie),titre:courant?courant.titre:'',
      iframes:document.querySelectorAll('.pn[data-id="'+ID+'"] iframe, .pn[data-id="'+ID+'"] video').length,lightbox:!!lb,attente:!!attente})};
})();
