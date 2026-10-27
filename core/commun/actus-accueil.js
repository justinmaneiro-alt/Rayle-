"use strict";
/* ═════════════ ACTUALITÉS SUR L'ACCUEIL JARVIS : fenêtres « À la une France », « Monde » et par rubrique ═════════════
   Chaque fenêtre est indépendante (son identifiant, son rafraîchissement) et DÉPLAÇABLE (glisser l'en-tête) ; elles passent par Panneaux, donc par toutes les
   animations de fenetres-anim.js. Données : /actualites/fil du Worker (planetes/terre/pc/fil-actus.js + actus-sujets.js, chargés à la demande, partagés avec la Terre).
   Rien d'inventé : titre, média, date et nombre de médias viennent des flux ; Worker verrouillé, pas à jour ou source en panne → la raison est écrite dans la fenêtre.
   Mode (body[data-hud]) : complet 10 lignes, apparition échelonnée · normal 7 · léger 5, sans échelonnement ni barres animées · animations réduites : rien ne bouge.
   Voix : window.ActusAccueil.commande(texte) → phrase à dire, ou null (la phrase est pour l'agent). Contenu pur : actus-accueil-contenu.js (testé). */
(function(){
  if(!window.Panneaux||!window.ActusAccueilContenu||!window.RayleBus) return;
  const AC=ActusAccueilContenu, esc=Panneaux.esc, DUREE=20*60*1000;
  const racine=()=>document.getElementById('panneaux');
  const mode=()=>document.body.dataset.hud||'normal';
  const ouvertes=new Map();           // id → {portee, rubrique, essai}
  let affichees=[];                   // sujets de la dernière liste dessinée (médias de « cette actualité »)
  let modules=null, derniere='';
  const charger=()=>modules||(modules=Promise.all([
    import(new URL('planetes/terre/pc/fil-actus.js',document.baseURI).href),
    import(new URL('planetes/terre/pc/actus-sujets.js',document.baseURI).href)
  ]).then(([fil,suj])=>({fil,suj})).catch(e=>{ modules=null; throw e; }));
  const message=e=>{ try{ return errMsg(e); }catch(x){ return String((e&&e.message)||e); } };

  const ia=s=>!!(window.ImagesActus&&ImagesActus.actif()&&(ImagesActus.imageFlux(s)||s.lieu));   // une image est possible : flux du média, sinon photo libre ou carte du lieu
  function remplirZones(id){ const f=document.querySelector('#panneaux .pn[data-id="'+id+'"]'); if(!f||!window.ImagesActus) return; f.querySelectorAll('.ac-vig-vide[data-ia]').forEach(z=>{ const s=affichees[+z.dataset.ia]; if(s) ImagesActus.attacher(z,s,{largeur:74,hauteur:50}); }); }
  function htmlListe(m,portee,rub,S){
    const liste=AC.selection(m.sujets,rub,AC.lignes(mode()));
    const pastilles=AC.rubriquesPresentes(m.sujets,6);
    const chips='<div class="ac-chips" role="group" aria-label="Rubriques">'
      +'<button type="button" class="ac-chip" data-ac-portee="'+portee+'" data-ac-rub=""'+(!rub?' aria-current="true"':'')+'>À la une</button>'
      +pastilles.map(r=>'<button type="button" class="ac-chip" data-ac-portee="'+portee+'" data-ac-rub="'+r.id+'"'+(rub===r.id?' aria-current="true"':'')+'>'+esc(r.nom.split(' ')[0])+' <b>'+r.n+'</b></button>').join('')+'</div>';
    const maj='<div class="pn-sous ac-maj" data-ecrit="non">'+esc(S.libelleMaj(m.genere))+(m.perime?' · <span class="ac-panne">copie ancienne : les sources ne répondent pas pour le moment</span>':'')+'</div>';
    if(!liste.length) return chips+'<p class="pn-vide">Aucun sujet dans cette rubrique pour le moment.</p>'+maj;
    affichees=liste;                                       // « montre-moi les images de cette actualité » s'appuie sur la dernière liste affichée
    const vignettes=!!(window.MediasContenu&&MediasContenu.profil(mode(),MediasContenu.lireReglages(k=>localStorage.getItem(k))).vignettes);
    const lignes=liste.map((s,i)=>'<li class="ac-sujet'+(vignettes&&(s.image||ia(s))?' ac-avec-image':'')+'" data-ia-i="'+i+'" style="--d:'+(0.25+i*0.12).toFixed(2)+'s;--c:'+s.couleur+';--w:'+AC.barre(s.importance).toFixed(2)+'">'
      +(vignettes&&!s.image&&ia(s)?'<span class="ac-vignette ia-zone ac-vig-vide" data-ia="'+i+'"></span>':'')+(vignettes&&s.image?'<img class="ac-vignette" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="" title="Image fournie par le flux RSS de '+esc(s.source)+' (© '+esc(s.source)+')" src="'+esc(s.image)+'">':'')
      +'<a class="ac-titre" href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.titre)+'</a>'
      +'<div class="ac-meta"><span class="ac-cat">'+esc(s.catNom)+'</span><span>'+esc(s.source)+'</span><span>'+esc(s.quand)+'</span>'
      +'<span class="ac-imp" title="Nombre de médias qui reprennent ce sujet">'+esc(S.libelleImportance(s.importance))+'</span></div><i class="ac-barre" aria-hidden="true"></i></li>').join('');
    return chips+'<ol class="ac-liste">'+lignes+'</ol>'+maj;
  }
  const htmlAttente=()=>'<p class="pn-vide ac-attente" data-ecrit="non">Lecture du flux d’actualités…</p><i class="ac-balayage" aria-hidden="true"></i>';
  const htmlErreur=r=>'<div class="ac-erreur"><b>Actualités indisponibles</b><p>'+esc(r)+'</p></div>';

  function afficher(id,portee,rub,corpsHtml){
    Panneaux.ouvrir({id,type:'holo-actus',icone:'◈',titre:AC.titreFenetre(portee,rub),duree:DUREE,corps:{html:corpsHtml},
      pied:[{texte:'Actualiser',clic:()=>charger_et_afficher(portee,rub,true)}],onFermer:()=>{ ouvertes.delete(id); }});
    brancher(id); remplirZones(id);
  }
  /* ouvre (ou met à jour) la fenêtre et renvoie les sujets affichés, ou null avec la raison */
  async function charger_et_afficher(portee,rub,force){
    const id=AC.identifiant(portee,rub);
    ouvertes.set(id,{portee,rubrique:rub});
    afficher(id,portee,rub,htmlAttente());
    let res=null, raison='';
    try{
      const {fil,suj}=await charger();
      const brut=await fil.chargerFil(portee,'',{force:!!force});
      const m=suj.modelesFil(brut,{max:60});
      if(!ouvertes.has(id)) return {sujets:AC.selection(m.sujets,rub,3),m};          // fermée pendant la lecture : rien à redessiner
      afficher(id,portee,rub,htmlListe(m,portee,rub,suj));
      res={sujets:AC.selection(m.sujets,rub,AC.lignes(mode())),m};
    }catch(e){
      raison=message(e);
      if(ouvertes.has(id)) afficher(id,portee,rub,htmlErreur(raison));
    }
    return res?res:{sujets:[],erreur:raison};
  }

  /* ───── déplacer une fenêtre (souris ou tactile, écrans larges ; en colonne sur téléphone) ───── */
  let zMax=20;
  function brancher(id){
    const el=document.querySelector('#panneaux .pn[data-id="'+id+'"]'); if(!el||el.dataset.deplacable) return;
    el.dataset.deplacable='1';
    const tete=el.querySelector('.pn-tete'); if(!tete) return;
    tete.classList.add('ac-poignee'); tete.title='Glisser pour déplacer cette fenêtre';
    let depart=null;
    tete.addEventListener('pointerdown',e=>{
      if(e.button>0||e.target.closest('.pn-x')) return;
      el.style.zIndex=String(++zMax);
      if(window.matchMedia&&matchMedia('(max-width:820px)').matches) return;
      const r=el.getBoundingClientRect();
      depart={x:e.clientX,y:e.clientY,l:r.left,t:r.top,w:r.width,h:r.height,flotte:el.classList.contains('ac-flotte'),id:e.pointerId,bouge:false};
    });
    /* le suivi se fait sur le document : le déplacement dans le conteneur libre fait perdre la capture du pointeur à l'en-tête */
    const bouge=e=>{
      if(!depart||e.pointerId!==depart.id) return;
      const dx=e.clientX-depart.x, dy=e.clientY-depart.y;
      if(!depart.bouge){
        if(Math.hypot(dx,dy)<5) return;
        depart.bouge=true;
        if(!depart.flotte){                                   // sort de la colonne : devient une fenêtre libre à sa place actuelle
          const wrap=el.closest('.pn-wrap'); if(!wrap){ depart=null; return; }
          const w=wrap.getBoundingClientRect();
          el.classList.add('ac-flotte');
          el.style.left=(depart.l-w.left)+'px'; el.style.top=(depart.t-w.top)+'px'; el.style.width=depart.w+'px';
          wrap.appendChild(el); depart.flotte=true;
        }
      }
      const wrap=el.parentNode.getBoundingClientRect();
      el.style.left=Math.min(Math.max(depart.l+dx-wrap.left,-depart.w+90),wrap.width-90)+'px';
      el.style.top=Math.min(Math.max(depart.t+dy-wrap.top,0),wrap.height-40)+'px';
    };
    const fin=e=>{ if(depart&&e.pointerId===depart.id){ depart=null; document.removeEventListener('pointermove',bouge); document.removeEventListener('pointerup',fin); document.removeEventListener('pointercancel',fin); } };
    tete.addEventListener('pointerdown',e=>{ if(depart){ document.addEventListener('pointermove',bouge); document.addEventListener('pointerup',fin); document.addEventListener('pointercancel',fin); } });
    el.addEventListener('pointerdown',()=>{ el.style.zIndex=String(++zMax); },true);
  }
  /* pastilles de rubrique : ouvrent une AUTRE fenêtre, indépendante (délégation : un seul écouteur) */
  racine().addEventListener('click',e=>{
    const b=e.target.closest&&e.target.closest('[data-ac-rub]'); if(!b) return;
    charger_et_afficher(b.dataset.acPortee,b.dataset.acRub||null,false);
  });

  /* ───── voix ───── */
  const sansVue=()=>!document.body.classList.contains('vue-galaxie')&&!document.body.classList.contains('vue-terminal');
  async function commande(texte){
    if(!sansVue()){      // dans la galaxie ou le terminal : la Terre et l'agent gèrent les actualités… sauf les pays : « les actualités du Japon » s'ouvre sur la Terre, sans IA
      const surTerre=document.body.classList.contains('vue-galaxie')&&window.Terre&&Terre.etat&&Terre.etat().actif;
      const france=/\bfrance\b/i.test(String(texte).normalize('NFD').replace(/[\u0300-\u036f]/g,''));   // « l’actualité en France » : le fil France de la Terre (par sujets), présenté par l’agent, pas la fenêtre du pays
      return surTerre&&!france&&window.ActusPays?await ActusPays.commande(texte):null;
    }
    const c=AC.commande(texte);
    if(!c) return window.ActusPays?await ActusPays.commande(texte):null;    // « les actualités du Japon », « en Afrique », « mes pays favoris » : fenêtres par pays, sans IA
    if(c.action==='fermer'){
      const ids=Array.from(ouvertes.keys()); ids.forEach(i=>Panneaux.fermer(i));
      return derniere=ids.length?'Fenêtres d’actualités fermées.':'Aucune fenêtre d’actualités n’est ouverte.';
    }
    if(c.action==='actualiser'){
      const l=Array.from(ouvertes.entries()); if(!l.length) return derniere='Aucune fenêtre d’actualités n’est ouverte.';
      await Promise.all(l.map(([,o])=>charger_et_afficher(o.portee,o.rubrique,true)));
      return derniere='Actualités actualisées.';
    }
    const r=await charger_et_afficher(c.portee,c.rubrique,false);
    return derniere=r.erreur?'Je n’ai pas pu lire l’actualité : '+r.erreur:AC.phrase(c.portee,c.rubrique,r.sujets);
  }
  racine().addEventListener('error',e=>{
    const t=e.target;
    if(t&&t.classList&&t.classList.contains('ac-vignette')&&t.tagName==='IMG'){
      const li=t.closest('.ac-sujet'), s=li&&affichees[+li.dataset.iaI];
      t.remove();
      if(li&&s&&window.ImagesActus&&ImagesActus.actif()&&s.lieu){            // image du média introuvable : photo libre du lieu, sinon carte
        const z=document.createElement('span'); z.className='ac-vignette ia-zone ac-vig-vide'; li.appendChild(z);
        ImagesActus.attacher(z,{...s,image:null,sources:[]},{largeur:74,hauteur:50});
      } else if(li) li.classList.remove('ac-avec-image');
    }
  },true);   // image du média introuvable : la ligne reste complète, sans trou
  RayleBus.on('medias:reglages',()=>{ Array.from(ouvertes.values()).forEach(o=>charger_et_afficher(o.portee,o.rubrique,false)); });   // réglage ⚙ ou voix : les vignettes apparaissent ou disparaissent aussitôt
  window.ActusAccueil={sujetsAffiches:()=>affichees.slice(),deplacable:brancher,commande,ouvrir:(portee='france',rub=null)=>charger_et_afficher(portee,rub,false),fermer:()=>Array.from(ouvertes.keys()).forEach(i=>Panneaux.fermer(i)),
    ouvertes:()=>Array.from(ouvertes.keys()),estReponse:t=>!!derniere&&String(t).trim()===derniere};
})();
