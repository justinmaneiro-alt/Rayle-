"use strict";
/* ═════════════ INITIATIVE : Raylé prend la parole d'elle-même (page ouverte) ═════════════
   Le Worker (/initiative) propose ce qui mérite d'être dit maintenant : briefing éclair avant Londres et New York,
   prix qui s'approche d'un niveau d'alerte, rendez-vous imminent, devoir ou examen proche, révision oubliée, journal vide.
   La page choisit si et quand le dire :
   - niveau Discrète (l'important seulement) / Normale (par défaut) / Bavarde, avec un intervalle minimum entre deux prises de parole ;
   - jamais pendant les heures calmes (23 h - 7 h par défaut), jamais pendant qu'elle parle, réfléchit, ou qu'on vient de lui parler ;
   - « pas maintenant » : silence une heure, puis initiatives deux fois plus espacées pendant trois heures.
   Page fermée : le Cron du Worker envoie seulement l'important par Telegram (il sait que la page est fermée : elle ne l'interroge plus). */
window.RayleInitiative=(function(){
  const lireLS=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const ecrireLS=(k,v)=>{ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} };
  const CLE={niveau:'rayle_init_niveau',intervalle:'rayle_init_intervalle',calme:'rayle_init_calme',dernier:'rayle_init_dernier',silence:'rayle_init_silence',ralenti:'rayle_init_ralenti',dits:'rayle_init_dits'};
  const NIVEAUX={
    discrete:{nom:'Discrète',min:2,minutes:45,txt:"seulement l'important (prix proche d'un niveau, rendez-vous, devoir)"},
    normale: {nom:'Normale', min:1,minutes:20,txt:'aussi les briefings avant les séances et les révisions oubliées'},
    bavarde: {nom:'Bavarde', min:0,minutes:8, txt:'tout, y compris le journal de trading en fin de séance'}
  };
  const CALME_RE=/^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;
  const R={
    niveau:NIVEAUX[lireLS(CLE.niveau)] ? lireLS(CLE.niveau) : 'normale',
    intervalle:(v=>isFinite(v)&&v>=0?v:0)(parseInt(lireLS(CLE.intervalle),10)),     // 0 = selon le niveau
    calme:CALME_RE.test(lireLS(CLE.calme)||'') ? lireLS(CLE.calme) : '23:00-07:00'
  };
  const num=k=>Number(lireLS(k))||0;
  let dits={}; try{ dits=JSON.parse(lireLS(CLE.dits)||'{}')||{}; }catch(e){ dits={}; }
  let candidats=[], locaux=[], derniereVoix=0;      // locaux : propositions de la page elle-même (ambiance), jamais écrasées par le Worker

  const enCalme=(d=new Date())=>{
    const m=CALME_RE.exec(R.calme); if(!m) return false;
    const a=+m[1]*60+ +m[2], b=+m[3]*60+ +m[4], x=d.getHours()*60+d.getMinutes();
    return a===b ? false : a<b ? (x>=a && x<b) : (x>=a || x<b);
  };
  const intervalleMs=()=>{
    const base=(R.intervalle||NIVEAUX[R.niveau].minutes)*60000;
    return Date.now()<num(CLE.ralenti) ? base*2 : base;
  };
  function noterDit(id){
    dits[id]=Date.now();
    const l=Object.entries(dits).sort((a,b)=>b[1]-a[1]).slice(0,150);   // on garde les 150 derniers
    dits=Object.fromEntries(l); ecrireLS(CLE.dits,JSON.stringify(dits));
  }

  /* ───── interroger le Worker (note aussi la présence de la page) ───── */
  async function interroger(){
    try{ if(document.hidden || !workerReady()) return; }catch(e){ return; }
    try{
      const d=await wjson('/initiative',12000);
      candidats=(d.candidats||[]).filter(c=>c && c.id && c.texte && !dits[c.id]);
      choisir();
    }catch(e){ /* Worker injoignable ou ancien : on réessaie plus tard, sans bruit */ }
  }
  async function envoyer(corps){
    try{ if(!workerReady()) return; await wfetch('/initiative',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(corps)},10000); }catch(e){}
  }

  /* ───── choisir et dire ───── */
  function libre(){
    try{
      if(speaking || processing || queue.length || pendingTxt) return false;
      if((interimEl.textContent||'').replace(/^zz.*$/,'').trim()) return false;           // il est en train de parler
      if(Date.now()-Math.max(lastAct||0,dernierSon||0,speechEndT||0)<10000) return false;  // conversation récente : on n'enchaîne pas
      if(document.body.classList.contains('secu-capture')) return false;                   // saisie de la phrase secrète
      if(document.getElementById('cfg').classList.contains('open')) return false;
      return true;
    }catch(e){ return false; }
  }
  function choisir(){
    if((!candidats.length && !locaux.length) || enCalme() || Date.now()<num(CLE.silence) || !libre()) return;
    const min=NIVEAUX[R.niveau].min;
    const ok=candidats.concat(locaux).filter(c=>!dits[c.id] && (c.importance|0)>=min).sort((a,b)=>(b.importance|0)-(a.importance|0));
    if(!ok.length) return;
    const c=ok[0];
    // limite de fréquence (sauf un prix qui s'approche d'un niveau : ça n'attend pas)
    if(!c.urgent && Date.now()-num(CLE.dernier)<intervalleMs()) return;
    dire(c);
  }
  function dire(c){
    noterDit(c.id); candidats=candidats.filter(x=>x.id!==c.id); locaux=locaux.filter(x=>x.id!==c.id);
    ecrireLS(CLE.dernier,String(Date.now())); derniereVoix=Date.now();
    if(!c.local) envoyer({vu:[c.id]});
    try{ diagEntree('(initiative) '+c.type,false,'initiative'); }catch(e){}
    addLine('ray',c.texte);
    try{
      if(!['terminal','anatomie'].includes(RayleBus.demander('vue')))
        Panneaux.ouvrir({id:'initiative',type:'initiative',icone:'💡',titre:'Raylé · initiative',corps:c.texte,duree:45000,
          pied:[{texte:'Pas maintenant',clic:()=>pasMaintenant(true)}]});
    }catch(e){}
    let son=false; try{ son=audioDebloque; }catch(e){}
    if(son) speak(c.texte);          // sans geste préalable, le navigateur bloque le son : le panneau suffit
  }

  /* ───── « pas maintenant » ───── */
  function pasMaintenant(parBouton){
    ecrireLS(CLE.silence,String(Date.now()+60*60000));
    ecrireLS(CLE.ralenti,String(Date.now()+3*60*60000));
    envoyer({pas_maintenant:60*60000});
    try{ Panneaux.fermer('initiative'); }catch(e){}
    if(parBouton){ try{ if(speaking) cutAll(); }catch(e){} addLine('sys','Initiatives en pause pendant une heure.'); }
  }
  const PAS_MAINTENANT_RE=/^(?:(?:non|ok|bon|chut)\s+)?(?:pas maintenant|pas tout de suite|pas le moment|plus tard|pas ce soir|laisse moi tranquille|laisse moi|fous moi la paix|on verra plus tard|tu me deranges)(?:\s+(?:merci|stp|svp|s'il te plait))?$/;
  RayleBus.fournir('initiative:commande',c=>{
    const t=String(c||'').replace(/['’-]/g,' ').replace(/\s+/g,' ').trim();
    if(!PAS_MAINTENANT_RE.test(t)) return null;
    pasMaintenant(false);
    return 'Entendu, je me fais discrète pendant une heure.';
  });

  /* ───── réglages (section « Initiative » des Réglages) ───── */
  let ui=null;
  function changer(k,v){
    R[k]=v; ecrireLS(CLE[k],String(v));
    if(k==='niveau') envoyer({niveau:v});
    if(k==='calme') envoyer({calme:v});
    majUI();
  }
  function monterUI(){
    const cfg=document.getElementById('cfg'); if(!cfg) return;
    const tests=Array.from(cfg.querySelectorAll('h3')).find(h=>/^Tests/.test(h.textContent));
    const h=document.createElement('h3'); h.textContent='Initiative';
    ui=document.createElement('div'); ui.className='initiative-reglages';
    ui.innerHTML=
      '<label for="kInit">Quand Raylé prend la parole d’elle-même</label>'
      +'<select id="kInit">'+Object.entries(NIVEAUX).map(([k,v])=>'<option value="'+k+'">'+v.nom+' — '+v.txt+'</option>').join('')+'</select>'
      +'<label for="kInitInt">Au plus une initiative toutes les…</label>'
      +'<select id="kInitInt"><option value="0">Selon le niveau</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option><option value="60">1 heure</option><option value="120">2 heures</option></select>'
      +'<label>Heures calmes (aucune initiative, ni à l’écran ni sur Telegram)</label>'
      +'<div class="row"><span>de</span><input type="time" id="kCalmeDe"><span>à</span><input type="time" id="kCalmeA"></div>'
      +'<div class="hint" id="kInitInfo"></div>';
    (tests?tests:cfg.lastElementChild).before(h,ui);
    ui.querySelector('#kInit').addEventListener('change',e=>changer('niveau',e.target.value));
    ui.querySelector('#kInitInt').addEventListener('change',e=>changer('intervalle',parseInt(e.target.value,10)||0));
    const de=ui.querySelector('#kCalmeDe'), a=ui.querySelector('#kCalmeA');
    const majCalme=()=>{ if(/^\d\d:\d\d$/.test(de.value) && /^\d\d:\d\d$/.test(a.value)) changer('calme',de.value+'-'+a.value); };
    de.addEventListener('change',majCalme); a.addEventListener('change',majCalme);
    document.getElementById('gear').addEventListener('click',majUI);
    majUI();
  }
  function majUI(){
    if(!ui) return;
    ui.querySelector('#kInit').value=R.niveau;
    ui.querySelector('#kInitInt').value=String(R.intervalle);
    const m=CALME_RE.exec(R.calme);
    if(m){ ui.querySelector('#kCalmeDe').value=m[1]+':'+m[2]; ui.querySelector('#kCalmeA').value=m[3]+':'+m[4]; }
    const s=num(CLE.silence);
    ui.querySelector('#kInitInfo').textContent='Page ouverte, elle parle ; page fermée, seulement l’important par Telegram. Dis « pas maintenant » pour la faire taire une heure.'
      +(Date.now()<s ? ' En pause jusqu’à '+new Date(s).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+'.' : '');
  }
  try{ monterUI(); }catch(e){ console.warn('[initiative] réglages',e); }

  // les réglages partent au Worker une fois au démarrage (pour Telegram), puis on interroge chaque minute
  setTimeout(()=>{ envoyer({niveau:R.niveau,calme:R.calme}); interroger(); },8000);
  setInterval(interroger,60000);
  setInterval(choisir,5000);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) setTimeout(interroger,1500); });

  // proposition locale (ex. « il commence à pleuvoir ») : mêmes règles que les autres (heures calmes, « pas maintenant », intervalle, niveau),
  // et jamais pendant que le terminal de trading est ouvert. Renvoie true si elle a été retenue (elle ne sera dite qu'une fois).
  function proposer(c){
    try{ if(!c || !c.id || !c.texte || dits[c.id] || ['terminal','anatomie'].includes(RayleBus.demander('vue')) || enCalme()) return false; }catch(e){ return false; }
    locaux=locaux.filter(x=>x.id!==c.id).concat([Object.assign({importance:1},c,{local:true})]);
    setTimeout(choisir,0); return true;
  }
  setInterval(()=>{ locaux=locaux.filter(c=>!dits[c.id]).slice(-3); },600000);   // une proposition qui n'a pas pu être dite finit par expirer

  return {reglages:()=>Object.assign({},R),enCalme,pasMaintenant,proposer,
    _test:{candidats:l=>{ candidats=l; choisir(); },libre,intervalleMs}};
})();
