"use strict";
/* ═════════════ RÉGLAGES D'APPARENCE : thème, fond animé, niveau d'animation ═════════════
   - Bouton discret ◐ en haut à droite de la scène (petit panneau), et section « Apparence » dans ⚙ Réglages.
   - Sauvegarde dans localStorage (toujours dans des try/catch).
   - Niveau d'animation : Max / Auto / Éco. Palier effectif : 0 complet, 1 allégé, 2 éco (fond figé, sans halos animés).
     En Auto, on mesure les images/s : si ça rame, on baisse d'un palier (le fond et les halos d'abord ; l'entité a sa propre auto-qualité).
     « Réduire les animations » du système impose le palier 2.
   - Commandes vocales : « Raylé, passe en thème Aurore », « fond espace », « mode éco » (service du bus 'ui:commande', appelé par coupure.js).
   Bus : emit('ui:reglages',{theme,fond,anim,palier,micro}) à chaque changement ; RayleUI.reglages() pour lire l'état. */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  const THEMES=UI.THEMES||{};
  const FONDS={aucun:'Aucun',espace:'Espace',jarvis:'Jarvis',video:'Ville réelle'};
  const ENTITES={sphere:'Sphère',neurones:'Neurones'};
  const ANIMS={max:'Max',auto:'Auto',eco:'Éco',ultra:'Ultra'};      // Ultra : choix manuel seulement, jamais automatique
  const CLE={theme:'rayle_ui_theme',fond:'rayle_ui_fond',anim:'rayle_ui_anim',micro:'rayle_ui_micro',entite:'rayle_ui_entite',taille:'rayle_ui_taille',contraste:'rayle_ui_contraste'};
  const lire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const ecrire=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
  const DOM=typeof document!=='undefined';

  const mobile=(function(){
    try{ if(typeof IS_MOBILE!=='undefined') return !!IS_MOBILE; }catch(e){}
    try{ return matchMedia('(pointer:coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent); }catch(e){ return false; }
  })();
  const reduit=()=>{ try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } };

  const R={
    theme:THEMES[lire(CLE.theme)] ? lire(CLE.theme) : 'originel',
    fond:(f=>FONDS[f] ? f : f==='globe' ? 'espace' : (f==='ville'||f==='ville3d') ? 'jarvis' : (mobile?'aucun':'jarvis'))(lire(CLE.fond)),   // l'ancien « Globe » devient l'Espace ; l'ancienne « ville » devient la Ville 3D
    anim:ANIMS[lire(CLE.anim)] ? lire(CLE.anim) : 'auto',
    entite:ENTITES[lire(CLE.entite)] ? lire(CLE.entite) : 'sphere',
    micro:lire(CLE.micro)==null ? !mobile : lire(CLE.micro)==='1',
    taille:(v=>isFinite(v)&&v>=70&&v<=150 ? v : 100)(parseInt(lire(CLE.taille),10)),   // taille de l'entité, en %
    contraste:(v=>isFinite(v)&&v>=0&&v<=100 ? v : 60)(parseInt(lire(CLE.contraste),10))   // contraste de l'entité sur un fond, en %
  };
  /* ───── Sonde de l'appareil : WebGL (version, taille de texture maximale), mémoire annoncée, cœurs, densité de pixels. Elle ne sert qu'à choisir le palier de DÉPART en Auto :
     pas de WebGL → éco (image fixe) ; WebGL 1, texture max < 4096, ≤ 2 Go, mobile ou ≤ 4 cœurs → allégé ; sinon complet. La mesure des images/s prend ensuite le relais. ───── */
  function sonde(){
    const c={webgl:0,texMax:0,memoire:null,coeurs:null,dpr:1,mobile};
    try{
      c.memoire=navigator.deviceMemory||null; c.coeurs=navigator.hardwareConcurrency||null; c.dpr=window.devicePixelRatio||1;
      const cv=document.createElement('canvas'); let gl=cv.getContext('webgl2'); c.webgl=gl?2:0;
      if(!gl){ gl=cv.getContext('webgl')||cv.getContext('experimental-webgl'); c.webgl=gl?1:0; }
      if(gl){ c.texMax=gl.getParameter(gl.MAX_TEXTURE_SIZE)||0; const e=gl.getExtension('WEBGL_lose_context'); if(e) e.loseContext(); }
    }catch(e){}
    return c;
  }
  const APPAREIL=(typeof document!=='undefined')?sonde():{webgl:2,texMax:8192,memoire:null,coeurs:null,dpr:1,mobile};
  function palierDepart(){
    const c=APPAREIL;
    if(!c.webgl) return 2;
    return (mobile || c.webgl<2 || (c.texMax&&c.texMax<4096) || (c.memoire&&c.memoire<=2) || (c.coeurs||4)<=4) ? 1 : 0;
  }
  let palierAuto=palierDepart();
  let ecoForce=false;            // mini-vue (#mini) : Éco imposé et fond coupé, sans toucher aux réglages enregistrés
  const palier=()=>(reduit()||ecoForce) ? 2 : (R.anim==='max'||R.anim==='ultra') ? 0 : R.anim==='eco' ? 2 : palierAuto;
  const NOM_PALIER=['complet','allégé','éco'];

  let premier=true;
  function appliquer(){
    if(!DOM) return;
    const p=palier(), h=document.documentElement;
    try{ UI.appliquerTheme && UI.appliquerTheme(R.theme,premier); }catch(e){}
    premier=false;
    h.style.setProperty('--ui-k',String(R.taille/100));
    // un fond est actif : l'entité ressort (disque sombre, plus de lumière, texte d'état lisible)
    const avecFond=R.fond!=='aucun' && !ecoForce;
    h.classList.toggle('ui-fond-actif',avecFond);
    h.classList.toggle('ui-fond-espace',avecFond && R.fond==='espace');
    h.style.setProperty('--ui-contraste',String(R.contraste/100));
    try{ Entite.accent && Entite.accent(avecFond ? R.contraste/100 : 0); }catch(e){}
    h.classList.toggle('ui-p0',p===0); h.classList.toggle('ui-p1',p===1); h.classList.toggle('ui-eco',p===2);
    try{ RayleBus.emit('ui:reglages',UI.reglages()); }catch(e){}
    majControles();
  }
  // changer(k, v, {auto:true}) : réglage fait par l'ambiance (thème automatique) ; il n'est ni enregistré ni compté comme un choix de l'utilisateur.
  // Tout autre changement de thème est un choix manuel : horodaté, l'ambiance le respecte pendant N heures (Réglages → Ambiance).
  /** Ultra : avertissement honnête selon l'appareil (jamais bloquant : c'est un choix de l'utilisateur) */
  function avertirUltra(){
    const c=APPAREIL, limites=[]; if(mobile) limites.push('appareil mobile'); if(c.texMax&&c.texMax<8192) limites.push('textures limitées à '+c.texMax+' px (la Terre restera en 4k)'); if(c.memoire&&c.memoire<4) limites.push(c.memoire+' Go de mémoire'); if(c.coeurs&&c.coeurs<=4) limites.push(c.coeurs+' cœurs');
    try{ addLine('sys','⚠ Qualité Ultra : très gourmande (batterie, chaleur, mémoire graphique)'+(limites.length?' — cet appareil semble limité : '+limites.join(', '):'')+'. Si l’écran rame, je repasse toute seule au palier Max.'); }catch(e){}
  }
  function changer(k,v,opt){
    if(k==='theme' && opt && opt.auto){ if(R.theme!==v){ R.theme=v; appliquer(); } return; }
    if(k==='theme'){ ecrire(CLE.theme,v); ecrire('rayle_ui_theme_manuel',String(Date.now())); }   // même si c'est déjà le thème affiché : c'est bien un choix
    if(R[k]===v) return;
    R[k]=v; if(k!=='theme') ecrire(CLE[k],typeof v==='boolean'?(v?'1':'0'):v);
    if(k==='anim'){
      // L'entité suit le niveau choisi (Éco : 800 points en WebGL, plus léger que le canvas 2D)
      try{ Entite.qualite((v==='max'||v==='ultra')?0:v==='eco'?2:'auto'); }catch(e){}
      if(v==='ultra') avertirUltra();
      palierAuto=palierDepart(); mauvais=0;
    }
    appliquer();
  }
  UI.reglages=()=>({appareil:Object.assign({},APPAREIL),theme:R.theme,fond:ecoForce?'aucun':R.fond,anim:R.anim,ultra:R.anim==='ultra'&&!ecoForce&&!reduit(),palier:palier(),micro:R.micro,mobile,entite:R.entite,taille:R.taille,contraste:R.contraste,ecoForce});
  UI.changer=changer;
  UI.themeManuelDepuis=()=>Number(lire('rayle_ui_theme_manuel'))||0;
  UI.forcerEco=oui=>{ oui=!!oui; if(oui===ecoForce) return; ecoForce=oui; appliquer(); };

  /* ───── Mesure des images/s (Auto) : seulement quand la scène de Raylé est visible ───── */
  let ema=16.7, n=0, tPrec=0, dernier=0, mauvais=0, fpsVu=60;
  function mesurer(now){
    requestAnimationFrame(mesurer);
    const visible=!document.hidden && !['terminal','anatomie'].includes(RayleBus.demander('vue')) && !document.getElementById('cfg').classList.contains('open');
    if(!visible){ tPrec=0; return; }
    if(tPrec){ const dt=Math.min(250,now-tPrec); ema+=(dt-ema)*.05; n++; }
    tPrec=now;
    if(n<90 || now-dernier<3000) return;
    dernier=now; n=0; fpsVu=Math.round(1000/ema);
    if(R.anim!=='auto' || palierAuto>=2 || reduit()){ mauvais=0; return; }
    if(ema>38){                         // sous ~26 images/s deux fois de suite : on allège
      if(++mauvais>=2){ mauvais=0; palierAuto++; ema=16.7; appliquer(); }
    }else mauvais=0;
  }

  /* ───── Contrôles (bouton ◐ et section des Réglages : deux copies synchronisées) ───── */
  const boites=[];
  function construire(){
    const b=document.createElement('div'); b.className='ui-reglages';
    const themes=Object.keys(THEMES).map(id=>{
      const c=THEMES[id].c;
      return '<button type="button" class="ui-theme" data-theme-id="'+id+'" aria-pressed="false" style="--s1:'+c[0]+';--s2:'+c[1]+';--s3:'+c[2]+'"><i></i><span>'+THEMES[id].nom+'</span></button>';
    }).join('');
    const seg=(k,obj)=>'<div class="ui-seg" role="group" data-k="'+k+'">'+Object.keys(obj).map(v=>'<button type="button" data-v="'+v+'" aria-pressed="false">'+obj[v]+'</button>').join('')+'</div>';
    b.innerHTML='<div class="ui-lbl">Entité</div>'+seg('entite',ENTITES)
      +'<div class="ui-lbl">Thème</div><div class="ui-themes">'+themes+'</div>'
      +'<div class="ui-lbl">Taille de l\'entité : <b class="ui-taille-val"></b></div><input type="range" class="ui-range" min="70" max="150" step="5" data-k="taille" aria-label="Taille de l\'entité">'
      +'<div class="ui-lbl">Contraste de l\'entité (sur un fond) : <b class="ui-contraste-val"></b></div><input type="range" class="ui-range" min="0" max="100" step="5" data-k="contraste" aria-label="Contraste de l\'entité">'
      +'<div class="ui-lbl">Fond animé</div>'+seg('fond',FONDS)
      +'<div class="ui-lbl">Niveau d\'animation</div>'+seg('anim',ANIMS)
      +(mobile?'':'<label class="ui-chk"><input type="checkbox" data-k="micro"> Anneaux qui suivent le volume du micro pendant l\'écoute</label>')
      +'<div class="ui-info"></div>';
    b.addEventListener('click',e=>{
      const t=e.target.closest('button'); if(!t) return;
      if(t.dataset.themeId) changer('theme',t.dataset.themeId);
      else if(t.dataset.v){ const k=t.parentNode.dataset.k; changer(k,t.dataset.v); }
    });
    const contraste=b.querySelector('input[data-k="contraste"]');
    contraste.addEventListener('input',()=>changer('contraste',parseInt(contraste.value,10)||0));
    const taille=b.querySelector('input[data-k="taille"]');
    taille.addEventListener('input',()=>changer('taille',parseInt(taille.value,10)||100));
    const chk=b.querySelector('input[data-k="micro"]');
    if(chk) chk.addEventListener('change',()=>changer('micro',chk.checked));
    boites.push(b);
    return b;
  }
  function majControles(){
    const p=palier();
    boites.forEach(b=>{
      b.querySelectorAll('.ui-theme').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.themeId===R.theme)));
      b.querySelectorAll('.ui-seg').forEach(s=>s.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.v===R[s.dataset.k]))));
      const chk=b.querySelector('input[data-k="micro"]'); if(chk) chk.checked=R.micro;
      const tl=b.querySelector('input[data-k="taille"]'); if(+tl.value!==R.taille) tl.value=String(R.taille);
      b.querySelector('.ui-taille-val').textContent=R.taille+' %';
      const ct=b.querySelector('input[data-k="contraste"]'); if(+ct.value!==R.contraste) ct.value=String(R.contraste);
      b.querySelector('.ui-contraste-val').textContent=R.contraste+' %';
      b.querySelector('.ui-info').textContent='Rendu actuel : '+NOM_PALIER[p]+(R.anim==='auto'?' (choisi automatiquement)':'')+(R.anim==='ultra'?' · Ultra : textures 8k, bloom HDR, atmosphère haute qualité, anticrénelage (très gourmand : retour automatique au palier Max si l’écran rame)':'')
        +(reduit()?' · « réduire les animations » est activé sur cet appareil':'')+' · environ '+fpsVu+' images/s · appareil : '+(APPAREIL.webgl?'WebGL'+APPAREIL.webgl+(APPAREIL.texMax?', textures '+APPAREIL.texMax+' px':''):'sans WebGL')+(APPAREIL.memoire?', '+APPAREIL.memoire+' Go':'')+(APPAREIL.coeurs?', '+APPAREIL.coeurs+' cœurs':'')+', écran ×'+(Math.round(APPAREIL.dpr*10)/10)+'.';
    });
  }

  /* ───── place libre pour l'entité : jamais sous le titre (bande du haut) ni sous les boutons du bas ─────
     La scène se place entre le titre et la barre ; l'entité y est centrée avec son état et ses sous-titres.
     On réserve la bande du titre (et autant en bas, puisque c'est centré) : --ui-max = taille maximale de l'entité. */
  function majPlace(){
    const sc=document.getElementById('scene'), st=document.getElementById('state'), so=document.getElementById('soustitre');
    if(!sc) return;
    const haut=el=>{ if(!el || !el.offsetParent) return 0; const c=getComputedStyle(el); return el.offsetHeight+(parseFloat(c.marginTop)||0)+(parseFloat(c.marginBottom)||0); };
    const titre=document.querySelector('.titre');
    const bande=Math.max(titre&&titre.offsetParent?titre.offsetHeight:0,44)+6;
    const libre=Math.min(sc.clientWidth,sc.clientHeight-2*bande-haut(st)-haut(so));
    document.documentElement.style.setProperty('--ui-max',Math.max(90,Math.floor(libre))+'px');
  }

  function monterInterface(){
    majPlace();
    window.addEventListener('resize',majPlace);
    if('ResizeObserver' in window){ const ro=new ResizeObserver(majPlace); ['scene','state','soustitre'].forEach(id=>{ const el=document.getElementById(id); if(el) ro.observe(el); }); }
    // Section « Apparence » en tête des Réglages
    const cfg=document.getElementById('cfg'), top=cfg&&cfg.querySelector('.cfg-top');
    if(top){
      const h=document.createElement('h3'); h.textContent='Apparence';
      top.after(h); h.after(construire());
    }
    // Bouton discret et petit panneau
    const scene=document.getElementById('scene');
    const bouton=document.createElement('button');
    bouton.type='button'; bouton.id='uiBouton'; bouton.className='ui-bouton'; bouton.title='Apparence : thème, fond, animations';
    bouton.setAttribute('aria-label','Apparence'); bouton.setAttribute('aria-expanded','false'); bouton.textContent='◐';
    const pop=document.createElement('div'); pop.id='uiPop'; pop.className='ui-pop hud-cadre'; pop.hidden=true;
    pop.setAttribute('role','dialog'); pop.setAttribute('aria-label','Apparence');
    pop.innerHTML='<header class="pn-tete"><span class="pn-ico">◐</span><h2>Apparence</h2><button type="button" class="pn-x" aria-label="Fermer">✕</button></header>';
    const corps=document.createElement('div'); corps.className='ui-pop-corps'; corps.appendChild(construire()); pop.appendChild(corps);
    scene.appendChild(bouton); document.body.appendChild(pop);
    const ouvrirPop=oui=>{
      pop.hidden=!oui; bouton.setAttribute('aria-expanded',String(oui));
      if(oui){ majControles(); pop.classList.remove('hud-in'); void pop.offsetWidth; pop.classList.add('hud-in'); }
    };
    bouton.addEventListener('click',e=>{ e.stopPropagation(); ouvrirPop(pop.hidden); });
    pop.querySelector('.pn-x').addEventListener('click',()=>ouvrirPop(false));
    document.addEventListener('pointerdown',e=>{ if(!pop.hidden && !pop.contains(e.target) && e.target!==bouton) ouvrirPop(false); });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape' && !pop.hidden) ouvrirPop(false); });
    document.getElementById('gear').addEventListener('click',majControles);
    try{ matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',appliquer); }catch(e){}
  }

  /* ───── Commandes vocales (texte déjà normalisé : minuscules, sans accents ni ponctuation, sans « Raylé ») ───── */
  const QUESTION=/\b(?:pourquoi|comment|quel|quelle|quels|quelles|combien|c est quoi|qu est ce|est ce que)\b/;
  const VERBES='(?:passe|passer|repasse|mets|met|mettre|remets|change|changer|bascule|basculer|active|activer|applique|appliquer|prends|choisis|affiche|afficher|je veux|on passe)';
  const NOMS_SEULS=/^(?:aurore|nebuleuse|(?:arcs?|ark) (?:reactor|reacteur)|ambre solaire|(?:mark|marc) rouge)$/;
  const FOND_RE=new RegExp('^(?:('+VERBES.slice(3,-1)+'|enleve|enlever|retire|retirer|coupe|couper|desactive|desactiver|supprime|eteins|pas de|sans)(?: moi)? )?(?:(?:le|un|du|de|mon|ton) )?(?:fond|arriere plan|decor)(?: d ecran| anime| animee)?((?: (?:en|sur|a|au|avec|de|du|la|le|l|une))*)(?: (jarvis|holographique|hologramme|hud|ville reelle|vraie ville|ville video|video|ville en 3d|ville 3d|ville|cite|city|espace|cosmos|univers|galaxie|systeme solaire|globe|terre|planete|monde|aucun|rien|noir|vide|neutre|sobre))?$');
  const ENTITE_RE=new RegExp('^(?:'+VERBES+' )?(?:(?:l|une|mon|ton|la|en) )?(?:entite|avatar)(?: (?:en|sur|a|au|de))? (neurones?|neuronale?s?|reseau de neurones|cerveau|sphere|particules|normale|classique|actuelle|originale?)$');
  const ENTITE_COURT=new RegExp('^'+VERBES+' (?:en |sur )?(?:mode )?(neurones|reseau de neurones|sphere)$');
  const ANIM_RE=new RegExp('^(?:'+VERBES+'(?: moi)? )?(?:(?:en|le|la|au|les) )?(?:mode|animations?|niveau d animation|qualite|graphismes?)(?: (?:en|au|a|sur))? (ultra|eco|economie|economique|economie d energie|leger|legere|max|maximum|maximal|maximale|auto|automatique|normal|normale)$');

  const JARVIS_RE=new RegExp('^(?:'+VERBES+'(?: moi)? (?:(?:en|sur|le|un|au|a) )*)?(?:mode|fond|decor) (?:(?:en|de|d) )?(?:jarvis|holographique|hologramme|holographiques|hud holographique)(?: stp| svp| s il te plait)?$');
  const JARVIS_RE2=new RegExp('^'+VERBES+'(?: moi)? (?:(?:en|sur|le|un|au|a) )*(?:jarvis|holographique|hologramme)$');
  function analyser(c){
    const t=String(c||'').replace(/['’]/g,' ').replace(/-/g,' ').replace(/\s+/g,' ').trim();
    if(!t || t.split(' ').length>9 || QUESTION.test(t)) return null;
    if(/\b(?:graphique|graphe|chart|bougies?|rsi|terminal|carte|courbe)\b/.test(t)) return null;   // réglages du terminal, pas de l'apparence
    if(/\b(?:theme|themes|couleurs?|palette|pack)\b/.test(t)){
      for(const id of Object.keys(THEMES)) if(THEMES[id].alias.test(t)) return {type:'theme',valeur:id};
      if(new RegExp('^(?:'+VERBES+' )?(?:de |le |les |d )?(?:theme|couleurs?|palette)(?: suivante?s?)?$|^autre (?:theme|couleur|palette)$').test(t)) return {type:'theme',valeur:'+'};
      return null;
    }
    const en=t.match(ENTITE_RE)||t.match(ENTITE_COURT);
    if(en) return {type:'entite',valeur:/neuron|cerveau/.test(en[1])?'neurones':'sphere'};
    const m=t.match(new RegExp('^(?:'+VERBES+' )?(?:en |sur |le |la |l )?(?:mode )?(.+)$'));
    if(m && NOMS_SEULS.test(m[1])){ for(const id of Object.keys(THEMES)) if(THEMES[id].alias.test(m[1])) return {type:'theme',valeur:id}; }
    if(JARVIS_RE.test(t)||JARVIS_RE2.test(t)) return {type:'fond',valeur:'jarvis'};   // « mode Jarvis », « passe en mode holographique »
    const f=t.match(FOND_RE);
    if(f){
      const v=f[3], negatif=/^(?:enleve|enlever|retire|retirer|coupe|couper|desactive|desactiver|supprime|eteins|pas de|sans)$/.test(f[1]||'');
      if(v) return {type:'fond',valeur:/jarvis|holo|hud/.test(v)?'jarvis':/reelle|vraie|video|ville|cite|city/.test(v)?'video':/espace|cosmos|univers|galaxie|systeme|globe|terre|planete|monde/.test(v)?'espace':'aucun'};
      if(negatif) return {type:'fond',valeur:'aucun'};
      return null;
    }
    const a=t.match(ANIM_RE);
    if(a) return {type:'anim',valeur:/^ultra/.test(a[1])?'ultra':/^(?:eco|econom|leger)/.test(a[1])?'eco':/^max/.test(a[1])?'max':'auto'};
    return null;
  }
  function executer(a){
    if(a.type==='theme'){
      let id=a.valeur;
      if(id==='+'){ const ids=Object.keys(THEMES); id=ids[(ids.indexOf(R.theme)+1)%ids.length]; }
      if(id===R.theme) return 'C\'est déjà le thème '+THEMES[id].nom+'.';
      changer('theme',id); return 'Thème '+THEMES[id].nom+' activé.';
    }
    if(a.type==='fond'){
      if(a.valeur===R.fond) return a.valeur==='aucun'?'Le fond est déjà désactivé.':'C\'est déjà le fond '+FONDS[a.valeur].toLowerCase()+'.';
      changer('fond',a.valeur);
      return a.valeur==='aucun'?'Fond animé désactivé.':'Fond '+FONDS[a.valeur].toLowerCase()+' activé.';
    }
    if(a.type==='entite'){
      if(a.valeur===R.entite) return 'C\'est déjà l\'entité '+ENTITES[a.valeur]+'.';
      changer('entite',a.valeur); return 'Entité '+ENTITES[a.valeur]+' activée.';
    }
    if(a.type==='anim'){
      changer('anim',a.valeur);
      return a.valeur==='ultra'?'Qualité Ultra : textures 8k, bloom et atmosphère haute qualité. C’est très gourmand : si l’écran rame, je repasse toute seule au palier Max.':a.valeur==='eco'?'Mode éco : animations allégées.':a.valeur==='max'?'Animations au maximum.':'Animations en automatique : je m\'allège toute seule si l\'écran rame.';
    }
    return null;
  }
  UI.analyserCommande=analyser;

  if(DOM){
    // l'ambiance (ui/ambiance.js : « ambiance pluie », « il neige », « plus de vent »…) passe d'abord, puis l'apparence
    try{ RayleBus.fournir('ui:commande',c=>{ const r=RayleBus.demander('ambiance:commande',c)||RayleBus.demander('espace:commande',c); if(r) return r; const a=analyser(c); return a ? executer(a) : null; }); }catch(e){}
    try{ monterInterface(); }catch(e){ console.warn('[ui] réglages',e); }
    appliquer();
    requestAnimationFrame(mesurer);
  }
})();
