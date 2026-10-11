"use strict";
  /* ═════════════ COMMANDES ENTRE MES APPAREILS (phase 3A) ═════════════
     « Raylé, affiche l'or en H4 sur la tablette », « mets le terminal sur le PC », « lis-moi la météo sur le téléphone »,
     « envoie ce panneau sur la tablette », « fais sonner le téléphone », « ouvre ce lien sur le PC », « mets en veille / coupe la tablette ».
     • Ici : on repère l'appareil visé (nom simple réglé dans ⚙ Réglages, ou PC / téléphone / tablette et leurs variantes),
       puis on traduit la demande en UNE action d'une liste blanche (seulement ce que la page sait déjà faire). Aucune exécution de code.
     • Le Worker garde une file par appareil (2 minutes), accuse réception et renvoie « fait / échec » (/appareil/…, voir worker).
     • L'appareil visé reçoit ses commandes par la boucle de /evenements (js/rayle/evenements.js) et les exécute ici, avec la même liste blanche.
     • Appareil visé fermé : Raylé le dit et propose d'envoyer l'info par Telegram.
     • Sécurité : appareil appairé obligatoire (niveau 1), vérifié par le Worker ; chaque commande va au journal de sécurité. */

  const RayleAppareils=(function(){
    const ALIAS={
      pc:['pc','ordi','ordinateur','ordinateur portable','pc portable','pc fixe','laptop'],
      telephone:['telephone','tel','portable','mobile','smartphone','samsung','galaxy'],
      tablette:['tablette','xiaomi']
    };
    const n2=t=>String(t==null?'':t).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/['’\-]/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
    const echap=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    function genre(nom){
      const n=n2(nom);
      for(const g of Object.keys(ALIAS)) if(ALIAS[g].some(a=>n===a || (' '+n+' ').includes(' '+a+' '))) return g;
      return null;
    }
    const minuscule=s=>String(s).charAt(0).toLowerCase()+String(s).slice(1);
    // « le PC », « le téléphone », « la tablette », « la tablette Xiaomi », « l'appareil « Salon » »
    function article(nom){
      const g=genre(nom), n=String(nom||'').trim();
      if(g==='pc') return 'le '+(n2(n)==='pc'?'PC':n);
      if(g==='telephone') return 'le '+minuscule(n);
      if(g==='tablette') return 'la '+minuscule(n);
      return 'l’appareil « '+n+' »';
    }
    const majuscule=s=>String(s).charAt(0).toUpperCase()+String(s).slice(1);
    const feminin=nom=>genre(nom)==='tablette';
    // Même appareil ? (« PC » et « ordinateur », « Téléphone » et « portable »…)
    function meme(a,b){ if(!a||!b) return false; if(n2(a)===n2(b)) return true; const g=genre(a); return !!g && g===genre(b); }

    // Texte normalisé + correspondance avec les positions du texte d'origine (pour découper la phrase sans perdre accents ni majuscules)
    function carteTexte(t){
      let s='', idx=[];
      for(let i=0;i<t.length;i++){
        const c=t[i].normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/['’\-]/g,' ').replace(/[^a-z0-9 ]/g,' ');
        for(const ch of c){ s+=ch; idx.push(i); }
      }
      return {s,idx};
    }
    const VERBES_OBJET=/^(?:(?:s il te plait|stp|peux tu|tu peux)\s+)?(?:fais|fait|faire|coupe|couper|eteins|eteindre|arrete|arreter|mets|met|mettre|endors|desactive|reveille)\b/;
    // → {cible, phrase} ou null. connus : noms des appareils appairés (réglés dans ⚙ Réglages)
    function extraireCible(texte,connus){
      const orig=String(texte||'').replace(/^\s*(?:(?:hey|ok|dis)\s+)?rayl[ée]\s*[,:]?\s*/i,'');
      const {s,idx}=carteTexte(orig);
      const noms=[...new Set([].concat(...Object.values(ALIAS),(connus||[]).map(n2)))].filter(x=>x.length>=2).sort((a,b)=>b.length-a.length);
      if(!noms.length) return null;
      const alt=noms.map(echap).join('|');
      const DET='(?:(?:le|la|l|mon|ma|ton|ta|notre)\\s+)?';
      let m=new RegExp('(?:^|\\s)(?:sur|a|au|vers|dans|pour)\\s+'+DET+'('+alt+')(?=\\s|$)').exec(s);
      if(!m && (VERBES_OBJET.test(s.trim()) || /\bsonner\b|\bveille\b/.test(s)))
        m=new RegExp('(?:^|\\s)(?:le|la|l|mon|ma|ton|ta)\\s+('+alt+')(?=\\s|$)').exec(s);
      if(!m) return null;
      const debut=m.index+(m[0].length-m[0].trimStart().length), fin=m.index+m[0].length;
      const a=idx[debut], b=fin<idx.length?idx[fin]:orig.length;
      const phrase=(orig.slice(0,a)+' '+orig.slice(b)).replace(/\s+/g,' ').replace(/^[\s,;:.]+|[\s,;:.!?]+$/g,'').trim();
      return {cible:m[1],phrase};
    }

    // → une action de la liste blanche, ou null (la phrase suit alors son chemin habituel)
    function classer(phrase){
      const n=n2(phrase).replace(/^(?:s il te plait|stp|peux tu|tu peux|est ce que tu peux)\s+/,'').replace(/\s+(?:stp|s il te plait|maintenant)$/,'');
      if(!n) return null;
      if(/\bsonner\b|^sonne\b|^(?:retrouve|retrouver|localise|localiser|ou est)\b/.test(n)) return {type:'sonner'};
      if(/\bveille\b|^(?:endors|dors)\b/.test(n)) return {type:'veille'};
      if(/^(?:coupe|couper|eteins|eteindre|arrete|arreter|desactive|desactiver)(?: tout| toi| la| le| l| ca)?$/.test(n)) return {type:'couper'};
      if(/https?:\/\//i.test(phrase) || /\b(?:lien|url|adresse web|site)\b/.test(n)){
        const u=String(phrase).match(/https?:\/\/[^\s<>"']+/i);
        return {type:'lien',url:u?u[0]:''};
      }
      if(/^(?:envoie|envoyer|mets|met|mettre|affiche|afficher|montre|montrer|transfere|transferer|partage|partager|balance|bascule|passe|pousse|ouvre)(?: moi| le| la| lui)?\s+(?:ca|cela|ce panneau|cette fenetre|ce resultat|cette carte|cet ecran|ce que tu (?:m )?as (?:montre|affiche)|le panneau|la fenetre|le dernier panneau|tout ca|ces infos|cette info)$/.test(n)
        || /^(?:envoie|envoyer|transfere|transferer|balance|pousse|partage)(?: le| la| les| ca| lui)?$/.test(n)) return {type:'panneau'};
      if(typeof METEO_RE!=='undefined' && METEO_RE.test(n)){
        let ville='';
        try{ ville=(typeof citiesOf==='function' ? citiesOf(phrase)[0] : '')||''; }catch(e){}
        return {type:'meteo',ville};
      }
      // « dis que le repas est prêt », « annonce « on part » » (pas « dis-moi le prix de l'or » : c'est une question, elle suit son chemin)
      const dire=String(phrase).match(/^\s*(?:dis|dit|annonce|r[ée]p[èe]te)(?![\s-]+(?:moi|nous)\b)(?:[\s-]+lui)?\s+(?:que\s+|qu['’]\s*)?[«"]?\s*(.{2,}?)\s*[»"]?\s*$/i);
      if(dire) return {type:'dire',texte:dire[1].trim()};
      try{ if(typeof RayleMonde!=='undefined' && RayleMonde.analyser(phrase)) return {type:'monde',phrase}; }catch(e){}
      try{ if(window.RayleUI && RayleUI.analyserCommande && RayleUI.analyserCommande(n)) return {type:'ui',phrase}; }catch(e){}
      try{ if(typeof analyserCommandeTerminal==='function' && analyserCommandeTerminal(phrase,{ouvert:false})) return {type:'terminal',phrase}; }catch(e){}
      try{ if(typeof analyserCarte==='function' && analyserCarte(phrase)) return {type:'carte',phrase}; }catch(e){}
      return null;
    }

    /* ── Nettoyage du HTML d'un panneau reçu : seules des balises et attributs sûrs passent, tout le reste devient du texte ── */
    const BALISES=new Set(['div','span','b','strong','i','em','small','p','h3','h4','a','br','ul','ol','li','pre','code','section','header','footer','table','thead','tbody','tr','td','th','sup','sub']);
    const VIDES=new Set(['br']);
    const JETER=new Set(['script','style','iframe','object','embed','template','noscript','textarea','title','svg','math','select','button','form','video','audio','canvas','frame','frameset','link','meta','base','img','input']);
    const escHtml=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function nettoyerHtml(html){
      const src=String(html||'').slice(0,20000).replace(/<!--[\s\S]*?-->/g,'');
      const re=/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s>"'=\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
      let out='', pos=0, saut=0, m;
      const pile=[];
      const texte=t=>{ if(!saut) out+=t.replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
      while((m=re.exec(src))){
        texte(src.slice(pos,m.index)); pos=re.lastIndex;
        const ferme=m[1]==='/', nom=m[2].toLowerCase();
        if(JETER.has(nom)){ if(VIDES.has(nom)||['img','input','link','meta','base','embed','frame'].includes(nom)) continue; saut=Math.max(0,saut+(ferme?-1:1)); continue; }
        if(saut || !BALISES.has(nom)) continue;
        if(ferme){
          const k=pile.lastIndexOf(nom); if(k<0) continue;
          while(pile.length>k) out+='</'+pile.pop()+'>';
          continue;
        }
        let attrs='';
        const am=/([^\s>"'=\/]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g; let a;
        while((a=am.exec(m[3]||''))){
          const k=a[1].toLowerCase(), v=(a[3]!=null?a[3]:a[4]!=null?a[4]:a[5]||'').replace(/&amp;/g,'&');
          if(k==='class' && /^[\w\s-]{1,120}$/.test(v)) attrs+=' class="'+escHtml(v)+'"';
          else if(k==='href' && nom==='a' && /^https?:\/\/[^\s"'<>]+$/i.test(v)) attrs+=' href="'+escHtml(v)+'" target="_blank" rel="noopener noreferrer"';
        }
        out+='<'+nom+attrs+'>';
        if(!VIDES.has(nom)) pile.push(nom);
      }
      texte(src.slice(pos));
      while(pile.length) out+='</'+pile.pop()+'>';
      return out;
    }
    const texteBrut=html=>String(html||'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(?:p|div|h3|h4|li|tr|section)>/gi,'\n').replace(/<[^>]*>/g,' ')
      .replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,'\n').trim();

    function resume(a){
      if(!a) return '?';
      switch(a.type){
        case 'sonner': return 'faire sonner';
        case 'veille': return 'mise en veille';
        case 'couper': return 'couper Raylé';
        case 'meteo': return 'météo'+(a.ville?' de '+a.ville:'');
        case 'lien': return 'lien '+String(a.url||'').replace(/^https?:\/\//,'').slice(0,40);
        case 'panneau': return 'panneau « '+((a.panneau&&a.panneau.titre)||'?')+' »';
        case 'dire': return '« '+String(a.texte||'').slice(0,60)+' »';
        default: return '« '+String(a.phrase||a.type).slice(0,60)+' »';
      }
    }
    // Ce que Raylé dit quand l'appareil a répondu
    function phraseResultat(d,nom,a){
      const art=article(nom), Art=majuscule(art), f=feminin(nom);
      if(d.etat==='faite'){
        switch(a&&a.type){
          case 'sonner': return Art+' sonne. Touche son écran pour l’arrêter.';
          case 'couper': return Art+' est '+(f?'coupée':'coupé')+'.';
          case 'veille': return Art+' est en veille.';
          case 'meteo': return 'La météo est lue sur '+art+'.';
          case 'dire': return 'C’est dit sur '+art+'.';
          case 'lien': return /affich/.test(d.message||'') ? 'Le lien est affiché sur '+art+' : il faut toucher « Ouvrir le lien ».' : 'Le lien est ouvert sur '+art+'.';
          case 'ui': return 'C’est fait sur '+art+'.';
          default: return 'C’est affiché sur '+art+'.';
        }
      }
      if(d.etat==='echec') return Art+' n’a pas pu le faire'+(d.message?' : '+String(d.message).replace(/[.\s]+$/,''):'')+'.';
      return Art+' n’a pas répondu à temps.';
    }
    return {ALIAS,n2,genre,article,majuscule,feminin,meme,extraireCible,classer,nettoyerHtml,texteBrut,resume,phraseResultat};
  })();

  /* ═════════════ ENVOYER ═════════════ */
  const APP_CLE_CONNUS='rayle_appareils_connus';
  let appConnus=[]; try{ appConnus=JSON.parse(localStorage.getItem(APP_CLE_CONNUS)||'[]')||[]; }catch(e){ appConnus=[]; }
  const appAppaire=()=>!!store.get(KEY_WDEV);
  const appPause=ms=>new Promise(r=>setTimeout(r,ms));
  let appTelegram=null;                 // proposition en attente : {texte, cible, jusqua}
  const appSuivis=new Map();            // id → {cible, action} : commandes envoyées dont on attend encore la réponse
  const appAnnonces=new Set();          // ids déjà annoncés (le suivi rapide et la boucle peuvent se croiser)
  const appRapides=new Set();           // ids suivis en ce moment par le suivi rapide (7 s) : c'est lui qui annonce
  let appAParler=[];

  async function appListe(){
    if(!workerReady()||!appAppaire()) return null;
    try{
      const d=await wjson('/appareil/liste',12000);
      const l=(d.appareils||[]).filter(a=>!a.revoque);
      appConnus=l.map(a=>a.nom);
      try{ localStorage.setItem(APP_CLE_CONNUS,JSON.stringify(appConnus)); }catch(e){}
      return l;
    }catch(e){ return null; }
  }
  setTimeout(appListe,6000);
  setInterval(()=>{ if(!document.hidden) appListe(); },15*60000);

  // Le panneau affiché (le plus récent), prêt à partir : une carte devient une commande « carte » (l'autre appareil la redessine)
  function appPanneauCourant(){
    const l=Panneaux.liste().filter(p=>p.type!=='securite' && !/^app:/.test(p.id));
    if(!l.length) return null;
    const p=l[l.length-1];
    if(p.type==='carte' && typeof carteVue!=='undefined' && carteVue){
      const v=carteVue, lib={voiture:'en voiture',velo:'à vélo',pied:'à pied'}[v.profil]||'';
      if(v.route) return {type:'carte',phrase:(v.a && v.a.court!=='Ma position' ? 'itinéraire de '+v.a.nom+' à '+v.b.nom : 'itinéraire vers '+v.b.nom)+' '+lib};
      if(v.lieu) return {type:'carte',phrase:'montre-moi la carte de '+v.lieu.nom};
    }
    const c=Panneaux.contenu ? Panneaux.contenu(p.id) : null;
    if(!c) return null;
    return {type:'panneau',panneau:{titre:c.titre,icone:c.icone,html:RayleAppareils.nettoyerHtml(c.html),liens:c.liens}};
  }
  async function appLienCourant(texte){
    const m=String(texte||'').match(/https?:\/\/[^\s<>"']+/i); if(m) return m[0];
    const l=Panneaux.liste();
    for(let i=l.length-1;i>=0;i--){
      const c=Panneaux.contenu ? Panneaux.contenu(l[i].id) : null; if(!c) continue;
      const u=(c.liens[0]&&c.liens[0].url) || ((c.html.match(/href="(https?:[^"]+)"/i)||[])[1]);
      if(u) return u.replace(/&amp;/g,'&');
    }
    try{ const v=$('txt').value.match(/https?:\/\/\S+/); if(v) return v[0]; }catch(e){}
    try{
      if(navigator.clipboard && navigator.clipboard.readText){
        const t=await Promise.race([navigator.clipboard.readText(),appPause(1500).then(()=> '')]);
        const u=String(t||'').match(/https?:\/\/\S+/); if(u) return u[0];
      }
    }catch(e){}
    return '';
  }
  // Le texte qui part sur Telegram quand l'appareil visé est fermé
  async function appTexteTelegram(action,phrase){
    try{
      switch(action.type){
        case 'meteo': { const d=await wjson('/meteo'+(action.ville?'?ville='+encodeURIComponent(action.ville):''),15000); return '⛅ '+meteoSpeech(d); }
        case 'lien': return '🔗 '+action.url;
        case 'panneau': { const p=action.panneau||{}; return (p.icone||'◈')+' '+p.titre+'\n'+RayleAppareils.texteBrut(p.html).slice(0,3000)+((p.liens||[]).length?'\n'+p.liens.map(l=>l.texte+' : '+l.url).join('\n'):''); }
        case 'sonner': return '📳 Ton téléphone est ici ! (Raylé voulait le faire sonner, mais il n’était pas ouvert.)';
        case 'dire': return '💬 '+action.texte;
      }
    }catch(e){}
    return 'Demande : « '+phrase+' »';
  }

  async function appEnvoyerAction(cibleDemandee,action,phrase){
    let r, d={};
    try{
      r=await wfetch('/appareil/envoyer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cible:cibleDemandee,action})},12000);
      d=await r.json().catch(()=>({}));
    }catch(e){ return 'Je ne joins pas le Worker : '+errMsg(e)+'.'; }
    const art=RayleAppareils.article(d.cible||cibleDemandee), Art=RayleAppareils.majuscule(art);
    if(r.ok && d.id){
      addLine('sys','Commande envoyée à '+d.cible+' : '+RayleAppareils.resume(action));
      appSuivis.set(d.id,{cible:d.cible,action});
      appRapides.add(d.id);
      const res=await appSuivre(d.id,Date.now()+7000);
      appRapides.delete(d.id);
      if(res){ appSuivis.delete(d.id); appAnnonces.add(d.id); if(res.etat==='expiree') return appProposerTelegram(RayleAppareils.phraseResultat(res,d.cible,action),action,phrase,d.cible,true); return RayleAppareils.phraseResultat(res,d.cible,action); }
      appSuivreFond(d.id,Date.now()+25000);
      return 'C’est envoyé sur '+art+', j’attends '+(RayleAppareils.feminin(d.cible)?'qu’elle':'qu’il')+' réponde.';
    }
    if(d.code==='absent') return appProposerTelegram(Art+' n’est pas '+(RayleAppareils.feminin(d.cible)?'ouverte':'ouvert')+'.',action,phrase,d.cible,d.telegram);
    if(r.status===404 && d.code==='inconnu') return 'Je ne connais pas d’appareil « '+cibleDemandee+' ». '+((d.appareils||[]).length?'Appareils appairés : '+d.appareils.join(', ')+'.':'');
    if(r.status===404) return 'Le Worker n’est pas encore à jour pour les commandes entre appareils : recolle son code dans Cloudflare.';
    if(r.status===423) return fx('Pour cette commande, déverrouillez-moi d’abord.','Pour cette commande, déverrouille-moi d’abord.');
    if(r.status===403) return 'Pour commander un autre appareil, celui-ci doit être appairé (⚙ Réglages, Appareil et sécurité).';
    if(r.status===429) return 'Doucement : trop de commandes en une minute.';
    return 'Je n’ai pas pu envoyer la commande : '+(d.error||'HTTP '+r.status)+'.';
  }
  function appProposerTelegram(debut,action,phrase,cible,telegramOk){
    if(!telegramOk) return debut+' Et Telegram n’est pas lié, je ne peux pas te l’envoyer autrement.';
    appTelegram={action,phrase,cible,jusqua:Date.now()+45000};
    return debut+' '+fx('Voulez-vous que je l’envoie sur Telegram à la place ?','Tu veux que je l’envoie sur Telegram à la place ?');
  }
  async function appSuivre(id,jusqua){
    while(Date.now()<jusqua){
      await appPause(1200);
      try{ const d=await wjson('/appareil/commande?id='+id,8000); if(['faite','echec','expiree'].includes(d.etat)) return d; }catch(e){}
    }
    return null;
  }
  async function appSuivreFond(id,jusqua){
    const d=await appSuivre(id,jusqua);
    const s=appSuivis.get(id);
    if(!d||!s||appAnnonces.has(id)) return;          // sinon la boucle /evenements livrera le retour
    appSuivis.delete(id); appAnnonces.add(id);
    appDire(RayleAppareils.phraseResultat(d,s.cible,s.action));
  }
  function appDire(t){ appAParler.push(t); appAnnoncer(); }
  function appAnnoncer(){
    if(!appAParler.length || speaking || processing || queue.length) return;
    const t=appAParler.join(' '); appAParler=[];
    addLine('ray',t); speak(t);
  }
  setInterval(appAnnoncer,3000);

  // Appelée dans respond() avant les autres commandes. Renvoie la phrase à dire, {texte} (c'est pour cet appareil : on continue avec la phrase nettoyée), ou null.
  async function commandeAppareils(texte){
    // réponse à « je l'envoie sur Telegram ? »
    if(appTelegram){
      const p=appTelegram, c=cmdNorm(norm(texte)).replace(/['’\-]/g,' ').replace(/\s+/g,' ').trim();
      if(Date.now()>p.jusqua) appTelegram=null;
      else if(/^(?:oui|ouais|ok|okay|d accord|vas y|envoie|envoie le|envoie la|carrement|volontiers|yes|go|bien sur|s il te plait|stp)\b/.test(c)){
        appTelegram=null;
        const t=await appTexteTelegram(p.action,p.phrase);
        try{
          const r=await wfetch('/appareil/telegram',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texte:t,cible:p.cible})},15000);
          const d=await r.json().catch(()=>({}));
          return r.ok ? 'C’est parti sur Telegram.' : 'Telegram n’a pas marché : '+(d.error||'HTTP '+r.status)+'.';
        }catch(e){ return 'Telegram n’a pas marché : '+errMsg(e)+'.'; }
      }else if(/^(?:non|nan|laisse|laisse tomber|pas la peine|annule|non merci|c est pas grave|tant pis)\b/.test(c)){ appTelegram=null; return 'D’accord, je laisse tomber.'; }
      else appTelegram=null;
    }
    const x=RayleAppareils.extraireCible(texte,appConnus);
    if(!x) return null;
    const moi=store.get(KEY_WDEVNOM);
    if(moi && RayleAppareils.meme(x.cible,moi)) return x.phrase ? {texte:x.phrase} : null;   // « sur le PC » dit sur le PC : on le fait ici
    let action=RayleAppareils.classer(x.phrase);
    if(!action) return null;                          // pas une commande à distance connue : la phrase suit son chemin (l'agent peut encore s'en charger)
    if(!workerReady()) return "Le Worker n'est pas configuré.";
    if(!appAppaire()) return fx('Pour commander un autre appareil, appairez d’abord celui-ci (⚙ Réglages, Appareil et sécurité).','Pour commander un autre appareil, appaire d’abord celui-ci (⚙ Réglages, Appareil et sécurité).');
    if(action.type==='panneau'){
      action=appPanneauCourant();
      if(!action) return 'Il n’y a aucun panneau à envoyer pour le moment.';
    }
    if(action.type==='lien'){
      if(!action.url) action.url=await appLienCourant(texte);
      if(!action.url) return fx('Quel lien ? Collez-le dans le champ de texte, ou dites « ouvre https://… sur le PC ».','Quel lien ? Colle-le dans le champ de texte, ou dis « ouvre https://… sur le PC ».');
    }
    return await appEnvoyerAction(x.cible,action,x.phrase);
  }
  // L'agent du Worker peut aussi demander une commande (action {type:'appareil', cible, phrase}) : même liste blanche
  async function commandeAppareilAgent(cible,phrase){
    const t=String(phrase||'').trim()+' sur '+(RayleAppareils.genre(cible)==='tablette'?'la ':'le ')+String(cible||'').trim();
    const r=await commandeAppareils(t);
    if(r && typeof r==='object') return '';
    return r || 'Je ne sais pas faire ça sur un autre appareil.';
  }

  /* ═════════════ RECEVOIR (appelé par la boucle de /evenements) ═════════════ */
  const appFaites=new Set();
  let appFile=Promise.resolve();
  function appRecevoir(d){
    (d.commandes||[]).forEach(c=>{ if(c && c.id && !appFaites.has(c.id)){ appFaites.add(c.id); appFile=appFile.then(()=>appExecuter(c)).catch(()=>{}); } });
    (d.retours||[]).forEach(x=>{
      if(!x || appAnnonces.has(x.id) || appRapides.has(x.id)) return;   // le suivi rapide relit ce résultat lui-même
      appAnnonces.add(x.id); appSuivis.delete(x.id);
      const t=RayleAppareils.phraseResultat(x,x.cible,x.action);
      addLine('sys','Retour de '+x.cible+' : '+x.etat+(x.message?' ('+x.message+')':''));
      appDire(t);
    });
  }
  // Exécution d'une commande reçue : uniquement la liste blanche, avec les fonctions que la page a déjà
  async function appExecuter(c){
    const a=c.action||{}, de=c.de||'un autre appareil';
    let ok=true, msg='';
    appToast('📲 '+de+' : '+RayleAppareils.resume(a));
    addLine('sys','Commande reçue de '+de+' : '+RayleAppareils.resume(a));
    try{
      switch(a.type){
        case 'terminal':
          msg=await commandeTerminal(String(a.phrase||''));
          if(!msg){ ok=false; msg='commande du terminal non reconnue'; }
          else if(/n'arrive pas|ne peux pas/.test(msg)) ok=false;
          break;
        case 'monde':{
          if(!RayleMonde.analyser(String(a.phrase||''))){ ok=false; msg='commande de la carte du monde non reconnue'; break; }
          const r=await commandeMonde(String(a.phrase||'')); msg=r||'page Monde affichée';
          if(r && r.length>60){ addLine('ray',r); speak(r); }      // fiche d'un pays : elle la lit
          break;
        }
        case 'carte':
          msg=await commandeCarte(String(a.phrase||''));
          if(msg==null){ ok=false; msg='lieu non reconnu'; }
          else if(/n'ai pas (?:pu|trouvé)|ne connais pas/.test(msg)) ok=false;
          break;
        case 'ui':
          msg=RayleBus.demander('ui:commande',cmdNorm(norm(String(a.phrase||''))).replace(/['’]/g,' '));
          if(!msg){ ok=false; msg='réglage d’apparence non reconnu'; }
          break;
        case 'meteo':{
          const d=await wjson('/meteo'+(a.ville?'?ville='+encodeURIComponent(a.ville):''),18000);
          try{ montrerMeteo(d); }catch(e){}
          const t=meteoSpeech(d); addLine('ray',t); speak(t); msg='météo de '+d.ville+' lue';
          break;
        }
        case 'dire':{ const t=String(a.texte||'').slice(0,600); addLine('ray',t); speak(t); msg='dit'; break; }
        case 'panneau':{
          const p=a.panneau||{};
          Panneaux.ouvrir({id:'app:panneau:'+c.id,type:'appareil',icone:p.icone||'📲',titre:String(p.titre||'Panneau').slice(0,60)+' · de '+de,
            corps:{html:RayleAppareils.nettoyerHtml(p.html)},pied:(p.liens||[]).filter(l=>/^https?:\/\//i.test(l.url)).slice(0,4)});
          msg='panneau affiché'; break;
        }
        case 'lien': msg=appOuvrirLien(String(a.url||''),de); if(!msg){ ok=false; msg='lien refusé (http ou https seulement)'; } break;
        case 'sonner': ok=await appSonner(de); msg=ok?'sonne':'son bloqué par le navigateur : touche une fois l’écran de cet appareil'; break;
        case 'veille': appVeille(false,de); msg='en veille'; break;
        case 'couper': appVeille(true,de); msg='coupée'; break;
        default: ok=false; msg='commande inconnue';
      }
    }catch(e){ ok=false; msg=errMsg(e); }
    try{ await wfetch('/appareil/retour',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:c.id,ok,message:String(msg||'').slice(0,200)})},10000); }
    catch(e){ addLine('sys','Retour de commande impossible : '+errMsg(e)); }
  }
  function appOuvrirLien(url,de){
    if(!/^https?:\/\/\S+$/i.test(url)) return '';
    let w=null;
    try{ w=window.open(url,'_blank'); if(w) w.opener=null; }catch(e){ w=null; }
    Panneaux.ouvrir({id:'app:lien',type:'appareil',icone:'🔗',titre:'Lien envoyé par '+de,duree:5*60000,
      corps:{html:'<p class="app-url">'+Panneaux.esc(url)+'</p>'},pied:[{texte:'Ouvrir le lien',url}]});
    return w ? 'lien ouvert' : 'lien affiché (toucher « Ouvrir le lien »)';
  }

  /* ── Petit bandeau « commande reçue » ── */
  let appToastEl=null, appToastT=null;
  function appToast(t){
    if(!appToastEl){ appToastEl=document.createElement('div'); appToastEl.className='app-toast'; appToastEl.setAttribute('role','status'); document.body.appendChild(appToastEl); }
    appToastEl.textContent=t; appToastEl.classList.add('vu');
    clearTimeout(appToastT); appToastT=setTimeout(()=>appToastEl.classList.remove('vu'),4500);
  }

  /* ── « Fais sonner le téléphone » : sonnerie forte en boucle + vibration, 30 s au plus, un toucher l'arrête ── */
  function appBipWav(){
    const fr=22050, dur=1.6, n=Math.floor(fr*dur), b=new ArrayBuffer(44+n*2), v=new DataView(b);
    const w=(o,s)=>{ for(let i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i)); };
    w(0,'RIFF'); v.setUint32(4,36+n*2,true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
    v.setUint32(24,fr,true); v.setUint32(28,fr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*2,true);
    for(let i=0;i<n;i++){
      const t=i/fr, k=Math.floor(t/0.2), dans=(t%0.2)<0.15 && k<6;          // six bips de 150 ms, puis un silence
      const f=k%2?1318.5:987.8, env=dans?Math.min(1,(t%0.2)*80,(0.15-(t%0.2))*80):0;
      v.setInt16(44+i*2,Math.round(Math.sin(2*Math.PI*f*t)*env*0.85*32767),true);
    }
    return URL.createObjectURL(new Blob([b],{type:'audio/wav'}));
  }
  const appSon=new Audio(); appSon.loop=true; appSon.preload='auto';
  let appSonUrl=null, appSonPret=false, appSonT=null;
  // Android n'autorise le son qu'après un geste : on « arme » ce lecteur au premier toucher (en silence)
  function appArmerSon(){
    if(document.body.classList.contains('app-sonne')){ appArreterSonnerie(); return; }
    if(appSonPret) return;
    appSonPret=true;
    try{
      if(!appSonUrl) appSonUrl=appBipWav();
      appSon.src=appSonUrl; appSon.muted=true;
      const p=appSon.play();
      if(p && p.then) p.then(()=>{ appSon.pause(); appSon.currentTime=0; appSon.muted=false; }).catch(()=>{ appSonPret=false; appSon.muted=false; });
    }catch(e){ appSonPret=false; }
  }
  ['pointerdown','keydown','touchend'].forEach(ev=>document.addEventListener(ev,appArmerSon,{passive:true,capture:true}));
  async function appSonner(de){
    try{ cutAll(); }catch(e){}
    if(!appSonUrl) appSonUrl=appBipWav();
    let ok=false;
    try{ appSon.src=appSonUrl; appSon.muted=false; appSon.volume=1; appSon.currentTime=0; await appSon.play(); ok=true; }catch(e){ ok=false; }
    const touchee=!navigator.userActivation || navigator.userActivation.hasBeenActive;   // le navigateur refuse la vibration avant un premier toucher
    try{ if(touchee && navigator.vibrate) navigator.vibrate([700,300,700,300,700,300,700,300,700,300,700]); }catch(e){}
    document.body.classList.add('app-sonne');
    Panneaux.ouvrir({id:'app:sonner',type:'appareil',icone:'📳',titre:'Je suis là !',protege:true,duree:35000,
      corps:{html:'<p class="app-sonne-txt">'+Panneaux.esc(de)+' me fait sonner.<br>Touche l’écran pour arrêter.</p>'},
      pied:[{texte:'Arrêter la sonnerie',clic:appArreterSonnerie}],onFermer:appArreterSonnerie});
    clearTimeout(appSonT); appSonT=setTimeout(appArreterSonnerie,30000);
    if(!ok){ try{ const u=new SpeechSynthesisUtterance('Je suis là ! Je suis là !'); u.lang='fr-FR'; u.volume=1; speechSynthesis.speak(u); }catch(e){} }
    return ok;
  }
  function appArreterSonnerie(){
    clearTimeout(appSonT);
    try{ appSon.pause(); appSon.currentTime=0; }catch(e){}
    if(!document.body.classList.contains('app-sonne')) return;
    try{ if((!navigator.userActivation || navigator.userActivation.hasBeenActive) && navigator.vibrate) navigator.vibrate(0); }catch(e){}
    document.body.classList.remove('app-sonne');
    Panneaux.fermer('app:sonner');
  }

  /* ── « Mets en veille / coupe la tablette » : silence, écran assombri (il peut s'éteindre), un toucher la réveille ── */
  let appVoile=null;
  function appVeille(couper,de){
    try{ cutAll(); }catch(e){}
    try{ appArreterSonnerie(); }catch(e){}
    try{ Panneaux.fermerTout(); }catch(e){}
    if(couper){ if(micOn) stopListening(); }
    else if(micOn && reveilActif()) enterVeille();
    else if(micOn) stopListening();
    try{ RayleBus.demander('ecran:liberer'); }catch(e){}
    try{ garderEcranAllume(false); }catch(e){}
    if(!appVoile){
      appVoile=document.createElement('div'); appVoile.className='app-voile';
      appVoile.addEventListener('click',()=>{ appVoile.classList.remove('vu'); });
      document.body.appendChild(appVoile);
    }
    appVoile.textContent=(couper?'Raylé coupée':'En veille')+' par '+de+' · toucher pour revenir';
    appVoile.classList.add('vu');
    addLine('sys',(couper?'Coupée':'Mise en veille')+' à la demande de '+de+'.');
  }

  /* ═════════════ RÉGLAGES : renommer cet appareil, voir qui est ouvert ═════════════ */
  (function(){
    const b=$('cfgRenommer'); if(!b) return;
    b.addEventListener('click',async()=>{
      const nom=($('kAppNom').value||'').trim();
      if(!appAppaire()){ cfgMsg.textContent='Cet appareil n’est pas appairé : appaire-le d’abord (le nom sera pris à ce moment-là).'; return; }
      if(nom.length<2){ cfgMsg.textContent='✖ Donne un nom simple : PC, téléphone, tablette…'; return; }
      cfgMsg.textContent='Renommage…';
      try{
        const r=await wfetch('/appareil/renommer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nom})},12000);
        const d=await r.json().catch(()=>({}));
        if(!r.ok){ cfgMsg.textContent='✖ '+(d.error||'HTTP '+r.status)+(r.status===404&&!d.code?' — le Worker n’est pas à jour.':''); return; }
        store.set(KEY_WDEVNOM,d.nom); appListe();
        cfgMsg.textContent='✔ Cet appareil s’appelle maintenant « '+d.nom+' ». Dis par exemple : « affiche l’or sur '+RayleAppareils.article(d.nom)+' ».';
        try{ majAppInfo(); }catch(e){}
      }catch(e){ cfgMsg.textContent='✖ '+errMsg(e); }
    });
  })();

  // Accès pour les tests locaux uniquement
  if(window.__RAYLE_TEST_APPAREILS__) window.__RAYLE_TEST_APPAREILS__({RayleAppareils,commandeAppareils,appRecevoir,appExecuter});
