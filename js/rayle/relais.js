"use strict";
  /* ═════════════ CONTRÔLE DES APPAREILS PAR LES RELAIS (phase 3B, sans n8n) ═════════════
     « ouvre XTB sur le PC », « monte le son de la tablette », « allume la lampe du téléphone », « ouvre YouTube sur la tablette »,
     « regarde mon écran PC », « verrouille le PC », « éteins le PC », « annule l'arrêt du PC », « état du PC ».
     • Une page web ne peut pas commander l'appareil : chaque appareil a un relais qui n'exécute QUE des actions d'une liste blanche.
       PC : relais Node (dossier relais-pc/, appareil appairé « PC système »). Téléphone et tablette : MacroDroid (webhook).
     • Ici : on repère l'appareil et on traduit la phrase en UNE action {type:'systeme', op, valeur}. Jamais de texte libre :
       la valeur est un nom court (appli), une adresse http(s), un nombre, ou un nom de fichier que le relais cherche lui-même.
     • Niveau 2 (verrouiller, veille, redémarrer, éteindre, ouvrir un fichier) : déverrouillage (phrase + PIN) vérifié par le Worker,
       et en plus une confirmation orale ici avant l'envoi.
     • Worker pas encore à jour : détecté (/relais/etat absent), Raylé le dit au lieu de planter. */

  const RayleRelais=(function(){
    const n2=t=>String(t==null?'':t).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/['’\-]/g,' ').replace(/[^a-z0-9%.:/ ]/g,' ').replace(/\s+/g,' ').trim();
    const APPAREILS={pc:['pc','ordi','ordinateur'],telephone:['telephone','tel','portable','smartphone','mobile','samsung'],tablette:['tablette','xiaomi']};
    const tous=[].concat(...Object.values(APPAREILS)).sort((a,b)=>b.length-a.length).join('|');
    const DEV=new RegExp('(?:^|\\s)(?:(?:sur|de|du|des|a|au|dans|pour|vers)\\s+)?(?:(?:le|la|l|mon|ma|ton|ta)\\s+)?('+tous+')(?=\\s|$)');
    const genreDe=m=>Object.keys(APPAREILS).find(g=>APPAREILS[g].includes(m))||null;
    // « monte le son de la tablette » → {genre:'tablette', reste:'monte le son'}
    function cible(texte){
      const n=n2(String(texte||'').replace(/^\s*(?:(?:hey|ok|dis)\s+)?rayl[ée]\s*[,:]?\s*/i,'')).replace(/[.:]+$/,'').replace(/\s*\.\s*$/,'');
      const m=DEV.exec(n);
      if(!m) return null;
      const reste=(n.slice(0,m.index)+' '+n.slice(m.index+m[0].length)).replace(/\s+/g,' ').trim();
      return {genre:genreDe(m[1]),reste};
    }
    const APPS={xtb:['xtb','xstation','x station','xstation 5','xtb station','xtb trading'],tradingview:['tradingview','trading view'],chrome:['chrome','google chrome','le navigateur','navigateur'],
      blocnotes:['bloc notes','bloc note','blocnotes','notepad'],explorateur:['explorateur','explorateur de fichiers','explorateur windows','mes fichiers','l explorateur'],calculatrice:['calculatrice','calculette','la calculatrice','calc'],
      whatsapp:['whatsapp','whats app','watsap','watsapp'],youtube:['youtube','you tube'],spotify:['spotify'],edge:['edge','microsoft edge'],discord:['discord'],telegram:['telegram'],vlc:['vlc'],word:['word'],excel:['excel']};
    const SITES={youtube:'https://www.youtube.com',gmail:'https://mail.google.com',google:'https://www.google.com',tradingview:'https://www.tradingview.com',investing:'https://fr.investing.com',
      'forex factory':'https://www.forexfactory.com',forexfactory:'https://www.forexfactory.com',netflix:'https://www.netflix.com',wikipedia:'https://fr.wikipedia.org',chatgpt:'https://chatgpt.com',github:'https://github.com'};
    const ANDROID_APPS=['xtb','whatsapp','youtube','spotify'];
    const NIVEAU2=['verrouiller','veille','redemarrer','eteindre','ouvrir_fichier'];
    function appDe(nom){
      const n=n2(nom).replace(/^(?:l |la |le |les |mon |ma )/,'').replace(/\s+(?:stp|s il te plait|maintenant|vite)$/,'').trim();
      for(const [k,l] of Object.entries(APPS)) if(l.includes(n)) return k;
      return null;
    }
    // → {type:'systeme', op, valeur} | {erreur:'…'} | null (pas pour le relais)
    function classer(reste,genre,brut){
      const n=n2(reste).replace(/^(?:s il te plait|stp|peux tu|tu peux|est ce que tu peux|tu pourrais|pourrais tu)\s+/,'').replace(/\s+(?:stp|s il te plait|maintenant)$/,'').trim();
      if(!n) return null;
      const pc=genre==='pc', A=op=>({type:'systeme',op});
      if(pc && (/\b(?:regarde|analyse|vois|lis|decris|observe|scanne|montre moi)\b.*\becran\b|\bcapture\b|\bjette un (?:oeil|coup d oeil)\b|\bque vois tu\b|qu y a t il (?:sur|a) l ecran/.test(n))) return A('capture');
      if(pc && /\b(?:etat|batterie|allume depuis|depuis quand|uptime)\b/.test(n)) return A('etat');
      if(/\bannule\b.*\b(?:arret|extinction|redemarrage|eteindre|eteins)\b|^n eteins pas\b|^arrete l extinction\b/.test(n)) return pc?A('annuler'):null;
      if(/^(?:verrouille|verrouiller|verouille|bloque|bloquer)\b/.test(n)) return pc?A('verrouiller'):{erreur:'Je ne peux verrouiller que le PC.'};
      if(/\b(?:redemarre|redemarrer|reboot|rebooter)\b/.test(n)) return pc?A('redemarrer'):{erreur:'Je ne peux redémarrer que le PC.'};
      if(/\b(?:lampe|torche|flash)\b/.test(n)){
        if(pc) return {erreur:'Le PC n’a pas de lampe torche.'};
        const o=A('lampe'); o.valeur=/\b(?:eteins|eteindre|coupe|couper|desactive|arrete|ferme)\b/.test(n)?'off':/\b(?:allume|allumer|active|activer|mets|ouvre)\b/.test(n)?'on':'bascule'; return o;
      }
      if(/\b(?:son|volume)\b|\b(?:muet|mute)\b/.test(n) && !/\bsonner\b/.test(n)){
        const o=A('volume'), p=/(\d{1,3})\s*(?:%|pour ?cent|pourcents?)/.exec(n)||/\b(?:a|au|sur)\s+(\d{1,3})\b/.exec(n);
        if(p && +p[1]<=100) o.valeur=String(+p[1]);
        else if(/\b(?:baisse|baisser|diminue|diminuer|moins fort|descends?|reduis|reduire)\b/.test(n)) o.valeur='moins';
        else if(/\b(?:coupe|couper|muet|mute|silence|enleve)\b/.test(n)) o.valeur='muet';
        else if(/\b(?:monte|monter|augmente|augmenter|plus fort|hausse|leve|remets|remet)\b/.test(n)) o.valeur='plus';
        else return null;
        return o;
      }
      if(/\b(?:suivant|suivante|next|chanson d apres|passe (?:la|a la) (?:chanson|musique|piste))\b/.test(n)) return Object.assign(A('media'),{valeur:'suivant'});
      if(/\b(?:precedent|precedente|chanson d avant)\b/.test(n)) return Object.assign(A('media'),{valeur:'precedent'});
      if(/\b(?:pause|reprends?|play|relance la musique|arrete la musique|coupe la musique|mets la musique|lecture)\b/.test(n) && !/\becran\b/.test(n)) return Object.assign(A('media'),{valeur:'pause'});
      if(!pc && /\bsonner\b|^sonne\b/.test(n)) return A('sonner');
      if(pc && /\bveille\b|^(?:endors|endormir)\b/.test(n)) return A('veille');
      if(pc && /^(?:eteins|eteindre|eteint|arrete|arreter|shutdown)$/.test(n)) return A('eteindre');
      let m=/^(?:ouvre|ouvrir|affiche|montre moi|montre)\s+(?:le |mon |ma |les |la )?(?:fichier|dossier|document|repertoire)\s+(.{2,80})$/.exec(n);
      if(m) return pc?Object.assign(A('ouvrir_fichier'),{valeur:m[1].trim()}):{erreur:'J’ouvre des fichiers seulement sur le PC.'};
      m=/^(?:ouvre|ouvrir|lance|lancer|demarre|demarrer|va sur|vas sur|mets|allume)\s+(.+)$/.exec(n);
      if(!m) return null;
      let quoi=m[1].replace(/^(?:l appli(?:cation)?|l app|le logiciel|le programme)\s+/,'').trim();
      const site=/^(?:le )?site\s+(?:de |d |du |web )?/.test(quoi); quoi=quoi.replace(/^(?:le )?site\s+(?:de |d |du |web )?/,'').trim();
      const url=String(brut||'').match(/https?:\/\/[^\s<>"']+/i);
      const dom=/\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|fr|net|org|io|tv|eu|be|ch|app|dev))\b/.exec(quoi);
      const app=appDe(quoi);
      if(!site && app && (pc || ANDROID_APPS.includes(app)) && !(pc && app==='youtube')) return Object.assign(A('ouvrir_app'),{valeur:app});
      const sk=Object.keys(SITES).find(k=>n2(quoi).replace(/^(?:le |la )/,'')===k);
      if(url) return Object.assign(A('ouvrir_site'),{valeur:url[0]});
      if(sk) return Object.assign(A('ouvrir_site'),{valeur:SITES[sk]});
      if(dom) return Object.assign(A('ouvrir_site'),{valeur:'https://'+dom[1]});
      if(app) return {erreur:'Je n’ai pas de macro pour ouvrir '+quoi+' sur '+(genre==='tablette'?'la tablette':'le téléphone')+' : seulement XTB, WhatsApp, YouTube ou Spotify.'};
      if(site) return null;
      const nom=quoi.replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,'');
      if(pc && /^[a-z0-9]{2,30}$/.test(nom) && quoi.split(' ').length<=3) return Object.assign(A('ouvrir_app'),{valeur:nom,inconnue:true});
      return null;
    }
    const article=g=>g==='pc'?'le PC':g==='tablette'?'la tablette':'le téléphone';
    // Question de confirmation (niveau 2)
    function question(a,g){
      const art=article(g);
      switch(a.op){
        case 'verrouiller': return 'Je verrouille '+art+' ?';
        case 'veille': return 'Je mets '+art+' en veille ?';
        case 'redemarrer': return 'Je redémarre '+art+' ? Il aura 30 secondes pour annuler.';
        case 'eteindre': return 'J’éteins '+art+' ? Tu auras 30 secondes pour dire « annule l’arrêt du PC ».';
        case 'ouvrir_fichier': return 'J’ouvre « '+a.valeur+' » sur '+art+' (Documents ou Téléchargements) ?';
      }
      return 'Je le fais sur '+art+' ?';
    }
    // Ce qui est dit quand une macro MacroDroid a été déclenchée (pas de confirmation d'exécution possible)
    function phraseWebhook(a,g){
      const art=article(g);
      switch(a.op){
        case 'sonner': return 'J’ai demandé à '+art+' de sonner.';
        case 'lampe': return a.valeur==='off'?'J’éteins la lampe de '+art+'.':a.valeur==='on'?'J’allume la lampe de '+art+'.':'J’ai basculé la lampe de '+art+'.';
        case 'volume': return a.valeur==='moins'?'Je baisse le son de '+art+'.':a.valeur==='muet'?'Je coupe le son de '+art+'.':'Je monte le son de '+art+'.';
        case 'media': return a.valeur==='suivant'?'Morceau suivant sur '+art+'.':a.valeur==='precedent'?'Morceau précédent sur '+art+'.':'Lecture ou pause sur '+art+'.';
        case 'ouvrir_app': return 'J’ouvre '+({xtb:'XTB',whatsapp:'WhatsApp',youtube:'YouTube',spotify:'Spotify'}[a.valeur]||a.valeur)+' sur '+art+'.';
        case 'ouvrir_site': return 'J’ouvre la page sur '+art+'.';
      }
      return 'C’est envoyé à '+art+'.';
    }
    return {n2,cible,classer,appDe,question,phraseWebhook,article,NIVEAU2};
  })();

  /* ═════════════ ENVOI ET SUIVI ═════════════ */
  let relAttente=null;           // confirmation orale en attente (niveau 2) : {action, genre, jusqua}
  let relWorkerAJour=null;       // null : inconnu ; true / false après une vérification
  const relPause=ms=>new Promise(r=>setTimeout(r,ms));
  const REL_PAS_A_JOUR='Le Worker en ligne ne connaît pas encore le contrôle des appareils : recolle worker.js (phase 3B) dans Cloudflare.';
  async function relVerifierWorker(){
    if(relWorkerAJour!==null) return relWorkerAJour;
    try{ const r=await wfetch('/relais/etat',{method:'GET'},10000); if(r.status===404){ relWorkerAJour=false; return false; } if(r.ok) relWorkerAJour=true; return true; }
    catch(e){ return true; }
  }
  async function relSuivre(id,ms){
    const fin=Date.now()+ms;
    while(Date.now()<fin){
      await relPause(1500);
      try{ const d=await wjson('/appareil/commande?id='+id,8000); if(['faite','echec','expiree'].includes(d.etat)) return d; }catch(e){}
    }
    return null;
  }
  async function relEnvoyer(genre,action,question){
    const R=RayleRelais, art=R.article(genre), Art=art.charAt(0).toUpperCase()+art.slice(1);
    let r, d={};
    const corps={cible:genre,action:{type:'systeme',op:action.op,valeur:action.valeur}};
    try{ r=await wfetch('/appareil/envoyer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(corps)},15000); d=await r.json().catch(()=>({})); }
    catch(e){ return 'Je ne joins pas le Worker : '+errMsg(e)+'.'; }
    if(r.status===400 && d.code==='interdite') return (await relVerifierWorker()) ? 'Je ne peux pas faire ça : ce n’est pas dans la liste des actions autorisées.' : REL_PAS_A_JOUR;
    if(r.status===404) return (await relVerifierWorker()) ? 'Je ne trouve pas cet appareil.' : REL_PAS_A_JOUR;
    if(r.status===423) return fx('Pour ça, déverrouillez-moi d’abord (dites « déverrouille »), puis redemandez.','Pour ça, déverrouille-moi d’abord (dis « déverrouille »), puis redemande.');
    if(r.status===403) return 'Pour commander un appareil, celui-ci doit être appairé (⚙ Réglages, Appareil et sécurité).';
    if(r.status===429) return 'Doucement : trop de commandes en une minute.';
    if(!r.ok) return 'Je n’ai pas pu envoyer l’ordre : '+(d.error||'HTTP '+r.status)+'.';
    if(d.code==='relais_absent'){
      if(genre==='pc') return d.raison==='non_installe' ? 'Le relais du PC n’est pas installé : double-clique sur installer.cmd dans le dossier relais-pc.'
        : 'Le relais du PC ne répond pas : le PC est sans doute éteint ou en veille, ou le relais n’est pas lancé.';
      if(action.op==='sonner') return null;                       // pas de MacroDroid : la sonnerie de la page (phase 3A) prend le relais
      return 'MacroDroid n’est pas encore relié pour '+art+' (secret RELAIS_ANDROID, voir docs/relais-android.md).';
    }
    if(d.code==='non_disponible') return action.op==='ouvrir_app' && genre!=='pc' ? 'Je n’ai pas de macro pour ouvrir ça sur '+art+' : seulement XTB, WhatsApp, YouTube ou Spotify.' : 'Ça, je ne sais pas le faire sur '+art+'.';
    if(d.mode==='webhook') return d.ok ? R.phraseWebhook(action,genre) : 'MacroDroid n’a pas pris l’ordre pour '+art+(d.statut?' (code '+d.statut+')':'')+'. Vérifie l’adresse webhook.';
    if(!d.id) return 'Réponse inattendue du Worker.';
    addLine('sys','Relais du PC : '+action.op+(action.valeur?' '+action.valeur:''));
    try{ appRapides.add(d.id); appSuivis.set(d.id,{cible:'PC',action:corps.action}); }catch(e){}
    const res=await relSuivre(d.id,action.op==='capture'?30000:20000);
    try{ appRapides.delete(d.id); if(res){ appSuivis.delete(d.id); appAnnonces.add(d.id); } }catch(e){}
    if(!res) return 'C’est envoyé au PC, j’attends sa réponse.';
    if(res.etat==='expiree') return 'Le relais du PC n’a pas répondu à temps : le PC est peut-être en veille.';
    if(res.etat==='echec') return Art+' n’a pas pu le faire'+(res.message?' : '+String(res.message).replace(/[.\s]+$/,''):'')+'.';
    if(action.op==='capture'){
      let img='';
      try{ const c=await wjson('/relais/capture?id='+d.id,20000); img=c.image||''; }catch(e){ return 'J’ai la capture, mais je n’arrive pas à la récupérer : '+errMsg(e)+'.'; }
      if(!img) return 'La capture est vide.';
      await respondMedia({image:img,nom:'ecran-pc.jpg',q:question||'Voici une capture de l’écran de mon PC. Dis-moi ce que tu vois, en quelques phrases utiles.'});
      return {fait:true};
    }
    return res.message ? String(res.message) : 'C’est fait sur le PC.';
  }

  /* ═════════════ À LA VOIX (appelée dans respond(), avant les commandes entre appareils) ═════════════ */
  async function commandeRelais(texte){
    const R=RayleRelais;
    if(relAttente){
      const p=relAttente; relAttente=null;
      if(Date.now()<=p.jusqua){
        const c=R.n2(texte).replace(/^(?:rayle\s+)/,'');
        if(/^(?:oui|ouais|ok|okay|d accord|vas y|go|confirme|je confirme|fais le|c est bon|yes|exactement|bien sur)\b/.test(c)) return await relEnvoyer(p.genre,p.action);
        if(/^(?:non|nan|annule|laisse|laisse tomber|stop|pas maintenant|surtout pas|attends)\b/.test(c)) return 'D’accord, je ne touche à rien.';
      }
    }
    const x=R.cible(texte);
    if(!x) return null;
    const moiNom=store.get(KEY_WDEVNOM)||'';
    let action=R.classer(x.reste,x.genre,texte);
    if(!action) return null;
    if(action.erreur) return action.erreur;
    // ouvrir une appli inconnue : si les commandes de la page (terminal, carte, lien…) la comprennent, on les laisse faire
    if(action.inconnue){ try{ if(typeof RayleAppareils!=='undefined' && RayleAppareils.classer(x.reste)) return null; }catch(e){} delete action.inconnue; }
    // « fais sonner » sur l'appareil où l'on parle : rien à faire ici
    if(action.op==='sonner' && moiNom && typeof RayleAppareils!=='undefined' && RayleAppareils.genre(moiNom)===x.genre) return null;
    if(!workerReady()) return "Le Worker n'est pas configuré.";
    if(!store.get(KEY_WDEV)) return fx('Pour commander un appareil, appairez d’abord celui-ci (⚙ Réglages, Appareil et sécurité).','Pour commander un appareil, appaire d’abord celui-ci (⚙ Réglages, Appareil et sécurité).');
    if(R.NIVEAU2.includes(action.op)){
      relAttente={action,genre:x.genre,jusqua:Date.now()+60000};
      return R.question(action,x.genre);
    }
    const q=action.op==='capture' ? String(texte).replace(/^\s*(?:(?:hey|ok|dis)\s+)?rayl[ée]\s*[,:]?\s*/i,'') : '';
    return await relEnvoyer(x.genre,action,q && !/^(?:regarde|analyse|vois)\s+(?:mon|l['’]|le)\s*[ée]cran(?:\s+(?:du\s+)?pc)?\s*[.!?]*$/i.test(q) ? q+' (capture de l’écran de mon PC)' : '');
  }
  // L'agent du Worker peut aussi demander (action {type:'relais', cible, phrase}) : même liste blanche, même confirmation
  async function relaisAgent(cible,phrase){
    const g=RayleRelais.cible(String(cible||''));
    const t=String(phrase||'').trim()+' sur '+(g&&g.genre==='tablette'?'la tablette':g&&g.genre==='pc'?'le PC':'le téléphone');
    const r=await commandeRelais(t);
    if(r && typeof r==='object') return '';
    return r || 'Je ne sais pas faire ça avec le relais.';
  }

  /* ═════════════ RÉGLAGES : état des relais ═════════════ */
  (function(){
    const info=$('relaisInfo'), gear=$('gear'); if(!info || !gear) return;
    gear.addEventListener('click',async()=>{
      if(!workerReady() || !store.get(KEY_WDEV)){ info.textContent='Relais : appaire d’abord cet appareil.'; return; }
      try{
        const r=await wfetch('/relais/etat',{method:'GET'},10000);
        if(r.status===404){ relWorkerAJour=false; info.textContent='Relais : '+REL_PAS_A_JOUR; return; }
        const d=await r.json();
        relWorkerAJour=true;
        info.textContent='Relais du PC : '+(!d.pc.installe?'non installé':d.pc.en_ligne?'en ligne':'hors ligne'+(d.pc.vu?' (vu le '+new Date(d.pc.vu).toLocaleString('fr-FR')+')':''))
          +' · MacroDroid : téléphone '+(d.android.telephone?'relié':'non relié')+', tablette '+(d.android.tablette?'reliée':'non reliée')+'.';
      }catch(e){ info.textContent='Relais : '+errMsg(e); }
    });
  })();

  // Accès pour les tests locaux uniquement
  if(window.__RAYLE_TEST_RELAIS__) window.__RAYLE_TEST_RELAIS__({RayleRelais,commandeRelais,relaisAgent,attente:()=>relAttente});
