"use strict";
  /* ═════════════ RACCOURCIS D'APPLI ET MINI-VUE (phase 3A) ═════════════
     • Appui long sur l'icône (manifest.webmanifest) : « Parler à Raylé » (#parler), « Terminal » (#terminal, géré par js/commun/vues.js),
       « Briefing » (#briefing), « Monde » (#monde). Ils arrivent ici au démarrage, ou par « hashchange » quand l'appli est déjà
       ouverte (Android réutilise alors la fenêtre sans recharger).
     • Mini-vue (#mini) : l'entité en petit, la prochaine annonce économique, US100 et l'or, un bouton micro.
       Pensée pour l'écran partagé et la fenêtre flottante d'Android : elle s'ouvre toute seule quand la fenêtre devient petite,
       ou à la voix (« mini vue », « vue complète »), ou par ⚙ Réglages. Éco imposé (sans fond animé), une requête par minute (/mini),
       rien quand elle est cachée. Lisible en très petit (tailles en vmin). */
  const raccNettoyer=()=>{ try{ history.replaceState(null,'',location.pathname+location.search); }catch(e){} };
  async function raccExecuter(h){
    if(h==='parler'){
      raccNettoyer();
      try{
        if(modeToucher()) ouvrirEcoute();
        else{ greeted=true; if(!micOn) startListening(); enterConversation(); ack(); }
      }catch(e){}
      // sans geste sur la page, Chrome peut refuser le micro : le bouton palpite pour inviter à le toucher (8 s, ou jusqu'au premier toucher)
      document.body.classList.add('racc-invite');
      const fin=()=>document.body.classList.remove('racc-invite');
      setTimeout(fin,8000); document.addEventListener('pointerdown',fin,{once:true,passive:true});
    }else if(h==='briefing'){
      raccNettoyer();
      setTimeout(()=>onUser('Raylé, fais-moi le briefing du jour',false),1500);
    }else if(h==='monde'){
      raccNettoyer();
      try{ await ouvrirPageMonde(); }catch(e){ addLine('sys','Monde : '+errMsg(e)); }
    }else if(h==='mini') miniEntrer(false);
  }

  /* ───── Mini-vue ───── */
  let miniActif=false, miniAuto=false, miniRefus=0, miniDonnees=null, miniT=null, miniT2=null, miniEl=null;
  function miniConstruire(){
    if(miniEl) return;
    miniEl=document.createElement('div'); miniEl.id='miniVue'; miniEl.className='mv'; miniEl.hidden=true;
    miniEl.innerHTML='<div class="mv-annonce" id="mvAnnonce"><small>Prochaine annonce</small><b>…</b><span></span></div>'
      +'<div class="mv-prix"><div class="mv-actif" id="mvNDX"><small>US100</small><b>—</b><i></i></div><div class="mv-actif" id="mvXAU"><small>OR</small><b>—</b><i></i></div></div>'
      +'<div class="mv-bas"><button type="button" class="mv-micro" id="mvMicro" aria-label="Parler à Raylé">🎤</button>'
      +'<button type="button" class="mv-sortir" id="mvSortir" aria-label="Revenir à la vue complète" title="Vue complète">⤢</button></div>';
    document.body.appendChild(miniEl);
    $('mvMicro').addEventListener('click',()=>{ try{ actionBouton(); }catch(e){} });
    $('mvSortir').addEventListener('click',()=>{ miniRefus=window.innerWidth*window.innerHeight; miniSortir(); });
    // le bouton micro suit l'état du grand bouton (écoute, veille, réflexion)
    try{ new MutationObserver(()=>{ $('mvMicro').className='mv-micro '+btn.className.replace(/\bmic\b/,'').trim(); }).observe(btn,{attributes:true,attributeFilter:['class']}); }catch(e){}
  }
  function miniEntrer(auto){
    miniConstruire();
    if(location.hash!=='#mini'){ try{ history.replaceState(null,'',location.pathname+location.search+'#mini'); }catch(e){} }
    if(miniActif) return;
    miniActif=true; miniAuto=!!auto;
    if(RayleBus.demander('vue')==='terminal') RayleBus.demander('vue:fermer');
    document.body.classList.add('vue-mini'); miniEl.hidden=false;
    try{ RayleUI.forcerEco(true); }catch(e){}
    addLine('sys','Mini-vue'+(auto?' (petite fenêtre)':'')+' : Éco, sans fond animé.');
    miniCharger(); miniAfficher();
    clearInterval(miniT); miniT=setInterval(miniCharger,60000);
    clearInterval(miniT2); miniT2=setInterval(miniAfficher,30000);
  }
  function miniSortir(){
    if(location.hash==='#mini') raccNettoyer();
    if(!miniActif) return;
    miniActif=false; miniAuto=false;
    clearInterval(miniT); clearInterval(miniT2);
    document.body.classList.remove('vue-mini'); if(miniEl) miniEl.hidden=true;
    try{ RayleUI.forcerEco(false); }catch(e){}
  }
  // Fenêtre flottante ou écran partagé : la fenêtre est nettement plus petite que l'écran
  function miniPetite(){
    const a=window.innerWidth*window.innerHeight, ecran=(screen.width||window.innerWidth)*(screen.height||window.innerHeight);
    return a<170000 && a<ecran*0.6;
  }
  let miniRedim=null;
  window.addEventListener('resize',()=>{
    clearTimeout(miniRedim);
    miniRedim=setTimeout(()=>{
      const a=window.innerWidth*window.innerHeight;
      if(miniRefus && Math.abs(a-miniRefus)/miniRefus<0.25) return;   // on l'a quittée à la main à cette taille : on ne force pas
      miniRefus=0;
      if(!miniActif && miniPetite()) miniEntrer(true);
      else if(miniActif && miniAuto && !miniPetite()) miniSortir();
    },400);
  });
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden && miniActif) miniCharger(); });

  function miniProchaineAnnonce(ev){
    const now=Date.now();
    const l=(ev||[]).map(e=>({t:Date.parse(e.date),devise:String(e.country||'').toUpperCase(),titre:String(e.title||''),fort:/high/i.test(e.impact||''),moyen:/medium/i.test(e.impact||'')}))
      .filter(e=>isFinite(e.t)&&e.t>now&&['USD','EUR','GBP','JPY'].includes(e.devise)&&(e.fort||e.moyen)).sort((a,b)=>a.t-b.t);
    return l.find(e=>e.fort)||l[0]||null;
  }
  async function miniCharger(){
    if(!miniActif || document.hidden || !workerReady()) return;
    try{ miniDonnees=await wjson('/mini',15000); }catch(e){ /* Worker ancien ou injoignable : on garde les dernières valeurs */ }
    if(!miniDonnees || !miniDonnees.annonce){
      try{ const a=miniProchaineAnnonce(await fetchCalendar(false)); if(a) miniDonnees=Object.assign({},miniDonnees||{},{annonce:a}); }catch(e){}
    }
    miniAfficher();
  }
  function miniDans(t){
    const m=Math.round((t-Date.now())/60000);
    if(m<1) return 'maintenant';
    if(m<60) return 'dans '+m+' min';
    if(m<24*60) return 'dans '+Math.floor(m/60)+' h '+String(m%60).padStart(2,'0');
    return new Date(t).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',weekday:'short'})+' '+new Date(t).toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'}).replace(':','h');
  }
  function miniAfficher(){
    if(!miniEl) return;
    const d=miniDonnees||{};
    const a=d.annonce, ea=$('mvAnnonce');
    ea.classList.toggle('fort',!!(a&&a.fort));
    ea.querySelector('b').textContent=a ? a.devise+' · '+a.titre : (workerReady()?'—':'Worker non configuré');
    ea.querySelector('span').textContent=a ? miniDans(a.t) : '';
    [['NDX',0],['XAU',1]].forEach(([c,dec])=>{
      const x=d[c], el=$('mv'+c);
      el.querySelector('b').textContent=x&&x.prix!=null ? Number(x.prix).toLocaleString('fr-FR',{minimumFractionDigits:dec,maximumFractionDigits:dec}) : '—';
      const v=x&&x.var24, i=el.querySelector('i');
      i.textContent=v!=null ? (v>0?'▲ +':v<0?'▼ ':'= ')+Number(v).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' %' : '';
      i.className=v>0?'hausse':v<0?'baisse':'';
    });
  }
  // « mini vue », « mode compact » / « vue complète », « quitte la mini vue » (appelé par command(), js/rayle/coupure.js)
  RayleBus.fournir('mini:commande',c=>{
    const t=String(c||'').replace(/['’\-]/g,' ').replace(/\s+/g,' ').trim();
    if(/^(?:(?:passe|mets|met|ouvre|affiche|active|bascule)(?: toi| moi)?(?: en| la| le| sur)* )?(?:mini vue|mini rayle|mode mini|vue mini|vue compacte|mode compact|petite vue|minivue)$/.test(t)){ miniEntrer(false); return 'Mini-vue.'; }
    if(/^(?:(?:quitte|ferme|sors de|desactive)(?: la| le)? (?:mini vue|mode mini|vue compacte|mode compact|minivue)|(?:reviens|retour|passe|remets)(?: en| a| la)* (?:vue complete|grande vue|plein ecran|vue normale))$|^(?:vue complete|grande vue|vue normale)$/.test(t)){
      if(!miniActif) return 'Je suis déjà en vue complète.';
      miniRefus=window.innerWidth*window.innerHeight; miniSortir(); return 'Vue complète.';
    }
    return null;
  });

  /* ───── Démarrage et changements d'adresse ───── */
  window.addEventListener('hashchange',()=>{
    const h=location.hash.slice(1);
    if(h==='mini'){ miniEntrer(false); return; }
    if(miniActif && h!=='terminal') miniSortir();
    if(['parler','briefing','monde'].includes(h)) raccExecuter(h);
  });
  (function(){
    const h=location.hash.slice(1);
    if(h==='mini') miniEntrer(false);                                   // tout de suite : pas d'éclair de la grande vue
    else if(['parler','briefing','monde'].includes(h)) setTimeout(()=>raccExecuter(h),h==='parler'?600:1200);
    else if(miniPetite()) miniEntrer(true);
    const b=$('cfgMini'); if(b) b.addEventListener('click',()=>{ $('cfg').classList.remove('open'); miniEntrer(false); });
  })();
