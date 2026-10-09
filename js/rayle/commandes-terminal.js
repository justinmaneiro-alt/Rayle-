"use strict";
  /* ═════════════ COMMANDES VOCALES DU TERMINAL ═════════════
     « ouvre le terminal », « ferme le terminal » / « retour », « passe sur le Bitcoin », « mets M15 »,
     « ferme le carnet »… Interprétées ici, tout de suite, sans IA. Raylé parle au terminal par le bus. */

  const TERM_ACTIFS=[
    ['NDX',/\b(nasdaq|us ?100|ndx|nas ?100)\b/,'le Nasdaq'],
    ['BTC',/\b(bitcoin|btc)\b/,'le Bitcoin'],
    ['SOL',/\b(solana|sol)\b/,'Solana'],
    ['XAU',/\b(or|gold|xau ?usd|xau)\b/,"l'or"],
    ['EUR',/\b(eur ?usd|euro dollar|euro|eur)\b/,"l'euro dollar"]
  ];
  const TERM_PANNEAUX=[
    ['dashboard',/\b(dashboard|tableau de bord)\b/,'le dashboard'],
    ['contexte',/\b(contexte)\b/,'le contexte de marché'],
    ['graphique',/\b(graphique|graphe|chart|courbe)\b/,'le graphique'],
    ['rsi',/\b(rsi)\b/,'le RSI'],
    ['carnet',/\b(carnet)\b/,"le carnet d'ordres"],
    ['notes',/\b(notes?)\b/,'les notes'],
    ['calendrier',/\b(calendrier|agenda economique)\b/,'le calendrier']
  ];
  const TERM_VERBES=/^(?:ouvre|ouvrir|montre|montrer|affiche|afficher|passe|passer|bascule|basculer|va|aller|mets|met|mettre|change|changer|selectionne|charge|lance|donne|regarde|fais|fait)\b/;
  const TERM_VERBES_FERMER=/^(?:ferme|fermer|quitte|quitter|cache|cacher|masque|masquer|enleve|retire|replie|replier)\b/;
  // mots qui montrent une question ou une autre fonction de Raylé : on ne touche pas au terminal
  const TERM_AUTRES=/\b(prix|cours|combien|quel|quelle|quels|quand|pourquoi|comment|est ce|explique|resume|parle|rappel|rappelle|alerte|previens|prevenir|minuteur|chrono|agenda|journal|checklist|briefing|achat|vente|ordre|stop|traduis|meteo|actu|actus)\b/;

  // Pure : texte + état ({ouvert}) → plan, ou null si ce n'est pas une commande du terminal
  function analyserCommandeTerminal(texte,etat){
    let n=cmdNorm(norm(texte)).replace(/['’\-\/]/g,' ').replace(/\s+/g,' ').trim();
    n=n.replace(/^(?:s il (?:te|vous) plait |stp |peux tu |pouvez vous |tu peux |vous pouvez |est ce que tu peux )+/,'').replace(/ (?:stp|s il (?:te|vous) plait|maintenant|moi)$/,'').replace(/^(?:et )/,'');
    n=n.replace(/\b(montre|ouvre|mets|met|donne|affiche|passe|fais|fait|regarde) moi\b/,'$1');
    if(!n || n.split(' ').length>12) return null;
    const ouvert=!!(etat&&etat.ouvert);
    const mot=/\bterminal\b/.test(n);

    // 1. fermer le terminal / retour
    if(mot && TERM_VERBES_FERMER.test(n)) return {fermer:true};
    if(/^(?:retour|reviens|revenir|retourne|retourner)(?: a| en arriere| a (?:l accueil|l ecran principal|l interface|toi|l assistante))?$/.test(n) ||
       /^(?:retour|reviens|revenir|retourne|retourner) (?:a|sur) (?:l ecran |la page )?(?:principal|principale|d accueil|accueil|rayle)$/.test(n)){
      return ouvert ? {fermer:true} : null;
    }
    if(TERM_AUTRES.test(n)) return null;

    // 2. ouvrir le terminal
    if(/^(?:le |mon |ton )?terminal(?: de trading)?$/.test(n)) return {ouvrir:true,actions:[]};
    const verbe=TERM_VERBES.test(n), verbeF=TERM_VERBES_FERMER.test(n);
    if(!verbe && !verbeF && !/^(?:actualise|actualiser|rafraichis|rafraichir|recharge|recharger)\b/.test(n)) return null;

    const actions=[];
    // actualiser
    if(/\b(?:actualise|actualiser|rafraichis|rafraichir|recharge|recharger|(?:mets|met) a jour)\b/.test(n)){
      if(!(ouvert||mot||/\bdashboard\b/.test(n))) return null;
      return {ouvrir:!ouvert,actions:[{type:'actualiser'}]};
    }
    // panneaux (seulement si le terminal est ouvert, ou cité : « calendrier » seul reste la fonction de Raylé)
    const pan=TERM_PANNEAUX.find(p=>p[1].test(n));
    const actif=TERM_ACTIFS.find(a=>a[1].test(n));
    const veutUnite = /\b(m ?15|15 ?(?:min|minutes?)|quinze minutes?|h ?1|1 ?h|1 heure|une heure|h ?4|4 ?h|quatre heures?|daily|journalier|journaliere|1 ?d|jour)\b/.test(n);
    if(pan && (ouvert||mot) && !(pan[0]==='graphique' && veutUnite && !verbeF && !/(ouvre|ouvrir|affiche|afficher|montre|montrer)/.test(n))){
      if(actif && !verbeF) actions.push({type:'actif',valeur:actif[0],libelle:actif[2]});   // « montre le graphique du Bitcoin »
      actions.push({type:'panneau',nom:pan[0],action:verbeF?'fermer':'ouvrir',libelle:pan[2]});
      return {ouvrir:!ouvert,actions};
    }
    if(verbeF) return null;      // « ferme … » sans panneau reconnu : autre fonction
    // actif
    if(actif){
      actions.push({type:'actif',valeur:actif[0],libelle:actif[2]});
    }
    // unité de temps
    let nonGeree=null;
    if(/\b(m ?15|15 ?(?:min|minutes?)|quinze minutes?)\b/.test(n)) actions.push({type:'unite',valeur:'15',libelle:'M15'});
    else if(/\b(h ?1|1 ?h|1 heure|une heure)\b/.test(n)) actions.push({type:'unite',valeur:'60',libelle:'H1'});
    else if(/\b(h ?4|4 ?h|quatre heures?)\b/.test(n)) nonGeree='H4';
    else if(/\b(daily|journalier|journaliere|1 ?d)\b/.test(n)) nonGeree='journalier';
    if(nonGeree) actions.push({type:'unite',valeur:nonGeree,libelle:nonGeree});
    if(!actions.length && mot && /^(?:ouvre|ouvrir|montre|montrer|affiche|afficher|lance|lancer|va|aller|passe|passer|bascule|basculer|mets|met|mettre|donne)\b/.test(n)) return {ouvrir:true,actions:[]};
    if(!actions.length) return null;
    // un actif seul demande à être précis : « va » + mot ambigu (« or ») n'est une commande que si c'est court
    if(actif && !mot && !ouvert && n.split(' ').length>7) return null;
    return {ouvrir:!ouvert,actions};
  }

  function phraseTerminal(plan,resultats,ouvertAvant,ok){
    if(plan.fermer) return ouvertAvant ? pick(['Je ferme le terminal.','Retour à Raylé.','Terminal fermé.']) : 'Le terminal est déjà fermé.';
    if(!ok) return "Je n'arrive pas à ouvrir le terminal.";
    const dits=[];
    if(!ouvertAvant) dits.push(plan.actions.length ? "J'ouvre le terminal." : pick(['Voilà le terminal.','Terminal ouvert.']));
    plan.actions.forEach((a,i)=>{
      const r=resultats[i];
      if(r && r.ok===false){ dits.push(r.message||'Je ne peux pas faire ça.'); return; }
      if(a.type==='actif') dits.push('Je passe sur '+a.libelle+'.');
      else if(a.type==='unite') dits.push('Graphique en '+a.libelle+'.');
      else if(a.type==='panneau') dits.push((a.action==='fermer'?'Je ferme ':"J'ouvre ")+a.libelle+'.');
      else if(a.type==='actualiser') dits.push("J'actualise.");
    });
    return dits.join(' ');
  }

  /* ───── Fermeture tolérante : « ferme », « fermer le terminal », « quitte le terminal », « retour », « Raylé retour »…
     Même avec des fautes de reconnaissance (« firme le terminale »). Appelée seulement quand le terminal est ouvert. ───── */
  function distanceEdition(a,b){
    if(Math.abs(a.length-b.length)>2) return 9;
    let prec=Array.from({length:b.length+1},(_,j)=>j);
    for(let i=1;i<=a.length;i++){
      const cur=[i];
      for(let j=1;j<=b.length;j++) cur[j]=Math.min(prec[j]+1,cur[j-1]+1,prec[j-1]+(a[i-1]===b[j-1]?0:1));
      prec=cur;
    }
    return prec[b.length];
  }
  const FERM_VERBES=['ferme','fermer','fermez','fermes','fermons','quitte','quitter','quittez','retour','reviens','revenir','retourne','retourner','sors','sortir','close'];
  const FERM_SEUL=new Set(['ferme','fermer','fermez','retour','reviens','revenir','retourne','retourner','quitte','quitter','close']);   // un seul mot : pas de tolérance (« forme » ne doit pas fermer)
  const FERM_REMPLISSAGE=new Set(['le','la','les','l','ce','cet','cette','mon','ton','du','de','des','au','a','en','vers','sur','d','un','moi','svp','stp','merci','maintenant','vite','suite','s','il','te','vous','plait','ok','okay','bon','alors','donc','et','puis','accueil','principal','principale','ecran','page','arriere','precedent','trading','ici']);   // ni « ça », ni « tout », ni « fenêtre » : « ferme ça » / « ferme tout » visent les panneaux
  const flou=(m,liste)=>liste.some(v=>m===v||(m.length>=4 && distanceEdition(m,v)<=(v.length>=6?2:1)));
  function estFermetureTerminal(texte){
    const n=cmdNorm(norm(texte)).replace(/['’\-]/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
    if(!n) return false;
    const mots=n.split(' ');
    if(mots.length>8) return false;
    if(!flou(mots[0],FERM_VERBES)) return false;
    const reste=mots.slice(1).filter(m=>!FERM_REMPLISSAGE.has(m));
    if(!reste.length) return mots.length>1 || FERM_SEUL.has(mots[0]);              // « retour », « ferme », « ferme le »…
    if(mots.length===1) return FERM_SEUL.has(mots[0]);
    return reste.every(m=>/^termin/.test(m) || (m.length>=6 && distanceEdition(m,'terminal')<=2));   // « terminal », « terminale », « terminaux », « termina »
  }
  // Ferme tout de suite (même pendant qu'elle parle), sans passer par l'IA
  function fermerTerminalVoix(texte){
    addLine('user',texte);
    try{ cutAll(); }catch(e){}
    RayleBus.demander('vue:fermer');
    const r=pick(['Je ferme le terminal.','Retour à Raylé.','Terminal fermé.']);
    addLine('ray',r); speak(r);
  }

  // Appelée avant l'IA : renvoie la phrase à dire, ou null si ce n'est pas une commande du terminal
  async function commandeTerminal(texte){
    const ouvertAvant=RayleBus.demander('vue')==='terminal';
    const plan=analyserCommandeTerminal(texte,{ouvert:ouvertAvant});
    if(!plan) return null;
    if(plan.fermer){
      if(ouvertAvant) RayleBus.demander('vue:fermer');
      return phraseTerminal(plan,[],ouvertAvant,true);
    }
    let ok=true;
    if(plan.ouvrir) ok = (await RayleBus.demander('vue:ouvrir'), RayleBus.demander('vue')==='terminal');
    const resultats=[];
    if(ok) for(const a of plan.actions){
      if(a.type==='unite' && a.valeur!=='15' && a.valeur!=='60') resultats.push({ok:false,message:'Le graphique du terminal gère M15 et H1. H4 et journalier sont dans le dashboard.'});
      else resultats.push(RayleBus.demander('terminal:commande',a)||{ok:false});
    }
    return phraseTerminal(plan,resultats,ouvertAvant,ok);
  }

  // Petite Raylé du terminal : même rôle que la grande (couper la parole, réveiller, parler)
  miniReactor.addEventListener('click',()=>reactor.click());
  RayleBus.on('vue:erreur',d=>addLine('sys',d.message));
  RayleBus.on('vue:changee',d=>{ updateBridgeStatus(); addLine('sys','Vue : '+(d.vue==='terminal'?'terminal ouvert':'retour à Raylé')); });
