"use strict";
/* ═════════════ IMAGES DE RÉPONSE : la fenêtre holographique « galerie » ═════════════
   Quand la question est visuelle (« qui est… », « à quoi ressemble… », « montre-moi… », « photo de… »), Raylé cherche des images LIBRES par le Worker
   (route /images : l'image principale de l'article Wikipédia, puis Wikimedia Commons, puis Openverse ; cache et limite de débit côté Worker),
   ouvre une fenêtre holographique avec 1 à 4 images (la première en grand) et dit une phrase qui nomme l'article d'où elles viennent.
   Sous chaque image, toujours visibles : titre, auteur, licence, lien vers la source. Rien n'est copié : miniatures affichées depuis leur source,
   chargées à la demande. Jamais d'image inventée ni générée : sans résultat, la fenêtre dit « aucune image libre trouvée » avec la raison ;
   source lente ou en panne : « indisponible » (la réponse de Raylé n'est jamais bloquée).
   Commandes de la fenêtre (voix, clic, clavier) : « agrandis l'image », « image suivante », « image précédente », « réduis l'image », « ferme l'image ».
   Léger : une seule image, sans animation lourde ; « réduire les animations » : simple fondu (voir jarvis.css). */
(function(){
  if(!window.Panneaux||!window.ImagesContenu) return;
  const IC=ImagesContenu, esc=Panneaux.esc, ID='holo-images';
  let courant=null;          // {res, images, etat, sujet, el} : la galerie ouverte
  let parallele=null;        // recherche lancée en même temps que la réponse de l'IA (question « qui est… »)
  let derniereIntro='';
  const reduit=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):null;
  const modeLeger=()=>document.body.dataset.hud==='leger';
  const workerOk=()=>{ try{ return !!workerReady(); }catch(e){ return false; } };
  const messageErreur=e=>{ try{ return errMsg(e); }catch(x){ return String((e&&e.message)||e); } };
  const lien=(url,texte,classe)=>'<a'+(classe?' class="'+classe+'"':'')+' href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(texte)+'</a>';

  /* ───── recherche (Worker) ───── */
  async function chercher(requete){
    if(!workerOk()) return {erreur:'Worker verrouillé ou non configuré'};
    try{ const res=await wjson('/images?q='+encodeURIComponent(requete)+'&n='+(modeLeger()?1:IC.MAX_IMAGES),9000); return {res}; }
    catch(e){ return {erreur:messageErreur(e)}; }
  }

  /* ───── fenêtre ───── */
  function legende(im){
    const lic=im.licence_url?lien(im.licence_url,im.licence):esc(im.licence);
    return '<b class="img-titre">'+esc(im.titre)+'</b><span class="img-aut">Auteur : '+esc(im.auteur)+'</span><span class="img-lic">Licence : '+lic+'</span>'
      +lien(im.source_url,'Source : '+IC.nomOrigine(im.origine==='wikipedia'?'commons':im.origine),'img-src');
  }
  function afficher(){
    if(!courant||!courant.el) return;
    const {images,etat,el}=courant, im=images[etat.index];
    const img=el.querySelector('.img-principale img'), cap=el.querySelector('.img-principale figcaption');
    if(img){ img.classList.remove('charge'); img.alt=im.titre; img.src=im.miniature; if(im.largeur&&im.hauteur){ img.width=im.largeur; img.height=im.hauteur; } }
    if(cap) cap.innerHTML=legende(im);
    el.querySelectorAll('.img-vignettes button').forEach((b,i)=>b.classList.toggle('actif',i===etat.index));
    const compteur=el.querySelector('.img-compteur'); if(compteur) compteur.textContent=(etat.index+1)+' / '+images.length;
    majLightbox();
  }
  function construire(el,res,images){
    const s=res.sujet;
    el.innerHTML='<div class="img-galerie"><figure class="img-principale"><button type="button" class="img-zoom" aria-label="Agrandir l\'image" title="Agrandir"><img loading="lazy" decoding="async" referrerpolicy="no-referrer" alt=""></button><figcaption></figcaption></figure>'
      +(images.length>1?'<div class="img-vignettes">'+images.map((im,i)=>'<button type="button" data-i="'+i+'" aria-label="Image '+(i+1)+'"><img loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="'+esc(im.titre)+'" src="'+esc(im.miniature)+'"></button>').join('')+'<span class="img-compteur"></span></div>':'')
      +'</div><div class="pn-sous img-article">Article : '+lien(s.url,'Wikipédia · '+s.titre)+(s.description?' — '+esc(s.description):'')+'</div>';
    const img=el.querySelector('.img-principale img');
    img.addEventListener('load',()=>img.classList.add('charge')); img.addEventListener('error',()=>{ img.classList.add('charge'); });
    el.querySelector('.img-zoom').addEventListener('click',()=>agir('agrandir'));
    el.querySelectorAll('.img-vignettes button').forEach(b=>b.addEventListener('click',()=>{ courant.etat.index=+b.dataset.i; afficher(); }));
  }
  function ouvrirPanneau(titre,corps,extra){
    Panneaux.ouvrir(Object.assign({id:ID,type:'holo-images',icone:'▣',titre,corps,duree:120000,onFermer:()=>{ fermerLightbox(); courant=null; }},extra||{}));
  }
  function ouvrirMessage(titre,texte,detail){
    courant=null;
    ouvrirPanneau(titre,{html:'<div class="img-vide"><b>'+esc(texte)+'</b>'+(detail?'<small class="pn-vide">'+esc(detail)+'</small>':'')+'</div>'},{duree:30000});
  }
  /* Ouvre la galerie avec la réponse du Worker. Retourne les images affichées (liste vide si aucune). */
  function ouvrirGalerie(res,sujetDemande){
    const images=IC.filtrerImages(res,modeLeger()?1:IC.MAX_IMAGES);
    if(!images.length||!res.sujet){ ouvrirMessage('Images · aucune image libre trouvée','aucune image libre trouvée',IC.messageSansImage(res,sujetDemande||(res&&res.q)||'')); return []; }
    courant={res,images,etat:IC.etatGalerie(images.length),sujet:res.sujet,el:null};
    ouvrirPanneau('Images · '+res.sujet.titre,(el)=>{ courant.el=el; construire(el,res,images); afficher(); return ()=>{ if(courant&&courant.el===el) courant.el=null; }; });
    return images;
  }

  /* ───── agrandissement (lightbox holographique) ───── */
  let lb=null;
  function fermerLightbox(){ if(lb){ lb.remove(); lb=null; } if(courant) courant.etat.agrandi=false; }
  function majLightbox(){
    if(!courant||!courant.etat.agrandi){ if(lb){ lb.remove(); lb=null; } return; }
    const {images,etat}=courant, im=images[etat.index];
    if(!lb){
      lb=document.createElement('div'); lb.id='imagesLightbox'; lb.className='img-lb'; lb.setAttribute('role','dialog'); lb.setAttribute('aria-label','Image agrandie');   // voile plein écran qui centre le cadre (l'animation du cadre n'interfère pas avec le centrage)
      lb.innerHTML='<div class="img-lb-cadre hud-cadre hud-in"><header class="pn-tete"><span class="pn-ico">▣</span><h2></h2><button type="button" class="pn-x" aria-label="Réduire">✕</button></header><div class="img-lb-corps"><button type="button" class="img-nav g" aria-label="Image précédente">‹</button><img referrerpolicy="no-referrer" decoding="async" alt=""><button type="button" class="img-nav d" aria-label="Image suivante">›</button></div><figcaption class="img-lb-leg"></figcaption><i class="pn-scan" aria-hidden="true"></i></div>';
      lb.querySelector('.pn-x').addEventListener('click',()=>agir('reduire'));
      lb.querySelector('.img-nav.g').addEventListener('click',()=>agir('precedente'));
      lb.querySelector('.img-nav.d').addEventListener('click',()=>agir('suivante'));
      lb.addEventListener('click',e=>{ if(e.target===lb) agir('reduire'); });
      document.body.appendChild(lb);
    }
    lb.querySelector('h2').textContent=im.titre+'  ·  '+(etat.index+1)+' / '+images.length;
    const g=lb.querySelector('img'); g.alt=im.titre; g.classList.remove('charge'); g.onload=()=>g.classList.add('charge'); g.src=im.grande||im.miniature;
    lb.querySelector('.img-lb-leg').innerHTML=legende(im)+'<span class="img-art">'+lien(courant.sujet.url,'Article Wikipédia : '+courant.sujet.titre)+'</span>';
    lb.querySelector('.img-nav.g').disabled=etat.index===0; lb.querySelector('.img-nav.d').disabled=etat.index===images.length-1;
  }

  /* ───── actions (voix, clic, clavier) ───── */
  function agir(action){
    if(!courant) return null;
    if(action==='fermer'){ Panneaux.fermer(ID); return 'Image fermée.'; }
    const r=IC.naviguer(courant.etat,action);
    courant.etat=r.etat; afficher(); return r.message;
  }
  /* Commande vocale ou clavier déjà normalisée (coupure.js) : renvoie la réponse de Raylé, ou null si ce n'est pas pour la fenêtre d'images */
  function commande(c){
    const a=IC.commandeFenetre(c); if(!a||!courant) return null;
    return agir(a)||null;
  }
  document.addEventListener('keydown',e=>{
    if(!courant||/^(?:INPUT|TEXTAREA|SELECT)$/.test((e.target&&e.target.tagName)||'')) return;
    if(e.key==='ArrowRight'){ agir('suivante'); e.preventDefault(); }
    else if(e.key==='ArrowLeft'){ agir('precedente'); e.preventDefault(); }
    else if(e.key==='Escape'&&lb){ agir('reduire'); e.stopImmediatePropagation(); }
  },true);

  /* ───── de la question à l'image ───── */
  /* Demande explicite (« montre-moi », « à quoi ressemble », « photo de ») : pas d'IA, une phrase d'introduction. Retourne la phrase, ou null si ce n'est pas une demande d'image. */
  async function demandeExplicite(texte){
    const d=IC.demande(texte); if(!d||d.type==='qui') return d&&d.refus?IC.messageRefus(d.refus):null;
    if(d.refus) return IC.messageRefus(d.refus);
    return await executer(d);
  }
  async function executer(d){
    try{ setState('thinking'); }catch(e){}
    ouvrirPanneau('Images · '+d.sujet,{html:'<div class="img-vide"><b class="img-attente">Recherche d\'images libres…</b><small class="pn-vide">Wikipédia, puis Wikimedia Commons et Openverse</small></div>'},{duree:30000});
    const r=await chercher(d.requete);
    if(r.erreur){ ouvrirMessage('Images · indisponible','indisponible',r.erreur); return IC.messageIndisponible(r.erreur); }
    const images=ouvrirGalerie(r.res,d.sujet);
    if(!images.length) return IC.messageSansImage(r.res,d.sujet);
    derniereIntro=IC.introduction(r.res,images); return derniereIntro;
  }
  /* Question « qui est… » : la recherche part en même temps que l'IA ; la phrase d'introduction s'ajoute à la réponse si les images arrivent à temps */
  function lancerParallele(texte){
    const d=IC.demande(texte); parallele=null;
    if(!d||d.type!=='qui'||d.refus||!workerOk()) return false;
    parallele={d,promesse:chercher(d.requete)}; return true;
  }
  async function finParallele(attenteMs){
    if(!parallele) return '';
    const {d,promesse}=parallele; parallele=null;
    const delai=new Promise(r=>setTimeout(()=>r(null),attenteMs||1500));
    const r=await Promise.race([promesse,delai]);
    if(!r){ promesse.then(x=>{ if(x.res&&IC.filtrerImages(x.res,1).length) ouvrirGalerie(x.res,d.sujet); }); return ''; }   // en retard : la fenêtre s'ouvre quand même, sans phrase
    if(r.erreur||!r.res) return '';   // source en panne : la réponse de Raylé n'est pas gênée (aucune fenêtre d'erreur pour une simple question « qui est »)
    const images=ouvrirGalerie(r.res,d.sujet);
    return images.length?(derniereIntro=IC.introduction(r.res,images)):'';
  }
  window.ImagesHolo={demandeExplicite,lancerParallele,finParallele,commande,agir,ouvrirGalerie,chercher,estIntro:t=>!!derniereIntro&&String(t).trim()===derniereIntro,
    etat:()=>({ouvert:!!courant,n:courant?courant.images.length:0,index:courant?courant.etat.index:-1,agrandi:!!(courant&&courant.etat.agrandi),titres:courant?courant.images.map(i=>i.titre):[],lightbox:!!lb,article:courant?courant.sujet.titre:''})};
})();
